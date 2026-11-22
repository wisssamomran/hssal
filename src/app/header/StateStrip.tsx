import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { baseCurrency } from '@/core/config';
import { translations } from '@/core/i18n';
import type { Locale } from '@/core/i18n';

/**
 * The trust and state strip, on the widths that have room for it.
 *
 * On a phone this information is one tap away in the account sheet rather than three
 * lines above the page: the first screen a buyer sees should be the goods, not the
 * platform's notices.
 *
 * Every word here is read from the deployment. The tax sentence comes from the tax
 * settings, the capability sentence from the feature flags, the currency from the
 * registry — and both stay silent about what has not been configured instead of
 * asserting a default. The registration note is the one fixed claim, and it is a
 * description of this platform's own process: a business's documents are reviewed by
 * the team, which is not the same as saying any ministry checked them.
 */
export const StateStrip: React.FC<{
  locale: Locale;
  capability: { text: string; warning: boolean };
  taxText: string;
}> = ({ locale, capability, taxText }) => {
  const t = translations[locale];

  return (
    <div className="hidden items-center justify-between gap-3 bg-slate-900 px-4 py-1.5 text-xs text-slate-300 md:flex md:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`flex items-center gap-1.5 font-medium ${capability.warning ? 'text-amber-400' : 'text-emerald-400'}`}>
          <span className={`h-2 w-2 animate-pulse rounded-full ${capability.warning ? 'bg-amber-500' : 'bg-emerald-500'}`} />
          <span className="truncate">{capability.text}</span>
        </span>
        <span className="text-slate-600">|</span>
        <span className="text-slate-400">{taxText}</span>
      </div>

      <div className="flex shrink-0 items-center gap-4 text-xs">
        <span className="flex items-center gap-1 font-medium text-amber-400">
          <ShieldCheck className="h-3.5 w-3.5" />
          {locale === 'en'
            ? 'Registration documents are reviewed by the platform team'
            : 'وثائق السجل التجاري تُراجع من فريق المنصة'}
        </span>
        <span className="text-slate-400">
          {t.currencyPrefix} {baseCurrency() ?? t.notConfigured}
        </span>
      </div>
    </div>
  );
};
