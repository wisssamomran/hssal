import React from 'react';
import { BRANCH_LABELS, groupNav } from '@/core/navigation';
import type { NavItem } from '@/core/navigation';
import type { Locale } from '@/core/i18n';
import { Drawer } from './Drawer';

/**
 * The overflow sheet: every destination the account may open that did not earn a cell
 * in the bottom bar, printed under the heading it belongs to.
 *
 * A flat grid of nine equal buttons is what makes people read all nine; three named
 * groups is what lets them read one. The grouping is the navigation module's, not a
 * decision made here — the same branch a desktop tab strip lights up is the heading
 * this list sorts under, so a person learns one structure and uses it on both.
 */
export const MoreSheet: React.FC<{
  items: NavItem[];
  activeView: string;
  locale: Locale;
  onClose: () => void;
  onNavigate: (view: string) => void;
}> = ({ items, activeView, locale, onClose, onNavigate }) => (
  <Drawer title={locale === 'en' ? 'All sections' : 'كل الأقسام'} locale={locale} onClose={onClose}>
    <div className="space-y-4">
      {groupNav(items).map((section) => (
        <div key={section.branch}>
          <div className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {BRANCH_LABELS[section.branch][locale]}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {section.items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={activeView === item.id ? 'page' : undefined}
                className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-start text-xs font-bold ${
                  activeView === item.id
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-hassal-raised dark:text-emerald-200'
                    : 'border-slate-200 bg-white text-slate-700 dark:border-hassal-line dark:bg-hassal-surface dark:text-slate-200'
                }`}
              >
                <item.Icon className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
                <span className="min-w-0 leading-snug">{item.label[locale]}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  </Drawer>
);
