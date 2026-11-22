import React from 'react';
import { MapPin, Warehouse as WarehouseIcon } from 'lucide-react';
import { ValueRow } from '@/shared/ui/panel';
import type { Warehouse } from '../types';
import { warehouseHasCoordinates } from '../warehouse';

/**
 * The locations this business stores goods at.
 *
 * A card, not a table row, because the three facts that matter are read together:
 * the name, whether anything was ever recorded about where it is, and the number to
 * call from the gate. The coordinates are shown as they were saved — a seller who
 * sees two numbers knows the proximity ranking will find this place, and one who
 * sees the sentence instead knows why their listings are missing from it.
 */
export const WarehouseGrid: React.FC<{
  warehouses: Warehouse[];
  onCorrect: (warehouse: Warehouse) => void;
}> = ({ warehouses, onCorrect }) => (
  <div className="min-w-0 space-y-3">
    <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
      <WarehouseIcon className="w-4 h-4 text-emerald-700" />
      <span>مستودعات المنشأة ({warehouses.length})</span>
    </h3>

    {warehouses.length === 0 ? (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-xs leading-relaxed text-slate-500 dark:border-hassal-line dark:bg-hassal-surface dark:text-slate-400">
        لا مستودعات مسجَّلة لهذه المنشأة. سجّل مستودعاً بموقعه الحقيقي، لأن الترتيب حسب القرب يعتمد على الإحداثيات
        المخزَّنة لا على اسم المدينة.
      </div>
    ) : (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {warehouses.map((warehouse) => (
          <WarehouseCard key={warehouse.id} warehouse={warehouse} onCorrect={onCorrect} />
        ))}
      </div>
    )}
  </div>
);

const WarehouseCard: React.FC<{ warehouse: Warehouse; onCorrect: (warehouse: Warehouse) => void }> = ({
  warehouse,
  onCorrect,
}) => {
  const hasPosition = warehouseHasCoordinates(warehouse);

  return (
    <div className="min-w-0 space-y-2 rounded-xl border border-slate-200 bg-white p-3.5 text-xs shadow-2xs dark:border-hassal-line dark:bg-hassal-surface">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <span className="min-w-0 font-bold text-slate-900 dark:text-slate-100" title={warehouse.name ?? ''}>
          <span className="line-clamp-1">{warehouse.name}</span>
        </span>
        <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
          {warehouse.city}
        </span>
      </div>

      <div className="flex min-w-0 items-start gap-1 text-[11px] text-slate-500">
        <MapPin className="h-3 w-3 shrink-0 text-emerald-600" />
        <span className="min-w-0 break-words">{warehouse.address_line || 'عنوان غير مسجَّل'}</span>
      </div>

      <div className="min-w-0 space-y-0.5 border-t border-slate-100 pt-1 text-[11px]">
        <ValueRow
          label={warehouse.contact_name ? `المسؤول: ${warehouse.contact_name}` : 'لا مسؤول مسجَّل'}
          value={<span className="font-mono" dir="ltr">{warehouse.contact_phone || '—'}</span>}
        />
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-1">
        <span className="min-w-0 flex-1 basis-32 text-[10px] leading-relaxed text-slate-400">
          {hasPosition
            ? `الإحداثيات: ${warehouse.latitude}، ${warehouse.longitude}`
            : 'بلا إحداثيات: لا يظهر في نتائج القرب'}
        </span>
        <button
          type="button"
          onClick={() => onCorrect(warehouse)}
          className="shrink-0 cursor-pointer rounded-lg border border-slate-300 px-2.5 py-1.5 text-[10px] font-bold text-slate-700 hover:bg-slate-100"
        >
          تصحيح
        </button>
      </div>
    </div>
  );
};
