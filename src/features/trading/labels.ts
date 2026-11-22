/**
 * The trading feature's vocabulary, in both of the product's languages.
 *
 * These tables are the words that go with `deal-machine.ts` and
 * `purchase-request.ts`, not a second copy of their rules: nothing here decides
 * whether a state exists or whether a counter-offer is legal, only what it is
 * called. They are apart from the screens because three of them — the pipeline,
 * the disputes desk and the ledger — name the same state, and a person moving
 * between those screens should not meet «مكتملة» in one and «منتهية» in the other.
 *
 * The state names follow the server's vocabulary exactly, which now means twelve
 * names instead of sixteen: `PENDING_PAYMENT`, `ESCROW_FUNDED`, `SETTLED` and
 * `REFUNDED` were deleted from the machine rather than hidden here, because HASSAL
 * never holds the price of a trade. A state that cannot be reached must not have a
 * label waiting for it — that is how a buyer ends up being told «مسددة» about money
 * the platform has never seen.
 */
import type { Locale } from '@/core/i18n';
import type { ProposalProblem } from './purchase-request';
import type { DealStatus, PurchaseRequestStatus } from './types';

const STATUS_AR: Record<DealStatus, string> = {
  DRAFT: 'مسودة',
  PENDING_SELLER_APPROVAL: 'بانتظار موافقة البائع',
  ACCEPTED: 'قبلها البائع',
  PROCESSING: 'قيد التجهيز',
  READY_FOR_PICKUP: 'جاهزة للاستلام',
  DISPATCHED: 'تم الشحن',
  DELIVERED: 'تم التسليم',
  INSPECTION: 'داخل مهلة الفحص',
  COMPLETED: 'مكتملة',
  CANCELLED: 'ملغاة',
  DISPUTED: 'متنازَع عليها',
  RESOLVED: 'تم حل النزاع',
};

const STATUS_EN: Record<DealStatus, string> = {
  DRAFT: 'Draft',
  PENDING_SELLER_APPROVAL: 'Awaiting seller approval',
  ACCEPTED: 'Accepted by the seller',
  PROCESSING: 'Preparing',
  READY_FOR_PICKUP: 'Ready for pickup',
  DISPATCHED: 'Dispatched',
  DELIVERED: 'Delivered',
  INSPECTION: 'In inspection window',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  DISPUTED: 'Disputed',
  RESOLVED: 'Dispute resolved',
};

/** The name of a state as the reader's locale asks for it. */
export function dealStatusLabel(status: DealStatus, locale: Locale): string {
  return (locale === 'ar' ? STATUS_AR : STATUS_EN)[status] ?? status;
}

/**
 * The moves the pipeline offers, in the words of the party who makes them.
 *
 * `RESOLVED` is deliberately absent: a dispute ruling belongs to the platform and
 * is made on the disputes screen, where the ruling and the reason go together.
 */
const ACTION_LABELS: Record<string, { ar: string; en: string }> = {
  ACCEPTED: { ar: 'قبول الصفقة', en: 'Accept deal' },
  PROCESSING: { ar: 'بدء التجهيز', en: 'Start preparing' },
  READY_FOR_PICKUP: { ar: 'جاهزة للاستلام', en: 'Ready for pickup' },
  DISPATCHED: { ar: 'تم الشحن', en: 'Mark dispatched' },
  DELIVERED: { ar: 'تأكيد التسليم', en: 'Confirm delivery' },
  INSPECTION: { ar: 'بدء الفحص بعد المسح', en: 'Open inspection after the scan' },
  COMPLETED: { ar: 'استُلمت وأُغلقت', en: 'Received and closed' },
  CANCELLED: { ar: 'إلغاء', en: 'Cancel' },
  DISPUTED: { ar: 'فتح نزاع', en: 'Open dispute' },
};

/** A button's own wording, or the state's name when no button has one yet. */
export function dealActionLabel(target: DealStatus, locale: Locale): string {
  return ACTION_LABELS[target]?.[locale] ?? dealStatusLabel(target, locale);
}

/**
 * A purchase request's status, said as the whole sentence it is.
 *
 * The chip is the only place a buyer learns that «بانتظار قرار البائع» means no
 * stock is held yet — the difference between an ask and a reservation, which is the
 * difference between ordering twice and ordering once.
 */
const REQUEST_STATUS_CHIP: Record<PurchaseRequestStatus, { ar: string; en: string; style: string }> = {
  REQUESTED: {
    ar: 'بانتظار قرار البائع — لا حجز بعد',
    en: 'Awaiting the seller — nothing held yet',
    style: 'bg-amber-100 text-amber-800',
  },
  PROPOSED: {
    ar: 'البائع اقترح شروطاً — بانتظار المشتري',
    en: 'Seller countered — awaiting the buyer',
    style: 'bg-blue-100 text-blue-800',
  },
  ACCEPTED: {
    ar: 'مقبول: الكمية محجوزة',
    en: 'Accepted: the quantity is held',
    style: 'bg-emerald-100 text-emerald-800',
  },
  REJECTED: { ar: 'مرفوض', en: 'Declined', style: 'bg-rose-100 text-rose-800' },
  CANCELLED: { ar: 'مسحوب', en: 'Withdrawn', style: 'bg-slate-100 text-slate-600' },
};

/** Neutral colours for a status this build has never been told about. */
const UNKNOWN_CHIP_STYLE = 'bg-slate-100 text-slate-600';

/** The label and the tone for one request, or its raw status if the server sent a new one. */
export function requestStatusChip(status: PurchaseRequestStatus, locale: Locale): { label: string; style: string } {
  const chip = REQUEST_STATUS_CHIP[status];
  return { label: chip ? chip[locale] : status, style: chip?.style ?? UNKNOWN_CHIP_STYLE };
}

/**
 * Why a counter-offer cannot be sent, in the words `purchase-request.ts` decides
 * it cannot.
 *
 * The rule and its sentence live apart for the same reason every rule here does:
 * the marketplace asks the same question of the same form, and it must refuse it
 * with the same words.
 */
export function proposalProblemLabel(problem: ProposalProblem, locale: Locale): string {
  if (problem === 'NOTHING_CHANGED') {
    return locale === 'ar'
      ? 'اكتب الكمية أو السعر المقترح؛ اقتراحٌ لا يغيّر شيئاً سيرفضه الخادم.'
      : 'Give a quantity or a price. A proposal that changes nothing will be refused.';
  }
  if (problem === 'QUANTITY_TOO_SMALL') {
    return locale === 'ar' ? 'الكمية المقترحة يجب أن تكون أكبر من صفر.' : 'The proposed quantity must be above zero.';
  }
  return locale === 'ar' ? 'السعر المقترح يجب أن يكون أكبر من صفر.' : 'The proposed price must be above zero.';
}
