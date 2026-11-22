import React, { useEffect, useState } from 'react';
import { AlertCircle, Camera } from 'lucide-react';
import type { ApiResult } from '@/core/api/http';
import { explainRefusal } from '@/core/api/refusal';
import { getLocale } from '@/core/i18n';
import { currencyLabel, usePlatformConfig } from '@/core/config';
import { getProductVariants } from '@/features/catalog/api';
import type { Product, ProductVariant } from '@/features/catalog/types';
import { Sheet } from '@/shared/ui/Sheet';
import { Form, FormFooter, FormSection, LabeledSelect, TextInput } from '@/shared/ui/panel';
import type { Warehouse } from '@/features/inventory/types';
import { createOffer } from '../api';
import type { Offer, OfferStatus } from '../types';
import { DELIVERY_TERMS, deliveryTermsLabel } from '../labels';
import {
  OFFER_REFUSAL_CODES,
  createOfferPayload,
  emptyOfferFormValues,
  offerFieldProblems,
  offerWriteProblems,
  withFieldCleared,
  type OfferFormValues,
  type OfferProblems,
} from '../offer';
import { SellerIdentityToggle } from './SellerIdentityToggle';

/**
 * Offering stock the business already holds.
 *
 * The sheet owns its own fields, its variants list and its rejection notes; the shelf
 * behind it keeps only what happens once a listing exists. It is a phone form first:
 * one column under the breakpoint, blocks named by what they answer, and the currency
 * line read from the platform's setting — a listing cannot be priced before an
 * administrator has chosen a currency, and saying so here saves the seller a refusal
 * they would otherwise read as a bug.
 *
 * Nothing here decides whether the listing goes to market. `as_draft` is a request;
 * `offer.requires_review` is the answer, and the banner afterwards quotes the state
 * the server actually put the row in.
 */
export const OfferFormSheet: React.FC<{
  products: Product[];
  warehouses: Warehouse[];
  onClose: () => void;
  onCreated: (status: OfferStatus | null) => void;
}> = ({ products, warehouses, onClose, onCreated }) => {
  const locale = getLocale();
  const config = usePlatformConfig();
  const reasons = config.opportunityReasons;

  const [values, setValues] = useState<OfferFormValues>(() => ({
    ...emptyOfferFormValues(),
    // The first location is a suggestion, not an assumption: a business with one
    // warehouse means it, and a business with five can change one tap.
    warehouseId: warehouses[0]?.id ?? '',
  }));
  /** The catalog product whose variants are on offer — a step, never sent. */
  const [productId, setProductId] = useState<number | ''>('');
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [problems, setProblems] = useState<OfferProblems>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof OfferFormValues>(key: K, value: OfferFormValues[K]) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    // A note about one field must not survive an edit to it.
    setProblems((previous) => withFieldCleared(previous, key));
  };

  // Choosing a product loads the variants that really exist under it, and carries the
  // unit the product is counted in — a recorded fact, not a value this form invents.
  useEffect(() => {
    if (!productId) {
      setVariants([]);
      setValues((previous) => ({ ...previous, productVariantId: '' }));
      return;
    }
    const product = products.find((p) => p.id === productId);
    if (product?.unit) {
      setValues((previous) => ({ ...previous, unit: previous.unit || product.unit }));
    }
    let stale = false;
    void getProductVariants(productId).then((result) => {
      if (stale) return;
      const list = result.success && Array.isArray(result.data) ? (result.data as ProductVariant[]) : [];
      setVariants(list);
      setValues((previous) => ({ ...previous, productVariantId: list[0]?.id ?? '' }));
    });
    return () => {
      stale = true;
    };
  }, [productId, products]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFailure(null);

    const local = offerFieldProblems(values, { mode: 'create' });
    setProblems(local);
    if (Object.keys(local).length > 0) {
      setFailure('راجع الحقول المميّزة بالأحمر قبل الإرسال.');
      return;
    }

    setSaving(true);
    const result: ApiResult<Offer> = await createOffer(createOfferPayload(values));
    setSaving(false);

    if (result.success) {
      onCreated(result.data?.status ?? null);
      return;
    }

    setProblems(offerWriteProblems(result));
    setFailure(explainRefusal(result, { fallback: 'رفض الخادم الطلب', codes: OFFER_REFUSAL_CODES }));
  };

  return (
    <Sheet
      title={
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-900">طرح عرض مخزون</h3>
          <p className="pt-0.5 text-[11px] leading-relaxed text-slate-500">
            الحقول المعلَّمة «مطلوب» لا يقبل الخادم عرضاً بدونها، وسبب رفض أي حقل يظهر تحته.
          </p>
        </div>
      }
      onClose={onClose}
      size="lg"
    >
      {failure && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="min-w-0">{failure}</span>
        </div>
      )}

      <div
        className={`rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${
          config.loaded && config.baseCurrency === null
            ? 'border-amber-200 bg-amber-50 text-amber-900'
            : 'border-slate-200 bg-slate-50 text-slate-600'
        }`}
      >
        العملة: {currencyLabel(config.baseCurrency)}
        {!config.loaded
          ? ' — تُقرأ من إعدادات المنصة.'
          : config.baseCurrency === null
            ? ' — لم يضبط مسؤول المنصة عملة أساسية، والعرض يحتاج عملة معتمدة، لذا يرفضه الخادم حتى تُضبط.'
            : ''}
      </div>

      <Form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <FormSection title="ما تُعرضه" />

        <TextInput
          wide
          label="عنوان العرض (مطلوب):"
          value={values.titleAr}
          maxLength={255}
          placeholder="مثال: 240 كرتونة أرز 10 كجم — دفعة واحدة"
          onChange={(value) => set('titleAr', value)}
          error={problems.title_ar}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LabeledSelect
            wide
            label="المنتج:"
            value={String(productId)}
            onChange={(value) => setProductId(value ? Number(value) : '')}
            options={[
              { value: '', label: '— اختر منتجاً —' },
              ...products.map((p) => ({
                value: String(p.id),
                label: locale === 'en' && p.name_en ? p.name_en : p.name_ar,
              })),
            ]}
          />
          <LabeledSelect
            wide
            label="الصنف والعبوة (مطلوب):"
            value={String(values.productVariantId || '')}
            disabled={!productId}
            onChange={(value) => set('productVariantId', value ? Number(value) : '')}
            options={variants.map((v) => ({
              value: String(v.id),
              label: `${(locale === 'en' && v.name_en ? v.name_en : v.name_ar) || v.sku} (SKU: ${v.sku})`,
            }))}
            error={problems.product_variant_id}
          />
        </div>
        {products.length === 0 && (
          <p className="text-[10px] text-slate-400">لا منتجات في الكتالوج المرئية لهذا الحساب.</p>
        )}

        <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-slate-500">
          <Camera className="mt-0.5 w-3.5 h-3.5 shrink-0 text-emerald-700" />
          <span>
            صورة الصنف في السوق يقرؤها العرض من الكتالوج: تُرفع من شاشة «الكتالوج» بزرّ «صور الصنف» في سطر الصنف، فلا
            يوجد حقل صورة هنا — العرض يشير إلى الصنف ولا يملك صوراً مستقلة عنه.
          </span>
        </p>

        <FormSection title="المكان وسبب الطرح" />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LabeledSelect
            wide
            label="مستودع التخزين (مطلوب):"
            value={String(values.warehouseId || '')}
            onChange={(value) => set('warehouseId', value ? Number(value) : '')}
            options={[
              { value: '', label: '— اختر مستودعاً —' },
              ...warehouses.map((w) => ({ value: String(w.id), label: `${w.name} (${w.city})` })),
            ]}
            error={problems.warehouse_id}
          />
          <LabeledSelect
            wide
            label="سبب طرح المخزون (مطلوب):"
            value={values.opportunityReason}
            onChange={(value) => set('opportunityReason', value)}
            options={[
              { value: '', label: '— اختر السبب —' },
              ...reasons.map((r) => ({ value: r.code, label: locale === 'en' ? r.label_en : r.label_ar })),
            ]}
            error={problems.opportunity_reason}
          />
        </div>
        {reasons.length === 0 && (
          <p className="text-[10px] text-slate-400">
            قائمة الأسباب تأتي من إعدادات المنصة ولم تُقرأ بعد — أعد تحميل الصفحة.
          </p>
        )}

        <TextInput
          wide
          label="تفصيل سبب الطرح (اختياري):"
          value={values.reasonNotes}
          maxLength={500}
          onChange={(value) => set('reasonNotes', value)}
          error={problems.opportunity_reason_notes}
        />

        <FormSection title="الكمية والسعر" />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TextInput
            wide
            type="number"
            step="0.01"
            label="الكمية الكلية (مطلوب):"
            value={values.totalQuantity}
            onChange={(value) => set('totalQuantity', value)}
            error={problems.total_quantity}
          />
          <TextInput
            wide
            label="وحدة العدّ (مطلوب):"
            value={values.unit}
            maxLength={50}
            placeholder="كرتونة / باليت / كيس"
            onChange={(value) => set('unit', value)}
            error={problems.unit}
          />
          <TextInput
            wide
            type="number"
            step="0.0001"
            label="سعر الوحدة (مطلوب):"
            value={values.unitPrice}
            onChange={(value) => set('unitPrice', value)}
            error={problems.unit_price}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextInput
            wide
            type="number"
            step="0.01"
            label="الحد الأدنى للطلب (مطلوب):"
            value={values.minOrderQuantity}
            onChange={(value) => set('minOrderQuantity', value)}
            error={problems.min_order_quantity}
          />
          <TextInput
            wide
            type="number"
            step="0.01"
            label="الحد الأقصى للطلب (اختياري):"
            value={values.maxOrderQuantity}
            onChange={(value) => set('maxOrderQuantity', value)}
            error={problems.max_order_quantity}
          />
        </div>

        <FormSection title="التسليم والتخزين" />

        <div className="space-y-1">
          <span className="font-bold text-slate-700">شروط التسليم المتاحة للمشترين:</span>
          <div className="flex flex-wrap gap-2 pt-0.5">
            {DELIVERY_TERMS.map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => set('deliveryTerms', term)}
                className={`cursor-pointer rounded-lg border px-3 py-1.5 text-[11px] font-bold ${
                  values.deliveryTerms === term
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {deliveryTermsLabel(term)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TextInput
            wide
            type="date"
            label="تاريخ الإنتاج (اختياري):"
            value={values.productionDate ?? ''}
            onChange={(value) => set('productionDate', value)}
            error={problems.production_date}
          />
          <TextInput
            wide
            type="date"
            label="تاريخ الصلاحية (اختياري):"
            value={values.expiryDate ?? ''}
            onChange={(value) => set('expiryDate', value)}
            error={problems.expiry_date}
          />
          <TextInput
            wide
            label="ظروف التخزين (اختياري):"
            value={values.storageCondition ?? ''}
            maxLength={50}
            placeholder="جاف / مبرّد"
            onChange={(value) => set('storageCondition', value)}
            error={problems.storage_condition}
          />
        </div>

        <FormSection title="وصف وخيارات النشر" />

        <TextInput
          wide
          multiline
          rows={2}
          label="وصف العرض (اختياري):"
          value={values.descriptionAr}
          maxLength={2000}
          onChange={(value) => set('descriptionAr', value)}
          error={problems.description_ar}
        />

        <SellerIdentityToggle
          checked={values.showSellerIdentity}
          onChange={(checked) => set('showSellerIdentity', checked)}
        />

        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={values.asDraft ?? false}
            onChange={(event) => set('asDraft', event.target.checked)}
            className="accent-emerald-600 mt-0.5 shrink-0"
          />
          <span>احفظه مسودةً ولا تطرحه الآن، ثم ارفعه للمراجعة لاحقاً.</span>
        </label>

        <FormFooter
          onCancel={onClose}
          busy={saving}
          busyLabel="جارٍ الحفظ..."
          submitLabel={values.asDraft ? 'حفظ المسودة' : 'حفظ العرض وطرحه'}
        />
      </Form>
    </Sheet>
  );
};
