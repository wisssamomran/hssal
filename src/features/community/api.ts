/**
 * Interest and questions on an offer, and the staff side of the same tables.
 *
 * Every path below is a route the server actually registers: `npm run check:api`
 * compares these modules against `php artisan route:list`, so a button here cannot
 * be wired to an endpoint that was never built. A call that must not run twice on a
 * retried click passes an `idempotencyKey`, and the transport that stamps it — the
 * token, the organization header, the envelope — is `src/core/api/http.ts`.
 */

import { idempotencyKey, qs, request } from '@/core/api/http';

import type { CommentReportReason, CommunityReport, CommunitySummary, ModeratedComment, OfferComment } from '@/features/community/types';

/**
 * "This business is interested in this listing."
 *
 * One row per (offer, account, organization), so the same person acting for
 * two companies produces two signals from two companies and re-liking cannot
 * inflate a number. There is no star, score or verdict anywhere in this
 * section — the platform has never computed one, so no screen may show one.
 *
 * Refused before a reviewer accepts the business's papers
 * (`ORGANIZATION_NOT_VERIFIED`), and only an ACTIVE listing accepts interest.
 */
export async function likeOffer(id: number) {
  return request<{ liked: boolean; likes_count: number; created: boolean }>(
    `/api/v1/marketplace/offers/${id}/like`,
    { method: 'POST', idempotencyKey: idempotencyKey(`like_${id}`) }
  );
}

export async function unlikeOffer(id: number) {
  return request<{ liked: boolean; likes_count: number; removed: boolean }>(
    `/api/v1/marketplace/offers/${id}/like`,
    { method: 'DELETE' }
  );
}

/**
 * Which listings the signed-in account already marked, for the organization
 * in context.
 *
 * Needed because `GET /marketplace/offers` answers the same way with or
 * without a token — it cannot say "you liked this" without becoming a
 * different response per visitor. A list loads once and fills its buttons in
 * from here.
 */
export async function getLikedOfferIds() {
  return request<{ offer_ids: number[] }>('/api/v1/marketplace/liked-offers');
}

/** The public thread: published questions, each with its published replies. */
export async function getOfferComments(offerId: number) {
  return request<{ offer_id: number; comments: OfferComment[] }>(
    `/api/v1/marketplace/offers/${offerId}/comments`
  );
}

/**
 * Ask a question on a listing. A reply to a reply flattens onto the question
 * it answers, and with pre-moderation switched on the row comes back
 * `pending` — so the message the server chose ("سيظهر بعد المراجعة") is the
 * one to show, not a locally composed "posted".
 */
export async function commentOnOffer(offerId: number, data: { body: string; parent_id?: number }) {
  return request<OfferComment>(`/api/v1/marketplace/offers/${offerId}/comments`, {
    method: 'POST',
    body: data,
    idempotencyKey: idempotencyKey(`cmt_${offerId}`),
  });
}

/** Withdraws the comment and everything under it; the row survives as `removed`. */
export async function deleteOfferComment(id: number) {
  return request<{ id: number; status: string }>(`/api/v1/marketplace/comments/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Ask platform staff to look at a comment.
 *
 * A report hides nothing by itself — the reporter is one party to the
 * disagreement, and letting an accusation act as a verdict would turn the
 * queue into a takedown service. A repeat report from the same actor is
 * acknowledged, not counted.
 */
export async function reportOfferComment(id: number, data: { reason: CommentReportReason; note?: string }) {
  return request<{ comment_id: number; report_count: number; recorded: boolean }>(
    `/api/v1/marketplace/comments/${id}/report`,
    { method: 'POST', body: data, idempotencyKey: idempotencyKey(`rpt_${id}`) }
  );
}

/**
 * What is waiting on a reviewer, in one call.
 *
 * The numbers are counted from the same tables the queues below read, so a
 * badge can never advertise work that opening the queue does not contain —
 * which is the failure mode of a hand-maintained counter.
 */
export async function getCommunitySummary() {
  return request<CommunitySummary>('/api/v1/community/summary');
}

/**
 * The comment queue.
 *
 * `reported` is not a status: it is published comments somebody flagged,
 * ordered by how many flagged them. It is the queue that matters when
 * pre-moderation is off, and the server will not invent a fourth state.
 */
export async function getCommunityComments(filters: { status?: 'pending' | 'published' | 'removed' | 'reported'; perPage?: number } = {}) {
  return request<ModeratedComment[]>('/api/v1/community/comments' + qs({ ...filters }));
}

/**
 * Publish, hold or remove one comment. A removal takes a reason from the
 * server's fixed vocabulary, because an appeal has to have something to
 * point at. Publishing a question does not publish the replies held under it.
 */
export async function moderateComment(id: number, data: { action: 'publish' | 'remove' | 'pending'; reason?: string }) {
  return request<ModeratedComment>(`/api/v1/community/comments/${id}/moderate`, {
    method: 'PUT',
    body: data,
    idempotencyKey: idempotencyKey(`mod_${id}`),
  });
}

export async function getCommunityReports(filters: { status?: 'open' | 'upheld' | 'dismissed' } = {}) {
  return request<CommunityReport[]>('/api/v1/community/reports' + qs({ ...filters }));
}

/**
 * Decide a report. Upholding one does nothing on its own unless the reviewer
 * also takes the comment down, which is why `remove_comment` and its reason
 * are part of this single decision rather than a second call someone may
 * forget to make.
 */
export async function reviewCommunityReport(id: number, data: {
  action: 'upheld' | 'dismissed';
  remove_comment?: boolean;
  reason?: string;
}) {
  return request<{ report_id: number; status: string; comment_status?: string | null }>(
    `/api/v1/community/reports/${id}/review`,
    { method: 'POST', body: data, idempotencyKey: idempotencyKey(`rpt_rev_${id}`) }
  );
}
