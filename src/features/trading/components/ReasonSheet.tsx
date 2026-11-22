import React, { useState } from 'react';
import { Sheet } from '@/shared/ui/Sheet';

/**
 * One request for a written reason, and what to do with the answer.
 *
 * The reason is collected on this screen instead of in `window.prompt` because iOS
 * Safari has no prompt: on an iPhone every one of those buttons read `null` and did
 * nothing at all. The text is not sent anywhere new — it goes to the same call,
 * with the same checks, as before.
 */
export type ReasonAsk = {
  title: string;
  placeholder: string;
  confirmLabel: string;
  /** Whether the server accepts the move with an empty note. */
  optional: boolean;
  proceed: (text: string) => void;
};

/**
 * The written reason, in the same sheet every dialog here rides in.
 *
 * Closing it without typing is the person changing their mind, exactly as
 * dismissing the browser prompt was, and no call is made.
 */
export const ReasonSheet: React.FC<{
  ask: ReasonAsk;
  cancelLabel: string;
  onClose: () => void;
}> = ({ ask, cancelLabel, onClose }) => {
  const [text, setText] = useState('');

  return (
    <Sheet title={ask.title} onClose={onClose}>
      <label className="block space-y-1">
        <span className="block text-[11px] font-bold text-slate-600">{ask.placeholder}</span>
        <textarea
          autoFocus
          rows={3}
          maxLength={500}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs font-normal focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </label>
      <div className="flex flex-col-reverse gap-2.5 sm:flex-row">
        <button
          type="button"
          onClick={onClose}
          className="w-full cursor-pointer rounded-xl bg-slate-100 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-200 sm:flex-1 sm:py-2.5"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          disabled={!ask.optional && text.trim().length === 0}
          onClick={() => ask.proceed(text)}
          className="w-full cursor-pointer rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-1 sm:py-2.5"
        >
          {ask.confirmLabel}
        </button>
      </div>
    </Sheet>
  );
};
