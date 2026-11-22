/**
 * Reading and writing the catalogue of things — categories, brands, products and
 * variants — and the photographs that show them.
 *
 * Every path below is a route the server actually registers: `npm run check:api`
 * compares these modules against `php artisan route:list`, so a button here cannot
 * be wired to an endpoint that was never built. A call that must not run twice on a
 * retried click passes an `idempotencyKey`, and the transport that stamps it — the
 * token, the organization header, the envelope — is `src/core/api/http.ts`.
 */

import { idempotencyKey, qs, request } from '@/core/api/http';

import type { Brand, Category, Product, ProductImage } from '@/features/catalog/types';

export async function getCategories() {
  return request<Category[]>('/api/v1/marketplace/categories');
}

export async function getBrands() {
  return request<Brand[]>('/api/v1/marketplace/brands');
}

export async function getProducts(filters: { category_id?: number; search?: string; page?: number } = {}) {
  return request<Product[]>('/api/v1/catalog/products' + qs({ ...filters }));
}

export async function createProduct(product: Record<string, unknown>) {
  return request<Product>('/api/v1/catalog/products', {
    method: 'POST',
    body: product,
    idempotencyKey: idempotencyKey('prd'),
  });
}

export async function getProductVariants(productId: number) {
  return request(`/api/v1/catalog/products/${productId}/variants`);
}

/**
 * Edit this organization's own product record.
 *
 * `sku` is not in the editable set — the scanned code belongs to the variant,
 * and a product-level edit that could rewrite it would silently split a
 * barcode across the platform. A reference the platform published
 * (`organization_id` null) answers `PLATFORM_REFERENCE_NOT_EDITABLE`, and
 * another tenant's product answers `PRODUCT_NOT_OWNED` rather than a listing
 * of what exists.
 */
export async function updateProduct(id: number, data: Record<string, unknown>) {
  return request<Product>(`/api/v1/catalog/products/${id}`, { method: 'PUT', body: data });
}

/**
 * The media set as stored rows, ordered as a buyer should see it.
 *
 * This is not `product.image_url`: that legacy column has no writer anywhere
 * in the application, and a screen that reads it shows a blank next to
 * listings that have real photographs attached.
 */
export async function getProductImages(productId: number) {
  return request<ProductImage[]>(`/api/v1/catalog/products/${productId}/images`);
}

/**
 * Upload one or more photographs for a product.
 *
 * A batch is the normal case — the pallet, the carton, the label — and the
 * server answers with both halves: what it stored and what it refused with
 * the reason. Only the accepted subset is a success, so a caller that ignores
 * `rejected` would tell the seller eight files became eight photographs when
 * two of them were HEIC.
 */
export async function uploadProductImages(productId: number, files: File[]) {
  const form = new FormData();
  files.forEach((file) => form.append('images[]', file, file.name));
  return request<{ images: ProductImage[]; rejected: { file: string; reason: string }[] }>(
    `/api/v1/catalog/products/${productId}/images`,
    { method: 'POST', form, idempotencyKey: idempotencyKey('prd_img') }
  );
}

/** Set the cover, or the position a buyer scrolls to. */
export async function updateProductImage(productId: number, imageId: number, data: { is_cover?: boolean; sort_order?: number }) {
  return request<ProductImage>(`/api/v1/catalog/products/${productId}/images/${imageId}`, {
    method: 'PUT',
    body: data,
  });
}

/** Removes the stored file with the row, and moves the cover to the next photograph. */
export async function deleteProductImage(productId: number, imageId: number) {
  return request<{ id: number; deleted: boolean }>(
    `/api/v1/catalog/products/${productId}/images/${imageId}`,
    { method: 'DELETE' }
  );
}
