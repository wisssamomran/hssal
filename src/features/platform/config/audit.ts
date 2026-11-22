import type { ApiResult } from '@/core/api/http';
import { fieldError } from '@/core/api/http';
import { explainRefusal } from '@/core/api/refusal';
import type { RefusalCodeText } from '@/core/api/refusal';
import type { AuditLog } from '@/features/platform/types';

/**
 * Reading the platform's audit trail.
 *
 * The trail has one refusal that is easy to mistake for an empty result:
 * `NO_ORGANIZATION_CONTEXT`. The route answers it when a caller who is not platform
 * staff asks without a business in context, and an operator who reads that as «لا
 * أحداث» stops looking. The screen therefore names the door that stayed shut rather
 * than the list it returned.
 *
 * The trail also carries a shape no other response does: `auditable_type` is a PHP
 * class name, because the audit writer stored what Laravel handed it. Showing it whole
 * is noise nobody can compare, and showing the platform's own translation of it would
 * be a claim about a record the console did not write — so the short name is printed
 * with the id, and the full string stays beside it for whoever has to match it against
 * a log line.
 */

/** Why this page of the trail did not arrive. */
export function auditReadProblem(result: ApiResult<AuditLog[]>): string {
  const codes: Record<string, RefusalCodeText> = {
    NO_ORGANIZATION_CONTEXT: 'لا سياق منشأة لهذا الطلب: اختر منشأة من أعلى الشاشة أو ادخل بصفة إشرافية على المنصة.',
    PERMISSION_DENIED: 'قراءة سجل الأحداث صلاحية audit.view، ولا يملكها هذا الحساب ضمن منشأته.',
  };
  const named =
    fieldError(result, 'organization_id') ??
    fieldError(result, 'action') ??
    fieldError(result, 'per_page');
  return named ?? explainRefusal(result, { fallback: 'تعذّر قراءة سجل الأحداث', codes });
}

/** The filtered fields, as the query the panel is about to build wants them. */
export interface AuditFilters {
  action: string;
  auditable_type: string;
  organization_id: string;
}

/**
 * The query string for one page of the trail.
 *
 * `organization_id` is sent only for a platform operator: the route scopes every
 * other caller to its own business, and a client that sends an id anyway is asking
 * for a row it cannot reach — the refusal it gets back would look like a bug in the
 * filter rather than the scope doing its job.
 */
export function auditQuery(
  filters: AuditFilters,
  isPlatform: boolean,
  page: number
): { action?: string; auditable_type?: string; organization_id?: number; page: number } {
  return {
    action: filters.action || undefined,
    auditable_type: filters.auditable_type || undefined,
    organization_id: isPlatform && filters.organization_id ? Number(filters.organization_id) : undefined,
    page,
  };
}

/**
 * A recorded row as one short line: the class the writer named, and the id it named.
 *
 * An empty type is a real case — a logged decision that concerns no row at all, such
 * as a route that refused — and it prints as «—» rather than as a name invented for it.
 */
export function auditableLabel(log: AuditLog): string {
  if (!log.auditable_type) return '—';
  const short = log.auditable_type.split('\\').pop() ?? log.auditable_type;
  return `${short} #${log.auditable_id ?? '—'}`;
}

/**
 * The action and entity names offered under the two filter boxes.
 *
 * Built from the page currently loaded, never from a list compiled into this file:
 * actions are written as "METHOD path" by the audit middleware and as constants by the
 * services that log a verdict, so any fixed set would drift away from what is stored
 * and invite an operator to filter on a name that matches nothing.
 */
export function knownAuditValues(logs: AuditLog[]): { actions: string[]; types: string[] } {
  return {
    actions: [...new Set(logs.map((log) => log.action))].sort(),
    types: [...new Set(logs.map((log) => log.auditable_type).filter(Boolean) as string[])].sort(),
  };
}
