import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { BannerView, DecisionButton, ErrorNote, PanelShell, TextInput } from '@/shared/ui/panel';
import type { Banner } from '@/shared/ui/panel';
import { formatDateTime, getLocale } from '@/core/i18n';
import { getAuditLogs } from '@/features/platform/api';
import type { AuditLog } from '@/features/platform/types';
import {
  auditQuery,
  auditReadProblem,
  auditableLabel,
  knownAuditValues,
  type AuditFilters,
} from './audit';

/**
 * What the platform recorded, in the order it recorded it.
 *
 * Read-only, and there is no write path to it: the trail's whole value is that nobody
 * editing a console can rewrite it. Every row says which action ran, on which record,
 * under whose account — the old and new values are stored but not listed here, because
 * a page of them would be a page nobody reads; the row that made the change is the
 * place its detail belongs.
 *
 * The two filter boxes are fed by the page currently loaded rather than by a list in
 * this file. Actions reach the trail two ways — "METHOD path" from the audit
 * middleware, a constant from a service logging a verdict — so any set compiled here
 * would be a guess about what is stored and would drift the first time a controller
 * records a new decision.
 *
 * Scope is the server's, not this screen's: a platform operator sees every business,
 * anyone else is held to the organization their request resolves to, and a request
 * that resolves to none is refused out loud rather than answered with an empty list.
 */
export const AuditPanel: React.FC<{ isPlatform: boolean }> = ({ isPlatform }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<{ total_items: number; total_pages: number } | null>(null);
  const [filters, setFilters] = useState<AuditFilters>({ action: '', auditable_type: '', organization_id: '' });
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);

  const load = useCallback(
    async (targetPage = page) => {
      setLoading(true);
      const result = await getAuditLogs(auditQuery(filters, isPlatform, targetPage));
      if (result.success) {
        setLogs(result.data ?? []);
        setMeta(
          result.pagination
            ? { total_items: result.pagination.total_items, total_pages: result.pagination.total_pages }
            : null
        );
        setPage(targetPage);
      } else {
        setBanner({ kind: 'error', text: auditReadProblem(result) });
      }
      setLoading(false);
    },
    [filters, page, isPlatform]
  );

  useEffect(() => {
    void load(1);
    // A filter change restarts the trail at its first page; the paging itself is the
    // operator's own click, so `load` is deliberately not a dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.action, filters.auditable_type, filters.organization_id]);

  const known = useMemo(() => knownAuditValues(logs), [logs]);

  return (
    <PanelShell
      title={isPlatform ? 'سجل الأحداث — كل المنشآت' : 'سجل الأحداث — منشأتك'}
      hint="الفلاتر تُطبَّق في الاستعلام نفسه، والقيم المطابقة لا في الواجهة. السجل خارج نطاق الحساب لا يُقرأ من هذه الشاشة، ومن دون سياق منشأة يردّ الخادم 403."
    >
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TextInput
          label="الحدث (كما سُجِّل)"
          value={filters.action}
          onChange={(value) => setFilters((current) => ({ ...current, action: value }))}
          placeholder="USER_ROLE_ASSIGNED أو POST api/v1/…"
          list="audit-actions"
        />
        <TextInput
          label="الكيان"
          value={filters.auditable_type}
          onChange={(value) => setFilters((current) => ({ ...current, auditable_type: value }))}
          placeholder="App\Models\User"
          list="audit-types"
        />
        {isPlatform ? (
          <TextInput
            label="معرّف المنشأة"
            value={filters.organization_id}
            onChange={(value) => setFilters((current) => ({ ...current, organization_id: value }))}
            placeholder="12"
          />
        ) : null}
        <datalist id="audit-actions">
          {known.actions.map((action) => (
            <option key={action} value={action} />
          ))}
        </datalist>
        <datalist id="audit-types">
          {known.types.map((type) => (
            <option key={type} value={type} />
          ))}
        </datalist>
        <div className="flex flex-col gap-1">
          <DecisionButton onClick={() => void load(page)} busy={loading}>
            <RefreshCw className="w-3.5 h-3.5" />
            تحديث السجل
          </DecisionButton>
          {/* Counted by the server for the filter applied, not by this page. */}
          <span className="text-center text-[11px] text-slate-500">
            {meta ? `${meta.total_items} حدث بالفلتر الحالي` : 'لم يردّ الخادم بعدد الأحداث'}
          </span>
        </div>
      </div>

      <BannerView banner={banner} />

      <p className="text-[10px] text-slate-400 sm:hidden">
        الاقتراحات تحت حقلَي الحدث والكيان تأتي من الصفحة المحمّلة حاليًا، لا من كل السجل.
      </p>
      <div className="min-w-0 overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-right text-xs">
          <thead className="bg-slate-50 text-[11px] font-black text-slate-700">
            <tr>
              <th className="px-3 py-2.5">الوقت</th>
              <th className="px-3 py-2.5">الحساب</th>
              <th className="px-3 py-2.5">الحدث</th>
              <th className="px-3 py-2.5">الكيان</th>
              {isPlatform ? <th className="px-3 py-2.5">المنشأة</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="px-3 py-2.5 text-[10px] text-slate-500 whitespace-nowrap">
                  {formatDateTime(log.created_at, getLocale()) || log.created_at}
                </td>
                <td className="px-3 py-2.5 min-w-0">{log.user?.name ?? 'غير مسجّل'}</td>
                <td className="px-3 py-2.5 min-w-0 font-bold text-slate-800 break-all">{log.action}</td>
                <td className="px-3 py-2.5 min-w-0 text-[10px] text-slate-600 break-all">
                  {/* The short class name and id; the name the writer stored stays
                      reachable in the element's own title for matching a log line. */}
                  <span title={log.auditable_type ?? undefined}>{auditableLabel(log)}</span>
                </td>
                {isPlatform ? (
                  <td className="px-3 py-2.5 min-w-0 text-[10px]">{log.organization?.name_ar ?? 'المنصة'}</td>
                ) : null}
              </tr>
            ))}
            {!loading && !logs.length ? (
              <tr>
                <td colSpan={isPlatform ? 5 : 4} className="px-3 py-6 text-center text-slate-500">
                  لا أحداث بهذه المعايير.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {meta && meta.total_pages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-slate-600">
            صفحة {page} من {meta.total_pages}
          </span>
          <div className="flex flex-1 items-center justify-end gap-2">
            <DecisionButton onClick={() => void load(Math.max(1, page - 1))} busy={loading}>
              السابق
            </DecisionButton>
            <DecisionButton onClick={() => void load(Math.min(meta.total_pages, page + 1))} busy={loading}>
              التالي
            </DecisionButton>
          </div>
        </div>
      ) : null}

      {!isPlatform ? (
        <ErrorNote text="هذه أحداث منشأتك أنت فقط؛ سجل بقية المنشآت لا يُقرأ بغير صفة إشرافية على المنصة." />
      ) : null}
    </PanelShell>
  );
};
