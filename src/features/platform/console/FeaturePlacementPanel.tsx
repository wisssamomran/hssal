import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { BannerView, ErrorNote, Fact, PanelShell, TextInput, recorded } from '@/shared/ui/panel';
import { Banner } from '@/shared/ui/panel';
import { serverMessage } from '@/core/api/refusal';
import { getFeaturedOffers, getOffers, setOfferFeatured } from '@/features/marketplace/api';
import { Offer } from '@/features/marketplace/types';
import { offerStatusLabel } from '@/features/marketplace/labels';
import { featureDecisionMessage } from './offer-review';
import { formatDateTime } from '@/core/i18n';

/* ─────────────────────────── feature placement ───────────────────────────── */

/**
 * What the platform is promoting, and the hand on it.
 *
 * `offers.feature` is a separate capability from `offers.moderate` on purpose:
 * publishing a listing decides that it exists in the market, promoting one
 * decides that a thousand buyers see it before they search. A reviewer may do
 * the first without being handed the second, and the pin is stamped with the
 * account that placed it so the console can say who decided.
 *
 * Two lists, because the decision has two halves. The strip itself comes from
 * `GET /marketplace/offers/featured` — the server's order (newest pin first) and
 * the server's ceiling (`marketplace.featured_limit`), with nothing here able to
 * widen either. Candidates come from the public market list, which is already
 * only what a buyer may see; pinning anything else is refused by the route with
 * `OFFER_NOT_FEATUREABLE`, and that refusal is shown rather than smoothed over,
 * because a draft cannot be promoted and the console has to say so out loud.
 */
export const FeaturePlacementPanel: React.FC<{ onNotify?: (m: string) => void }> = ({ onNotify }) => {
  const [strip, setStrip] = useState<Offer[]>([]);
  const [ceiling, setCeiling] = useState<number | null>(null);
  const [livePins, setLivePins] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<Offer[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [featured, market] = await Promise.all([
      getFeaturedOffers(),
      getOffers({ search: search || undefined, sort_by: 'newest', per_page: 20 }),
    ]);

    if (featured.success && featured.data) {
      setStrip(featured.data.offers);
      setCeiling(featured.data.limit);
      setLivePins(featured.data.total_featured);
    } else {
      setStrip([]);
      setLoadError(serverMessage(featured, 'لم يُقرأ شريط العروض المميّزة.'));
    }

    setCandidates(market.success ? (market.data ?? []) : []);
    setLoading(false);
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  const place = async (offer: Offer, featured: boolean) => {
    setBusyId(offer.id);
    setBanner(null);
    const result = await setOfferFeatured(offer.id, featured);
    setBusyId(null);

    if (result.success) {
      setBanner({
        kind: 'ok',
        text: featured
          ? `ثبُت العرض في مقدمة الشريط باسم هذا الحساب: ${result.data?.title_ar ?? ''}`
          : `أُزيل التمييز عن ${result.data?.title_ar ?? 'هذا العرض'}؛ يعود إلى السوق كأي عرض آخر.`,
      });
      load();
      onNotify?.(featured ? 'أُضيف عرض إلى الشريط المميّز' : 'أُزيل عرض من الشريط المميّز');
      return;
    }

    // The refusals and what they mean for the listing in front of the operator are
    // read once, in `offer-review.ts`: a listing that is not published cannot be
    // promoted, and that sentence belongs with the rule rather than with this table.
    setBanner({ kind: 'error', text: featureDecisionMessage(result) });
  };

  const pinnedIds = new Set(strip.map((offer) => offer.id));

  return (
    <PanelShell
      title="ترويج العروض في أعلى السوق"
      hint="ما يظهر في شريط «اختيار المنصة» عند كل زائر تقرّره هذه اللوحة وحدها. السقف عددٌ من إعدادات المنصة لا تطلبه الشاشة، والترتيب أحدث التثبيتين أولاً؛ وعرضٌ يبيع كميته أو يتجاوز تاريخه يغادر الشريط من نفسه لأن قائمة السوق هي التي تُقرأ."
    >
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
        <Fact label="سقف الشريط (من إعدادات المنصة)" value={ceiling !== null ? `${ceiling} عرضًا` : 'لم تُقرأ بعد'} />
        <Fact label="معروضات مثبّتة تفي بشروط السوق" value={livePins !== null ? `${livePins}` : 'لم يُردّ بعدد'} />
        <button
          onClick={load}
          className="flex w-full items-center justify-center gap-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg px-3 py-2 hover:bg-slate-50 cursor-pointer sm:w-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>تحديث</span>
        </button>
      </div>

      <BannerView banner={banner} />
      {loadError && <ErrorNote text={loadError} />}
      {loading && <p className="text-xs text-slate-400">جارٍ التحميل…</p>}

      {/* 1. The strip as the market reads it. */}
      <div className="space-y-2">
        <h4 className="text-xs font-black text-slate-900">الشريط الآن، بترتيبه</h4>
        {!strip.length && !loading && (
          <p className="text-[11px] text-slate-500">
            لا عرض مثبّتًا اليوم؛ الشريط لا يظهر للزوّار ولا يُترك مكانه فراغ.
          </p>
        )}
        <ol className="space-y-2">
          {strip.map((offer, position) => (
            <li
              key={offer.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 w-6 h-6 grid place-items-center rounded-full bg-emerald-700 text-white text-[11px] font-black">
                  {position + 1}
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">{offer.title_ar}</div>
                  <div className="text-[10px] text-slate-500 truncate">
                    {recorded(offer.seller_name_ar || offer.seller_name_en)} · ثُبّت {recorded(formatDateTime(offer.featured_at, 'ar'))}
                    {offer.featured_by ? ` · بواسطة ${offer.featured_by.name}` : ''}
                  </div>
                </div>
              </div>
              <button
                onClick={() => place(offer, false)}
                disabled={busyId === offer.id}
                className="shrink-0 text-[11px] font-bold text-slate-700 bg-white border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-100 cursor-pointer disabled:opacity-40"
              >
                إزالة من الشريط
              </button>
            </li>
          ))}
        </ol>
      </div>

      {/* 2. What else the market is showing, so a pin can be placed by name. */}
      <div className="space-y-2">
        <h4 className="text-xs font-black text-slate-900">اعرض منشورًا في السوق لتثبيته</h4>
        <TextInput label="بحث بالاسم أو SKU" value={search} onChange={setSearch} placeholder="اسم الصنف أو عنوان العرض" wide />
        <ul className="space-y-2">
          {candidates.map((offer) => (
            <li
              key={offer.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 truncate">{offer.title_ar}</div>
                <div className="text-[10px] text-slate-500 truncate">
                  {recorded(offer.product_name_ar)} · {recorded(offer.warehouse_city)} · {offerStatusLabel(offer.status)} · #{offer.id}
                </div>
              </div>
              {pinnedIds.has(offer.id) ? (
                <span className="shrink-0 text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
                  في الشريط
                </span>
              ) : (
                <button
                  onClick={() => place(offer, true)}
                  disabled={busyId === offer.id}
                  className="shrink-0 text-[11px] font-bold text-white bg-emerald-600 rounded-lg px-3 py-1.5 hover:bg-emerald-700 cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>تثبيته في المقدمة</span>
                </button>
              )}
            </li>
          ))}
        </ul>
        {!candidates.length && !loading && (
          <p className="text-[11px] text-slate-500">لا نتائج منشورة مطابقة للبحث الحالي.</p>
        )}
      </div>
    </PanelShell>
  );
};
