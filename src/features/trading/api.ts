/**
 * The money path: a reservation, a purchase request, a deal, the handover that
 * closes it, the dispute that goes wrong, and the ledger entries they write.
 *
 * Every path below is a route the server actually registers: `npm run check:api`
 * compares these modules against `php artisan route:list`, so a button here cannot
 * be wired to an endpoint that was never built. A call that must not run twice on a
 * retried click passes an `idempotencyKey`, and the transport that stamps it — the
 * token, the organization header, the envelope — is `src/core/api/http.ts`.
 */

import { getTenantId, getToken, idempotencyKey, qs, request } from '@/core/api/http';
import type { ApiResult } from '@/core/api/http';

import { getLocale } from '@/core/i18n';
import type { Organization } from '@/features/organizations/types';
import type { Deal, Dispute, HandoverView, LedgerAccount, LedgerEntry, ProposedTermsInput, PurchaseRequest, PurchaseRequestFromMatch, Reservation } from '@/features/trading/types';

export async function getReservations(filters: { status?: string; page?: number } = {}) {
  return request<Reservation[]>('/api/v1/marketplace/reservations' + qs({ ...filters }));
}

export async function cancelReservation(id: number, reason?: string) {
  return request<Reservation>(`/api/v1/marketplace/reservations/${id}/cancel`, {
    method: 'POST',
    body: { reason },
    idempotencyKey: idempotencyKey(`res_cxl_${id}`),
  });
}

/**
 * The marketplace fast path: an offer becomes an ask.
 *
 * There is deliberately no client call that reserves stock directly — a hold
 * is what `acceptPurchaseRequest()` produces, because §19–§26 put the seller's
 * decision between finding a listing and taking something off their shelf.
 */
export async function createPurchaseRequestFromOffer(data: {
  offer_id: number;
  requested_quantity: number;
  delivery_preference?: 'PICKUP' | 'DELIVERY';
  notes?: string;
}) {
  return request<PurchaseRequest>('/api/v1/purchase-requests', {
    method: 'POST',
    body: data,
    idempotencyKey: idempotencyKey(`pr_offer_${data.offer_id}`),
  });
}

export async function getPurchaseRequests(page?: number) {
  return request<PurchaseRequest[]>('/api/v1/purchase-requests' + qs({ page }));
}

export async function getPurchaseRequest(id: number) {
  return request<PurchaseRequest>(`/api/v1/purchase-requests/${id}`);
}

/** The demand-driven path: one of this buyer's matches becomes an ask. */
export async function createPurchaseRequestFromMatch(matchId: number, data: PurchaseRequestFromMatch = {}) {
  return request<PurchaseRequest>(`/api/v1/purchase-requests/matches/${matchId}`, {
    method: 'POST',
    body: data,
    idempotencyKey: idempotencyKey(`pr_${matchId}`),
  });
}

/** Seller acceptance: this is the moment stock is held. */
export async function acceptPurchaseRequest(id: number, notes?: string) {
  return request<PurchaseRequest>(`/api/v1/purchase-requests/${id}/accept`, {
    method: 'POST',
    body: { notes },
    idempotencyKey: idempotencyKey(`pr_acc_${id}`),
  });
}

export async function rejectPurchaseRequest(id: number, reason: string) {
  return request<PurchaseRequest>(`/api/v1/purchase-requests/${id}/reject`, {
    method: 'POST',
    body: { reason },
    idempotencyKey: idempotencyKey(`pr_rej_${id}`),
  });
}

/** Seller counter-offer. Recorded as proposed terms; the buyer's ask is not rewritten. */
export async function proposePurchaseRequest(id: number, proposed_terms: ProposedTermsInput, notes?: string) {
  return request<PurchaseRequest>(`/api/v1/purchase-requests/${id}/propose`, {
    method: 'POST',
    body: { proposed_terms, notes },
    idempotencyKey: idempotencyKey(`pr_prop_${id}`),
  });
}

/** Buyer adopts the counter-offer, which sends it back for seller acceptance. */
export async function acceptProposal(id: number) {
  return request<PurchaseRequest>(`/api/v1/purchase-requests/${id}/accept-proposal`, {
    method: 'POST',
    idempotencyKey: idempotencyKey(`pr_ap_${id}`),
  });
}

export async function cancelPurchaseRequest(id: number, reason?: string) {
  return request<PurchaseRequest>(`/api/v1/purchase-requests/${id}/cancel`, {
    method: 'POST',
    body: { reason },
    idempotencyKey: idempotencyKey(`pr_cxl_${id}`),
  });
}

export async function getDeals(filters: { perspective?: 'buyer' | 'seller' | 'all'; status?: string; search?: string; page?: number } = {}) {
  return request<Deal[]>('/api/v1/deals' + qs({ ...filters }));
}

export async function getDeal(id: number) {
  return request<Deal>(`/api/v1/deals/${id}`);
}

/** A deal is formed against held stock, never straight from an offer. */
export async function createDealFromReservation(data: {
  reservation_id: number;
  delivery_method: 'PICKUP' | 'SELLER_DELIVERY' | 'THIRD_PARTY_CARRIER';
  delivery_address?: string;
  notes?: string;
}) {
  return request<Deal>('/api/v1/deals', {
    method: 'POST',
    body: data,
    idempotencyKey: idempotencyKey('deal'),
  });
}

/**
 * Move a deal through the state machine. The server decides whether this
 * actor, in this state, with this capability configured, may ask for that
 * state — a button being visible here is not an entitlement.
 */
export async function transitionDeal(id: number, status: string, notes?: string) {
  return request<Deal>(`/api/v1/deals/${id}/transition`, {
    method: 'POST',
    body: { status, notes },
    idempotencyKey: idempotencyKey(`deal_t_${id}_${status}`),
  });
}

/**
 * The order's delivery code: what the seller prints on the paperwork and what
 * the buyer's gate shows.
 *
 * Reading it is a party act with no side effect, which is why it needs no more
 * than `deals.view`. Before the seller accepts the order there is genuinely no
 * code — the server answers 422 `HANDOVER_NOT_ISSUED`, and the screen says so in
 * those words instead of drawing an empty QR box and letting someone hunt for
 * the missing piece.
 */
export async function getHandover(id: number) {
  return request<HandoverView>(`/api/v1/deals/${id}/handover`);
}

/**
 * The same code as a document: the SVG of the symbol, for the box that leaves
 * the warehouse before the phone that carries it.
 *
 * This is the one route this client does not read as JSON, and it is the one
 * place the envelope is deliberately absent — a `<img>` or a saved file cannot
 * unwrap `{ success, data }`. So the answer is a blob URL, and the failure is
 * still the JSON error it always was.
 *
 * A blob URL rather than the route itself because a browser navigating to an
 * API route sends no `Authorization` header: the link would be a 401 dressed up
 * as a broken button. Here the request carries this session's token, and what
 * the person gets is the label for the order they are allowed to see.
 */
export async function handoverLabelUrl(id: number): Promise<{ success: boolean; url?: string; message?: string }> {
  const headers: Record<string, string> = {
    Accept: 'image/svg+xml',
    'Accept-Language': getLocale(),
  };
  if (getToken()) headers['Authorization'] = `Bearer ${getToken()}`;
  if (getTenantId()) headers['X-Organization-Id'] = getTenantId().toString();
  const res = await fetch(`/api/v1/deals/${id}/handover/label`, { headers }).catch(() => null);
  if (!res) return { success: false, message: 'تعذّر الوصول إلى الخادم' };
  if (!res.ok) {
    // Refusals keep the envelope: `HANDOVER_NOT_ISSUED`, `DEAL_ACCESS_DENIED`,
    // `HANDOVER_LABEL_TOO_LARGE` — each one a sentence the screen can show.
    const json = (await res.json().catch(() => null)) as ApiResult | null;
    return {
      success: false,
      message:
        json?.error?.message ||
        json?.message ||
        `تعذّر تجهيز الملصق (${res.status})`,
    };
  }
  const blob = await res.blob();
  return { success: true, url: URL.createObjectURL(blob) };
}

/**
 * Spend the code — the scan that lets an order be closed as received.
 *
 * Whatever produced the string, a camera on a printed label, a barcode gun, ten
 * characters typed under a bad light, arrives as `code` and the server decides
 * what it means. This client deliberately does not pre-check that: the answer to
 * "already used", "wrong order", "damaged code" or "not yours to read" belongs to
 * one service and comes back with an error code the screen prints as given.
 */
export async function verifyHandover(id: number, data: { code: string; notes?: string }) {
  return request<HandoverView & { next_step?: string }>(`/api/v1/deals/${id}/handover/verify`, {
    method: 'POST',
    body: data,
    idempotencyKey: idempotencyKey(`handover_v_${id}`),
  });
}

export async function getDisputes(filters: { status?: string; page?: number } = {}) {
  return request<Dispute[]>('/api/v1/disputes' + qs({ ...filters }));
}

export async function openDispute(data: {
  deal_id: number;
  /** One of the codes `Dispute::REASONS` accepts; the server refuses prose. */
  reason: 'QUALITY_DEFECT' | 'QUANTITY_MISMATCH' | 'WRONG_ITEM' | 'DELIVERY_DELAY' | 'TEMPERATURE_ABUSE' | 'OTHER';
  description: string;
  claimed_amount: number;
  evidence_urls?: string[];
}) {
  return request<Dispute>('/api/v1/disputes', {
    method: 'POST',
    body: data,
    idempotencyKey: idempotencyKey(`dsp_${data.deal_id}`),
  });
}

/**
 * SuperAdmin only. The body is the ruling itself — `RESOLVED_RELEASE` lets the
 * order carry on to the buyer's receipt, `RESOLVED_CANCELLATION` calls it off —
 * plus the prose reason the record keeps. There is no amount in it: a platform
 * that never held the money has nothing to hand back, and an earlier version of
 * this call carried both a `decision` and the status that decision mapped to.
 */
export async function resolveDispute(id: number, data: {
  status: 'RESOLVED_RELEASE' | 'RESOLVED_CANCELLATION';
  notes: string;
}) {
  return request<Dispute>(`/api/v1/disputes/${id}/resolve`, {
    method: 'POST',
    body: data,
    idempotencyKey: idempotencyKey(`dsp_res_${id}`),
  });
}

export async function getLedgerAccounts() {
  return request<LedgerAccount[]>('/api/v1/ledger/accounts');
}

export async function getJournalEntries(filters: { deal_id?: number; entity_type?: string; page?: number } = {}) {
  return request<LedgerEntry[]>('/api/v1/ledger/journal-entries' + qs({ ...filters }));
}

export async function getTrialBalance() {
  return request<Record<string, any>>('/api/v1/ledger/trial-balance');
}
