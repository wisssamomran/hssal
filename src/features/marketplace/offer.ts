import type { RefusalCodeText } from '@/core/api/refusal';
import { fieldError } from '@/core/api/http';
import type { ApiResult } from '@/core/api/http';
import type { Offer } from './types';
import { asDeliveryTerms, type DeliveryTerms } from './labels';

/**
 * The rules a seller's listing form enforces before it sends anything.
 *
 * These are the server's rules restated, not new ones: `OfferInputRules::store()`
 * and `::update()` in `backend/app/Marketplace/Support` are what actually decide
 * whether a listing is written, and every floor here is one of their `min:` and
 * `gte:` clauses. A form that ships a value Laravel would reject wastes a round trip
 * and shows the seller a message attached to a field they had already filled
 * correctly. The two places that write offers — the shelf's "طرح عرض" sheet and the
 * edit sheet — had grown their own copies of these sentences, worded slightly
 * differently for the same failure. One rule now, with the small mode differences
 * the routes genuinely have:
 *
 * - create asks for a variant and a warehouse; edit ignores anything sent for them,
 *   because a price on different goods is a different listing;
 * - create can save a draft; edit is already past that question;
 * - edit carries the inspection window and the market expiry date;
 * - edit refuses to rewrite the total while stock is reserved or sold against it.
 *
 * Cross-field quantity checks live here rather than in a controller comment: on
 * create both halves arrive in one request, and on edit `OfferWritingService` reads
 * the halves it cannot see off the row — the same split the backend documents.
 */

/** Every number arrives from an input as a string, so "blank" and "zero" stay distinct here. */
export interface OfferFormValues {
  titleAr: string;
  descriptionAr: string;
  opportunityReason: string;
  reasonNotes: string;
  unit: string;
  unitPrice: string;
  minOrderQuantity: string;
  maxOrderQuantity: string;
  totalQuantity: string;
  deliveryTerms: DeliveryTerms;
  showSellerIdentity: boolean;
  /** Create only — a listing can be saved without being offered. */
  asDraft?: boolean;
  /** Create only — the two anchors the server requires before a listing exists. */
  productVariantId?: number | '';
  warehouseId?: number | '';
  /** Edit only. */
  inspectionWindowHours?: string;
  expiresAt?: string;
  productionDate?: string;
  expiryDate?: string;
  storageCondition?: string;
}

/** Field name → the sentence the seller sees under it. */
export type OfferProblems = Record<string, string>;

export interface OfferValidationContext {
  mode: 'create' | 'edit';
  /** Edit: the listing already has reserved or sold stock, so its total is not the seller's to change. */
  quantityLocked?: boolean;
}

const trimmed = (value: string | undefined): string => (value ?? '').trim();

/**
 * Check a listing form and say what is wrong, field by field.
 *
 * The quantity tests are written as `!(n >= 1)` rather than `n < 1` on purpose: a
 * box the seller left blank, or filled with letters, parses to `NaN`, and `NaN < 1`
 * is false — the form would have looked valid and the server would have said
 * otherwise. Negating the positive test makes "not a usable number" and "too small"
 * the same honest answer: this field has not been filled in.
 */
export function offerFieldProblems(values: OfferFormValues, context: OfferValidationContext): OfferProblems {
  const problems: OfferProblems = {};

  if (context.mode === 'create') {
    if (!values.productVariantId) problems.product_variant_id = 'اختر الصنف والعبوة.';
    if (!values.warehouseId) problems.warehouse_id = 'اختر مستودعاً تابعاً لمنشأتك.';
  }

  if (!trimmed(values.titleAr)) problems.title_ar = 'عنوان العرض مطلوب.';
  if (!trimmed(values.opportunityReason)) problems.opportunity_reason = 'اختر سبب طرح المخزون من قائمة المنصة.';
  if (!trimmed(values.unit)) problems.unit = 'حدِّد وحدة العدّ (كرتونة، باليت، كيس...).';

  const total = Number(values.totalQuantity);
  const min = Number(values.minOrderQuantity);
  const price = Number(values.unitPrice);

  if (!context.quantityLocked) {
    if (!trimmed(values.totalQuantity) || !(total >= 1)) {
      problems.total_quantity = 'الكمية الكلية رقم لا يقل عن 1.';
    } else if (min >= 1 && total < min) {
      // The server's own comparison: `total_quantity` carries `gte:min_order_quantity`.
      problems.total_quantity = 'الكمية الكلية لا تقل عن الحد الأدنى للطلب.';
    }
  }
  if (!trimmed(values.minOrderQuantity) || !(min >= 1)) {
    problems.min_order_quantity = 'الحد الأدنى للطلب رقم لا يقل عن 1.';
  }
  if (!trimmed(values.unitPrice) || !(price >= 0.0001)) {
    problems.unit_price = 'سعر الوحدة رقم أكبر من صفر.';
  }
  if (trimmed(values.maxOrderQuantity)) {
    const max = Number(values.maxOrderQuantity);
    if (!(max >= 1)) problems.max_order_quantity = 'الحد الأقصى إن ذُكر رقم لا يقل عن 1.';
    else if (min >= 1 && max < min) problems.max_order_quantity = 'الحد الأقصى لا يقل عن الحد الأدنى للطلب.';
  }

  // The server's own window: `inspection_window_hours` is an integer 1..168.
  if (context.mode === 'edit' && trimmed(values.inspectionWindowHours)) {
    const hours = Number(values.inspectionWindowHours);
    if (!(hours >= 1 && hours <= 168)) {
      problems.inspection_window_hours = 'مهلة الفحص بين ساعة واحدة و168 ساعة.';
    }
  }
  // `expires_at` is `after:now`: a listing whose market life already ended is not
  // a listing the platform would publish, and the seller should not have to be
  // told that by a response.
  if (context.mode === 'edit' && trimmed(values.expiresAt) && Number.isNaN(Date.parse(values.expiresAt))) {
    problems.expires_at = 'تاريخ غير مقروء؛ اختر يومًا من التقويم.';
  } else if (context.mode === 'edit' && trimmed(values.expiresAt) && Date.parse(values.expiresAt) <= Date.now()) {
    problems.expires_at = 'نهاية صلاحية العرض في السوق يجب أن تكون يوماً قادماً.';
  }

  return problems;
}

/**
 * The fields `OfferController` may answer for, so a server message lands under its box.
 *
 * Both listing forms keep the same list: a create and an edit differ in which fields
 * they *show*, not in which ones the server can refuse, and a rejection that arrives
 * for a field the form does not render is a rejection nobody reads.
 */
export const OFFER_WRITABLE_FIELDS = [
  'warehouse_id',
  'product_variant_id',
  'category_id',
  'title_ar',
  'title_en',
  'description_ar',
  'opportunity_reason',
  'opportunity_reason_notes',
  'min_order_quantity',
  'max_order_quantity',
  'total_quantity',
  'unit',
  'unit_price',
  'currency_code',
  'production_date',
  'expiry_date',
  'storage_condition',
  'delivery_terms',
  'inspection_window_hours',
  'expires_at',
] as const;

/**
 * A listing form's field notes, taken from the server's answer.
 *
 * Laravel reports a rejection as `{ field: [messages] }` under `error.details`, and
 * only the first message per field is shown: three clauses on one input produce
 * three sentences about the same box, and the seller reads the complaint, not the
 * list. Fields this response says nothing about keep whatever the form's own check
 * already decided.
 */
export function offerWriteProblems(result: ApiResult<unknown>): OfferProblems {
  const problems: OfferProblems = {};
  for (const field of OFFER_WRITABLE_FIELDS) {
    const message = fieldError(result, field);
    if (message) problems[field] = message;
  }
  return problems;
}

/**
 * What `POST /marketplace/offers` is sent.
 *
 * Optional text fields stay *absent* when blank rather than null: this route creates
 * the row, and a key that is present but empty is validated, while a key that is
 * absent is not. Blank means "the seller said nothing", so nothing is said.
 */
export function createOfferPayload(values: OfferFormValues): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    product_variant_id: Number(values.productVariantId),
    warehouse_id: Number(values.warehouseId),
    title_ar: trimmed(values.titleAr),
    opportunity_reason: trimmed(values.opportunityReason),
    total_quantity: Number(values.totalQuantity),
    min_order_quantity: Number(values.minOrderQuantity),
    unit: trimmed(values.unit),
    unit_price: Number(values.unitPrice),
    delivery_terms: values.deliveryTerms,
    as_draft: values.asDraft ?? false,
    show_seller_identity: values.showSellerIdentity,
  };
  if (trimmed(values.descriptionAr)) payload.description_ar = trimmed(values.descriptionAr);
  if (trimmed(values.maxOrderQuantity)) payload.max_order_quantity = Number(values.maxOrderQuantity);
  if (trimmed(values.reasonNotes)) payload.opportunity_reason_notes = trimmed(values.reasonNotes);
  if (trimmed(values.productionDate)) payload.production_date = values.productionDate;
  if (trimmed(values.expiryDate)) payload.expiry_date = values.expiryDate;
  if (trimmed(values.storageCondition)) payload.storage_condition = trimmed(values.storageCondition);
  return payload;
}

/**
 * What `PUT /marketplace/offers/{id}` is sent.
 *
 * The opposite convention, on purpose: this route *replaces*, so an optional field
 * has to arrive as `null` to be cleared. A blank ceiling box means "no ceiling", and
 * leaving the key out would keep the stored one — the seller's edit would appear to
 * undo itself. `total_quantity` is the exception: while stock is committed the route
 * will not move it, and the form shows the number rather than letting it be typed.
 */
export function updateOfferPayload(
  values: OfferFormValues,
  context: { quantityLocked: boolean }
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title_ar: trimmed(values.titleAr),
    description_ar: trimmed(values.descriptionAr) || null,
    opportunity_reason: trimmed(values.opportunityReason),
    opportunity_reason_notes: trimmed(values.reasonNotes) || null,
    min_order_quantity: Number(values.minOrderQuantity),
    unit: trimmed(values.unit),
    unit_price: Number(values.unitPrice),
    production_date: trimmed(values.productionDate) || null,
    expiry_date: trimmed(values.expiryDate) || null,
    storage_condition: trimmed(values.storageCondition) || null,
    delivery_terms: values.deliveryTerms,
    inspection_window_hours: trimmed(values.inspectionWindowHours) ? Number(values.inspectionWindowHours) : null,
    expires_at: trimmed(values.expiresAt) || null,
    show_seller_identity: values.showSellerIdentity,
    max_order_quantity: trimmed(values.maxOrderQuantity) ? Number(values.maxOrderQuantity) : null,
  };
  if (!context.quantityLocked) payload.total_quantity = Number(values.totalQuantity);
  return payload;
}

/**
 * Stock this listing has already promised: held by a reservation or gone in a deal.
 *
 * `available_quantity` is the only quantity HASSAL counts down, and the total on the
 * card is what the seller once declared. Once anything is committed, rewriting the
 * declared total underneath those rows would make the arithmetic on the shelf lie,
 * which is why the server refuses it and why the form shows the number instead.
 */
export function committedQuantity(offer: Offer): number {
  return Number(offer.reserved_quantity ?? 0) + Number(offer.sold_quantity ?? 0);
}

export function quantityIsLocked(offer: Offer): boolean {
  return committedQuantity(offer) > 0;
}

/**
 * The quantity the listing was declared with.
 *
 * `total_quantity` is the seller's own declaration and the endpoints that compute a
 * shelf's remainder do not all send it; where it is absent or zero, the three parts
 * are the total by definition, because nothing leaves `available_quantity` except by
 * being reserved or sold.
 */
export function declaredQuantity(offer: Offer): number {
  const total = Number(offer.total_quantity);
  if (total > 0) return total;
  return Number(offer.available_quantity ?? 0) + Number(offer.reserved_quantity ?? 0) + Number(offer.sold_quantity ?? 0);
}

/**
 * The share still on the shelf, as a whole percentage for a bar.
 *
 * Zero when nothing was ever declared: a bar that pretends a `0 / 0` listing is
 * fully stocked is the one lie a stock indicator can tell.
 */
export function availableSharePercent(offer: Offer): number {
  const total = declaredQuantity(offer);
  if (total <= 0) return 0;
  return (Number(offer.available_quantity ?? 0) / total) * 100;
}

/**
 * Decimal strings from MySQL, as numbers.
 *
 * Every list endpoint hands quantities and prices back as strings so no precision is
 * lost in transit; a screen that adds them gets concatenation instead. Coercing once,
 * when the response is read, is the only place that has to know — a component that
 * re-reads the raw string is a component that formats `0.010000` at the seller.
 *
 * Quantities that always exist fall back to `0`; the nullable ones keep `null`, because
 * "the platform has no distance for this listing" and "it is 0 km away" are different
 * facts and must not collapse into one.
 */
export function normalizeOffer(offer: Offer): Offer {
  const normalized = { ...offer } as Offer & Record<string, unknown>;

  const requiredNumbers = [
    'total_quantity',
    'available_quantity',
    'reserved_quantity',
    'sold_quantity',
    'min_order_quantity',
    'unit_price',
  ] as const;
  requiredNumbers.forEach((field) => {
    normalized[field] = Number(normalized[field] ?? 0);
  });

  const optionalNumbers = [
    'max_order_quantity',
    'inspection_window_hours',
    'seller_rating',
    'category_id',
    'brand_id',
    'product_id',
    'warehouse_lat',
    'warehouse_lon',
    'distance_km',
    'likes_count',
    'comments_count',
  ] as const;
  optionalNumbers.forEach((field) => {
    const value = normalized[field];
    if (value !== null && value !== undefined) normalized[field] = Number(value);
  });

  return normalized;
}

/**
 * What the market's own refusals ask of a seller.
 *
 * The gateway prefixes every code it owns with a sentence anyone can read; these are
 * the codes a listing raises, restated as the next step rather than the fact. A
 * seller told "المسودات فقط يمكن تقديمها للنشر" already knows what happened — what they
 * need is to be pointed at the row that is not a draft.
 *
 * `PERMISSION_DENIED`, `FEATURE_DISABLED`, `TENANT_REQUIRED` and `CURRENCY_NOT_ACTIVE`
 * are deliberately absent: those belong to the platform and are explained once in
 * `core/api/refusal`.
 */
export const OFFER_REFUSAL_CODES: Record<string, RefusalCodeText> = {
  UNAUTHORIZED_OFFER_ACTION: 'رُفض الإجراء: هذا التصرف يتطلب صلاحية لا يملكها حسابك ضمن منشأتك.',
  INVALID_OFFER_TRANSITION: (serverMessage) => `مسار العرض لا يسمح بهذه الحالة: ${serverMessage}`,
  OFFER_NOT_DRAFT: 'الرفع للمراجعة يكون من مسودة؛ هذه المسودة رُفعت أو نُشرت بالفعل.',
  OFFER_HAS_NO_STOCK: 'لا يُرفع إلى السوق عرضٌ بكمية متاحة صفر — التزود عرضٌ جديد.',
  OFFER_NOT_DELETABLE: 'الحذف للمسودات فقط. العرض الذي رآه السوق يُسحب ويبقى أثره في السجل.',
  WAREHOUSE_NOT_OWNED: 'المستودع المختار ليس ضمن مستودعات منشأتك؛ اختر واحداً من القائمة.',
  VARIANT_NOT_OWNED: 'الصنف المختار ليس من أصناف منشأتك؛ اختر واحداً من الكتالوج.',
  STATE_TRANSITION_FAILED: (serverMessage) => `لم تقبل المنصة هذا التغيير: ${serverMessage}`,
};

/**
 * A blank listing form.
 *
 * Exported rather than written inside the sheet, because the set of keys *is* the
 * form's shape: a field added to the payload and not to this object would read as
 * `undefined` in a controlled input, and React would silently turn the box into an
 * uncontrolled one.
 */
export function emptyOfferFormValues(): OfferFormValues {
  return {
    titleAr: '',
    descriptionAr: '',
    opportunityReason: '',
    reasonNotes: '',
    unit: '',
    unitPrice: '',
    minOrderQuantity: '',
    maxOrderQuantity: '',
    totalQuantity: '',
    deliveryTerms: 'BOTH',
    showSellerIdentity: true,
    asDraft: false,
    productVariantId: '',
    warehouseId: '',
    inspectionWindowHours: '',
    expiresAt: '',
    productionDate: '',
    expiryDate: '',
    storageCondition: '',
  };
}

/**
 * The stored listing, as the edit form wants it.
 *
 * Dates are cut to `YYYY-MM-DD` because a `date` input reads nothing else — a
 * timestamp in its `value` renders an empty box, and a seller who saves without
 * noticing would clear a date the platform still holds. An absent optional answer
 * stays an empty box, which the payload turns back into `null`.
 */
export function offerFormDefaults(offer: Offer): OfferFormValues {
  const day = (value: string | null | undefined): string => (value ? String(value).slice(0, 10) : '');
  const text = (value: string | number | null | undefined): string =>
    value === null || value === undefined ? '' : String(value);

  return {
    titleAr: offer.title_ar ?? '',
    descriptionAr: offer.description_ar ?? '',
    opportunityReason: String(offer.opportunity_reason ?? ''),
    reasonNotes: offer.opportunity_reason_notes ?? '',
    unit: offer.unit ?? '',
    unitPrice: text(offer.unit_price),
    minOrderQuantity: text(offer.min_order_quantity),
    maxOrderQuantity: text(offer.max_order_quantity),
    totalQuantity: text(offer.total_quantity),
    deliveryTerms: asDeliveryTerms(offer.delivery_terms),
    showSellerIdentity: offer.show_seller_identity !== false,
    inspectionWindowHours: text(offer.inspection_window_hours),
    expiresAt: day(offer.expires_at),
    productionDate: day(offer.production_date),
    expiryDate: day(offer.expiry_date),
    storageCondition: offer.storage_condition ?? '',
  };
}

/**
 * Which server field each form key answers for.
 *
 * The two listing forms share this map: a note the server put on `unit_price` has to
 * clear when the seller retypes the price, and a form that guesses at the pairing
 * leaves a red sentence under a field that is already correct.
 */
export const OFFER_FORM_FIELDS: Partial<Record<keyof OfferFormValues, string>> = {
  titleAr: 'title_ar',
  descriptionAr: 'description_ar',
  opportunityReason: 'opportunity_reason',
  reasonNotes: 'opportunity_reason_notes',
  unit: 'unit',
  unitPrice: 'unit_price',
  minOrderQuantity: 'min_order_quantity',
  maxOrderQuantity: 'max_order_quantity',
  totalQuantity: 'total_quantity',
  productVariantId: 'product_variant_id',
  warehouseId: 'warehouse_id',
  productionDate: 'production_date',
  expiryDate: 'expiry_date',
  storageCondition: 'storage_condition',
  inspectionWindowHours: 'inspection_window_hours',
  expiresAt: 'expires_at',
};

/** The notes that survive an edit to one field: everything except that field's own. */
export function withFieldCleared(problems: OfferProblems, key: keyof OfferFormValues): OfferProblems {
  const name = OFFER_FORM_FIELDS[key];
  if (!name || !(name in problems)) return problems;
  const rest = { ...problems };
  delete rest[name];
  return rest;
}
