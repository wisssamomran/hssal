import React, { useEffect, useRef, useState } from 'react';
import { KeyRound, LogIn, UserPlus, X } from 'lucide-react';
import BrandMark, { BrandWorking } from '@/shared/ui/BrandMark';
import { forgotPassword, googleSignIn, login, register, resetPassword } from '@/features/auth/api';
import { googleSignInSettings, usePlatformConfig } from '@/core/config';
import { clearSignInNonce, renderGoogleSignInButton, rotateSignInNonce, signInNonce } from '@/features/auth/googleIdentity';
import { translations } from '@/core/i18n';
import type { Locale } from '@/core/i18n';

/**
 * Sign in, register, and password reset.
 *
 * There is deliberately no "quick login as …" panel here. A screen that lists
 * accounts and a shared development password is not a convenience — in a
 * deployment that has been seeded even once it is a directory of targets, and
 * in one that has not, every button on it fails. Real accounts come from
 * registration, from Google, or from the operator's own installer.
 *
 * Registration opens a *person*: name, email, password. It does not ask for a
 * business, because the server refuses one here — `POST /organizations` is the
 * single door that applies the legal-record rules, the duplicate-register check
 * and the per-account ceiling, and it is also the door a Google account reaches
 * later. Both kinds of account therefore walk one path through one policy, and
 * the door itself stays short.
 *
 * The Google button appears only when the operator has switched the feature on
 * *and* entered a client ID (`googleSignInSettings().ready`), so a control that
 * could only be refused is never offered.
 */

interface AuthModalProps {
  mode: 'login' | 'register' | 'reset';
  onClose: () => void;
  onAuthenticated: () => void;
  locale?: Locale;
}

/**
 * A message that is not a scolding. `tone: 'notice'` renders in the calm style
 * the reset links use; `tone: 'error'` in the refusal style. One slot for both
 * keeps the card from stacking three banners after a bad submit.
 */
interface Notice {
  tone: 'error' | 'notice';
  text: string;
}

const STRINGS = {
  ar: {
    signInTitle: 'تسجيل الدخول',
    signInSub: 'ادخل إلى العروض والصفقات ومنشأتك.',
    registerTitle: 'إنشاء حساب',
    registerSub: 'خطوة واحدة: بريدك وكلمة مرور. المنشأة تُضاف بعد ذلك.',
    resetTitle: 'تعيين كلمة مرور جديدة',
    resetSub: 'أدخل كلمة المرور الجديدة لحسابك.',
    forgotTitle: 'استعادة كلمة المرور',
    forgotSub: 'نرسل رابطًا إلى بريدك المسجّل.',
    close: 'إغلاق',
    name: 'الاسم الكامل',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    newPassword: 'كلمة المرور الجديدة',
    confirmPassword: 'تأكيد كلمة المرور',
    signIn: 'تسجيل الدخول',
    register: 'إنشاء حساب',
    processing: 'جارٍ التنفيذ…',
    forgotLink: 'نسيت كلمة المرور؟',
    backToSignIn: 'العودة لتسجيل الدخول',
    sendLink: 'إرسال رابط الاستعادة',
    saving: 'جارٍ الحفظ…',
    savePassword: 'حفظ كلمة المرور',
    linkSent: 'تم إرسال رابط الاستعادة إلى بريدك. افتح الرابط لتعيين كلمة جديدة.',
    passwordChanged: 'تم تغيير كلمة المرور. يمكنك الآن تسجيل الدخول.',
    or: 'أو',
    googleFailed: 'تعذّر إتمام الدخول عبر جوجل.',
    businessNote: 'بعد الدخول يمكنك إضافة منشأتك بالسجل التجاري الخاص بها.',
    fallback: 'تعذر إتمام العملية',
  },
  en: {
    signInTitle: 'Sign in',
    signInSub: 'Reach your offers, deals and organization.',
    registerTitle: 'Create an account',
    registerSub: 'One step: your email and a password. The organization comes next.',
    resetTitle: 'Set a new password',
    resetSub: 'Enter the new password for your account.',
    forgotTitle: 'Reset your password',
    forgotSub: 'We send a link to your registered email.',
    close: 'Close',
    name: 'Full name',
    email: 'Email',
    password: 'Password',
    newPassword: 'New password',
    confirmPassword: 'Confirm password',
    signIn: 'Sign in',
    register: 'Create account',
    processing: 'Working…',
    forgotLink: 'Forgot your password?',
    backToSignIn: 'Back to sign in',
    sendLink: 'Send reset link',
    saving: 'Saving…',
    savePassword: 'Save password',
    linkSent: 'A reset link has been sent to your email. Open it to set a new password.',
    passwordChanged: 'Password changed. You can sign in now.',
    or: 'or',
    googleFailed: 'Google sign-in could not be completed.',
    businessNote: 'After signing in you can add your organization with its commercial register.',
    fallback: 'The request could not be completed',
  },
} as const;

/** Shared field styling: 44px tall for a thumb, and one visible focus ring. */
const inputClass =
  'mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-normal text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50';

const labelClass = 'block text-sm font-bold text-slate-700 dark:text-slate-200';

export const AuthModal: React.FC<AuthModalProps> = ({
  mode: initialMode,
  onClose,
  onAuthenticated,
  locale = 'ar',
}) => {
  const s = STRINGS[locale];
  const t = translations[locale];
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>(initialMode);
  const [forgotMode, setForgotMode] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const googleSlot = useRef<HTMLDivElement | null>(null);
  /**
   * Bootstrap may land after this card is already open — a person who taps
   "تسجيل الدخول" on a slow connection should not have to close and reopen it to
   * see the Google button. The store re-renders on arrival, and the effect below
   * reads the switch again.
   */
  const platform = usePlatformConfig();
  const googleReady = googleSignInSettings().ready;

  const isDark =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  const resetNotice = () => setNotice(null);

  useEffect(() => {
    const queryEmail = new URLSearchParams(window.location.search).get('email');
    if (queryEmail) setEmail(queryEmail);
  }, []);

  // Close on Escape, and let the backdrop take the click. A sign-in card that
  // traps a visitor who changed their mind is the oldest usability complaint.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  /**
   * Google's button is drawn by Google's script, so it needs a real element and
   * a nonce generated before the request. Re-rendering on mode changes keeps
   * one visible button rather than two stacked ones.
   */
  useEffect(() => {
    if (mode === 'reset' || forgotMode) {
      setGoogleAvailable(false);
      return;
    }
    if (!googleReady || !googleSlot.current) return;

    let cancelled = false;
    void renderGoogleSignInButton({
      container: googleSlot.current,
      locale,
      dark: isDark,
      onCredential: (credential) => {
        void completeGoogleSignIn(credential);
      },
    }).then((drawn) => {
      if (!cancelled) setGoogleAvailable(drawn);
    });

    return () => {
      cancelled = true;
    };
    // `platform.loaded` and `googleReady` are what a late bootstrap changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, forgotMode, locale, isDark, googleReady, platform.loaded]);

  const completeGoogleSignIn = async (credential: string) => {
    setGoogleBusy(true);
    resetNotice();
    const response = await googleSignIn(credential, signInNonce());
    setGoogleBusy(false);

    if (!response.success) {
      // A used nonce must not survive the attempt that failed with it.
      rotateSignInNonce();
      setNotice({
        tone: 'error',
        text: String(response.message || s.googleFailed),
      });
      return;
    }

    clearSignInNonce();
    onAuthenticated();
    onClose();
  };

  const firstValidationError = (response: { error?: { details?: unknown } }): string | null => {
    const details = response.error?.details;
    if (!details || typeof details !== 'object') return null;
    const values = Object.values(details as Record<string, unknown>).flat();
    return values.length ? String(values[0]) : null;
  };

  const submitForgotPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    resetNotice();
    setSubmitting(true);
    const response = await forgotPassword(email);
    setSubmitting(false);
    if (!response.success) {
      setNotice({ tone: 'error', text: response.message || s.fallback });
      return;
    }
    setNotice({ tone: 'notice', text: s.linkSent });
  };

  const submitResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    resetNotice();
    setSubmitting(true);
    const token = new URLSearchParams(window.location.search).get('reset_token') || '';
    const response = await resetPassword({
      email,
      token,
      password,
      password_confirmation: passwordConfirmation,
    });
    setSubmitting(false);
    if (!response.success) {
      setNotice({ tone: 'error', text: firstValidationError(response) || response.message || s.fallback });
      return;
    }
    setMode('login');
    setForgotMode(false);
    setPassword('');
    setPasswordConfirmation('');
    setNotice({ tone: 'notice', text: s.passwordChanged });
    try {
      window.history.replaceState({}, '', window.location.pathname);
    } catch {
      // Ignore history restrictions in sandboxed frames.
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    resetNotice();
    setSubmitting(true);

    const response =
      mode === 'login'
        ? await login(email, password)
        : await register({ name, email, password, password_confirmation: passwordConfirmation });

    setSubmitting(false);
    if (!response.success || !response.data?.token) {
      setNotice({
        tone: 'error',
        text: firstValidationError(response) || response.message || s.fallback,
      });
      return;
    }

    onAuthenticated();
    onClose();
  };

  const showTabs = mode !== 'reset' && !forgotMode;

  /**
   * Google's own button is drawn *into* the slot by its script, so the element
   * has to exist before the answer arrives. Hiding the wrapper with `hidden`
   * rather than not rendering it is what lets the first attempt work: an
   * un-mounted ref can only be filled by the render after it, which leaves a
   * card that shows the button on the second open and never on the first.
   */
  const googleBlock = (
    <div className={googleAvailable ? 'space-y-3' : 'hidden'}>
      <div ref={googleSlot} className="flex min-h-[44px] justify-center" />
      {googleBusy && (
        <BrandWorking
          text={s.processing}
          size={24}
          className="justify-center text-xs font-bold text-slate-500"
        />
      )}
      <div className="flex items-center gap-3 text-[11px] font-bold uppercase text-slate-400">
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        {s.or}
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[92dvh] w-full flex-col overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-md sm:rounded-2xl"
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 pb-4 dark:border-slate-800">
          {/* The mark is the credential here: this dialog asks a business to
              hand over its registration documents, and it should say whose
              hands they are going into. */}
          <BrandMark size={40} className="mt-0.5" />
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-slate-50">
              {mode === 'reset'
                ? s.resetTitle
                : forgotMode
                  ? s.forgotTitle
                  : mode === 'login'
                    ? s.signInTitle
                    : s.registerTitle}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {mode === 'reset'
                ? s.resetSub
                : forgotMode
                  ? s.forgotSub
                  : mode === 'login'
                    ? s.signInSub
                    : s.registerSub}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-m-1 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-emerald-600"
            aria-label={s.close}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          {showTabs && (
            <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-sm font-bold dark:bg-slate-800">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  resetNotice();
                }}
                className={`rounded-lg px-3 py-2.5 transition ${
                  mode === 'login'
                    ? 'bg-white text-emerald-800 shadow-sm dark:bg-slate-900 dark:text-emerald-300'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {t.login}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  resetNotice();
                }}
                className={`rounded-lg px-3 py-2.5 transition ${
                  mode === 'register'
                    ? 'bg-white text-emerald-800 shadow-sm dark:bg-slate-900 dark:text-emerald-300'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {t.register}
              </button>
            </div>
          )}

          {showTabs && googleBlock}

          {mode === 'reset' ? (
            <form onSubmit={submitResetPassword} className="mt-4 space-y-4 sm:mt-0">
              <label className={labelClass}>
                {s.email}
                <input
                  required
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                {s.newPassword}
                <input
                  required
                  minLength={8}
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                {s.confirmPassword}
                <input
                  required
                  minLength={8}
                  type="password"
                  autoComplete="new-password"
                  value={passwordConfirmation}
                  onChange={(event) => setPasswordConfirmation(event.target.value)}
                  className={inputClass}
                />
              </label>
              {notice && <NoticeBlock notice={notice} />}
              <PrimaryButton disabled={submitting} working={submitting} workingText={s.processing}>
                <KeyRound className="h-4 w-4" />
                {submitting ? s.saving : s.savePassword}
              </PrimaryButton>
            </form>
          ) : forgotMode ? (
            <form onSubmit={submitForgotPassword} className="mt-4 space-y-4 sm:mt-0">
              <label className={labelClass}>
                {s.email}
                <input
                  required
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={inputClass}
                />
              </label>
              {notice && <NoticeBlock notice={notice} />}
              <PrimaryButton disabled={submitting} working={submitting} workingText={s.processing}>
                {submitting ? s.saving : s.sendLink}
              </PrimaryButton>
              <button
                type="button"
                onClick={() => {
                  setForgotMode(false);
                  resetNotice();
                }}
                className="w-full py-2 text-sm font-bold text-slate-500 transition hover:text-slate-800 dark:hover:text-slate-200"
              >
                {s.backToSignIn}
              </button>
            </form>
          ) : (
            <form onSubmit={submit} className="mt-4 space-y-3 sm:mt-0">
              {mode === 'register' && (
                <label className={labelClass}>
                  {s.name}
                  <input
                    required
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className={inputClass}
                  />
                </label>
              )}
              <label className={labelClass}>
                {s.email}
                <input
                  required
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                {s.password}
                <input
                  required
                  minLength={8}
                  type="password"
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={inputClass}
                />
              </label>
              {mode === 'register' && (
                <label className={labelClass}>
                  {s.confirmPassword}
                  <input
                    required
                    minLength={8}
                    type="password"
                    autoComplete="new-password"
                    value={passwordConfirmation}
                    onChange={(event) => setPasswordConfirmation(event.target.value)}
                    className={inputClass}
                  />
                </label>
              )}

              {notice && <NoticeBlock notice={notice} />}

              <PrimaryButton disabled={submitting} working={submitting} workingText={s.processing}>
                {mode === 'login' ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                {submitting
                  ? s.processing
                  : mode === 'login'
                    ? s.signIn
                    : s.register}
              </PrimaryButton>

              {mode === 'register' && (
                <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
                  {s.businessNote}
                </p>
              )}

              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => {
                    setForgotMode(true);
                    resetNotice();
                  }}
                  className="w-full py-1 text-sm font-bold text-emerald-700 transition hover:text-emerald-900 dark:text-emerald-400"
                >
                  {s.forgotLink}
                </button>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

const PrimaryButton: React.FC<
  React.PropsWithChildren<{ disabled?: boolean; working?: boolean; workingText?: string }>
> = ({ children, disabled, working, workingText }) => (
  <>
    <button
      disabled={disabled}
      type="submit"
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
    {/* The wait belongs to the brand, and it sits under the button rather than
        inside it: the emerald face is where the person's own words go, and a
        form that gets rejected has to stay readable while the answer arrives. */}
    {working && workingText ? (
      <BrandWorking
        text={workingText}
        size={26}
        className="w-full justify-center text-xs font-bold text-slate-500 dark:text-slate-400"
      />
    ) : null}
  </>
);

const NoticeBlock: React.FC<{ notice: Notice }> = ({ notice }) => (
  <div
    role={notice.tone === 'error' ? 'alert' : 'status'}
    className={`rounded-xl border p-3 text-sm font-medium leading-relaxed ${
      notice.tone === 'error'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-emerald-200 bg-emerald-50 text-emerald-800'
    }`}
  >
    {notice.text}
  </div>
);
