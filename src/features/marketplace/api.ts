/**
 * The shelf and the ask: offers on one side, demands with their matches and
 * quotations on the other. Nothing here moves money — that is `trading`'s.
 *
 * Every path below is a route the server actually registers: `npm run check:api`
 * compares these modules against `php artisan route:list`, so a button here cannot
 * be wired to an endpoint that was never built. A call that must not run twice on a
 * retried click passes an `idempotencyKey`, and the transport that stamps it — the
 * token, the organization header, the envelope — is `src/core/api/http.ts`.
 */

import { idempotencyKey, qs, request } from '@/core/api/http';

import type { Demand, DemandMatch, FeaturedOffersResult, NearbyFilters, NearbyResult, Offer, OfferFilters, OfferStatus, Quotation, ShelfFilters } from '@/features/marketplace/types';

export async function getOffers(filters: OfferFilters = {}) {
  return request<Offer[]>(
    '/api/v1/marketplace/offers' + qs({ ...filters })
  );
}

/**
 * The seller's own shelf: this business's offers in every status, including
 * drafts and listings waiting on a reviewer. Authenticated, and scoped by the
 * server to the organization in context — a shelf cannot be asked for by id.
 */
export async function getMyOffers(filters: ShelfFilters = {}) {
  return request<Offer[]>('/api/v1/marketplace/my-offers' + qs({ ...filters }));
}

/**
 * The review queue: unpublished listings from every business, defaults to
 * what is awaiting a decision. Gated by `offers.moderate` at the route, so a
 * seller holding a token receives a refusal here rather than an empty list.
 */
export async function getModerationQueue(filters: ShelfFilters = {}) {
  return request<Offer[]>('/api/v1/marketplace/moderation-queue' + qs({ ...filters }));
}

/**
 * The promoted strip: which live listings the platform pinned, the newest
 * decision first.
 *
 * No `limit` parameter, because the ceiling is the platform's setting
 * (`marketplace.featured_limit`) rather than something a screen gets to ask
 * for — a client that could widen the strip would widen the promotion for
 * everyone watching it. Public: it reads the same with and without a token,
 * and it carries the same visibility chain as the market list, so a sold-out
 * or expired listing leaves the strip by itself.
 */
export async function getFeaturedOffers() {
  return request<FeaturedOffersResult>('/api/v1/marketplace/offers/featured');
}

/**
 * Pin a listing to the strip, or take it back off. Gated by `offers.feature`,
 * which belongs to no business standing, and carrying an idempotency key like
 * every other write.
 *
 * Pinning a listing that is not `ACTIVE` is refused with
 * `OFFER_NOT_FEATUREABLE`: promoting a draft would advertise a price the
 * market is not allowed to see.
 */
export async function setOfferFeatured(id: number, featured: boolean) {
  return request<Offer>(`/api/v1/marketplace/offers/${id}/feature`, {
    method: 'PUT',
    body: { featured },
    idempotencyKey: idempotencyKey('off_feat'),
  });
}

/**
 * Offers within a radius of real coordinates. Returns the whole search result
 * — centre, applied radius and count — because a list of offers without the
 * circle it came from is not a discovery answer, it is an unexplained one.
 */
export async function getNearbyOffers(lat: number, lon: number, filters: NearbyFilters = {}) {
  return request<NearbyResult>(
    '/api/v1/marketplace/offers/nearby' + qs({ latitude: lat, longitude: lon, ...filters })
  );
}

export async function getOffer(id: number) {
  return request<Offer>(`/api/v1/marketplace/offers/${id}`);
}

export async function createOffer(offer: Record<string, unknown>) {
  return request<Offer>('/api/v1/marketplace/offers', {
    method: 'POST',
    body: offer,
    idempotencyKey: idempotencyKey('off'),
  });
}

export async function updateOffer(id: number, offer: Record<string, unknown>) {
  return request<Offer>(`/api/v1/marketplace/offers/${id}`, {
    method: 'PUT',
    body: offer,
    idempotencyKey: idempotencyKey('off_up'),
  });
}

/** DRAFT → PENDING_REVIEW. Publication is an admin act, not a seller's. */
export async function submitOffer(id: number) {
  return request<Offer>(`/api/v1/marketplace/offers/${id}/submit`, {
    method: 'POST',
    idempotencyKey: idempotencyKey('off_sub'),
  });
}

/**
 * The reviewer's decision. The server takes `APPROVE` or `RETURN` and refuses
 * a `RETURN` with no reason, because an unexplained return cannot be acted on
 * by the seller it was sent back to.
 */
export async function reviewOffer(id: number, decision: 'APPROVE' | 'RETURN', reason?: string) {
  return request<Offer>(`/api/v1/marketplace/offers/${id}/review`, {
    method: 'PUT',
    body: { decision, ...(reason ? { reason } : {}) },
    idempotencyKey: idempotencyKey('off_rev'),
  });
}

export async function setOfferStatus(id: number, status: OfferStatus, reason?: string) {
  return request<Offer>(`/api/v1/marketplace/offers/${id}/status`, {
    method: 'PUT',
    body: { status, ...(reason ? { reason } : {}) },
    idempotencyKey: idempotencyKey('off_st'),
  });
}

export async function deleteOffer(id: number) {
  return request(`/api/v1/marketplace/offers/${id}`, { method: 'DELETE' });
}

export async function getDemands(filters: { my_demands?: 1; category_id?: number; city?: string; search?: string; page?: number } = {}) {
  return request<Demand[]>('/api/v1/demands' + qs({ ...filters }));
}

export async function createDemand(demand: {
  title_ar: string;
  title_en?: string;
  description?: string;
  category_id?: number;
  target_quantity: number;
  unit: string;
  target_unit_price?: number;
  currency_code?: string;
  target_delivery_date?: string;
  delivery_city: string;
  delivery_latitude?: number;
  delivery_longitude?: number;
  special_requirements?: string;
  expires_at?: string;
}) {
  return request<Demand>('/api/v1/demands', {
    method: 'POST',
    body: demand,
    idempotencyKey: idempotencyKey('dmd'),
  });
}

/** Re-runs the matching engine, so this is a live read, not a cached list. */
export async function getDemandMatches(demandId: number) {
  return request<{ demand: Demand; matches: DemandMatch[]; total: number }>(
    `/api/v1/demands/${demandId}/matches`
  );
}

export async function submitQuotation(demandId: number, data: {
  quoted_quantity: number;
  unit_price: number;
  currency_code?: string;
  validity_days?: number;
  notes?: string;
}) {
  return request<Quotation>(`/api/v1/demands/${demandId}/quotations`, {
    method: 'POST',
    body: data,
    idempotencyKey: idempotencyKey(`q_${demandId}`),
  });
}
