import React from 'react';
import { Check } from 'lucide-react';
import type { Category } from '@/features/catalog/types';
import type { Locale } from '@/core/i18n';

/**
 * The market's categories, as a row you tap once.
 *
 * A food market is browsed by category far more often than it is searched: a buyer
 * who came for dairy should not have to type it. The pill writes the same
 * `categoryId` the chips row reports and "مسح الفلاتر" clears, so the two faces of
 * that one choice can never disagree.
 */
export const CategoryPillRow: React.FC<{
  categories: Category[];
  selectedId: number | null;
  onSelect: (categoryId: number | null) => void;
  locale: Locale;
}> = ({ categories, selectedId, onSelect, locale }) => (
  <div className="flex w-full items-center gap-2 overflow-x-auto pb-1 text-xs scrollbar-none">
    <button
      onClick={() => onSelect(null)}
      className={`cursor-pointer whitespace-nowrap rounded-full px-3 py-1.5 font-medium transition-colors ${
        selectedId === null
          ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-hassal-raised dark:text-slate-300'
      }`}
    >
      جميع التصنيفات
    </button>
    {categories.map((category) => {
      const label = locale === 'en' ? category.name_en || category.name_ar : category.name_ar || category.name_en;
      const selected = selectedId === category.id;
      return (
        <button
          key={category.id}
          onClick={() => onSelect(selected ? null : category.id)}
          className={`flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 font-medium transition-colors ${
            selected
              ? 'bg-emerald-700 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-hassal-raised dark:text-slate-300'
          }`}
        >
          {selected && <Check className="h-3 w-3 shrink-0" />}
          <span className="min-w-0 truncate">{label}</span>
        </button>
      );
    })}
  </div>
);
