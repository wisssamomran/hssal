import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { DecisionButton, LabeledSelect, PanelShell, TextInput } from '@/shared/ui/panel';
import { getLocale } from '@/core/i18n';
import type { Pagination } from '@/core/api/http';
import { getBrands, getCategories, getProducts } from '@/features/catalog/api';
import { catalogName, catalogRefusal } from '@/features/catalog/product-form';
import type { Brand, Category, Product } from '@/features/catalog/types';
import { ProductCreatePanel } from '@/features/catalog/components/ProductCreatePanel';
import { ProductEditSheet } from '@/features/catalog/components/ProductEditSheet';
import { ProductsTable } from '@/features/catalog/components/ProductsTable';

interface CatalogViewProps {
  can: (permission: string) => boolean;
}

/**
 * The organization's catalogue of things.
 *
 * This screen queries and holds the page the server returned. What a product is made
 * of, what a refusal means and what the photographs on a product are decided in
 * `product-form.ts` and `product-images.ts`, and the three blocks that draw them —
 * the table, the add panel, the correction sheet — live beside those rules in
 * `components/`. The split is what lets the add form and the correction form share one
 * set of field boxes and one set of messages instead of two drifting copies.
 *
 * Reads that this screen refuses to collapse into one another:
 * - A catalogue the account may not read is a refusal, not an empty shelf. The two are
 *   shown differently on purpose: a seller who is told «لا أصناف» when the request was
 *   denied stops uploading stock rather than asking for the permission.
 * - Categories and brands arrive on their own calls, and a failed one leaves the
 *   filters short rather than failing the whole screen: the product page the seller came
 *   for is still readable.
 * - The list is paged by the server. This screen counts nothing on its own and says so
 *   in the pager's own line.
 */
export const CatalogView: React.FC<CatalogViewProps> = ({ can }) => {
  const locale = getLocale();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [readDenied, setReadDenied] = useState<string | null>(null);
  /** The product the correction sheet is open on, and whether it opened at the uploader. */
  const [editing, setEditing] = useState<{ product: Product; atImages: boolean } | null>(null);

  const canManage = can('catalog.manage');

  const load = useCallback(async () => {
    setLoading(true);
    setReadDenied(null);
    try {
      const [productResult, categoryResult, brandResult] = await Promise.all([
        getProducts({
          page,
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(categoryFilter ? { category_id: Number(categoryFilter) } : {}),
        }),
        getCategories(),
        getBrands(),
      ]);

      if (productResult.success && Array.isArray(productResult.data)) {
        setProducts(productResult.data);
        setPagination(productResult.pagination ?? null);
      } else {
        setProducts([]);
        setPagination(null);
        setReadDenied(catalogRefusal(productResult));
      }

      if (categoryResult.success && Array.isArray(categoryResult.data)) setCategories(categoryResult.data);
      if (brandResult.success && Array.isArray(brandResult.data)) setBrands(brandResult.data);
    } finally {
      setLoading(false);
    }
  }, [page, search, categoryFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  /* The row's own copy of the catalogue: the sheet is keyed by the product id, so a
     different row re-reads its own draft instead of showing the last one's boxes. */
  const openProduct = (product: Product, atImages = false) => {
    if (editing?.product.id === product.id && !atImages) {
      setEditing(null);
      return;
    }
    setEditing({ product, atImages });
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-3 py-6 sm:px-6 lg:px-8">
      <PanelShell
        title="كتالوج الأصناف"
        hint="الأصناف هي ما تُنسب إليه العروض والطلبات. هذه الشاشة تعرض ما يُرجعه `/catalog/products` وتضيف صنفاً، وتُصحّح ما تقبله `PUT /catalog/products/{id}` من اسم وتصنيف وعلامة ووحدة وتغليف وصنف حرارة؛ كود الصنف (SKU) لا يُعدَّل هنا. صور الصنف تُرفع من زر «صور الصنف» في سطر كل صنف."
      >
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <LabeledSelect
            label="التصنيف الغذائي"
            value={categoryFilter}
            onChange={(value) => {
              setPage(1);
              setCategoryFilter(value);
            }}
            options={[
              { value: '', label: 'كل التصنيفات' },
              ...categories.map((category) => ({ value: String(category.id), label: catalogName(category, locale) })),
            ]}
          />
          <TextInput
            label="بحث بالاسم أو الكود"
            value={search}
            onChange={(value) => {
              setPage(1);
              setSearch(value);
            }}
            placeholder="ارز، حليب، SKU…"
            wide
          />
          <DecisionButton onClick={() => void load()} busy={loading}>
            <RefreshCw className="w-3.5 h-3.5" />
            <span>تحديث</span>
          </DecisionButton>
        </div>

        <div className="pt-3">
          <ProductsTable
            products={products}
            categories={categories}
            brands={brands}
            loading={loading}
            denied={readDenied}
            canManage={canManage}
            pagination={pagination}
            onOpenProduct={openProduct}
            onPage={setPage}
          />
        </div>
      </PanelShell>

      {canManage ? <ProductCreatePanel categories={categories} brands={brands} onSaved={load} /> : null}

      {editing ? (
        <ProductEditSheet
          key={editing.product.id}
          product={editing.product}
          categories={categories}
          brands={brands}
          atImages={editing.atImages}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      ) : null}
    </div>
  );
};
