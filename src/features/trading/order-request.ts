import { fieldError } from '@/core/api/http';
import type { ApiResult } from '@/core/api/http';
import type { RefusalCodeText } from '@/core/api/refusal';
import { asDeliveryTerms } from '@/features/marketplace/labels';
import type { DeliveryPreference, Offer } from '@/features/marketplace/types';

/**
 * The rules behind a buyer's ask on a live listing.
 *
 * Nothing here reserves stock. `POST /purchase-requests` records a question, and the
 * seller's answer is what moves `reserved_quantity` — which is why the dialog these
 * rules serve says so on its face: a buyer who believes a tap held the pallet for
 * them will plan around a quantity nobody promised.
 *
 * The limits mirror `PurchaseRequestService::createFromOffer()`, which is the door
 * that actually decides: `requested_quantity` must clear the offer's
 * `min_order_quantity` and not exceed `available_quantity`. Restating them client-side
 * is not a shortcut around that check — the listing may have sold while the dialog sat
 * open — it is the difference between a person learning the number was impossible
 * before they send it and learning it from a refusal afterwards. The refusal stays
 * wired in regardless, and this module reads it.
 */

/** The quantity a listing may be asked for, and the arithmetic around it. */
export interface AskLimits {
  /** `min_order_quantity`: the smallest line this seller opens. */
  floor: number;
  /** What is on the shelf now; `0` means the row declared nothing. */
  ceiling: number;
  unitPrice: number;
  /** One tap of ±, wide enough that a pallet is not reached one box at a time. */
  step: number;
}

/**
 * The listing's numbers, as figures.
 *
 * Quantities arrive from MySQL as decimal strings, and a string in an arithmetic
 * comparison is a silent bug: `"20" > 5` is true by accident and `"20" + 5` is
 * `"205"`. Everything on this screen goes through `Number()` here, once.
 */
export function askLimits(offer: Offer): AskLimits {
  const floor = Number(offer.min_order_quantity) || 0;
  return {
    floor,
    ceiling: Number(offer.available_quantity) || 0,
    unitPrice: Number(offer.unit_price) || 0,
    // A listing whose minimum is a handful of units steps by that minimum; anything
    // larger steps by ten, so a five-cartone MOQ is not typed one tap at a time.
    step: floor > 0 && floor < 10 ? Math.max(1, Math.round(floor)) : 10,
  };
}

/** The opening quantity: the smallest ask the seller would accept, not an arbitrary one. */
export function initialAskQuantity(offer: Offer): number {
  const { floor } = askLimits(offer);
  return floor > 0 ? floor : 1;
}

/** One tap of ±, kept inside the range the server would answer for. */
export function steppedAskQuantity(quantity: number, delta: number, limits: AskLimits): number {
  const next = quantity + delta;
  if (next < limits.floor) return limits.floor;
  if (limits.ceiling > 0 && next > limits.ceiling) return limits.ceiling;
  return next;
}

/**
 * Why this quantity cannot be sent, or `null` when it can.
 *
 * `>= floor` is written as a negation's opposite on purpose: a typed `NaN` is neither
 * below the floor nor above the ceiling, and a guard that tested only the two bounds
 * would let a blank box through to a refusal the person cannot connect to their typing.
 */
export function askQuantityProblem(quantity: number, limits: AskLimits, unit: string): string | null {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return 'الكمية رقم أكبر من صفر؛ الخادم لا يقبل طلباً بلا كمية.';
  }
  if (quantity < limits.floor) {
    return `الكمية أقل من الحد الأدنى الذي يفتحه البائع: ${limits.floor} ${unit}.`;
  }
  if (limits.ceiling > 0 && quantity > limits.ceiling) {
    return `الكمية أكثر من المتاح الآن: ${limits.ceiling} ${unit}. المتاح يتغيّر حتى وأنت تكتب، فالعدد يُراجع عند وصول الطلب.`;
  }
  return null;
}

/**
 * Which ways this seller brings the goods, read off the listing's own terms.
 *
 * `delivery_terms` is the seller's declaration on the offer row, not a platform
 * setting: `BUYER_PICKUP` closes the delivery button, `SELLER_DELIVERY` closes the
 * pickup one, and `BOTH` leaves both open. A dialog that offered a third choice would
 * be a buyer asking for something no route will accept.
 *
 * The value goes through `asDeliveryTerms` rather than being compared here, for the
 * same reason the card's label does: a term the build does not recognise is read as
 * `BOTH`, the column's own default. Comparing in two places is how the ask sheet
 * ended up closing both halves on a listing whose terms were unreadable — a dialog
 * with no delivery answer and a send button that still worked.
 */
export function deliveryChoicesFor(terms: string | null | undefined): { pickup: boolean; delivery: boolean } {
  const value = asDeliveryTerms(terms);
  return { pickup: value !== 'SELLER_DELIVERY', delivery: value !== 'BUYER_PICKUP' };
}

/** The opening choice: whichever half of the terms the seller actually left open. */
export function initialDeliveryPreference(terms: string | null | undefined): DeliveryPreference {
  const { pickup, delivery } = deliveryChoicesFor(terms);
  if (pickup) return 'PICKUP';
  return delivery ? 'DELIVERY' : 'PICKUP';
}

/** What the dialog holds while the buyer fills it in. */
export interface AskFormValues {
  quantity: number;
  preference: DeliveryPreference;
  notes: string;
}

/**
 * The body of `POST /purchase-requests`.
 *
 * Notes travel only when there is something in them: the column is nullable, and an
 * empty string is a different record from no record. The 500 characters the column
 * holds are enforced by the field itself, so the text never arrives truncated.
 */
export function askPayload(offerId: number, values: AskFormValues): {
  offer_id: number;
  requested_quantity: number;
  delivery_preference: DeliveryPreference;
  notes?: string;
} {
  const notes = values.notes.trim();
  return {
    offer_id: offerId,
    requested_quantity: values.quantity,
    delivery_preference: values.preference,
    ...(notes ? { notes } : {}),
  };
}

/**
 * What the ask's refusals mean.
 *
 * Only codes `createFromOffer()` and its controller raise; the platform-wide ones —
 * `TENANT_REQUIRED` for a session with no active business, `PERMISSION_DENIED`,
 * `FEATURE_DISABLED` — are explained once in `core/api/refusal` and deliberately not
 * repeated here. `ORGANIZATION_NOT_VERIFIED` is absent too: it arrives carrying its
 * own checklist, which is worth more than a paraphrase, so the dialog shows the items.
 */
export const ORDER_REFUSAL_CODES: Record<string, RefusalCodeText> = {
  SELF_PURCHASE_FORBIDDEN: 'لا تُرفع طلبات الشراء على عروض منشأتك؛ العرض الذي تبيعه يصله المشترون من بطاقته.',
  OFFER_NOT_TRADABLE: 'لم يعد هذا العرض في السوق الآن: سحبه البائع أو انتهى تاريخه. أعد تحميل قائمة العروض.',
  SELLER_NOT_TRADING: 'البائع المصدِر لهذا العرض موقوف عن التداول من المنصة، فلا يُحال إليه طلب.',
  QUANTITY_EXCEEEDS_AVAILABLE: (serverMessage) => `الكمية أكثر من المتاح: ${serverMessage}`,
  QUANTITY_BELOW_MIN_ORDER: (serverMessage) => `الكمية تحت الحد الأدنى لهذا البائع: ${serverMessage}`,
};

/** The fields the store route validates, so a rejection lands under the box it answers for. */
export function askFieldProblems(result: ApiResult<unknown>): Record<string, string> {
  const problems: Record<string, string> = {};
  for (const field of ['requested_quantity', 'delivery_preference', 'notes']) {
    const message = fieldError(result, field);
    if (message) problems[field] = message;
  }
  return problems;
}
