/*


*
 * Stock as it actually sits — a warehouse and the movements that changed it.
 *
 * A quantity on an offer is a promise; a quantity here is a record of goods.
 * The two are separate types on purpose.
 *
 * These mirror what the endpoints actually return: statuses keep the server's uppercase
 * vocabulary, amounts arrive as decimal strings from MySQL, and any field the
 * platform only knows after a human entered it is nullable. When a component and
 * a type here disagree, the component is wrong.
 */

/**
 * A storage location. Coordinates are nullable on purpose: a warehouse whose
 * position was never recorded must not be ranked as though it were somewhere,
 * so distance UI has to hide the distance rather than guess one.
 */
export interface Warehouse {
  id: number;
  organization_id: number;
  name: string;
  code?: string | null;
  city: string;
  district?: string | null;
  address_line: string;
  latitude: string | number | null;
  longitude: string | number | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  is_active?: boolean;
}

/**
 * A movement of stock, recorded against the offer whose quantities it changed.
 *
 * `previous_quantity` and `new_quantity` are that offer's available quantity
 * before and after: the platform keeps no separate per-warehouse stock count,
 * so these are the only two numbers on the row that mean anything.
 */
export interface InventoryMovement {
  id: number;
  organization_id: number;
  warehouse_id: number;
  product_variant_id: number;
  offer_id?: number | null;
  deal_id?: number | null;
  user_id?: number | null;
  type: 'IN' | 'RESERVED' | 'RELEASED' | 'SOLD' | 'ADJUSTED' | 'RETURNED';
  quantity: string | number;
  previous_quantity: string | number;
  new_quantity: string | number;
  reason?: string | null;
  created_at: string;
  warehouse?: { id: number; name: string; code?: string | null; city?: string | null } | null;
  product_variant?: { id: number; sku?: string | null; name_ar?: string | null; name_en?: string | null } | null;
  user?: { id: number; name: string } | null;
}
