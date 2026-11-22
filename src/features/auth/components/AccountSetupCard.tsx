import React, { useState } from 'react';
import { Building2, Check, Loader2, Sparkles, X } from 'lucide-react';
import { fieldError } from '@/core/api/http';
import { updateProfile } from '@/features/auth/api';
import type { ProfileCompletion } from '@/features/auth/types';
import type { User } from '@/features/identity/types';
import type { Locale } from '@/core/i18n';

/**
 * The one thing the account still owes — asked once, in one place.
 *
 * The server reports this (`profile_completion` on `/auth/me` and on every
 * sign-in), so the card never invents a requirement and never keeps asking for
 * something the operator switched off. It is also the reason the sign-up form
 * itself stays short: a person can leave registration without a phone number or
 * a national ID and still browse, and what they must supply before opening a
 * business is collected here, where it reads as one step rather than a wall of
 * inputs on the first screen.
 *
 * It dismisses. A refusal to trade is the server's decision and it will say so
 * again at `POST /organizations`; a banner that cannot be closed turns the whole
 * platform into a nag, and a person who dismisses it can reopen the same fields
 * in their profile at any time.
 */

interface AccountSetupCardProps {
  completion: ProfileCompletion;
  user: User;
  locale: Locale;
  /** The screen that creates a business, opened from this card. */
  onOpenOrganization: () => void;
  /** Called after a saved write so the session is re-read from the server. */
  onSaved: () => void;
}

interface Texts {
  title: string;
  subtitle: string;
  phone: string;
  national_id: string;
  save: string;
  saving: string;
  saved: string;
  organization: string;
  organizationHint: string;
  password: string;
  dismiss: string;
}

const STRINGS: Record<Locale, Texts> = {
  ar: {
    title: 'خطوة واحدة تفصلك عن التداول',
    subtitle: 'هذه ما تطلبه إعدادات المنصة الحالية؛ اتركها وأنت تتصفح، ولن تُقبل منشأة بدونها.',
    phone: 'رقم الهاتف',
    national_id: 'رقم الهوية',
    save: 'حفظ',
    saving: 'جارٍ الحفظ…',
    saved: 'تم الحفظ',
    organization: 'تسجيل منشأة باسمك',
    organizationHint: 'السجل التجاري والرقم الضريبي يُطلبان هناك، وتخضع المنشأة لمراجعة المنصة قبل التداول.',
    password: 'لم تُعيَّن لك كلمة مرور بعد. أضفها من «ملفي الشخصي» لتستطيع الدخول بدون جوجل.',
    dismiss: 'إخفاء مؤقتًا',
  },
  en: {
    title: 'One step before you can trade',
    subtitle: 'These are what the current platform settings require. Browse freely without them; an organization needs them.',
    phone: 'Phone number',
    national_id: 'National ID',
    save: 'Save',
    saving: 'Saving…',
    saved: 'Saved',
    organization: 'Register your organization',
    organizationHint: 'The commercial register and tax number are asked there, and the platform reviews the business before it trades.',
    password: 'No password is set on this account yet. Add one from "My profile" to sign in without Google.',
    dismiss: 'Hide for now',
  },
};

/** Field keys the server can name; anything new is shown by its key, not dropped. */
function labelFor(key: string, s: Texts, locale: Locale): string {
  if (key === 'phone') return s.phone;
  if (key === 'national_id') return s.national_id;
  return locale === 'ar' ? `حقل ${key}` : key;
}

export const AccountSetupCard: React.FC<AccountSetupCardProps> = ({
  completion,
  user,
  locale,
  onOpenOrganization,
  onSaved,
}) => {
  const s = STRINGS[locale];
  const [dismissed, setDismissed] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({
    phone: user.phone ?? '',
    national_id: user.national_id ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const missing = completion.missing_fields ?? [];
  const needsFields = missing.length > 0;
  const needsOrganization = !completion.has_organization;

  if (dismissed || (!needsFields && !needsOrganization && completion.has_password)) return null;

  const save = async () => {
    setBusy(true);
    setError(null);
    const payload: { phone?: string; national_id?: string } = {};
    for (const key of missing) {
      const value = (values[key] ?? '').trim();
      if (value) payload[key as 'phone' | 'national_id'] = value;
    }
    const result = await updateProfile(payload);
    setBusy(false);
    if (!result.success) {
      const detail = missing
        .map((key) => fieldError(result, key))
        .find((message): message is string => Boolean(message));
      setError(detail || result.error?.message || result.message || '—');
      return;
    }
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2600);
    // The server re-reads the requirement after this write; the card follows its
    // answer rather than assuming the field is now satisfied.
    onSaved();
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-3 pt-4 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm dark:border-emerald-800/70 dark:bg-hassal-surface">
        <div className="flex items-start gap-3 border-b border-emerald-100 bg-emerald-50/70 px-4 py-3 dark:border-hassal-line dark:bg-hassal-raised">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-black text-emerald-950 dark:text-emerald-100">{s.title}</h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-emerald-800/80 dark:text-emerald-200/70">
              {s.subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label={s.dismiss}
            className="-m-1 rounded-lg p-1.5 text-emerald-700/70 transition hover:bg-white/70 hover:text-emerald-900 dark:text-emerald-300/70 dark:hover:bg-hassal-night"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          {needsFields && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {missing.map((key) => (
                  <label key={key} className="block">
                    <span className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                      {labelFor(key, s, locale)}
                    </span>
                    <input
                      value={values[key] ?? ''}
                      inputMode={key === 'phone' ? 'tel' : 'text'}
                      autoComplete={key === 'phone' ? 'tel' : 'off'}
                      onChange={(event) =>
                        setValues((previous) => ({ ...previous, [key]: event.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/25 dark:border-hassal-line dark:bg-hassal-night dark:text-slate-100"
                    />
                  </label>
                ))}
              </div>

              {error && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">
                  {error}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void save()}
                  className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {busy ? s.saving : s.save}
                </button>
                {savedFlash && (
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{s.saved}</span>
                )}
              </div>
            </>
          )}

          {needsOrganization && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-hassal-line dark:bg-hassal-raised">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-black text-slate-800 dark:text-slate-100">
                  <Building2 className="h-4 w-4 shrink-0 text-slate-500" />
                  {s.organization}
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  {s.organizationHint}
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenOrganization}
                className="shrink-0 rounded-xl border border-emerald-300 bg-white px-3.5 py-2 text-xs font-bold text-emerald-800 transition hover:bg-emerald-50 dark:border-emerald-700 dark:bg-hassal-night dark:text-emerald-300"
              >
                {locale === 'ar' ? 'متابعة' : 'Continue'}
              </button>
            </div>
          )}

          {!completion.has_password && (
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{s.password}</p>
          )}
        </div>
      </section>
    </div>
  );
};
