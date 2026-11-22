export type AspectRatio = '16:9' | '9:16';
export type ExportResolution = '4k' | '1080p';
export type MaleVoiceId = 'Charon' | 'Fenrir' | 'Puck';

export interface SubtitleCue {
  startSec: number;
  endSec: number;
  text: string;
}

export interface CommercialScene {
  id: string;
  index: number;
  titleAr: string;
  subtitleTagAr: string;
  startSec: number;
  endSec: number;
  voOffsetSec: number;
  voiceOverAr: string;
  cameraNoteAr: string;
  cues: SubtitleCue[];
}

export interface VoiceOverClip {
  sceneId: string;
  voiceName: MaleVoiceId;
  audioBase64: string;
  mimeType: string;
  durationSec: number;
  buffer: AudioBuffer;
}

export const TOTAL_DURATION_SEC = 120;
export const TARGET_FPS = 30;

export const UNIFIED_NARRATOR_STYLE =
  'Exact same deep, warm, confident Arabic male commercial narrator speaking consistently throughout a unified 2-minute corporate technology walkthrough. Natural Modern Standard Arabic pronunciation, steady authoritative pacing, cohesive tone and pitch across every segment.';

export const MALE_VOICES: Array<{
  id: MaleVoiceId;
  labelAr: string;
  toneAr: string;
}> = [
  {
    id: 'Charon',
    labelAr: 'شارون — صوت إعلاني عميق وواثق',
    toneAr: 'نبرة رخيمة وفخمة للإعلانات التقنية الرئيسية',
  },
  {
    id: 'Fenrir',
    labelAr: 'فنرير — صوت رجالي جهوري ومؤثر',
    toneAr: 'إلقاء قوي ومقنع مع حضور تلفزيوني واضح',
  },
  {
    id: 'Puck',
    labelAr: 'باك — صوت رجالي حيوي وواضح',
    toneAr: 'مخارج واضحة وإيقاع عصري سلس ومقنع',
  },
];

export const COMMERCIAL_SCENES: CommercialScene[] = [
  {
    id: 'scene-1',
    index: 1,
    titleAr: 'البداية السينمائية',
    subtitleTagAr: '0–6 ثوانٍ • كشف الشعار والإضاءة',
    startSec: 0,
    endSec: 6,
    voOffsetSec: 0.45,
    voiceOverAr: 'في عالم تتسارع فيه الحياة... أصبحت سهولة الوصول إلى الخدمة ضرورة.',
    cameraNoteAr: 'شاشة داكنة مع شعاع ضوئي متحرك وتجسيد تدريجي لشعار حصّال',
    cues: [
      {
        startSec: 0.4,
        endSec: 5.7,
        text: 'في عالم تتسارع فيه الحياة... أصبحت سهولة الوصول إلى الخدمة ضرورة.',
      },
    ],
  },
  {
    id: 'scene-2',
    index: 2,
    titleAr: 'المشكلة والحاجة',
    subtitleTagAr: '6–14 ثانية • التحدي اليومي',
    startSec: 6,
    endSec: 14,
    voOffsetSec: 0.45,
    voiceOverAr:
      'كم مرة احتجت إلى عروض مخزون موثوقة أو خدمة تجارية واضحة... وتمنيت أن تجد طريقًا أسهل وأسرع للوصول إليها؟',
    cameraNoteAr: 'انتقال بصري بين التشتت والطرق التقليدية ثم استقرار الإطار',
    cues: [
      {
        startSec: 6.4,
        endSec: 10.2,
        text: 'كم مرة احتجت إلى عروض مخزون موثوقة أو خدمة تجارية واضحة...',
      },
      {
        startSec: 10.2,
        endSec: 13.7,
        text: 'وتمنيت أن تجد طريقًا أسهل وأسرع للوصول إليها؟',
      },
    ],
  },
  {
    id: 'scene-3',
    index: 3,
    titleAr: 'تقديم حصّال والواجهة الرئيسية',
    subtitleTagAr: '14–25 ثانية • فتح التطبيق وحساب العميل',
    startSec: 14,
    endSec: 25,
    voOffsetSec: 0.5,
    voiceOverAr:
      'الآن، مع حصّال... أصبحت الخدمات أقرب إليك، في تجربة رقمية متكاملة تجمع لك العروض، والمستودعات، وطلباتك في مكان واحد.',
    cameraNoteAr: 'ظهور الهاتف الذكي وفتح السوق الرئيسي الفعلي للعميل مع بطاقة المنشأة والتوثيق',
    cues: [
      {
        startSec: 14.5,
        endSec: 19.6,
        text: 'الآن، مع حصّال... أصبحت الخدمات أقرب إليك،',
      },
      {
        startSec: 19.6,
        endSec: 24.6,
        text: 'في تجربة رقمية متكاملة تجمع لك العروض، والمستودعات، وطلباتك في مكان واحد.',
      },
    ],
  },
  {
    id: 'scene-4',
    index: 4,
    titleAr: 'التصفح الذكي والبحث الجغرافي',
    subtitleTagAr: '25–40 ثانية • التصنيفات والفلترة والبحث بالأقرب',
    startSec: 25,
    endSec: 40,
    voOffsetSec: 0.5,
    voiceOverAr:
      'ابدأ بتصفّح السوق بوضوح: ابحث باسم الصنف أو البائع، اختر التصنيف المناسب، أو فعّل البحث بالأقرب جغرافيًا لتصل إلى العروض الأقرب لموقعك خلال ثوانٍ.',
    cameraNoteAr: 'تفاعل اللمس مع شريط البحث وأزرار التصنيفات وتفعيل لوحة البحث بالأقرب (كم)',
    cues: [
      {
        startSec: 25.5,
        endSec: 32.4,
        text: 'ابدأ بتصفّح السوق بوضوح: ابحث باسم الصنف أو البائع، واختر التصنيف المناسب،',
      },
      {
        startSec: 32.4,
        endSec: 39.5,
        text: 'أو فعّل البحث بالأقرب جغرافيًا لتصل إلى العروض الأقرب لموقعك خلال ثوانٍ.',
      },
    ],
  },
  {
    id: 'scene-5',
    index: 5,
    titleAr: 'تفاصيل العرض والأسئلة المباشرة',
    subtitleTagAr: '40–54 ثانية • بطاقة العرض والاهتمام والاستفسار',
    startSec: 40,
    endSec: 54,
    voOffsetSec: 0.5,
    voiceOverAr:
      'داخل كل عرض، ترى تفاصيل الكمية المتاحة، والحد الأدنى للطلب، وموقع المستودع، مع إمكانية تسجيل الاهتمام أو طرح استفسارك مباشرةً ليصلك رد البائع بوضوح.',
    cameraNoteAr: 'تكبير بطاقة العرض الفعلية وإبراز المخزون المتاح وسعر الوحدة وفتح سلسلة الأسئلة',
    cues: [
      {
        startSec: 40.5,
        endSec: 47.0,
        text: 'داخل كل عرض، ترى تفاصيل الكمية المتاحة، والحد الأدنى للطلب، وموقع المستودع،',
      },
      {
        startSec: 47.0,
        endSec: 53.5,
        text: 'مع إمكانية تسجيل الاهتمام أو طرح استفسارك مباشرةً ليصلك رد البائع بوضوح.',
      },
    ],
  },
  {
    id: 'scene-6',
    index: 6,
    titleAr: 'خريطة المستودعات واللوجستيات',
    subtitleTagAr: '54–68 ثانية • استعراض مواقع التوزيع على الخريطة',
    startSec: 54,
    endSec: 68,
    voOffsetSec: 0.5,
    voiceOverAr:
      'ومن خريطة المستودعات واللوجستيات، تتعرّف على مواقع المستودعات ومراكز التوزيع المسجّلة بدقة، لتخطط للاستلام أو التوصيل بما يناسب عملك.',
    cameraNoteAr: 'الانتقال إلى واجهة خريطة المستودعات وتحديد موقع المستودع وإحداثياته',
    cues: [
      {
        startSec: 54.5,
        endSec: 61.2,
        text: 'ومن خريطة المستودعات واللوجستيات، تتعرّف على مواقع المستودعات ومراكز التوزيع المسجّلة بدقة،',
      },
      {
        startSec: 61.2,
        endSec: 67.5,
        text: 'لتخطط للاستلام أو التوصيل بما يناسب عملك.',
      },
    ],
  },
  {
    id: 'scene-7',
    index: 7,
    titleAr: 'لوحة طلبات الاحتياج وعروض الأسعار',
    subtitleTagAr: '68–82 ثانية • نشر الاحتياج والمطابقة الذكية',
    startSec: 68,
    endSec: 82,
    voOffsetSec: 0.5,
    voiceOverAr:
      'وإذا لم تجد ما تبحث عنه جاهزًا، تتيح لك لوحة طلبات الاحتياج نشر احتياجك بسهولة، لتصلك ترشيحات المطابقة وعروض الأسعار من الموردين مباشرة.',
    cameraNoteAr: 'عرض واجهة طلبات الاحتياج (RFQ) واستعراض المطابقات المرشّحة وعروض الأسعار',
    cues: [
      {
        startSec: 68.5,
        endSec: 75.2,
        text: 'وإذا لم تجد ما تبحث عنه جاهزًا، تتيح لك لوحة طلبات الاحتياج نشر احتياجك بسهولة،',
      },
      {
        startSec: 75.2,
        endSec: 81.5,
        text: 'لتصلك ترشيحات المطابقة وعروض الأسعار من الموردين مباشرة.',
      },
    ],
  },
  {
    id: 'scene-8',
    index: 8,
    titleAr: 'تقديم طلب الشراء من المتاح',
    subtitleTagAr: '82–97 ثانية • نموذج الطلب وتحديد الكمية والتسليم',
    startSec: 82,
    endSec: 97,
    voOffsetSec: 0.5,
    voiceOverAr:
      'وعند جاهزيتك للطلب، اضغط طلب شراء من المتاح، وحدّد الكمية المطلوبة وآلية التسليم، ليصل طلبك إلى البائع للمراجعة دون حجزٍ مسبق حتى القبول.',
    cameraNoteAr: 'فتح نموذج طلب شراء على مخزون العرض وتعديل الكمية وتأكيد آلية التسليم والإرسال',
    cues: [
      {
        startSec: 82.5,
        endSec: 89.6,
        text: 'وعند جاهزيتك للطلب، اضغط طلب شراء من المتاح، وحدّد الكمية المطلوبة وآلية التسليم،',
      },
      {
        startSec: 89.6,
        endSec: 96.5,
        text: 'ليصل طلبك إلى البائع للمراجعة دون حجزٍ مسبق حتى القبول.',
      },
    ],
  },
  {
    id: 'scene-9',
    index: 9,
    titleAr: 'متابعة الصفقات وكود التسليم',
    subtitleTagAr: '97–111 ثانية • تتبع الحالة والحجز وتأكيد الاستلام',
    startSec: 97,
    endSec: 111,
    voOffsetSec: 0.5,
    voiceOverAr:
      'بعدها، تتابع رحلة طلبك خطوةً بخطوة: من مراجعة البائع وحجز الكمية، إلى التجهيز، وحتى تأكيد الاستلام عبر كود التسليم الموثّق عند البوابة لإغلاق الصفقة بأمان.',
    cameraNoteAr: 'شاشة الصفقات وطلبات الشراء ومسح كود التسليم وإتمام الصفقة بنجاح',
    cues: [
      {
        startSec: 97.5,
        endSec: 104.2,
        text: 'بعدها، تتابع رحلة طلبك خطوةً بخطوة: من مراجعة البائع وحجز الكمية إلى التجهيز،',
      },
      {
        startSec: 104.2,
        endSec: 110.5,
        text: 'وحتى تأكيد الاستلام عبر كود التسليم الموثّق عند البوابة لإغلاق الصفقة بأمان.',
      },
    ],
  },
  {
    id: 'scene-10',
    index: 10,
    titleAr: 'الخاتمة الإعلانية',
    subtitleTagAr: '111–120 ثانية • الشعار والرسالة الختامية',
    startSec: 111,
    endSec: 120,
    voOffsetSec: 0.5,
    voiceOverAr:
      'تجربةٌ واضحة، ومتابعةٌ متكاملة في كل مرحلة... حصّال HASSAL، طريقك الأسهل إلى الخدمة.',
    cameraNoteAr: 'عودة سينمائية للشعار بجانب الهاتف الذكي وعبارة: حصّال | خدماتك أقرب',
    cues: [
      {
        startSec: 111.5,
        endSec: 116.2,
        text: 'تجربةٌ واضحة، ومتابعةٌ متكاملة في كل مرحلة... حصّال HASSAL، طريقك الأسهل إلى الخدمة.',
      },
      {
        startSec: 116.2,
        endSec: 119.7,
        text: 'حصّال | خدماتك أقرب',
      },
    ],
  },
];

export const VO_TAIL_PADDING_SEC = 0.75;

/**
 * Dynamically expands every scene's duration so the narrator always finishes
 * the complete sentence cleanly (plus breathing padding) without any cutoff,
 * even when total video duration grows beyond 120 seconds.
 */
export function resolveCommercialTimeline(
  clips: Map<string, VoiceOverClip>
): { scenes: CommercialScene[]; totalDurationSec: number } {
  let cursor = 0;
  const resolved: CommercialScene[] = [];

  for (const base of COMMERCIAL_SCENES) {
    const baseDuration = Math.max(1, base.endSec - base.startSec);
    const clip = clips.get(base.id);
    const neededDuration = clip
      ? base.voOffsetSec + clip.durationSec + VO_TAIL_PADDING_SEC
      : baseDuration;
    const duration = Math.max(baseDuration, neededDuration);

    const startSec = cursor;
    const endSec = cursor + duration;

    // Stretch/align subtitle cues cleanly to the actual spoken audio span
    const baseSpeechStart = base.startSec + base.voOffsetSec;
    const baseSpeechEnd = Math.max(
      baseSpeechStart + 0.5,
      base.cues[base.cues.length - 1]?.endSec ?? base.endSec - 0.3
    );
    const baseSpeechSpan = Math.max(0.5, baseSpeechEnd - baseSpeechStart);

    const actualSpeechStart = startSec + base.voOffsetSec;
    const actualSpeechSpan = clip
      ? Math.max(0.5, clip.durationSec)
      : Math.max(0.5, duration - base.voOffsetSec - 0.3);

    const cues: SubtitleCue[] = base.cues.map((cue) => {
      const relStart = Math.max(0, Math.min(1, (cue.startSec - baseSpeechStart) / baseSpeechSpan));
      const relEnd = Math.max(relStart, Math.min(1, (cue.endSec - baseSpeechStart) / baseSpeechSpan));
      return {
        startSec: actualSpeechStart + relStart * actualSpeechSpan,
        endSec: actualSpeechStart + relEnd * actualSpeechSpan,
        text: cue.text,
      };
    });

    resolved.push({
      ...base,
      startSec,
      endSec,
      cues,
    });

    cursor = endSec;
  }

  return {
    scenes: resolved,
    totalDurationSec: cursor,
  };
}

/**
 * Maps any canonical 0..120s timeline position (e.g. a touch tap or chime trigger)
 * to its corresponding timestamp on the dynamically expanded timeline.
 */
export function mapCanonicalToResolvedTime(
  canonicalSec: number,
  resolvedScenes: CommercialScene[]
): number {
  for (let i = 0; i < COMMERCIAL_SCENES.length; i += 1) {
    const base = COMMERCIAL_SCENES[i];
    const target = resolvedScenes[i] ?? base;
    if (canonicalSec <= base.endSec || i === COMMERCIAL_SCENES.length - 1) {
      const baseSpan = Math.max(0.01, base.endSec - base.startSec);
      const t = Math.max(0, Math.min(1, (canonicalSec - base.startSec) / baseSpan));
      return target.startSec + t * (target.endSec - target.startSec);
    }
  }
  return canonicalSec;
}

/**
 * Maps a live/export resolved timestamp back to the canonical 0..120s timeline
 * so every visual animation scales smoothly across expanded scene lengths.
 */
export function mapResolvedToCanonicalTime(
  resolvedSec: number,
  resolvedScenes: CommercialScene[]
): { scene: CommercialScene; canonicalSec: number } {
  const total = resolvedScenes[resolvedScenes.length - 1]?.endSec ?? TOTAL_DURATION_SEC;
  const clamped = Math.max(0, Math.min(total - 0.0001, resolvedSec));

  for (let i = 0; i < resolvedScenes.length; i += 1) {
    const target = resolvedScenes[i];
    if (clamped < target.endSec || i === resolvedScenes.length - 1) {
      const base = COMMERCIAL_SCENES[i] ?? target;
      const targetSpan = Math.max(0.01, target.endSec - target.startSec);
      const t = Math.max(0, Math.min(1, (clamped - target.startSec) / targetSpan));
      return {
        scene: target,
        canonicalSec: base.startSec + t * (base.endSec - base.startSec),
      };
    }
  }

  const last = resolvedScenes[resolvedScenes.length - 1] ?? COMMERCIAL_SCENES[COMMERCIAL_SCENES.length - 1];
  return { scene: last, canonicalSec: TOTAL_DURATION_SEC };
}

export function getSceneAtTime(
  timeSec: number,
  scenes: CommercialScene[] = COMMERCIAL_SCENES
): CommercialScene {
  const total = scenes[scenes.length - 1]?.endSec ?? TOTAL_DURATION_SEC;
  const clamped = Math.max(0, Math.min(total - 0.001, timeSec));
  return (
    scenes.find((s) => clamped >= s.startSec && clamped < s.endSec) ??
    scenes[scenes.length - 1]
  );
}

export function getActiveSubtitleAtTime(
  timeSec: number,
  scenes: CommercialScene[] = COMMERCIAL_SCENES
): string | null {
  for (const scene of scenes) {
    for (const cue of scene.cues) {
      if (timeSec >= cue.startSec && timeSec <= cue.endSec) {
        return cue.text;
      }
    }
  }
  return null;
}

export function getResolutionDimensions(
  aspect: AspectRatio,
  resolution: ExportResolution
): { width: number; height: number; labelAr: string } {
  if (aspect === '16:9') {
    return resolution === '4k'
      ? { width: 3840, height: 2160, labelAr: '4K UHD (3840×2160)' }
      : { width: 1920, height: 1080, labelAr: 'Full HD (1920×1080)' };
  }
  return resolution === '4k'
    ? { width: 2160, height: 3840, labelAr: '4K عمودي (2160×3840)' }
    : { width: 1080, height: 1920, labelAr: 'Full HD عمودي (1080×1920)' };
}

function formatSrtTimestamp(sec: number): string {
  const wholeMs = Math.max(0, Math.round(sec * 1000));
  const ms = wholeMs % 1000;
  const totalSec = Math.floor(wholeMs / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const pad3 = (n: number) => String(n).padStart(3, '0');
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(ms)}`;
}

export function buildSrtContent(scenes: CommercialScene[] = COMMERCIAL_SCENES): string {
  const lines: string[] = [];
  let index = 1;
  for (const scene of scenes) {
    for (const cue of scene.cues) {
      lines.push(
        `${index}`,
        `${formatSrtTimestamp(cue.startSec)} --> ${formatSrtTimestamp(cue.endSec)}`,
        cue.text,
        ''
      );
      index += 1;
    }
  }
  return lines.join('\n');
}
