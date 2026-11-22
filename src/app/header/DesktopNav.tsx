import React from 'react';
import { BRANCH_LABELS } from '@/core/navigation';
import type { BranchNav } from '@/core/navigation';
import type { Locale } from '@/core/i18n';

/**
 * The destination tree — tablets and up.
 *
 * Seven branches, each with one door, and the rest of a branch printed beside it only
 * while that branch is on screen. A phone gets the bottom bar instead of a row that has
 * to be dragged sideways to be read.
 *
 * Between the two breakpoints the full names are a sentence each and the row would
 * scroll without showing a scrollbar, so the short form is what a tablet reads and the
 * long form what a desktop reads. Which branch is current is derived here from the
 * route, never from a click handler: standing in a branch's screen is what lights its
 * door, so the strip cannot disagree with the page underneath it.
 */
export const DesktopNav: React.FC<{
  sections: BranchNav[];
  activeView: string;
  locale: Locale;
  onNavigate: (view: string) => void;
}> = ({ sections, activeView, locale, onNavigate }) => (
  <nav
    aria-label={locale === 'en' ? 'Sections' : 'أقسام المنصة'}
    className="hidden border-t border-slate-100 bg-slate-50/80 px-4 md:block md:px-6 lg:px-8 dark:border-hassal-line dark:bg-hassal-night"
  >
    <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto py-1 text-xs font-medium scrollbar-none">
      {sections.map(({ branch, landing, children }) => {
        const inBranch = landing.id === activeView || children.some((item) => item.id === activeView);
        return (
          <div key={branch} className="flex items-center gap-1" role="group" aria-label={BRANCH_LABELS[branch][locale]}>
            <button
              id={`nav-${landing.id}`}
              type="button"
              onClick={() => onNavigate(landing.id)}
              title={landing.label[locale]}
              aria-current={landing.id === activeView ? 'page' : undefined}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 transition-colors lg:px-3 ${
                inBranch
                  ? 'border border-slate-200/80 bg-white font-bold text-emerald-800 shadow-2xs dark:border-hassal-line dark:bg-hassal-raised dark:text-emerald-300'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-hassal-raised dark:hover:text-slate-100'
              }`}
            >
              <landing.Icon className="h-4 w-4 shrink-0" />
              <span className="lg:hidden">{landing.short[locale]}</span>
              <span className="hidden lg:inline">{landing.label[locale]}</span>
            </button>

            {/* The branch's own screens, opened by standing in the branch. */}
            {inBranch &&
              children.map((item) => (
                <button
                  key={item.id}
                  id={`nav-${branch}-${item.id}`}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={item.id === activeView ? 'page' : undefined}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-[11px] transition-colors lg:px-2.5 ${
                    item.id === activeView
                      ? 'font-bold text-emerald-900 dark:text-emerald-200'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-hassal-raised'
                  }`}
                >
                  <item.Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{item.short[locale]}</span>
                </button>
              ))}
          </div>
        );
      })}
    </div>
  </nav>
);
