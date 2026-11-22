import type { ApiResult } from '@/core/api/http';
import { fieldError } from '@/core/api/http';
import { explainRefusal } from '@/core/api/refusal';
import type { RefusalCodeText } from '@/core/api/refusal';
import type { Currency } from '@/features/platform/types';

/**
 * The currency registry: what a row is made of, and what a refusal about one means.
 *
 * The panel that draws the registry used to hold all of this as a bag of strings
 * (`Record<string, string>` for both the edit form and the new-currency form) with
 * `Number(...)` calls scattered between the inputs and the request body. That shape
 * hides two things an operator depends on: which fields the registry even accepts,
 * and what the server does with a value it cannot type. Both are stated here
 * instead, against the route's own validation rules.
 *
 * Rates are measured against one base currency and entered by hand —
 * `MANUAL_ADMIN_RATE` — because nothing in this codebase fetches a rate from
 * anywhere. So a rate is only as good as the person who typed it, and a deal keeps
 * its own snapshot of the rate rather than re-reading this table later; that is why
 * the panel says what changing the base currency does to every other row.
 */

/** The fields a stored row lets an operator edit; identity and names are not among them. */
export interface CurrencyEdit {
  symbol: string;
  decimal_places: string;
  exchange_rate_to_base: string;
  is_active: '1' | '0';
}

/** A new row, registered from nothing, so its identity is asked for too. */
export interface CurrencyRegistration {
  iso_code: string;
  name_ar: string;
  name_en: string;
  symbol: string;
  decimal_places: string;
  exchange_rate_to_base: string;
}

export const EMPTY_REGISTRATION: CurrencyRegistration = {
  iso_code: '',
  name_ar: '',
  name_en: '',
  symbol: '',
  decimal_places: '2',
  exchange_rate_to_base: '',
};

/**
 * The starting box for an edit, before any row has been picked.
 *
 * A draft is always about one row, and the desk opens it by pressing «تعديل» on that
 * row, which fills this in from the stored values. It exists only so the form has a
 * shape before the first press rather than a nullable bag of fields the table has to
 * unwrap on every cell.
 */
export const EMPTY_EDIT: CurrencyEdit = {
  symbol: '',
  decimal_places: '2',
  exchange_rate_to_base: '',
  is_active: '1',
};

export function currencyEdit(currency: Currency): CurrencyEdit {
  return {
    symbol: currency.symbol,
    decimal_places: String(currency.decimal_places),
    exchange_rate_to_base: String(currency.exchange_rate_to_base),
    is_active: currency.is_active ? '1' : '0',
  };
}

/**
 * The edit as the route expects it: numbers as numbers, the flag as a boolean.
 *
 * `PUT /currencies/{id}` casts on its own rules — `decimal_places` is an integer
 * between 0 and 6 and the rate is numeric and at least 0.000001 — so a box left
 * empty arrives here as `0` and comes back as a field error. The panel does not
 * smooth that over: a rate of zero would silently rewrite every conversion
 * measured against it.
 */
export function currencyEditPayload(edit: CurrencyEdit): Record<string, unknown> {
  return {
    symbol: edit.symbol,
    decimal_places: Number(edit.decimal_places),
    exchange_rate_to_base: Number(edit.exchange_rate_to_base),
    is_active: edit.is_active === '1',
  };
}

/** The new row, sent whole: the registry has no default rate to fall back on. */
export function registrationPayload(draft: CurrencyRegistration): Record<string, unknown> {
  return {
    ...draft,
    decimal_places: Number(draft.decimal_places),
    exchange_rate_to_base: Number(draft.exchange_rate_to_base),
  };
}

/**
 * Why the registry said no, naming the field rather than the call.
 *
 * `order` is the sequence an operator reads the form in, so the first message
 * shown is the first box they would have had to fix. A validation failure arrives
 * per field in `error.details`, and the envelope's own line is the generic one.
 */
export function currencyProblem(result: ApiResult<Currency>, fields: string[], fallback: string): string {
  const codes: Record<string, RefusalCodeText> = {
    NOT_FOUND: 'العملة لم تعد في السجل؛ أعد القراءة قبل تعديلها.',
  };
  const named = fields.map((field) => fieldError(result, field)).find(Boolean);
  return named ?? explainRefusal(result, { fallback, codes });
}

/**
 * What becoming the base currency does, said after it happens.
 *
 * The route resets every other default, forces this row's rate to 1, marks it
 * `BASE_CURRENCY` and writes `platform.default_currency` — one action, four facts,
 * because a flag and a label that disagree make the platform quote in a currency it
 * does not convert from.
 */
export function baseCurrencyMessage(isoCode: string): string {
  return `${isoCode} الآن العملة الأساسية: سعرها صُوب إلى 1، وضُبطت قيمة platform.default_currency تلقائيًا.`;
}

/** The row's standing in the console's words; the default is a fact above active or not. */
export function currencyStatusLabel(currency: Currency): string {
  if (currency.is_default) return 'أساسية';
  return currency.is_active ? 'نشطة' : 'موقوفة';
}
