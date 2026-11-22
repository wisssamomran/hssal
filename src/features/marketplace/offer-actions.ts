import type { ApiResult } from '@/core/api/http';
import { deleteOffer, setOfferStatus, submitOffer } from './api';
import type { OfferStatus } from './types';

/**
 * What a seller may still do to a listing, by the state the platform reports it in.
 *
 * This is `OfferLifecycleService::SELLER_TRANSITIONS` in the backend, read rather
 * than reinvented: `ACTIVE → PAUSED|CANCELLED`, `PAUSED → ACTIVE|CANCELLED`,
 * `SOLD_OUT → CANCELLED`, and nothing at all once a listing is `EXPIRED` or
 * `CANCELLED`. Two things the server refuses are worth naming, because they are the
 * ones a seller asks about:
 *
 * - a seller cannot approve their own review. `PENDING_REVIEW → ACTIVE` is missing
 *   from the map on purpose, so this screen shows no "انشر" button there;
 * - only a draft is deletable (`discard()`), because a listing the market has seen
 *   is history, not a scratch note — withdrawing a published one is `CANCELLED`, and
 *   the row stays for the deals and disputes that may still refer to it.
 *
 * The shelf used to decide this with seven `status === '…'` blocks in the middle of
 * its table markup, and they had drifted from the server: a sold-out listing offered
 * nothing, although withdrawing one is allowed. Rules that live beside the markup
 * cannot be checked against the contract; this can.
 */
export type SellerOfferAction = 'EDIT' | 'SUBMIT' | 'DELETE' | 'PAUSE' | 'RESUME' | 'WITHDRAW';

export interface SellerOfferActionSpec {
  /** The words on the button. */
  label: string;
  /** The words printed in the banner once the platform answers, e.g. «إيقاف العرض مؤقتاً»: … */
  recordLabel: string;
  /**
   * The state this action asks for, when the action is a transition.
   * `null` for the two that are not: submitting a draft (the platform decides between
   * review and the market) and deleting a draft (there is no state left to name).
   */
  to: OfferStatus | null;
  /**
   * The note written into the offer's history beside a transition, or `null` to send
   * none. `POST /offers/{id}/status` takes `reason` as optional text, and an audit
   * row that only says the status changed cannot tell a seller's withdrawal from an
   * automated one — so the two acts that end a listing say who ended it.
   */
  reason: string | null;
  /** Why a seller would want to stop here, said once rather than guessed at each row. */
  tone: 'primary' | 'neutral' | 'warn' | 'danger';
}

export const SELLER_OFFER_ACTIONS: Record<SellerOfferAction, SellerOfferActionSpec> = {
  EDIT: { label: 'تعديل', recordLabel: 'تعديل العرض', to: null, reason: null, tone: 'neutral' },
  SUBMIT: { label: 'رفع للمراجعة', recordLabel: 'رفع العرض للمراجعة', to: null, reason: null, tone: 'primary' },
  DELETE: { label: 'حذف المسودة', recordLabel: 'حذف المسودة', to: null, reason: null, tone: 'neutral' },
  PAUSE: { label: 'إيقاف مؤقت', recordLabel: 'إيقاف العرض مؤقتاً', to: 'PAUSED', reason: 'إيقاف من البائع', tone: 'warn' },
  RESUME: { label: 'استئناف', recordLabel: 'استئناف العرض', to: 'ACTIVE', reason: null, tone: 'primary' },
  WITHDRAW: { label: 'سحب من السوق', recordLabel: 'سحب العرض', to: 'CANCELLED', reason: 'سحب من البائع', tone: 'danger' },
};

const ACTIONS_BY_STATUS: Record<OfferStatus, SellerOfferAction[]> = {
  DRAFT: ['EDIT', 'SUBMIT', 'DELETE'],
  // Withdrawal only: publishing is the reviewer's act, unselling is still the seller's.
  PENDING_REVIEW: ['WITHDRAW'],
  ACTIVE: ['PAUSE', 'WITHDRAW'],
  // `EDIT` sits on DRAFT and PAUSED alone because `OfferWritingService::update()`
  // refuses a change to a listing that is in the market — a card is not rewritten
  // while buyers are reading it.
  PAUSED: ['EDIT', 'RESUME', 'WITHDRAW'],
  SOLD_OUT: ['WITHDRAW'],
  EXPIRED: [],
  CANCELLED: [],
};

/** The buttons a row gets, in the order a seller should read them. */
export function sellerActionsFor(status: OfferStatus): SellerOfferAction[] {
  return ACTIONS_BY_STATUS[status] ?? [];
}

/**
 * Whose turn it is, for the states where the shelf says so instead of only offering
 * a control. An empty action list is never left silent: "no actions" reads like a
 * broken screen, while the sentence beside it reads like a decision the platform made.
 */
export const OFFER_STATUS_HINTS: Partial<Record<OfferStatus, string>> = {
  DRAFT: 'المسودة لا تظهر لأحد. ارفعها للمراجعة أو عدّلها قبل ذلك.',
  PENDING_REVIEW: 'القرار بيد مراجع المنصة.',
  ACTIVE: 'تعديل بيانات العرض متاح بعد إيقافه: لا تُغَيَّر بطاقةٌ وهي في السوق.',
  PAUSED: 'العرض محفوظ ببياناته؛ الاستئناف يعيده إلى السوق كما كان.',
  SOLD_OUT: 'نفدت الكمية: التزويد عرض جديد، والسحب يبقي الأثر في السجل.',
  EXPIRED: 'لا إجراءات: التزويد عرض جديد، والسجل يبقى كما هو.',
  CANCELLED: 'لا إجراءات: التزويد عرض جديد، والسجل يبقى كما هو.',
};

export function offerStatusHint(status: OfferStatus): string | null {
  return OFFER_STATUS_HINTS[status] ?? null;
}

/**
 * The request an action actually sends.
 *
 * Which door each control walks through is a fact about the contract, not about this
 * screen: submitting a draft is `POST /offers/{id}/submit`, deleting one is
 * `DELETE /offers/{id}`, and the three transitions share
 * `POST /offers/{id}/status` with the state and the note from the spec above. It
 * lives here so a shelf that grew a fourth button would find the call already named
 * beside the rule that offered it, instead of writing one inside a click handler.
 *
 * `EDIT` is excluded by name: opening a sheet is not a request, and a control that
 * sends nothing must not be able to reach a function that promises an answer.
 */
export type SellerRequestAction = Exclude<SellerOfferAction, 'EDIT'>;

export function runSellerAction(action: SellerRequestAction, offerId: number): Promise<ApiResult<unknown>> {
  if (action === 'SUBMIT') return submitOffer(offerId);
  if (action === 'DELETE') return deleteOffer(offerId);

  // The three that remain name a target state; the guard keeps that promise in the
  // types rather than in a comment, because EDIT/SUBMIT/DELETE share one spec shape.
  const spec = SELLER_OFFER_ACTIONS[action];
  if (!spec.to) {
    return Promise.resolve({
      success: false,
      error: { code: 'SELLER_ACTION_NOT_A_REQUEST', message: 'هذا الإجراء لا يُرسل إلى الخادم.' },
    } as ApiResult<unknown>);
  }

  return setOfferStatus(offerId, spec.to, spec.reason ?? undefined);
}
