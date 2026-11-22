import React, { useEffect } from 'react';
import { getLocale } from '@/core/i18n';

/**
 * The one dialog this app draws: a decision sheet on a phone, a centred card on
 * a desktop.
 *
 * It used to exist twice — a `Modal` on the deals pipeline and a `ModalShell` on
 * the disputes screen — and the two had already drifted: one closed on any backdrop
 * tap, the other on a tap it had to stop from bubbling, one sized to the form and
 * one to the record. A person who meets two dialogs learns neither.
 *
 * On a handset a centred modal puts its own close button and its submit button
 * under the thumb's dead zone, and a long form has no scroll of its own. So the
 * sheet rises from the bottom, scrolls inside `92dvh`, keeps its header pinned
 * while the body moves, and closes on the backdrop or Escape — the same gesture
 * as the ✕, so nothing on any screen traps the person inside it. A form inside
 * here is never reset by an accidental tap, because the parent keeps its state and
 * this shell keeps only the chrome.
 *
 * The dark ground is deliberate: a sheet that dims the console behind it is the
 * only cue that the screen has changed, and the bottom sheet has no border of its
 * own to lean on.
 */
export const Sheet: React.FC<{
  /** A string for a plain title, or the block a record needs (number, status, sub-line). */
  title: React.ReactNode;
  onClose: () => void;
  /** `md` a short decision, `lg` a form, `xl` a whole record with a table in it. */
  size?: 'md' | 'lg' | 'xl';
  children: React.ReactNode;
}> = ({ title, onClose, size = 'md', children }) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-2xl border border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl sm:rounded-2xl sm:pb-0 ${
          size === 'xl' ? 'sm:max-w-2xl' : size === 'lg' ? 'sm:max-w-lg' : 'sm:max-w-md'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-100 bg-white p-4 sm:p-6">
          <div className="min-w-0">{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label={getLocale() === 'ar' ? 'إغلاق' : 'Close'}
            className="-m-1 shrink-0 cursor-pointer p-1 text-lg font-bold text-slate-400 hover:text-slate-700"
          >
            ✕
          </button>
        </div>
        <div className="space-y-4 p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
};
