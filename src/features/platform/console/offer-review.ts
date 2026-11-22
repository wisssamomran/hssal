import { offerStatusLabel } from '@/features/marketplace/labels';
import { explainRefusal } from '@/core/api/refusal';
import type { RefusalCodeText } from '@/core/api/refusal';
import { fieldError } from '@/core/api/http';
import type { ApiResult } from '@/core/api/http';
import type { Offer, OfferStatus } from '@/features/marketplace/types';

/**
 * The moderation queue's rules, kept out of the panel that draws it.
 *
 * The queue is the smallest screen in the console and the most consequential: one
 * button publishes another business's listing into the matching engine, the other
 * sends it back as a draft. Two judgements belong to a reviewer, not to a component:
 * which states can be asked about, and what a refusal from the lifecycle service
 * means for the row the reviewer is looking at.
 */

/** Statuses `OfferController::index()` will accept for the queue; the server rejects anything else. */
const REVIEWABLE_STATUSES: OfferStatus[] = [
  'PENDING_REVIEW',
  'ACTIVE',
  'PAUSED',
  'SOLD_OUT',
  'EXPIRED',
  'CANCELLED',
  'DRAFT',
];

/**
 * The filter's options, labelled the way the rest of the platform labels a listing.
 *
 * The console used to print `PENDING_REVIEW` in the select while every seller screen
 * said "بانتظار مراجعة المنصة" for the same row. A reviewer who cannot match the words
 * on the two screens starts doubting which row they are deciding on.
 */
export const REVIEW_STATUS_OPTIONS: { value: OfferStatus; label: string }[] = REVIEWABLE_STATUSES.map((status) => ({
  value: status,
  label: offerStatusLabel(status),
}));

/** The decision types `Offer::REVIEW_DECISIONS` holds. */
export type ReviewDecision = 'APPROVE' | 'RETURN';

/**
 * A return with nothing written on it is not a decision, it is a disappearance.
 *
 * `OfferController::review()` validates `required_if:decision,RETURN`, and a seller
 * returned without a sentence has no idea which of their fields to touch — so the
 * console asks before the call rather than after. Approval takes no reason: the
 * server's rule says so, and a required note on a yes would only train reviewers to
 * type filler.
 */
export function reviewReasonProblem(decision: ReviewDecision, reason: string): string | null {
  if (decision !== 'RETURN') return null;
  return reason.trim() ? null : 'الإرجاع يحتاج سببًا؛ بلا سبب لا يعرف البائع ماذا يصلح.';
}

/**
 * The two codes `review()` raises, and what each means to the person holding the row.
 *
 * `OFFER_NOT_AWAITING_REVIEW` is the race: the queue was read minutes ago and the
 * seller has since withdrawn or the platform has since decided. The server's sentence
 * names the current state, so the reading keeps it — the reviewer needs that state, not
 * a paraphrase of it.
 */
const REVIEW_REFUSAL_CODES: Record<string, RefusalCodeText> = {
  OFFER_NOT_AWAITING_REVIEW: (serverMessage) => `${serverMessage} — حدّث القائمة قبل اتخاذ إجراء.`,
  PERMISSION_DENIED: 'قرار النشر صلاحية منصة؛ هذا الحساب لا يملكها.',
};

/**
 * A review refusal read back to the reviewer.
 *
 * Field errors are looked for first, because `reason`/`decision` failures arrive as a
 * validation envelope whose message line is the generic one and whose real answer sits
 * under the field the reviewer just typed into.
 */
export function decisionMessage(result: ApiResult<Offer>): string {
  if (result.error?.code === 'VALIDATION_FAILED' || result.error_code === 'VALIDATION_FAILED') {
    return (
      fieldError(result, 'reason')
      || fieldError(result, 'decision')
      || explainRefusal(result, { fallback: 'رفض الخادم القرار', codes: REVIEW_REFUSAL_CODES })
    );
  }
  return explainRefusal(result, { fallback: 'تعذّر تسجيل القرار', codes: REVIEW_REFUSAL_CODES });
}

/**
 * The promotion desk's refusals.
 *
 * `OFFER_NOT_FEATUREABLE` is the one that says something: the strip is what a buyer
 * sees first, so a draft, a returned listing or one the platform has paused cannot be
 * pinned into it. Said as itself rather than as "something went wrong", because the
 * operator who is refused needs to know the listing is the problem, not the button.
 */
const FEATURE_REFUSAL_CODES: Record<string, RefusalCodeText> = {
  OFFER_NOT_FEATUREABLE: 'لا يُروَّج لعرضٍ غير منشور وجاهز للبيع؛ الشريط واجهة سوق، وليس طريقًا لعرض مسودة أو معادٍ للنشر.',
  PERMISSION_DENIED: 'ترويج العروض صلاحية منصة؛ هذا الحساب لا يملكها.',
};

/** A pin or an unpin read back to the operator. */
export function featureDecisionMessage(result: ApiResult<Offer>): string {
  return explainRefusal(result, { fallback: 'تعذّر تسجيل قرار الترويج', codes: FEATURE_REFUSAL_CODES });
}
