/**
 * Reading the device's location, once.
 *
 * Two screens ask a browser where it is: the warehouse form, because a loading bay
 * has to be stored at a real point for "nearest to me" to rank anything, and the
 * market's proximity filter, because a buyer searches from where they stand. Both
 * had written the same `getCurrentPosition` call, and only one of them distinguished
 * a refused permission from a timeout — so a seller who tapped "don't allow" was told
 * the browser had no location.
 *
 * This returns a promise with the outcome named, and never throws: a missing
 * location is an ordinary answer on a phone with the GPS off, and the caller has to
 * keep the typed coordinates editable in every case. A reading is an *offer* — the
 * screen shows it, the person checks it, the platform stores what the form sends.
 */

export interface GeoReading {
  /** Six decimal places: about ten centimetres, and the same precision the record keeps. */
  latitude: number;
  longitude: number;
  /** Metres, as the browser estimates them; null when the browser would not say. */
  accuracyMeters: number | null;
}

export type GeoFailure = 'UNSUPPORTED' | 'DENIED' | 'TIMEOUT' | 'UNAVAILABLE';

/**
 * One reading or one reason — never both, and never neither.
 *
 * The discriminant is a string rather than a boolean `ok` on purpose: this project
 * compiles without `strictNullChecks`, and TypeScript only narrows a union on a
 * boolean literal when that flag is on. An `{ ok: true } | { ok: false }` here would
 * leave every caller reaching into a union it never split, which is how a failure
 * branch starts reading `result.reading` and crashes on the permission dialog.
 */
export type GeoResult =
  | { kind: 'reading'; reading: GeoReading }
  | { kind: 'failure'; failure: GeoFailure };

/**
 * Ask the browser for one position.
 *
 * High accuracy is deliberately off: a warehouse and a buyer's search are both found
 * to within a few metres, and a GPS lock costs seconds and battery that neither needs.
 * A cached minute is allowed for the same reason — the market does not change address.
 */
export function readDeviceLocation(options?: { timeoutMs?: number; maxAgeMs?: number }): Promise<GeoResult> {
  if (!('geolocation' in navigator)) return Promise.resolve({ kind: 'failure', failure: 'UNSUPPORTED' });

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          kind: 'reading',
          reading: {
            latitude: Number(position.coords.latitude.toFixed(6)),
            longitude: Number(position.coords.longitude.toFixed(6)),
            accuracyMeters:
              typeof position.coords.accuracy === 'number' && Number.isFinite(position.coords.accuracy)
                ? Math.round(position.coords.accuracy)
                : null,
          },
        });
      },
      (error) => {
        // `code` is the browser's, not ours: 1 refused, 2 unavailable, 3 too slow.
        resolve({
          kind: 'failure',
          failure:
            error.code === error.PERMISSION_DENIED
              ? 'DENIED'
              : error.code === error.TIMEOUT
                ? 'TIMEOUT'
                : 'UNAVAILABLE',
        });
      },
      {
        enableHighAccuracy: false,
        timeout: options?.timeoutMs ?? 8000,
        maximumAge: options?.maxAgeMs ?? 60000,
      }
    );
  });
}

/**
 * What each outcome says to the person holding the phone.
 *
 * Every sentence ends by keeping the manual route open, because none of these
 * failures stops the task — only the platform's record of a place does.
 */
export const GEO_FAILURE_NOTES: Record<GeoFailure, string> = {
  UNSUPPORTED: 'لا يقدّم هذا المتصفح موقعًا؛ أدخل الإحداثيات يدويًا.',
  DENIED: 'رفض المتصفح مشاركة الموقع. أدخل الإحداثيات يدويًا أو امنح المتصفح الإذن ثم أعد المحاولة.',
  TIMEOUT: 'انتهت مهلة قراءة الموقع؛ يمكن إدخال الإحداثيات يدويًا.',
  UNAVAILABLE: 'لم يعثر المتصفح على موقع الآن؛ يمكن إدخال الإحداثيات يدويًا.',
};

/** A successful reading, stated with its uncertainty so nobody reads it as exact. */
export function geoReadingNote(reading: GeoReading): string {
  const accuracy =
    reading.accuracyMeters === null ? '' : ` (بدقة تقريبية ${reading.accuracyMeters} م)`;
  return `قرأ المتصفح: ${reading.latitude.toFixed(5)}، ${reading.longitude.toFixed(5)}${accuracy}. راجع الرقمين قبل الحفظ.`;
}
