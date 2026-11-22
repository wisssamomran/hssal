import React, { useState } from 'react';
import {
  Building2,
  Calendar,
  DollarSign,
  FileText,
  MapPin,
  Package,
  Target,
} from 'lucide-react';
import { formatMoney, num } from '@/core/config';
import { explainRefusal } from '@/core/api/refusal';
import { formatDate, type Locale } from '@/core/i18n';
import { getDemandMatches } from '../api';
import {
  DEMAND_REFUSAL_CODES,
  buyerBusinessName,
  demandStatusLabel,
  demandStatusStyle,
  demandTitle,
  demandWindowClosed,
  quotationsArrived,
} from '../demand';
import type { Demand, DemandMatch } from '../types';
import { BannerView, DecisionButton, ErrorNote, type Banner } from '@/shared/ui/panel';
import { DemandMatchRow } from './DemandMatchRow';
import { DemandQuotationForm } from './DemandQuotationForm';
import { DemandQuotationRow } from './DemandQuotationRow';

/**
 * One request on the board, and the two halves of the conversation around it.
 *
 * The row that answers "whose is this?" decides which half this card offers: the
 * buyer's sees a matches panel, because only the owning organization may read
 * `GET /demands/{id}/matches`, and everybody else sees a quotation form, because
 * `assertQuotable()` refuses the buyer their own price. The page computes
 * `isMine` once, from `demandBelongsTo`, so the two halves cannot disagree about
 * who is looking.
 *
 * The matches panel is a live read, not a cached list: `DemandController::matches()`
 * re-runs the engine on every request so the pairing reflects the shelf right now,
 * and the sentence under the button says so. Nothing here books stock — the ask this
 * panel can raise becomes a purchase request the seller decides on, elsewhere.
 */
export const DemandCard: React.FC<{
  demand: Demand;
  /** True for the business that published this ask; it is the buyer's half of the card. */
  isMine: boolean;
  categoryName: string | null;
  canQuote: boolean;
  canRequest: boolean;
  /** `demand_rfq` and `matching_engine` together: the route is gated by both. */
  matchingEnabled: boolean;
  locale: Locale;
  onChanged: () => void;
}> = ({ demand, isMine, categoryName, canQuote, canRequest, matchingEnabled, locale, onChanged }) => {
  const [open, setOpen] = useState<'none' | 'quote' | 'matches'>('none');
  const [matches, setMatches] = useState<DemandMatch[] | null>(null);
  const [matchesBusy, setMatchesBusy] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);

  // The window the buyer set, read against their own clock. The server's status
  // column is the authority — this only marks a date the reader is looking at.
  const windowClosed = demandWindowClosed(demand);
  const quotations = demand.quotations ?? [];
  const rating = demand.buyer_organization?.rating;

  const loadMatches = async () => {
    setMatchesBusy(true);
    setBanner(null);
    const result = await getDemandMatches(demand.id);
    setMatchesBusy(false);
    if (result.success) {
      setMatches(result.data?.matches ?? []);
      return;
    }
    setMatches(null);
    setBanner({
      kind: 'error',
      text: explainRefusal(result, { fallback: 'تعذّر حساب المطابقات', codes: DEMAND_REFUSAL_CODES }),
    });
  };

  const toggleMatches = () => {
    if (open === 'matches') {
      setOpen('none');
      return;
    }
    setOpen('matches');
    void loadMatches();
  };

  return (
    <div className="flex flex-col justify-between gap-3.5 rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
              {categoryName ?? 'تصنيف غير محدَّد'}
            </span>
            <h3 className="text-sm font-bold leading-snug text-slate-900">{demandTitle(demand, locale)}</h3>
            <p className="font-mono text-[10px] text-slate-400">
              {demand.demand_number}
              {isMine ? ' — طلب منشأتك' : ''}
            </p>
          </div>

          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${demandStatusStyle(demand.status)}`}>
            {demandStatusLabel(demand.status)}
          </span>
        </div>

        {demand.description ? (
          <p className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
            {demand.description}
          </p>
        ) : (
          <p className="text-xs text-slate-400">لم يُرفق وصف بالطلب.</p>
        )}

        {demand.special_requirements ? (
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-slate-600">
            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="min-w-0">
              <strong className="font-bold text-slate-700">شروط خاصة: </strong>
              {demand.special_requirements}
            </span>
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-1 text-xs text-slate-600">
        <div className="flex items-center gap-1.5">
          <Package className="h-3.5 w-3.5 text-emerald-600" />
          <span>
            الكمية: <strong>{num(demand.target_quantity)}</strong> {demand.unit}
          </span>
        </div>

        {demand.target_unit_price !== null && demand.target_unit_price !== undefined ? (
          <div className="flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
            <span>
              السعر المستهدف: <strong>{formatMoney(demand.target_unit_price, demand.currency_code)}</strong>
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-slate-400">
            <DollarSign className="h-3.5 w-3.5" />
            <span>بلا سعر مستهدف</span>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-slate-400" />
          <span>مدينة التسليم: {demand.delivery_city}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-amber-500" />
          <span>
            التوريد: {demand.target_delivery_date ? formatDate(demand.target_delivery_date, locale) : 'لم يُحدَّد'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5 text-slate-400" />
          <span>
            آخر لقبول العروض: {demand.expires_at ? formatDate(demand.expires_at, locale) : 'بلا موعد'}
            {windowClosed ? ' — انتهى' : ''}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 text-[11px]">
        <div className="flex min-w-0 items-center gap-1.5 text-slate-700">
          <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          <span className="truncate font-semibold">
            {isMine
              ? 'منشأتك'
              : buyerBusinessName(demand, locale)}
          </span>
        </div>
        {/* The rating column defaults to a number nobody earned and is null for every
            business since the correction; only a real score is printed. */}
        <span className="shrink-0 text-slate-500">
          {rating === null || rating === undefined ? 'لا تقييم مسجَّلاً' : String(rating)}
        </span>
      </div>

      <BannerView banner={banner} />

      <div className="flex flex-wrap items-center gap-2">
        {/* The gate is the status column alone, which is exactly the server's test:
            `assertQuotable()` looks at `status !== OPEN` and never at `expires_at`, so
            a demand whose date has passed but whose row is still OPEN takes quotes.
            A button hidden on the buyer's clock would be a door this screen invented. */}
        {!isMine && canQuote && demand.status === 'OPEN' ? (
          <DecisionButton onClick={() => setOpen(open === 'quote' ? 'none' : 'quote')}>
            {open === 'quote' ? 'إغلاق عرض السعر' : 'تقديم عرض سعر'}
          </DecisionButton>
        ) : null}

        {isMine ? (
          <DecisionButton onClick={toggleMatches} busy={matchesBusy}>
            {open === 'matches' ? 'إغلاق المطابقات' : 'مطابقات هذا الطلب'}
          </DecisionButton>
        ) : null}

        {isMine && quotations.length > 0 ? (
          <span className="text-[11px] text-slate-500">{quotationsArrived(quotations.length)}</span>
        ) : null}
      </div>

      {open === 'quote' ? (
        <DemandQuotationForm demand={demand} onDone={() => { setOpen('none'); onChanged(); }} />
      ) : null}

      {open === 'matches' && isMine ? (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          {!matchingEnabled ? (
            <ErrorNote text="مسار المطابقات يحتاج قدرتي demand_rfq وmatching_engine معاً؛ إحداهما معطّلة في هذه التهيئة." />
          ) : matchesBusy ? (
            <p className="text-xs text-slate-500">يعيد المحرك الحساب على المخزون الحالي…</p>
          ) : !matches || matches.length === 0 ? (
            <p className="text-xs text-slate-500">
              لا مطابقة قائمة الآن: لا عرض نشط يطابق التصنيف والكمية والحد الأدنى، أو استُخدمت مطابقات هذا الطلب سابقاً.
            </p>
          ) : (
            matches.map((match) => (
              <DemandMatchRow
                key={match.id}
                match={match}
                unit={demand.unit}
                currencyCode={demand.currency_code}
                canRequest={canRequest}
                locale={locale}
                onRequested={onChanged}
              />
            ))
          )}
        </div>
      ) : null}

      {isMine && quotations.length > 0 ? (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          {quotations.map((quotation) => (
            <DemandQuotationRow key={quotation.id} quotation={quotation} unit={demand.unit} />
          ))}
          <p className="text-[10px] leading-relaxed text-slate-500">
            لا مسار في الخادم يقبل عرض السعر أو يحوّله: القبول الذي يُنشئ حجة على البائع يظل طلب الشراء الناتج عن مطابقة.
          </p>
        </div>
      ) : null}
    </div>
  );
};
