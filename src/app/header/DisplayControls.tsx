import React from 'react';
import { Languages, Moon, Sun } from 'lucide-react';
import { translations } from '@/core/i18n';
import type { Locale } from '@/core/i18n';
import { useTheme } from '@/core/theme';
import { CONTROL_CLASS } from './styles';

/**
 * Language and appearance, defined once.
 *
 * A signed-in session finds them in the account sheet beside its own screens; a guest has
 * no account to tap, so the same two controls are the whole reason their sheet exists.
 * Written twice, they would drift the first time one of them was restyled.
 *
 * The theme button names the mode you are about to get, not the one you are in: a control
 * that shows the current state reads as a broken switch. The choice lives in this browser
 * only — it is a preference, not a fact about the account.
 */
export const DisplayControls: React.FC<{ locale: Locale; onChangeLocale: (locale: Locale) => void }> = ({
  locale,
  onChangeLocale,
}) => {
  const t = translations[locale];
  const { theme, toggle } = useTheme();

  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={toggle} className={`${CONTROL_CLASS} flex items-center justify-center gap-2`}>
        {theme === 'dark' ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
        {theme === 'dark' ? (locale === 'en' ? 'Light' : 'نهاري') : (locale === 'en' ? 'Dark' : 'ليلي')}
      </button>
      <button
        type="button"
        onClick={() => onChangeLocale(locale === 'ar' ? 'en' : 'ar')}
        className={`${CONTROL_CLASS} flex items-center justify-center gap-2`}
      >
        <Languages className="h-4 w-4 shrink-0" />
        {t.switchLanguage}
      </button>
    </div>
  );
};
