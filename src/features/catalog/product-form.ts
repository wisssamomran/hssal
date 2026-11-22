import type { ApiResult } from '@/core/api/http';
import { fieldError } from '@/core/api/http';
import { explainRefusal, serverMessage } from '@/core/api/refusal';
import type { RefusalCodeText } from '@/core/api/refusal';
import type { Locale } from '@/core/i18n';
import type { Product, ProductVariant } from './types';

/**
 * What a catalogue entry is made of, and what stands in the way of saving one.
 *
 * The catalogue screen has two forms — add a product, correct a product — and they
 * ask for the same eight fields. Before this file they each held their own copy of
 * the required-field checks, their own copy of the payload builder, and their own
 * copy of the sentence shown when the unit box was left empty; the two copies had
 * already drifted apart (one said «الوحدة التي تُعدّ بها الكمية مطلوبة», the other
 * the same words with the examples cut off). One rule now, read by both.
 *
 * What stays deliberate rather than shared:
 * - `sku` is sent on create and never on update. The server accepts the code when the
 *   product is raised and refuses to move it afterwards, because an existing offer
 *   pointed at that code when it was published; rewriting it would leave the listing
 *   saying one thing about a different thing.
 * - The empty optional fields are omitted instead of sent blank. A blank name in the
 *   payload would clear a name somebody recorded.
 *
 * The refusal codes below are the ones `PUT /catalog/products/{id}` actually answers.
 * Two of them are about who owns the record, and naming which one arrived is the
 * difference between «ask the platform» and «fix your typing».
 */

/** The fields the server validates, so a refusal can be placed under its box. */
export const PRODUCT_FIELDS = [
  'category_id',
  'brand_id',
  'name_ar',
  'name_en',
  'sku',
  'unit',
  'package_size',
  'temperature_class',
] as const;

export type ProductField = (typeof PRODUCT_FIELDS)[number];

/** One draft as the boxes hold it: text, including the two selects' numeric ids. */
export type ProductDraft = Record<ProductField, string>;

export type FieldErrors = Partial<Record<ProductField, string | null>>;

export const EMPTY_PRODUCT_DRAFT: ProductDraft = {
  category_id: '',
  brand_id: '',
  name_ar: '',
  name_en: '',
  sku: '',
  unit: '',
  package_size: '',
  temperature_class: '',
};

/** The catalog's fallback line, on top of the reading rule in `core/api/refusal`. */
export function catalogRefusal(result: ApiResult<unknown>): string {
  return serverMessage(result, 'تعذّر تنفيذ الطلب على الكتالوج.');
}

/**
 * The correction sheet's seed, from the stored row.
 *
 * `sku` is read off the row for display only; the draft never carries it, so the
 * update payload cannot grow a changed code by accident.
 */
export function productDraft(product: Product): ProductDraft {
  return {
    ...EMPTY_PRODUCT_DRAFT,
    category_id: String(product.category_id ?? ''),
    brand_id: product.brand_id ? String(product.brand_id) : '',
    name_ar: product.name_ar ?? '',
    name_en: product.name_en ?? '',
    unit: product.unit ?? '',
    package_size: product.package_size ?? '',
    temperature_class: product.temperature_class ?? '',
  };
}

/** The three boxes the server requires, checked the same way in both forms. */
export function productFieldErrors(draft: ProductDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (!draft.category_id) errors.category_id = 'التصنيف مطلوب لاختيار الصنف.';
  if (!draft.name_ar.trim()) errors.name_ar = 'الاسم بالعربية مطلوب.';
  if (!draft.unit.trim()) errors.unit = 'الوحدة التي تُعدّ بها الكمية مطلوبة (كرتون، كجم، كيس…).';
  return errors;
}

/** Whether this draft may be sent at all — the server still has the last word. */
export function productDraftIsValid(draft: ProductDraft): boolean {
  return Object.keys(productFieldErrors(draft)).length === 0;
}

/**
 * The create payload: numbers where the server expects ids and references, and no
 * blank optional field.
 */
export function productCreatePayload(draft: ProductDraft): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    category_id: Number(draft.category_id),
    name_ar: draft.name_ar.trim(),
    unit: draft.unit.trim(),
  };
  if (draft.brand_id) payload.brand_id = Number(draft.brand_id);
  if (draft.name_en.trim()) payload.name_en = draft.name_en.trim();
  if (draft.sku.trim()) payload.sku = draft.sku.trim();
  if (draft.package_size.trim()) payload.package_size = draft.package_size.trim();
  if (draft.temperature_class.trim()) payload.temperature_class = draft.temperature_class.trim();
  return payload;
}

/** The update payload — the same shape, minus the code that may not move. */
export function productUpdatePayload(draft: ProductDraft): Record<string, unknown> {
  // Blanking the code is what drops it: the builder omits an empty optional field,
  // so no update can carry a rewritten SKU however this file changes later.
  return productCreatePayload({ ...draft, sku: '' });
}

/**
 * Each refusal placed under its own box, so a rejected form says which field the
 * server objected to rather than that the form was objected to.
 */
export function productFieldErrorsFrom(result: ApiResult<unknown>): FieldErrors {
  const errors: FieldErrors = {};
  PRODUCT_FIELDS.forEach((field) => {
    errors[field] = fieldError(result, field);
  });
  return errors;
}

const PRODUCT_WRITE_CODES: Record<string, RefusalCodeText> = {
  PLATFORM_REFERENCE_NOT_EDITABLE:
    'هذا صنف مرجعي تملكه المنصة؛ لا تُصحّحه المنشأة. أنشئ صنف منشأتك بالاسم الذي تريده.',
  PRODUCT_NOT_OWNED: 'هذا الصنف ليس من كتالوج منشأتك العاملة، فالتعديل مرفوض.',
  PERMISSION_DENIED: 'تعديل أصناف الكتالوج صلاحية catalog.manage، ولا يملكها هذا الحساب ضمن منشأته.',
};

/** Why the write was refused, in the sentence that tells the operator what to do. */
export function productWriteProblem(result: ApiResult<unknown>): string {
  return explainRefusal(result, {
    fallback: catalogRefusal(result),
    codes: PRODUCT_WRITE_CODES,
  });
}

/** The line after a product was raised, kept whole because both halves are true at once. */
export const PRODUCT_CREATED_MESSAGE =
  'أُنشئ الصنف، وأُنشئ معه صنف افتراضي واحد تلقائياً بحسب سلوك الخادم. لا يظهر في السوق قبل نشر عرض له. ' +
  'صوره تُرفع من زر «صور الصنف» في سطره بالجدول أعلاه.';

/** The line after a correction, or the server's own acknowledgement when it has one. */
export function productSavedMessage(result: ApiResult<unknown>): string {
  return serverMessage(
    result,
    'حُفظ التعديل. الأصناف الفرعية والعروض القائمة تحتفظ بما نُشر عليها وقتها.'
  );
}

/**
 * A catalogue name in the reader's language.
 *
 * Arabic first, always: the catalogue is named in Arabic and English is the optional
 * field, so an English locale with no English name falls back to the Arabic one rather
 * than printing an empty cell.
 */
export function catalogName(
  entity: { name_ar: string; name_en?: string | null } | undefined,
  locale: Locale
): string {
  if (!entity) return 'غير مسجّل';
  return ((locale === 'en' && entity.name_en ? entity.name_en : entity.name_ar) || 'غير مسجّل');
}

/** A variant as one line: its name, or its code when nobody named it. */
export function variantName(variant: ProductVariant, locale: Locale): string {
  return catalogName({ name_ar: variant.name_ar, name_en: variant.name_en }, locale) || variant.sku;
}

/** The category or brand a stored product points at, resolved against what was read. */
export function catalogNameFor(
  id: number | null | undefined,
  rows: { id: number; name_ar: string; name_en?: string | null }[],
  locale: Locale,
  whenMissing: string
): string {
  if (!id) return whenMissing;
  return catalogName(rows.find((row) => row.id === id), locale);
}
