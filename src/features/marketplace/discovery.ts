import { opportunityReasonLabel } from '@/core/config';
import type { Locale } from '@/core/i18n';
import type { Category } from '@/features/catalog/types';
import type { Offer } from './types';

/**
 * Finding a listing: the scope a buyer searches in, the filters they narrow with,
 * and the point a distance search is measured from.
 *
 * This is the market screen's business logic, and it lives here rather than in the
 * component because a screen is not the only thing that will ever want it: the same
 * tests decide whether a card appears, whether the "مسح الفلاتر" button shows, and
 * whether the count beside the heading is honest. Written inside a `useMemo`, those
 * answers could only be read off one screen — and the last time this file's rules
 * lived in a screen, the same filter existed twice in the same page with slightly
 * different wording for the same scope.
 *
 * What stays on the server is the server's: paging, ordering, and the distance
 * arithmetic of `GET /marketplace/offers/nearby`. The filters here only narrow the
 * listings that page handed over, and that limit is stated on screen rather than
 * hidden — a buyer who reads "نتائج التصفية" as "كل عروض المنصة" is being misled by
 * a screen, not by a market.
 */

/**
 * Which columns a search term is allowed to answer for.
 *
 * `all` is the default because a buyer who does not know whether "دواجن" is a
 * category or a product name should not have to guess to get a result.
 */
export type SearchTarget = 'all' | 'name' | 'category' | 'supplier';

/** The order a buyer is asked to read them in. */
export const SEARCH_TARGETS: readonly SearchTarget[] = ['all', 'name', 'category', 'supplier'];

/** The tab a buyer clicks. */
export const SEARCH_TARGET_TAB_LABELS: Record<SearchTarget, string> = {
  all: 'بحث شامل',
  name: 'اسم المادة',
  category: 'التصنيف',
  supplier: 'المورد / البائع',
};

/** The same scope, in the few words a chip can carry. */
export const SEARCH_TARGET_CHIP_LABELS: Record<SearchTarget, string> = {
  all: 'بحث',
  name: 'اسم المادة',
  category: 'التصنيف',
  supplier: 'المورد',
};

export const SEARCH_TARGET_PLACEHOLDERS: Record<SearchTarget, string> = {
  all: 'ابحث بالاسم أو التصنيف أو المورد أو الرمز',
  name: 'اسم الصنف أو الماركة أو رمز SKU',
  category: 'اسم التصنيف كما هو مسجَّل',
  supplier: 'اسم المؤسسة البائعة أو رقم سجلها',
};

/** Everything the market narrows by, in one object: the screen holds one state, not seven. */
export interface MarketFilters {
  query: string;
  target: SearchTarget;
  categoryId: number | null;
  supplier: string;
  /** An `opportunity_reason` code from the platform's own list. */
  reason: string;
  maxPrice: number | '';
  /** Listings this organization recorded interest in — the ids come from the server. */
  onlyLiked: boolean;
}

export function emptyMarketFilters(): MarketFilters {
  return { query: '', target: 'all', categoryId: null, supplier: '', reason: '', maxPrice: '', onlyLiked: false };
}

/** Whether the reset button has anything to do. */
export function marketFiltersAreActive(filters: MarketFilters): boolean {
  return Boolean(
    filters.query.trim() ||
    filters.target !== 'all' ||
    filters.categoryId !== null ||
    filters.supplier !== '' ||
    filters.reason !== '' ||
    filters.maxPrice !== '' ||
    filters.onlyLiked
  );
}

export interface MarketFilterContext {
  /** The platform's categories, needed because a listing may carry only a name. */
  categories: Category[];
  likedIds: ReadonlySet<number>;
  locale: Locale;
}

/**
 * Which of the loaded listings the buyer's filters keep.
 *
 * The order is deliberate — the cheap equality tests first, the text scan last —
 * but every test is written against both language columns of whatever it reads.
 * A seller records in the language they work in and a buyer types in the one they
 * think in, and the API keeps either column null: matching only `product_name_ar`
 * answers "لا نتائج" to someone who typed the Latin spelling that is sitting in the
 * row, and the reverse does the same to the Arabic one.
 */
export function matchingOffers(offers: Offer[], filters: MarketFilters, context: MarketFilterContext): Offer[] {
  const { categories, likedIds, locale } = context;
  const query = filters.query.toLowerCase().trim();
  const selectedCategory = filters.categoryId === null ? null : categories.find((c) => c.id === filters.categoryId) ?? null;

  return offers.filter((offer) => {
    if (filters.categoryId !== null) {
      // `category_id` is what the offer rows carry; the name comparison is for the
      // endpoints that hand back a joined name without the key.
      const nameForLocale = selectedCategory ? (locale === 'en' ? selectedCategory.name_en : selectedCategory.name_ar) : undefined;
      if (
        offer.category_id !== filters.categoryId &&
        offer.category_name_ar !== nameForLocale &&
        offer.category_name_en !== selectedCategory?.name_en
      ) {
        return false;
      }
    }

    if (filters.supplier && offer.seller_name_ar !== filters.supplier) return false;

    if (filters.reason && offer.opportunity_reason !== filters.reason) return false;

    if (filters.onlyLiked && !likedIds.has(offer.id)) return false;

    if (filters.maxPrice !== '' && Number(offer.unit_price) > Number(filters.maxPrice)) return false;

    if (query) {
      const says = (...values: Array<string | null | undefined>) =>
        values.some((value) => typeof value === 'string' && value.toLowerCase().includes(query));

      if (filters.target === 'name') {
        if (
          !says(
            offer.product_name_ar,
            offer.product_name_en,
            offer.variant_name_ar,
            offer.variant_name_en,
            offer.brand_name_ar,
            offer.brand_name_en,
            offer.variant_sku
          )
        )
          return false;
      } else if (filters.target === 'category') {
        if (!says(offer.category_name_ar, offer.category_name_en)) return false;
      } else if (filters.target === 'supplier') {
        if (!says(offer.seller_name_ar, offer.seller_name_en, offer.seller_cr)) return false;
      } else if (
        !says(
          offer.product_name_ar,
          offer.product_name_en,
          offer.variant_name_ar,
          offer.variant_name_en,
          offer.category_name_ar,
          offer.category_name_en,
          offer.seller_name_ar,
          offer.seller_name_en,
          offer.brand_name_ar,
          offer.brand_name_en,
          offer.variant_sku,
          offer.warehouse_city
        )
      )
        return false;
    }

    return true;
  });
}

/**
 * The businesses that appear in what is loaded, as the supplier dropdown.
 *
 * Read off `seller_name_ar` because that is the column the filter compares against:
 * offering a name the test cannot match would be a dropdown that filters to nothing.
 */
export function supplierNames(offers: Offer[]): string[] {
  const names = new Set<string>();
  offers.forEach((offer) => {
    if (offer.seller_name_ar) names.add(offer.seller_name_ar);
  });
  return Array.from(names);
}

/** The chip's own words for a reason code, from the platform's list, never invented here. */
export function reasonChip(code: string, locale: Locale): string {
  return `الفرصة: ${opportunityReasonLabel(code, locale)}`;
}

/**
 * A coordinate pair the buyer either granted or typed.
 *
 * There is no default point on purpose: a market that quietly centres itself on one
 * city tells a buyer "nothing is near you" about a place they never chose.
 */
export interface GeoPoint {
  lat: number | null;
  lon: number | null;
  label: string;
}

export const NO_GEO_POINT: GeoPoint = { lat: null, lon: null, label: '' };

/**
 * What the distance search has to say about itself.
 *
 * A tone travels with the sentence because the screen cannot tell them apart:
 * "قرأ المتصفح 24.7، 46.7" is the browser having answered, and "رفض المتصفح مشاركة
 * الموقع" is the same button producing a refusal. Rendering the first in the colour
 * of the second would tell a buyer their own location is an error.
 */
export interface GeoNote {
  tone: 'ok' | 'warn';
  text: string;
}

/** The whole distance search, as one piece of screen state. */
export interface GeoSearch {
  enabled: boolean;
  point: GeoPoint;
  radiusKm: number | '';
  note: GeoNote | null;
}

export function emptyGeoSearch(): GeoSearch {
  return { enabled: false, point: NO_GEO_POINT, radiusKm: '', note: null };
}

/**
 * What a distance search needs, or the reason it cannot run.
 *
 * A `kind` discriminant rather than `ok: boolean`: this project compiles without
 * `strictNullChecks`, and TypeScript does not narrow a union on a boolean literal
 * in that mode — the second branch would read as a type error on `.problem`.
 */
export type NearbyAsk =
  | { kind: 'ask'; lat: number; lon: number; radiusKm: number }
  | { kind: 'blocked'; problem: string };

export function nearbyAsk(point: GeoPoint, radiusKm: number | ''): NearbyAsk {
  if (point.lat === null || point.lon === null || radiusKm === '' || !Number.isFinite(Number(radiusKm))) {
    return {
      kind: 'blocked',
      problem: 'البحث بالمسافة يحتاج إحداثيات لديك ونصف قطر. حدّدهما أو اطلب من المتصفح تحديد موقعك.',
    };
  }
  return { kind: 'ask', lat: point.lat, lon: point.lon, radiusKm: Number(radiusKm) };
}
