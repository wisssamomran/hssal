import React from 'react';
import { LogOut } from 'lucide-react';
import { translations } from '@/core/i18n';
import type { Locale } from '@/core/i18n';
import type { User } from '@/features/identity/types';
import type { ActiveOrganization, OrganizationSummary } from '@/features/organizations/types';
import { organizationStatusLabel } from '@/features/organizations/review';
import { recorded } from '@/shared/ui/panel';
import type { NavItem } from '@/core/navigation';
import { CONTROL_CLASS } from './styles';
import { Drawer, DrawerHeading } from './Drawer';
import { OrgContextControl } from './OrgContextControl';
import { DisplayControls } from './DisplayControls';

/**
 * The sheet a phone has no room for.
 *
 * A signed-in account finds its own screens, its businesses and its exit here; a guest
 * finds the two ways in and the two controls — language and appearance — that nobody
 * should need an account to change. Those are the same four blocks in a different order,
 * which is why they are one component with a `user` that may be null rather than two
 * sheets that have to be kept in step by hand.
 *
 * The account's destinations appear here and nowhere else on a phone. They left the tab
 * strip, the bottom bar and the overflow sheet because a screen the account reaches by
 * tapping its name does not need three more doors elsewhere.
 *
 * The state line at the foot is the platform's own, read from the settings: what the
 * capabilities say and what the tax configuration says, so the last thing a person reads
 * before leaving the sheet is a fact about the deployment rather than a promise.
 */
export const AccountSheet: React.FC<{
  user: User | null;
  currentOrg: ActiveOrganization | null;
  organizations: OrganizationSummary[];
  accountNav: NavItem[];
  activeView: string;
  locale: Locale;
  capabilityText: string;
  taxText: string;
  onClose: () => void;
  onNavigate: (view: string) => void;
  onSelectOrganization: (organizationId: number) => void;
  onLogin: () => void;
  onRegister: () => void;
  onLogout: () => void;
  onChangeLocale: (locale: Locale) => void;
}> = ({
  user,
  currentOrg,
  organizations,
  accountNav,
  activeView,
  locale,
  capabilityText,
  taxText,
  onClose,
  onNavigate,
  onSelectOrganization,
  onLogin,
  onRegister,
  onLogout,
  onChangeLocale,
}) => {
  const t = translations[locale];

  return (
    <Drawer
      title={user ? (locale === 'en' ? 'Account & organization' : 'الحساب والمنشأة') : (locale === 'en' ? 'Sign in & preferences' : 'الدخول والإعدادات')}
      locale={locale}
      onClose={onClose}
    >
      {!user ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onLogin();
              }}
              className="w-full rounded-xl border border-emerald-200 bg-white py-3 text-sm font-bold text-emerald-800 dark:border-hassal-line dark:bg-hassal-raised dark:text-emerald-300"
            >
              {t.login}
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onRegister();
              }}
              className="w-full rounded-xl bg-emerald-700 py-3 text-sm font-bold text-white"
            >
              {t.register}
            </button>
          </div>
          <div>
            <DrawerHeading>{locale === 'en' ? 'Language & appearance' : 'اللغة والمظهر'}</DrawerHeading>
            <DisplayControls locale={locale} onChangeLocale={onChangeLocale} />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <DrawerHeading>{t.commercialContext}</DrawerHeading>
            <OrgContextControl
              currentOrg={currentOrg}
              organizations={organizations}
              signedIn
              locale={locale}
              fullWidth
              onSelect={onSelectOrganization}
              onOpenOrganizationFile={() => onNavigate('org')}
              onLogin={onLogin}
            />
            {currentOrg && (
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                {locale === 'en' ? 'CR' : 'س.ت'}: {recorded(currentOrg.cr_number)} ·{' '}
                {organizationStatusLabel(currentOrg.status)}
              </p>
            )}
          </div>

          <div>
            <DrawerHeading>{locale === 'en' ? 'Your screens' : 'أقسام حسابك'}</DrawerHeading>
            <div className="grid grid-cols-2 gap-2">
              {accountNav.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={activeView === item.id ? 'page' : undefined}
                  className={`${CONTROL_CLASS} flex items-center gap-2 text-start ${
                    activeView === item.id
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-hassal-raised dark:text-emerald-200'
                      : ''
                  }`}
                >
                  <item.Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 truncate">{item.label[locale]}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <DrawerHeading>{locale === 'en' ? 'Language & appearance' : 'اللغة والمظهر'}</DrawerHeading>
            <DisplayControls locale={locale} onChangeLocale={onChangeLocale} />
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3 text-sm font-bold text-rose-700 hover:bg-rose-50 dark:border-hassal-line dark:bg-hassal-surface dark:text-rose-300"
          >
            <LogOut className="h-4 w-4" />
            {t.logout}
          </button>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
        {capabilityText} · {taxText}
      </p>
    </Drawer>
  );
};
