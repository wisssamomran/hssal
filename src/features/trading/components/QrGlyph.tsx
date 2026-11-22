import React from 'react';
import type { QrSymbol } from '../types';

/**
 * The symbol the backend encoded, drawn as it was meant to be drawn.
 *
 * Every module is a unit square in a `viewBox` sized to the grid plus the quiet
 * zone the encoder documented but deliberately did not include, so the same
 * component fills a card on a laptop and a sheet of A4 at the printer: the browser
 * scales the canvas, and a QR stays readable as long as its modules do not blur
 * together — which is why the box has a floor as well as a ceiling.
 *
 * Two things here are not styling preferences:
 *
 * **`shapeRendering="crispEdges"`.** A QR's edges are its data. An anti-aliased
 * boundary between a dark and a light module is a camera reading a grey module it
 * cannot decide about, which is the difference between a scan and a person turning
 * up the brightness and trying again.
 *
 * **The white ground, always.** This sits on a console that goes dark, and an
 * inverted symbol — light modules on a dark field — is a symbol most cameras will
 * not find, because the locator patterns it looks for are dark rings on light. The
 * panel that shows the code to a driver is the one surface in this app that is not
 * allowed to follow the theme.
 *
 * When the server sends no symbol (a payload longer than the platform encodes),
 * the caller is left with the characters, and says so.
 */
export const QrGlyph: React.FC<{ symbol: QrSymbol; className?: string }> = ({ symbol, className }) => {
  const quiet = symbol.quiet_zone > 0 ? symbol.quiet_zone : 4;
  const edge = symbol.size + quiet * 2;

  // Runs rather than rectangles: a version-4 symbol is over five hundred dark
  // modules, and one `<path>` with a horizontal run per row is a tenth of the
  // nodes the same picture made a module at a time.
  const ink = symbol.rows
    .map((row, y) => {
      let d = '';
      let run = 0;
      for (let x = 0; x <= symbol.size; x++) {
        if (row[x] === '1') {
          run += 1;
          continue;
        }
        if (run > 0) d += `M${x - run + quiet} ${y + quiet}h${run}v1h-${run}z`;
        run = 0;
      }
      return d;
    })
    .join('');

  return (
    <svg
      viewBox={`0 0 ${edge} ${edge}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={symbol.payload}
      className={className}
    >
      <rect width={edge} height={edge} fill="#ffffff" />
      <path d={ink} fill="#0f172a" />
    </svg>
  );
};
