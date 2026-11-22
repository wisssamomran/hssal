import React, { useState } from 'react';
import { Camera, ChevronDown, ChevronUp } from 'lucide-react';
import { ErrorNote } from '@/shared/ui/panel';
import { getLocale } from '@/core/i18n';
import type { Pagination } from '@/core/api/http';
import { getProductVariants } from '@/features/catalog/api';
import type { Brand, Category, Product, ProductVariant } from '@/features/catalog/types';
import { catalogName, catalogNameFor, variantName } from '../product-form';

/**
 * The catalogue as the server returned one page of it.
 *
 * The table draws rows and asks the screen to open a product; it decides nothing about
 * what a product is. The one piece of state it keeps is which row's sub-products are
 * open, because that belongs to the row and would otherwise sit in the screen and make
 * every row re-render when one was clicked.
 *
 * Sub-products come from the row's own read rather than the page's payload: a listing
 * carries `variants` only when the endpoint chose to nest them, and the server's answer
 * is what is shown. The row's cached copy appears first so the click is not blank while
 * that read is in flight.
 */
export const ProductsTable: React.FC<{
  products: Product[];
  categories: Category[];
  brands: Brand[];
  loading: boolean;
  denied: string | null;
  canManage: boolean;
  pagination: Pagination | null;
  onOpenProduct: (product: Product, atImages?: boolean) => void;
  onPage: (page: number) => void;
}> = ({ products, categories, brands, loading, denied, canManage, pagination, onOpenProduct, onPage }) => {
  const locale = getLocale();
  const [openProductId, setOpenProductId] = useState<number | null>(null);
  const [variants, setVariants] = useState<ProductVariant[]>([]);

  const toggleVariants = async (product: Product) => {
    if (openProductId === product.id) {
      setOpenProductId(null);
      setVariants([]);
      return;
    }
    setOpenProductId(product.id);
    setVariants(product.variants ?? []);
    const result = await getProductVariants(product.id);
    if (result.success && Array.isArray(result.data)) setVariants(result.data);
  };

  if (loading) return <p className="py-8 text-center text-xs text-slate-500">جارٍ جلب الأصناف…</p>;

  if (!products.length && !denied) {
    return (
      <p className="py-8 text-center text-xs text-slate-500">
        لا توجد أصناف مطابقة للبحث الحالي ضمن ما يُرجعه الخادم.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* A refusal to read is said here rather than as an empty shelf: a seller whose
          account lost `catalog.manage` on another route would otherwise be told they
          have no products. */}
      {denied ? <ErrorNote text={denied} /> : null}

      {products.length ? (
        <div className="min-w-0 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[40rem] text-right text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="p-3 font-semibold">الصنف</th>
                <th className="p-3 font-semibold">التصنيف</th>
                <th className="p-3 font-semibold">العلامة</th>
                <th className="p-3 font-semibold">الوحدة</th>
                <th className="p-3 font-semibold">الكود</th>
                <th className="p-3 font-semibold">التغليف</th>
                <th className="p-3 text-center font-semibold">الأصناف الفرعية</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((product) => (
                <React.Fragment key={product.id}>
                  <tr className="hover:bg-slate-50/70">
                    <td className="p-3">
                      <div className="max-w-[12rem] font-bold text-slate-900" title={catalogName(product, locale)}>
                        {catalogName(product, locale)}
                      </div>
                      {product.name_en && locale !== 'en' ? (
                        <div className="text-[10px] text-slate-400">{product.name_en}</div>
                      ) : null}
                      {canManage ? (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <button
                            onClick={() => onOpenProduct(product)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-100"
                          >
                            <ChevronDown className="w-3 h-3" />
                            <span>تصحيح الصنف</span>
                          </button>
                          <button
                            onClick={() => onOpenProduct(product, true)}
                            title="رفع صور هذا الصنف وحفظها لديه"
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100"
                          >
                            <Camera className="w-3 h-3" />
                            <span>صور الصنف</span>
                          </button>
                        </div>
                      ) : null}
                    </td>
                    <td className="p-3 text-slate-600">
                      {catalogNameFor(product.category_id, categories, locale, 'غير مسجّل')}
                    </td>
                    <td className="p-3 text-slate-600">
                      {catalogNameFor(product.brand_id, brands, locale, 'لا علامة مسجّلة')}
                    </td>
                    <td className="p-3 text-slate-700">{product.unit || '—'}</td>
                    <td className="p-3 font-mono text-[11px] text-slate-600">{product.sku || 'غير مسجّل'}</td>
                    <td className="p-3 text-slate-600">{product.package_size || '—'}</td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => void toggleVariants(product)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
                      >
                        {openProductId === product.id ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                        <span>{product.variants?.length ? `${product.variants.length} صنف` : 'عرض'}</span>
                      </button>
                    </td>
                  </tr>
                  {openProductId === product.id ? (
                    <tr className="bg-slate-50/60">
                      <td colSpan={7} className="p-3">
                        {variants.length === 0 ? (
                          <p className="text-[11px] text-slate-500">لا أصناف فرعية نشطة مسجّلة لهذا الصنف.</p>
                        ) : (
                          <ul className="space-y-1 text-[11px] text-slate-700">
                            {variants.map((variant) => (
                              <li key={variant.id} className="flex flex-wrap items-center gap-3">
                                <span className="font-bold">{variantName(variant, locale)}</span>
                                <span className="font-mono text-slate-500">SKU: {variant.sku}</span>
                                <span className="text-slate-500">التغليف: {variant.packaging_spec || 'غير مسجّل'}</span>
                                {variant.weight_kg != null && variant.weight_kg !== '' ? (
                                  <span className="text-slate-500">الوزن: {variant.weight_kg} كجم</span>
                                ) : null}
                                {variant.barcode ? <span className="text-slate-400">{variant.barcode}</span> : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {pagination ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
          <span>
            صفحة {pagination.current_page} من {pagination.total_pages} · {pagination.total_items} صنف
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPage(Math.max(1, pagination.current_page - 1))}
              disabled={pagination.current_page <= 1}
              className="rounded-lg border border-slate-300 px-3 py-2 font-bold hover:bg-slate-100 disabled:opacity-40"
            >
              السابق
            </button>
            <button
              onClick={() => onPage(pagination.current_page + 1)}
              disabled={!pagination.has_more}
              className="rounded-lg border border-slate-300 px-3 py-2 font-bold hover:bg-slate-100 disabled:opacity-40"
            >
              التالي
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
