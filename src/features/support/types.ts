/*


*
 * Tickets between a person and the platform's own staff — not a dispute
 * between two businesses, which is `trading`'s.
 *
 * These mirror what the endpoints actually return: statuses keep the server's uppercase
 * vocabulary, amounts arrive as decimal strings from MySQL, and any field the
 * platform only knows after a human entered it is nullable. When a component and
 * a type here disagree, the component is wrong.
 */

// ── Support desk ────────────────────────────────────────────────────────────
// The platform's own complaint desk. Not a help centre and not a chat: one
// report, one thread, one answer. The five categories are the server's words —
// a client that invents a sixth is refused, because the queue groups by this
// column and "somewhat different spelling" would make every count wrong.
export type SupportTicketCategory =
  | 'FUNCTIONAL_BUG'
  | 'WRONG_DATA'
  | 'ACCOUNT_ACCESS'
  | 'LISTING_TRADE'
  | 'SUGGESTION'
  | 'OTHER';

export type SupportTicketStatus = 'open' | 'in_review' | 'resolved' | 'dismissed';

export interface SupportTicket {
  id: number;
  /** Handed to the reporter and quoted back on every later reply: `SUP-00042`. */
  reference: string | null;
  category: SupportTicketCategory;
  message: string;
  /** A route name (`/marketplace/offers/12`), never prose. */
  screen: string | null;
  /** Five labelled facts about the software, chosen by the server's allow-list. */
  context: {
    platform?: string;
    app_version?: string;
    locale?: string;
    screen_label?: string;
    device_name?: string;
  } | null;
  status: SupportTicketStatus;
  /** What the platform said back. Present only once something was said. */
  reply: string | null;
  answered_at: string | null;
  /** The answering staff member's name — sent to the queue, never to the reporter. */
  answered_by: string | null;
  /** Who filed it: the queue's only way to answer the right person. */
  filed_by?: string | null;
  organization_name?: string | null;
  organization_id: number | null;
  created_at: string;
  updated_at: string;
}

/** `GET /support/summary` — counts a console renders without paging the queue. */
export interface SupportSummary {
  by_status: Record<SupportTicketStatus, number>;
  awaiting_attention: number;
  oldest_open_at: string | null;
  /** Measured, not asserted: "the desk is backed up" has to be disagreeable. */
  oldest_open_minutes: number | null;
}
