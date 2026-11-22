import React, { useState } from 'react';
import { ScanLine } from 'lucide-react';
import type { Locale } from '@/core/i18n';
import { CameraCapture } from '@/shared/ui/CameraCapture';
import { Sheet } from '@/shared/ui/Sheet';
import type { Deal } from '../types';

/**
 * The minimum the browser's own barcode reader needs to be described with.
 *
 * `BarcodeDetector` is not in TypeScript's DOM library yet, and the whole point of
 * this sheet is that it works when the API is there and says something useful when
 * it is not — so the type is written down rather than a library added.
 */
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string; format?: string }>>;
};

const barcodeDetectorCtor = (): (new (config?: { formats?: string[] }) => BarcodeDetectorLike) | null => {
  const ctor = (window as unknown as { BarcodeDetector?: new (config?: { formats?: string[] }) => BarcodeDetectorLike })
    .BarcodeDetector;
  return typeof ctor === 'function' ? ctor : null;
};

/**
 * Writing the code down — by camera where the browser can read one, by keyboard
 * where it cannot.
 *
 * The typed field is not a fallback for a failing camera; it is the path a damaged
 * label, a driver's dictation and a dark loading bay all take, and the server
 * accepts it on exactly the same terms. Nothing here decides whether the code is
 * good: the sheet sends the string, and the answer comes back with the server's own
 * reason.
 */
export const ScanSheet: React.FC<{
  deal: Deal;
  locale: Locale;
  busy: boolean;
  onCancelLabel: string;
  onClose: () => void;
  onSubmit: (code: string) => void;
}> = ({ deal, locale, busy, onCancelLabel, onClose, onSubmit }) => {
  const [code, setCode] = useState('');
  const [camera, setCamera] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const supported = Boolean(barcodeDetectorCtor());

  const decode = async (file: File) => {
    const Ctor = barcodeDetectorCtor();

    if (!Ctor) {
      setNote(locale === 'ar' ? 'متصفحك لا يقرأ الرموز الشريطية؛ اكتب الرمز من الملصق.' : 'This browser cannot read barcodes. Type the code from the label.');
      return;
    }

    try {
      const bitmap = await createImageBitmap(file);
      const found = await new Ctor({ formats: ['qr_code', 'code_128'] }).detect(bitmap);
      const value = found.find((entry) => entry.rawValue)?.rawValue ?? '';

      if (!value) {
        setNote(locale === 'ar'
          ? 'لم يقترن بالصورة رمز؛ أعد الالتقاط قريبًا وبإضاءة أفضل، أو اكتُب الرمز.'
          : 'No code came back from that frame. Take it again closer and without glare, or type the code.');
        return;
      }

      setCode(value);
      setNote(null);
      setCamera(false);
    } catch {
      // A decoder that throws is the same event as one that finds nothing, and
      // the typed field is still there.
      setNote(locale === 'ar'
        ? 'تعذّر فحص الصورة؛ الرمز مكتوب على الملصق ويمكن إدخاله.'
        : 'That frame could not be read. The code is printed on the label and can be typed.');
    }
  };

  return (
    <Sheet
      title={locale === 'ar' ? `مسح رمز التسليم للعقد ${deal.deal_number}` : `Scan the handover code for ${deal.deal_number}`}
      onClose={onClose}
    >
      <p className="text-xs text-slate-600">
        {locale === 'ar'
          ? 'يُسجَّل المسح باسمك ومنشأتك ووقته، ولا يُقبل إلا مرة واحدة لهذا العقد. لا تُغلق الصفقة بهذا الإجراء؛ يشتري العقد حقه في الفحص والإغلاق بعده.'
          : 'The scan is recorded with your name, your organization and the moment it happened, and it is accepted once for this order. This action does not close the deal — it is what lets the buyer’s own receipt close it.'}
      </p>

      {camera ? (
        <div className="space-y-2">
          <CameraCapture
            subjectLabel={locale === 'ar' ? 'وجّه الكاميرا إلى ملصق رمز التسليم' : 'Point the camera at the handover label'}
            fileName={`handover-${deal.deal_number}.jpg`}
            onCaptured={decode}
            onClose={() => setCamera(false)}
          />
          {!supported && (
            <p className="text-[11px] text-amber-800">
              {locale === 'ar'
                ? 'متصفحك لا يقرأ الرموز من الصورة؛ الالتقاط هنا للتوثيق فقط، واكتب الرمز في الحقل أدناه.'
                : 'This browser cannot read a code out of a picture — the capture is for the record only, so type the code into the field below.'}
            </p>
          )}
        </div>
      ) : (
        supported && (
          <button
            type="button"
            onClick={() => {
              setNote(null);
              setCamera(true);
            }}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ScanLine className="h-4 w-4" />
            {locale === 'ar' ? 'امسح بالكاميرا' : 'Scan with the camera'}
          </button>
        )
      )}

      <label className="block space-y-1">
        <span className="block text-[11px] font-bold text-slate-600">
          {locale === 'ar' ? 'الرمز كما على الملصق' : 'The code as printed on the label'}
        </span>
        <input
          autoFocus
          dir="ltr"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="HASSAL:HANDOVER:… أو الرمز وحده"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-xs font-normal tracking-wider focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </label>

      {note && <p className="text-[11px] text-amber-800">{note}</p>}

      <div className="flex flex-col-reverse gap-2.5 sm:flex-row">
        <button
          type="button"
          onClick={onClose}
          className="w-full cursor-pointer rounded-xl bg-slate-100 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-200 sm:flex-1 sm:py-2.5"
        >
          {onCancelLabel}
        </button>
        <button
          type="button"
          disabled={busy || code.trim().length < 4}
          onClick={() => onSubmit(code)}
          className="w-full cursor-pointer rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-1 sm:py-2.5"
        >
          {busy
            ? (locale === 'ar' ? 'جارٍ التسجيل…' : 'Recording…')
            : (locale === 'ar' ? 'تسجيل المسح' : 'Record the scan')}
        </button>
      </div>
    </Sheet>
  );
};
