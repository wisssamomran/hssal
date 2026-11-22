import { useEffect, useState } from 'react';

/**
 * Platform configuration for the client.
 *
 * Why this exists: the SPA used to print `ر.س`, default the buyer's city to
 * Riyadh and dial a +966 number from literals inside components. Those strings
 * are not facts about this platform — the currency, the launch city and the
 * tax treatment are operator settings, and a client that hardcodes them
 * silently contradicts whatever the admin console says.
 *
 * Everything here therefore comes from `GET /api/v1/bootstrap`. Nothing has a
 * compiled-in country. When a value has not arrived yet, the helpers say so
 * (`''`, `null`, or a bare amount with its ISO code) rather than inventing one
 * — an unconfigured field must look unconfigured.
 */

export interface PlatformCurrency {
  iso_code: string;
  name_ar?: string;
  name_en?: string;
  symbol?: string;
  decimal_places?: number;
  is_active?: boolean;
  is_default?: boolean;
}

export interface PlatformTaxConfig {
  enabled: boolean;
  name: string | null;
  rate: number;
  inclusive: boolean;
}

export interface OpportunityReason {
  code: string;
  label_ar: string;
  label_en: string;
}

export interface PlatformConfig {
  currencies: PlatformCurrency[];
  baseCurrency: string | null;
  /** ISO 3166 alpha-2 code the operator chose; null until it is configured. */
  country: string | null;
  defaultCity: string | null;
  /** Why a seller releases stock. The server owns this vocabulary. */
  opportunityReasons: OpportunityReason[];
  /** Ceiling the API accepts for nearby search; null means not yet read. */
  maxNearbyRadiusKm: number | null;
  tax: PlatformTaxConfig;
  commissionRate: number;
  reservationTimeoutMinutes: number | null;
  inspectionWindowHours: number | null;
  // The server sends `{ [key]: { key, name_ar, name_en, is_enabled } }`; a flat
  // boolean map is accepted too so the client is not tied to one serializer.
  featureFlags: Record<string, unknown>;
  /**
   * Every setting the platform marks public, as the flat keyed map
   * `GET /api/v1/bootstrap` answers with under
   * `platform_settings.public_configs`.
   *
   * Kept whole rather than folded into named fields because these are operator
   * settings: a new one becomes readable on the client without a code change
   * here, which is the point of it being a setting. Known keys get an accessor
   * below (`googleSignInSettings`) so components do not spell a key out.
   */
  publicConfigs: Record<string, unknown>;
  loaded: boolean;
}

const EMPTY_CONFIG: PlatformConfig = {
  currencies: [],
  baseCurrency: null,
  country: null,
  defaultCity: null,
  opportunityReasons: [],
  maxNearbyRadiusKm: null,
  tax: { enabled: false, name: null, rate: 0, inclusive: false },
  commissionRate: 0,
  reservationTimeoutMinutes: null,
  inspectionWindowHours: null,
  featureFlags: {},
  publicConfigs: {},
  loaded: false,
};

let current: PlatformConfig = { ...EMPTY_CONFIG };
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

/**
 * Fold a bootstrap payload into the store. Unrecognised shapes leave the
 * previous value alone so a failed refresh cannot blank the UI.
 */
export function applyBootstrapPayload(payload: unknown): void {
  if (!payload || typeof payload !== 'object') return;

  const body = payload as Record<string, any>;
  const settings = (body.platform_settings ?? {}) as Record<string, any>;
  const tax = (settings.tax ?? {}) as Record<string, any>;

  const currenciesRaw = Array.isArray(body.currencies) ? body.currencies : [];
  const currencies: PlatformCurrency[] = currenciesRaw
    .filter((row: any) => row && typeof row.iso_code === 'string')
    .map((row: any) => ({
      iso_code: String(row.iso_code).toUpperCase(),
      name_ar: row.name_ar ?? undefined,
      name_en: row.name_en ?? undefined,
      symbol: row.symbol ?? undefined,
      decimal_places: row.decimal_places === undefined || row.decimal_places === null
        ? undefined
        : Number(row.decimal_places),
      is_active: row.is_active === undefined ? true : Boolean(row.is_active),
      is_default: Boolean(row.is_default),
    }));

  const reasonsRaw = Array.isArray(body.opportunity_reasons) ? body.opportunity_reasons : [];
  const opportunityReasons: OpportunityReason[] = reasonsRaw
    .filter((row: any) => row && typeof row.code === 'string')
    .map((row: any) => ({
      code: String(row.code),
      label_ar: String(row.label_ar ?? row.code),
      label_en: String(row.label_en ?? row.code),
    }));

  const publicConfigs = (settings.public_configs ?? {}) as Record<string, any>;

  current = {
    currencies,
    baseCurrency: body.base_currency ? String(body.base_currency).toUpperCase() : null,
    country: body.country ? String(body.country).toUpperCase() : null,
    defaultCity: settings.default_city ?? body.default_city ?? null,
    opportunityReasons,
    maxNearbyRadiusKm: publicConfigs['geo.max_radius_km'] === undefined
      ? null
      : Number(publicConfigs['geo.max_radius_km']),
    tax: {
      enabled: Boolean(tax.enabled),
      name: tax.name ?? null,
      rate: Number(tax.rate ?? 0),
      inclusive: Boolean(tax.inclusive),
    },
    commissionRate: Number(settings.commission_rate ?? 0),
    reservationTimeoutMinutes: settings.reservation_timeout_minutes === undefined
      ? null
      : Number(settings.reservation_timeout_minutes),
    inspectionWindowHours: settings.inspection_window_hours === undefined
      ? null
      : Number(settings.inspection_window_hours),
    featureFlags: (body.feature_flags ?? {}) as Record<string, boolean>,
    publicConfigs,
    loaded: true,
  };

  emit();
}

export function resetPlatformConfig(): void {
  current = { ...EMPTY_CONFIG };
  emit();
}

export function getPlatformConfig(): PlatformConfig {
  return current;
}

/** React view onto the store, so money renders correctly once bootstrap lands. */
export function usePlatformConfig(): PlatformConfig {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const listener = () => setVersion((v) => v + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return current;
}

export function isFeatureEnabled(key: string): boolean {
  const flag = current.featureFlags[key];
  if (typeof flag === 'boolean') return flag;
  if (flag && typeof flag === 'object') return Boolean((flag as Record<string, unknown>).is_enabled);
  return false;
}

/** Active currencies the admin actually enabled, for pickers and fallbacks. */
export function activeCurrencies(): PlatformCurrency[] {
  return current.currencies.filter((c) => c.is_active !== false);
}

/**
 * The decimal precision and symbol of one currency code, resolved against the
 * registry the server sent. A code the platform does not know keeps its own
 * code as its suffix and two decimals — it is displayed as an unknown, not as
 * someone else's money.
 */
function currencyDisplay(isoCode: string | null | undefined): { symbol: string; decimals: number; iso: string | null } {
  const iso = isoCode ? String(isoCode).toUpperCase() : null;
  const match = iso ? current.currencies.find((c) => c.iso_code === iso) : undefined;
  const decimals = match?.decimal_places ?? 2;
  const fallbackLabel = iso ?? '';
  return { symbol: match?.symbol ?? fallbackLabel, decimals, iso };
}

/**
 * Format an amount as money. The currency comes from the argument, then from
 * the platform base currency — never from a literal in the calling component.
 */
export function formatMoney(
  amount: number | string | null | undefined,
  currencyCode?: string | null
): string {
  const numeric = typeof amount === 'string' ? Number(amount) : amount;
  if (numeric === null || numeric === undefined || Number.isNaN(numeric)) return '—';

  const { symbol, decimals, iso } = currencyDisplay(currencyCode ?? current.baseCurrency);
  const value = numeric.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  if (!symbol) return `${value}`;
  return `${value} ${symbol}`;
}

/**
 * A number from the API, or zero.
 *
 * Laravel sends decimals as strings and nulls for a value nobody recorded, and a
 * screen that adds them gets `NaN` or `"0.50.5"`. Every arithmetic display on this
 * app starts here rather than in a per-file `const num`, which is how three views
 * came to disagree about what a missing quantity means.
 */
export function num(value: unknown): number {
  return Number(value ?? 0);
}

/**
 * A stored rate as a percentage.
 *
 * The rates on a deal are fractions — 0.0500 is five percent — because that is how
 * they were agreed with the operator's settings. Percentages are only ever a
 * display concern, and this is the one place they become one.
 */
export function percent(value: unknown): string {
  return `${(num(value) * 100).toFixed(2)}%`;
}

/** The ISO code itself, for documents and selectors where a symbol is ambiguous. */
export function currencyLabel(currencyCode?: string | null): string {
  const iso = currencyCode ? String(currencyCode).toUpperCase() : (current.baseCurrency ?? '');
  const match = current.currencies.find((c) => c.iso_code === iso);
  if (!match) return iso || '—';
  const name = iso === match.iso_code && (match.name_ar || match.name_en)
    ? (match.name_ar || match.name_en)
    : '';
  return name ? `${iso} — ${name}` : iso;
}

/** Base currency code, or null when the operator has not chosen one yet. */
export function baseCurrency(): string | null {
  return current.baseCurrency;
}

/** The configured launch city, or null — callers must not substitute a capital. */
export function configuredCity(): string | null {
  return current.defaultCity;
}

/** Tax label + rate as configured, or null when tax is switched off. */
export function taxSummary(): { label: string; ratePercent: number; inclusive: boolean } | null {
  if (!current.tax.enabled || !(current.tax.rate > 0)) return null;
  return {
    label: current.tax.name ?? '',
    ratePercent: Number((current.tax.rate * 100).toFixed(4)),
    inclusive: current.tax.inclusive,
  };
}

/**
 * Inventory hold length. The reservation window is decided by the server at
 * reservation time; the client only echoes it, and echoes nothing when the
 * setting has not been read.
 */
export function reservationWindowMinutes(): number | null {
  return current.reservationTimeoutMinutes;
}

/**
 * Label for an opportunity reason code, from the server's own list. An
 * unknown code is shown as itself — the client does not invent a category a
 * seller could filter by but never receive.
 */
export function opportunityReasonLabel(code: string | null | undefined, locale: 'ar' | 'en'): string {
  if (!code) return '';
  const match = current.opportunityReasons.find((reason) => reason.code === code);
  if (!match) return code;
  return locale === 'en' ? match.label_en : match.label_ar;
}

/**
 * One public setting, exactly as the platform published it.
 *
 * The values arrive as strings from `system_settings` — a boolean row stores
 * `'1'` — so callers that want a boolean use `publicConfigFlag` rather than
 * testing this for truthiness: `'0'` is a truthy string.
 */
export function publicConfig(key: string): unknown {
  return current.publicConfigs[key];
}

/** The server's own reading of a boolean setting, applied on the client. */
export function publicConfigFlag(key: string): boolean {
  const value = current.publicConfigs[key];

  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    return trimmed === '1' || trimmed === 'true' || trimmed === 'on' || trimmed === 'yes';
  }

  return false;
}

export interface GoogleSignInSettings {
  /** The operator's switch. */
  enabled: boolean;
  /** The OAuth client ID issued to this deployment; public by design. */
  clientId: string;
  /**
   * Enabled *and* configured. `POST /auth/google` refuses both states
   * separately, and a button that would only produce a refusal is not a
   * feature — so this, not `enabled`, is what decides whether to draw one.
   */
  ready: boolean;
}

/**
 * Whether this deployment signs people in with Google, read from the platform's
 * published settings.
 *
 * Not a build-time constant and no key in the bundle: the client ID is an
 * administrator's setting (`auth.google_client_id`), so changing it — or
 * switching the whole door off — takes effect on the next bootstrap read
 * without a redeploy. There is no client secret anywhere in this app; an ID
 * token is verified server-side against Google's published keys.
 */
export function googleSignInSettings(): GoogleSignInSettings {
  const clientId = String(publicConfig('auth.google_client_id') ?? '').trim();
  const enabled = publicConfigFlag('auth.google_enabled');

  return { enabled, clientId, ready: enabled && clientId !== '' };
}

/**
 * How many businesses one account may found, or null when the listing has not
 * been read. 0 means "no ceiling" in the setting's own vocabulary, which the
 * server enforces; the client only ever uses this to phrase a hint.
 */
export function maxOrganizationsPerAccount(): number | null {
  const raw = publicConfig('account.max_organizations_per_account');
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * What the platform's state line says, in the reader's language.
 *
 * These two sentences sit on every screen of the app, and they are claims about the
 * deployment: that a capability is on, that a rate is what the operator configured.
 * They live here, beside the settings they are read from, for the same reason the
 * currency symbol does — a header that wrote its own version would be a second place
 * where «الضريبة ١٥٪» could be asserted without `tax.enabled` being true.
 *
 * There is no escrow branch in the capability line because there is no escrow
 * capability to branch on: `FlagCatalog` ships none, so a check of that key would read
 * "off" forever, and the sentence under it would be the only place in the app where a
 * customer could get the idea that HASSAL holds a price.
 */

/** Is the marketplace capability up right now? */
export function marketplaceCapabilityActive(): boolean {
  return isFeatureEnabled('marketplace');
}

/** Has the bootstrap response arrived? Flags being absent is not flags being off. */
export function capabilityFlagsRead(): boolean {
  return Object.keys(current.featureFlags ?? {}).length > 0;
}

/**
 * The tax treatment as configured, or the honest statement that there is none.
 * An installation that has not enabled tax must not display a rate it was never given.
 */
export function taxLine(locale: 'ar' | 'en', tax: ReturnType<typeof taxSummary>): string {
  if (!tax) return locale === 'en' ? 'Tax calculation is disabled for this installation' : 'احتساب الضريبة معطّل في هذه التهيئة';
  const rate = `${tax.ratePercent}%`;
  if (locale === 'en') {
    return tax.inclusive
      ? `${tax.label || 'Tax'} ${rate} — included in displayed prices`
      : `${tax.label || 'Tax'} ${rate} — added at checkout`;
  }
  const label = tax.label || 'الضريبة';
  return tax.inclusive ? `${label} ${rate} — مشمولة في الأسعار المعروضة` : `${label} ${rate} — تُضاف عند الطلب`;
}

/**
 * The capability sentence, and the colour that goes with it.
 *
 * The tone is part of the rule, not a styling choice left to the strip: an unread
 * state and a switched-off marketplace both warn, and a bar that rendered them calm
 * would say «all is well» about a platform it has not looked at.
 */
export function capabilityLine(
  locale: 'ar' | 'en',
  flagsRead = capabilityFlagsRead(),
  marketplaceActive = marketplaceCapabilityActive()
): { text: string; warning: boolean } {
  if (!flagsRead) {
    return { text: locale === 'en' ? 'Platform state not read yet' : 'لم تُقرأ حالة المنصة بعد', warning: true };
  }
  if (!marketplaceActive) {
    return {
      text: locale === 'en' ? 'Marketplace is off: listings and purchase requests are disabled' : 'قدرة السوق معطّلة: نشر العروض وطلبات الشراء معطّلان',
      warning: true,
    };
  }
  return {
    text: locale === 'en' ? 'Marketplace live — the platform holds no customer funds' : 'السوق يعمل، والمنصة لا تحتفظ بأموال العملاء',
    warning: false,
  };
}
