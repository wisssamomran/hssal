import { fieldError } from '@/core/api/http';
import type { ApiResult } from '@/core/api/http';
import type { RefusalCodeText } from '@/core/api/refusal';
import type { Warehouse } from './types';

/**
 * A storage location, as the seller records it.
 *
 * The two numbers are not decoration. `GET /offers/nearby` ranks listings by the
 * distance between a buyer's point and the *warehouse's* stored coordinates, so a
 * location saved without them never appears in a proximity result at all — a name
 * and a city read as an address to a person, and as nothing to the ranking. That is
 * why this form asks for the coordinates as required fields while the platform's own
 * column allows null: the column tolerates a location nobody positioned, the seller
 * should not be allowed to create one.
 */
export interface WarehouseFormValues {
  name: string;
  code: string;
  city: string;
  district: string;
  addressLine: string;
  latitude: string;
  longitude: string;
  contactName: string;
  contactPhone: string;
}

export function emptyWarehouseForm(): WarehouseFormValues {
  return {
    name: '',
    code: '',
    city: '',
    district: '',
    addressLine: '',
    latitude: '',
    longitude: '',
    contactName: '',
    contactPhone: '',
  };
}

/**
 * What the platform holds, put back into the boxes.
 *
 * `PUT /warehouses/{id}` replaces the record rather than merging into it, so every
 * field the form shows has to be sent again — a form that opened a warehouse to
 * correct its phone and sent no latitude would leave the map with nothing to rank it
 * by, and the seller would not see the loss until a buyer's search came back empty.
 */
export function warehouseFormDefaults(warehouse: Warehouse): WarehouseFormValues {
  const text = (value: string | number | null | undefined): string =>
    value === null || value === undefined ? '' : String(value);

  return {
    name: warehouse.name ?? '',
    code: warehouse.code ?? '',
    city: warehouse.city ?? '',
    district: warehouse.district ?? '',
    addressLine: warehouse.address_line ?? '',
    latitude: text(warehouse.latitude),
    longitude: text(warehouse.longitude),
    contactName: warehouse.contact_name ?? '',
    contactPhone: warehouse.contact_phone ?? '',
  };
}

/**
 * The route's own rules, applied before the request.
 *
 * `WarehouseController::rules()` requires name, city, address line and both
 * coordinates, and bounds the coordinates to the ranges a map can hold. A value
 * typed as `12.9` and one left blank are the same refusal here — a coordinate that
 * parses to `NaN` would reach the server as an empty string and come back as a
 * validation error attached to a box the seller believes they filled in.
 */
export function warehouseFieldProblems(values: WarehouseFormValues): Record<string, string> {
  const problems: Record<string, string> = {};
  const trim = (value: string): string => value.trim();

  if (!trim(values.name)) problems.name = 'اسم المستودع مطلوب.';
  if (!trim(values.city)) problems.city = 'المدينة مطلوبة.';
  if (!trim(values.addressLine)) problems.address_line = 'العنوان التفصيلي مطلوب.';

  const latitude = Number(values.latitude);
  const longitude = Number(values.longitude);
  if (!trim(values.latitude) || Number.isNaN(latitude)) {
    problems.latitude = 'خط العرض رقم مطلوب؛ بدونه لا يظهر المستودع في نتائج القرب.';
  } else if (!(latitude >= -90 && latitude <= 90)) {
    problems.latitude = 'خط العرض بين 90- و 90.';
  }
  if (!trim(values.longitude) || Number.isNaN(longitude)) {
    problems.longitude = 'خط الطول رقم مطلوب؛ بدونه لا يظهر المستودع في نتائج القرب.';
  } else if (!(longitude >= -180 && longitude <= 180)) {
    problems.longitude = 'خط الطول بين 180- و 180.';
  }

  return problems;
}

/**
 * What either write sends — the same fields, because the update route replaces.
 *
 * An optional blank is sent as `null` rather than left out on purpose: leaving a key
 * out of a replacing write is how a cleared box silently keeps the old value, and a
 * seller who deletes a warehouse code expects it gone.
 */
export function warehousePayload(values: WarehouseFormValues): Partial<Warehouse> {
  const trim = (value: string): string => value.trim();
  const optional = (value: string): string | null => (trim(value) ? trim(value) : null);

  return {
    name: trim(values.name),
    code: optional(values.code),
    city: trim(values.city),
    district: optional(values.district),
    address_line: trim(values.addressLine),
    latitude: Number(values.latitude),
    longitude: Number(values.longitude),
    contact_name: optional(values.contactName),
    contact_phone: optional(values.contactPhone),
  };
}

/** Whether the record has a position the proximity ranking can use. */
export function warehouseHasCoordinates(warehouse: Warehouse): boolean {
  return warehouse.latitude !== null && warehouse.longitude !== null;
}

/**
 * Where the server's field names meet this form's.
 *
 * The route validates `address_line`; the box that holds it is `addressLine`. A
 * rejection has to be printed under the box it belongs to, and an edit to that box
 * has to clear the rejection it answered — both need the one mapping between the two
 * spellings, which is why it lives beside the rules rather than inside the sheet.
 */
export const WAREHOUSE_FORM_FIELDS: Partial<Record<keyof WarehouseFormValues, string>> = {
  name: 'name',
  code: 'code',
  city: 'city',
  district: 'district',
  addressLine: 'address_line',
  latitude: 'latitude',
  longitude: 'longitude',
  contactName: 'contact_name',
  contactPhone: 'contact_phone',
};

/** The notes left after one box was edited. */
export function withWarehouseFieldCleared(
  problems: Record<string, string>,
  key: keyof WarehouseFormValues
): Record<string, string> {
  const field = WAREHOUSE_FORM_FIELDS[key];
  if (!field || !(field in problems)) return problems;
  const rest = { ...problems };
  delete rest[field];
  return rest;
}

/**
 * What the location route's rejections ask of the seller.
 *
 * `WAREHOUSE_NOT_FOUND` is the honest reading of a correction that cannot land: the
 * route looks the row up among this business's locations, so the warehouse it was
 * opened from is no longer one of them — deleted, or belongs to somebody else.
 * `TENANT_REQUIRED` and `VALIDATION_FAILED` are platform codes and are explained once
 * in `core/api/refusal`.
 */
export const WAREHOUSE_REFUSAL_CODES: Record<string, RefusalCodeText> = {
  WAREHOUSE_NOT_FOUND: 'لم يعد هذا المستودع ضمن مستودعات منشأتك؛ أعد تحميل الرف.',
};

/** The server's own note for each field it refused. */
export function warehouseWriteProblems(result: ApiResult<unknown>): Record<string, string> {
  const problems: Record<string, string> = {};
  for (const field of Object.values(WAREHOUSE_FORM_FIELDS)) {
    if (!field) continue;
    const message = fieldError(result, field);
    if (message) problems[field] = message;
  }
  return problems;
}
