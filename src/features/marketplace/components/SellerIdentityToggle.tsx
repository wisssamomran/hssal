import React from 'react';
import { ANONYMOUS_SELLER_LABEL } from '@/features/marketplace/labels';

/**
 * The one control that decides whether a listing names its business.
 *
 * It is a per-listing choice, not an organization setting: the same factory may
 * want its surplus anonymous and its clearance named. Both the create sheet and the
 * edit sheet ask the same question, and each had written its own paragraph about
 * what hiding does — one of them mentioning the words the market shows in place of a
 * name («بائع لا يُظهر اسمه»), the other not. The rule is the same rule, so it is said
 * once, here.
 *
 * What the sentence must never do is promise anonymity where a transaction follows:
 * the seller's name still reaches a reviewer, and still reaches the buyer the moment
 * a purchase request arrives, because a counterparty nobody can name cannot sign a
 * deal.
 */
export const SellerIdentityToggle: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}> = ({ checked, onChange, disabled }) => (
  <label
    className={`flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] font-semibold text-slate-700 dark:border-hassal-line dark:bg-hassal-raised dark:text-slate-200 ${
      disabled ? 'opacity-60' : 'cursor-pointer'
    }`}
  >
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      className="accent-emerald-600 mt-0.5 shrink-0"
    />
    <span>
      إظهار اسم منشأتك في هذا العرض على السوق.
      <span className="block pt-0.5 text-[10px] font-normal leading-relaxed text-slate-500 dark:text-slate-400">
        عند الإخفاء لا يظهر اسم المنشأة ولا رقم السجل التجاري ولا الرقم الضريبي ولا اسم المستودع وعنوانه في بطاقات
        السوق وصفحة العرض، ويظهر بدلها «{ANONYMOUS_SELLER_LABEL}». يبقى الاسم مرئيًا لمراجِع المنصة، ويصل اسمك الحقيقي إلى
        المشتري عند وصول طلب الشراء إليكما معًا — لأن من يوقّع صفقة يجب أن يُعرف.
      </span>
    </span>
  </label>
);
