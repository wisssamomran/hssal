import React from 'react';
import type { Locale } from '@/core/i18n';
import type { DealStatus } from '../types';
import { dealStatusLabel } from '../labels';

/**
 * The drawn fulfilment path.
 *
 * It is wide by nature — eight states with their own Arabic names — so it scrolls
 * inside its own strip (`min-w` keeps the steps legible instead of crushing them)
 * and the parent decides whether the person sees it inline or behind a disclosure.
 */
export const StepsTrack: React.FC<{
  steps: DealStatus[];
  currentIndex: number;
  locale: Locale;
}> = ({ steps, currentIndex, locale }) => (
  <ol className="relative flex min-w-[680px] items-center justify-between">
    {steps.map((step, index) => {
      const isCurrent = currentIndex === index;
      const isDone = currentIndex >= index && currentIndex !== -1;

      return (
        <li key={step} className="z-10 flex flex-1 flex-col items-center text-center">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
              isCurrent
                ? 'bg-emerald-600 text-white ring-4 ring-emerald-100'
                : isDone
                ? 'bg-emerald-500 text-white'
                : 'bg-slate-100 text-slate-400'
            }`}
            aria-current={isCurrent ? 'step' : undefined}
          >
            {index + 1}
          </span>
          <span
            className={`mt-1.5 px-1 text-[10px] leading-tight ${
              isCurrent ? 'font-bold text-emerald-800' : isDone ? 'font-medium text-slate-700' : 'text-slate-400'
            }`}
          >
            {dealStatusLabel(step, locale)}
          </span>
        </li>
      );
    })}
  </ol>
);
