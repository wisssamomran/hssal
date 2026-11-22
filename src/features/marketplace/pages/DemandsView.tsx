import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PlusCircle } from 'lucide-react';
import { explainRefusal } from '@/core/api/refusal';
import { isFeatureEnabled, usePlatformConfig } from '@/core/config';
import { getLocale } from '@/core/i18n';
import { getCategories } from '@/features/catalog/api';
import type { Category } from '@/features/catalog/types';
import { ErrorNote } from '@/shared/ui/panel';
import { getDemands } from '../api';
import { DEMAND_REFUSAL_CODES, demandBelongsTo } from '../demand';
import type { Demand } from '../types';
import { DemandCard } from '../components/DemandCard';
import { NewDemandSheet } from '../components/NewDemandSheet';

/**
 * The buyer's demand board and the seller's quotation desk — one screen because
 * they are one conversation, and the row that answers "whose is this?" decides
 * which half of it you may act on.
 *
 * This file holds three things and no rules: the list the server handed back, the
 * two inputs that decide which list to ask for, and whether the sheet is open.
 * Every judgement the cards display — what a status means, whose demand this is,
 * whether a quantity or a date can be sent, what a refusal code says — lives in
 * `demand.ts`, and every form lives in `components/`.
 *
 * What this screen deliberately does not do:
 * - It never books stock. A match becomes a *purchase request* the seller
 *   reviews; holding quantity is the seller's decision, taken on the requests
 *   screen, and is the moment `reserved_quantity` moves.
 * - It never offers to "accept" a quotation. The server stores quotations and
 *   reads them back on the buyer's own demand, but no route accepts, rejects or
 *   converts one, so a button doing that would be a switch wired to nothing.
 *   The path from a demand to a deal runs through a match, not a quotation.
 * - It never guesses a city or a unit. Both are the buyer's requirement, and the
 *   server refuses an ask without them.
 * - It does not search while you type. `GET /demands` runs `LIKE` over both title
 *   columns on the database; the board asks for it when the form is submitted,
 *   not on every keystroke.
 */

/** The two inputs that choose which slice of the board to read. */
interface BoardQuery {
  scope: 'open' | 'mine';
  search: string;
}

export const DemandsView: React.FC<{
  currentPersonaId: string;
  organizationId: number | null;
  can: (permission: string) => boolean;
}> = ({ currentPersonaId, organizationId, can }) => {
  const config = usePlatformConfig();
  const locale = getLocale();

  const [demands, setDemands] = useState<Demand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState<string | null>(null);
  const [query, setQuery] = useState<BoardQuery>({ scope: 'open', search: '' });
  const [searchDraft, setSearchDraft] = useState('');
  const [showNewDemand, setShowNewDemand] = useState(false);

  const rfqEnabled = isFeatureEnabled('demand_rfq');
  const matchingEnabled = isFeatureEnabled('matching_engine');
  const flagsRead = Object.keys(config.featureFlags ?? {}).length > 0;

  const loadData = useCallback(async () => {
    setLoading(true);
    setReadError(null);
    const result = await getDemands({
      ...(query.scope === 'mine' ? { my_demands: 1 as const } : {}),
      ...(query.search ? { search: query.search } : {}),
    });
    if (result.success) setDemands(result.data ?? []);
    else setReadError(explainRefusal(result, { fallback: 'تعذّر قراءة الطلبات', codes: DEMAND_REFUSAL_CODES }));
    setLoading(false);
  }, [query]);

  useEffect(() => {
    void loadData();
  }, [loadData, currentPersonaId]);

  // Categories are read once: a demand's pill names a classification, and the list of
  // classifications does not move while a buyer is reading their board. It used to ride
  // along with every search the screen ran.
  useEffect(() => {
    void getCategories().then((result) => {
      if (result.success) setCategories(result.data ?? []);
    });
  }, []);

  const categoryNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const category of categories) {
      map.set(category.id, locale === 'en' ? category.name_en || category.name_ar : category.name_ar);
    }
    return map;
  }, [categories, locale]);

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-black text-slate-900">
            {locale === 'en' ? 'Demand board and quotation desk' : 'لوحة طلبات الاحتياج وطاولة عروض الأسعار'}
          </h2>
          <p className="pt-0.5 text-xs leading-relaxed text-slate-500">
            المطابقة تُرشح عروضاً، وطلب الشراء يُرفع عن مطابقة يقرّها المشتري، والبائع هو من يقرر الحجز بعد ذلك.
            عرض السعر يُحفظ على الطلب ولا يُنشئ حجزاً ولا صفقة.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs font-semibold">
            <button
              onClick={() => setQuery((previous) => ({ ...previous, scope: 'open' }))}
              className={`cursor-pointer rounded-lg px-3 py-1.5 ${
                query.scope === 'open' ? 'bg-white font-bold text-emerald-900 shadow-2xs' : 'text-slate-600'
              }`}
            >
              الطلبات المفتوحة
            </button>
            <button
              onClick={() => setQuery((previous) => ({ ...previous, scope: 'mine' }))}
              disabled={!organizationId}
              className={`cursor-pointer rounded-lg px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40 ${
                query.scope === 'mine' ? 'bg-white font-bold text-emerald-900 shadow-2xs' : 'text-slate-600'
              }`}
            >
              طلبات منشأتي
            </button>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              // A new object even when the text is unchanged: pressing بحث again means
              // "read the board again", and a query that compares equal would be ignored.
              setQuery((previous) => ({ ...previous, search: searchDraft.trim() }));
            }}
            className="flex items-center gap-1.5"
          >
            <input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="بحث بالعنوان"
              className="w-40 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs focus:bg-white focus:outline-none"
            />
            <button
              type="submit"
              className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700"
            >
              بحث
            </button>
          </form>

          {can('demands.create') ? (
            <button
              onClick={() => setShowNewDemand(true)}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700"
            >
              <PlusCircle className="h-4 w-4" />
              <span>نشر طلب احتياج</span>
            </button>
          ) : null}
        </div>
      </div>

      {!flagsRead ? (
        <ErrorNote text="لم تُقرأ قدرات المنصة بعد؛ قد تظهر القوائم أدناه فارغة حتى تصل إجابة مسار الإقلاع." />
      ) : !rfqEnabled ? (
        <ErrorNote text="قدرة «الطلبات وعروض الأسعار» (demand_rfq) معطّلة في هذه التهيئة: الخادم يرفض كل مسارات /demands، فلا نشر ولا عرض سعر ولا مطابقة." />
      ) : null}

      {readError ? <ErrorNote text={readError} /> : null}

      {loading ? (
        <div className="py-20 text-center text-xs text-slate-500">جارٍ قراءة الطلبات…</div>
      ) : demands.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-xs text-slate-500">
          {query.scope === 'mine'
            ? 'لم تنشر منشأتك طلب احتياج بعد، أو لا طلبات لها في هذه الحالة.'
            : 'لا توجد طلبات احتياج مفتوحة غير منتهية.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {demands.map((demand) => (
            <DemandCard
              key={demand.id}
              demand={demand}
              isMine={demandBelongsTo(demand, organizationId)}
              categoryName={categoryNames.get(Number(demand.category_id)) ?? null}
              canQuote={can('demands.quote')}
              canRequest={can('requests.create')}
              matchingEnabled={matchingEnabled && rfqEnabled}
              locale={locale}
              onChanged={() => void loadData()}
            />
          ))}
        </div>
      )}

      {showNewDemand ? (
        <NewDemandSheet
          categories={categories}
          onClose={() => setShowNewDemand(false)}
          // A published demand belongs to the buyer who wrote it, so the board moves to
          // that scope — and the new query object re-runs the read, which is the refresh.
          onCreated={() => {
            setShowNewDemand(false);
            setQuery((previous) => ({ ...previous, scope: 'mine' }));
          }}
        />
      ) : null}
    </div>
  );
};
