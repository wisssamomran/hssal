import React, { useState } from 'react';
import { formatMoney } from '@/core/config';
import { explainRefusal } from '@/core/api/refusal';
import { submitQuotation } from '../api';
import {
  DEMAND_REFUSAL_CODES,
  currencyChoices,
  quotationDefaults,
  quotationFieldProblems,
  quotationPayload,
  quotationWriteProblems,
  QUOTATION_VALIDITY_MAX_DAYS,
  type DemandProblems,
  type QuotationFormValues,
} from '../demand';
import type { Demand } from '../types';
import { BannerView, Form, FormFooter, LabeledSelect, TextInput, type Banner } from '@/shared/ui/panel';

/** The server's field name for each box, so a rejection lands under the input it answers for. */
const fieldNameFor: Record<keyof QuotationFormValues, string> = {
  quantity: 'quoted_quantity',
  unitPrice: 'unit_price',
  currencyCode: 'currency_code',
  validityDays: 'validity_days',
  notes: 'notes',
};

/**
 * A seller's price on somebody else's request.
 *
 * The form sits inside the demand card rather than in a sheet because the quote is
 * an answer to the ask above it: the buyer's quantity, their unit and their currency
 * are on screen while the seller types, and a sheet that covered them would ask the
 * seller to remember the row they just came from.
 *
 * What it records and what it does not: this saves a quotation on the demand. It does
 * not reserve stock, does not create a deal, and does not bind the buyer —
 * `QuotationSubmissionService::submit()` stores the row with `SUBMITTED` and there is
 * no route anywhere that accepts it. The notice under the buttons says exactly that,
 * because a seller who believes they just booked an order will plan around a sale
 * nobody agreed to.
 */
export const DemandQuotationForm: React.FC<{
  demand: Demand;
  /** Closes the form. A saved quote is already on the server; the parent re-reads the board. */
  onDone: () => void;
}> = ({ demand, onDone }) => {
  const [values, setValues] = useState<QuotationFormValues>(() => quotationDefaults(demand));
  const [problems, setProblems] = useState<DemandProblems>({});
  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof QuotationFormValues, value: string) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    setProblems((previous) => {
      const next = { ...previous };
      delete next[fieldNameFor[key]];
      return next;
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBanner(null);

    const local = quotationFieldProblems(values);
    setProblems(local);
    if (Object.keys(local).length > 0) return;

    setBusy(true);
    const result = await submitQuotation(demand.id, quotationPayload(values));
    setBusy(false);

    if (!result.success) {
      setProblems(quotationWriteProblems(result));
      setBanner({
        kind: 'error',
        text: explainRefusal(result, { fallback: 'رفض الخادم عرض السعر', codes: DEMAND_REFUSAL_CODES }),
      });
      return;
    }

    setBanner({
      kind: 'ok',
      text: `${result.message ?? 'تم حفظ عرض السعر'} — رقمه ${result.data?.quotation_number ?? ''}. عرضك مسجَّل لدى منشأة المشتري على طلبها، ولا يُنشئ حجزاً ولا صفقة.`,
    });
  };

  const quantity = Number(values.quantity);
  const price = Number(values.unitPrice);

  return (
    <Form onSubmit={handleSubmit} className="border border-slate-200 rounded-lg p-3 space-y-2.5 bg-slate-50/60">
      <p className="text-[11px] text-slate-600 leading-relaxed">
        عرضك يُحفظ على هذا الطلب ويظهر لمنشأة المشتري ضمن طلبها. الكمية هنا ما تستطيع توريده أنت، بوحدة
        المشتري نفسها ({demand.unit}).
      </p>

      <BannerView banner={banner} />

      <div className="flex flex-wrap gap-3">
        <TextInput
          label={`الكمية التي تورّدها (${demand.unit})`}
          value={values.quantity}
          onChange={(value) => set('quantity', value)}
          type="number"
          min="0.01"
          step="0.01"
          inputMode="decimal"
          error={problems.quoted_quantity}
        />
        <TextInput
          label={`سعر الوحدة (${values.currencyCode || 'بدون عملة'})`}
          value={values.unitPrice}
          onChange={(value) => set('unitPrice', value)}
          type="number"
          min="0.0001"
          step="0.0001"
          inputMode="decimal"
          error={problems.unit_price}
        />
        <TextInput
          label={`أيام سريان العرض (1–${QUOTATION_VALIDITY_MAX_DAYS})`}
          value={values.validityDays}
          onChange={(value) => set('validityDays', value)}
          type="number"
          min="1"
          max={QUOTATION_VALIDITY_MAX_DAYS}
          inputMode="numeric"
          error={problems.validity_days}
        />
        <LabeledSelect
          label="العملة"
          value={values.currencyCode}
          onChange={(value) => set('currencyCode', value)}
          options={currencyChoices(values.currencyCode)}
          error={problems.currency_code}
        />
      </div>

      <TextInput
        label="ملاحظات للتوريد (اختياري)"
        value={values.notes}
        onChange={(value) => set('notes', value)}
        wide
        maxLength={1000}
        multiline
        error={problems.notes}
      />

      <FormFooter onCancel={onDone} busy={busy} busyLabel="جارٍ الحفظ..." submitLabel="حفظ عرض السعر" />

      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] text-slate-400 min-w-0">
          الإجمالي يحسبه الخادم من الكميتين ويثبّته في السجل؛ ما يظهر هنا معاينة فقط.
        </p>
        {quantity > 0 && price > 0 ? (
          <span className="shrink-0 text-[11px] font-bold text-slate-700">
            {formatMoney(quantity * price, values.currencyCode)}
          </span>
        ) : null}
      </div>
    </Form>
  );
};
