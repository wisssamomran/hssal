import React, { useEffect, useMemo, useState } from 'react';
import { MapPin, RefreshCw } from 'lucide-react';
import { getPublicWarehouses } from '@/features/inventory/api';
import type { Warehouse } from '@/features/inventory/types';
import type { Locale } from '@/core/i18n';

export const WarehouseMapView: React.FC<{ locale?: Locale }> = ({ locale = 'ar' }) => {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  /**
   * Which site the embed is showing, held as an id so a refresh that drops the
   * record cannot leave the map pointing at a warehouse nobody listed.
   */
  const [focusedId, setFocusedId] = useState<number | null>(null);

  const loadWarehouses = async () => {
    setLoading(true);
    const response = await getPublicWarehouses();
    if (response.success && response.data) setWarehouses(response.data);
    setLoading(false);
  };

  useEffect(() => { loadWarehouses(); }, []);

  const center = useMemo(() => {
    if (!warehouses.length) return { latitude: 20.5, longitude: 44.5 };
    return {
      latitude: warehouses.reduce((sum, warehouse) => sum + Number(warehouse.latitude), 0) / warehouses.length,
      longitude: warehouses.reduce((sum, warehouse) => sum + Number(warehouse.longitude), 0) / warehouses.length,
    };
  }, [warehouses]);

  const focused = focusedId === null ? null : warehouses.find((warehouse) => Number(warehouse.id) === focusedId) ?? null;
  const marker = focused ? { latitude: Number(focused.latitude), longitude: Number(focused.longitude) } : center;
  /* A single site is worth a street-level frame; the whole set is not. */
  const span = focused ? { x: 0.06, y: 0.05 } : { x: 8, y: 5 };
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${marker.longitude - span.x}%2C${marker.latitude - span.y}%2C${marker.longitude + span.x}%2C${marker.latitude + span.y}&layer=mapnik&marker=${marker.latitude}%2C${marker.longitude}`;

  return (
    <section className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-5 px-3 sm:px-6 lg:px-8 py-6" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-black text-slate-900">{locale === 'ar' ? 'خريطة المستودعات واللوجستيات' : 'Warehouse logistics map'}</h2>
          <p className="mt-1 text-sm text-slate-500">{locale === 'ar' ? 'مواقع المستودعات ومراكز التوزيع المسجّلة في المنصة.' : 'Warehouse and distribution-centre locations registered on the platform.'}</p>
        </div>
        <button type="button" onClick={loadWarehouses} className="flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 cursor-pointer">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> تحديث المواقع
        </button>
      </div>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <iframe title="خريطة المستودعات" src={mapUrl} className="h-[300px] w-full border-0 sm:h-[440px] lg:h-[520px]" loading="lazy" />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-[11px] text-slate-400 sm:px-4">
            <span>© OpenStreetMap contributors</span>
            {focused && (
              <button
                type="button"
                onClick={() => setFocusedId(null)}
                className="font-bold text-emerald-700 hover:text-emerald-900 cursor-pointer"
              >
                {locale === 'ar' ? 'العودة إلى كل المواقع' : 'Back to all sites'}
              </button>
            )}
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="min-w-0 truncate font-black text-slate-900">{locale === 'ar' ? 'المواقع' : 'Locations'} ({warehouses.length})</h3>
              <MapPin className="h-5 w-5 shrink-0 text-emerald-700" />
            </div>
            <div className="max-h-[38vh] overflow-y-auto lg:max-h-[520px]">
            {loading ? <p className="text-sm text-slate-500">جارٍ تحميل المواقع...</p> : warehouses.length === 0 ? <p className="text-sm text-slate-500">لا توجد مستودعات مسجلة.</p> : warehouses.map((warehouse) => (
              <button
                key={warehouse.id}
                type="button"
                onClick={() => setFocusedId(Number(warehouse.id))}
                title={warehouse.name}
                className={`w-full cursor-pointer border-t border-slate-100 px-1 py-3 text-right first:border-t-0 transition-colors ${
                  focused?.id === warehouse.id ? 'bg-emerald-50' : 'hover:bg-slate-50'
                }`}
              >
                <div className="min-w-0 truncate font-bold text-slate-800">{warehouse.name}</div>
                <div className="min-w-0 break-words text-xs text-slate-500">{warehouse.city}، {warehouse.district || warehouse.address_line}</div>
                <div dir="ltr" className="mt-1 text-right font-mono text-[10px] text-emerald-700">{Number(warehouse.latitude).toFixed(4)}, {Number(warehouse.longitude).toFixed(4)}</div>
              </button>
            ))}
            </div>
          </div>
          {!loading && warehouses.length > 0 && (
          <p className="text-[11px] leading-relaxed text-slate-400">
            {locale === 'ar'
              ? 'اضغط أي موقع لعرضه على الخريطة؛ الإحداثيات كما هي في السجل.'
              : 'Tap a location to show it on the map; the coordinates are as recorded.'}
          </p>
          )}
        </div>
      </div>
    </section>
  );
};