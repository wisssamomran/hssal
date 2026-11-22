/*


*
 * What a thing is — categories, brands, products and variants.
 *
 * A product exists whether or not anybody is offering it, so nothing about
 * price, stock or a seller's intent belongs here; that is `marketplace` and
 * `inventory`.
 *
 * These mirror what the endpoints actually return: statuses keep the server's uppercase
 * vocabulary, amounts arrive as decimal strings from MySQL, and any field the
 * platform only knows after a human entered it is nullable. When a component and
 * a type here disagree, the component is wrong.
 */

export interface Category {
  id: number;
  parent_id?: number | null;
  code?: string | null;
  slug: string;
  name_ar: string;
  name_en: string;
  description_ar?: string | null;
  description_en?: string | null;
  icon?: string | null;
  sort_order: number;
  is_active?: boolean;
  children?: Category[];
}

export interface Brand {
  id: number;
  name_ar: string;
  name_en: string;
  slug?: string;
  logo_url?: string | null;
  is_active?: boolean;
}

export interface ProductVariant {
  id: number;
  product_id: number;
  sku: string;
  barcode?: string | null;
  name_ar: string;
  name_en: string;
  weight_kg?: string | number | null;
  packaging_spec?: string | null;
  image_url?: string | null;
  attributes_json?: Record<string, unknown> | null;
  is_active?: boolean;
}

export interface Product {
  id: number;
  organization_id?: number | null;
  category_id: number;
  brand_id?: number | null;
  sku?: string | null;
  barcode?: string | null;
  name_ar: string;
  /** Optional by contract and by column: the catalogue is named in Arabic first. */
  name_en?: string | null;
  description_ar?: string | null;
  description_en?: string | null;
  /** The unit a quantity is counted in, e.g. `carton`, `kg`, `pallet`. */
  unit: string;
  package_size?: string | null;
  temperature_class?: string | null;
  shelf_life_days?: number | null;
  image_url?: string | null;
  is_active?: boolean;
  category_name_ar?: string | null;
  brand_name_ar?: string | null;
  variants?: ProductVariant[];
}

/**
 * One uploaded photograph of a product (`/catalog/products/{id}/images`).
 *
 * `url` is relative to the storage disk and served through `public/storage`, so
 * it only resolves when `php artisan storage:link` has been run on the server —
 * a missing symlink shows as a broken image, not as a wrong path here.
 */
export interface ProductImage {
  id: number;
  product_id: number;
  url: string | null;
  is_cover: boolean;
  sort_order: number;
  mime_type?: string | null;
  size_bytes?: number | null;
  width?: number | null;
  height?: number | null;
  original_name?: string | null;
  uploaded_at?: string | null;
}
