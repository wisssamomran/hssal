import React, { useState } from 'react';
import { Camera, Package, Plus } from 'lucide-react';
import { BannerView, DecisionButton, PanelShell } from '@/shared/ui/panel';
import type { Banner } from '@/shared/ui/panel';
import { createProduct } from '@/features/catalog/api';
import type { Brand, Category } from '@/features/catalog/types';
import {
  EMPTY_PRODUCT_DRAFT,
  PRODUCT_CREATED_MESSAGE,
  catalogRefusal,
  productCreatePayload,
  productDraftIsValid,
  productFieldErrors,
  productFieldErrorsFrom,
} from '../product-form';
import type { FieldErrors, ProductDraft, ProductField } from '../product-form';
import { ProductFieldsForm } from './ProductFieldsForm';

/**
 * Raising a new product in this organization's catalogue.
 *
 * The panel holds its own draft: nothing here is worth keeping if the screen
 * re-renders, and everything here is worth keeping while a seller fills six boxes and
 * notices they picked the wrong category. After a save the form empties and the list
 * reloads, because a catalogue is worked through one entry at a time.
 *
 * Two things the screen says out loud, because both have cost sellers confusion:
 * a product does not appear in the market by being added — an offer has to be published
 * for it — and a price or a currency is not asked for here, because the seller decides
 * both when they offer the goods.
 */
export const ProductCreatePanel: React.FC<{
  categories: Category[];
  brands: Brand[];
  onSaved: () => void | Promise<void>;
}> = ({ categories, brands, onSaved }) => {
  const [draft, setDraft] = useState<ProductDraft>(EMPTY_PRODUCT_DRAFT);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);

  const onField = (field: ProductField) => (value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: null }));
  };

  const submit = async () => {
    setBanner(null);
    // The client's check exists to place a sentence under a box before a round trip,
    // not to decide what is a valid product: the server's rules do that.
    if (!productDraftIsValid(draft)) {
      setErrors(productFieldErrors(draft));
      return;
    }

    setSaving(true);
    const result = await createProduct(productCreatePayload(draft));
    setSaving(false);

    if (result.success) {
      setBanner({ kind: 'ok', text: PRODUCT_CREATED_MESSAGE });
      setDraft(EMPTY_PRODUCT_DRAFT);
      setErrors({});
      await onSaved();
      return;
    }

    setErrors(productFieldErrorsFrom(result));
    setBanner({ kind: 'error', text: catalogRefusal(result) });
  };

  return (
    <PanelShell
      title="إضافة صنف إلى كتالوج المنشأة"
      hint="الصنف يُنسب إلى تصنيف وعلامة اختيارية، ويُحفظ بالوحدة التي تُعدّ بها كمياته فقط. لا عملة ولا سعر على شاشة الكتالوج: السعر والعملة يقرّرهما البائع حين ينشر عرضاً لهذا الصنف. الصنف لا يظهر في السوق بمجرّد إضافته."
    >
      <ProductFieldsForm
        draft={draft}
        errors={errors}
        categories={categories}
        brands={brands}
        includeSku
        onField={onField}
      />

      <BannerView banner={banner} />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
        <DecisionButton tone="primary" onClick={() => void submit()} busy={saving}>
          <Plus className="w-3.5 h-3.5" />
          <span>حفظ الصنف</span>
        </DecisionButton>
        <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <Package className="w-3.5 h-3.5" />
          <span>الإضافة تحتاج صلاحية catalog.manage، ويتحقق منها الخادم عند الطلب.</span>
        </span>
        <span className="flex basis-full items-start gap-1.5 text-[11px] leading-relaxed text-slate-500">
          <Camera className="mt-0.5 w-3.5 h-3.5 shrink-0 text-emerald-700" />
          <span>
            الصور ليست هنا: الخادم يربط الصورة بصنفٍ موجود، فاحفظ الصنف أولاً ثم اضغط «صور الصنف» في سطره بالجدول
            لترفع صوره وتُبيَّن نتيجة كل ملف.
          </span>
        </span>
      </div>
    </PanelShell>
  );
};
