import React, { useState } from 'react';
import { AlertCircle, Crosshair } from 'lucide-react';
import { createWarehouse, updateWarehouse } from '../api';
import { explainRefusal } from '@/core/api/refusal';
import { GEO_FAILURE_NOTES, geoReadingNote, readDeviceLocation } from '@/core/geo';
import { Sheet } from '@/shared/ui/Sheet';
import { Form, FormFooter, FormSection, TextInput } from '@/shared/ui/panel';
import type { Warehouse } from '../types';
import {
  WAREHOUSE_REFUSAL_CODES,
  emptyWarehouseForm,
  warehouseFieldProblems,
  warehouseFormDefaults,
  warehousePayload,
  warehouseWriteProblems,
  withWarehouseFieldCleared,
  type WarehouseFormValues,
} from '../warehouse';

/**
 * Registering a location, or correcting one.
 *
 * One sheet does both, because the route behind each asks for the same fields:
 * `PUT /warehouses/{id}` replaces the record, so a correction has to carry every
 * value including the coordinates it did not touch. The sheet opens prefilled from
 * what the platform holds, and its title says which of the two it is doing — a
 * seller who meant to fix a phone number must be able to see they are not creating a
 * second warehouse.
 */
export const WarehouseFormSheet: React.FC<{
  /** null while creating; the row whose values prefill the form. */
  warehouse: Warehouse | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}> = ({ warehouse, onClose, onSaved }) => {
  const [values, setValues] = useState<WarehouseFormValues>(() =>
    warehouse ? warehouseFormDefaults(warehouse) : emptyWarehouseForm()
  );
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoNote, setGeoNote] = useState<string | null>(null);

  const set = (key: keyof WarehouseFormValues, value: string) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    // A note about one box must not survive an edit to that box.
    setProblems((previous) => withWarehouseFieldCleared(previous, key));
  };

  /**
   * Ask the browser where this device is.
   *
   * The reading is offered, never assumed: the seller may refuse the permission, the
   * browser may time out, or it may have nothing to give — and in every one of those
   * cases the two boxes stay editable, because a warehouse is a place the platform
   * holds, not a place this device happens to be. Accuracy is deliberately not
   * high-precision: a loading bay is found to within a few metres and a GPS lock costs
   * battery and seconds for nothing.
   */
  const readBrowserLocation = async () => {
    setGeoBusy(true);
    setGeoNote('يقرأ موقع الجهاز…');
    const result = await readDeviceLocation();
    setGeoBusy(false);

    if (result.kind === 'failure') {
      setGeoNote(GEO_FAILURE_NOTES[result.failure]);
      return;
    }
    setValues((previous) => ({
      ...previous,
      latitude: String(result.reading.latitude),
      longitude: String(result.reading.longitude),
    }));
    setGeoNote(geoReadingNote(result.reading));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFailure(null);

    const local = warehouseFieldProblems(values);
    setProblems(local);
    if (Object.keys(local).length > 0) {
      setFailure('الخادم يطلب هذه الحقول: أكملها بالأحمر ثم احفظ.');
      return;
    }

    setSaving(true);
    const result = warehouse
      ? await updateWarehouse(warehouse.id, warehousePayload(values))
      : await createWarehouse(warehousePayload(values));
    setSaving(false);

    if (result.success) {
      onSaved(
        warehouse
          ? 'حُدِّث المستودع بما في ذلك إحداثياته؛ البحث القريب يقرأ الموقع الجديد.'
          : 'سُجِّل المستودع بالموقع الذي أدخلته.'
      );
      return;
    }
    // Whatever the route refused a field for is printed under that field, and the
    // sentence above says why the write stopped — a `WAREHOUSE_NOT_FOUND` is not a
    // typing mistake and must not read like one.
    setProblems(warehouseWriteProblems(result));
    setFailure(explainRefusal(result, { fallback: 'رفض الخادم الطلب', codes: WAREHOUSE_REFUSAL_CODES }));
  };

  return (
    <Sheet
      title={
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-900">
            {warehouse ? 'تصحيح بيانات مستودع' : 'تسجيل مستودع'}
          </h3>
          <p className="pt-0.5 text-[10px] leading-relaxed text-slate-500">
            {warehouse
              ? `تعديل المستودع رقم ${warehouse.id} كما تحفظه المنصة، والعروض القائمة تبقى منسوبة إليه.`
              : 'يُحفظ المستودع بموقعه المسجَّل؛ عليه يعتمد ترتيب «الأقرب إليّ».'}
          </p>
        </div>
      }
      onClose={onClose}
      size="md"
    >
      {failure && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="min-w-0">{failure}</span>
        </div>
      )}

      <Form onSubmit={handleSubmit} className="space-y-3 text-xs">
        <TextInput
          wide
          label="اسم المستودع (مطلوب):"
          value={values.name}
          maxLength={255}
          onChange={(value) => set('name', value)}
          error={problems.name}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextInput
            wide
            label="رمز المستودع (اختياري):"
            value={values.code}
            maxLength={50}
            onChange={(value) => set('code', value)}
            error={problems.code}
          />
          <TextInput
            wide
            label="المدينة (مطلوبة):"
            value={values.city}
            maxLength={100}
            onChange={(value) => set('city', value)}
            error={problems.city}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextInput
            wide
            label="الحي (اختياري):"
            value={values.district}
            maxLength={100}
            onChange={(value) => set('district', value)}
          />
          <TextInput
            wide
            label="العنوان التفصيلي (مطلوب):"
            value={values.addressLine}
            maxLength={255}
            onChange={(value) => set('addressLine', value)}
            error={problems.address_line}
          />
        </div>

        <FormSection title="الموقع والإحداثيات" />

        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={readBrowserLocation}
              disabled={geoBusy || saving}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>{geoBusy ? 'يقرأ الموقع…' : 'قراءة موقعي من المتصفح'}</span>
            </button>
            {geoNote ? (
              <span className="basis-full text-[10px] leading-relaxed text-slate-500">{geoNote}</span>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextInput
              wide
              label="خط العرض (مطلوب):"
              value={values.latitude}
              inputMode="decimal"
              dirLtr
              onChange={(value) => set('latitude', value)}
              error={problems.latitude}
            />
            <TextInput
              wide
              label="خط الطول (مطلوب):"
              value={values.longitude}
              inputMode="decimal"
              dirLtr
              onChange={(value) => set('longitude', value)}
              error={problems.longitude}
            />
          </div>
        </div>

        <p className="leading-relaxed text-[10px] text-slate-400">
          قراءة المتصفح تقترح رقمين فقط يمكن تصحيحهما قبل الحفظ؛ ما تُخزِّنه المنصة هو ما يرسله هذا النموذج. أدخل
          الإحداثيات من الخريطة أو جهاز الملاحة إن تعذّرت القراءة، فترتيب «الأقرب إليّ» يعتمد على هذين الرقمين وحدهما.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextInput
            wide
            label="مسؤول المستودع (اختياري):"
            value={values.contactName}
            maxLength={255}
            onChange={(value) => set('contactName', value)}
          />
          <TextInput
            wide
            label="رقم الهاتف (اختياري):"
            value={values.contactPhone}
            maxLength={32}
            dirLtr
            onChange={(value) => set('contactPhone', value)}
          />
        </div>

        <FormFooter
          onCancel={onClose}
          busy={saving}
          busyLabel="جارٍ الحفظ..."
          submitLabel={warehouse ? 'حفظ التصحيح' : 'حفظ المستودع'}
        />
      </Form>
    </Sheet>
  );
};
