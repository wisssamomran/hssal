import React, { useEffect, useState } from 'react';
import { Building2, ChevronDown, Languages, Moon, Settings2, Sun, UserCircle2 } from 'lucide-react';
import { translations } from '@/core/i18n';
import type { Locale } from '@/core/i18n';
import { useTheme } from '@/core/theme';
import { capabilityLine, taxLine, taxSummary, usePlatformConfig } from '@/core/config';
import { ACCOUNT_DESTINATIONS, branchNav, mobileOverflowNav, mobilePrimaryNav } from '@/core/navigation';
import BrandMark from '@/shared/ui/BrandMark';
import { recorded } from '@/shared/ui/panel';
import { organizationName } from '@/features/organizations/review';
import type { User } from '@/features/identity/types';
import type { ActiveOrganization, OrganizationSummary } from '@/features/organizations/types';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { AccountChip } from './header/AccountChip';
import { AccountSheet } from './header/AccountSheet';
import { CONTROL_CLASS } from './header/styles';
import { DesktopNav } from './header/DesktopNav';
import { MobileBar } from './header/MobileBar';
import { MoreSheet } from './header/MoreSheet';
import { OrgContextControl } from './header/OrgContextControl';
import { StateStrip } from './header/StateStrip';

interface HeaderProps {
  currentUser: User | null;
  currentOrg: ActiveOrganization | null;
  /** Every organization this account belongs to; the switcher offers these only. */
  organizations: OrganizationSummary[];
  onSelectOrganization: (organizationId: number) => void;
  onLogin: () => void;
  onRegister: () => void;
  onLogout: () => void;
  canNavigate: (view: string) => boolean;
  activeView: string;
  onNavigate: (view: string) => void;
  locale: Locale;
  onChangeLocale: (locale: Locale) => void;
}

/**
 * The bar every screen hangs from.
 *
 * What this file decides is one thing: which of the four surfaces a session sees, and
 * what state the sheets are in. Everything else lives in `app/header/` beside the rule
 * it reads — the state strip, the destination tree, the bottom bar, the account chip, the
 * two sheets and the business switcher — because the header was 887 lines of chrome with
 * the platform's claims (what tax is configured, whether the marketplace is on, what
 * having no business means) written inline beside them.
 *
 * Three rules those pieces hold, stated here so a change to one is not made in isolation:
 * - No door opens twice. The account's screens are reachable from the chip and from
 *   nowhere else; sign out is the last row of the account menu, not a bar control.
 * - Nothing is asserted that has not been read. The state line says «لم تُقرأ حالة المنصة
 *   بعد» rather than guessing that an absent flag means an off flag.
 * - A state a person cannot act on still explains itself: «no business» names which of
 *   the three situations it is, and the two that can be fixed carry the fixing.
 */
export const Header: React.FC<HeaderProps> = ({
  currentUser,
  currentOrg,
  organizations,
  onSelectOrganization,
  onLogin,
  onRegister,
  onLogout,
  canNavigate,
  activeView,
  onNavigate,
  locale,
  onChangeLocale,
}) => {
  const t = translations[locale];
  usePlatformConfig(); // re-renders when the platform settings arrive
  const { theme, toggle } = useTheme();

  const capability = capabilityLine(locale);
  const taxText = taxLine(locale, taxSummary());

  const [sheet, setSheet] = useState<'none' | 'more' | 'account'>('none');

  /** The seven branches this session may open, each with its door and its screens. */
  const sections = branchNav(canNavigate);
  const primaryNav = mobilePrimaryNav(canNavigate);
  const overflowNav = mobileOverflowNav(canNavigate, primaryNav.map((item) => item.id));
  const accountNav = ACCOUNT_DESTINATIONS.filter((item) => canNavigate(item.id));
  const accountActive = ACCOUNT_DESTINATIONS.some((item) => item.id === activeView);
  // Only the sheet's own destinations light the "More" cell; an open account
  // screen belongs to the chip above it.
  const moreActive = overflowNav.some((item) => item.id === activeView);

  // Escape and a route change both take the sheets away; a drawer that survives
  // the tap it was opened for reads as a stuck screen.
  useEffect(() => {
    if (sheet === 'none') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSheet('none');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheet]);

  useEffect(() => {
    setSheet('none');
  }, [activeView]);

  const go = (view: string) => {
    setSheet('none');
    onNavigate(view);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white shadow-xs dark:border-hassal-line dark:bg-hassal-surface">
      <StateStrip locale={locale} capability={capability} taxText={taxText} />

      {/* Main bar */}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2.5 sm:px-6 md:px-4 lg:px-8">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => go('marketplace')}
            className="group flex items-center gap-2.5 rounded-xl p-0.5 text-start focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            {/* The real mark, not a coloured square with a letter in it. It is gold and
                green on a transparent field, so it needs no backdrop chip and reads on
                both the light bar and the night one. */}
            <BrandMark size={38} className="transition-transform group-hover:scale-105" />
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="font-serif text-lg font-black tracking-tight text-slate-900 sm:text-xl dark:text-slate-50">
                  حَصّـال
                </span>
                <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 sm:inline">
                  HASSAL B2B
                </span>
              </span>
              <span className="hidden truncate text-xs text-slate-500 lg:block dark:text-slate-400">
                منصة الفرص والمخزون الغذائي التجاري
              </span>
            </span>
          </button>

          {currentUser ? (
            <>
              <AccountChip
                user={currentUser}
                currentOrg={currentOrg}
                locale={locale}
                activeView={activeView}
                accountActive={accountActive}
                sheetOpen={sheet === 'account'}
                onOpenSheet={() => setSheet(sheet === 'account' ? 'none' : 'account')}
                onLogout={onLogout}
              />
              <span className="md:hidden">
                <NotificationBell locale={locale} />
              </span>
            </>
          ) : (
            <button
              type="button"
              onClick={onLogin}
              className="ms-1 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50 dark:border-hassal-line dark:bg-hassal-surface dark:text-slate-200 dark:hover:bg-hassal-raised"
            >
              <UserCircle2 className="h-5 w-5 text-slate-400" />
              <span className="hidden sm:inline">
                {locale === 'en' ? 'Sign in to your profile' : 'سجّل الدخول لبروفايلك'}
              </span>
              <span className="sm:hidden">{t.login}</span>
            </button>
          )}
        </div>

        {/* Desktop context and controls */}
        <div className="hidden items-center gap-3 md:flex">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1.5 dark:border-hassal-line dark:bg-hassal-night">
            <span className="flex items-center gap-1 px-2 text-xs font-medium text-slate-500">
              <Building2 className="h-4 w-4 text-slate-400" />
              {t.commercialContext}
            </span>

            <OrgContextControl
              currentOrg={currentOrg}
              organizations={organizations}
              signedIn={Boolean(currentUser)}
              locale={locale}
              fullWidth={false}
              onSelect={onSelectOrganization}
              onOpenOrganizationFile={() => go('org')}
              onLogin={onLogin}
            />
          </div>

          {/* Active organization facts: the number the business submitted, not the
              platform's row id — labelling `currentOrg.id` as a registration number was a
              claim no ministry recognises. The box is the way into the legal record,
              because a business that sees its registration number on screen expects that
              number's page to be under it. */}
          {currentOrg && (
            <button
              type="button"
              onClick={() => go('org')}
              disabled={!canNavigate('org')}
              title={locale === 'en' ? 'Organization & legal record' : 'ملف المنشأة والسجل'}
              className="hidden items-center gap-2.5 rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-3.5 py-1.5 text-start transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-default lg:flex dark:border-hassal-line dark:bg-hassal-raised dark:hover:bg-hassal-raised"
            >
              <div className="text-end">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-950 dark:text-emerald-100">
                  <span className="max-w-[12rem] truncate">{organizationName(currentOrg, locale)}</span>
                  <span className="rounded bg-emerald-200 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900">
                    {locale === 'en' ? 'Signed in' : 'جلسة مسجَّلة'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-emerald-700 dark:text-emerald-300">
                  <span>{locale === 'en' ? 'CR' : 'س.ت'}: {recorded(currentOrg.cr_number)}</span>
                  <span>•</span>
                  <span>{locale === 'en' ? `Ref ${currentOrg.id}` : `مرجع داخلي ${currentOrg.id}`}</span>
                </div>
              </div>
            </button>
          )}

          {/* Sign out is not a bar control: it is the last row of the account menu beside
              the account's own screens. Left here as well it was a second door to the same
              act, and the more dangerous one to find by accident. */}
          {currentUser ? (
            <NotificationBell locale={locale} />
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onLogin}
                className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50"
              >
                {t.login}
              </button>
              <button
                type="button"
                onClick={onRegister}
                className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800"
              >
                {t.register}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => onChangeLocale(locale === 'ar' ? 'en' : 'ar')}
            className={CONTROL_CLASS}
            aria-label={t.switchLanguage}
          >
            <Languages className="me-1 inline h-3.5 w-3.5 align-[-2px]" />
            {t.switchLanguage}
          </button>

          {/* Light or dark, with the label naming the mode you are about to get. */}
          <button
            id="theme-toggle"
            type="button"
            onClick={toggle}
            aria-pressed={theme === 'dark'}
            title={theme === 'dark'
              ? (locale === 'en' ? 'Switch to the light theme' : 'التبديل إلى الوضع النهاري')
              : (locale === 'en' ? 'Switch to the dark theme' : 'التبديل إلى الوضع الليلي')}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50 dark:border-hassal-line dark:bg-hassal-surface dark:text-amber-300 dark:hover:bg-hassal-raised"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>

        {/* Phone. Once there were two controls here: a register button and a sheet toggle
            that opened the same account sheet the chip beside the brand already opened.
            Now there is one sheet door per state — the chip when a session exists, and
            this button when it does not, which is where a guest reaches the language and
            the theme because a guest has no account to tap. */}
        <div className="flex items-center gap-2 md:hidden">
          {!currentUser && (
            <>
              <button
                type="button"
                onClick={onRegister}
                className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white"
              >
                {t.register}
              </button>
              <button
                id="guest-sheet-toggle"
                type="button"
                onClick={() => setSheet(sheet === 'account' ? 'none' : 'account')}
                aria-expanded={sheet === 'account'}
                aria-label={locale === 'en' ? 'Language, theme and sign in' : 'اللغة والمظهر وتسجيل الدخول'}
                className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-700 dark:border-hassal-line dark:bg-hassal-surface dark:text-slate-200"
              >
                <Settings2 className="h-4 w-4" />
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${sheet === 'account' ? 'rotate-180' : ''}`} />
              </button>
            </>
          )}
        </div>
      </div>

      <DesktopNav sections={sections} activeView={activeView} locale={locale} onNavigate={go} />

      {sheet === 'account' && (
        <AccountSheet
          user={currentUser}
          currentOrg={currentOrg}
          organizations={organizations}
          accountNav={accountNav}
          activeView={activeView}
          locale={locale}
          capabilityText={capability.text}
          taxText={taxText}
          onClose={() => setSheet('none')}
          onNavigate={go}
          onSelectOrganization={onSelectOrganization}
          onLogin={onLogin}
          onRegister={onRegister}
          onLogout={onLogout}
          onChangeLocale={onChangeLocale}
        />
      )}

      {sheet === 'more' && (
        <MoreSheet
          items={overflowNav}
          activeView={activeView}
          locale={locale}
          onClose={() => setSheet('none')}
          onNavigate={go}
        />
      )}

      <MobileBar
        items={primaryNav}
        activeView={activeView}
        moreActive={moreActive}
        moreOpen={sheet === 'more'}
        showMore={overflowNav.length > 0}
        locale={locale}
        onNavigate={go}
        onToggleMore={() => setSheet(sheet === 'more' ? 'none' : 'more')}
      />
    </header>
  );
};
