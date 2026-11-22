import React from 'react';
import { Clock, MessageCircle, Package, Shield, X } from 'lucide-react';
import { formatMoney, opportunityReasonLabel } from '@/core/config';
import { formatDate, localizedField, type Locale } from '@/core/i18n';
import { OfferLikeButton, OfferThread } from '@/features/community/components/OfferCommunity';
import { availableSharePercent } from '@/features/marketplace/offer';
import {
  offerDisplayName,
  sellerLabel,
  sellerStatusLabel,
  sellerStatusStyle,
} from '@/features/marketplace/labels';
import type { Offer } from '@/features/marketplace/types';

/** The badge style only; the reason codes and their labels come from the server. */
const REASON_CHIP_STYLE = 'bg-emerald-50 text-emerald-800 border-emerald-200';

/**
 * One listing, as a buyer meets it.
 *
 * A card answers four questions in the order a buyer asks them: what is it, who is
 * selling it, how much of it is really there, and what a unit costs. Everything else
 * on the surface — the reason the seller cleared stock, the distance, the expiry —
 * qualifies one of those four, which is why it sits beside the line it belongs to
 * rather than in a row of its own.
 *
 * Two reading rules are the whole reason this file exists rather than the markup
 * living in the screen:
 *
 *   - names are read through `offerDisplayName` / `localizedField`, preferring the
 *     language on screen and falling back to the other column, because sellers fill
 *     whichever they work in and either column may be null;
 *   - the stock bar shows `availableSharePercent`, the share of what the listing
 *     declared that is still on the shelf. A bar computed per screen is a bar that
 *     disagrees with the number beside it.
 *
 * The interest and question controls are only drawn when the platform has the
 * `community` capability on and the screen chose to offer them; a button that leads
 * to a refusal teaches people the screen is decorative.
 */
export const OfferCard: React.FC<{
  offer: Offer;
  locale: Locale;
  /** The seller's own name is public information about a listing; the buyer's is not. */
  signedIn: boolean;
  communityOn: boolean;
  liked: boolean;
  likeBusy: boolean;
  threadOpen: boolean;
  onAsk: (offer: Offer) => void;
  onToggleLike: (offer: Offer) => void;
  /** Opens this card's thread — the screen keeps one open thread, so the id travels out. */
  onOpenThread: (offerId: number) => void;
  /** Closes it. There is no sentinel id: a card that closed another thread would be a bug nobody could read. */
  onCloseThread: () => void;
  onQuestionsChange: (offerId: number, count: number) => void;
}> = ({
  offer,
  locale,
  signedIn,
  communityOn,
  liked,
  likeBusy,
  threadOpen,
  onAsk,
  onToggleLike,
  onOpenThread,
  onCloseThread,
  onQuestionsChange,
}) => {
  const name = offerDisplayName(offer, locale);
  const variantName = localizedField(offer, 'variant_name', locale);
  const brandName = localizedField(offer, 'brand_name', locale);
  const seller = sellerLabel(offer, locale);

  const coverImage = offer.product_cover_image || offer.product_image || offer.variant_image;
  const cover = typeof coverImage === 'string' ? coverImage : '';
  const warehouse = [offer.warehouse_city, offer.warehouse_name].filter(Boolean).join(' — ');
  const where = warehouse || (locale === 'en' ? 'Warehouse not recorded' : 'مستودع غير محدد');
  const availablePct = availableSharePercent(offer);
  const expiry = offer.expiry_date ? formatDate(offer.expiry_date, locale) : '';

  return (
    <div className="group flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white transition-all hover:border-emerald-400 hover:shadow-md dark:border-hassal-line dark:bg-hassal-surface">
      <div>
        {/* Cover, reason, brand, and where the stock physically is */}
        <div className="relative h-48 overflow-hidden bg-slate-100">
          {cover ? (
            <img
              src={cover}
              alt={name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-50 text-slate-400">
              <Package className="h-8 w-8" />
              <span className="text-[10px] font-medium">لا صورة مرفقة بهذا الصنف</span>
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent"></div>

          <div className="absolute left-3 right-3 top-3 flex flex-wrap items-start justify-between gap-1.5">
            <span
              className={`max-w-full rounded-md border px-2 py-0.5 text-[10px] font-bold shadow-2xs ${REASON_CHIP_STYLE}`}
            >
              {opportunityReasonLabel(offer.opportunity_reason, locale)}
            </span>
            {brandName && (
              <span className="max-w-full truncate rounded bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-xs">
                ماركة {brandName}
              </span>
            )}
          </div>

          <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between gap-2 text-xs text-white">
            <div className="flex min-w-0 items-center gap-1 font-medium drop-shadow-sm">
              <span className="truncate" title={where}>
                {where}
              </span>
            </div>

            {offer.distance_km !== undefined && offer.distance_km !== null && (
              <span className="shrink-0 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-bold text-white">
                يبعد {offer.distance_km} كم
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3 p-4">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-sm font-bold leading-snug text-slate-900 dark:text-slate-100" title={name}>
              {name}
            </h3>
            {/* A seller with a single variant usually names it after the product
                itself, and then this line only echoes the heading above it. The code
                is what tells two listings apart, so when the names match the card
                keeps the code and drops the echo. */}
            <p className="break-words pt-0.5 text-xs font-medium text-slate-500">
              {variantName && variantName !== name ? `${variantName} • ` : ''}كود: {offer.variant_sku}
            </p>
          </div>

          {/* Who is selling, and how far the platform has come with reviewing them */}
          <div className="space-y-1.5 rounded-lg border border-slate-100 bg-slate-50 p-2 text-[11px]">
            <div className="flex min-w-0 items-center gap-1.5 text-slate-700 dark:text-slate-200">
              <Shield
                className={`h-3.5 w-3.5 shrink-0 ${
                  offer.seller_status === 'verified' ? 'text-emerald-600' : 'text-slate-400'
                }`}
              />
              <span
                className={`min-w-0 truncate font-semibold ${seller.hidden ? 'italic text-slate-500' : ''}`}
                title={seller.text}
              >
                {seller.text}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${sellerStatusStyle(
                  offer.seller_status
                )}`}
              >
                {sellerStatusLabel(offer.seller_status)}
              </span>
              <span className="shrink-0 text-slate-500">
                {offer.seller_rating === null || offer.seller_rating === undefined
                  ? 'لا تقييم'
                  : `تقييم ${offer.seller_rating}`}
              </span>
            </div>
          </div>

          {/* What is actually on the shelf, against what the listing declared */}
          <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 text-slate-500">المخزون المتاح حالياً:</span>
              <span className="shrink-0 font-bold text-slate-900 dark:text-slate-100">
                {offer.available_quantity} {offer.unit}
              </span>
            </div>

            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
              title={`${availablePct.toFixed(1)}% من الكمية الأصلية متاح`}
            >
              <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${availablePct}%` }}></div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pt-1 text-[11px] text-slate-500">
              <span>الحد الأدنى للطلب (MOQ): {offer.min_order_quantity}</span>
              {offer.expiry_date && expiry && (
                <span className="flex items-center gap-1 text-slate-600">
                  <Clock className="h-3 w-3 shrink-0 text-amber-500" />
                  انتهاء: {expiry}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* The ask is the one thumb-width button on a phone; interest and questions
          sit under it, because they record an intention and not a purchase. */}
      <div className="space-y-2.5 border-t border-slate-100 bg-slate-50/50 p-4 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <div className="text-[11px] text-slate-400">سعر الوحدة كما نشره البائع</div>
            <span className="font-serif text-lg font-black text-emerald-700">
              {formatMoney(offer.unit_price, offer.currency_code)}
            </span>
          </div>

          <button
            onClick={() => onAsk(offer)}
            className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-emerald-700 active:scale-98 sm:w-auto sm:py-2"
          >
            <span>طلب شراء من المتاح</span>
          </button>
        </div>

        {communityOn && (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5">
            <OfferLikeButton
              offer={offer}
              liked={liked}
              busy={likeBusy}
              count={offer.likes_count}
              signedIn={signedIn}
              onToggle={() => onToggleLike(offer)}
            />

            <button
              onClick={() => (threadOpen ? onCloseThread() : onOpenThread(offer.id))}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 transition-all hover:bg-slate-100"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              <span>أسئلة{offer.comments_count !== undefined ? ` (${offer.comments_count})` : ''}</span>
            </button>
          </div>
        )}
      </div>

      {communityOn && threadOpen && (
        <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="min-w-0 text-[11px] font-bold text-slate-800 dark:text-slate-100">
              أسئلة منشورة على هذا العرض
            </h4>
            <button
              type="button"
              onClick={onCloseThread}
              className="shrink-0 cursor-pointer text-xs font-bold text-slate-400 hover:text-slate-700"
              title="إغلاق"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-[10px] leading-relaxed text-slate-500">
            التعليقات تُنسب إلى منشؤها، وردّ الشركة البائعة يعلَّم «من البائع». لا تُخزَّن المنصة تقييمات ولا نجومًا.
          </p>
          <OfferThread offer={offer} signedIn={signedIn} onCountChange={(count) => onQuestionsChange(offer.id, count)} />
        </div>
      )}
    </div>
  );
};
