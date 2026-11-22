import React from 'react';
import { RotateCcw, Search, X } from 'lucide-react';
import { opportunityReasonLabel, usePlatformConfig } from '@/core/config';
import type { Locale } from '@/core/i18n';
import type { Category } from '@/features/catalog/types';
import type { OfferSortIntent } from '@/features/marketplace/types';
import { OFFER_SORT_LABELS } from '@/features/marketplace/labels';
import {
  SEARCH_TARGET_CHIP_LABELS,
  SEARCH_TARGET_PLACEHOLDERS,
  SEARCH_TARGET_TAB_LABELS,
  SEARCH_TARGETS,
  marketFiltersAreActive,
  type MarketFilters,
} from '@/features/marketplace/discovery';
import { LabeledSelect, TextInput } from '@/shared/ui/panel';

/**
 * The buyer's narrowing controls, in one bar.
 *
 * Four of the five narrow the page the server already handed over; the fifth — the
 * order — is sent as `sort_by` and answered by the server, because re-ordering one
 * page on the client is a ranking that ignores every page the buyer never asked
 * for. They share a bar because that is how a person uses them: set the order, then
 * narrow what the order brought.
 *
 * The chips row is not decoration. A screen that filters silently is a screen whose
 * empty result reads as an empty market, so every narrowing that is live is visible
 * and each one carries its own way out.
 */
export const MarketFilterBar: React.FC<{
  filters: MarketFilters;
  onPatch: (patch: Partial<MarketFilters>) => void;
  onReset: () => void;
  sortBy: OfferSortIntent;
  onSortChange: (intent: OfferSortIntent) => void;
  categories: Category[];
  /** The businesses present in what is loaded — the dropdown is built from the page, not from a list nobody can match. */
  suppliers: string[];
  resultCount: number;
  totalCount: number;
  locale: Locale;
  /** The interest filter needs a signed-in session and the platform's `community` capability. */
  interestFilterAvailable: boolean;
  likedCount: number;
}> = ({
  filters,
  onPatch,
  onReset,
  sortBy,
  onSortChange,
  categories,
  suppliers,
  resultCount,
  totalCount,
  locale,
  interestFilterAvailable,
  likedCount,
}) => {
  const config = usePlatformConfig();
  const active = marketFiltersAreActive(filters);
  const categoryLabel = (category: Category) =>
    locale === 'en' ? category.name_en || category.name_ar : category.name_ar || category.name_en;
  const selectedCategory =
    filters.categoryId === null ? null : categories.find((c) => c.id === filters.categoryId) ?? null;

  return (
    <div className="space-y-3.5 rounded-2xl border-2 border-emerald-600/30 bg-white p-3 shadow-xs dark:bg-hassal-surface dark:border-hassal-line sm:space-y-4 sm:p-5">
      <div className="flex flex-col justify-between gap-2.5 border-b border-slate-100 pb-3 dark:border-hassal-line sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
            <Search className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="font-serif text-sm font-black text-slate-900 dark:text-slate-100">
              البحث في العروض والتصفية الفورية
            </h2>
            <p className="pt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              تصفّج هنا في العروض التي لا يزال الخادم يقرأها: البحث والفلترات تعمل على ما وصل في هذه الصفحة، والكميات
              والأسعار تتغير عند البائع في أي لحظة.
            </p>
          </div>
        </div>

        <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
          <span className="min-w-0 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 dark:bg-hassal-raised dark:text-slate-200">
            النتائج: <strong className="text-emerald-700">{resultCount}</strong> من {totalCount} في هذه الصفحة
          </span>
          {active && (
            <button
              onClick={onReset}
              className="flex shrink-0 cursor-pointer items-center justify-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-xs font-bold text-rose-600 hover:text-rose-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>مسح الفلاتر</span>
            </button>
          )}
        </div>
      </div>

      {/* Scope tabs and the term itself */}
      <div className="flex flex-col gap-2.5 md:flex-row md:items-stretch">
        <div className="grid grid-cols-2 items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs font-medium sm:flex sm:gap-0 sm:overflow-x-auto sm:shrink-0 scrollbar-none dark:bg-hassal-raised">
          {SEARCH_TARGETS.map((target) => (
            <button
              key={target}
              type="button"
              onClick={() => onPatch({ target })}
              className={`cursor-pointer whitespace-nowrap rounded-lg px-3 py-1.5 text-center transition-all ${
                filters.target === target
                  ? 'bg-white font-bold text-emerald-900 shadow-2xs dark:bg-hassal-surface dark:text-emerald-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              {SEARCH_TARGET_TAB_LABELS[target]}
            </button>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" />
          <input
            type="text"
            aria-label={SEARCH_TARGET_TAB_LABELS[filters.target]}
            placeholder={SEARCH_TARGET_PLACEHOLDERS[filters.target]}
            value={filters.query}
            onChange={(event) => onPatch({ query: event.target.value })}
            className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2.5 pl-9 pr-10 text-xs font-medium focus:border-emerald-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-hassal-line dark:bg-hassal-raised dark:text-slate-100"
          />
          {filters.query && (
            <button
              type="button"
              onClick={() => onPatch({ query: '' })}
              className="absolute left-3 top-1/2 -translate-y-1/2 cursor-pointer p-1 text-xs font-bold text-slate-400 hover:text-slate-700"
              title="مسح نص البحث"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* The narrowing itself. Categories are deliberately absent: the pill row above
          the grid is that choice's control, and the same decision offered twice on
          one screen is two controls that can disagree. */}
      <div className="grid grid-cols-1 gap-3 pt-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
        <LabeledSelect
          wide
          label="المورد / الشركة البائعة"
          value={filters.supplier}
          onChange={(value) => onPatch({ supplier: value })}
          options={[
            { value: '', label: 'جميع الموردين المعتمدين' },
            ...suppliers.map((name) => ({ value: name, label: name })),
          ]}
        />

        <LabeledSelect
          wide
          label="نوع الفرصة التجارية"
          value={filters.reason}
          onChange={(value) => onPatch({ reason: value })}
          options={[
            { value: '', label: 'كافة أسباب طرح المخزون' },
            ...config.opportunityReasons.map((reason) => ({
              value: reason.code,
              label: locale === 'en' ? reason.label_en : reason.label_ar,
            })),
          ]}
        />

        {/* The order is the one control that leaves this page: it goes out as
            `sort_by`, because ranking a single page on the client is a ranking that
            never saw the other pages. */}
        <LabeledSelect
          wide
          label="ترتيب العروض"
          value={sortBy}
          onChange={(value) => onSortChange(value as OfferSortIntent)}
          options={(Object.keys(OFFER_SORT_LABELS) as OfferSortIntent[]).map((intent) => ({
            value: intent,
            label: OFFER_SORT_LABELS[intent],
          }))}
        />

        <TextInput
          wide
          label="أقصى سعر للوحدة"
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          dirLtr
          value={filters.maxPrice === '' ? '' : String(filters.maxPrice)}
          onChange={(value) => onPatch({ maxPrice: value === '' ? '' : Number(value) })}
          placeholder="بدون سقف"
          help={`يقارن بسعر الوحدة كما نشره البائع${config.baseCurrency ? ` بعملة ${config.baseCurrency}` : ''}`}
        />

        {interestFilterAvailable && (
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs font-medium text-slate-800 dark:border-hassal-line dark:bg-hassal-raised dark:text-slate-100">
            <input
              type="checkbox"
              checked={filters.onlyLiked}
              onChange={(event) => onPatch({ onlyLiked: event.target.checked })}
              className="mt-0.5 shrink-0 cursor-pointer"
            />
            <span className="min-w-0">
              <span className="block font-bold">ما أعجب منشأتي فقط ({likedCount})</span>
              <span className="block pt-0.5 text-[10px] font-normal leading-relaxed text-slate-500 dark:text-slate-400">
                القائمة تُقرأ من الخادم لمنشأتك وحدها؛ صفر يعني لم تُسجّل منشأتك إعجابًا بعد، لا أن القدرة معطّلة.
              </span>
            </span>
          </label>
        )}
      </div>

      {/* What is live right now */}
      {active && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 text-xs dark:border-hassal-line">
          <span className="shrink-0 text-[11px] font-medium text-slate-400">الفلاتر المفعلة:</span>

          {filters.query.trim() && (
            <Chip
              tone="emerald"
              label={SEARCH_TARGET_CHIP_LABELS[filters.target]}
              text={`${SEARCH_TARGET_CHIP_LABELS[filters.target]}: «${filters.query}»`}
              onClear={() => onPatch({ query: '' })}
            />
          )}

          {selectedCategory !== null && (
            <Chip
              label="التصنيف"
              text={`التصنيف: ${categoryLabel(selectedCategory)}`}
              onClear={() => onPatch({ categoryId: null })}
            />
          )}

          {filters.supplier && (
            <Chip label="المورد" text={`المورد: ${filters.supplier}`} onClear={() => onPatch({ supplier: '' })} />
          )}

          {filters.reason && (
            <Chip
              label="الفرصة"
              text={`الفرصة: ${opportunityReasonLabel(filters.reason, locale)}`}
              onClear={() => onPatch({ reason: '' })}
            />
          )}

          {filters.maxPrice !== '' && (
            <Chip
              label="السقف السعري"
              text={`أقصى سعر للوحدة: ${filters.maxPrice}`}
              onClear={() => onPatch({ maxPrice: '' })}
            />
          )}

          {filters.onlyLiked && (
            <Chip
              tone="rose"
              label="الاهتمام"
              text="ما أعجب منشأتي فقط"
              onClear={() => onPatch({ onlyLiked: false })}
            />
          )}
        </div>
      )}
    </div>
  );
};

/**
 * One live filter, with its own way out.
 *
 * The label says which control the chip belongs to, so clearing one of five live
 * filters is a choice rather than a guess.
 */
const Chip: React.FC<{
  label: string;
  text: string;
  onClear: () => void;
  tone?: 'emerald' | 'rose';
}> = ({ label, text, onClear, tone }) => (
  <span
    className={`inline-flex max-w-full items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-bold ${
      tone === 'emerald'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
        : tone === 'rose'
          ? 'border-rose-200 bg-rose-50 text-rose-900'
          : 'border-slate-200 bg-slate-100 text-slate-800'
    }`}
  >
    <span className="min-w-0 truncate" title={text}>
      {text}
    </span>
    <button
      type="button"
      onClick={onClear}
      className="shrink-0 cursor-pointer hover:text-rose-600"
      title={`إلغاء فلتر ${label}`}
      aria-label={`إلغاء فلتر ${label}`}
    >
      <X className="h-3.5 w-3.5" />
    </button>
  </span>
);
