import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { ApiResult } from '@/core/api/http';
import { explainRefusal } from '@/core/api/refusal';
import { getLocale } from '@/core/i18n';
import { currencyLabel, usePlatformConfig } from '@/core/config';
import { Sheet } from '@/shared/ui/Sheet';
import { Form, FormFooter, FormSection, LabeledSelect, TextInput } from '@/shared/ui/panel';
import { updateOffer } from '../api';
import type { Offer } from '../types';
import { DELIVERY_TERMS, deliveryTermsLabel, offerStatusLabel } from '../labels';
import {
  OFFER_REFUSAL_CODES,
  committedQuantity,
  offerFieldProblems,
  offerFormDefaults,
  offerWriteProblems,
  quantityIsLocked,
  updateOfferPayload,
  withFieldCleared,
  type OfferFormValues,
  type OfferProblems,
} from '../offer';
import { SellerIdentityToggle } from './SellerIdentityToggle';

/**
 * Correcting a listing that is still the seller's to correct.
 *
 * `OfferWritingService::update()` accepts an edit while the offer is a DRAFT or is
 * PAUSED and refuses it in the market, so this sheet is opened from those two rows
 * only — the shelf decides that, this file only carries the fields.
 *
 * What is *not* here is the listing's subject. The warehouse, the variant and the
 * currency are named in the notice at the top rather than offered as inputs, because
 * a price on different goods is a different listing and the row already has
 * reservations against it. Saying that out loud beats posting a value the route
 * ignores: an input that changes nothing is an invitation to believe it did.
 */
export const EditOfferSheet: React.FC<{
  offer: Offer;
  onClose: () => void;
  onSaved: (message: string) => void;
}> = ({ offer, onClose, onSaved }) => {
  const locale = getLocale();
  const config = usePlatformConfig();
  const reasons = config.opportunityReasons;

  const [values, setValues] = useState<OfferFormValues>(() => offerFormDefaults(offer));
  const [problems, setProblems] = useState<OfferProblems>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reserved or sold stock is already promised to somebody; the total on the listing
  // may not be rewritten underneath those holds.
  const committed = committedQuantity(offer);
  const locked = quantityIsLocked(offer);

  const set = <K extends keyof OfferFormValues>(key: K, value: OfferFormValues[K]) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    setProblems((previous) => withFieldCleared(previous, key));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFailure(null);

    const local = offerFieldProblems(values, { mode: 'edit', quantityLocked: locked });
    setProblems(local);
    if (Object.keys(local).length > 0) {
      setFailure('راجع الحقول المميّزة بالأحمر قبل الإرسال.');
      return;
    }

    setSaving(true);
    const result: ApiResult<Offer> = await updateOffer(offer.id, updateOfferPayload(values, { quantityLocked: locked }));
    setSaving(false);

    if (result.success) {
      onSaved(result.message ?? 'حُدِّث العرض لدى المنصة.');
      return;
    }

    setProblems(offerWriteProblems(result));
    setFailure(explainRefusal(result, { fallback: 'رفض الخادم الطلب', codes: OFFER_REFUSAL_CODES }));
  };

  return (
    <Sheet
      title={
        <div className="min-w-0">
          <h3 className="text-sm font-black text-slate-900">تعديل العرض</h3>
          <p className="truncate text-[11px] text-slate-500" title={offer.title_ar}>
            {offer.title_ar} — حالته لدى المنصة: {offerStatusLabel(offer.status)}
          </p>
        </div>
      }
      onClose={onClose}
      size="xl"
    >
      <Form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">
          المستودع ({offer.warehouse_name || 'غير مسمّى'}) والصنف والعملة (
          {currencyLabel(offer.currency_code)}) لا تتغيّر من هذه الشاشة: مسار العرض ومصدره
          ماليّته، وتعديلها يعني عرضاً جديداً لا تصحيحاً لهذا.
        </div>

        <FormSection title="بيانات العرض" />

        <TextInput
          wide
          label="عنوان العرض (مطلوب):"
          value={values.titleAr}
          maxLength={255}
          onChange={(value) => set('titleAr', value)}
          error={problems.title_ar}
        />

        <TextInput
          wide
          multiline
          label="الوصف:"
          value={values.descriptionAr}
          maxLength={2000}
          onChange={(value) => set('descriptionAr', value)}
          error={problems.description_ar}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LabeledSelect
            wide
            label="سبب طرح المخزون (مطلوب):"
            value={values.opportunityReason}
            onChange={(value) => set('opportunityReason', value)}
            options={[
              { value: '', label: '— اختر من قائمة المنصة —' },
              ...reasons.map((r) => ({ value: r.code, label: locale === 'en' ? r.label_en : r.label_ar })),
            ]}
            error={problems.opportunity_reason}
          />
          <TextInput
            wide
            label="تفصيل السبب (اختياري):"
            value={values.reasonNotes}
            maxLength={500}
            onChange={(value) => set('reasonNotes', value)}
            error={problems.opportunity_reason_notes}
          />
        </div>

        <FormSection title="الكمية والسعر" />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TextInput
            wide
            label="وحدة العدّ (مطلوب):"
            value={values.unit}
            maxLength={50}
            onChange={(value) => set('unit', value)}
            error={problems.unit}
          />
          <TextInput
            wide
            type="number"
            step="0.0001"
            min="0.0001"
            label={`سعر الوحدة (مطلوب، ${offer.currency_code}):`}
            value={values.unitPrice}
            onChange={(value) => set('unitPrice', value)}
            error={problems.unit_price}
          />
          <TextInput
            wide
            type="number"
            min="1"
            label="الكمية الكلية (مطلوب):"
            value={values.totalQuantity}
            disabled={locked}
            onChange={(value) => set('totalQuantity', value)}
            error={locked ? undefined : problems.total_quantity}
            help={
              locked
                ? `${committed} ${offer.unit} محجوزة أو مبيعة: لا تُعدَّل الكمية المعلن عنها، والخادم يرفض ذلك.`
                : undefined
            }
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TextInput
            wide
            type="number"
            min="1"
            label="أدنى كمية للطلب:"
            value={values.minOrderQuantity}
            onChange={(value) => set('minOrderQuantity', value)}
            error={problems.min_order_quantity}
          />
          <TextInput
            wide
            type="number"
            min="1"
            label="أقصى كمية للطلب (فارغ = بلا سقف):"
            value={values.maxOrderQuantity}
            onChange={(value) => set('maxOrderQuantity', value)}
            error={problems.max_order_quantity}
          />
          <TextInput
            wide
            type="number"
            min="1"
            max="168"
            label="مهلة الفحص بالساعات:"
            value={values.inspectionWindowHours ?? ''}
            placeholder="فارغ = بلا مهلة مسجَّلة"
            onChange={(value) => set('inspectionWindowHours', value)}
            error={problems.inspection_window_hours}
          />
        </div>

        <FormSection title="التواريخ والتسليم" />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TextInput
            wide
            type="date"
            label="تاريخ الإنتاج:"
            value={values.productionDate ?? ''}
            onChange={(value) => set('productionDate', value)}
          />
          <TextInput
            wide
            type="date"
            label="تاريخ الصلاحية:"
            value={values.expiryDate ?? ''}
            onChange={(value) => set('expiryDate', value)}
            error={problems.expiry_date}
          />
          <TextInput
            wide
            type="date"
            label="نهاية صلاحية العرض في السوق:"
            value={values.expiresAt ?? ''}
            onChange={(value) => set('expiresAt', value)}
            error={problems.expires_at}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextInput
            wide
            label="ظروف التخزين:"
            value={values.storageCondition ?? ''}
            maxLength={50}
            onChange={(value) => set('storageCondition', value)}
            error={problems.storage_condition}
          />
          <LabeledSelect
            wide
            label="شروط التسليم:"
            value={values.deliveryTerms}
            onChange={(value) => set('deliveryTerms', value as OfferFormValues['deliveryTerms'])}
            options={DELIVERY_TERMS.map((term) => ({ value: term, label: deliveryTermsLabel(term) }))}
          />
        </div>

        <SellerIdentityToggle
          checked={values.showSellerIdentity}
          onChange={(checked) => set('showSellerIdentity', checked)}
        />

        {failure && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="min-w-0">{failure}</span>
          </div>
        )}

        <FormFooter onCancel={onClose} busy={saving} busyLabel="جارٍ الحفظ..." submitLabel="حفظ التعديلات" />
      </Form>
    </Sheet>
  );
};
