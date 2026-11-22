/**
 * Tickets between a person and the platform's staff.
 *
 * Every path below is a route the server actually registers: `npm run check:api`
 * compares these modules against `php artisan route:list`, so a button here cannot
 * be wired to an endpoint that was never built. A call that must not run twice on a
 * retried click passes an `idempotencyKey`, and the transport that stamps it — the
 * token, the organization header, the envelope — is `src/core/api/http.ts`.
 */

import { idempotencyKey, qs, request } from '@/core/api/http';

import type { SupportSummary, SupportTicket, SupportTicketCategory, SupportTicketStatus } from '@/features/support/types';

/**
 * File a report about HASSAL — a screen that lost data, a price that shows
 * wrong, a sign-in that will not open.
 *
 * Two doors, and the difference between them is the design: filing and reading
 * *your own* reports need no permission at all, because a person whose
 * membership lapsed is still a person who can see that the app is broken.
 * Reading the queue and answering are `support.manage`, which no business
 * standing holds — deciding that a competitor's report was dismissed is
 * judging someone else's case.
 *
 * `screen` is a route name rather than prose, and `context` is kept to the five
 * labelled facts the server allow-lists; anything else a client invents is
 * dropped instead of stored. Repeating the same words in the same category
 * inside ten minutes comes back as `DUPLICATE_REPORT` carrying the first
 * report's reference, so a double-tap becomes one number to quote rather than
 * two rows somebody is now answering twice.
 */
export async function createSupportTicket(data: {
  category: SupportTicketCategory;
  message: string;
  screen?: string;
  context?: Record<string, string>;
}) {
  return request<SupportTicket>('/api/v1/support/tickets', {
    method: 'POST',
    body: data,
  });
}

/** The signed-in person's own reports, newest first. */
export async function getSupportTickets(filters: { status?: SupportTicketStatus; page?: number } = {}) {
  return request<SupportTicket[]>('/api/v1/support/tickets' + qs({ ...filters }));
}

/** The platform's queue: every report, oldest first. Needs `support.manage`. */
export async function getSupportQueue(filters: {
  status?: SupportTicketStatus;
  category?: SupportTicketCategory;
  page?: number;
} = {}) {
  return request<SupportTicket[]>('/api/v1/support/queue' + qs({ ...filters }));
}

/** Counts a console renders without paging the queue. */
export async function getSupportSummary() {
  return request<SupportSummary>('/api/v1/support/summary');
}

/**
 * Answer, or claim, one report.
 *
 * `in_review` is a claim: it tells the next agent somebody is on it. Closing a
 * report as `resolved` or `dismissed` without a `reply` is refused with
 * `REPLY_REQUIRED`, because a ticket marked done with nothing said to the
 * person who filed it is a report the platform buried.
 */
export async function answerSupportTicket(id: number, data: {
  status: SupportTicketStatus;
  reply?: string;
}) {
  return request<SupportTicket>(`/api/v1/support/tickets/${id}/answer`, {
    method: 'PUT',
    body: data,
    idempotencyKey: idempotencyKey(`sup_${id}`),
  });
}
