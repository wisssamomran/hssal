import React from 'react';
import { MORE_ICON, MORE_LABEL } from '@/core/navigation';
import type { NavItem } from '@/core/navigation';
import type { Locale } from '@/core/i18n';

/**
 * The phone's bottom bar — the same five cells the Flutter client draws (market and
 * account always, the rest by permission), plus a sixth cell that never hides a
 * destination: it lists the rest of the tree.
 *
 * The two clients agree on this strip on purpose. A person who uses the web on a desk
 * and the app on a phone should not have to learn two orders for the same five rooms,
 * and the mobile list is the one the Flutter navigation bar publishes.
 *
 * The fourth cell is a list, not a hiding place: it holds every destination the account
 * may open that did not earn a cell, and it is drawn only when such a destination
 * exists. A guest's bar has one — an empty sheet under a word that promises more is a
 * door to an empty room, which is the kind of control people test once and then stop
 * trusting. It lights when the screen you are on came from that sheet, and not when you
 * are on an account screen — the chip beside the brand is that door, and a bottom bar
 * that also lit for it would be saying two things at once.
 */
export const MobileBar: React.FC<{
  items: NavItem[];
  activeView: string;
  moreActive: boolean;
  moreOpen: boolean;
  /** Whether the overflow list has anything in it; the cell is hidden when it does not. */
  showMore: boolean;
  locale: Locale;
  onNavigate: (view: string) => void;
  onToggleMore: () => void;
}> = ({ items, activeView, moreActive, moreOpen, showMore, locale, onNavigate, onToggleMore }) => (
  <nav
    aria-label={locale === 'en' ? 'Main sections' : 'الأقسام الرئيسية'}
    className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-hassal-line dark:bg-hassal-surface/95"
  >
    <div className="grid max-w-7xl grid-flow-col auto-cols-fr items-stretch gap-1 p-1.5">
      {items.map((item) => {
        const active = activeView === item.id;
        return (
          <button
            key={item.id}
            id={`mobile-nav-${item.id}`}
            type="button"
            onClick={() => onNavigate(item.id)}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-bold transition-colors ${
              active ? 'bg-emerald-50 text-emerald-800 dark:bg-hassal-raised dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <item.Icon className="h-5 w-5" />
            <span className="max-w-full truncate">{item.short[locale]}</span>
          </button>
        );
      })}
      {showMore && (
        <button
          id="mobile-nav-more"
          type="button"
          onClick={onToggleMore}
          aria-expanded={moreOpen}
          aria-current={moreActive ? 'page' : undefined}
          className={`flex flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-bold transition-colors ${
            moreActive
              ? 'bg-emerald-50 text-emerald-800 dark:bg-hassal-raised dark:text-emerald-300'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <MORE_ICON className="h-5 w-5" />
          <span>{MORE_LABEL[locale]}</span>
        </button>
      )}
    </div>
  </nav>
);
