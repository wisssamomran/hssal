import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { BannerView, DecisionButton } from '@/shared/ui/panel';
import type { Banner } from '@/shared/ui/panel';
import { getLocale } from '@/core/i18n';
import { updateProduct } from '@/features/catalog/api';
import type { Brand, Category, Product } from '@/features/catalog/types';
import {
  catalogName,
  productDraft,
  productDraftIsValid,
  productFieldErrors,
  productFieldErrorsFrom,
  productSavedMessage,
  productUpdatePayload,
  productWriteProblem,
} from '../product-form';
import type { FieldErrors, ProductField } from '../product-form';
import { ProductFieldsForm } from './ProductFieldsForm';
import { ProductImagesPanel } from './ProductImagesPanel';

/**
 * Correcting one product, in a sheet rather than a table cell.
 *
 * A dialog was chosen over an inline row because the form and the photograph uploader
 * together do not fit a phone when they are trapped in a cell of a table that scrolls
 * sideways. Escape closes it, as the ✕ does, since the sheet has no button of its own
 * below the fold on a small screen.
 *
 * The SKU is shown and not offered. The server takes a code when the product is raised
 * and refuses to move it afterwards, because an offer that is already live pointed at
 * that code when it was published — so the box is read-only text with the reason beside
 * it, and no draft field carries it.
 *
 * A field the server refused appears under that field, and the sheet's own banner says
 * the wider refusal: an ownership refusal has no box to sit under, and telling a seller
 * to fix their typing when the platform owns the record sends them to the wrong door.
 */
export const ProductEditSheet: React.FC<{
  product: Product;
  categories: Category[];
  brands: Brand[];
  atImages: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}> = ({ product, categories, brands, atImages, onClose, onSaved }) => {
  const locale = getLocale();
  const [draft, setDraft] = useState(() => productDraft(product));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onField = (field: ProductField) => (value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: null }));
  };

  const save = async () => {
    setBanner(null);
    if (!productDraftIsValid(draft)) {
      setErrors(productFieldErrors(draft));
      return;
    }

    setSaving(true);
    const result = await updateProduct(product.id, productUpdatePayload(draft));
    setSaving(false);

    if (!result.success) {
      setErrors(productFieldErrorsFrom(result));
      setBanner({ kind: 'error', text: productWriteProblem(result) });
      return;
    }

    setBanner({ kind: 'ok', text: productSavedMessage(result) });
    await onSaved();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[92dvh] w-full space-y-4 overflow-y-auto rounded-t-2xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-w-3xl sm:rounded-2xl sm:p-5">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-black text-slate-900">
              تصحيح «{catalogName(product, locale)}»
            </h3>
            <p className="pt-0.5 text-[11px] leading-relaxed text-slate-500">
              رقم الصنف #{product.id} · سبب رفض الخادم لأي حقل يظهر تحت الحقل نفسه.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="-m-1 shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <BannerView banner={banner} />

        <section className="space-y-3">
          <h4 className="text-[11px] font-black text-slate-700">بيانات الصنف</h4>
          <ProductFieldsForm
            draft={draft}
            errors={errors}
            categories={categories}
            brands={brands}
            includeSku={false}
            onField={onField}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          />

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:max-w-xs">
            <div className="text-[10px] text-slate-500">كود الصنف (SKU)</div>
            <div className="font-mono text-[11px] font-bold text-slate-700" dir="ltr">
              {product.sku || 'غير مسجّل'}
            </div>
            <div className="pt-0.5 text-[10px] leading-relaxed text-slate-400">
              لا يُعدَّل: العروض القائمة أشارت إليه كما نُشر.
            </div>
          </div>

          <DecisionButton tone="primary" busy={saving} onClick={() => void save()}>
            <span>حفظ التصحيح</span>
          </DecisionButton>
        </section>

        <section className="border-t border-slate-100 pt-3">
          <ProductImagesPanel product={product} openAtImages={atImages} />
        </section>
      </div>
    </div>
  );
};
