import React from 'react';
import { Save } from 'lucide-react';

/**
 * The few controls the administration screens share.
 *
 * They live together because three screens need exactly the same wording of a
 * banner, the same disabled state on an action that writes to the server, and
 * the same empty look when a value was never recorded. Duplicating them is how
 * one screen ends up showing an error the others swallow.
 *
 * The dark-theme values are written here once, for the same reason. A reviewer
 * reading registration certificates at night is looking at these surfaces for
 * hours, and contrast that is set per-screen is contrast that drifts between
 * screens. `--color-hassal-*` is defined in `src/index.css`.
 */

export type Banner = { kind: 'ok' | 'error' | 'warn'; text: string } | null;

/**
 * `warn` is its own kind because a refusal and an inconvenient truth are not the
 * same event. "The key was issued, and no route authenticates it" succeeded — the
 * message that follows it must not wear the colour of a failure.
 */
const BANNER_TONES: Record<Banner extends null ? never : NonNullable<Banner>['kind'], string> = {
  ok: 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200',
  error: 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200',
  warn: 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200',
};

export const PanelShell: React.FC<{ title: string; hint: string; children: React.ReactNode }> = ({
  title,
  hint,
  children,
}) => (
  <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 dark:bg-hassal-surface dark:border-hassal-line">
    <div className="border-b border-slate-100 pb-3 dark:border-hassal-line">
      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="text-[11px] text-slate-500 pt-1 leading-relaxed dark:text-slate-400">{hint}</p>
    </div>
    {children}
  </section>
);

export const LabeledSelect: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  /** In a sheet, a select takes the whole row; in a filter bar it sits beside the others. */
  wide?: boolean;
  /** A read-only select still has to say why nothing can be chosen. */
  disabled?: boolean;
  /** The server's rejection for this field, under the control. */
  error?: string;
}> = ({ label, value, onChange, options, wide, disabled, error }) => (
  <label className="min-w-0 space-y-1">
    <span className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">{label}</span>
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={`w-full rounded-lg border bg-slate-50 px-2.5 py-2 text-xs font-medium text-slate-800 dark:border-hassal-line dark:bg-hassal-raised dark:text-slate-100 ${
        error ? 'border-rose-300 dark:border-rose-700' : 'border-slate-200'
      } ${wide ? '' : 'sm:w-auto sm:min-w-[9rem]'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {options.map((option) => (
        <option key={`${option.value}-${option.label}`} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
    {error ? <span className="block text-[10px] text-rose-700 font-semibold dark:text-rose-300">{error}</span> : null}
  </label>
);

/**
 * One field treatment for every form on the platform.
 *
 * The border turns rose only when the server refused this field, and the refusal
 * is printed under it rather than in a banner above the form: a person fixing a
 * rejected value needs the reason attached to the box they are typing in.
 */
export const TextInput: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  wide?: boolean;
  /** id of a <datalist> offering suggested values; typing is never limited to it. */
  list?: string;
  type?: 'text' | 'number' | 'date' | 'password' | 'email';
  min?: string | number;
  max?: string | number;
  /** A decimal price is not an integer count; the step is what the server validates. */
  step?: string | number;
  /** The column's own limit, so a too-long answer is stopped here rather than refused there. */
  maxLength?: number;
  /** Digits on a phone: a decimal keyboard, and no word suggestions fighting it. */
  inputMode?: 'decimal' | 'numeric' | 'text';
  multiline?: boolean;
  rows?: number;
  /** A rejection the server returned for this field, placed under the field. */
  error?: string;
  /** Said out loud rather than only greyed: a disabled field must explain itself. */
  disabled?: boolean;
  help?: string;
  /**
   * Coordinates and phone numbers are read digit by digit, so they keep Latin
   * digits and left-to-right order even on an Arabic screen — a reversed
   * latitude is a warehouse in the wrong sea.
   */
  dirLtr?: boolean;
}> = ({
  label,
  value,
  onChange,
  placeholder,
  wide,
  list,
  type = 'text',
  min,
  max,
  step,
  maxLength,
  inputMode,
  multiline,
  rows = 3,
  error,
  disabled,
  help,
  dirLtr,
}) => {
  /**
   * Widths. A field used to be `w-52` at every size, which is 208px of a 360px
   * phone screen and leaves the label, the padding and the next control to fight
   * over the rest. Under the first breakpoint the control takes the row it is
   * on — dense filter bars keep their side-by-side layout from `sm` up, where
   * the pointer is a mouse and the row is wide enough for it.
   */
  const field = `bg-slate-50 border rounded-lg px-2.5 py-2 text-xs leading-relaxed focus:bg-white focus:outline-none ${
    error ? 'border-rose-300' : 'border-slate-200'
  } dark:bg-hassal-raised dark:text-slate-100 dark:focus:bg-hassal-night ${
    error ? 'dark:border-rose-700' : 'dark:border-hassal-line'
  } ${wide ? 'w-full' : 'w-full sm:w-52'} ${dirLtr ? 'text-left' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`;

  return (
    <label className="space-y-1 block">
      <span className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          disabled={disabled}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={rows}
          className={field}
        />
      ) : (
        <input
          type={type}
          value={value}
          min={min}
          max={max}
          step={step}
          maxLength={maxLength}
          inputMode={inputMode}
          dir={dirLtr ? 'ltr' : undefined}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          list={list}
          className={dirLtr ? `${field} text-left` : field}
        />
      )}
      {help && !error ? <span className="block text-[10px] text-slate-400 dark:text-slate-500">{help}</span> : null}
      {error ? <span className="block text-[10px] text-rose-700 font-semibold dark:text-rose-300">{error}</span> : null}
    </label>
  );
};

export const DecisionButton: React.FC<{
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  tone?: 'primary' | 'default';
}> = ({ children, onClick, busy, tone = 'default' }) => (
  <button
    onClick={onClick}
    disabled={busy}
    className={`text-xs font-bold px-3 py-2 rounded-lg border flex items-center gap-1.5 disabled:opacity-40 cursor-pointer ${
      tone === 'primary'
        ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700 dark:border-emerald-700 dark:hover:bg-emerald-600'
        : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100 dark:bg-hassal-raised dark:text-slate-100 dark:border-hassal-line dark:hover:bg-hassal-night'
    }`}
  >
    {tone === 'primary' ? <Save className="w-3.5 h-3.5" /> : null}
    <span>{children}</span>
  </button>
);

/** A recorded fact, with the label outside and the server's value inside. */
export const Fact: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 dark:bg-hassal-raised dark:border-hassal-line">
    <div className="text-[10px] text-slate-500 dark:text-slate-400">{label}</div>
    <div className="text-[11px] font-bold text-slate-800 truncate dark:text-slate-100">{value}</div>
  </div>
);

/**
 * One line of a record: the label on one side, the value the server answered on
 * the other, and both allowed to wrap on a narrow screen rather than squeeze.
 *
 * `Fact` is a value in a box; this is a value in a list — an invoice, a hold's
 * terms, a contract's snapshot — where a person reads down the column and the
 * figures have to line up between screens that show the same numbers.
 */
export const ValueRow: React.FC<{ label: React.ReactNode; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-slate-600 dark:text-slate-300">
    <span className="min-w-0">{label}</span>
    <span className="shrink-0 font-semibold text-slate-900 dark:text-slate-100">{value}</span>
  </div>
);

export const BannerView: React.FC<{ banner: Banner }> = ({ banner }) => {
  if (!banner) return null;
  return (
    <div className={`text-xs rounded-lg px-3 py-2.5 border ${BANNER_TONES[banner.kind] ?? BANNER_TONES.warn}`}>
      {banner.text}
    </div>
  );
};

/**
 * Not an error: something the platform wants the reader to know before acting,
 * which is why it is amber and not rose.
 */
export const ErrorNote: React.FC<{ text: string }> = ({ text }) => (
  <div className="text-xs rounded-lg px-3 py-2.5 border bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200">
    {text}
  </div>
);

/** A value as the platform holds it, or the words that say it never was. */
export function recorded(value: string | null | undefined): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || 'لم يُسجَّل';
}

/**
 * A heading inside a long form.
 *
 * A form on a phone is one scroll, so each block gets three words saying what it
 * is for. The heading carries no rule the server enforces — it only groups fields
 * that were already grouped by what they answer.
 */
export const FormSection: React.FC<{ title: string }> = ({ title }) => (
  <p className="-mb-2 text-[11px] font-black text-slate-500 dark:text-slate-400">{title}</p>
);

/**
 * A form whose fields are judged by this app.
 *
 * `noValidate` is the whole component, and it is not cosmetic. The browser runs its
 * own constraint pass *before* React's `onSubmit`, so a quantity of `0` in a box
 * carrying `min="0.01"` is stopped by the engine — the app's validator never runs,
 * its per-field message never renders, and what the buyer sees is a browser bubble
 * in the browser's language (in an embedded webview, nothing at all). Every screen
 * that uses this component has a validator whose words are written for that field
 * and keyed to the server's own field names; those words have to be the ones spoken.
 *
 * The native attributes stay in place for what they still do: `min`, `step` and
 * `inputMode` shape the mobile keyboard and the spinner's first value. They stop
 * being a gate, not a hint.
 *
 * Forms that *are* browser-validated — the credential sheet, where `required` and
 * `type="email"` are the only rules — keep a plain `<form>`; there the bubble is the
 * message and disabling validation would silence it.
 */
export const Form: React.FC<{
  onSubmit: (event: React.FormEvent) => void;
  className?: string;
  children: React.ReactNode;
}> = ({ onSubmit, className, children }) => (
  <form noValidate onSubmit={onSubmit} className={className}>
    {children}
  </form>
);

/**
 * The two buttons at the end of every sheet form.
 *
 * They are one component because the pair was written three times over in the
 * seller's screens, and twice they disagreed about what "busy" meant — one sheet
 * disabled the submit button while saving and another left it live, so the same
 * double tap created two offers on one row and two on the other.
 *
 * `busyLabel` is required next to `submitLabel`: a button that says "حفظ" while it
 * has already sent the form and is waiting reads as a dead control, which is what
 * makes people tap it again.
 */
export const FormFooter: React.FC<{
  onCancel: () => void;
  submitLabel: string;
  busyLabel: string;
  busy?: boolean;
  /** A form whose rules are unmet can still be submitted — the server will refuse it. Only a save in flight may not. */
  disabled?: boolean;
}> = ({ onCancel, submitLabel, busyLabel, busy, disabled }) => (
  <div className="flex items-center gap-3 pt-1">
    <button
      type="button"
      onClick={onCancel}
      className="flex-1 rounded-xl bg-slate-100 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 cursor-pointer dark:bg-hassal-raised dark:text-slate-200 dark:hover:bg-hassal-night"
    >
      إلغاء
    </button>
    <button
      type="submit"
      disabled={busy || disabled}
      className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-md hover:bg-emerald-700 disabled:opacity-50 cursor-pointer dark:bg-emerald-700 dark:hover:bg-emerald-600"
    >
      {busy ? busyLabel : submitLabel}
    </button>
  </div>
);
