import React from 'react';
import { X } from 'lucide-react';
import type { Locale } from '@/core/i18n';

/**
 * A phone's bottom drawer, and only a phone's.
 *
 * `shared/ui/Sheet.tsx` is this app's one dialog: it centres on a desktop and rises
 * from the bottom on a handset. This is a different thing — the header's overflow and
 * account panels, which must never appear on a wide screen because a wide screen
 * already shows the strip and the chip they duplicate. Hence `md:hidden` and a lower
 * z-index than the dialogs that sit on top of the header.
 *
 * It is one component because the header opens two of them, and a sheet that closes on
 * the backdrop in one and only on its ✕ in the other teaches a person that half of the
 * gestures they have learned do not work here.
 */
export const Drawer: React.FC<{
  title: string;
  locale: Locale;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, locale, onClose, children }) => (
  <div
    className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/50 md:hidden"
    role="dialog"
    aria-modal="true"
    aria-label={title}
    onClick={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}
  >
    <div className="max-h-[80dvh] w-full space-y-4 overflow-y-auto rounded-t-2xl border-t border-slate-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl dark:border-hassal-line dark:bg-hassal-surface">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-black text-slate-900 dark:text-slate-50">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={locale === 'en' ? 'Close' : 'إغلاق'}
          className="-m-1 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-hassal-raised"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

/** A section heading inside a drawer or the account menu. */
export const DrawerHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mb-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">{children}</div>
);
