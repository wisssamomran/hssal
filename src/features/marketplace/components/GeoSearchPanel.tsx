import React from 'react';
import { MapPin } from 'lucide-react';
import type { GeoSearch } from '@/features/marketplace/discovery';

/**
 * The distance search: a point, a radius, and the ceiling the server answers for.
 *
 * Three rules shape this panel, and none of them is cosmetic:
 *
 *   - the point starts empty. A market that quietly centres itself on one city tells
 *     a buyer "nothing is near you" about a place they never chose;
 *   - the browser's location is offered, never taken. `readDeviceLocation` asks, and
 *     whatever the person answers is what fills the two boxes — a refusal keeps the
 *     manual route open in the same sentence;
 *   - the ceiling on the radius comes from the platform's own setting, so a buyer is
 *     stopped here rather than refused by `GET /marketplace/offers/nearby` there.
 *
 * The reading, the failure wording and the note all belong to the caller: this panel
 * draws the ask, and the note it shows may have arrived from the server a moment ago.
 */
export const GeoSearchPanel: React.FC<{
  geo: GeoSearch;
  maxRadiusKm: number | null;
  /** A location request is in flight; the button must not offer a second one. */
  reading: boolean;
  onToggle: () => void;
  onUseDeviceLocation: () => void;
  onPatch: (patch: Partial<GeoSearch>) => void;
}> = ({ geo, maxRadiusKm, reading, onToggle, onUseDeviceLocation, onPatch }) => {
  const { point, radiusKm } = geo;
  const hasPoint = point.lat !== null && point.lon !== null;

  return (
    <div className="flex w-full flex-col items-stretch gap-2 sm:w-72 lg:w-80 sm:shrink-0">
      <button
        onClick={onToggle}
        className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
          geo.enabled
            ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-hassal-line dark:bg-hassal-raised dark:text-slate-200'
        }`}
      >
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        <span>{geo.enabled ? 'مفعل: الأقرب جغرافياً' : 'تفعيل البحث بالأقرب (كم)'}</span>
      </button>

      {geo.enabled && (
        <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-2.5 text-xs dark:border-emerald-800 dark:bg-emerald-950/30">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={reading}
              onClick={onUseDeviceLocation}
              className="flex-1 cursor-pointer rounded-md bg-emerald-700 px-2.5 py-1.5 text-center font-bold text-white disabled:opacity-50 sm:flex-none"
            >
              {reading ? 'يقرأ موقع الجهاز…' : 'استخدم موقعي من المتصفح'}
            </button>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">أو أدخل الإحداثيات يدوياً</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(['lat', 'lon'] as const).map((axis) => (
              <label key={axis} className="flex min-w-0 flex-col gap-1 text-[11px] text-slate-600 dark:text-slate-300">
                <span>{axis === 'lat' ? 'خط العرض' : 'خط الطول'}</span>
                <input
                  type="number"
                  step="0.000001"
                  inputMode="decimal"
                  value={point[axis] ?? ''}
                  onChange={(event) =>
                    onPatch({
                      point: {
                        ...point,
                        [axis]: event.target.value === '' ? null : Number(event.target.value),
                        label: 'إحداثيات مُدخلة',
                      },
                    })
                  }
                  className="w-full min-w-0 rounded-md border border-emerald-200 bg-white px-2 py-1 font-mono text-[11px] focus:outline-none dark:border-hassal-line dark:bg-hassal-raised dark:text-slate-100"
                />
              </label>
            ))}

            <label className="col-span-2 flex min-w-0 flex-col gap-1 text-[11px] text-slate-600 dark:text-slate-300">
              <span>نصف القطر (كم)</span>
              <input
                type="number"
                min="1"
                max={maxRadiusKm ?? undefined}
                inputMode="numeric"
                value={radiusKm}
                onChange={(event) => onPatch({ radiusKm: event.target.value === '' ? '' : Number(event.target.value) })}
                className="w-full min-w-0 rounded-md border border-emerald-200 bg-white px-2 py-1 font-mono text-[11px] focus:outline-none dark:border-hassal-line dark:bg-hassal-raised dark:text-slate-100"
              />
            </label>
          </div>

          <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
            {maxRadiusKm
              ? `أقصى نصف قطر يقبله الخادم: ${maxRadiusKm} كم`
              : 'سقف نصف القطر لم يُقرأ من إعدادات المنصة بعد.'}
            {hasPoint ? ` • القياس من ${point.label}: ${point.lat}, ${point.lon}` : ' • لا نقطة مرجعية بعد، والنتائج لن تُجلب.'}
          </p>
        </div>
      )}
    </div>
  );
};
