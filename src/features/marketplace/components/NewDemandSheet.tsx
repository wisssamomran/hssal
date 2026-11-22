import React, { useState } from 'react';
import { PlusCircle } from 'lucide-react';
import type { Category } from '@/features/catalog/types';
import { usePlatformConfig } from '@/core/config';
import { explainRefusal } from '@/core/api/refusal';
import { getLocale, localizedField } from '@/core/i18n';
import { Sheet } from '@/shared/ui/Sheet';
import { BannerView, Form, FormFooter, FormSection, LabeledSelect, TextInput, type Banner } from '@/shared/ui/panel';
import { createDemand } from '../api';
import {
  DEMAND_FORM_FIELDS,
  DEMAND_REFUSAL_CODES,
  currencyChoices,
  dayAfterToday,
  demandFieldProblems,
  demandPayload,
  demandWriteProblems,
  emptyDemandForm,
  type DemandFormValues,
  type DemandProblems,
} from '../demand';

/**
 * Publishing a buyer's request for quotation.
 *
 * The sheet is the platform's one dialog: a bottom sheet on a handset, a centred card
 * above the first breakpoint, closing on the backdrop, the ✕ or Escape. What used to
 * live here was a hand-built centred modal with its own ✕ and its own two buttons, and
 * it disagreed with every other form on the app about where a phone user's thumb lands.
 *
 * Three things this form deliberately does not send:
 *
 * - **A quantity nobody asked for.** The old modal opened on `100` as the amount and
 *   left the unit blank; both are the buyer's requirement and the server refuses an
 *   ask without them, so the boxes open empty and say what they need.
 * - **Coordinates.** `delivery_latitude` and `delivery_longitude` are accepted by the
 *   route and are not offered here, because a city is what a buyer promises and a pin
 *   this screen invented would be a claim about a place nobody chose.
 * - **A deadline copied from the settings.** `expires_at` is offered as an optional
 *   day: left empty, `DemandPublishingService` applies `demand.expiry_days`, and the
 *   notice under the field says whose number is being used.
 */
export const NewDemandSheet: React.FC<{
  categories: Category[];
  onClose: () => void;
  /** Called only after the server has stored the demand. */
  onCreated: () => void;
}> = ({ categories, onClose, onCreated }) => {
  const config = usePlatformConfig();
  const locale = getLocale();

  const [values, setValues] = useState<DemandFormValues>(() => emptyDemandForm());
  const [problems, setProblems] = useState<DemandProblems>({});
  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);

  const tomorrow = dayAfterToday();

  const set = (key: keyof DemandFormValues, value: string) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    const field = DEMAND_FORM_FIELDS[key];
    if (!field) return;
    setProblems((previous) => {
      if (!previous[field]) return previous;
      const next = { ...previous };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBanner(null);

    const local = demandFieldProblems(values);
    setProblems(local);
    if (Object.keys(local).length > 0) {
      setBanner({ kind: 'error', text: 'راجع الحقول المميّزة بالأحمر قبل النشر.' });
      return;
    }

    setBusy(true);
    const result = await createDemand(demandPayload(values));
    setBusy(false);

    if (!result.success) {
      setProblems(demandWriteProblems(result));
      setBanner({
        kind: 'error',
        text: explainRefusal(result, { fallback: 'رفض الخادم نشر الطلب', codes: DEMAND_REFUSAL_CODES }),
      });
      return;
    }

    onCreated();
  };

  const categoryOptions = [
    { value: '', label: 'بلا تصنيف' },
    ...categories.map((category) => ({
      value: String(category.id),
      label: localizedField(category, 'name', locale) || `تصنيف ${category.id}`,
    })),
  ];

  return (
    <Sheet
      title={
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-black text-slate-900">
            <PlusCircle className="h-4 w-4 text-emerald-700" />
            نشر طلب احتياج تجاري
          </h3>
          <p className="pt-0.5 text-[11px] leading-relaxed text-slate-500">
            يُنشر الطلب مفتوحاً ومنشأُك هو صاحبه. المطابقات تُحسب عليه فور نشره، وعروض الأسعار تُحفظ عليه
            ولا تُنشئ حجزاً ولا صفقة.
          </p>
        </div>
      }
      onClose={onClose}
      size="xl"
    >
      <Form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <FormSection title="ما تحتاجه" />

        <TextInput
          wide
          label="عنوان الطلب (مطلوب):"
          value={values.titleAr}
          onChange={(value) => set('titleAr', value)}
          placeholder="مثال: مطلوب توريد 500 كرتون أرز"
          maxLength={255}
          error={problems.title_ar}
        />
        <TextInput
          wide
          label="العنوان بالإنجليزية (اختياري):"
          value={values.titleEn}
          onChange={(value) => set('titleEn', value)}
          maxLength={255}
          error={problems.title_en}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TextInput
            wide
            label="الكمية المطلوبة (مطلوب):"
            value={values.quantity}
            onChange={(value) => set('quantity', value)}
            type="number"
            min="1"
            step="0.01"
            inputMode="decimal"
            error={problems.target_quantity}
          />
          <TextInput
            wide
            label="وحدة القياس (مطلوب):"
            value={values.unit}
            onChange={(value) => set('unit', value)}
            placeholder="كرتونة / باليت / كيس"
            maxLength={50}
            error={problems.unit}
          />
          <LabeledSelect
            wide
            label="التصنيف:"
            value={values.categoryId}
            onChange={(value) => set('categoryId', value)}
            options={categoryOptions}
            error={problems.category_id}
          />
        </div>

        <FormSection title="القيمة والتسليم" />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TextInput
            wide
            label="السعر المستهدف للوحدة (اختياري):"
            value={values.targetPrice}
            onChange={(value) => set('targetPrice', value)}
            type="number"
            min="0.0001"
            step="0.0001"
            inputMode="decimal"
            error={problems.target_unit_price}
          />
          <LabeledSelect
            wide
            label="العملة:"
            value={values.currencyCode}
            onChange={(value) => set('currencyCode', value)}
            options={[
              {
                value: '',
                label: config.baseCurrency ? `العملة الأساسية (${config.baseCurrency})` : 'العملة الأساسية للمنصة',
              },
              ...currencyChoices(values.currencyCode),
            ]}
            error={problems.currency_code}
          />
          <TextInput
            wide
            label="مدينة التسليم (مطلوب):"
            value={values.city}
            onChange={(value) => set('city', value)}
            maxLength={100}
            error={problems.delivery_city}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextInput
            wide
            label="التوريد قبل تاريخ (اختياري):"
            value={values.requiredDate}
            onChange={(value) => set('requiredDate', value)}
            type="date"
            min={tomorrow}
            error={problems.target_delivery_date}
            help="يُقبل الخادم يوماً قادماً فقط."
          />
          <TextInput
            wide
            label="آخر موعد لقبول العروض (اختياري):"
            value={values.expiresAt}
            onChange={(value) => set('expiresAt', value)}
            type="date"
            min={tomorrow}
            error={problems.expires_at}
            help="اتركه فارغاً ليحدّده الخادم من إعدادات المنصة."
          />
        </div>

        <FormSection title="الاشتراطات" />

        <TextInput
          wide
          multiline
          rows={3}
          label="وصف الطلب (اختياري):"
          value={values.description}
          onChange={(value) => set('description', value)}
          placeholder="ما تحتاج شراءه، وبأي مواصفات، ولأي غرض."
          maxLength={2000}
          error={problems.description}
        />
        <TextInput
          wide
          multiline
          rows={3}
          label="شروط خاصة (اختياري):"
          value={values.specialRequirements}
          onChange={(value) => set('specialRequirements', value)}
          placeholder="درجات التعبئة، الحد الأدنى لمدة الصلاحية، شرط التسليم في المستودع…"
          maxLength={1000}
          error={problems.special_requirements}
        />

        <BannerView banner={banner} />

        <FormFooter onCancel={onClose} busy={busy} busyLabel="جارٍ النشر..." submitLabel="نشر طلب الاحتياج" />

        <p className="text-[10px] leading-relaxed text-slate-400">
          {config.baseCurrency
            ? `إن لم تُرسل عملة للطلب، ثبّت الخادم العملة الأساسية للمنصة (${config.baseCurrency}) على السعر المستهدف.`
            : 'لم تُضبط عملة أساسية للمنصة؛ يضبطها مسؤول المنصة قبل نشر طلب بسعر مستهدف.'}
        </p>
      </Form>
    </Sheet>
  );
};
