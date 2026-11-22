/**
 * A number from the API, or zero. Laravel sends decimals as strings, and a screen
 * that adds them gets `NaN` — the reading lives in `core/config` for the whole app.
 */
import { activeCurrencies, baseCurrency, configuredCity, num } from '@/core/config';
import type { RefusalCodeText } from '@/core/api/refusal';
import { fieldError } from '@/core/api/http';
import type { ApiResult } from '@/core/api/http';
import type { Locale } from '@/core/i18n';
import type { Demand, DemandMatch, DemandStatus, MatchStatus, Quotation } from './types';

/**
 * The rules around a buyer's request for quotation, and the words that go with them.
 *
 * Three screens meet these objects — the demand board, the seller's quotation form
 * and the buyer's match panel — and until now each carried its own copy of the
 * status tables and its own reading of a refusal code. That is how one state ended
 * up named «مغلق» on a card and «منتهي» on another, and how a demand that the
 * server had plainly closed was described to the seller as a bad price.
 *
 * What is decided here, and what is not:
 *
 * - **Vocabulary.** The five `Demand::STATUS_*`, four `DemandMatch::STATUS_*` and
 *   four `Quotation::STATUS_*` values are listed in `backend/app/Marketplace/Models`;
 *   a code that does not appear there has no label here, because a state nobody can
 *   reach needs no sentence waiting for it.
 * - **Freshness.** `demandWindowClosed()` and `matchIsActionable()` are the client's
 *   reading of two timestamps. They only ever hide a button; `QuotationSubmissionService::
 *   assertQuotable()` and `PurchaseRequestService::createFromMatch()` decide whether the
 *   write happens, and their refusals are still shown. A clock on the buyer's laptop is
 *   not an authority.
 * - **Limits.** The field rules restate `$request->validate()` in
 *   `DemandController::store()` and `::submitQuotation()` — the same `min:` and `max:`
 *   clauses, so a person learns the number was impossible before it is sent rather
 *   than from a response.
 *
 * Nothing here reserves stock, accepts a quotation, or moves a demand's status. No
 * route does any of those: `ACCEPTED` is written by the platform's own conversion,
 * and a button that claimed to accept a quote would be a switch wired to nothing.
 */

/* ──────────────────────────── the board's vocabulary ──────────────────────── */

/**
 * A demand's five states. The label names who acts next, because a buyer looking at
 * `QUOTED` needs to know the ball is in their court, and a seller looking at
 * `ACCEPTED` needs to know the argument is over.
 */
export const DEMAND_STATUS_LABELS: Record<DemandStatus, string> = {
  OPEN: 'مفتوح لاستقبال العروض',
  QUOTED: 'وردت عليه عروض سعرية',
  ACCEPTED: 'قُبل عرض وتم تحويله',
  CLOSED: 'مغلق',
  EXPIRED: 'منتهي الصلاحية',
};

/**
 * `EXPIRED` is amber rather than rose: a window that ran out is not a failure the
 * buyer caused, and the board is read by sellers who decide whether to answer.
 */
export const DEMAND_STATUS_STYLES: Record<DemandStatus, string> = {
  OPEN: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  QUOTED: 'bg-sky-50 text-sky-800 border-sky-200',
  ACCEPTED: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  CLOSED: 'bg-slate-100 text-slate-700 border-slate-200',
  EXPIRED: 'bg-amber-50 text-amber-800 border-amber-200',
};

/** A status the server invented after this build was written stays readable. */
export function demandStatusLabel(status: DemandStatus | string): string {
  return DEMAND_STATUS_LABELS[status as DemandStatus] ?? String(status);
}

export function demandStatusStyle(status: DemandStatus | string): string {
  return DEMAND_STATUS_STYLES[status as DemandStatus] ?? 'bg-slate-50 text-slate-700 border-slate-200';
}

/**
 * A match's four states, in the engine's words.
 *
 * `INVALIDATED` says *why* it fell through: the listing behind it left the market,
 * so the buyer is not chasing a number the engine made up.
 */
export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  ACTIVE: 'مطابقة سارية',
  USED: 'استُخدمت في طلب شراء',
  EXPIRED: 'انتهت مدة المطابقة',
  INVALIDATED: 'سقطت لأن العرض لم يعد في السوق',
};

export function matchStatusLabel(status: MatchStatus | string): string {
  return MATCH_STATUS_LABELS[status as MatchStatus] ?? String(status);
}

/**
 * A quotation's states as the model declares them.
 *
 * `SUBMITTED` is the only one any route can produce today: `QuotationSubmissionService`
 * stores every quote with it, and no controller moves a quote to `ACCEPTED`,
 * `REJECTED` or `EXPIRED`. The three are listed because the column holds them and a
 * board that blanked an unknown code would hide a state the platform added.
 */
export const QUOTATION_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'مقدَّم ولم يُتخذ فيه إجراء',
  ACCEPTED: 'مقبول',
  REJECTED: 'مرفوض',
  EXPIRED: 'منتهي',
};

export function quotationStatusLabel(status: string | null | undefined): string {
  if (!status) return 'لم تُسجَّل حالة';
  return QUOTATION_STATUS_LABELS[status] ?? status;
}

/**
 * How many quotes came in, in the agreement Arabic asks for.
 *
 * `وردت 2 عروض سعر` is wrong twice: the noun after a dual is the dual itself, and the
 * verb agrees with the count it reports. This line prints on every card on the board,
 * so the four shapes are written out rather than templated — with the server's own
 * reminder attached, because a buyer who sees a count without knowing that nothing in
 * the platform accepts a quote yet will read the number as a queue.
 */
export function quotationsArrived(count: number): string {
  const head =
    count === 1
      ? 'ورد عرض سعر واحد'
      : count === 2
        ? 'ورد عرضا سعر'
        : count >= 3 && count <= 10
          ? `وردت ${count} عروض سعر`
          : `ورد ${count} عرض سعر`;
  return `${head} — تُعرض أدناه كما حفظها الخادم.`;
}

/* ─────────────────────────── the two timestamps ──────────────────────────── */

/**
 * Whether the buyer's stated window for receiving quotes has run out.
 *
 * This is a reader's annotation, nothing more. `assertQuotable()` checks
 * `status !== OPEN` and never looks at `expires_at`, so a demand whose date has
 * passed while its row still says OPEN keeps accepting quotes — and the card must
 * keep offering the form. Hiding it on the reader's clock would be a rule this
 * client invented and the server does not honour.
 *
 * `expires_at` is nullable in the schema and `DemandPublishingService` fills it from
 * `demand.expiry_days` on every publish, so a null here is a row that predates that
 * default: read it as "no deadline recorded", not as "never closes".
 */
export function demandWindowClosed(demand: Demand): boolean {
  if (!demand.expires_at) return false;
  return new Date(String(demand.expires_at)).getTime() < Date.now();
}

/**
 * Whether this pairing is still an opportunity the buyer may raise a request from.
 *
 * `createFromMatch()` checks the same two things — `status !== ACTIVE` and a past
 * `expires_at` — and answers with `MATCH_NOT_ACTIONABLE` or `MATCH_EXPIRED`. This
 * reading hides the form before that round trip; it does not replace it, because a
 * match can expire in the seconds the panel sat open.
 */
export function matchIsActionable(match: DemandMatch): boolean {
  if (match.status !== 'ACTIVE') return false;
  if (!match.expires_at) return true;
  return new Date(String(match.expires_at)).getTime() > Date.now();
}

/**
 * What the board's refusals mean, in the buyer's and the seller's language.
 *
 * Only codes these routes raise. The platform-wide ones — `TENANT_REQUIRED`,
 * `PERMISSION_DENIED`, `FEATURE_DISABLED`, `CURRENCY_NOT_ACTIVE`,
 * `VALIDATION_FAILED` — are explained once in `core/api/refusal` and are deliberately
 * not restated here; repeating them is how the same middleware answer ends up worded
 * three different ways on three screens.
 *
 * `DEMAND_CLOSED` is the one that used to be missing. It arrives as
 * `422` carrying "الطلب مغلق ولا يقبل عروض أسعار جديدة", and the screen that has no
 * entry for it prints the code beside a sentence the seller cannot act on — while the
 * form next to it still says "the price you typed is invalid".
 *
 * Three readings are the server's own words rather than ours. `MATCH_NOT_ACTIONABLE`
 * names the state the row fell into and the two `QUANTITY_*` refusals carry the live
 * available quantity and the live minimum, which are numbers only the request-handling
 * transaction knows; the match panel above them shows what was true when the engine
 * scored the row. Restating those in fixed text would be a second sentence about the
 * same row, and the second one is the one that goes stale.
 */
export const DEMAND_REFUSAL_CODES: Record<string, RefusalCodeText> = {
  DEMAND_ACCESS_DENIED: 'هذا الطلب لمطابقة منشأة أخرى: لا تُعرض مطابقاته ولا طلباته الشرائية على غير صاحبه.',
  MATCH_ACCESS_DENIED: 'هذه المطابقة لطلب منشأة أخرى، فلا يُرفع عنها طلب شراء.',
  DEMAND_CLOSED: 'أُغلق هذا الطلب عند البائع، فلا يُقبل عليه عرض سعر جديد ولو كانت الأرقام صحيحة.',
  SELF_QUOTATION_DENIED: 'لا تُقدَّم عروض سعر على طلبات منشأتك.',
  SELLER_NOT_TRADING: 'البائع المصدِر لهذا العرض موقوف عن التداول من المنصة، فلا يُحال إليه طلب.',
  MATCH_NOT_ACTIONABLE: (serverMessage) => serverMessage,
  MATCH_EXPIRED: 'انتهت مدة هذه المطابقة؛ أعد حساب المطابقات لترى المخزون الحالي.',
  OFFER_NOT_AVAILABLE: 'العرض الذي بنيت عليه هذه المطابقة لم يعد في السوق.',
  QUANTITY_EXCEEEDS_AVAILABLE: (serverMessage) => serverMessage,
  QUANTITY_BELOW_MIN_ORDER: (serverMessage) => serverMessage,
};

/* ─────────────────────────── publishing a demand ─────────────────────────── */

/** A demand form while the buyer is filling it in. Every box is a string: blank and zero differ. */
export interface DemandFormValues {
  titleAr: string;
  titleEn: string;
  description: string;
  specialRequirements: string;
  quantity: string;
  unit: string;
  targetPrice: string;
  currencyCode: string;
  city: string;
  requiredDate: string;
  /** Last day the buyer will take quotes. Blank means the platform's own window. */
  expiresAt: string;
  categoryId: string;
}

/**
 * The board opens on the operator's configured city, and on nothing else.
 *
 * A quantity and a unit are the buyer's requirement, and the server refuses an ask
 * without them — so they are not prefilled with a number someone once typed into a
 * seeder. The city prefill is different: it is one place a business delivers, the
 * platform already knows it, and it is still an editable box rather than a hidden
 * value. Reading it here replaces the effect that used to watch
 * `config.defaultCity` and rewrite the field while the buyer typed in it.
 */
export function emptyDemandForm(): DemandFormValues {
  return {
    titleAr: '',
    titleEn: '',
    description: '',
    specialRequirements: '',
    quantity: '',
    unit: '',
    targetPrice: '',
    currencyCode: '',
    city: configuredCity() ?? '',
    requiredDate: '',
    expiresAt: '',
    categoryId: '',
  };
}

/**
 * Tomorrow, written the way a `type="date"` box expects it.
 *
 * Built from the local calendar parts rather than
 * `new Date(Date.now() + 86400000).toISOString().slice(0, 10)`, which the form this
 * replaced used: `toISOString()` shifts to UTC, so in a +03:00 office tomorrow at
 * midnight prints as *today* at 21:00 the day before — a `min` one day short, which
 * lets a buyer pick a date the route then refuses with `after:today`.
 */
export function dayAfterToday(): string {
  const day = new Date();
  day.setDate(day.getDate() + 1);
  const month = String(day.getMonth() + 1).padStart(2, '0');
  const date = String(day.getDate()).padStart(2, '0');
  return `${day.getFullYear()}-${month}-${date}`;
}

/** Field name → the sentence under that box. */
export type DemandProblems = Record<string, string>;

const text = (value: string | undefined): string => (value ?? '').trim();

/** The date a `type="date"` box holds, or `null` when it is blank or unreadable. */
function dayValue(value: string): number | null {
  const trimmed = text(value);
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * A future day, checked the way the route checks it.
 *
 * `target_delivery_date` is `after:today` and `expires_at` is `after:now`, which are
 * two different tests: a delivery date may be tomorrow morning while a quote window
 * that closes today is already shut by the time the record is written. Each is
 * reported separately rather than through one generic "wrong date".
 *
 * The blank box is not a problem here — every date on this form is optional, and the
 * platform supplies its own window when the buyer says nothing.
 */
function dateProblem(value: string, label: string, fromStartOfTomorrow: boolean): string | null {
  if (!text(value)) return null;
  const parsed = dayValue(value);
  if (parsed === null) return `${label}: تاريخ غير مقروء؛ اختر يومًا من التقويم.`;
  const floor = fromStartOfTomorrow
    ? new Date(new Date().setHours(0, 0, 0, 0)).getTime() + 86400000
    : Date.now();
  if (parsed < floor) return `${label}: يجب أن يكون التاريخ قادماً، فالخادم يرفض ما مضى.`;
  return null;
}

/**
 * Why this ask cannot be sent, field by field.
 *
 * Quantity is tested as `!(n >= 1)` rather than `n < 1`: `Number('')` and `Number('abc')`
 * are `NaN`, and `NaN < 1` is false, so a bound-only guard would wave a blank box
 * through to a refusal the buyer cannot connect to their typing. This is the same
 * reason `offer.ts` writes its tests that way.
 */
export function demandFieldProblems(values: DemandFormValues): DemandProblems {
  const problems: DemandProblems = {};

  if (!text(values.titleAr)) problems.title_ar = 'عنوان الطلب مطلوب.';
  if (!text(values.quantity) || !(Number(values.quantity) >= 1)) {
    problems.target_quantity = 'الكمية المطلوبة رقم لا يقل عن 1.';
  }
  if (!text(values.unit)) problems.unit = 'حدِّد وحدة العدّ (كرتونة، باليت، كيس...).';
  if (!text(values.city)) problems.delivery_city = 'مدينة التسليم مطلوبة؛ لا يُنشر طلب بلا مكان تسليم.';

  if (text(values.targetPrice) && !(Number(values.targetPrice) >= 0.0001)) {
    problems.target_unit_price = 'السعر المستهدف رقم أكبر من صفر إن ذُكر.';
  }

  const delivery = dateProblem(values.requiredDate, 'تاريخ التوريد', true);
  if (delivery) problems.target_delivery_date = delivery;
  const window = dateProblem(values.expiresAt, 'آخر موعد لقبول العروض', false);
  if (window) problems.expires_at = window;

  return problems;
}

/**
 * The fields `DemandController::store()` validates.
 *
 * The list is the server's, not the form's: a field the buyer cannot see still has an
 * input somewhere on this screen, and a rejection that arrives for a box nobody
 * rendered is a rejection nobody reads.
 */
export const DEMAND_WRITABLE_FIELDS = [
  'title_ar',
  'title_en',
  'description',
  'category_id',
  'target_quantity',
  'unit',
  'target_unit_price',
  'currency_code',
  'target_delivery_date',
  'delivery_city',
  'delivery_latitude',
  'delivery_longitude',
  'special_requirements',
  'expires_at',
] as const;

/**
 * Which box each of the route's fields belongs to.
 *
 * The form keys are camelCase and the server's are snake_case, so a rejection has to
 * be translated before it can be printed under the right input — and clearing a problem
 * when the buyer edits that input needs the same translation. Writing it out once keeps
 * `target_quantity` from leaving its message on the quantity box forever.
 */
export const DEMAND_FORM_FIELDS: Partial<Record<keyof DemandFormValues, string>> = {
  titleAr: 'title_ar',
  titleEn: 'title_en',
  description: 'description',
  specialRequirements: 'special_requirements',
  quantity: 'target_quantity',
  unit: 'unit',
  targetPrice: 'target_unit_price',
  currencyCode: 'currency_code',
  city: 'delivery_city',
  requiredDate: 'target_delivery_date',
  expiresAt: 'expires_at',
  categoryId: 'category_id',
};

/** The server's per-field rejections, keyed by the field the buyer typed. */
export function demandWriteProblems(result: ApiResult<unknown>): DemandProblems {
  const problems: DemandProblems = {};
  for (const field of DEMAND_WRITABLE_FIELDS) {
    const message = fieldError(result, field);
    if (message) problems[field] = message;
  }
  return problems;
}

/**
 * The body of `POST /demands`.
 *
 * Optional values are *omitted* when blank rather than sent empty: the route runs
 * `nullable` rules over whatever keys arrive, and `''` is not a date, not a number and
 * not a currency — it is a validation failure the buyer never caused. `delivery_city`
 * and `unit` are trimmed because the server stores them as they arrive.
 *
 * No latitude or longitude is sent. The columns exist and the route accepts them, but
 * this screen has no coordinate to offer: a delivery city is what the buyer promised,
 * and inventing a point beside it would put a false pin on someone else's map.
 */
export interface DemandInput {
  title_ar: string;
  target_quantity: number;
  unit: string;
  delivery_city: string;
  title_en?: string;
  description?: string;
  special_requirements?: string;
  target_unit_price?: number;
  currency_code?: string;
  target_delivery_date?: string;
  expires_at?: string;
  category_id?: number;
}

export function demandPayload(values: DemandFormValues): DemandInput {
  const payload: DemandInput = {
    title_ar: text(values.titleAr),
    target_quantity: Number(values.quantity),
    unit: text(values.unit),
    delivery_city: text(values.city),
  };
  if (text(values.titleEn)) payload.title_en = text(values.titleEn);
  if (text(values.description)) payload.description = text(values.description);
  if (text(values.specialRequirements)) payload.special_requirements = text(values.specialRequirements);
  if (text(values.targetPrice)) payload.target_unit_price = Number(values.targetPrice);
  if (text(values.currencyCode)) payload.currency_code = text(values.currencyCode);
  if (text(values.requiredDate)) payload.target_delivery_date = text(values.requiredDate);
  if (text(values.expiresAt)) payload.expires_at = text(values.expiresAt);
  if (text(values.categoryId)) payload.category_id = Number(values.categoryId);
  return payload;
}

/* ─────────────────────────── the seller's quotation ───────────────────────── */

/** A quote as the seller is writing it. */
export interface QuotationFormValues {
  quantity: string;
  unitPrice: string;
  currencyCode: string;
  validityDays: string;
  notes: string;
}

/**
 * The seller's opening position on a demand.
 *
 * The quantity and the price come prefilled from the buyer's ask because that is the
 * comparison the buyer makes: a quote two digits off the stated target, entered by
 * accident, is a quote that loses before anyone reads its notes. The currency follows
 * the demand — `QuotationSubmissionService` inherits it when the seller says nothing,
 * so naming it here matches what would be stored anyway.
 */
export function quotationDefaults(demand: Demand): QuotationFormValues {
  const target = demand.target_unit_price === null || demand.target_unit_price === undefined
    ? ''
    : String(num(demand.target_unit_price));
  // The demand's own currency first, then the platform's base, then the first active
  // one: the service inherits the demand's code when the seller names none, so naming
  // it here writes down what would be stored anyway instead of hiding it in a default.
  const currency = demand.currency_code || baseCurrency() || activeCurrencies()[0]?.iso_code || '';
  return {
    quantity: String(num(demand.target_quantity)),
    unitPrice: target,
    currencyCode: currency,
    validityDays: '7',
    notes: '',
  };
}

/** `validity_days` is an integer 1..60 at the route; the default sits well inside it. */
export const QUOTATION_VALIDITY_MAX_DAYS = 60;

/** Why this quote cannot be sent yet, field by field. */
export function quotationFieldProblems(values: QuotationFormValues): DemandProblems {
  const problems: DemandProblems = {};

  if (!text(values.quantity) || !(Number(values.quantity) >= 0.01)) {
    problems.quoted_quantity = 'الكمية التي تورّدها رقم أكبر من صفر.';
  }
  if (!text(values.unitPrice) || !(Number(values.unitPrice) >= 0.0001)) {
    problems.unit_price = 'سعر الوحدة رقم أكبر من صفر.';
  }
  if (text(values.validityDays)) {
    const days = Number(values.validityDays);
    // `integer` is part of the route's rule, not a style choice: a 7.5-day quote is a
    // row the buyer cannot read a deadline off.
    if (!Number.isInteger(days) || !(days >= 1 && days <= QUOTATION_VALIDITY_MAX_DAYS)) {
      problems.validity_days = `أيام السريان عدد صحيح بين 1 و${QUOTATION_VALIDITY_MAX_DAYS}.`;
    }
  }
  return problems;
}

/** The fields `submitQuotation()` validates. */
export const QUOTATION_WRITABLE_FIELDS = ['quoted_quantity', 'unit_price', 'currency_code', 'validity_days', 'notes'] as const;

export function quotationWriteProblems(result: ApiResult<unknown>): DemandProblems {
  const problems: DemandProblems = {};
  for (const field of QUOTATION_WRITABLE_FIELDS) {
    const message = fieldError(result, field);
    if (message) problems[field] = message;
  }
  return problems;
}

/**
 * The body of `POST /demands/{id}/quotations`.
 *
 * `total_amount` is absent on purpose: the service computes it from these two numbers
 * and records that, so a client that sent its own rounding would put an arithmetic
 * the platform cannot reproduce on the buyer's comparison table.
 */
export interface QuotationInput {
  quoted_quantity: number;
  unit_price: number;
  currency_code?: string;
  validity_days?: number;
  notes?: string;
}

export function quotationPayload(values: QuotationFormValues): QuotationInput {
  const payload: QuotationInput = {
    quoted_quantity: Number(values.quantity),
    unit_price: Number(values.unitPrice),
  };
  if (text(values.currencyCode)) payload.currency_code = text(values.currencyCode);
  if (text(values.validityDays)) payload.validity_days = Number(values.validityDays);
  if (text(values.notes)) payload.notes = text(values.notes);
  return payload;
}

/* ───────────────────────── a match turned into an ask ─────────────────────── */

/**
 * The two fields `storeFromMatch()` can reject this row for.
 *
 * `delivery_preference` is validated by that route but never sent from here, so a
 * message for it could only arrive from a request this screen did not make — listing
 * it would collect a rejection the buyer has no box to read it under.
 */
export const MATCH_REQUEST_FIELDS = ['requested_quantity', 'notes'] as const;

/**
 * The opening quantity for a request raised from a match.
 *
 * It is the engine's number, not the buyer's guess: `createFromMatch()` takes
 * `requested_quantity ?? $match->requested_quantity`, so leaving this box untouched
 * asks exactly what was matched. The seller's `min_order_quantity` and what is left on
 * the shelf are checked server-side — and re-checked there even after a correct read
 * here, because the listing may have sold while this row sat open.
 */
export function matchAskDefaults(match: DemandMatch): { quantity: string } {
  return { quantity: String(num(match.requested_quantity)) };
}

export function matchRequestWriteProblems(result: ApiResult<unknown>): DemandProblems {
  const problems: DemandProblems = {};
  for (const field of MATCH_REQUEST_FIELDS) {
    const message = fieldError(result, field);
    if (message) problems[field] = message;
  }
  return problems;
}

/** The seller's own minimum: the route answers `min:0.01` for this number. */
export const MATCH_REQUEST_MIN_QUANTITY = 0.01;

/** `notes` is `max:500` on this route, and 500 on the ask-from-a-listing one. */
export const MATCH_REQUEST_NOTES_MAX = 500;

/** Why this ask cannot be sent yet. */
export function matchAskProblems(quantity: string, notes: string): DemandProblems {
  const problems: DemandProblems = {};
  if (!text(quantity) || !(Number(quantity) >= MATCH_REQUEST_MIN_QUANTITY)) {
    problems.requested_quantity = `الكمية المطلوبة رقم أكبر من صفر؛ الخادم لا يقبل طلباً بلا كمية.`;
  }
  if (notes.trim().length > MATCH_REQUEST_NOTES_MAX) {
    problems.notes = `الملاحظة لا تزيد على ${MATCH_REQUEST_NOTES_MAX} حرفاً.`;
  }
  return problems;
}

/**
 * The body of `POST /purchase-requests/matches/{id}`.
 *
 * No `delivery_preference`: the buyer's ask on a live listing chooses it, while a
 * request raised from a match takes the service's default and the seller settles the
 * half of the transaction when they answer. Offering the choice here would be a
 * question this path does not ask.
 */
export interface MatchAskInput {
  requested_quantity: number;
  notes?: string;
}

export function matchRequestPayload(quantity: string, notes: string): MatchAskInput {
  const payload: MatchAskInput = { requested_quantity: Number(quantity) };
  if (text(notes)) payload.notes = text(notes);
  return payload;
}

/* ─────────────────────────────── reading a row ────────────────────────────── */

/**
 * The currencies a price on this board may be stated in.
 *
 * The active list is the platform's, and it is what the seller is allowed to pick.
 * The demand's own code is added when that list no longer holds it: a request that
 * was published in a currency since retired still has to display the number it
 * carries, and a `select` whose value matches no option silently shows something
 * else — the seller would send a different currency than the one they read.
 */
export function currencyChoices(preferred: string | null | undefined): { value: string; label: string }[] {
  const codes = activeCurrencies().map((row) => row.iso_code);
  const code = (preferred || '').toUpperCase();
  if (code && !codes.includes(code)) codes.unshift(code);
  return codes.map((iso) => ({ value: iso, label: iso }));
}

/** The name a demand card shows, in the language the reader is using. */
export function demandTitle(demand: Demand, locale: Locale): string {
  return locale === 'en' ? demand.title_en || demand.title_ar : demand.title_ar;
}

/**
 * Whose demand this is, and whether this card shows the buyer's half or the
 * seller's.
 *
 * The comparison is `Number()`d on both sides because `buyer_organization_id` reaches
 * the client as a JSON number while the active organization arrives as a string, and
 * `'7' === 7` is false. A card that got this wrong showed a seller their own demand
 * under the "present a quotation" button — which the server then refused with
 * `SELF_QUOTATION_DENIED` — and hid the buyer's matches panel behind the same test.
 */
export function demandBelongsTo(demand: Demand, organizationId: number | null | undefined): boolean {
  if (organizationId === null || organizationId === undefined) return false;
  return Number(demand.buyer_organization_id) === Number(organizationId);
}

/**
 * The buyer's business, as the card names it.
 *
 * Either language column can be the only one filled, so the reader's language wins
 * first and the other is the fallback — the same rule `offerDisplayName()` follows for
 * a listing. An organization always has a row; a name nobody entered is reported as
 * that, not as a missing counterparty.
 */
export function buyerBusinessName(demand: Demand, locale: Locale): string {
  const org = demand.buyer_organization;
  if (!org) return locale === 'en' ? 'Registered organization' : 'منشأة مسجَّلة';
  const name = (locale === 'en' ? org.name_en || org.name_ar : org.name_ar || org.name_en)?.trim();
  return name || (locale === 'en' ? 'Registered organization' : 'منشأة مسجَّلة');
}

/**
 * The seller behind a saved quotation.
 *
 * The organization id is always stored — `QuotationSubmissionService` takes it from
 * the tenant context — so a response that did not load the relation is showing a
 * reference, not announcing that no seller was recorded. Saying "لم يُسجَّل" here
 * would tell a buyer that an anonymous bid is sitting on their demand.
 */
export function quotationSellerName(quotation: Quotation): string {
  const org = quotation.seller_organization;
  return org?.name_ar || org?.name_en || `منشأة برقم مرجعي ${quotation.seller_organization_id}`;
}

/** The seller a match points at, as the board puts it. */
export function matchSellerReference(match: DemandMatch): string {
  return `بائع برقم مرجعي ${match.seller_organization_id}`;
}
