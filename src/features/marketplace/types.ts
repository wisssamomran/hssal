import type { ProductImage } from '@/features/catalog/types';
import type { BusinessSummary, OrganizationDocumentBrief, OrganizationStatus, OrganizationType } from '@/features/organizations/types';

/**
 * Supply and demand before money moves: what a seller puts on the shelf,
 * what a buyer asks for, and the matches and quotations that join them.
 *
 * Once a price is agreed the object is a deal, and deals are `trading`'s.
 *
 * These mirror what the endpoints actually return: statuses keep the server's uppercase
 * vocabulary, amounts arrive as decimal strings from MySQL, and any field the
 * platform only knows after a human entered it is nullable. When a component and
 * a type here disagree, the component is wrong.
 */

/**
 * Why a seller releases stock. The server owns this vocabulary and serves the
 * labels through `bootstrap.opportunity_reasons`, so the codes listed here are
 * documentation — not a list the client may invent values for.
 */
export type OpportunityReason =
  | 'SURPLUS_STOCK'
  | 'SLOW_MOVING'
  | 'SEASONAL_STOCK'
  | 'EXCESS_INVENTORY'
  | 'LIQUIDATION'
  | 'BRANCH_CLOSURE'
  | 'ASSORTMENT_CHANGE'
  | 'LOW_LOCAL_DEMAND'
  | string;

export type OfferStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'ACTIVE'
  | 'PAUSED'
  | 'SOLD_OUT'
  | 'EXPIRED'
  | 'CANCELLED';

/** Flat offer payload as returned by `OfferResource`. */
export interface Offer {
  id: number;
  seller_organization_id: number;
  warehouse_id: number;
  product_variant_id: number;
  category_id: number | null;

  title_ar: string;
  title_en?: string | null;
  description_ar?: string | null;
  description_en?: string | null;

  opportunity_reason: OpportunityReason;
  opportunity_reason_notes?: string | null;
  status: OfferStatus;

  total_quantity: string | number;
  /** On the shelf right now. Reserved and sold stay separate facts. */
  available_quantity: string | number;
  reserved_quantity: string | number;
  sold_quantity: string | number;
  min_order_quantity: string | number;
  max_order_quantity?: string | number | null;
  unit: string;

  unit_price: string | number;
  currency_code: string;

  production_date?: string | null;
  expiry_date?: string | null;
  storage_condition?: string | null;
  delivery_terms: 'BUYER_PICKUP' | 'SELLER_DELIVERY' | 'BOTH' | string;
  inspection_window_hours?: number | null;
  published_at?: string | null;
  expires_at?: string | null;

  product_id?: number | null;
  product_name_ar?: string | null;
  product_name_en?: string | null;
  variant_sku?: string | null;
  variant_name_ar?: string | null;
  variant_name_en?: string | null;
  variant_image?: string | null;
  weight_kg?: string | number | null;
  packaging_spec?: string | null;
  brand_id?: number | null;
  brand_name_ar?: string | null;
  brand_name_en?: string | null;
  product_image?: string | null;
  /**
   * Photographs the seller actually uploaded, ordered as the buyer should see
   * them. Present only where the endpoint loaded the relation.
   */
  product_images?: ProductImage[];
  product_cover_image?: string | null;

  category_name_ar?: string | null;
  category_name_en?: string | null;

  warehouse_name?: string | null;
  warehouse_city?: string | null;
  warehouse_district?: string | null;
  warehouse_address?: string | null;
  warehouse_lat?: string | number | null;
  warehouse_lon?: string | number | null;

  seller_name_ar?: string | null;
  seller_name_en?: string | null;
  seller_status?: OrganizationStatus | null;
  seller_cr?: string | null;
  seller_vat?: string | null;
  /** null until real completed deals exist; never render a placeholder score. */
  seller_rating?: number | null;

  /**
   * The seller's own choice about this listing. When it is `false` the server
   * sends `null` for the name, registration and tax numbers and for the
   * warehouse's name and address line, to everyone except the selling
   * organization's members and a platform reviewer — so a missing name here is
   * a recorded decision, not data the platform never had.
   *
   * It never hides the seller from a transaction: a purchase request still
   * reaches the named company, because a counterparty you cannot name is not a
   * counterparty.
   */
  show_seller_identity?: boolean;

  /**
   * Counted rows, sent only by the endpoints that run `withCount`. These are
   * not scores: `likes_count` is how many people recorded interest — a
   * consumer or a business actor, one row per person — and
   * `comments_count` counts published questions only.
   *
   * Whether *this* account liked the listing is deliberately absent — the
   * public list answers identically signed in or not. Read
   * `GET /marketplace/liked-offers` for that.
   */
  likes_count?: number;
  comments_count?: number;

  /** Only the nearby endpoint computes this. */
  distance_km?: number | null;

  /**
   * Set by the platform when a staff account pins this listing onto the
   * promoted strip. The date is the decision *and* its order: the newest pin
   * leads the strip, and removing the pin clears both columns, so "who put
   * this here" stops being an answer once nobody has.
   *
   * `featured_at` is public — a buyer seeing a promoted card is seeing the
   * fact of a promotion. `featured_by` is not: only a caller holding
   * `offers.feature` reads it back, because the console that cannot say who
   * promoted a listing has no audit to show anyone.
   */
  featured_at?: string | null;
  featured_by?: { id: number; name: string } | null;

  /**
   * Attached by `GET /marketplace/moderation-queue` only, and only for callers
   * holding `offers.moderate`. Every other offer response omits it, so a
   * business looking at its own listing sees no reviewer dossier.
   */
  moderation?: OfferModerationContext;

  items?: OfferItem[];
}

/** `GET /marketplace/offers/featured` — the strip and what the platform allows on it. */
export interface FeaturedOffersResult {
  offers: Offer[];
  /** The ceiling read from `marketplace.featured_limit`, not a client's ask. */
  limit: number;
  /** Pinned listings that currently clear the public visibility chain. */
  total_featured: number;
}

export interface OfferItem {
  id: number;
  product_id: number;
  product_variant_id: number;
  quantity: string | number;
  unit_price: string | number;
  currency_code: string;
}

export type DemandStatus = 'OPEN' | 'QUOTED' | 'ACCEPTED' | 'CLOSED' | 'EXPIRED';

export interface Demand {
  id: number;
  demand_number: string;
  buyer_organization_id: number;
  buyer_user_id: number;
  category_id?: number | null;
  title_ar: string;
  title_en?: string | null;
  description?: string | null;
  target_quantity: string | number;
  unit: string;
  target_unit_price?: string | number | null;
  currency_code: string;
  target_delivery_date?: string | null;
  delivery_city: string;
  delivery_latitude?: string | number | null;
  delivery_longitude?: string | number | null;
  special_requirements?: string | null;
  status: DemandStatus;
  expires_at?: string | null;
  created_at?: string;
  category_name_ar?: string | null;
  buyer_organization?: BusinessSummary | null;
  quotations?: Quotation[];
}

export interface Quotation {
  id: number;
  quotation_number: string;
  demand_id: number;
  seller_organization_id: number;
  seller_user_id: number;
  quoted_quantity: string | number;
  unit_price: string | number;
  currency_code: string;
  total_amount: string | number;
  validity_days?: number | null;
  notes?: string | null;
  status: string;
  accepted_at?: string | null;
  rejected_at?: string | null;
  converted_deal_id?: number | null;
  seller_organization?: BusinessSummary | null;
}

export type MatchStatus = 'ACTIVE' | 'USED' | 'EXPIRED' | 'INVALIDATED';

/**
 * One pairing the matching engine produced. `match_reasons` is the list that
 * explains the pairing; a bare score is not an explanation and must not be
 * presented as one.
 */
export interface DemandMatch {
  id: number;
  demand_id: number;
  offer_id: number;
  buyer_organization_id: number;
  seller_organization_id: number;
  requested_quantity: string | number;
  match_score?: string | number | null;
  match_reasons?: string[] | null;
  estimated_total?: string | number | null;
  status: MatchStatus;
  expires_at?: string | null;
  offer?: Offer | null;
}

/**
 * What a reviewer needs that is not on the listing itself.
 *
 * `GET /marketplace/moderation-queue` attaches this to every row. The business
 * behind an offer is part of the decision on it, so the console renders it
 * rather than sending the reviewer to three other screens.
 *
 * `kyc_verified_at` and `reviewed_at` are timestamps of this platform's own
 * staff decisions. No government register is read anywhere in this product, so
 * neither field — and no label built on it — may claim an official check (§47).
 */
export interface OfferModerationContext {
  seller_legal_record?: {
    organization_id: number;
    name_ar: string;
    type: OrganizationType;
    country_code: string;
    city: string | null;
    platform_status: OrganizationStatus | string;
    registration_no: string | null;
    tax_no: string | null;
    reviewed_at: string | null;
    website: string | null;
    phone: string | null;
    member_count: number;
  } | null;
  documents?: OrganizationDocumentBrief[];
  seller_history?: {
    offers_total: number;
    offers_active: number;
    offers_expired: number;
    deals_total: number;
    deals_settled: number;
    deals_disputed: number;
  } | null;
  waiting_since?: string | null;
  waiting_hours?: number | null;
  image_count?: number;
  warehouse?: {
    id: number;
    name: string;
    city: string | null;
    code: string | null;
    lat: number | string | null;
    lon: number | string | null;
  } | null;
}

/** Sort intents accepted by `GET /marketplace/offers`. */
export type OfferSortIntent =
  | 'newest'
  | 'cheapest'
  | 'priciest'
  | 'expiring'
  | 'quantity'
  | 'nearest_to_expiry';

export interface OfferFilters {
  category_id?: number;
  opportunity_reason?: string;
  city?: string;
  min_price?: number;
  max_price?: number;
  max_moq?: number;
  currency_code?: string;
  delivery_terms?: 'BUYER_PICKUP' | 'SELLER_DELIVERY' | 'BOTH';
  search?: string;
  sort_by?: OfferSortIntent;
  per_page?: number;
  page?: number;
}

/**
 * Filters for the two authenticated listings.
 *
 * `GET /marketplace/offers` is registered outside the authenticated group, so
 * it has no idea who is asking and cannot carry a "mine" flag. The seller's own
 * shelf and the reviewer's queue are separate routes (`my-offers`,
 * `moderation-queue`), each gated by its own permission; both take the filters
 * above plus the status they want listed.
 */
export interface ShelfFilters extends OfferFilters {
  status?: OfferStatus;
}

export interface NearbyFilters {
  radius_km?: number;
  category_id?: number;
  opportunity_reason?: string;
  min_price?: number;
  max_price?: number;
  min_quantity?: number;
  max_moq?: number;
  currency_code?: string;
  delivery_terms?: 'BUYER_PICKUP' | 'SELLER_DELIVERY' | 'BOTH';
  sort_by?: 'distance' | 'price' | 'freshness';
  per_page?: number;
}

/** What `GET /marketplace/offers/nearby` answers: an object, not a bare list. */
export interface NearbyResult {
  offers: Offer[];
  search_center: { latitude: number; longitude: number };
  radius_km: number;
  total_found: number;
}

export type DeliveryPreference = 'PICKUP' | 'DELIVERY';

