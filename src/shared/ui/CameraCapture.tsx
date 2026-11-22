import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Photographing a paper with the device's own camera.
 *
 * This exists because the identity card and the registration certificate are
 * objects, not files. A person at a shop counter has a phone camera and no
 * scanner, and a form that only accepts "choose a file" asks them to find a
 * workflow they do not have.
 *
 * What the browser is asked for:
 *
 *   * `facingMode: 'environment'` — the back camera, which is the one that
 *     points at the card.
 *   * Nothing is uploaded from here. The component hands back a `File`, and the
 *     caller sends it through the same endpoint a picked file would use, so the
 *     server's mime sniffing, size ceiling, quota and review queue all still
 *     apply to a photograph exactly as they do to a scan.
 *
 * The failure paths are stated rather than swallowed: a page served over plain
 * HTTP, a denied permission prompt, a device with no camera and a browser that
 * does not implement the API each get their own sentence, because "camera not
 * available" tells a user nothing about what to do next. `getUserMedia` is only
 * exposed on secure contexts, so an http:// installation shows the first of
 * those messages and the file picker stays as the working path.
 */

type CameraFailure = 'insecure' | 'unsupported' | 'denied' | 'no-camera' | 'unknown';

function describeFailure(error: unknown, secure: boolean): { code: CameraFailure; text: (ar: boolean) => string } {
  const name = typeof error === 'object' && error !== null && 'name' in error
    ? String((error as { name: unknown }).name)
    : '';

  if (!secure) {
    return {
      code: 'insecure',
      text: (ar) => (ar
        ? 'المتصفح لا يفتح الكاميرا إلا على اتصال آمن (https). استخدم «اختيار ملف» أو افتح المنصة من الرابط الآمن.'
        : 'The browser only opens the camera over https. Use “choose a file”, or open the platform at its secure address.'),
    };
  }
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      code: 'denied',
      text: (ar) => (ar
        ? 'رُفض إذن الكاميرا من المتصفح. فعّله من إعدادات هذا الموقع ثم أعد المحاولة، أو اختر ملفًا جاهزًا.'
        : 'The browser refused camera access. Enable it in this site’s settings and try again, or pick an existing file.'),
    };
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return {
      code: 'no-camera',
      text: (ar) => (ar
        ? 'لا كاميرا على هذا الجهاز. استخدم «اختيار ملف».'
        : 'This device has no camera. Use “choose a file” instead.'),
    };
  }
  if (name === 'NotReadableError') {
    return {
      code: 'no-camera',
      text: (ar) => (ar
        ? 'الكاميرا مستخدمة من تطبيق آخر على جهازك. أغلقه ثم أعد المحاولة.'
        : 'Another app is holding the camera. Close it and try again.'),
    };
  }
  return {
    code: 'unknown',
    text: (ar) => (ar ? 'لم تُفتح الكاميرا. استخدم «اختيار ملف».' : 'The camera did not open. Use “choose a file”.'),
  };
}

export const CameraCapture: React.FC<{
  /** Shown above the viewfinder so the user knows what to point the camera at. */
  subjectLabel: string;
  /** The filename given to the captured shot; the server renames the stored copy. */
  fileName: string;
  disabled?: boolean;
  onCaptured: (file: File) => void;
  onClose: () => void;
}> = ({ subjectLabel, fileName, disabled = false, onCaptured, onClose }) => {
  const ar = (typeof navigator !== 'undefined' ? navigator.language : 'ar').toLowerCase().startsWith('ar');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [failure, setFailure] = useState<{ code: CameraFailure; text: (ar: boolean) => string } | null>(null);
  const [ready, setReady] = useState(false);
  const [snapped, setSnapped] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    const secure = typeof window !== 'undefined' ? window.isSecureContext : false;
    if (!secure || !navigator.mediaDevices?.getUserMedia) {
      setFailure(describeFailure({ name: 'NotSupportedError' }, secure));
      return;
    }

    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {
            // Autoplay refusal is not a failure to open the camera: the
            // viewfinder is there, the user just has to tap it.
          });
        }
        setReady(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) setFailure(describeFailure(error, secure));
      });

    return () => {
      cancelled = true;
      stop();
    };
  }, [stop]);

  const shoot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setFailure({ code: 'unknown', text: (isAr) => (isAr ? 'تعذّر تجهيز اللوحة للالتقاط.' : 'Could not prepare the frame.') });
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) {
        setFailure({ code: 'unknown', text: (isAr) => (isAr ? 'لم يُنتج الالتقاط صورة.' : 'The capture produced no image.') });
        return;
      }
      setSnapped(URL.createObjectURL(blob));
      // The File is handed over immediately: closing the viewfinder must not
      // lose the shot, and the caller decides whether to send it.
      onCaptured(new File([blob], fileName, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  };

  return (
    <div className="border border-slate-300 rounded-xl bg-slate-900 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-slate-100">{subjectLabel}</span>
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] font-bold text-slate-300 hover:text-white cursor-pointer"
        >
          {ar ? 'إغلاق' : 'Close'}
        </button>
      </div>

      {failure ? (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2 text-[11px] leading-relaxed">
          {failure.text(ar)}
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full rounded-lg bg-black aspect-[4/3] object-cover ${snapped ? 'hidden' : ''}`}
          />
          {snapped ? (
            <img src={snapped} alt={subjectLabel} className="w-full rounded-lg bg-black aspect-[4/3] object-cover" />
          ) : null}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={shoot}
              disabled={!ready || disabled}
              className="bg-white text-slate-900 rounded-lg px-3 py-2 text-[11px] font-bold disabled:opacity-40 cursor-pointer"
            >
              {ready ? (ar ? 'التقاط' : 'Capture') : (ar ? 'جارٍ فتح الكاميرا…' : 'Opening camera…')}
            </button>
            {snapped ? (
              <button
                type="button"
                onClick={() => setSnapped(null)}
                className="bg-slate-700 text-white rounded-lg px-3 py-2 text-[11px] font-bold cursor-pointer"
              >
                {ar ? 'إعادة الالتقاط' : 'Retake'}
              </button>
            ) : null}
            <span className="text-[10px] text-slate-400">
              {ar ? 'تأكد أن كل الحروف مقروءة ولا انعكاس على البطاقة.' : 'Make sure every line is legible and there is no glare.'}
            </span>
          </div>
        </>
      )}
    </div>
  );
};
