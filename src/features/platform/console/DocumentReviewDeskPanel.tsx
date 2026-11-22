import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Check, Undo2 } from 'lucide-react';
import { BannerView, ErrorNote, LabeledSelect, PanelShell, TextInput, recorded } from '@/shared/ui/panel';
import { Banner } from '@/shared/ui/panel';
import { serverMessage } from '@/core/api/refusal';
import { getDocumentReviewQueue, getDocumentReviewSummary, reviewOrganizationDocument } from '@/features/organizations/api';
import { DocumentQueueRow, DocumentReviewSummary } from '@/features/organizations/types';
import { formatDateTime, getLocale } from '@/core/i18n';
import {
  DOCUMENT_FILTER_OPTIONS,
  ORGANIZATION_DOCUMENT_TYPE_LABELS,
  ORGANIZATION_DOCUMENT_TYPE_OPTIONS,
  DocumentDecision,
  DocumentState,
  DocumentUploadType,
  documentDecisionMessage,
  documentDecisionProblem,
  documentStatusLabel,
  organizationStatusLabel,
} from '@/features/organizations/review';

/**
 * Every paper every business has filed, in one queue.
 *
 * The organizations tab rules on a business as a whole ("may it trade?"). This
 * desk rules on a single copy — the commercial registration, the tax
 * certificate, one side of a national ID — across every business at once, which
 * is the only way a reviewer sees what is actually waiting. A paper accepted
 * here does not by itself open the market; `decideOrganizationVerification`
 * does. The two are shown apart so no one mistakes a filed copy for a traded
 * business.
 *
 * The headline numbers are the server's own counts (`document-summary`), taken
 * over the same rows the queue reads, never added up in the browser from one
 * page. A rejection carries a reason because a business that is not told which
 * paper failed resubmits the same one.
 */
export const DocumentReviewDeskPanel: React.FC<{ onNotify?: (m: string) => void }> = ({ onNotify }) => {
  const [status, setStatus] = useState<DocumentState>('pending');
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<DocumentQueueRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [summary, setSummary] = useState<DocumentReviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [reasons, setReasons] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [queue, counts] = await Promise.all([
      getDocumentReviewQueue({
        status: status || undefined,
        type: (type || undefined) as DocumentUploadType | undefined,
        search: search || undefined,
        per_page: 25,
      }),
      getDocumentReviewSummary(),
    ]);
    if (queue.success) {
      setRows(queue.data ?? []);
      setTotal(queue.pagination?.total_items ?? null);
    } else {
      setRows([]);
      setTotal(null);
      setLoadError(serverMessage(queue, 'لم ترد قائمة الوثائق من الخادم'));
    }
    if (counts.success) setSummary(counts.data ?? null);
    setLoading(false);
  }, [status, type, search]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (row: DocumentQueueRow, action: DocumentDecision) => {
    const reason = (reasons[row.id] ?? '').trim();
    const problem = documentDecisionProblem(action, reason);
    if (problem) {
      setBanner({ kind: 'error', text: problem });
      return;
    }
    setBusyId(row.id);
    setBanner(null);
    const result = await reviewOrganizationDocument(row.organization_id, row.id, {
      action,
      reason: action === 'reject' ? reason : undefined,
    });
    setBusyId(null);
    if (result.success) {
      setReasons((prev) => ({ ...prev, [row.id]: '' }));
      load();
      onNotify?.('تم تحديث قائمة الوثائق');
    }
    setBanner({
      kind: result.success ? 'ok' : 'error',
      text: documentDecisionMessage(result, 'سُجّل قرار الوثيقة'),
    });
  };

  return (
    <PanelShell
      title="مراجعة وثائق المنشآت"
      hint="كل نسخة رفعتها أي منشأة، في قائمة واحدة. القبول هنا إجراء على الورقة نفسها؛ ما يفتح السوق للمنشأة هو قرار «اعتماد للتداول» في تبويب المنشآت. المنصة لا تتصل بسجل رسمي ولا تدّعي تحققًا حكوميًا."
    >
      {summary && (
        <div className="space-y-2">
          <div className="text-[11px] font-bold text-slate-700">
            أرقامٌ عدّها الخادم على كل صفوف المراجعة — اضغط رقمًا لتفتح القائمة بتلك الحالة:
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {DOCUMENT_FILTER_OPTIONS.map((option) => {
              const tone =
                option.value === 'pending'
                  ? 'bg-amber-50 text-amber-900 border-amber-200'
                  : option.value === 'accepted'
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                    : 'bg-rose-50 text-rose-900 border-rose-200';
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStatus(option.value)}
                  className={`min-w-0 rounded-xl border px-3 py-2 text-right cursor-pointer ${tone} ${
                    status === option.value ? 'ring-2 ring-emerald-700/40' : ''
                  }`}
                >
                  <div className="text-lg font-black tabular-nums">
                    {summary.by_status[option.value]}
                  </div>
                  <div className="truncate text-[10px] font-bold" title={option.label}>
                    {option.label}
                  </div>
                </button>
              );
            })}
            <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
              <div className="text-lg font-black tabular-nums">
                {summary.organizations_with_pending_documents}
              </div>
              <div className="truncate text-[10px] font-bold" title="منشأة لديها وثيقة لم تُحسم">
                منشأة لديها وثيقة لم تُحسم
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <LabeledSelect
          label="حالة الوثيقة"
          value={status}
          onChange={(value) => setStatus(value as DocumentState)}
          options={DOCUMENT_FILTER_OPTIONS}
          /* Deliberately three states and no "كل الحالات": `reviewQueue()` answers the
             waiting papers when the filter is empty, so an all-states option would
             promise the archive and return the pending page under it. */
        />
        <LabeledSelect
          label="نوع الوثيقة"
          value={type}
          onChange={setType}
          options={[{ value: '', label: 'كل الأنواع' }, ...ORGANIZATION_DOCUMENT_TYPE_OPTIONS]}
        />
        <TextInput label="بحث" value={search} onChange={setSearch} placeholder="اسم المنشأة أو المرجع" />
        <div className="flex flex-col gap-1">
          <button
            onClick={load}
            className="flex w-full items-center justify-center gap-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg px-3 py-2 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>تحديث القائمة</span>
          </button>
          <span className="text-center text-[11px] font-medium text-slate-500">
            {total !== null ? `${total} وثيقة بالفلتر الحالي` : 'لم يردّ الخادم بعدد النتائج'}
          </span>
        </div>
      </div>

      <BannerView banner={banner} />
      {loadError && <ErrorNote text={loadError} />}

      <p className="text-[10px] text-slate-400 sm:hidden">اسحب الجدول أفقيًا لقراءة كل الأعمدة؛ عمود القرار آخرها.</p>
      <div className="min-w-0 border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-xs text-right">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
            <tr>
              <th className="p-3 min-w-0">الوثيقة</th>
              <th className="p-3 min-w-0">المنشأة</th>
              <th className="p-3 min-w-0">المرفوع</th>
              <th className="p-3 min-w-0">الانتظار</th>
              <th className="p-3 w-full min-w-0 text-left">القرار</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td colSpan={5} className="p-6 text-center text-slate-400">جارٍ التحميل…</td></tr>
            )}
            {!loading && !rows.length && (
              <tr><td colSpan={5} className="p-6 text-center text-slate-400">لا توجد وثائق بهذه الحالة الآن.</td></tr>
            )}
            {!loading && rows.map((row) => (
              <tr key={row.id} className="align-top hover:bg-slate-50/60">
                <td className="p-3 min-w-0">
                  <div className="font-bold text-slate-900">{ORGANIZATION_DOCUMENT_TYPE_LABELS[row.type] ?? row.type}</div>
                  <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                    {documentStatusLabel(row.status)} · #{row.id}
                  </div>
                  {row.reference_number && (
                    <div className="text-[11px] text-slate-500">مرجع: {row.reference_number}</div>
                  )}
                </td>
                <td className="p-3 min-w-0 text-slate-700">
                  {row.organization ? (
                    <>
                      <div className="font-bold text-slate-900">{row.organization.name_ar}</div>
                      <div className="text-[11px] text-slate-500">
                        {row.organization.type} · {organizationStatusLabel(row.organization.status)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        مقبول: {row.organization.accepted_types.length
                          ? row.organization.accepted_types
                              .map((t) => ORGANIZATION_DOCUMENT_TYPE_LABELS[t as keyof typeof ORGANIZATION_DOCUMENT_TYPE_LABELS] ?? t)
                              .join('، ')
                          : 'لا شيء بعد'}
                      </div>
                    </>
                  ) : (
                    <span className="text-slate-400">منشأة محذوفة</span>
                  )}
                </td>
                <td className="p-3 min-w-0 text-slate-700">
                  {recorded(row.uploaded_by_name)}
                  <div className="text-[11px] text-slate-500">
                    {row.uploaded_at ? formatDateTime(String(row.uploaded_at), getLocale()) || String(row.uploaded_at) : '—'}
                  </div>
                  {row.url && (
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1.5 inline-block rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 hover:underline"
                    >
                      فتح نسخة الوثيقة
                    </a>
                  )}
                </td>
                <td className="p-3 min-w-0 text-slate-700">
                  {row.status === 'pending' && row.waiting_hours != null ? (
                    <span className="whitespace-nowrap text-[11px] font-bold text-amber-700">
                      {Math.round(Number(row.waiting_hours))} ساعة انتظار
                    </span>
                  ) : row.status === 'pending' ? (
                    <span className="text-[11px] text-slate-400">—</span>
                  ) : (
                    <div className="text-[11px] text-slate-500">
                      {recorded(row.reviewed_by_name)}
                      {row.reviewed_at ? (
                        <div>{formatDateTime(String(row.reviewed_at), getLocale()) || String(row.reviewed_at)}</div>
                      ) : null}
                      {row.review_reason && <div className="text-slate-600 mt-0.5">{row.review_reason}</div>}
                    </div>
                  )}
                </td>
                <td className="p-3 w-full min-w-0">
                  <textarea
                    value={reasons[row.id] ?? ''}
                    onChange={(event) => setReasons((prev) => ({ ...prev, [row.id]: event.target.value }))}
                    placeholder="سبب الرفض (مطلوب عند الرفض فقط)"
                    rows={2}
                    className="w-full min-w-[10rem] mb-2 bg-slate-50 border border-slate-200 rounded-lg p-2 text-[11px] focus:bg-white focus:outline-none"
                  />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => decide(row, 'accept')}
                      disabled={busyId === row.id || row.status === 'accepted'}
                      className="bg-emerald-600 disabled:opacity-40 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>قبول</span>
                    </button>
                    <button
                      onClick={() => decide(row, 'reject')}
                      disabled={busyId === row.id || row.status === 'rejected'}
                      className="bg-white disabled:opacity-40 border border-slate-300 hover:bg-slate-100 text-slate-800 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>رفض</span>
                    </button>
                  </div>
                  {row.status !== 'pending' && (
                    <div className="text-[10px] text-slate-400 pt-1">هذه الوثيقة محسومة بالفعل؛ القرار يحدّثها إن لزم.</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PanelShell>
  );
};
