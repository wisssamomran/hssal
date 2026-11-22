import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, ChevronDown, ChevronUp, ImagePlus, Star, Trash2, Upload } from 'lucide-react';
import { BannerView, DecisionButton, ErrorNote } from '@/shared/ui/panel';
import type { Banner } from '@/shared/ui/panel';
import { getLocale } from '@/core/i18n';
import { serverMessage } from '@/core/api/refusal';
import { deleteProductImage, getProductImages, updateProductImage, uploadProductImages } from '@/features/catalog/api';
import type { Product, ProductImage } from '@/features/catalog/types';
import {
  PRODUCT_IMAGE_ACCEPT,
  fileSizeInKb,
  imageAlt,
  imageMetaLine,
  imageRefusal,
  loweredSortOrder,
  noImagesMessage,
  raisedSortOrder,
  uploadOutcome,
} from '../product-images';

/**
 * One product's photographs.
 *
 * These are the supplier's own pictures of the goods, stored per product and read back
 * by the marketplace as `product_cover_image` / `product_images`. Nothing here is
 * generated, and nothing here is a stock photo standing in for a pallet nobody has
 * seen.
 *
 * The upload answers with two lists, and both are shown: the files that were stored and
 * the files the server sent back with a reason. A picker that accepted five files and
 * stored two would otherwise leave the seller believing the shelf has five photographs.
 *
 * The panel owns its own read. A product's media set changes only through this panel,
 * so the catalogue screen keeps no copy of it — and the row above the sheet never claims
 * a photograph count it has not fetched.
 */
export const ProductImagesPanel: React.FC<{ product: Product; openAtImages?: boolean }> = ({
  product,
  openAtImages,
}) => {
  const locale = getLocale();
  const picker = useRef<HTMLInputElement | null>(null);
  const section = useRef<HTMLDivElement | null>(null);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  /** Files sitting in the picker, not yet sent. Display only — the upload reads the input itself. */
  const [picked, setPicked] = useState<File[]>([]);
  /** What the last upload answered: how many the server stored, and which it refused with why. */
  const [report, setReport] = useState<{ saved: number; rejected: { file: string; reason: string }[] } | null>(
    null
  );

  const load = useCallback(async () => {
    setReadError(null);
    const result = await getProductImages(product.id);
    setLoaded(true);
    if (result.success) setImages(result.data ?? []);
    else {
      // A refused read is not an empty gallery: the seller must not conclude their
      // photographs were lost when the request never reached them.
      setImages([]);
      setReadError(imageRefusal(result));
    }
  }, [product.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Opened from a row's «صور الصنف», the sheet scrolls to the picker instead of
  // leaving the seller to find it under the correction fields.
  useEffect(() => {
    if (openAtImages) section.current?.scrollIntoView({ block: 'start' });
  }, [openAtImages]);

  const clearPicker = () => {
    setPicked([]);
    if (picker.current) picker.current.value = '';
  };

  const upload = async () => {
    const files = Array.from(picker.current?.files ?? []);
    if (!files.length) {
      setBanner({ kind: 'error', text: 'اختر ملفًا أو أكثر أولًا.' });
      return;
    }

    setBusy(true);
    setBanner(null);
    setReport(null);
    const result = await uploadProductImages(product.id, files);
    setBusy(false);

    if (!result.success) {
      // IMAGE_LIMIT_REACHED and UPLOAD_QUOTA_EXCEEDED both carry what the server
      // would take instead; its numbers, not a guess about the limit.
      setBanner({ kind: 'error', text: imageRefusal(result) });
      clearPicker();
      void load();
      return;
    }

    const saved = result.data?.images.length ?? 0;
    const rejected = result.data?.rejected ?? [];
    const outcome = uploadOutcome(saved, rejected.length, images.some((image) => image.is_cover));
    clearPicker();
    setReport({ saved, rejected });
    setBanner({ kind: outcome.kind, text: outcome.text });
    void load();
  };

  const setCover = async (image: ProductImage) => {
    setBusy(true);
    setBanner(null);
    const result = await updateProductImage(product.id, image.id, { is_cover: true });
    setBusy(false);
    if (!result.success) setBanner({ kind: 'error', text: imageRefusal(result) });
    else setBanner({ kind: 'ok', text: serverMessage(result, 'صارت هذه النسخة هي الغلاف') });
    void load();
  };

  const move = async (image: ProductImage, sortOrder: number) => {
    setBusy(true);
    const result = await updateProductImage(product.id, image.id, { sort_order: sortOrder });
    setBusy(false);
    if (!result.success) setBanner({ kind: 'error', text: imageRefusal(result) });
    void load();
  };

  const remove = async (image: ProductImage) => {
    setBusy(true);
    setBanner(null);
    const result = await deleteProductImage(product.id, image.id);
    setBusy(false);
    setBanner(
      result.success
        ? { kind: 'ok', text: serverMessage(result, 'حُذفت الصورة') }
        : { kind: 'error', text: imageRefusal(result) },
    );
    void load();
  };

  return (
    <div ref={section} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-black text-slate-900">
          <Camera className="w-4 h-4 text-emerald-700" />
          صور الصنف
        </h4>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
          {loaded ? `${images.length} صورة محفوظة لدى الخادم` : 'لم تُقرأ الصور بعد…'}
        </span>
      </div>

      <p className="text-[11px] leading-relaxed text-slate-500">
        هذه صور المورّد لبضاعته كما رفعها، وهي ما يُقرأ في السوق. أول ملف يقبله الخادم يصير غلاف الصنف إن لم يكن له
        غلاف، والحدود — الحجم وعدد الصور وأنواعها — يضعها الخادم وتظهر في رفضه حين تُتجاوز.
      </p>

      {/* The picker sits above the stored photographs on purpose: the control that
          makes a picture exist is the one a seller has to find first, not the
          gallery that appears only after something was saved. */}
      <div className="space-y-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-3">
        <label className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1">
          <input
            ref={picker}
            type="file"
            multiple
            accept={PRODUCT_IMAGE_ACCEPT}
            onChange={(event) => {
              setPicked(Array.from(event.target.files ?? []));
              setReport(null);
              setBanner(null);
            }}
            className="sr-only"
          />
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-[11px] font-bold text-emerald-800">
            <ImagePlus className="w-3.5 h-3.5" />
            اختيار صور من الجهاز
          </span>
          <span className="text-[10px] leading-relaxed text-slate-500">
            JPG أو PNG أو WebP، وأكثر من ملفٍ مرة واحدة. لا يصل شيء إلى الخادم قبل الضغط على «رفع الصور».
          </span>
        </label>

        {picked.length ? (
          <ul className="space-y-1">
            {picked.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex items-center gap-2 text-[10px] text-slate-600">
                <span className="min-w-0 flex-1 truncate" dir="ltr" title={file.name}>
                  {file.name}
                </span>
                <span className="shrink-0 text-slate-400">{fileSizeInKb(file.size)}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <DecisionButton busy={busy} onClick={() => void upload()}>
            <Upload className="w-3.5 h-3.5" />
            <span>{busy ? 'جارٍ الرفع…' : picked.length ? `رفع الصور (${picked.length})` : 'رفع الصور'}</span>
          </DecisionButton>
          <span className="text-[10px] leading-relaxed text-slate-500">
            {picked.length
              ? 'بعد الرفع يُعرض هنا ما حفظه الخادم وما رفضه وسببه.'
              : 'لم تُختر ملفات بعد؛ الزر يرفع ما في هذا الاختيار فقط.'}
          </span>
        </div>
      </div>

      <BannerView banner={banner} />
      {readError ? <ErrorNote text={readError} /> : null}

      {report?.rejected.length ? (
        <ul className="space-y-1 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[10px] leading-relaxed text-rose-800">
          {report.rejected.map((item) => (
            <li key={`${item.file}-${item.reason}`} className="flex items-start gap-1.5">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="min-w-0">
                <span dir="ltr" className="font-bold">
                  {item.file}
                </span>
                : {item.reason}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {images.length ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map((image) => (
            <li key={image.id} className="min-w-0 space-y-1">
              <div className="relative">
                <img
                  src={image.url ?? undefined}
                  alt={imageAlt(image)}
                  className="h-28 w-full rounded-lg border border-slate-200 object-cover bg-slate-50"
                />
                {image.is_cover ? (
                  <span className="absolute top-1 right-1 rounded-md bg-emerald-700/90 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    الغلاف
                  </span>
                ) : null}
              </div>
              <div className="truncate text-[10px] text-slate-500" dir="ltr" title={image.original_name || ''}>
                {imageMetaLine(image)}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {!image.is_cover ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void setCover(image)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                  >
                    <Star className="w-2.5 h-2.5" />
                    <span>جعلها الغلاف</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  aria-label="تقديم صورة"
                  onClick={() => void move(image, raisedSortOrder(image))}
                  className="rounded-md border border-slate-300 p-1.5 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  aria-label="تأخير صورة"
                  onClick={() => void move(image, loweredSortOrder(image))}
                  className="rounded-md border border-slate-300 p-1.5 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(image)}
                  className="inline-flex items-center gap-1 rounded-md border border-rose-300 px-1.5 py-0.5 text-[10px] font-bold text-rose-800 hover:bg-rose-50 disabled:opacity-40"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                  <span>حذف</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : loaded && !readError ? (
        <p className="text-[11px] text-slate-500">{noImagesMessage(locale)}</p>
      ) : null}
    </div>
  );
};
