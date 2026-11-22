/*


*
 * The deployment rather than a transaction in it: settings, feature flags,
 * currencies, integration credentials, the audit trail, and the reports read
 * across every organization.
 *
 * These mirror what the endpoints actually return: statuses keep the server's uppercase
 * vocabulary, amounts arrive as decimal strings from MySQL, and any field the
 * platform only knows after a human entered it is nullable. When a component and
 * a type here disagree, the component is wrong.
 */

export interface SystemSetting {
  id: number;
  key: string;
  value: string | null;
  type: string;
  group: string;
  description_ar?: string | null;
  description_en?: string | null;
  default_value?: string | null;
  is_editable: boolean;
  is_public: boolean;
  organization_id?: number | null;
}

export interface AuditLog {
  id: number;
  organization_id?: number | null;
  user_id?: number | null;
  action: string;
  auditable_type?: string | null;
  auditable_id?: number | null;
  ip_address?: string | null;
  user_agent?: string | null;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  created_at: string;
  user?: { id: number; name: string; email: string } | null;
  organization?: { id: number; name_ar: string; name_en: string } | null;
}

/**
 * A currency the platform can price in. `exchange_rate_to_base` is an admin
 * entry unless `rate_source` says otherwise, so a converted amount is only as
 * trustworthy as that row — and a deal keeps its own snapshot of the rate
 * rather than re-reading this table later.
 */
export interface Currency {
  id: number;
  iso_code: string;
  name_ar: string;
  name_en: string;
  symbol: string;
  decimal_places: number;
  exchange_rate_to_base: string;
  rate_source?: string | null;
  rate_updated_at?: string | null;
  rate_updated_by_user_id?: number | null;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

/** One installed capability. Off means the routes answer 503, not that the UI hid them. */
export interface FeatureFlag {
  id: number;
  key: string;
  name_ar: string;
  name_en: string;
  description_ar?: string | null;
  description_en?: string | null;
  is_enabled: boolean;
  rules_json?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/**
 * Credentials for an integration. The secret is returned once by the create
 * call and stored only as a hash afterwards. Note that no request path
 * authenticates a key yet, which is why the `api_keys` capability ships off.
 */
export interface ApiKey {
  id: number;
  organization_id: number;
  name: string;
  key_id: string;
  scopes: string[];
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  last_used_at?: string | null;
  expires_at?: string | null;
  created_at: string;
}

/** A signed outbound event subscription. */
export interface Webhook {
  id: number;
  organization_id: number;
  endpoint_url: string;
  events: string[];
  is_active: boolean;
  failure_count: number;
  last_triggered_at?: string | null;
  created_at: string;
  /** Only present in the create response; never readable afterwards. */
  secret?: string;
  deliveries_count?: number;
}

/** One attempt to hand an event to a webhook endpoint. */
export interface WebhookDelivery {
  id: number;
  webhook_id: number;
  event_name: string;
  event_id: string;
  /**
   * BLOCKED means the endpoint resolved to an address this server refuses to
   * post to; the delivery was never attempted, which is not the same as a
   * receiver answering badly.
   */
  status: 'PENDING' | 'DELIVERED' | 'FAILED' | 'BLOCKED' | string;
  response_status?: number | null;
  response_body?: string | null;
  attempt?: number;
  last_error?: string | null;
  delivered_at?: string | null;
  created_at: string;
}

/**
 * `GET /reports/sales-summary`.
 *
 * `counted_statuses` is in the payload on purpose, so a number on a screen can be
 * checked against the states that produced it. And the commission is named
 * `accrued`, never `collected`: the platform earns it when an order closes, and
 * the transfer that pays it happens outside this system — a report that said
 * "collected" would claim to have seen money it has never seen.
 */
export interface SalesSummary {
  total_deals_count: number;
  completed_deals_count: number;
  counted_statuses: string[];
  gross_merchandise_value: number;
  platform_commission_accrued: number;
  period_from: string | null;
  period_to: string | null;
  /** Which date the window cut on — the server answers `created_at`. */
  period_field: string;
  currency: string | null;
  generated_at: string;
}
