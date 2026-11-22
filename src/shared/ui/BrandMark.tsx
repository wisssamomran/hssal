import React from 'react';

/**
 * The HASSAL mark, in one place.
 *
 * The brand ships as PNG (`public/brand/icon-144.png`), and every screen that
 * shows it used to draw its own coloured square with a «حـ» letter inside. That
 * is a second logo nobody maintains: it drifts from the real one the moment the
 * artwork changes, and it is what a person sees in the tab bar nowhere else.
 *
 * Two rules here:
 *
 *   1. The file is 144px square and is displayed at 16–44px, so even a 3x phone
 *      screen gets a sharp mark. Sizes are set per use rather than scaled by a
 *      `transform`, which would blur it.
 *   2. It is decorative next to the wordmark — the name «حَصّـال» is written
 *      beside it in every one of those places, so the accessible name comes
 *      from the text and the image carries `alt=""`. Only the states that stand
 *      alone pass their own `label`.
 */

type Props = {
  /** Edge length in pixels. */
  size?: number;
  className?: string;
  /** Only when the mark is the whole message rather than a decoration beside a name. */
  label?: string;
};

export default function BrandMark({ size = 32, className = '', label }: Props) {
  return (
    <img
      src="/brand/icon-144.png"
      width={size}
      height={size}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      draggable={false}
      className={`shrink-0 select-none ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/**
 * The mark working, beside the words that say so.
 *
 * Sign in and registration used to show a spinner. A spinner is any product's
 * answer to "wait"; the brand breathing while the server checks your
 * credentials says the same thing and names who is doing it. It is inline, not
 * an overlay, so it never hides the form the person may have to correct.
 *
 * `aria-live="polite"` because the sentence is the result of an action nobody
 * can see the start of otherwise.
 */
export function BrandWorking({
  text,
  size = 22,
  className = '',
}: {
  text: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-live="polite"
      className={`inline-flex items-center gap-2 ${className}`}
    >
      <BrandMark size={size} label="حصّال" className="hassal-brand-breathe" />
      <span>{text}</span>
    </span>
  );
}
