import type { ApiResult } from '@/core/api/http';
import { fieldError } from '@/core/api/http';
import { explainRefusal } from '@/core/api/refusal';
import type { RefusalCodeText } from '@/core/api/refusal';
import { formatMoney } from '@/core/config';
import type { Locale } from '@/core/i18n';
import { dealStatusLabel } from '@/features/trading/labels';
import type { DealStatus } from '@/features/trading/types';
import type { SalesSummary } from '@/features/platform/types';

/**
 * Reading the platform's deal report.
 *
 * Two rules live here rather than on the screen, and both are about honesty in a
 * number an operator will quote to someone else:
 *
 * 1. What a total counted. The payload carries `counted_statuses` as machine codes
 *    because the state machine speaks in codes; a report that prints `COMPLETED`
 *    asks the reader to know that vocabulary. The name comes from the trading
 *    module's own table, so the pipeline, the disputes desk and this report say the
 *    same state in the same words — and a code this build has never seen prints as
 *    itself instead of as a label invented for it.
 * 2. Which currency the money is in. `currency` is null when the operator has not
 *    configured a base currency, and the report prints bare numbers then. It does
 *    not borrow the client's cached base currency: a financial figure with a symbol
 *    nobody chose is worse than a figure that says it has no symbol.
 *
 * The refusals are the ones the routes actually answer (`permission:reports.view`,
 * and the shared organization-scope check), and the two date boxes are read first
 * because they are the fields an operator can fix without leaving the screen.
 */

/** The window an operator asked for; an empty box is no bound, not a zero date. */
export interface ReportWindow {
  from?: string;
  to?: string;
}

/** The two boxes as the query wants them. */
export function reportWindow(from: string, to: string): ReportWindow {
  return { from: from || undefined, to: to || undefined };
}

/** The report's own refusals, named the way a console can act on them. */
const REPORT_CODES: Record<string, RefusalCodeText> = {
  NO_ORGANIZATION_CONTEXT: 'لا سياق منشأة لهذا التقرير: اختر منشأة أو ادخل بصفة إشرافية على المنصة.',
  PERMISSION_DENIED: 'تقارير الصفقات صلاحية reports.view، ولا يملكها هذا الحساب ضمن منشأته.',
};

/** Why this report did not arrive, with the date boxes read first. */
export function reportProblem(result: ApiResult<SalesSummary>): string {
  const named = fieldError(result, 'from') ?? fieldError(result, 'to');
  return named ?? explainRefusal(result, { fallback: 'تعذّر توليد التقرير', codes: REPORT_CODES });
}

/**
 * The same refusal for the export, which answers its own envelope.
 *
 * `downloadDealsCsv` decodes the failure into a message and a code because a streamed
 * file has no `ApiResult` to hand back; the screen still must not read a refused
 * scope as «the download broke».
 */
export function exportProblem(result: { message: string | null; errorCode: string | null }): string {
  const reading = result.errorCode ? REPORT_CODES[result.errorCode] : undefined;
  if (typeof reading === 'string') return reading;
  return result.message ?? 'تعذّر تصدير الصفقات';
}

/**
 * The basis of the totals, in the reader's language.
 *
 * Joined as the sentence the panel prints under the numbers: «الأرقام محسوبة من
 * حالات: مكتملة». An empty list is a real case — a payload that counted nothing —
 * and says so rather than printing an empty set of brackets.
 */
export function countedStatusLabels(statuses: string[], locale: Locale): string {
  if (!statuses.length) return 'لا حالة';
  return statuses.map((status) => dealStatusLabel(status as DealStatus, locale)).join('، ');
}

/**
 * The field the window cut on, said as what it is.
 *
 * `created_at` on this report means the deal's creation, not its closure, and the
 * server names the column precisely so a reader can tell which one it was. A column
 * this module has not been told about stays as the column.
 */
export function periodFieldLabel(field: string): string {
  return field === 'created_at' ? 'تاريخ إنشاء الصفقة' : field;
}

/**
 * One money line from the report.
 *
 * The empty string is deliberate: it is what keeps `formatMoney` from falling back
 * to the client's cached base currency when the report itself says no currency is
 * configured. See the second rule above.
 */
export function reportAmount(value: number | null | undefined, currency: string | null): string {
  return formatMoney(value ?? 0, currency ?? '');
}
