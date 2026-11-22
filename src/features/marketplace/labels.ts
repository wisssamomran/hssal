import { localizedField, type Locale } from '@/core/i18n';
import type { OrganizationStatus } from '@/features/organizations/types';
import type { Offer, OfferSortIntent, OfferStatus } from './types';

/**
 * The market's words: what a listing's state, its seller and its name are called.
 *
 * Nothing here decides a rule — the server does — but every screen that shows a
 * listing has to put Arabic under a code, and three screens each holding their own
 * table is three tables that drift. The cards, the shelf and the promoted strip all
 * read from this file, so the same `verified` reads the same everywhere a buyer
 * meets it.
 */

/**
 * The market's own words for a listing's state.
 *
 * Statuses travel from the server in uppercase and must stay recognizable in
 * that form — a seller who phones support reads the code off the API contract.
 * The Arabic here explains what each state *means for them*: who acts next, and
 * whether the listing can still change. `PENDING_REVIEW` is the one that has to
 * say plainly that the decision left the seller's hands, because a form that
 * still shows a "publish" button there promises an action no route will take.
 */
export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  DRAFT: 'مسودة لم تُرفع بعد',
  PENDING_REVIEW: 'بانتظار مراجعة المنصة',
  ACTIVE: 'معروض في السوق',
  PAUSED: 'موقوف مؤقتاً',
  SOLD_OUT: 'نفدت الكمية',
  EXPIRED: 'منتهي الصلاحية',
  CANCELLED: 'مسحوب',
};

/**
 * Two statuses share rose on purpose: an expired listing and a withdrawn one
 * are both finished, and telling them apart is the sentence beside the colour,
 * not the colour itself.
 */
export const OFFER_STATUS_STYLES: Record<OfferStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  PENDING_REVIEW: 'bg-amber-100 text-amber-800',
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  PAUSED: 'bg-slate-200 text-slate-700',
  SOLD_OUT: 'bg-sky-100 text-sky-800',
  EXPIRED: 'bg-rose-100 text-rose-800',
  CANCELLED: 'bg-rose-100 text-rose-800',
};

/** A status the server sent that this build does not know stays readable, not blank. */
export function offerStatusLabel(status: OfferStatus | string): string {
  return OFFER_STATUS_LABELS[status as OfferStatus] ?? String(status);
}

export function offerStatusStyle(status: OfferStatus | string): string {
  return OFFER_STATUS_STYLES[status as OfferStatus] ?? 'bg-slate-100 text-slate-700';
}

/**
 * Who brings the stock to whom, as the seller declared it.
 *
 * `BOTH` is a real third answer, not a default: it keeps the buyer's pickup and
 * the seller's delivery open until a purchase request picks one.
 */
export const DELIVERY_TERMS_LABELS: Record<'BUYER_PICKUP' | 'SELLER_DELIVERY' | 'BOTH', string> = {
  BUYER_PICKUP: 'استلام من المستودع',
  SELLER_DELIVERY: 'توصيل من البائع',
  BOTH: 'استلام أو توصيل',
};

export type DeliveryTerms = keyof typeof DELIVERY_TERMS_LABELS;

/** The three accepted values, in the order a seller is asked to read them. */
export const DELIVERY_TERMS: readonly DeliveryTerms[] = ['BUYER_PICKUP', 'SELLER_DELIVERY', 'BOTH'];

export function deliveryTermsLabel(terms: string | null | undefined): string {
  if (!terms) return '—';
  return DELIVERY_TERMS_LABELS[terms as DeliveryTerms] ?? terms;
}

/** Any value the API hands back that is not one of the three is shown unchanged. */
export function asDeliveryTerms(value: unknown): DeliveryTerms {
  return DELIVERY_TERMS.includes(value as DeliveryTerms) ? (value as DeliveryTerms) : 'BOTH';
}

/**
 * What the shelf says after a listing is created.
 *
 * The state is the server's answer, not the seller's intention: saving as a draft
 * and offering at once can both end in `PENDING_REVIEW`, because whether a listing
 * goes straight to market is the platform's `offer.requires_review` setting. A banner
 * that reported only what was asked for would tell a seller their stock was on the
 * market while it sat in a reviewer's queue.
 */
export function offerCreatedNotice(status: OfferStatus | string | null | undefined): string {
  if (!status) return 'أُضيف العرض.';
  const base = `أُضيف العرض وحالته: ${offerStatusLabel(status)}.`;
  if (status === 'PENDING_REVIEW') {
    return `${base} النشر قرار المنصة بعد المراجعة، لا إجراء البائع.`;
  }
  return base;
}

/**
 * The orders a buyer can ask the market to answer in.
 *
 * These are the `sort_by` values `OfferController::index()` accepts, in the order a
 * person reads them: newest first, because a shelf that opens with what arrived
 * today is a shelf a buyer can act on. Sorting itself happens server-side — the
 * client never re-orders a page it was handed, or the row after the last one it saw
 * silently disappears from the list.
 */
export const OFFER_SORT_LABELS: Record<OfferSortIntent, string> = {
  newest: 'الأحدث وصولاً بالمستودعات',
  cheapest: 'الأقل سعراً للوحدة',
  priciest: 'الأعلى سعراً للوحدة',
  expiring: 'الأبعد انتهاءً',
  quantity: 'الأكبر كمية',
  nearest_to_expiry: 'الأقرب انتهاءً',
};

/** An intent the server does not recognise still reaches the buyer as the word it arrived in. */
export function offerSortLabel(intent: OfferSortIntent | string): string {
  return OFFER_SORT_LABELS[intent as OfferSortIntent] ?? String(intent);
}

/**
 * `organizations.status` as the platform records it — a review state, not a
 * government claim. The four values are `Organization::STATUS_*`; an unknown one
 * stays readable rather than turning into a blank badge.
 */
export const SELLER_STATUS_LABELS: Record<string, string> = {
  pending_kyc: 'بيانات المؤسسة قيد مراجعة المنصة',
  verified: 'وثّقتها إدارة المنصة',
  suspended: 'موقوفة من المنصة',
  rejected: 'مرفوضة من المنصة',
};

export const SELLER_STATUS_STYLES: Record<string, string> = {
  pending_kyc: 'bg-amber-50 text-amber-800 border-amber-200',
  verified: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  suspended: 'bg-rose-50 text-rose-800 border-rose-200',
  rejected: 'bg-slate-100 text-slate-700 border-slate-200',
};

export function sellerStatusLabel(status: OrganizationStatus | string | null | undefined): string {
  return SELLER_STATUS_LABELS[status ?? ''] ?? (status || 'حالة غير معروفة');
}

export function sellerStatusStyle(status: OrganizationStatus | string | null | undefined): string {
  return SELLER_STATUS_STYLES[status ?? ''] ?? 'bg-slate-100 text-slate-700 border-slate-200';
}

/**
 * The words a market card puts where a seller's name would be, when the seller
 * asked for it not to appear. `SellerIdentityToggle` quotes this same phrase in the
 * sentence that offers the choice, so the promise and the result read alike.
 */
export const ANONYMOUS_SELLER_LABEL = 'بائع لا يُظهر اسمه';

/**
 * Who is selling, in exactly as many words as the seller allowed.
 *
 * A blank here has two entirely different causes and the buyer must not be left
 * to guess between them: the business chose to hide its name on this listing, or
 * the platform never recorded one. Only the first is a decision somebody made,
 * so only the first is described as one — `hidden` is that difference, and the
 * cards set their text italic on it.
 */
export function sellerLabel(offer: Offer, locale: Locale): { text: string; hidden: boolean } {
  const name = (locale === 'en'
    ? offer.seller_name_en || offer.seller_name_ar
    : offer.seller_name_ar || offer.seller_name_en)?.trim();

  if (name) return { text: name, hidden: false };
  if (offer.show_seller_identity === false) {
    return { text: locale === 'en' ? 'Seller who withholds their name' : ANONYMOUS_SELLER_LABEL, hidden: true };
  }
  return { text: locale === 'en' ? 'Not recorded' : 'لم يُسجَّل', hidden: false };
}

/**
 * What a listing is called, in the language the visitor is reading.
 *
 * Sellers write in whichever language they work in, and the API keeps both name
 * columns with either one null — an offer can have an Arabic product name and no
 * English one. Reading only `product_name_ar` shows an English reader a card
 * whose title they may not be able to check, and reading only `_en` shows them
 * nothing at all where the row does hold a name. So: prefer the language on
 * screen, fall back to the other, and fall back to the offer's own title.
 */
export function offerDisplayName(offer: Offer, locale: Locale): string {
  return localizedField(offer, 'product_name', locale) || localizedField(offer, 'title', locale);
}
