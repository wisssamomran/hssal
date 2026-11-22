import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, UserCircle2 } from 'lucide-react';
import { translations } from '@/core/i18n';
import type { Locale } from '@/core/i18n';
import type { User } from '@/features/identity/types';
import type { ActiveOrganization } from '@/features/organizations/types';
import { organizationName, organizationVerification } from '@/features/organizations/review';

const DOT_TONE: Record<ReturnType<typeof organizationVerification>['tone'], string> = {
  ok: 'bg-emerald-500',
  pending: 'bg-amber-400',
  none: 'bg-amber-400',
};

/**
 * The account, beside the brand — its only door.
 *
 * The profile used to sit in the tab strip, the phone's bottom bar and the account sheet
 * as well as here: three doors to one room. The account's three screens now live in
 * exactly one place, this chip — on a desktop as a short menu under the name, on a phone
 * as the sheet that holds those screens beside the business switcher and sign out.
 *
 * The chip owns its own open/closed state and the click that closes it, because a menu
 * that only closes on its own button makes people hunt for the ✕ that is not there. The
 * route does the rest: a navigation always takes the menu away.
 *
 * The dot is the business's approval state, not the account's; and the legal-record entry
 * is named in full in the sheet, because «ملف المنشأة والسجل» is the screen a business
 * looks for by name and a truncated word would hide it.
 */
export const AccountChip: React.FC<{
  user: User;
  currentOrg: ActiveOrganization | null;
  locale: Locale;
  activeView: string;
  accountActive: boolean;
  /** The phone sheet this chip opens, so the arrow and `aria-expanded` agree. */
  sheetOpen: boolean;
  onOpenSheet: () => void;
  onLogout: () => void;
}> = ({ user, currentOrg, locale, activeView, accountActive, sheetOpen, onOpenSheet, onLogout }) => {
  const t = translations[locale];
  const [menu, setMenu] = useState(false);
  const chipRef = useRef<HTMLDivElement | null>(null);
  const verification = organizationVerification(currentOrg?.status, locale);

  useEffect(() => setMenu(false), [activeView]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (event: MouseEvent) => {
      if (!chipRef.current?.contains(event.target as Node)) setMenu(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const name = user.name || (locale === 'en' ? 'Signed-in account' : 'حساب مسجَّل');

  return (
    <div ref={chipRef} className="relative">
      <button
        id="brand-profile-chip"
        type="button"
        onClick={() => {
          if (window.matchMedia('(min-width: 768px)').matches) setMenu(!menu);
          else {
            setMenu(false);
            onOpenSheet();
          }
        }}
        aria-haspopup="menu"
        aria-expanded={menu || sheetOpen}
        aria-current={accountActive ? 'page' : undefined}
        aria-label={
          locale === 'en'
            ? 'Your account: profile, business record and team'
            : 'حسابك: الملف الشخصي وملف المنشأة والفريق'
        }
        title={
          locale === 'en'
            ? 'Your account — profile, business record and team'
            : 'حسابك — الملف الشخصي وملف المنشأة والفريق'
        }
        className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 text-start transition-colors ${
          accountActive || menu
            ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-hassal-raised'
            : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-hassal-line dark:bg-hassal-surface dark:hover:bg-hassal-raised'
        }`}
      >
        <span className="relative shrink-0">
          <UserCircle2 className="h-7 w-7 text-emerald-700 dark:text-emerald-400" />
          <span
            className={`absolute -bottom-0.5 -left-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-hassal-surface ${DOT_TONE[verification.tone]}`}
            title={verification.title}
          />
        </span>
        <span className="hidden leading-tight sm:block">
          <span className="block max-w-[9rem] truncate text-[11px] font-black text-slate-900 dark:text-slate-100">
            {name}
          </span>
          <span className="block truncate text-[10px] text-slate-500 dark:text-slate-400">
            {organizationName(currentOrg, locale)}
          </span>
        </span>
        {/* Below the name's breakpoint the chip is an icon with a word, because a bare
            circle does not say that it holds the account. */}
        <span className="text-[11px] font-black text-slate-900 sm:hidden dark:text-slate-100">
          {locale === 'en' ? 'Account' : 'حسابي'}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${menu ? 'rotate-180' : ''}`}
        />
      </button>

      {menu && (
        <div
          role="menu"
          aria-label={locale === 'en' ? 'Account' : 'الحساب'}
          className="absolute start-0 top-full z-50 mt-1.5 w-72 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl dark:border-hassal-line dark:bg-hassal-surface"
        >
          <div className="px-2.5 py-2">
            <div className="truncate text-xs font-black text-slate-900 dark:text-slate-100">{name}</div>
            <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
              {user.email ?? organizationName(currentOrg, locale)}
            </div>
          </div>
          {/* Not a list of the account's screens: on a wide screen the strip above already
              carries every branch door, and the business file is the box beside this chip.
              The sheet a phone opens *is* that list, because a phone has no strip — and a
              destination repeated in two places is two doors a person has to compare before
              trusting either. */}
          <div className="my-1 h-px bg-slate-100 dark:bg-hassal-line" />
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setMenu(false);
              onLogout();
            }}
            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-start text-xs font-bold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-hassal-raised"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {t.logout}
          </button>
        </div>
      )}
    </div>
  );
};
