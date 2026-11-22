import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Package } from 'lucide-react';
import { getToken } from '@/core/api/http';
import { GEO_FAILURE_NOTES, geoReadingNote, readDeviceLocation } from '@/core/geo';
import { isFeatureEnabled, usePlatformConfig } from '@/core/config';
import { getCategories } from '@/features/catalog/api';
import type { Category } from '@/features/catalog/types';
import { useOfferCommunity } from '@/features/community/components/OfferCommunity';
import { getNearbyOffers, getOffers } from '@/features/marketplace/api';
import {
  emptyGeoSearch,
  emptyMarketFilters,
  marketFiltersAreActive,
  matchingOffers,
  nearbyAsk,
  supplierNames,
  type GeoSearch,
  type MarketFilters,
} from '@/features/marketplace/discovery';
import { normalizeOffer } from '@/features/marketplace/offer';
import type { Offer, OfferSortIntent } from '@/features/marketplace/types';
import type { Locale } from '@/core/i18n';
import type { PurchaseRequest } from '@/features/trading/types';
import { BannerView } from '@/shared/ui/panel';
import BrandMark from '@/shared/ui/BrandMark';
import { CategoryPillRow } from '@/features/marketplace/components/CategoryPillRow';
import { GeoSearchPanel } from '@/features/marketplace/components/GeoSearchPanel';
import { MarketFilterBar } from '@/features/marketplace/components/MarketFilterBar';
import { MarketplaceHero } from '@/features/marketplace/components/MarketplaceHero';
import { OfferCard } from '@/features/marketplace/components/OfferCard';
import PromotedStrip from '@/features/marketplace/components/PromotedStrip';
import { OrderRequestSheet } from '@/features/trading/components/OrderRequestSheet';

interface MarketplaceViewProps {
  onOrderSuccess: (purchaseRequest: PurchaseRequest) => void;
  locale?: Locale;
  /**
   * Interest belongs to the business in context, not to the person, so switching
   * organizations must reload the set that fills the buttons in.
   */
  currentPersonaId?: string;
  /**
   * Open the sign-in modal. A guest clicking a like is not an error to report —
   * it is intent to act — so the card asks them to sign in rather than sending a
   * request the server would refuse.
   */
  onRequireSignIn?: () => void;
  onOpenCommercial?: () => void;
}

/**
 * A coordinates box is typed a digit at a time, and "24" then "24.7" are two
 * searches the buyer never asked for. Every trigger of the server read waits this
 * long; a dropdown or a toggle still feels immediate, and one request per search
 * replaces six.
 */
const REFRESH_DEBOUNCE_MS = 350;

/**
 * The market, as a buyer meets it.
 *
 * This screen holds state and nothing else. What a filter keeps (`matchingOffers`),
 * what a distance search needs before it may run (`nearbyAsk`), what a listing's
 * quantities mean (`normalizeOffer`), what an ask may send and what each refusal
 * means (`features/trading/order-request`) and what anything is called
 * (`features/marketplace/labels`) are decided in those modules — because those are
 * answers the shelf, the promoted strip and any future listing page also need, and
 * a screen that owns one of them privately is a rule nobody else can find.
 *
 * Two boundaries here are deliberate and would not be obvious in a review:
 *
 *   - paging, ordering and distance arithmetic stay on the server. The buyer's
 *     `sort_by` leaves as a query parameter; the search box and the chips narrow
 *     only the page that came back, and the bar says exactly that beside the count.
 *   - the browser's location is offered, never taken. `readDeviceLocation` asks, and
 *     a refusal leaves the manual route open in the same sentence.
 *
 * What is left for this file is what only a screen can own: which requests to make,
 * when to make them, and which inputs belong to one state object rather than seven.
 */
export const MarketplaceView: React.FC<MarketplaceViewProps> = ({
  onOrderSuccess,
  locale = 'ar',
  currentPersonaId = '',
  onRequireSignIn,
  onOpenCommercial,
}) => {
  const config = usePlatformConfig();

  // The like and comment routes are `auth:sanctum` and behind the `community`
  // capability; offering their buttons to a guest, or in a deployment that
  // switched the capability off, would only produce refusals.
  const signedIn = Boolean(getToken());
  // No flags at all means the bootstrap response has not arrived; that is not
  // the operator switching anything off. The server gates the action either
  // way, so an unread flag must not hide a door that is open.
  const flagsRead = Object.keys(config.featureFlags ?? {}).length > 0;
  const communityOn = !flagsRead || isFeatureEnabled('community');

  const { likedIds, busyId, notice: communityNotice, toggleLike, clearNotice } = useOfferCommunity(
    signedIn && communityOn,
    currentPersonaId
  );

  const [offers, setOffers] = useState<Offer[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  /** The narrowings live in one object: seven separate states could be cleared one at a time and leave a live filter nobody can see. */
  const [filters, setFilters] = useState<MarketFilters>(emptyMarketFilters);
  const [sortBy, setSortBy] = useState<OfferSortIntent>('newest');

  const [geo, setGeo] = useState<GeoSearch>(emptyGeoSearch);
  const [geoReading, setGeoReading] = useState(false);

  const [openThreadFor, setOpenThreadFor] = useState<number | null>(null);
  const [askOffer, setAskOffer] = useState<Offer | null>(null);

  // Reference data, read once. It used to ride along with every market search, so
  // typing one coordinate asked the server for the category list half a dozen times.
  useEffect(() => {
    void getCategories().then((result) => {
      if (result.success && result.data) setCategories(result.data);
    });
  }, []);

  const patchFilters = useCallback(
    (patch: Partial<MarketFilters>) => setFilters((previous) => ({ ...previous, ...patch })),
    []
  );

  const resetFilters = useCallback(() => setFilters(emptyMarketFilters()), []);

  const patchGeo = useCallback((patch: Partial<GeoSearch>) => setGeo((previous) => ({ ...previous, ...patch })), []);

  /** Collapsing the panel is how a note is dismissed, so what it said must not survive the fold. */
  const toggleGeo = useCallback(() => {
    setGeo((previous) => ({ ...previous, enabled: !previous.enabled, note: null }));
  }, []);

  /**
   * Ask the server for the page the buyer is on.
   *
   * The two branches answer different endpoints — `nearby` with a circle, the plain
   * list with an order — but both end the same way: rows pass through
   * `normalizeOffer`, because the API sends quantities as decimal strings and a
   * string breaks the stock bar, the price comparison and the ask's clamping the
   * moment a card reads it.
   */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (geo.enabled) {
        const ask = nearbyAsk(geo.point, geo.radiusKm);
        if (ask.kind === 'blocked') {
          setOffers([]);
          setGeo((previous) => ({ ...previous, note: { tone: 'warn', text: ask.problem } }));
          return;
        }

        const nearby = await getNearbyOffers(ask.lat, ask.lon, { radius_km: ask.radiusKm });
        if (nearby.success && nearby.data) {
          setOffers(nearby.data.offers.map(normalizeOffer));
          setGeo((previous) => ({
            ...previous,
            // A browser reading the buyer just accepted stays on screen; an empty
            // circle says so, because "no offers" without a radius beside it reads
            // as an empty market rather than a small one.
            note:
              previous.note?.tone === 'ok'
                ? previous.note
                : nearby.data!.total_found === 0
                  ? {
                      tone: 'warn',
                      text: `لم يجد الخادم عروضاً داخل ${nearby.data!.radius_km} كم من النقطة المحددة.`,
                    }
                  : null,
          }));
        } else {
          setOffers([]);
          setGeo((previous) => ({
            ...previous,
            note: {
              tone: 'warn',
              text: nearby.error?.message ?? 'رفض الخادم طلب الأقرب؛ تحقق من الإحداثيات ونصف القطر.',
            },
          }));
        }
        return;
      }

      const result = await getOffers({ sort_by: sortBy });
      if (result.success && result.data) setOffers(result.data.map(normalizeOffer));
    } finally {
      setLoading(false);
    }
    // The primitives rather than the `geo` object: writing a note is not a new
    // search, and a point's label is not one of its coordinates.
  }, [geo.enabled, geo.point.lat, geo.point.lon, geo.radiusKm, sortBy]);

  useEffect(() => {
    const handle = window.setTimeout(() => void loadData(), REFRESH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [loadData]);

  /** The browser's own position, taken only because the buyer asked for it. */
  const useDeviceLocation = useCallback(async () => {
    setGeoReading(true);
    const result = await readDeviceLocation();
    setGeoReading(false);

    if (result.kind === 'failure') {
      setGeo((previous) => ({ ...previous, note: { tone: 'warn', text: GEO_FAILURE_NOTES[result.failure] } }));
      return;
    }

    setGeo((previous) => ({
      ...previous,
      point: {
        lat: result.reading.latitude,
        lon: result.reading.longitude,
        label: 'موقعي الحالي (من المتصفح)',
      },
      // The note repeats the point with its uncertainty: a buyer shown
      // "24.7136، 46.6753 (± 12 م)" can see what the search will measure from.
      note: { tone: 'ok', text: geoReadingNote(result.reading) },
    }));
  }, []);

  /**
   * The count comes back from the server rather than being incremented here:
   * two buyers clicking at the same moment must converge on one number, and a
   * refusal must leave the card exactly as it was.
   */
  const handleToggleLike = useCallback(
    async (offer: Offer) => {
      if (!signedIn) {
        onRequireSignIn?.();
        return;
      }
      const count = await toggleLike(offer);
      if (count === null) return;
      setOffers((previous) => previous.map((row) => (row.id === offer.id ? { ...row, likes_count: count } : row)));
    },
    [signedIn, onRequireSignIn, toggleLike]
  );

  /** The same rule for the question count: the thread reloaded, so the card shows what the server says now. */
  const handleQuestionsChange = useCallback((offerId: number, count: number) => {
    setOffers((previous) => previous.map((row) => (row.id === offerId ? { ...row, comments_count: count } : row)));
  }, []);

  const suppliers = useMemo(() => supplierNames(offers), [offers]);

  const narrowingIsLive = marketFiltersAreActive(filters) || geo.enabled;

  const visibleOffers = useMemo(
    () => matchingOffers(offers, filters, { categories, likedIds, locale }),
    [offers, filters, categories, likedIds, locale]
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-3 py-6 sm:space-y-6 sm:px-6 lg:px-8">
      {/* The platform's own promotions, above everything a buyer might reach for.
          The strip reads its list from the server and renders nothing when the
          platform has pinned nothing today, so this costs the page no gap. */}
      <PromotedStrip locale={locale} onOrder={setAskOffer} />

      <MarketFilterBar
        filters={filters}
        onPatch={patchFilters}
        onReset={resetFilters}
        sortBy={sortBy}
        onSortChange={setSortBy}
        categories={categories}
        suppliers={suppliers}
        resultCount={visibleOffers.length}
        totalCount={offers.length}
        locale={locale}
        interestFilterAvailable={signedIn && communityOn}
        likedCount={likedIds.size}
      />

      <MarketplaceHero onOpenCommercial={onOpenCommercial} />

      {/* The two browses a thumb does before anyone reaches for the keyboard:
          a category, or a distance. They share a card because they are one kind of
          decision — narrow this page without typing in it. */}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs dark:border-hassal-line dark:bg-hassal-surface sm:p-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <CategoryPillRow
            categories={categories}
            selectedId={filters.categoryId}
            onSelect={(categoryId) => patchFilters({ categoryId })}
            locale={locale}
          />

          <GeoSearchPanel
            geo={geo}
            maxRadiusKm={config.maxNearbyRadiusKm}
            reading={geoReading}
            onToggle={toggleGeo}
            onUseDeviceLocation={() => void useDeviceLocation()}
            onPatch={patchGeo}
          />
        </div>

        {geo.note && <BannerView banner={{ kind: geo.note.tone, text: geo.note.text }} />}
      </div>

      {/* What the server refused about interest or questions — its own wording,
          dismissible, and above the cards the reader might blame for it. */}
      {communityNotice && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs dark:border-amber-800 dark:bg-amber-950/40">
          <span className="leading-relaxed text-amber-900 dark:text-amber-200">{communityNotice}</span>
          <button
            type="button"
            onClick={clearNotice}
            className="shrink-0 cursor-pointer font-bold text-amber-800 underline hover:text-amber-950"
          >
            إخفاء
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3 py-20 text-center">
          {/* The mark breathing, rather than a detached spinner: this is the
              screen a buyer judges the whole platform on, and it is the one
              place they wait. */}
          <BrandMark size={44} label="حصّال" className="mx-auto animate-pulse" />
          <p className="text-xs font-medium text-slate-500">جارٍ فحص وتحديث أسعار وعروض المخزون...</p>
        </div>
      ) : visibleOffers.length === 0 ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-hassal-line dark:bg-hassal-surface sm:p-12">
          <Package className="mx-auto h-12 w-12 text-slate-300" />
          {/* An empty market and an empty filter result are different facts, and a
              buyer who is shown the first when the truth is the second stops
              browsing a platform they never actually searched. */}
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            {narrowingIsLive ? 'لا عروض مطابقة لما حدّدته الآن' : 'لا عروض منشورة على المنصة بعد'}
          </h3>
          <p className="mx-auto max-w-md text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {narrowingIsLive
              ? 'التصفية تعمل على الصفحة التي وصلت من الخادم وحدها؛ جرّب توسيع نص البحث، أو مسح التصنيف، أو زيادة نصف القطر.'
              : 'تنشر المؤسسات مخزونها هنا تباعاً، وتتغير الكمية والسعر في أي لحظة.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
          {visibleOffers.map((offer) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              locale={locale}
              signedIn={signedIn}
              communityOn={communityOn}
              liked={likedIds.has(offer.id)}
              likeBusy={busyId === offer.id}
              threadOpen={openThreadFor === offer.id}
              onAsk={setAskOffer}
              onToggleLike={(target) => void handleToggleLike(target)}
              onOpenThread={setOpenThreadFor}
              onCloseThread={() => setOpenThreadFor(null)}
              onQuestionsChange={handleQuestionsChange}
            />
          ))}
        </div>
      )}

      {/* The ask lives in `trading`: it is the same sheet the promoted strip opens,
          and its quantity rules and refusal words belong to the server's contract,
          not to this screen. */}
      {askOffer && (
        <OrderRequestSheet
          offer={askOffer}
          locale={locale}
          onCreated={(request) => {
            setAskOffer(null);
            onOrderSuccess(request);
            // The listing may have moved while the dialog was open; what the next
            // buyer reads is the quantity the server just answered with.
            void loadData();
          }}
          onClose={() => setAskOffer(null)}
        />
      )}
    </div>
  );
};
