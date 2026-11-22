import type { DeliveryPreference, Offer } from '@/features/marketplace/types';
import type { BusinessSummary } from '@/features/organizations/types';

/**
 * The money path: a reservation, a purchase request, a deal, the handover
 * that closes it, the dispute that goes wrong, and the ledger entries all of
 * them write.
 *
 * Amounts here are the frozen commercial truth of one order. Later changes to a
 * platform rate never rewrite these rows, which is why the rates travel with the
 * deal instead of being read from settings at display time.
 *
 * These mirror what the endpoints actually return: statuses keep the server's uppercase
 * vocabulary, amounts arrive as decimal strings from MySQL, and any field the
 * platform only knows after a human entered it is nullable. When a component and
 * a type here disagree, the component is wrong.
 */

export type ReservationStatus = 'ACTIVE' | 'CONVERTED_TO_DEAL' | 'EXPIRED' | 'CANCELLED';

/** A stock hold. It is neither a deal nor a purchase request. */
export interface Reservation {
  id: number;
  reservation_number: string;
  offer_id: number;
  buyer_organization_id: number;
  buyer_user_id: number;
  quantity: string | number;
  unit_price: string | number;
  currency_code: string;
  total_amount: string | number;
  delivery_preference: 'PICKUP' | 'DELIVERY' | string;
  status: ReservationStatus;
  expires_at?: string | null;
  converted_at?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  notes?: string | null;
  created_at?: string;
  offer?: Offer | null;
}

export type PurchaseRequestStatus = 'REQUESTED' | 'ACCEPTED' | 'REJECTED' | 'PROPOSED' | 'CANCELLED';

/**
 * The seller's counter-offer, exactly as `PurchaseRequestController::propose()`
 * stores it: only the terms that changed, plus the currency the price is in.
 * Who proposed it is `seller_user_id` on the request, not a field of the terms.
 */
export interface ProposedTerms {
  quantity?: string | number;
  unit_price?: string | number;
  currency_code?: string;
}

export interface PurchaseRequest {
  id: number;
  purchase_request_number: string;
  demand_id?: number | null;
  demand_match_id?: number | null;
  offer_id: number;
  reservation_id?: number | null;
  buyer_organization_id: number;
  seller_organization_id: number;
  buyer_user_id: number;
  seller_user_id?: number | null;
  requested_quantity: string | number;
  unit: string;
  requested_price: string | number;
  currency_code: string;
  delivery_preference: 'PICKUP' | 'DELIVERY' | string;
  status: PurchaseRequestStatus;
  notes?: string | null;
  proposed_terms?: ProposedTerms | null;
  created_at?: string;
  offer?: Offer | null;
  reservation?: Reservation | null;
  deal_id?: number | null;
}

/**
 * The states an order can sit in — the server's own list, read off
 * `App\Models\Deal` and `DealStateMachineService::ALLOWED_TRANSITIONS`.
 *
 * There is no payment state here, and there must never be one added on this side
 * of the wire: HASSAL documents a trade and the two businesses settle it between
 * themselves. `DRAFT` is in the type because the state machine declares it and an
 * older row may carry it, but nothing in the product creates one — an order opens
 * at `PENDING_SELLER_APPROVAL`.
 */
export type DealStatus =
  | 'DRAFT'
  | 'PENDING_SELLER_APPROVAL'
  | 'ACCEPTED'
  | 'PROCESSING'
  | 'READY_FOR_PICKUP'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'INSPECTION'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DISPUTED'
  | 'RESOLVED';

/** The three things a delivery code can be. See `App\Models\DealHandover`. */
export type HandoverStatus = 'ACTIVE' | 'USED' | 'INVALIDATED';

/**
 * The code's row as it arrives nested inside a deal.
 *
 * Absent until the seller accepts the order — that acceptance is what issues the
 * code, so "no code yet" is a fact about the order's stage, not a missing field.
 */
export interface DealHandover {
  id: number;
  deal_id: number;
  code: string;
  status: HandoverStatus;
  issued_by_user_id?: number | null;
  verified_by_user_id?: number | null;
  verified_by_organization_id?: number | null;
  issued_at?: string | null;
  verified_at?: string | null;
  invalidated_at?: string | null;
  verification_notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * A QR Code, as the backend encodes it: the grid, not a picture of it.
 *
 * `rows` is one string per module row — `'1'` dark, `'0'` light — with no quiet
 * zone folded in, because the margin belongs to whoever draws the symbol and a
 * printed sticker has different room around it than a phone screen does. The
 * platform encodes the symbol once, in PHP, and every client paints this grid;
 * three encoders would be three chances for a label and a screen to disagree
 * about the same order.
 */
export interface QrSymbol {
  payload: string;
  version: number;
  size: number;
  mask: number;
  ec_level: string;
  quiet_zone: number;
  rows: string[];
}

/**
 * What `GET/POST /api/v1/deals/{id}/handover` answers.
 *
 * `qr_payload` is what a camera prints — the code wrapped so a scanner can check
 * it belongs to this order — while `code` is what a person reads aloud or types
 * when the label is damaged. Both arrive because both are used at a real gate,
 * and `verifiable` is the server's answer to "can this be scanned right now", so
 * a screen never has to work out the state machine on its own.
 *
 * `qr` is that payload as a drawable symbol, and it is null when the platform
 * cannot build one (§4.7) — a screen then shows the characters, which are still
 * the code, rather than an empty box.
 */
export interface HandoverView extends DealHandover {
  deal_number: string;
  qr_payload: string;
  qr: QrSymbol | null;
  deal_status: DealStatus;
  verifiable: boolean;
}

/**
 * The commercial snapshot frozen when the deal was created. The rates and
 * amounts below are facts about that deal; later setting changes never rewrite
 * them.
 */
export interface Deal {
  id: number;
  deal_number: string;
  offer_id?: number | null;
  reservation_id?: number | null;
  purchase_request_id?: number | null;
  buyer_organization_id: number;
  seller_organization_id: number;
  buyer_user_id?: number | null;
  seller_user_id?: number | null;
  warehouse_id?: number | null;
  quantity: string | number;
  unit_price: string | number;
  currency_code: string;
  base_currency?: string | null;
  exchange_rate_snapshot?: string | number | null;
  rate_source?: string | null;
  rate_timestamp?: string | null;
  base_amount?: string | number | null;
  discount_amount?: string | number | null;
  tax_rate_snapshot: string | number;
  tax_amount: string | number;
  platform_fee_rate_snapshot: string | number;
  platform_fee_amount: string | number;
  delivery_fee_amount?: string | number | null;
  buyer_total_amount: string | number;
  seller_net_amount: string | number;
  status: DealStatus;
  delivery_method?: string | null;
  delivery_address?: string | null;
  inspection_window_hours?: number | null;
  inspection_deadline_at?: string | null;
  accepted_at?: string | null;
  dispatched_at?: string | null;
  delivered_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  items?: DealItem[];
  status_histories?: DealStatusHistory[];
  /** The order's delivery code, once the seller has accepted it. */
  handover?: DealHandover | null;
  dispute?: Dispute | null;
  buyer_organization?: BusinessSummary | null;
  seller_organization?: BusinessSummary | null;
  offer?: Offer | null;
}

export interface DealItem {
  id: number;
  deal_id: number;
  product_variant_id: number;
  snapshot_product_name: string | null;
  snapshot_sku: string | null;
  snapshot_unit_name: string | null;
  quantity: string | number;
  unit_price: string | number;
  subtotal_amount: string | number;
}

export interface DealStatusHistory {
  id: number;
  deal_id: number;
  from_status: string | null;
  to_status: string;
  changed_by_user_id?: number | null;
  changed_by_user?: { id: number; name: string } | null;
  notes?: string | null;
  created_at: string;
}

/**
 * The dispute vocabulary, which is exactly `Dispute::STATUSES`.
 *
 * A ruling has two outcomes because the platform holds no money: it either lets
 * the order stand, in which case the goods carry on to the buyer's receipt, or it
 * calls the order off, in which case the quantity goes back on the shelf and the
 * delivery code is retired. There is no refund state to represent, and a screen
 * that offered one would be promising a transfer this system cannot make.
 */
export type DisputeStatus =
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'EVIDENCE_REQUIRED'
  | 'RESOLVED_RELEASE'
  | 'RESOLVED_CANCELLATION';

export interface Dispute {
  id: number;
  dispute_number: string;
  deal_id: number;
  initiator_organization_id: number;
  initiator_user_id: number;
  reason: string;
  description?: string | null;
  claimed_amount: string | number;
  evidence_urls?: string[] | null;
  status: DisputeStatus;
  /** Why the platform ruled this way, in prose — not a state, not an amount. */
  resolution_notes?: string | null;
  resolved_by_user_id?: number | null;
  resolved_at?: string | null;
  created_at?: string;
  deal?: Deal | null;
}

/** A chart-of-accounts row, as `ledger/accounts` returns the model. */
export interface LedgerAccount {
  id: number;
  account_code: string;
  name_ar?: string | null;
  name_en?: string | null;
  /** ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE */
  type: string;
  organization_id?: number | null;
  currency_code: string;
  balance?: string | number | null;
  is_active?: boolean;
}

/** One side of a posting. Debits and credits are separate columns by design. */
export interface LedgerLine {
  id: number;
  journal_entry_id: number;
  ledger_account_id: number;
  organization_id?: number | null;
  debit_amount: string | number;
  credit_amount: string | number;
  memo?: string | null;
  account?: LedgerAccount | null;
  organization?: { id: number; name_ar: string; name_en: string | null } | null;
}

/** A journal entry with its lines, as `ledger/journal-entries` returns it. */
export interface LedgerEntry {
  id: number;
  entry_number: string;
  transaction_reference?: string | null;
  currency_code: string;
  exchange_rate_to_base?: string | number | null;
  description?: string | null;
  entity_type?: string | null;
  entity_id?: number | null;
  created_by_user_id?: number | null;
  total_debit: string | number;
  total_credit: string | number;
  posted_at?: string | null;
  is_reversal?: boolean;
  reversal_of_entry_id?: number | null;
  created_at: string;
  lines?: LedgerLine[];
  createdByUser?: { id: number; name: string } | null;
}

/** `ledger/trial-balance`: the same accounts shown as debit/credit columns. */
export interface TrialBalance {
  accounts: {
    account_code: string;
    name_ar: string | null;
    name_en: string | null;
    type: string;
    debit: number;
    credit: number;
  }[];
  total_debit: number;
  total_credit: number;
  is_balanced: boolean;
  generated_at: string;
}

/** The buyer's ask, always raised from a match the engine produced. */
export interface PurchaseRequestFromMatch {
  requested_quantity?: number;
  delivery_preference?: DeliveryPreference;
  notes?: string;
}

export interface ProposedTermsInput {
  quantity?: number;
  unit_price?: number;
  currency_code?: string;
}

