/**
 * Where stock physically is: a warehouse, and the movements that change it.
 *
 * Every path below is a route the server actually registers: `npm run check:api`
 * compares these modules against `php artisan route:list`, so a button here cannot
 * be wired to an endpoint that was never built. A call that must not run twice on a
 * retried click passes an `idempotencyKey`, and the transport that stamps it — the
 * token, the organization header, the envelope — is `src/core/api/http.ts`.
 */

import { idempotencyKey, qs, request } from '@/core/api/http';

import type { InventoryMovement, Warehouse } from '@/features/inventory/types';

/** Warehouses of the active organization, including unlisted ones. */
export async function getWarehouses() {
  return request<Warehouse[]>('/api/v1/warehouses');
}

/** Public discovery list: only locations that hold active offers. */
export async function getPublicWarehouses(filters: { city?: string; search?: string } = {}) {
  return request<Warehouse[]>('/api/v1/marketplace/warehouses' + qs({ ...filters }));
}

export async function createWarehouse(warehouse: Partial<Warehouse>) {
  return request<Warehouse>('/api/v1/warehouses', {
    method: 'POST',
    body: warehouse,
    idempotencyKey: idempotencyKey('wh'),
  });
}

/**
 * Edit a location of the organization in context; another tenant's id reads
 * as `WAREHOUSE_NOT_FOUND`, which is what keeps the endpoint from confirming
 * how many warehouses a rival operates.
 *
 * `latitude`/`longitude` are required on an update exactly as on a create, so
 * a form that could not read the browser's location must resend the stored
 * pair rather than 0,0 — the server's bounds are WGS84 (-90..90, -180..180),
 * and 0,0 is inside them. It would save a warehouse in the Atlantic.
 */
export async function updateWarehouse(id: number, warehouse: Partial<Warehouse>) {
  return request<Warehouse>(`/api/v1/warehouses/${id}`, { method: 'PUT', body: warehouse });
}

export async function getInventoryMovements(filters: {
  offer_id?: number;
  type?: string;
  warehouse_id?: number;
  per_page?: number;
  page?: number;
} = {}) {
  return request<InventoryMovement[]>('/api/v1/inventory-movements' + qs({ ...filters }));
}

/**
 * A stock correction, written against the offer whose quantities it changes.
 *
 * `quantity` is signed: the server accepts a negative number for ADJUSTED
 * only, and answers `QUANTITY_MUST_BE_POSITIVE` for the two kinds that
 * describe goods arriving.
 */
export async function adjustInventory(data: {
  offer_id: number;
  type: 'IN' | 'ADJUSTED' | 'RETURNED';
  quantity: number;
  reason: string;
}) {
  return request<InventoryMovement>('/api/v1/inventory-movements/adjust', {
    method: 'POST',
    body: data,
    idempotencyKey: idempotencyKey('adj'),
  });
}
