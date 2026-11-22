import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Film,
  Loader2,
  Mic,
  Monitor,
  Music,
  Pause,
  Play,
  RotateCcw,
  Smartphone,
  Sparkles,
  Subtitles,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import type { Locale } from '@/core/i18n';
import { getCategories } from '@/features/catalog/api';
import type { Category } from '@/features/catalog/types';
import { getPublicWarehouses } from '@/features/inventory/api';
import type { Warehouse } from '@/features/inventory/types';
import { getOffers } from '@/features/marketplace/api';
import { normalizeOffer } from '@/features/marketplace/offer';
import type { Offer } from '@/features/marketplace/types';
import { CommercialAudioEngine } from '@/features/commercial/audioEngine';
import { renderCommercialFrame } from '@/features/commercial/canvasRenderer';
import {
  buildSrtContent,
  COMMERCIAL_SCENES,
  getResolutionDimensions,
  getSceneAtTime,
  MALE_VOICES,
  resolveCommercialTimeline,
  TARGET_FPS,
  UNIFIED_NARRATOR_STYLE,
  type AspectRatio,
  type ExportResolution,
  type MaleVoiceId,
  type VoiceOverClip,
} from '@/features/commercial/scenes';
import BrandMark from '@/shared/ui/BrandMark';

interface CommercialStudioViewProps {
  locale?: Locale;
}

function formatTimecode(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const CommercialStudioView: React.FC<CommercialStudioViewProps> = ({ locale = 'ar' }) => {
  const [aspect, setAspect] = useState<AspectRatio>('16:9');
  const [resolution, setResolution] = useState<ExportResolution>('4k');
  const [selectedVoice, setSelectedVoice] = useState<MaleVoiceId>('Charon');

  const [isPlaying, setIsPlaying] = useState(false);
  const [timeSec, setTimeSec] = useState(0);

  const [enableVoiceOver, setEnableVoiceOver] = useState(true);
  const [enableMusic, setEnableMusic] = useState(true);
  const [enableSfx, setEnableSfx] = useState(true);
  const [showSubtitles, setShowSubtitles] = useState(true);

  const [offers, setOffers] = useState<Offer[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [brandImage, setBrandImage] = useState<HTMLImageElement | null>(null);

  const [voiceClips, setVoiceClips] = useState<Map<string, VoiceOverClip>>(() => new Map());
  const [generatingVo, setGeneratingVo] = useState(false);
  const [voProgressIndex, setVoProgressIndex] = useState(0);
  const [voTotalTargets, setVoTotalTargets] = useState(COMMERCIAL_SCENES.length);
  const [voError, setVoError] = useState<string | null>(null);

  const [exportState, setExportState] = useState<
    'idle' | 'preparing-voice' | 'recording' | 'transcoding'
  >('idle');
  const [exportProgress, setExportProgress] = useState(0);
  const [exportNotice, setExportNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioEngineRef = useRef<CommercialAudioEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const playStartPerfRef = useRef<number>(0);
  const playOffsetRef = useRef<number>(0);
  const exportCancelledRef = useRef<boolean>(false);

  if (!audioEngineRef.current && typeof window !== 'undefined') {
    audioEngineRef.current = new CommercialAudioEngine();
  }

  // Load real HASSAL customer marketplace offers, categories, public warehouses, and official brand mark
  useEffect(() => {
    let active = true;
    void Promise.all([getOffers({ per_page: 6 }), getCategories(), getPublicWarehouses()]).then(
      ([offersRes, catsRes, whRes]) => {
        if (!active) return;
        if (offersRes.success && offersRes.data) {
          setOffers(offersRes.data.map(normalizeOffer));
        }
        if (catsRes.success && catsRes.data) {
          setCategories(catsRes.data);
        }
        if (whRes.success && whRes.data) {
          setWarehouses(whRes.data);
        }
      }
    );

    const img = new Image();
    img.src = '/brand/icon-512.png';
    img.onload = () => {
      if (active) setBrandImage(img);
    };

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      audioEngineRef.current?.stop();
    };
  }, []);

  const previewDims = useMemo(() => getResolutionDimensions(aspect, '1080p'), [aspect]);
  const exportDims = useMemo(() => getResolutionDimensions(aspect, resolution), [aspect, resolution]);
  const { scenes: resolvedScenes, totalDurationSec } = useMemo(
    () => resolveCommercialTimeline(voiceClips),
    [voiceClips]
  );
  const activeScene = useMemo(
    () => getSceneAtTime(timeSec, resolvedScenes),
    [timeSec, resolvedScenes]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.width !== previewDims.width || canvas.height !== previewDims.height) {
      canvas.width = previewDims.width;
      canvas.height = previewDims.height;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    renderCommercialFrame(ctx, {
      timeSec,
      aspect,
      width: previewDims.width,
      height: previewDims.height,
      offers,
      categories,
      warehouses,
      brandImage,
      showSubtitles,
      scenes: resolvedScenes,
    });
  }, [
    timeSec,
    aspect,
    previewDims.width,
    previewDims.height,
    offers,
    categories,
    warehouses,
    brandImage,
    showSubtitles,
    resolvedScenes,
  ]);

  const pausePlayback = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    audioEngineRef.current?.stop();
    setIsPlaying(false);
  }, []);

  const startPlaybackAt = useCallback(
    async (startSec: number) => {
      if (exportState !== 'idle') return;
      const clamped = startSec >= totalDurationSec - 0.05 ? 0 : Math.max(0, startSec);

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      playOffsetRef.current = clamped;
      playStartPerfRef.current = performance.now();
      setTimeSec(clamped);
      setIsPlaying(true);

      await audioEngineRef.current?.startPlayback(
        clamped,
        voiceClips,
        { enableVoiceOver, enableMusic, enableSfx },
        true,
        resolvedScenes
      );

      const tick = () => {
        const elapsed = (performance.now() - playStartPerfRef.current) / 1000;
        const nextTime = playOffsetRef.current + elapsed;
        if (nextTime >= totalDurationSec) {
          setTimeSec(totalDurationSec);
          audioEngineRef.current?.stop();
          setIsPlaying(false);
          rafRef.current = null;
          return;
        }
        setTimeSec(nextTime);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [enableMusic, enableSfx, enableVoiceOver, exportState, resolvedScenes, totalDurationSec, voiceClips]
  );

  const restartAudioOnMixChange = useCallback(
    (nextMix: { enableVoiceOver: boolean; enableMusic: boolean; enableSfx: boolean }) => {
      if (!isPlaying) return;
      void audioEngineRef.current?.startPlayback(
        timeSec,
        voiceClips,
        nextMix,
        true,
        resolvedScenes
      );
    },
    [isPlaying, resolvedScenes, timeSec, voiceClips]
  );

  const handleSeek = (nextSec: number) => {
    const clamped = Math.max(0, Math.min(totalDurationSec, nextSec));
    setTimeSec(clamped);
    if (isPlaying) {
      void startPlaybackAt(clamped);
    }
  };

  // Generate unified Arabic male studio VoiceOver via batch endpoint (5x quota savings + disk cache)
  const generateVoiceOverClips = async (options?: {
    singleSceneId?: string;
    onlyMissing?: boolean;
    onStep?: (done: number, total: number) => void;
  }): Promise<Map<string, VoiceOverClip>> => {
    const nextMap = new Map(voiceClips);
    let targets = options?.singleSceneId
      ? COMMERCIAL_SCENES.filter((s) => s.id === options.singleSceneId)
      : COMMERCIAL_SCENES;

    if (options?.onlyMissing) {
      targets = targets.filter((s) => {
        const existing = nextMap.get(s.id);
        return !existing || existing.voiceName !== selectedVoice;
      });
    }

    if (targets.length === 0) {
      return nextMap;
    }

    setGeneratingVo(true);
    setVoError(null);
    setVoTotalTargets(targets.length);
    setVoProgressIndex(1);

    try {
      if (targets.length === 1) {
        const scene = targets[0];
        options?.onStep?.(1, 1);
        const response = await fetch('/api/v1/commercial/voiceover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sceneId: scene.id,
            text: scene.voiceOverAr,
            voiceName: selectedVoice,
            style: UNIFIED_NARRATOR_STYLE,
          }),
        });

        const payload = (await response.json()) as {
          success?: boolean;
          data?: {
            sceneId: string;
            voiceName: MaleVoiceId;
            mimeType: string;
            audioBase64: string;
          };
          error?: { message?: string };
        };

        if (!response.ok || !payload.success || !payload.data?.audioBase64) {
          throw new Error(
            payload.error?.message || `تعذّر توليد التعليق الصوتي للمشهد ${scene.index}.`
          );
        }

        const audioBuffer = await audioEngineRef.current!.decodeWavBase64(payload.data.audioBase64);
        nextMap.set(scene.id, {
          sceneId: scene.id,
          voiceName: payload.data.voiceName,
          audioBase64: payload.data.audioBase64,
          mimeType: payload.data.mimeType,
          durationSec: audioBuffer.duration,
          buffer: audioBuffer,
        });
        setVoiceClips(new Map(nextMap));
        return nextMap;
      }

      // Batch synthesize all target scenes (2 Gemini TTS calls max + cache)
      const response = await fetch('/api/v1/commercial/voiceover-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes: targets.map((s) => ({ sceneId: s.id, text: s.voiceOverAr })),
          voiceName: selectedVoice,
          style: UNIFIED_NARRATOR_STYLE,
        }),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        data?: {
          voiceName: MaleVoiceId;
          clips?: Array<{
            sceneId: string;
            voiceName: MaleVoiceId;
            mimeType: string;
            audioBase64: string;
          }>;
        };
        error?: { message?: string };
      };

      if (!response.ok || !payload.success || !Array.isArray(payload.data?.clips)) {
        throw new Error(payload.error?.message || 'تعذّر توليد التعليق الصوتي للمشاهد.');
      }

      const clips = payload.data.clips;
      for (let i = 0; i < clips.length; i += 1) {
        const c = clips[i];
        if (!c?.audioBase64) continue;
        const audioBuffer = await audioEngineRef.current!.decodeWavBase64(c.audioBase64);
        nextMap.set(c.sceneId, {
          sceneId: c.sceneId,
          voiceName: c.voiceName,
          audioBase64: c.audioBase64,
          mimeType: c.mimeType,
          durationSec: audioBuffer.duration,
          buffer: audioBuffer,
        });
        setVoProgressIndex(i + 1);
        options?.onStep?.(i + 1, clips.length);
      }
      setVoiceClips(new Map(nextMap));
      return nextMap;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء توليد التعليق الصوتي.';
      setVoError(msg);
      throw new Error(msg);
    } finally {
      setGeneratingVo(false);
    }
  };

  const handleGenerateVoiceOver = async (singleSceneId?: string) => {
    if (generatingVo) return;
    try {
      await generateVoiceOverClips({ singleSceneId });
    } catch {
      // Error already surfaced via voError state
    }
  };

  // Export complete 120s (2-minute) video at 30 FPS with deterministic muxed male VoiceOver + music + SFX -> MP4
  const handleExportVideo = async () => {
    if (exportState !== 'idle' || generatingVo) return;
    if (typeof MediaRecorder === 'undefined') {
      setExportNotice({
        tone: 'warn',
        text: 'هذا المتصفح لا يدعم تسجيل الفيديو المباشر (MediaRecorder). استخدم متصفح Chrome أو Edge حديثاً.',
      });
      return;
    }

    pausePlayback();
    exportCancelledRef.current = false;
    setExportNotice(null);
    setExportProgress(0);

    // Step 1: Automatically ensure all 10 male VoiceOver clips exist whenever VoiceOver is enabled
    let activeClips = voiceClips;
    if (enableVoiceOver) {
      const hasAllClips = COMMERCIAL_SCENES.every((s) => {
        const clip = voiceClips.get(s.id);
        return clip && clip.voiceName === selectedVoice;
      });
      if (!hasAllClips) {
        setExportState('preparing-voice');
        try {
          activeClips = await generateVoiceOverClips({
            onlyMissing: true,
            onStep: (done, total) => {
              setExportProgress(Math.round((done / total) * 18));
            },
          });
        } catch (err: unknown) {
          setExportState('idle');
          setExportProgress(0);
          setExportNotice({
            tone: 'warn',
            text:
              err instanceof Error
                ? `تعذّر تجهيز صوت المعلّق قبل الحفظ: ${err.message}`
                : 'تعذّر تجهيز صوت المعلّق قبل حفظ الفيديو.',
          });
          return;
        }
      }
    }

    if (exportCancelledRef.current) {
      setExportState('idle');
      setExportProgress(0);
      setExportNotice({ tone: 'warn', text: 'تم إلغاء تصدير الفيديو.' });
      return;
    }

    const exportTimeline = resolveCommercialTimeline(activeClips);
    const exportScenes = exportTimeline.scenes;
    const exportTotalDurationSec = exportTimeline.totalDurationSec;

    setExportState('recording');
    setExportProgress(20);

    const { width, height } = exportDims;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = width;
    exportCanvas.height = height;
    const ctx = exportCanvas.getContext('2d');

    if (!ctx) {
      setExportState('idle');
      return;
    }

    renderCommercialFrame(ctx, {
      timeSec: 0,
      aspect,
      width,
      height,
      offers,
      categories,
      warehouses,
      brandImage,
      showSubtitles,
      scenes: exportScenes,
    });

    const engine = audioEngineRef.current!;
    const mixOptions = { enableVoiceOver, enableMusic, enableSfx };

    // Step 2: Render deterministic 44.1kHz stereo WAV audio mix (complete unclipped VoiceOver + Music + SFX)
    const wavPromise = engine.renderOfflineWav(activeClips, mixOptions, exportScenes);

    // Step 3: Also start real-time capture stream as fallback for WebM if ffmpeg isn't used
    const videoStream = exportCanvas.captureStream(TARGET_FPS);
    await engine.startPlayback(0, activeClips, mixOptions, false, exportScenes);

    const combinedStream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...engine.getCaptureStream().getAudioTracks(),
    ]);

    const preferredMime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(
      (m) => MediaRecorder.isTypeSupported(m)
    );

    const recorder = new MediaRecorder(combinedStream, {
      ...(preferredMime ? { mimeType: preferredMime } : {}),
      videoBitsPerSecond: resolution === '4k' ? 12_000_000 : 6_000_000,
    });

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };

    const recordedPromise = new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: preferredMime || 'video/webm' }));
      };
    });

    recorder.start(250);
    const recStartPerf = performance.now();

    await new Promise<void>((resolve) => {
      const renderLoop = () => {
        if (exportCancelledRef.current) {
          resolve();
          return;
        }
        const elapsedSec = (performance.now() - recStartPerf) / 1000;
        const clampedSec = Math.min(exportTotalDurationSec, elapsedSec);

        renderCommercialFrame(ctx, {
          timeSec: clampedSec,
          aspect,
          width,
          height,
          offers,
          categories,
          warehouses,
          brandImage,
          showSubtitles,
          scenes: exportScenes,
        });

        setTimeSec(clampedSec);
        setExportProgress(20 + Math.round((clampedSec / exportTotalDurationSec) * 68));

        if (elapsedSec >= exportTotalDurationSec) {
          resolve();
          return;
        }
        window.setTimeout(renderLoop, 1000 / TARGET_FPS);
      };
      renderLoop();
    });

    engine.stop();
    if (recorder.state !== 'inactive') {
      recorder.stop();
    }

    const [webmBlob, wavBytes] = await Promise.all([recordedPromise, wavPromise]);
    if (exportCancelledRef.current) {
      setExportState('idle');
      setExportProgress(0);
      setExportNotice({ tone: 'warn', text: 'تم إلغاء تصدير الفيديو.' });
      return;
    }

    setExportState('transcoding');
    setExportProgress(92);

    const filenameBase = `hassal-commercial-full-${aspect === '16:9' ? '16x9' : '9x16'}-${resolution}`;

    try {
      // Pack HSLMUX01: [8-byte magic][4-byte uint32BE wavLen][wavBytes][webmBytes]
      const header = new Uint8Array(12);
      const magic = 'HSLMUX01';
      for (let i = 0; i < 8; i += 1) header[i] = magic.charCodeAt(i);
      new DataView(header.buffer).setUint32(8, wavBytes.byteLength, false);

      const muxPayload = new Blob([header, wavBytes.slice().buffer, webmBlob], {
        type: 'application/octet-stream',
      });

      const res = await fetch('/api/v1/commercial/transcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: muxPayload,
      });

      if (!res.ok) {
        throw new Error('Transcode failed');
      }

      const mp4Blob = await res.blob();
      setExportProgress(100);
      downloadBlob(mp4Blob, `${filenameBase}.mp4`);
      setExportNotice({
        tone: 'ok',
        text: `تم حفظ وتنزيل الفيديو الإعلاني الكامل (${formatTimecode(exportTotalDurationSec)}) بصيغة MP4 (${exportDims.labelAr}) مع اكتمال جميع الجمل الصوتية والموسيقى بنجاح.`,
      });
    } catch {
      setExportProgress(100);
      downloadBlob(webmBlob, `${filenameBase}.webm`);
      setExportNotice({
        tone: 'warn',
        text: `تم حفظ الفيديو بصيغة WebM عالية الجودة (${exportDims.labelAr}) لعدم توفر التحويل الفوري إلى MP4.`,
      });
    } finally {
      setExportState('idle');
    }
  };

  const handleDownloadSrt = () => {
    const srt = buildSrtContent(resolvedScenes);
    const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, 'hassal-commercial-subtitles.srt');
  };

  const generatedCount = voiceClips.size;
  const totalScenes = COMMERCIAL_SCENES.length;

  return (
    <div
      className="mx-auto w-full max-w-7xl space-y-6 px-3 py-6 sm:px-6 lg:px-8"
      dir={locale === 'en' ? 'ltr' : 'rtl'}
    >
      {/* Studio Top Bar */}
      <div className="overflow-hidden rounded-2xl border border-emerald-900/20 bg-gradient-to-l from-[#0e1410] via-[#13261b] to-[#1a3324] p-5 text-white shadow-xl sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300">
              <Film className="h-3.5 w-3.5" />
              <span>
                استوديو الإعلان التعريفي الكامل لمنصة حصّال — المدة الحالية: {formatTimecode(totalDurationSec)} • 30 FPS
              </span>
            </div>
            <div className="flex items-center gap-3">
              <BrandMark size={40} className="rounded-lg bg-white/10 p-1" />
              <div>
                <h1 className="font-serif text-xl font-black tracking-tight text-white sm:text-2xl">
                  الإعلان التعريفي الشامل: حصّال | خدماتك أقرب
                </h1>
                <p className="text-xs leading-relaxed text-emerald-100/80 sm:text-sm">
                  جولة مرئية وصوتية بصوت معلّق واحد موحّد يكمل جميع الجمل بالكامل مع تمديد مدة المشاهد تلقائياً دون أي قطع في الكلام.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={exportState !== 'idle'}
              onClick={() => setAspect('16:9')}
              className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-bold transition-all ${
                aspect === '16:9'
                  ? 'border-amber-400 bg-amber-400 text-slate-950 shadow-md'
                  : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
              }`}
            >
              <Monitor className="h-4 w-4" />
              <span>16:9 — يوتيوب والشاشات</span>
            </button>

            <button
              type="button"
              disabled={exportState !== 'idle'}
              onClick={() => setAspect('9:16')}
              className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-bold transition-all ${
                aspect === '9:16'
                  ? 'border-amber-400 bg-amber-400 text-slate-950 shadow-md'
                  : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
              }`}
            >
              <Smartphone className="h-4 w-4" />
              <span>9:16 — ريلز وتيك توك وشورتس</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Theater + Control Deck */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7 xl:col-span-8">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 p-3 shadow-lg sm:p-4">
            <div className="flex items-center justify-center rounded-xl bg-black/80 p-2 sm:p-4">
              <div
                className={`relative overflow-hidden rounded-lg border border-white/10 shadow-2xl ${
                  aspect === '16:9' ? 'aspect-video w-full' : 'aspect-[9/16] max-h-[580px] w-auto'
                }`}
              >
                <canvas ref={canvasRef} className="block h-full w-full object-contain" />
              </div>
            </div>

            <div className="mt-4 space-y-3 rounded-xl border border-slate-800 bg-slate-900/90 p-3.5 text-white">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-emerald-600/20 px-2 py-0.5 font-bold text-emerald-400">
                    المشهد {activeScene.index} / {totalScenes}
                  </span>
                  <span className="font-bold text-slate-100">{activeScene.titleAr}</span>
                </div>
                <div className="font-mono text-xs text-amber-300" dir="ltr">
                  {formatTimecode(timeSec)} / {formatTimecode(totalDurationSec)}
                </div>
              </div>

              <input
                type="range"
                min={0}
                max={totalDurationSec}
                step={0.1}
                value={Math.min(timeSec, totalDurationSec)}
                disabled={exportState !== 'idle'}
                onChange={(e) => handleSeek(parseFloat(e.target.value))}
                aria-label="الخط الزمني للإعلان"
                className="h-2 w-full cursor-pointer accent-amber-400"
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={exportState !== 'idle'}
                    onClick={() => (isPlaying ? pausePlayback() : void startPlaybackAt(timeSec))}
                    className="flex cursor-pointer items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    <span>
                      {isPlaying
                        ? 'إيقاف مؤقت'
                        : timeSec > 0 && timeSec < totalDurationSec
                        ? 'متابعة التشغيل'
                        : `تشغيل الإعلان (${formatTimecode(totalDurationSec)})`}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={exportState !== 'idle'}
                    onClick={() => void startPlaybackAt(0)}
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>من البداية</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !enableVoiceOver;
                      setEnableVoiceOver(next);
                      restartAudioOnMixChange({ enableVoiceOver: next, enableMusic, enableSfx });
                    }}
                    className={`flex cursor-pointer items-center gap-1 rounded-lg border px-2.5 py-1.5 font-semibold ${
                      enableVoiceOver
                        ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                        : 'border-slate-700 bg-slate-800 text-slate-400'
                    }`}
                  >
                    {enableVoiceOver ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                    <span>التعليق الصوتي</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const next = !enableMusic;
                      setEnableMusic(next);
                      restartAudioOnMixChange({ enableVoiceOver, enableMusic: next, enableSfx });
                    }}
                    className={`flex cursor-pointer items-center gap-1 rounded-lg border px-2.5 py-1.5 font-semibold ${
                      enableMusic
                        ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                        : 'border-slate-700 bg-slate-800 text-slate-400'
                    }`}
                  >
                    <Music className="h-3.5 w-3.5" />
                    <span>الموسيقى</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const next = !enableSfx;
                      setEnableSfx(next);
                      restartAudioOnMixChange({ enableVoiceOver, enableMusic, enableSfx: next });
                    }}
                    className={`flex cursor-pointer items-center gap-1 rounded-lg border px-2.5 py-1.5 font-semibold ${
                      enableSfx
                        ? 'border-sky-500/50 bg-sky-500/15 text-sky-300'
                        : 'border-slate-700 bg-slate-800 text-slate-400'
                    }`}
                  >
                    <Zap className="h-3.5 w-3.5" />
                    <span>المؤثرات</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowSubtitles((v) => !v)}
                    className={`flex cursor-pointer items-center gap-1 rounded-lg border px-2.5 py-1.5 font-semibold ${
                      showSubtitles
                        ? 'border-white/40 bg-white/15 text-white'
                        : 'border-slate-700 bg-slate-800 text-slate-400'
                    }`}
                  >
                    <Subtitles className="h-3.5 w-3.5" />
                    <span>النص العربي</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Control Deck */}
        <div className="space-y-5 lg:col-span-5 xl:col-span-4">
          {/* 1. Unified Arabic Male Commercial VoiceOver Generator */}
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                  <Mic className="h-4 w-4 text-emerald-600" />
                  <h2>التعليق الصوتي الموحّد (دقيقتان)</h2>
                </div>
                <p className="text-xs leading-relaxed text-slate-500">
                  نفس المعلّق الصوتي الرجالي يشرح جميع واجهات المستخدم في المنصة بتناسق كامل حتى الدقيقة الثانية.
                </p>
              </div>
              <span className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-bold text-slate-700">
                {generatedCount}/{totalScenes}
              </span>
            </div>

            <div className="space-y-2">
              <label htmlFor="commercial-voice-select" className="block text-xs font-bold text-slate-700">
                اختيار المعلّق الصوتي الموحّد:
              </label>
              <select
                id="commercial-voice-select"
                value={selectedVoice}
                disabled={generatingVo || exportState !== 'idle'}
                onChange={(e) => {
                  setSelectedVoice(e.target.value as MaleVoiceId);
                  setVoiceClips(new Map());
                }}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
              >
                {MALE_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.labelAr}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500">
                {MALE_VOICES.find((v) => v.id === selectedVoice)?.toneAr}
              </p>
            </div>

            <button
              type="button"
              disabled={generatingVo || exportState !== 'idle'}
              onClick={() => void handleGenerateVoiceOver()}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generatingVo ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>
                    جارٍ توليد صوت المعلّق الموحّد ({voProgressIndex}/{voTotalTargets})...
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 text-amber-300" />
                  <span>
                    {generatedCount === totalScenes
                      ? 'إعادة توليد التعليق الصوتي للمشاهد العشرة'
                      : 'توليد التعليق الصوتي الكامل (10 مشاهد)'}
                  </span>
                </>
              )}
            </button>

            {voError && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="leading-relaxed">{voError}</p>
              </div>
            )}

            {generatedCount > 0 && !voError && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>
                  تم تجهيز {generatedCount} من {totalScenes} مقاطع بنفس صوت المعلّق ودمجها مع الموسيقى والمؤثرات.
                </span>
              </div>
            )}
          </div>

          {/* 2. Export 4K / 1080p MP4 Video & SRT Subtitles */}
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                <Download className="h-4 w-4 text-amber-600" />
                <h2>تصدير الفيديو والترجمة</h2>
              </div>
              <p className="text-xs leading-relaxed text-slate-500">
                رندر كامل لمدة الإعلان ({formatTimecode(totalDurationSec)}) بمعدل 30 إطار/ثانية مع اكتمال جميع الجمل الصوتية ودمجها بصيغة MP4.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(['4k', '1080p'] as ExportResolution[]).map((resKey) => {
                const dims = getResolutionDimensions(aspect, resKey);
                const active = resolution === resKey;
                return (
                  <button
                    key={resKey}
                    type="button"
                    disabled={exportState !== 'idle'}
                    onClick={() => setResolution(resKey)}
                    className={`cursor-pointer rounded-xl border p-3 text-right transition ${
                      active
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="text-xs font-black">{resKey === '4k' ? '4K UHD' : '1080p HD'}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-slate-500" dir="ltr">
                      {dims.width}×{dims.height}
                    </div>
                  </button>
                );
              })}
            </div>

            {exportState === 'idle' ? (
              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={generatingVo}
                  onClick={() => void handleExportVideo()}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Download className="h-4 w-4 text-amber-400" />
                  <span>
                    {enableVoiceOver
                      ? `حفظ وتنزيل الفيديو مع صوت المعلّق (${exportDims.labelAr})`
                      : `حفظ وتنزيل الفيديو (${exportDims.labelAr})`}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadSrt}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  <Subtitles className="h-4 w-4 text-emerald-600" />
                  <span>تحميل ملف الترجمة الزمنية (.SRT)</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-700" />
                    {exportState === 'preparing-voice'
                      ? `جارٍ تجهيز صوت المعلّق للمشهد (${voProgressIndex}/${voTotalTargets})...`
                      : exportState === 'recording'
                      ? 'جارٍ رندر المشاهد ودمج الصوت الكامل (30 FPS)...'
                      : 'جارٍ دمج الصوت وتحويل الفيديو إلى MP4...'}
                  </span>
                  <span>{exportProgress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-emerald-200">
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-all duration-200"
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
                {(exportState === 'preparing-voice' || exportState === 'recording') && (
                  <button
                    type="button"
                    onClick={() => {
                      exportCancelledRef.current = true;
                    }}
                    className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-rose-300 bg-white py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>إلغاء التصدير</span>
                  </button>
                )}
              </div>
            )}

            {exportNotice && (
              <div
                className={`rounded-xl border p-3 text-xs leading-relaxed ${
                  exportNotice.tone === 'ok'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border-amber-200 bg-amber-50 text-amber-900'
                }`}
              >
                {exportNotice.text}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 10-Scene Dynamic-Length Storyboard */}
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-black text-slate-900">
            السيناريو الإعلاني الكامل — شرح جميع واجهات المستخدم (10 مشاهد • {formatTimecode(totalDurationSec)})
          </h2>
          <span className="text-xs text-slate-500">يمتد وقت كل مشهد تلقائياً لإكمال جملة المعلّق دون قص</span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {resolvedScenes.map((scene) => {
            const isActive = activeScene.id === scene.id;
            const clip = voiceClips.get(scene.id);
            const hasClip = Boolean(clip);
            return (
              <div
                key={scene.id}
                onClick={() => handleSeek(scene.startSec)}
                className={`flex cursor-pointer flex-col justify-between gap-3 rounded-xl border p-4 transition-all ${
                  isActive
                    ? 'border-emerald-600 bg-emerald-50/70 shadow-sm'
                    : 'border-slate-200 bg-slate-50/50 hover:border-emerald-300 hover:bg-white'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-emerald-800">
                      {scene.index}. {scene.titleAr}
                    </span>
                    <span
                      className="rounded bg-slate-200/80 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700"
                      dir="ltr"
                    >
                      {scene.startSec.toFixed(1)}s–{scene.endSec.toFixed(1)}s
                    </span>
                  </div>
                  <p className="text-[11px] font-semibold text-amber-700">{scene.subtitleTagAr}</p>
                  <p className="text-xs leading-relaxed text-slate-800">«{scene.voiceOverAr}»</p>
                </div>

                <div className="flex items-center justify-between border-t border-slate-200/70 pt-2.5 text-[11px]">
                  <span className="text-slate-500">
                    {hasClip
                      ? `✓ صوت كامل (${clip!.durationSec.toFixed(1)}ث)`
                      : 'بانتظار توليد التعليق'}
                  </span>
                  <button
                    type="button"
                    disabled={generatingVo || exportState !== 'idle'}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleGenerateVoiceOver(scene.id);
                    }}
                    className="cursor-pointer font-bold text-emerald-700 hover:text-emerald-900 disabled:opacity-50"
                  >
                    {hasClip ? 'إعادة التوليد' : 'توليد الصوت'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
