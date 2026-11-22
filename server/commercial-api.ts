import { Router, Request, Response, raw as expressRaw } from 'express';
import { GoogleGenAI } from '@google/genai';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const MALE_VOICES = new Set(['Charon', 'Fenrir', 'Puck', 'Orus', 'Algenib']);
const TTS_MODELS = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'] as const;
const TTS_CACHE_DIR = path.join(os.tmpdir(), 'hassal-tts-cache');

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function parseWavPcm(wavBuffer: Buffer): {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  pcm: Buffer;
} {
  if (wavBuffer.length < 44 || wavBuffer.subarray(0, 4).toString('ascii') !== 'RIFF') {
    // Fallback assuming standard Gemini 24kHz mono 16-bit PCM
    return { sampleRate: 24000, channels: 1, bitsPerSample: 16, pcm: wavBuffer };
  }
  const channels = wavBuffer.readUInt16LE(22) || 1;
  const sampleRate = wavBuffer.readUInt32LE(24) || 24000;
  const bitsPerSample = wavBuffer.readUInt16LE(34) || 16;

  // Locate 'data' chunk robustly
  let offset = 12;
  while (offset + 8 <= wavBuffer.length) {
    const chunkId = wavBuffer.subarray(offset, offset + 4).toString('ascii');
    const chunkSize = wavBuffer.readUInt32LE(offset + 4);
    if (chunkId === 'data') {
      const start = offset + 8;
      const end = Math.min(wavBuffer.length, start + chunkSize);
      return { sampleRate, channels, bitsPerSample, pcm: wavBuffer.subarray(start, end) };
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  return { sampleRate, channels, bitsPerSample, pcm: wavBuffer.subarray(44) };
}

function buildWavFromPcm(
  pcm: Buffer,
  sampleRate: number,
  channels: number,
  bitsPerSample: number
): Buffer {
  const header = Buffer.alloc(44);
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;

  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

/**
 * Splits a multi-sentence WAV at the quietest sustained inter-sentence pause (~240ms)
 * near proportional text lengths so no word is cut mid-syllable.
 */
function splitBatchWavBySilence(wavBuffer: Buffer, texts: string[]): Buffer[] {
  if (texts.length <= 1) return [wavBuffer];

  const { sampleRate, channels, bitsPerSample, pcm } = parseWavPcm(wavBuffer);
  if (bitsPerSample !== 16 || pcm.length < sampleRate * 2) {
    return texts.map(() => wavBuffer);
  }

  const bytesPerFrame = channels * 2;
  const totalFrames = Math.floor(pcm.length / bytesPerFrame);
  const charCounts = texts.map((t) => Math.max(10, t.replace(/\s+/g, '').length));
  const totalChars = charCounts.reduce((a, b) => a + b, 0);

  // Use a 240ms window so brief intra-word consonant gaps (<60ms) never beat true sentence pauses
  const windowFrames = Math.floor(sampleRate * 0.24);
  const searchRadius = Math.max(Math.floor(sampleRate * 4.8), Math.floor(totalFrames * 0.16));
  const minSegmentFrames = Math.floor(sampleRate * 1.4);

  const splits: number[] = [0];
  let cumChars = 0;

  for (let i = 0; i < texts.length - 1; i += 1) {
    cumChars += charCounts[i];
    const approxFrame = Math.floor((cumChars / totalChars) * totalFrames);
    const remainingSegments = texts.length - 1 - i;
    const minFrame = Math.max(splits[i] + minSegmentFrames, approxFrame - searchRadius);
    const maxFrame = Math.min(
      totalFrames - remainingSegments * minSegmentFrames,
      approxFrame + searchRadius
    );

    let bestFrame = Math.max(splits[i] + minSegmentFrames, Math.min(totalFrames - minSegmentFrames, approxFrame));
    if (maxFrame > minFrame + windowFrames) {
      let bestScore = Number.POSITIVE_INFINITY;
      const step = Math.max(1, Math.floor(sampleRate * 0.02));
      for (let f = minFrame; f <= maxFrame - windowFrames; f += step) {
        let sumSq = 0;
        let maxAbs = 0;
        let sampleCount = 0;
        for (let w = 0; w < windowFrames; w += 4) {
          const byteIdx = (f + w) * bytesPerFrame;
          const sample = pcm.readInt16LE(byteIdx);
          const abs = Math.abs(sample);
          if (abs > maxAbs) maxAbs = abs;
          sumSq += sample * sample;
          sampleCount += 1;
        }
        const rms = Math.sqrt(sumSq / Math.max(1, sampleCount));
        // Slight preference for proximity to approxFrame only as tie-breaker among equally silent pauses
        const distPenalty = Math.abs(f + windowFrames / 2 - approxFrame) / sampleRate;
        const score = rms + maxAbs * 0.25 + distPenalty * 18;
        if (score < bestScore) {
          bestScore = score;
          bestFrame = f + Math.floor(windowFrames / 2);
        }
      }
    }
    splits.push(bestFrame);
  }
  splits.push(totalFrames);

  const slices: Buffer[] = [];
  const leadTailPadFrames = Math.floor(sampleRate * 0.06);
  for (let i = 0; i < texts.length; i += 1) {
    const segStartFrame = Math.max(0, splits[i] - (i > 0 ? leadTailPadFrames : 0));
    const segEndFrame = Math.min(totalFrames, splits[i + 1] + (i < texts.length - 1 ? leadTailPadFrames : 0));
    const startByte = segStartFrame * bytesPerFrame;
    const endByte = segEndFrame * bytesPerFrame;
    const segmentPcm = Buffer.from(pcm.subarray(startByte, Math.max(startByte + bytesPerFrame, endByte)));

    // Gentle 16ms fade-in/out on cut edges to prevent clicks without clipping speech
    const fadeFrames = Math.min(Math.floor(sampleRate * 0.016), Math.floor(segmentPcm.length / (bytesPerFrame * 2)));
    for (let f = 0; f < fadeFrames; f += 1) {
      const factor = f / fadeFrames;
      for (let c = 0; c < channels; c += 1) {
        const inIdx = (f * channels + c) * 2;
        segmentPcm.writeInt16LE(Math.round(segmentPcm.readInt16LE(inIdx) * factor), inIdx);
        const outIdx = segmentPcm.length - ((f * channels + c + 1) * 2);
        if (outIdx >= 0 && outIdx + 2 <= segmentPcm.length) {
          segmentPcm.writeInt16LE(Math.round(segmentPcm.readInt16LE(outIdx) * factor), outIdx);
        }
      }
    }

    slices.push(buildWavFromPcm(segmentPcm, sampleRate, channels, bitsPerSample));
  }

  return slices;
}

function cacheKeyFor(voiceName: string, text: string): string {
  return crypto.createHash('sha256').update(`v2::${voiceName}::${text}`).digest('hex');
}

async function readCachedWav(voiceName: string, text: string): Promise<string | null> {
  try {
    const filePath = path.join(TTS_CACHE_DIR, `${cacheKeyFor(voiceName, text)}.wav`);
    const buf = await fs.readFile(filePath);
    if (buf.length > 44) return buf.toString('base64');
  } catch {
    // Cache miss
  }
  return null;
}

async function writeCachedWav(voiceName: string, text: string, wavBuffer: Buffer): Promise<void> {
  try {
    await fs.mkdir(TTS_CACHE_DIR, { recursive: true });
    const filePath = path.join(TTS_CACHE_DIR, `${cacheKeyFor(voiceName, text)}.wav`);
    await fs.writeFile(filePath, wavBuffer);
  } catch {
    // Non-fatal cache write error
  }
}

async function synthesizeWithFallback(
  ai: GoogleGenAI,
  text: string,
  voiceName: string,
  style: string
): Promise<{ audioBase64: string; mimeType: string; modelUsed: string }> {
  let lastMessage = 'TTS generation failed';
  let sawQuota = false;

  for (const model of TTS_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text,
                speechMetadata: { style },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      const base64Audio = part?.inlineData?.data;
      const mimeType = part?.inlineData?.mimeType || 'audio/wav';

      if (base64Audio) {
        return { audioBase64: base64Audio, mimeType, modelUsed: model };
      }
      lastMessage = 'Empty audio payload returned by TTS model';
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      lastMessage = msg;
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.toLowerCase().includes('quota')) {
        sawQuota = true;
      }
      // Continue to fallback model
    }
  }

  const err = new Error(lastMessage) as Error & { isQuota?: boolean };
  err.isQuota = sawQuota;
  throw err;
}

export function createCommercialApiRouter(): Router {
  const router = Router();

  // Single scene Arabic male VoiceOver (checks cache + falls back across Gemini TTS models)
  router.post('/voiceover', async (req: Request, res: Response) => {
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        success: false,
        error_code: 'GEMINI_API_KEY_MISSING',
        error: {
          code: 'GEMINI_API_KEY_MISSING',
          message:
            'مفتاح GEMINI_API_KEY غير مهيّأ في إعدادات الأسرار (Settings > Secrets). أضف المفتاح لتوليد التعليق الصوتي بالذكاء الاصطناعي.',
        },
      });
    }

    const body = (req.body ?? {}) as {
      sceneId?: unknown;
      text?: unknown;
      style?: unknown;
      voiceName?: unknown;
    };

    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > 2500) {
      return res.status(422).json({
        success: false,
        error_code: 'INVALID_VOICEOVER_TEXT',
        error: {
          code: 'INVALID_VOICEOVER_TEXT',
          message: 'نص التعليق الصوتي مطلوب ويجب ألا يتجاوز 2500 حرف.',
        },
      });
    }

    const requestedVoice = typeof body.voiceName === 'string' ? body.voiceName.trim() : 'Charon';
    const voiceName = MALE_VOICES.has(requestedVoice) ? requestedVoice : 'Charon';
    const style =
      typeof body.style === 'string' && body.style.trim()
        ? body.style.trim()
        : 'Deep, confident, warm Arabic male commercial voiceover actor. Premium corporate technology TV ad narration, crisp Modern Standard Arabic pronunciation, balanced pacing with natural pauses, authoritative and trustworthy.';

    const cached = await readCachedWav(voiceName, text);
    if (cached) {
      return res.status(200).json({
        success: true,
        data: {
          sceneId: body.sceneId ?? null,
          voiceName,
          mimeType: 'audio/wav',
          audioBase64: cached,
          cached: true,
        },
      });
    }

    try {
      const result = await synthesizeWithFallback(ai, text, voiceName, style);
      await writeCachedWav(voiceName, text, Buffer.from(result.audioBase64, 'base64'));
      return res.status(200).json({
        success: true,
        data: {
          sceneId: body.sceneId ?? null,
          voiceName,
          mimeType: result.mimeType,
          audioBase64: result.audioBase64,
        },
      });
    } catch (err: unknown) {
      const e = err as Error & { isQuota?: boolean };
      const message = e.isQuota
        ? 'تم الوصول إلى الحد الأقصى اليومي لطلبات Gemini TTS المجانية على هذا المفتاح (Quota Exhausted). أضف مفتاحاً مدفوعاً أو انتظر تجديد الحصة اليومية.'
        : `تعذّر توليد التعليق الصوتي عبر Gemini TTS: ${e.message}`;
      return res.status(e.isQuota ? 429 : 502).json({
        success: false,
        error_code: e.isQuota ? 'TTS_QUOTA_EXCEEDED' : 'TTS_UPSTREAM_ERROR',
        error: {
          code: e.isQuota ? 'TTS_QUOTA_EXCEEDED' : 'TTS_UPSTREAM_ERROR',
          message,
        },
      });
    }
  });

  // Batch VoiceOver: synthesizes all scenes using minimal API calls (max 5 scenes per call) + disk cache
  router.post('/voiceover-batch', async (req: Request, res: Response) => {
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        success: false,
        error_code: 'GEMINI_API_KEY_MISSING',
        error: {
          code: 'GEMINI_API_KEY_MISSING',
          message:
            'مفتاح GEMINI_API_KEY غير مهيّأ في إعدادات الأسرار (Settings > Secrets). أضف المفتاح لتوليد التعليق الصوتي بالذكاء الاصطناعي.',
        },
      });
    }

    const body = (req.body ?? {}) as {
      scenes?: Array<{ sceneId?: string; text?: string }>;
      voiceName?: unknown;
      style?: unknown;
    };

    const items = Array.isArray(body.scenes)
      ? body.scenes
          .map((s) => ({
            sceneId: typeof s?.sceneId === 'string' ? s.sceneId.trim() : '',
            text: typeof s?.text === 'string' ? s.text.trim() : '',
          }))
          .filter((s) => s.sceneId && s.text)
      : [];

    if (items.length === 0 || items.length > 20) {
      return res.status(422).json({
        success: false,
        error_code: 'INVALID_BATCH_SCENES',
        error: {
          code: 'INVALID_BATCH_SCENES',
          message: 'قائمة المشاهد غير صالحة لتوليد التعليق الصوتي.',
        },
      });
    }

    const requestedVoice = typeof body.voiceName === 'string' ? body.voiceName.trim() : 'Charon';
    const voiceName = MALE_VOICES.has(requestedVoice) ? requestedVoice : 'Charon';
    const style =
      typeof body.style === 'string' && body.style.trim()
        ? `${body.style.trim()} Pause cleanly for one full second between every separate paragraph without rushing the endings.`
        : 'Exact same deep, warm, confident Arabic male commercial narrator speaking consistently across every phrase. Finish every sentence completely and pause cleanly for one full second between paragraphs.';

    const results: Record<string, { sceneId: string; voiceName: string; mimeType: string; audioBase64: string }> = {};
    const missing: Array<{ sceneId: string; text: string }> = [];

    for (const item of items) {
      const cached = await readCachedWav(voiceName, item.text);
      if (cached) {
        results[item.sceneId] = {
          sceneId: item.sceneId,
          voiceName,
          mimeType: 'audio/wav',
          audioBase64: cached,
        };
      } else {
        missing.push(item);
      }
    }

    // Group uncached scenes into chunks of 3 (~30s each) so boundaries stay tightly aligned & quota stays minimal
    const CHUNK_SIZE = 3;
    try {
      for (let start = 0; start < missing.length; start += CHUNK_SIZE) {
        const chunk = missing.slice(start, start + CHUNK_SIZE);
        const joinedText = chunk.map((c) => c.text).join('\n\n...\n\n');
        const synth = await synthesizeWithFallback(ai, joinedText, voiceName, style);
        const fullWav = Buffer.from(synth.audioBase64, 'base64');
        const slices = splitBatchWavBySilence(
          fullWav,
          chunk.map((c) => c.text)
        );

        for (let i = 0; i < chunk.length; i += 1) {
          const sliceWav = slices[i];
          await writeCachedWav(voiceName, chunk[i].text, sliceWav);
          results[chunk[i].sceneId] = {
            sceneId: chunk[i].sceneId,
            voiceName,
            mimeType: 'audio/wav',
            audioBase64: sliceWav.toString('base64'),
          };
        }
      }

      return res.status(200).json({
        success: true,
        data: {
          voiceName,
          clips: items.map((item) => results[item.sceneId]),
        },
      });
    } catch (err: unknown) {
      const e = err as Error & { isQuota?: boolean };
      const message = e.isQuota
        ? 'تم استهلاك الحصة اليومية المجانية لخدمة Gemini TTS على هذا المفتاح. يمكنك إعادة المحاولة لاحقاً أو ترقية الحصة من إعدادات Gemini API.'
        : `تعذّر توليد التعليق الصوتي عبر Gemini TTS: ${e.message}`;
      return res.status(e.isQuota ? 429 : 502).json({
        success: false,
        error_code: e.isQuota ? 'TTS_QUOTA_EXCEEDED' : 'TTS_UPSTREAM_ERROR',
        error: {
          code: e.isQuota ? 'TTS_QUOTA_EXCEEDED' : 'TTS_UPSTREAM_ERROR',
          message,
        },
      });
    }
  });

  // Transcode browser-recorded WebM (optionally wrapped in HSLMUX01 with a deterministic WAV mix) into H.264/AAC MP4 at 30 FPS
  router.post(
    '/transcode',
    expressRaw({ type: ['video/webm', 'application/octet-stream'], limit: '500mb' }),
    async (req: Request, res: Response) => {
      const payload = req.body as Buffer;
      if (!Buffer.isBuffer(payload) || payload.length < 128) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_VIDEO_PAYLOAD',
            message: 'ملف الفيديو المرسل للتحويل غير مكتمل.',
          },
        });
      }

      const id = crypto.randomUUID();
      const tmpDir = os.tmpdir();
      const inputVideoPath = path.join(tmpDir, `hassal-ad-${id}.webm`);
      const inputAudioPath = path.join(tmpDir, `hassal-ad-${id}.wav`);
      const outputPath = path.join(tmpDir, `hassal-ad-${id}.mp4`);
      let hasSeparateAudio = false;

      try {
        const magic = payload.subarray(0, 8).toString('ascii');
        if (magic === 'HSLMUX01' && payload.length > 12) {
          const audioLen = payload.readUInt32BE(8);
          const videoStart = 12 + audioLen;
          if (audioLen > 44 && videoStart < payload.length - 64) {
            const audioBuf = payload.subarray(12, videoStart);
            const videoBuf = payload.subarray(videoStart);
            await fs.writeFile(inputAudioPath, audioBuf);
            await fs.writeFile(inputVideoPath, videoBuf);
            hasSeparateAudio = true;
          } else {
            await fs.writeFile(inputVideoPath, payload);
          }
        } else {
          await fs.writeFile(inputVideoPath, payload);
        }

        const ffmpegArgs = hasSeparateAudio
          ? [
              '-y',
              '-i',
              inputVideoPath,
              '-i',
              inputAudioPath,
              '-map',
              '0:v:0',
              '-map',
              '1:a:0',
              '-c:v',
              'libx264',
              '-pix_fmt',
              'yuv420p',
              '-preset',
              'fast',
              '-crf',
              '18',
              '-r',
              '30',
              '-c:a',
              'aac',
              '-b:a',
              '192k',
              '-ar',
              '44100',
              '-shortest',
              '-movflags',
              '+faststart',
              outputPath,
            ]
          : [
              '-y',
              '-i',
              inputVideoPath,
              '-c:v',
              'libx264',
              '-pix_fmt',
              'yuv420p',
              '-preset',
              'fast',
              '-crf',
              '18',
              '-r',
              '30',
              '-c:a',
              'aac',
              '-b:a',
              '192k',
              '-movflags',
              '+faststart',
              outputPath,
            ];

        await new Promise<void>((resolve, reject) => {
          const ff = spawn('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'ignore', 'pipe'] });

          let stderr = '';
          ff.stderr.on('data', (chunk: Buffer) => {
            if (stderr.length < 4000) stderr += chunk.toString();
          });

          ff.on('error', (err) => reject(err));
          ff.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-400)}`));
          });
        });

        const mp4 = await fs.readFile(outputPath);
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', 'attachment; filename="hassal-commercial.mp4"');
        return res.status(200).send(mp4);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Transcode failed';
        return res.status(500).json({
          success: false,
          error: {
            code: 'TRANSCODE_FAILED',
            message: `تعذّر تحويل الفيديو إلى MP4: ${message}`,
          },
        });
      } finally {
        await Promise.allSettled([
          fs.unlink(inputVideoPath),
          hasSeparateAudio ? fs.unlink(inputAudioPath) : Promise.resolve(),
          fs.unlink(outputPath),
        ]);
      }
    }
  );

  return router;
}
