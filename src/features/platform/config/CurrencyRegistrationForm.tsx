import React from 'react';
import { Plus } from 'lucide-react';
import { DecisionButton, TextInput } from '@/shared/ui/panel';
import type { CurrencyRegistration } from './currency';
/**
 * Registering a currency the registry does not have yet.
 *
 * Every field is asked for because the route requires every one of them: `iso_code`
 * is three characters and unique, both names are required, the symbol is capped at
 * ten characters, and the rate must be a number of at least 0.000001. There is no
 * default rate to fall back on, and a client that invented one would be publishing a
 * conversion nobody entered — which is why an empty rate box is left to be refused
 * rather than filled in here.
 *
 * The draft is held by the desk that opens this form, so a cancel-and-reopen does not
 * silently discard a rate someone typed; the shape of the draft is
 * `CurrencyRegistration`, which is the same fields in the same names the POST body
 * carries.
 */
export const CurrencyRegistrationForm: React.FC<{
  draft: CurrencyRegistration;
  onChange: (draft: CurrencyRegistration) => void;
  onSubmit: () => void;
  onCancel: () => void;
  busy: boolean;
}> = ({ draft, onChange, onSubmit, onCancel, busy }) => {
  const field = (key: keyof CurrencyRegistration) => (value: string) => onChange({ ...draft, [key]: value });

  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-3 bg-slate-50">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-black text-slate-900">عملة جديدة في السجل</h4>
        <DecisionButton onClick={onCancel}>إلغاء</DecisionButton>
      </div>
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <TextInput label="ISO (3)" value={draft.iso_code} onChange={field('iso_code')} wide />
        <TextInput label="الاسم عربي" value={draft.name_ar} onChange={field('name_ar')} wide />
        <TextInput label="الاسم إنجليزي" value={draft.name_en} onChange={field('name_en')} wide />
        <TextInput label="الرمز" value={draft.symbol} onChange={field('symbol')} wide />
        <TextInput label="خانات عشرية" value={draft.decimal_places} onChange={field('decimal_places')} wide />
        <TextInput
          label="سعر الصرف (لوحدة أساسية)"
          value={draft.exchange_rate_to_base}
          onChange={field('exchange_rate_to_base')}
          placeholder="1"
          wide
        />
        <div className="sm:col-span-2 lg:col-span-3">
          <DecisionButton onClick={onSubmit} busy={busy} tone="primary">
            <Plus className="w-3.5 h-3.5" />
            إضافة العملة إلى السجل
          </DecisionButton>
        </div>
      </div>
      <p className="text-[11px] text-slate-500">
        السعر يقبله الخادم كرقم أكبر من صفر؛ تركه فارغًا يرد بخطأ تحقّق، لأنه لا يوجد سعر افتراضي مجهول المصدر.
        والرقم هو كم من هذه العملة يعادل وحدة واحدة من العملة الأساسية، ولا يُستخدم لتحويل إجماليات الصفقة:
        فالصفقة تُسجَّل وتُسعَّر بعملة معاملتها، ويظهر هذا الرقم عند العرض بالعملة الأساسية فقط.
      </p>
    </div>
  );
};
