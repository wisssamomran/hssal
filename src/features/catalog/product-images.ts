import type { ApiResult } from '@/core/api/http';
import { explainRefusal } from '@/core/api/refusal';
import type { RefusalCodeText } from '@/core/api/refusal';
import type { Locale } from '@/core/i18n';
import { catalogRefusal } from './product-form';
import type { ProductImage } from './types';

/**
 * What a product's photographs are, and what stands between a seller and adding one.
 *
 * The screen's job is to never let a partly-rejected batch read as a clean one. The
 * upload endpoint answers with both lists — what it stored and what it refused with
 * the reason per file — so the panel prints both, and every refusal sentence below
 * keeps the server's own words where those words already carry the number that was
 * crossed (the per-product ceiling, the organization's storage quota).
 *
 * Two facts about the server sit here rather than in JSX because they are claims about
 * the platform, not layout:
 * - the first accepted file becomes the cover when the product has none;
 * - the ceilings come from `config('hassal.uploads.images')` on the server. The
 *   `accept` attribute below mirrors the accepted types so a wrong file type is not
 *   worth an upload, and nothing more: the server's refusal stays the rule, because an
 *   environment variable changes the limit without rebuilding this bundle.
 */

/** JPG, PNG or WebP — the three types `hassal.uploads.images.accepted_mimes` lists. */
export const PRODUCT_IMAGE_ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';

const IMAGE_CODES: Record<string, RefusalCodeText> = {
  FORBIDDEN: 'صور هذا الصنف لا تُدار من حسابك: الصنف المرجعي أو صنف منشأة أخرى لا يُرفع له صور.',
  IMAGE_LIMIT_REACHED: (message) =>
    `${message} — هذا الحد بعدد الصور لكل صنف، لا بحجم الملف؛ احذف صورة أو ارفع أقل.`,
  UPLOAD_QUOTA_EXCEEDED: (message) =>
    `${message} — المساحة محجوبة لمنشأتك كلها؛ يضبطها مسؤول المنشأة أو تُحرَّ منها مساحة بحذف ملفات.`,
  NO_IMAGE_ACCEPTED: (message) => `${message} — لم يُحفظ أي ملف، فصور الصنف بقيت كما كانت.`,
};

/** Why this upload, cover change, reorder or delete did not happen. */
export function imageRefusal(result: ApiResult<unknown>): string {
  return explainRefusal(result, { fallback: catalogRefusal(result), codes: IMAGE_CODES });
}

/**
 * The line after an upload, counted from what the server said it stored.
 *
 * `hadCover` is the state before this batch: the cover note is only true for a product
 * that had none, and printing it on one that already had a cover would tell the seller
 * their existing cover moved when it did not.
 */
export function uploadOutcome(
  saved: number,
  rejectedCount: number,
  hadCover: boolean
): { kind: 'ok' | 'error'; text: string } {
  if (rejectedCount) {
    return {
      kind: 'error',
      text: `حفظ الخادم ${saved} صورة، ومضى في رفض ${rejectedCount} ملفًا — أسبابه مبيّنة تحتها.`,
    };
  }
  const becameCover = saved === 1 && !hadCover ? '؛ صار أول ملف مقبول هو الغلاف' : '';
  return { kind: 'ok', text: `حُفظت ${saved} صورة${becameCover}.` };
}

/** Files sit in the picker before they exist anywhere; this is their size, in KB. */
export function fileSizeInKb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

/** One stored photograph's own measurements, as the server recorded them. */
export function imageMetaLine(image: ProductImage): string {
  const name = image.original_name || `#${image.id}`;
  const dimensions = image.width && image.height ? ` · ${image.width}×${image.height}` : '';
  const size = image.size_bytes ? ` · ${fileSizeInKb(image.size_bytes)}` : '';
  return `${name}${dimensions}${size}`;
}

/** An accessible label for a picture the seller may not be able to see. */
export function imageAlt(image: ProductImage): string {
  return image.original_name || `صورة ${image.id}`;
}

/** A product with no stored photograph — in both of the product's languages. */
export function noImagesMessage(locale: Locale): string {
  return locale === 'en' ? 'No photograph filed for this product.' : 'لا صورة محفوظة لهذا الصنف لدى الخادم.';
}

/** The next position a photograph takes when the seller moves it up. */
export function raisedSortOrder(image: ProductImage): number {
  return Math.max(0, (image.sort_order ?? 0) - 1);
}

/** …and when they move it down. The server accepts 0–999; a bigger value is its refusal. */
export function loweredSortOrder(image: ProductImage): number {
  return (image.sort_order ?? 0) + 1;
}
