/**
 * The deployment: settings, flags, currencies, integration credentials, the audit
 * trail, and the reports read across every organization.
 *
 * Every path below is a route the server actually registers: `npm run check:api`
 * compares these modules against `php artisan route:list`, so a button here cannot
 * be wired to an endpoint that was never built. A call that must not run twice on a
 * retried click passes an `idempotencyKey`, and the transport that stamps it — the
 * token, the organization header, the envelope — is `src/core/api/http.ts`.
 */

import { getTenantId, getToken, idempotencyKey, qs, request } from '@/core/api/http';
import type { ApiResult } from '@/core/api/http';

import { getLocale } from '@/core/i18n';
import type { Organization } from '@/features/organizations/types';
import type { ApiKey, AuditLog, Currency, FeatureFlag, SalesSummary, SystemSetting, Webhook, WebhookDelivery } from '@/features/platform/types';

export async function getHealth() {
  return request<Record<string, any>>('/api/v1/health');
}

/**
 * Totals for the caller's scope. `from`/`to` window the deal's creation date —
 * the server echoes them back as `period_from`/`period_to`/`period_field`.
 */
export async function getSalesSummary(filters: { from?: string; to?: string } = {}) {
  return request<SalesSummary>('/api/v1/reports/sales-summary' + qs({ ...filters }));
}

/**
 * The deals export, fetched rather than linked.
 *
 * The route answers `auth:sanctum`, so an `<a href>` would arrive without the
 * bearer token and download a 401 page as a spreadsheet. Fetching also lets a
 * refused scope or a bad date read as a message instead of a broken file.
 */
export async function downloadDealsCsv(
  filters: { from?: string; to?: string } = {}
): Promise<{ ok: boolean; blob: Blob | null; filename: string | null; message: string | null; errorCode: string | null }> {
  const headers: Record<string, string> = {
    Accept: 'text/csv',
    'Accept-Language': getLocale(),
  };
  if (getToken()) headers['Authorization'] = `Bearer ${getToken()}`;
  if (getTenantId()) headers['X-Organization-Id'] = getTenantId().toString();
  const res = await fetch('/api/v1/reports/export/deals-csv' + qs({ ...filters }), { headers });
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as ApiResult | null;
    return {
      ok: false,
      blob: null,
      filename: null,
      message: json?.error?.message || json?.message || `تعذّر التصدير (${res.status})`,
      errorCode: json?.error_code || json?.error?.code || null,
    };
  }
  // The server names the file; keeping its name keeps the export's own
  // timestamp next to the report it came from.
  const declared = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') ?? '');
  return {
    ok: true,
    blob: await res.blob(),
    filename: declared?.[1] ?? 'hassal_deals.csv',
    message: null,
    errorCode: null,
  };
}

export async function getSettings(filters: { group?: string } = {}) {
  return request<SystemSetting[]>('/api/v1/settings' + qs({ ...filters }));
}

/** One key per call, as the endpoint accepts one key per call. */
export async function updateSetting(key: string, value: string | number | boolean) {
  return request<SystemSetting>('/api/v1/settings/update', {
    method: 'POST',
    body: { key, value: String(value) },
  });
}

export async function getFeatureFlags() {
  return request<FeatureFlag[]>('/api/v1/feature-flags');
}

export async function toggleFeatureFlag(key: string, is_enabled: boolean, rules_json?: Record<string, unknown>) {
  return request(`/api/v1/feature-flags/${encodeURIComponent(key)}/toggle`, {
    method: 'POST',
    body: { is_enabled, rules_json },
  });
}

export async function getCurrencies() {
  return request<Currency[]>('/api/v1/currencies');
}

export async function createCurrency(data: Record<string, unknown>) {
  return request<Currency>('/api/v1/currencies', {
    method: 'POST',
    body: data,
    idempotencyKey: idempotencyKey('cur'),
  });
}

export async function updateCurrency(id: number, data: Record<string, unknown>) {
  return request<Currency>(`/api/v1/currencies/${id}`, { method: 'PUT', body: data });
}

export async function setDefaultCurrency(id: number) {
  return request(`/api/v1/currencies/${id}/set-default`, { method: 'POST' });
}

export async function getSetupStatus() {
  return request<Record<string, any>>('/api/v1/setup-wizard/status');
}

export async function saveSetupConfiguration(data: Record<string, unknown>) {
  return request('/api/v1/setup-wizard/configure', { method: 'POST', body: data });
}

export async function getApiKeys() {
  return request<ApiKey[]>('/api/v1/api-keys');
}

/**
 * `secret` in the response is shown exactly once, by the server. The default
 * scope on the endpoint is `*`, so a screen that omits `scopes` is handing out
 * a full-access key — pass the narrowest set the integration needs.
 */
export async function createApiKey(data: { name: string; scopes?: string[]; expires_in_days?: number }) {
  return request<{ api_key: ApiKey; key_id: string; secret: string }>('/api/v1/api-keys', {
    method: 'POST',
    body: data,
    idempotencyKey: idempotencyKey('key'),
  });
}

export async function revokeApiKey(id: number) {
  return request(`/api/v1/api-keys/${id}`, { method: 'DELETE' });
}

export async function getWebhooks() {
  return request<Webhook[]>('/api/v1/webhooks');
}

/** The signing secret is generated server-side and returned once. */
export async function createWebhook(data: { endpoint_url: string; events: string[] }) {
  return request<Webhook>('/api/v1/webhooks', {
    method: 'POST',
    body: data,
    idempotencyKey: idempotencyKey('whk'),
  });
}

export async function getWebhookDeliveries(id: number, page?: number) {
  return request<WebhookDelivery[]>(`/api/v1/webhooks/${id}/deliveries` + qs({ page }));
}

export async function pingWebhook(id: number) {
  return request(`/api/v1/webhooks/${id}/ping`, { method: 'POST' });
}

export async function getAuditLogs(filters: {
  action?: string;
  auditable_type?: string;
  organization_id?: number;
  user_id?: number;
  page?: number;
} = {}) {
  return request<AuditLog[]>('/api/v1/audit-logs' + qs({ ...filters }));
}
