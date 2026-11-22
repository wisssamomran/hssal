import React, { useEffect, useState } from 'react';
import { AlertCircle, History } from 'lucide-react';
import { explainRefusal } from '@/core/api/refusal';
import { formatDateTime, getLocale } from '@/core/i18n';
import { offerStatusLabel } from '@/features/marketplace/labels';
import type { Offer } from '@/features/marketplace/types';
import { adjustInventory, getInventoryMovements } from '../api';
import type { InventoryMovement } from '../types';
import {
  MOVEMENT_LABELS,
  MOVEMENT_REFUSAL_CODES,
  SELLER_MOVEMENT_LABELS,
  SELLER_RECORDED_TYPES,
  movementFieldProblems,
  movementFormIsReady,
  movementLabel,
  movementPayload,
  movementTypeStyle,
  movementWriteProblems,
  type MovementFormValues,
} from '../stock-movement';
import { Form, LabeledSelect, TextInput } from '@/shared/ui/panel';

/**
 * What moved on this business's stock, as the platform recorded it.
 *
 * HASSAL keeps quantity in one place — an offer's `available_quantity` — so a
 * movement is always written against an offer, and the two numbers beside it are
 * that offer's available stock before and after. The panel does not compute a
 * per-warehouse balance the schema does not hold.
 *
 * The form beside the ledger holds the three kinds a person may record by hand;
 * a reservation, a release and a sale are the market's own writing and are not
 * offered here as anything to press. Every rule the submit button weighs — the
 * sign, the zero, the reason — is decided in `stock-movement.ts`, so this file is
 * the shelf's chrome and nothing else.
 */
export const StockMovementsPanel: React.FC<{ offers: Offer[]; reloadKey: string }> = ({
  offers,
  reloadKey,
}) => {
  const locale = getLocale();

  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'refused'>('loading');
  const [refusal, setRefusal] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('');

  const [values, setValues] = useState<MovementFormValues>({
    offerId: '',
    type: 'IN',
    quantity: '',
    reason: '',
  });
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [recordedMessage, setRecordedMessage] = useState<string | null>(null);

  const set = <K extends keyof MovementFormValues>(key: K, value: MovementFormValues[K]) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    // A note about one box must not survive an edit to it.
    setProblems((previous) => {
      const name = key === 'offerId' ? 'offer_id' : key;
      if (!(name in previous)) return previous;
      const rest = { ...previous };
      delete rest[name];
      return rest;
    });
  };

  const load = async () => {
    setState('loading');
    const result = await getInventoryMovements({
      ...(typeFilter ? { type: typeFilter } : {}),
      per_page: 25,
    });
    if (result.success && Array.isArray(result.data)) {
      setMovements(result.data as InventoryMovement[]);
      setState('ready');
      setRefusal(null);
    } else {
      setMovements([]);
      setState('refused');
      setRefusal(explainRefusal(result, { fallback: 'رفض الخادم طلب السجل' }));
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey, typeFilter]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFailure(null);

    const local = movementFieldProblems(values);
    setProblems(local);
    if (Object.keys(local).length > 0) return;

    setSaving(true);
    const result = await adjustInventory(movementPayload(values));
    setSaving(false);

    if (!result.success) {
      setProblems(movementWriteProblems(result));
      setFailure(explainRefusal(result, { fallback: 'رفض الخادم الطلب', codes: MOVEMENT_REFUSAL_CODES }));
      return;
    }

    // The quantity and the note are about the movement just written; the chosen
    // offer and kind stay, because a delivery arrives as several rows.
    setRecordedMessage(result.message ?? 'سُجِّلت الحركة وحُدِّثت كمية العرض.');
    setValues((previous) => ({ ...previous, quantity: '', reason: '' }));
    await load();
  };

  const canRecord = movementFormIsReady(values);

  return (
    <div className="min-w-0 space-y-3">
      <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
        <History className="w-4 h-4 text-emerald-700" />
        <span>حركة المخزون المسجَّلة لمنشأتك</span>
      </h3>

      <div className="flex flex-wrap items-center gap-2">
        <LabeledSelect
          label="نوع الحركة"
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: '', label: 'الكل' },
            ...Object.entries(MOVEMENT_LABELS).map(([code, label]) => ({ value: code, label })),
          ]}
        />
      </div>

      {state === 'loading' ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500 dark:border-hassal-line dark:bg-hassal-surface dark:text-slate-400">
          جارٍ جلب السجل...
        </div>
      ) : state === 'refused' ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs leading-relaxed text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          سجل حركة المخزون غير متاح لهذه الجلسة: {refusal}
        </div>
      ) : movements.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs leading-relaxed text-slate-500 dark:border-hassal-line dark:bg-hassal-surface dark:text-slate-400">
          لا حركات مسجَّلة. تظهر هنا التوريدات والتسويات، كما تُسجَّل عن الحجز والبيع.
        </div>
      ) : (
        <div className="min-w-0 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs dark:border-hassal-line dark:bg-hassal-surface">
          <table className="w-full min-w-[48rem] text-right text-xs text-slate-800 dark:text-slate-200">
            <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600 dark:border-hassal-line dark:bg-hassal-night dark:text-slate-300">
              <tr>
                <th className="p-3">الوقت</th>
                <th className="p-3">الصنف</th>
                <th className="p-3">النوع</th>
                <th className="p-3">الكمّية</th>
                <th className="p-3">المتاح قبل ← بعد</th>
                <th className="p-3">السبب</th>
                <th className="p-3">سجّلها</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-hassal-line">
              {movements.map((movement) => (
                <tr key={movement.id} className="align-top">
                  <td className="whitespace-nowrap p-3 text-slate-500 dark:text-slate-400">
                    {formatDateTime(movement.created_at, locale)}
                  </td>
                  <td className="p-3">
                    <div className="font-bold text-slate-900 dark:text-slate-100">
                      {movement.product_variant?.name_ar || '—'}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {[movement.product_variant?.sku, movement.warehouse?.name].filter(Boolean).join(' · ')}
                    </div>
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${movementTypeStyle(movement.type)}`}
                    >
                      {movementLabel(movement.type)}
                    </span>
                  </td>
                  <td
                    className={`p-3 font-bold ${
                      Number(movement.quantity) < 0 ? 'text-rose-700' : 'text-emerald-800'
                    }`}
                  >
                    {Number(movement.quantity) > 0 ? '+' : ''}
                    {movement.quantity}
                  </td>
                  <td className="p-3 text-slate-600 dark:text-slate-300">
                    {movement.previous_quantity} ← {movement.new_quantity}
                  </td>
                  <td className="max-w-[18rem] p-3 text-slate-500 dark:text-slate-400" title={movement.reason || undefined}>
                    {movement.reason || '—'}
                  </td>
                  <td className="p-3 text-slate-500 dark:text-slate-400">{movement.user?.name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Form
        onSubmit={handleSubmit}
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-hassal-line dark:bg-hassal-surface"
      >
        <div>
          <h4 className="text-xs font-black text-slate-900 dark:text-slate-100">
            تسجيل حركة على عرض من عروض منشأتك
          </h4>
          <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            الحركة تُصحِّح كمية العرض نفسها، لا رقمًا بجانبها: الوارد والمرتجع يزيدان المتاح، وتسوية الجرد تزيد أو
            تنقص، ولا يُقبل إنقاصٌ يترك المتاح سالبًا أو يقلّ عن المحجوز والمبيع.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <LabeledSelect
            wide
            label="العرض"
            value={String(values.offerId)}
            onChange={(next) => set('offerId', next === '' ? '' : Number(next))}
            error={problems.offer_id}
            options={[
              { value: '', label: '— اختر عرضًا من قوائم منشأتك —' },
              ...offers.map((offer) => ({
                value: String(offer.id),
                label: `${offer.title_ar} — متاح ${offer.available_quantity} ${offer.unit} (${offerStatusLabel(offer.status)})`,
              })),
            ]}
          />

          <LabeledSelect
            wide
            label="النوع"
            value={values.type}
            onChange={(next) => set('type', next as MovementFormValues['type'])}
            error={problems.type}
            options={SELLER_RECORDED_TYPES.map((type) => ({ value: type, label: SELLER_MOVEMENT_LABELS[type] }))}
          />

          <TextInput
            wide
            label="الكمّية"
            type="number"
            step="any"
            value={values.quantity}
            onChange={(next) => set('quantity', next)}
            error={problems.quantity}
            placeholder={values.type === 'ADJUSTED' ? 'سالبة للإنقاص' : 'موجبة'}
          />

          <TextInput
            wide
            label="السبب (مطلوب ويُبقى في السجل)"
            value={values.reason}
            onChange={(next) => set('reason', next)}
            error={problems.reason}
            maxLength={500}
          />
        </div>

        {failure && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="min-w-0">{failure}</span>
          </div>
        )}

        {recordedMessage && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            {recordedMessage}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="min-w-0 flex-1 basis-48 text-[10px] leading-relaxed text-slate-400">
            تُرسل الحركة باسم العرض الذي تصحّحه، والمستودع والصنف يُقرآن من عرضه المسجَّل.
            {canRecord ? '' : ' زر التسجيل ينتظر اختيار العرض وكتابة الكمّية والسبب.'}
          </span>
          <button
            type="submit"
            disabled={saving || !canRecord}
            className="shrink-0 cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-40"
          >
            {saving ? 'جارٍ التسجيل...' : 'تسجيل الحركة'}
          </button>
        </div>
      </Form>
    </div>
  );
};
