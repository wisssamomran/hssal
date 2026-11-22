import React from 'react';
import { ErrorNote, LabeledSelect, TextInput } from '@/shared/ui/panel';
import { getLocale } from '@/core/i18n';
import type { Brand, Category } from '@/features/catalog/types';
import { catalogName } from '../product-form';
import type { FieldErrors, ProductDraft, ProductField } from '../product-form';

/**
 * The eight boxes a catalogue entry is made of.
 *
 * Adding a product and correcting one fill in the same fields, and they used to hold two
 * separate copies of that markup — which is how the two screens came to call the same
 * field «اسم الصنف بالعربية» on one and «الاسم بالعربية» on the other, and how a required
 * box could gain a hint on the create form and stay without it on the correction sheet.
 * There is now one set of boxes; the panels around it differ.
 *
 * `includeSku` is the one field that is not the same on both paths, and it is the
 * server's difference rather than a layout choice: the code is accepted when a product
 * is raised and refused afterwards, so it is offered on create and not on update.
 */
export const ProductFieldsForm: React.FC<{
  draft: ProductDraft;
  errors: FieldErrors;
  categories: Category[];
  brands: Brand[];
  includeSku: boolean;
  onField: (field: ProductField) => (value: string) => void;
  className?: string;
}> = ({ draft, errors, categories, brands, includeSku, onField, className }) => {
  const locale = getLocale();

  return (
    <div className={className ?? 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'}>
      <div>
        <LabeledSelect
          label="التصنيف (مطلوب)"
          value={draft.category_id}
          onChange={onField('category_id')}
          options={[
            { value: '', label: 'اختر تصنيفاً' },
            ...categories.map((category) => ({ value: String(category.id), label: catalogName(category, locale) })),
          ]}
        />
        {errors.category_id ? <ErrorNote text={errors.category_id} /> : null}
      </div>

      <div>
        <LabeledSelect
          label="العلامة التجارية (اختياري)"
          value={draft.brand_id}
          onChange={onField('brand_id')}
          options={[
            { value: '', label: 'بدون علامة' },
            ...brands.map((brand) => ({ value: String(brand.id), label: catalogName(brand, locale) })),
          ]}
        />
        {errors.brand_id ? <ErrorNote text={errors.brand_id} /> : null}
      </div>

      <div>
        <TextInput
          label="الاسم بالعربية (مطلوب)"
          value={draft.name_ar}
          onChange={onField('name_ar')}
          wide
        />
        {errors.name_ar ? <ErrorNote text={errors.name_ar} /> : null}
      </div>

      <TextInput label="الاسم بالإنجليزية (اختياري)" value={draft.name_en} onChange={onField('name_en')} wide />

      <div>
        <TextInput
          label="الوحدة (مطلوب)"
          value={draft.unit}
          onChange={onField('unit')}
          placeholder="كرتون / كيس / كجم"
        />
        {errors.unit ? <ErrorNote text={errors.unit} /> : null}
      </div>

      {includeSku ? (
        <div>
          <TextInput label="كود الصنف SKU (اختياري)" value={draft.sku} onChange={onField('sku')} />
          {errors.sku ? <ErrorNote text={errors.sku} /> : null}
        </div>
      ) : null}

      <TextInput
        label="حجم العبوة (اختياري)"
        value={draft.package_size}
        onChange={onField('package_size')}
      />

      <TextInput
        label="درجة حرارة التخزين (اختياري)"
        value={draft.temperature_class}
        onChange={onField('temperature_class')}
        placeholder="جاف / مبرد / مجمّد"
      />
    </div>
  );
};
