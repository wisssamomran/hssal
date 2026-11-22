/**
 * The transport every feature's API module shares.
 *
 * This file holds what is true of *any* call — where the session token lives,
 * which headers go out, what an envelope looks like when it fails — and the name
 * of no particular endpoint. The routes live in `src/features/<module>/api.ts`,
 * one module per backend module, so "which file owns this call" has one answer.
 *
 * Every path in those modules maps to a route that exists on the server. The list
 * was taken from `php artisan route:list --path=api/v1`, not from what a screen
 * would like to believe. That constraint is deliberate: a method that points at a
 * missing endpoint looks identical to a working one until somebody clicks it, and
 * then the failure lands on a real buyer mid-purchase. So when a capability is not
 * wired on the server, there is no function for it there and the UI must say the
 * operation is unavailable rather than pretend.
 *
 * The clearest case of that rule being applied rather than admired: no module has
 * a payment, escrow or settlement function. The server has no such routes either —
 * HASSAL documents the trade and the two businesses settle it outside the
 * platform — so the screens have nothing to call and nothing to fake. What an
 * order *does* have is a delivery code, and both halves of it are in
 * `features/trading/api.ts`: reading it and spending it.
 *
 * Envelope (`App\Http\Responses\ApiResponse`):
 *   success   → { success, message, data, meta }
 *   paginated → { success, message, data: [...], pagination, meta }
 *   error     → { success: false, error_code, error: { code, message, details }, meta }
 */

import { getLocale, LOCALE_KEY, type Locale } from '@/core/i18n';

const TOKEN_KEY = 'hassal_auth_token';
const TENANT_KEY = 'hassal_active_tenant_id';
const DEVICE_KEY = 'hassal_signin_device_key';

/**
 * The session this browser holds, in memory and in `localStorage`.
 *
 * Module state rather than a class instance because there is exactly one of it
 * per tab, and a caller of `features/marketplace/api.ts` must not be able to hand
 * around a client that is signed in as somebody else.
 */
let token: string | null = null;
let tenantId: number | null = null;

if (typeof window !== 'undefined') {
  try {
    token = window.localStorage.getItem(TOKEN_KEY);
    const savedTenant = window.localStorage.getItem(TENANT_KEY);
    tenantId = savedTenant ? parseInt(savedTenant, 10) : null;
  } catch {
    token = null;
    tenantId = null;
  }
}

export function setToken(value: string | null) {
  token = value;
  if (typeof window !== 'undefined') {
    try {
      if (value) window.localStorage.setItem(TOKEN_KEY, value);
      else window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Memory state stays intact when storage is blocked.
    }
  }
}

export function getToken(): string | null {
  return token;
}

/**
 * Say which business the next calls act as.
 *
 * The header is cleared, not skipped, when there is none: a leftover id from a
 * previous session would silently attribute this person's actions to somebody
 * else's business.
 */
export function setTenantId(value: number | null) {
  tenantId = value;
  if (typeof window !== 'undefined') {
    try {
      if (value) window.localStorage.setItem(TENANT_KEY, value.toString());
      else window.localStorage.removeItem(TENANT_KEY);
    } catch {
      // Memory state stays intact when storage is blocked.
    }
  }
}

export function getTenantId(): number | null {
  return tenantId;
}

export function setLocale(locale: Locale) {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LOCALE_KEY, locale);
    } catch {
      // Ignore storage errors in restricted iframes.
    }
  }
}

/**
 * What this browser calls itself when it signs in (§4.17).
 *
 * The key is generated once and kept in `localStorage`, so a person who closes
 * the tab and comes back is the same device to the server rather than a new row
 * in their own list. `biometric_unlock` is always false here: a browser has no
 * platform prompt this client can call, and a field that claimed otherwise would
 * tell the account owner that a tab opens without a password when it does not.
 *
 * Sending it is optional on the server's side — a sign-in with no key records
 * nothing — so an older deployment ignores these three fields entirely.
 */
export function signInDeviceFields(): {
  device_key?: string;
  device_name?: string;
  device_platform?: 'web';
  biometric_unlock?: false;
} {
  if (typeof window === 'undefined') return {};
  try {
    let key = window.localStorage.getItem(DEVICE_KEY);
    if (!key) {
      key = `web_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)}`;
      window.localStorage.setItem(DEVICE_KEY, key);
    }
    return { device_key: key, device_name: 'متصفّح الويب', device_platform: 'web', biometric_unlock: false };
  } catch {
    // A private mode that refuses storage still signs in; it just does not
    // appear in the device list until it can remember its own name.
    return {};
  }
}

export interface Pagination {
  current_page: number;
  per_page: number;
  total_items: number;
  total_pages: number;
  has_more: boolean;
}

/** One decoded API response, whatever the server returned. */
export interface ApiResult<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  pagination?: Pagination;
  error_code?: string;
  /**
   * On a failure this carries `{ code, message, details }`, and `details` is
   * where validation errors live — keyed by field, each an array of messages.
   * There is no top-level Laravel `errors` object in this API's envelope.
   */
  error?: { code?: string; message?: string; details?: Record<string, string[]> };
  /**
   * Always `timestamp` + `correlation_id`; endpoints add their own facts here,
   * e.g. `in_catalog` on a settings write.
   */
  meta?: { timestamp?: string; correlation_id?: string } & Record<string, unknown>;
}

/** The first message the server sent for one field, or undefined. */
export function fieldError<T>(result: ApiResult<T>, field: string): string | undefined {
  const messages = result.error?.details?.[field];
  return Array.isArray(messages) ? messages[0] : undefined;
}

/** Turn a value into `undefined` so the query string stays clean. */
export function qs(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

/**
 * A key that survives a retried click but not a second, genuine action.
 * The server stores it with the response, so replaying a dropped request
 * returns the original result instead of taking stock twice.
 */
export function idempotencyKey(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Carry one request to the server and hand back its decoded envelope.
 *
 * Failures are returned, not thrown: a refusal is an answer the screen has to
 * render (a field error, a verification gate, a lost connection), and a caller
 * that had to wrap every call in `try` would end up showing one generic message
 * for all of them.
 */
export async function request<T = any>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    /**
     * Files go out as multipart, which is the one request shape this client
     * must not stamp `Content-Type: application/json` onto — the boundary is
     * generated by the browser and the server reads it to split the parts.
     */
    form?: FormData;
    headers?: Record<string, string>;
    idempotencyKey?: string;
  } = {}
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Language': getLocale(),
    ...(options.form ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
  };

  if (token) headers['Authorization'] = `Bearer ${token}`;
  // The active organization is a claim this client makes on every call; the
  // server re-checks membership rather than trusting it.
  if (tenantId) headers['X-Organization-Id'] = tenantId.toString();
  if (options.idempotencyKey) headers['X-Idempotency-Key'] = options.idempotencyKey;

  const res = await fetch(path, {
    method: options.method || 'GET',
    headers,
    body: options.form ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
  });

  const json = (await res.json().catch(() => null)) as ApiResult<T> | null;

  if (!res.ok || json?.success === false) {
    return {
      ...(json || {}),
      success: false,
      message:
        json?.error?.message ||
        json?.message ||
        `تعذّر تنفيذ الطلب (${res.status})`,
      error_code: json?.error_code || json?.error?.code,
    };
  }

  return json ?? { success: false, message: 'استجابة غير صالحة من الخادم' };
}
