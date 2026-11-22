import {
  COMMERCIAL_SCENES,
  mapCanonicalToResolvedTime,
  TOTAL_DURATION_SEC,
  type CommercialScene,
  type VoiceOverClip,
} from '@/features/commercial/scenes';

export interface AudioMixOptions {
  enableVoiceOver: boolean;
  enableMusic: boolean;
  enableSfx: boolean;
}

const TOUCH_TIMES_SEC = [
  18.5, 27.2, 31.8, 35.4, 43.2, 48.6, 57.5, 62.0, 71.8, 76.5, 84.0, 91.8, 99.6, 105.8,
];
const TRANSITION_TIMES_SEC = [6.0, 14.0, 25.0, 40.0, 54.0, 68.0, 82.0, 97.0, 111.0];

export function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = window.atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function normalizeAudioBufferInPlace(buffer: AudioBuffer, targetPeak = 0.9): AudioBuffer {
  let maxAmp = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i += 1) {
      const abs = Math.abs(data[i]);
      if (abs > maxAmp) maxAmp = abs;
    }
  }
  if (maxAmp > 0.005 && maxAmp < targetPeak) {
    const gain = Math.min(4.0, targetPeak / maxAmp);
    for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i += 1) {
        data[i] = Math.max(-0.98, Math.min(0.98, data[i] * gain));
      }
    }
  }
  return buffer;
}

function encodeAudioBufferToWav(audioBuffer: AudioBuffer): Uint8Array {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const wavBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wavBuffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) {
      view.setUint8(offset + i, s.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch += 1) {
    channels.push(audioBuffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < length; i += 1) {
    for (let ch = 0; ch < numChannels; ch += 1) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Uint8Array(wavBuffer);
}

/**
 * Web Audio API synthesizer & mixer for the HASSAL 120s (2-minute) commercial:
 * - Renders live preview AND deterministic OfflineAudioContext stereo WAV for MP4 muxing
 * - Peak-normalizes Gemini TTS male narration and automatically ducks music during speech
 */
export class CommercialAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private speakerGain: GainNode | null = null;
  private captureDest: MediaStreamAudioDestinationNode | null = null;
  private activeNodes: AudioNode[] = [];

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.95;

      // Dedicated speaker gain keeps a live sink connected (0 when muted during capture)
      this.speakerGain = this.ctx.createGain();
      this.speakerGain.gain.value = 1;
      this.masterGain.connect(this.speakerGain);
      this.speakerGain.connect(this.ctx.destination);

      this.captureDest = this.ctx.createMediaStreamDestination();
      this.masterGain.connect(this.captureDest);
    }
    return this.ctx;
  }

  public async decodeWavBase64(base64: string): Promise<AudioBuffer> {
    const ctx = this.ensureContext();
    const buf = decodeBase64ToArrayBuffer(base64);
    const decoded = await ctx.decodeAudioData(buf.slice(0));
    return normalizeAudioBufferInPlace(decoded, 0.9);
  }

  public getCaptureStream(): MediaStream {
    this.ensureContext();
    if (!this.captureDest) {
      throw new Error('Audio capture destination unavailable');
    }
    return this.captureDest.stream;
  }

  public stop(): void {
    for (const node of this.activeNodes) {
      try {
        if ('stop' in node && typeof (node as AudioScheduledSourceNode).stop === 'function') {
          (node as AudioScheduledSourceNode).stop();
        }
      } catch {
        // Ignore already-stopped nodes
      }
      try {
        node.disconnect();
      } catch {
        // Ignore disconnect errors
      }
    }
    this.activeNodes = [];
  }

  public async startPlayback(
    offsetSec: number,
    clips: Map<string, VoiceOverClip>,
    options: AudioMixOptions,
    monitorToSpeakers = true,
    scenes: CommercialScene[] = COMMERCIAL_SCENES
  ): Promise<void> {
    this.stop();
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    if (!this.masterGain || !this.speakerGain) return;

    const totalDurationSec = scenes[scenes.length - 1]?.endSec ?? TOTAL_DURATION_SEC;
    this.speakerGain.gain.setValueAtTime(monitorToSpeakers ? 1 : 0, ctx.currentTime);
    const baseTime = ctx.currentTime + 0.04;
    const clampedOffset = Math.max(0, Math.min(totalDurationSec - 0.1, offsetSec));

    const nodes = this.scheduleMixOnContext(
      ctx,
      this.masterGain,
      baseTime,
      clampedOffset,
      clips,
      options,
      scenes,
      totalDurationSec
    );
    this.activeNodes.push(...nodes);
  }

  /**
   * Deterministically renders the complete stereo audio mix (VoiceOver + Music + SFX)
   * into a lossless 16-bit PCM WAV byte array across the full dynamically resolved timeline.
   */
  public async renderOfflineWav(
    clips: Map<string, VoiceOverClip>,
    options: AudioMixOptions,
    scenes: CommercialScene[] = COMMERCIAL_SCENES
  ): Promise<Uint8Array> {
    const totalDurationSec = scenes[scenes.length - 1]?.endSec ?? TOTAL_DURATION_SEC;
    const sampleRate = 44100;
    const totalSamples = Math.ceil(sampleRate * totalDurationSec);
    const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);
    const masterGain = offlineCtx.createGain();
    masterGain.gain.value = 0.95;
    masterGain.connect(offlineCtx.destination);

    this.scheduleMixOnContext(
      offlineCtx,
      masterGain,
      0,
      0,
      clips,
      options,
      scenes,
      totalDurationSec
    );
    const renderedBuffer = await offlineCtx.startRendering();
    return encodeAudioBufferToWav(renderedBuffer);
  }

  private scheduleMixOnContext(
    ctx: BaseAudioContext,
    destination: AudioNode,
    baseTime: number,
    offsetSec: number,
    clips: Map<string, VoiceOverClip>,
    options: AudioMixOptions,
    scenes: CommercialScene[],
    totalDurationSec: number
  ): AudioNode[] {
    const created: AudioNode[] = [];

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 18;
    compressor.ratio.value = 3.5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.22;

    const musicBus = ctx.createGain();
    const sfxBus = ctx.createGain();
    const voiceBus = ctx.createGain();

    musicBus.connect(compressor);
    sfxBus.connect(compressor);
    voiceBus.connect(compressor);
    compressor.connect(destination);
    created.push(compressor, musicBus, sfxBus, voiceBus);

    musicBus.gain.setValueAtTime(options.enableMusic ? 0.42 : 0, baseTime);
    sfxBus.gain.setValueAtTime(options.enableSfx ? 0.58 : 0, baseTime);
    voiceBus.gain.setValueAtTime(options.enableVoiceOver ? 1.35 : 0, baseTime);

    // 1. Complete VoiceOver (NO clipping/truncation) + automatic music ducking across all 10 scenes
    if (options.enableVoiceOver) {
      for (const scene of scenes) {
        const clip = clips.get(scene.id);
        if (!clip) continue;

        const clipTimelineStart = scene.startSec + scene.voOffsetSec;
        const clipDuration = clip.durationSec;
        const clipTimelineEnd = clipTimelineStart + clipDuration;

        if (clipTimelineEnd <= offsetSec) continue;

        const src = ctx.createBufferSource();
        src.buffer = clip.buffer;
        const gain = ctx.createGain();
        gain.gain.value = 1.12;
        src.connect(gain);
        gain.connect(voiceBus);

        if (offsetSec > clipTimelineStart) {
          const skipSec = offsetSec - clipTimelineStart;
          const remaining = Math.max(0.05, clipDuration - skipSec);
          src.start(baseTime, skipSec, remaining);
        } else {
          const delay = clipTimelineStart - offsetSec;
          src.start(baseTime + delay, 0, clipDuration);
        }
        created.push(src);

        if (options.enableMusic) {
          const duckStart = Math.max(0, clipTimelineStart - offsetSec - 0.12);
          const duckEnd = Math.max(duckStart + 0.1, clipTimelineEnd - offsetSec + 0.22);
          musicBus.gain.setTargetAtTime(0.11, baseTime + duckStart, 0.12);
          musicBus.gain.setTargetAtTime(0.42, baseTime + duckEnd, 0.24);
        }
      }
    }

    // 2. Music bed dynamically matched to resolved scene boundaries
    if (options.enableMusic) {
      this.scheduleCorporateTechMusic(ctx, musicBus, baseTime, offsetSec, scenes, totalDurationSec, created);
    }

    // 3. SFX timeline mapped to resolved scene timestamps
    if (options.enableSfx) {
      this.scheduleSfxTimeline(ctx, sfxBus, baseTime, offsetSec, scenes, created);
    }

    return created;
  }

  private scheduleCorporateTechMusic(
    ctx: BaseAudioContext,
    musicBus: GainNode,
    baseTime: number,
    offsetSec: number,
    scenes: CommercialScene[],
    totalDurationSec: number,
    created: AudioNode[]
  ): void {
    const chordSpecs: Array<{ bass: number; notes: number[]; pulseHz: number; canonicalStart: number }> = [
      { bass: 73.42, notes: [146.83, 220.0, 261.63], pulseHz: 0, canonicalStart: 0 },
      { bass: 65.41, notes: [130.81, 196.0, 233.08], pulseHz: 1, canonicalStart: 6 },
      { bass: 87.31, notes: [174.61, 220.0, 261.63, 329.63], pulseHz: 2, canonicalStart: 14 },
      { bass: 73.42, notes: [146.83, 220.0, 293.66, 349.23], pulseHz: 4, canonicalStart: 25 },
      { bass: 82.41, notes: [164.81, 246.94, 329.63, 392.0], pulseHz: 3, canonicalStart: 40 },
      { bass: 98.0, notes: [196.0, 246.94, 293.66, 392.0], pulseHz: 4, canonicalStart: 54 },
      { bass: 87.31, notes: [174.61, 220.0, 293.66, 349.23], pulseHz: 4, canonicalStart: 68 },
      { bass: 73.42, notes: [146.83, 220.0, 293.66, 440.0], pulseHz: 4, canonicalStart: 82 },
      { bass: 98.0, notes: [196.0, 261.63, 329.63, 392.0], pulseHz: 3, canonicalStart: 97 },
      { bass: 73.42, notes: [146.83, 220.0, 293.66, 440.0], pulseHz: 1, canonicalStart: 111 },
    ];

    const chords = chordSpecs.map((spec, i) => ({
      start: scenes[i]?.startSec ?? spec.canonicalStart,
      end: scenes[i]?.endSec ?? totalDurationSec,
      bass: spec.bass,
      notes: spec.notes,
      pulseHz: spec.pulseHz,
      canonicalStart: spec.canonicalStart,
    }));

    for (const seg of chords) {
      if (seg.end <= offsetSec) continue;

      const segStart = Math.max(0, seg.start - offsetSec);
      const segDuration = Math.min(seg.end, totalDurationSec) - Math.max(seg.start, offsetSec);
      if (segDuration <= 0.1) continue;

      const t0 = baseTime + segStart;
      const t1 = t0 + segDuration;

      const bassOsc = ctx.createOscillator();
      bassOsc.type = 'triangle';
      bassOsc.frequency.setValueAtTime(seg.bass, t0);
      const bassFilter = ctx.createBiquadFilter();
      bassFilter.type = 'lowpass';
      bassFilter.frequency.setValueAtTime(190, t0);
      const bassGain = ctx.createGain();
      bassGain.gain.setValueAtTime(0.0001, t0);
      bassGain.gain.exponentialRampToValueAtTime(0.22, Math.min(t1, t0 + 0.6));
      bassGain.gain.exponentialRampToValueAtTime(0.001, t1);

      bassOsc.connect(bassFilter);
      bassFilter.connect(bassGain);
      bassGain.connect(musicBus);
      bassOsc.start(t0);
      bassOsc.stop(t1 + 0.05);
      created.push(bassOsc);

      const padFilter = ctx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.setValueAtTime(seg.canonicalStart >= 14 ? 950 : 520, t0);
      padFilter.frequency.linearRampToValueAtTime(seg.canonicalStart >= 25 ? 1550 : 880, t1);

      const padGain = ctx.createGain();
      padGain.gain.setValueAtTime(0.0001, t0);
      padGain.gain.exponentialRampToValueAtTime(0.095, Math.min(t1, t0 + 0.8));
      padGain.gain.setValueAtTime(0.095, Math.max(t0, t1 - 0.5));
      padGain.gain.exponentialRampToValueAtTime(0.0001, t1);

      padFilter.connect(padGain);
      padGain.connect(musicBus);

      for (const freq of seg.notes) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t0);
        osc.detune.setValueAtTime((freq % 7) - 3, t0);
        const noteScale = ctx.createGain();
        noteScale.gain.value = 0.24;
        osc.connect(noteScale);
        noteScale.connect(padFilter);
        osc.start(t0);
        osc.stop(t1 + 0.05);
        created.push(osc);
      }

      if (seg.pulseHz > 0) {
        const stepSec = 1 / seg.pulseHz;
        const firstBeat = Math.max(seg.start, Math.ceil(offsetSec / stepSec) * stepSec);
        let beatIndex = 0;
        for (let bt = firstBeat; bt < seg.end - 0.05; bt += stepSec) {
          const btAt = baseTime + (bt - offsetSec);
          const note = seg.notes[beatIndex % seg.notes.length] * 2;
          beatIndex += 1;

          const pluck = ctx.createOscillator();
          pluck.type = 'sine';
          pluck.frequency.setValueAtTime(note, btAt);
          const pluckGain = ctx.createGain();
          pluckGain.gain.setValueAtTime(0.0001, btAt);
          pluckGain.gain.exponentialRampToValueAtTime(
            seg.canonicalStart >= 25 && seg.canonicalStart < 111 ? 0.055 : 0.028,
            btAt + 0.015
          );
          pluckGain.gain.exponentialRampToValueAtTime(0.0001, btAt + Math.min(0.24, stepSec * 0.9));
          pluck.connect(pluckGain);
          pluckGain.connect(musicBus);
          pluck.start(btAt);
          pluck.stop(btAt + 0.28);
          created.push(pluck);

          if (seg.canonicalStart >= 14 && seg.canonicalStart < 111 && beatIndex % 2 === 1) {
            const kick = ctx.createOscillator();
            kick.type = 'sine';
            kick.frequency.setValueAtTime(115, btAt);
            kick.frequency.exponentialRampToValueAtTime(42, btAt + 0.11);
            const kickGain = ctx.createGain();
            kickGain.gain.setValueAtTime(0.11, btAt);
            kickGain.gain.exponentialRampToValueAtTime(0.0001, btAt + 0.14);
            kick.connect(kickGain);
            kickGain.connect(musicBus);
            kick.start(btAt);
            kick.stop(btAt + 0.16);
            created.push(kick);
          }
        }
      }
    }
  }

  private scheduleSfxTimeline(
    ctx: BaseAudioContext,
    sfxBus: GainNode,
    baseTime: number,
    offsetSec: number,
    scenes: CommercialScene[],
    created: AudioNode[]
  ): void {
    for (const cBoom of [1.2, 111.9]) {
      const boomAt = mapCanonicalToResolvedTime(cBoom, scenes);
      if (boomAt >= offsetSec) {
        this.triggerCinematicBoom(ctx, sfxBus, baseTime + (boomAt - offsetSec), created);
      }
    }

    for (const cTr of TRANSITION_TIMES_SEC) {
      const trAt = mapCanonicalToResolvedTime(cTr, scenes);
      if (trAt >= offsetSec) {
        this.triggerDigitalWhoosh(ctx, sfxBus, baseTime + (trAt - offsetSec), created);
      }
    }

    for (const cTap of TOUCH_TIMES_SEC) {
      const tapAt = mapCanonicalToResolvedTime(cTap, scenes);
      if (tapAt >= offsetSec) {
        this.triggerTouchClick(ctx, sfxBus, baseTime + (tapAt - offsetSec), created);
      }
    }

    for (const cChime of [92.2, 106.4]) {
      const chimeAt = mapCanonicalToResolvedTime(cChime, scenes);
      if (chimeAt >= offsetSec) {
        this.triggerConfirmationChime(ctx, sfxBus, baseTime + (chimeAt - offsetSec), created);
      }
    }
  }

  private triggerCinematicBoom(
    ctx: BaseAudioContext,
    sfxBus: GainNode,
    at: number,
    created: AudioNode[]
  ): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, at);
    osc.frequency.exponentialRampToValueAtTime(34, at + 0.9);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, at);
    gain.gain.linearRampToValueAtTime(0.5, at + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.5);
    osc.connect(gain);
    gain.connect(sfxBus);
    osc.start(at);
    osc.stop(at + 1.55);
    created.push(osc);
  }

  private triggerDigitalWhoosh(
    ctx: BaseAudioContext,
    sfxBus: GainNode,
    at: number,
    created: AudioNode[]
  ): void {
    const len = Math.floor(ctx.sampleRate * 0.42);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2.2;
    filter.frequency.setValueAtTime(320, at);
    filter.frequency.exponentialRampToValueAtTime(1600, at + 0.22);
    filter.frequency.exponentialRampToValueAtTime(480, at + 0.4);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, at);
    gain.gain.linearRampToValueAtTime(0.16, at + 0.14);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(sfxBus);
    noise.start(at);
    created.push(noise);
  }

  private triggerTouchClick(
    ctx: BaseAudioContext,
    sfxBus: GainNode,
    at: number,
    created: AudioNode[]
  ): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1250, at);
    osc.frequency.exponentialRampToValueAtTime(640, at + 0.045);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.055);

    osc.connect(gain);
    gain.connect(sfxBus);
    osc.start(at);
    osc.stop(at + 0.06);
    created.push(osc);
  }

  private triggerConfirmationChime(
    ctx: BaseAudioContext,
    sfxBus: GainNode,
    at: number,
    created: AudioNode[]
  ): void {
    const freqs = [587.33, 880.0, 1174.66];
    freqs.forEach((f, idx) => {
      const start = at + idx * 0.085;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, start);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.15, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.65);
      osc.connect(gain);
      gain.connect(sfxBus);
      osc.start(start);
      osc.stop(start + 0.7);
      created.push(osc);
    });
  }
}
