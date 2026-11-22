/**
 * The two boxes the header draws repeatedly.
 *
 * A control class and a field class, named once. They were string literals inside the
 * header's own render, and the account sheet, the guest sheet and the desktop strip each
 * retyped the long dark-mode variant — which is how a control ended up rounded one way in
 * the sheet and another way beside it.
 */

/** A button in a header surface: the language and appearance pair, an account screen. */
export const CONTROL_CLASS =
  'rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-hassal-line dark:bg-hassal-surface dark:text-slate-200 dark:hover:bg-hassal-raised';

/** The commercial-context box: the business this session answers for. */
export const CONTEXT_FIELD_CLASS =
  'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 dark:border-hassal-line dark:bg-hassal-surface dark:text-slate-100';

/** The same box as the phone sheet draws it: full width, larger touch target. */
export const contextFieldClass = (fullWidth: boolean): string =>
  `${CONTEXT_FIELD_CLASS}${fullWidth ? ' w-full rounded-xl px-3 py-2.5 text-sm' : ''}`;
