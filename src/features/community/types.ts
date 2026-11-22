/*


*
 * The social layer that sits on an offer: comments, the reports raised on
 * them, and the moderation view that decides both.
 *
 * These mirror what the endpoints actually return: statuses keep the server's uppercase
 * vocabulary, amounts arrive as decimal strings from MySQL, and any field the
 * platform only knows after a human entered it is nullable. When a component and
 * a type here disagree, the component is wrong.
 */

/**
 * A question or remark on a listing, as the public thread returns it.
 *
 * The server builds this with `array_filter(..., !== null)`, so a key whose
 * value was null is **absent** rather than present-and-null. Read these fields
 * as optional even when the thread usually carries them.
 */
export interface OfferComment {
  id: number;
  offer_id: number;
  body: string;
  author_name?: string;
  organization_id?: number;
  /** The business that wrote it — shown, because an anonymous remark on a commercial listing is not actionable. */
  organization_name?: string;
  /** Written by the company that owns the listing, not necessarily underneath a question. */
  is_seller_reply?: boolean;
  /**
   * Set when this is the seller's own answer under a listing whose seller hides
   * their name: `author_name`, `organization_name` and `organization_id` are
   * then absent because the seller withheld them, not because they were never
   * recorded. Say that in words; do not render a blank as if it were a name.
   */
  identity_hidden?: boolean;
  status?: 'pending' | 'published' | 'removed' | string;
  report_count?: number;
  created_at?: string;
  replies?: OfferComment[];
}

/** The closed vocabulary `POST /marketplace/comments/{id}/report` accepts. */
export type CommentReportReason =
  | 'spam'
  | 'off_topic'
  | 'abusive'
  | 'contact_info'
  | 'misleading'
  | 'other';

/** `GET /community/summary` — what is waiting on platform staff, counted from the queues themselves. */
export interface CommunitySummary {
  pending_offers: number;
  pending_comments: number;
  reported_comments: number;
  open_reports: number;
  pending_documents: number;
  pending_organizations: number;
}

/** A thread row on the reviewer's desk (`GET /community/comments`). */
export interface ModeratedComment extends OfferComment {
  moderated_at?: string | null;
  moderation_reason?: string | null;
  moderator_name?: string | null;
  organization?: { id: number; name_ar: string; status: string } | null;
  offer?: {
    id: number;
    title_ar: string;
    status: string;
    seller_org_id: number;
    seller_name_ar?: string | null;
    seller_cr?: string | null;
    seller_vat?: string | null;
    seller_status?: string | null;
  } | null;
  reports: {
    id: number;
    reason: string;
    note?: string | null;
    status: string;
    by_organization?: string | null;
    reported_by?: string | null;
  }[];
}

/** A report row (`GET /community/reports`). */
export interface CommunityReport {
  id: number;
  offer_comment_id: number;
  reason: CommentReportReason | string;
  note?: string | null;
  status: 'open' | 'upheld' | 'dismissed' | string;
  reviewed_by?: number | null;
  reviewed_at?: string | null;
  created_at?: string;
  comment?: { id: number; offer_id: number; body: string; status: string; report_count?: number } | null;
  reporter?: { name: string } | null;
  organization?: { name_ar: string } | null;
  reviewer?: { name: string } | null;
}
