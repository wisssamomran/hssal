import React, { useCallback, useEffect, useState } from 'react';
import { MessageSquareWarning, RefreshCw, ShieldCheck, Flag } from 'lucide-react';
import { BannerView, DecisionButton, ErrorNote, Fact, LabeledSelect, PanelShell, recorded } from '@/shared/ui/panel';
import type { Banner } from '@/shared/ui/panel';
import { serverMessage } from '@/core/api/refusal';
import { getCommunityComments, getCommunityReports, getCommunitySummary, moderateComment, reviewCommunityReport } from '@/features/community/api';
import type { CommentReportReason, CommunityReport, CommunitySummary, ModeratedComment } from '@/features/community/types';
import { formatDateTime, getLocale } from '@/core/i18n';

/**
 * The reviewer's desk for public conversation on other businesses' listings.
 *
 * Two queues sit here because two different things arrive: words that were held
 * before anyone saw them (`pending`, when the operator turned on
 * `community.moderate_before_publishing`), and words that were published and
 * somebody then flagged (`reported`). A platform that only watched the first
 * queue would assume pre-moderation is always on, which is the operator's
 * setting and not this screen's fact.
 *
 * The counts come from `GET /community/summary`, which counts the same tables
 * the queues read — so a badge can never advertise work the queue it opens does
 * not contain (§47). The offer row beside each comment carries the seller's
 * legal numbers and the platform's status for that business, because a decision
 * about a question on a listing is made with the listing's owner in view.
 *
 * Removing a comment is a reason from the server's fixed vocabulary, never free
 * text: the same words are what the author sees if there is an appeal, and a
 * decision recorded as "سيئ" cannot be reviewed later by anyone.
 *
 * `community.moderate` is enforced at the route (§36). This panel only keeps the
 * console honest about what the signed-in account may decide.
 */

type CommentQueue = 'pending' | 'reported' | 'published' | 'removed';
type ReportQueue = 'open' | 'upheld' | 'dismissed';

const COMMENT_QUEUES: { value: CommentQueue; label: string }[] = [
  { value: 'pending', label: 'بانتظار النشر (حجز مسبق)' },
  { value: 'reported', label: 'بلاغات على تعليقات منشورة' },
  { value: 'published', label: 'المنشورة' },
  { value: 'removed', label: 'المزالة' },
];

const REPORT_QUEUES: { value: ReportQueue; label: string }[] = [
  { value: 'open', label: 'بلاغات لم تُحسم' },
  { value: 'upheld', label: 'بلاغات قُبِلت' },
  { value: 'dismissed', label: 'بلاغات رُفضت' },
];

/** `OfferComment::REASONS` — the server refuses anything outside this list. */
const MODERATION_REASONS: { value: CommentReportReason; ar: string }[] = [
  { value: 'spam', ar: 'رسائل مزعجة' },
  { value: 'off_topic', ar: 'خارج موضوع العرض' },
  { value: 'abusive', ar: 'إساءة' },
  { value: 'contact_info', ar: 'نشر بيانات تواصل' },
  { value: 'misleading', ar: 'معلومات مضللة' },
  { value: 'other', ar: 'سبب آخر' },
];

function reasonLabel(reason: string | undefined | null): string {
  if (!reason) return recorded(null);
  return MODERATION_REASONS.find((item) => item.value === reason)?.ar ?? reason;
}

export const CommunityModerationPanel: React.FC<{ onNotify?: (message: string) => void }> = ({
  onNotify,
}) => {
  const locale = getLocale();
  const [summary, setSummary] = useState<CommunitySummary | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

  const [queue, setQueue] = useState<CommentQueue>('pending');
  const [comments, setComments] = useState<ModeratedComment[]>([]);
  const [commentsTotal, setCommentsTotal] = useState<number | null>(null);
  const [commentsError, setCommentsError] = useState<string | null>(null);

  const [reportQueue, setReportQueue] = useState<ReportQueue>('open');
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [reportsTotal, setReportsTotal] = useState<number | null>(null);

  const [busyId, setBusyId] = useState<number | null>(null);
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [takeDown, setTakeDown] = useState<Record<number, boolean>>({});

  const loadComments = useCallback(async () => {
    setCommentsError(null);
    const result = await getCommunityComments({ status: queue, perPage: 25 });
    if (result.success) {
      setComments(result.data ?? []);
      setCommentsTotal(result.pagination?.total_items ?? null);
    } else {
      setComments([]);
      setCommentsTotal(null);
      setCommentsError(serverMessage(result, 'رفض الخادم الطلب'));
    }
  }, [queue]);

  const loadReports = useCallback(async () => {
    const result = await getCommunityReports({ status: reportQueue });
    if (result.success) {
      setReports(result.data ?? []);
      setReportsTotal(result.pagination?.total_items ?? null);
    } else {
      setReports([]);
      setReportsTotal(null);
      setBanner({ kind: 'error', text: serverMessage(result, 'رفض الخادم الطلب') });
    }
  }, [reportQueue]);

  const loadSummary = useCallback(async () => {
    const result = await getCommunitySummary();
    if (result.success && result.data) setSummary(result.data);
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const refresh = () => {
    void loadSummary();
    void loadComments();
    void loadReports();
  };

  const decide = async (comment: ModeratedComment, action: 'publish' | 'remove' | 'pending') => {
    const reason = reasons[comment.id] ?? '';
    if (action === 'remove' && !reason) {
      setBanner({ kind: 'error', text: 'الإزالة تحتاج سببًا من قائمة الأسباب؛ بلا سبب لا يُراجَع القرار بعد ذلك.' });
      return;
    }

    setBusyId(comment.id);
    setBanner(null);
    const result = await moderateComment(comment.id, {
      action,
      ...(action === 'remove' ? { reason: reason as CommentReportReason } : {}),
    });
    setBusyId(null);

    if (!result.success) {
      setBanner({ kind: 'error', text: serverMessage(result, 'رفض الخادم الطلب') });
      return;
    }

    setBanner({
      kind: 'ok',
      text: action === 'remove'
        ? 'تمت الإزالة. بقي السطر في سجل التعليقات بحالة «مزال» حتى لا تُعاد الكتابة على ما كُتب علنًا.'
        : result.message ?? 'تم تسجيل قرار المراجعة',
    });
    setReasons((prev) => ({ ...prev, [comment.id]: '' }));
    void loadComments();
    void loadSummary();
    onNotify?.('تم تحديث قائمة التعليقات');
  };

  const reviewReport = async (report: CommunityReport, action: 'upheld' | 'dismissed') => {
    const reason = reasons[report.id] ?? '';
    if (action === 'upheld' && !reason) {
      setBanner({ kind: 'error', text: 'قبول البلاغ يحتاج سبب الإزالة نفسه إذا نُزّلت التعليقة.' });
      return;
    }

    setBusyId(report.id);
    setBanner(null);
    const result = await reviewCommunityReport(report.id, {
      action,
      remove_comment: action === 'upheld' ? Boolean(takeDown[report.id]) : false,
      ...(action === 'upheld' ? { reason: reason as CommentReportReason } : {}),
    });
    setBusyId(null);

    if (!result.success) {
      setBanner({ kind: 'error', text: serverMessage(result, 'رفض الخادم الطلب') });
      return;
    }

    // Whether the comment came down is the server's answer, not this screen's
    // assumption: an upheld report without the checkbox decides the report and
    // leaves the words published.
    setBanner({
      kind: 'ok',
      text: action === 'upheld'
        ? result.data?.comment_status === 'removed'
          ? 'قُبل البلاغ وأُزيل التعليق.'
          : 'قُبل البلاغ. التعليق ما زال منشورًا لأن صندوق «إزالة التعليق» لم يُعلَّم.'
        : 'رُفض البلاغ وبقي التعليق كما هو.',
    });
    setReasons((prev) => ({ ...prev, [report.id]: '' }));
    void loadReports();
    void loadComments();
    void loadSummary();
  };

  return (
    <div className="space-y-5">
      <PanelShell
        title="ما ينتظر المراجعة"
        hint="الأعداد من `GET /community/summary` وتُحسب من الجداول التي تقرأها القوائم نفسها؛ لا تجمع هذه الشاشة إحصاءات ولا تُظهر ما لا يمكن فتحه."
      >
        <div className="flex flex-wrap items-end gap-3">
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg px-3 py-2 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>تحديث</span>
          </button>
          {!summary ? (
            <span className="text-xs text-slate-500">لم تُقرأ الأعداد بعد…</span>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 flex-1">
              <Fact label="عروض بانتظار النشر" value={String(summary.pending_offers)} />
              <Fact label="تعليقات محجوزة" value={String(summary.pending_comments)} />
              <Fact label="تعليقات عليها بلاغ" value={String(summary.reported_comments)} />
              <Fact label="بلاغات لم تُحسم" value={String(summary.open_reports)} />
              <Fact label="وثائق بانتظار القرار" value={String(summary.pending_documents)} />
              <Fact label="منشآت بانتظار الإذن" value={String(summary.pending_organizations)} />
            </div>
          )}
        </div>
      </PanelShell>

      <PanelShell
        title="تعليقات على العروض"
        hint="«بانتظار النشر» قائمة الحجز المسبق، و«بلاغات» هي التعليقات المنشورة التي رفعها أحد — فالمنصة قد تعمل بغير حجز مسبق وتحتاج أن ترى المبلَغ عنه لا المحجوز فقط. إزالة جذر لا تُزيل ردوده: كل سطر حُجز لسببه ويُقرر وحده."
      >
        <BannerView banner={banner} />

        <div className="flex flex-wrap items-end gap-3">
          <LabeledSelect
            label="القائمة"
            value={queue}
            onChange={(value) => setQueue(value as CommentQueue)}
            options={COMMENT_QUEUES}
          />
          {commentsTotal !== null && (
            <span className="text-[11px] text-slate-500 font-medium">{commentsTotal} تعليق بالفلتر الحالي</span>
          )}
        </div>

        {commentsError ? <ErrorNote text={`لم تُقرأ القائمة: ${commentsError}`} /> : null}

        {!comments.length && !commentsError ? (
          <div className="text-xs text-slate-500">لا شيء في هذه القائمة الآن.</div>
        ) : null}

        <div className="space-y-2">
          {comments.map((comment) => (
            <div key={comment.id} className="border border-slate-200 rounded-xl p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-[10px]">
                <span className="font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{comment.status}</span>
                {comment.report_count ? (
                  <span className="font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200 flex items-center gap-1">
                    <Flag className="w-3 h-3" /> {comment.report_count} بلاغ
                  </span>
                ) : null}
                {comment.is_seller_reply ? (
                  <span className="font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                    من البائع
                  </span>
                ) : null}
                <span className="text-slate-500">
                  {recorded(comment.author_name)} · {recorded(comment.organization?.name_ar)}
                </span>
                <span className="text-slate-400">
                  {comment.created_at ? formatDateTime(comment.created_at, locale) : recorded(null)}
                </span>
              </div>

              <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">{comment.body}</p>

              {comment.offer ? (
                <div className="text-[10px] text-slate-500">
                  على عرض: <span className="font-bold text-slate-700">{recorded(comment.offer.title_ar)}</span> · البائع{' '}
                  {recorded(comment.offer.seller_name_ar)} (حالة المنشأة{' '}
                  {recorded(comment.offer.seller_status)}) · سجل {recorded(comment.offer.seller_cr)} · ضريبي{' '}
                  {recorded(comment.offer.seller_vat)}
                </div>
              ) : null}

              {comment.reports?.length ? (
                <div className="space-y-1">
                  {comment.reports.map((report) => (
                    <div key={report.id} className="text-[10px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                      بلاغ: {reasonLabel(report.reason)} — {report.status}
                      {report.note ? ` — «${report.note}»` : ''}
                      {report.reported_by ? ` (بواسطة ${report.reported_by})` : ''}
                    </div>
                  ))}
                </div>
              ) : null}

              {comment.moderated_at ? (
                <div className="text-[10px] text-slate-400">
                  آخر قرار: {recorded(comment.moderator_name)} — {reasonLabel(comment.moderation_reason)} —{' '}
                  {formatDateTime(comment.moderated_at, locale)}
                </div>
              ) : null}

              <div className="flex flex-wrap items-end gap-2">
                <LabeledSelect
                  label="سبب الإزالة"
                  value={reasons[comment.id] ?? ''}
                  onChange={(value) => setReasons((prev) => ({ ...prev, [comment.id]: value }))}
                  options={[{ value: '', label: '—' }, ...MODERATION_REASONS.map((item) => ({ value: item.value, label: item.ar }))]}
                />
                <DecisionButton
                  tone="primary"
                  busy={busyId === comment.id}
                  onClick={() => void decide(comment, 'publish')}
                >
                  نشر
                </DecisionButton>
                <DecisionButton busy={busyId === comment.id} onClick={() => void decide(comment, 'pending')}>
                  إبقاء محجوزًا
                </DecisionButton>
                <DecisionButton busy={busyId === comment.id} onClick={() => void decide(comment, 'remove')}>
                  إزالة
                </DecisionButton>
              </div>
            </div>
          ))}
        </div>
      </PanelShell>

      <PanelShell
        title="البلاغات نفسها"
        hint="البلاغ رأي من منشأة على كلام منشأة أخرى؛ قبوله قرار مستقل عن تنزيل التعليق، ولهذا يبقى التعليق منشورًا إن قُبل البلاغ دون تعليم «إزالة التعليق». كل بلاغ يُحسم باسم من حسمه."
      >
        <div className="flex flex-wrap items-end gap-3">
          <LabeledSelect
            label="قائمة البلاغات"
            value={reportQueue}
            onChange={(value) => setReportQueue(value as ReportQueue)}
            options={REPORT_QUEUES}
          />
          {reportsTotal !== null && (
            <span className="text-[11px] text-slate-500 font-medium">{reportsTotal} بلاغ بالفلتر الحالي</span>
          )}
        </div>

        {!reports.length ? (
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>لا بلاغات في هذه القائمة.</span>
          </div>
        ) : null}

        <div className="space-y-2">
          {reports.map((report) => (
            <div key={report.id} className="border border-slate-200 rounded-xl p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-[10px]">
                <span className="font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{report.status}</span>
                <span className="text-slate-600">{reasonLabel(report.reason)}</span>
                <span className="text-slate-500">
                  مبلِّغ: {recorded(report.reporter?.name)} · من {recorded(report.organization?.name_ar)}
                </span>
                <span className="text-slate-400">
                  {report.created_at ? formatDateTime(report.created_at, locale) : recorded(null)}
                </span>
              </div>

              {report.note ? <p className="text-[11px] text-slate-600">«{report.note}»</p> : null}

              {report.comment ? (
                <div className="text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                    <MessageSquareWarning className="w-3 h-3" />
                    التعليق المبلَّغ عنه ({report.comment.status})
                  </div>
                  {report.comment.body}
                </div>
              ) : (
                <div className="text-[11px] text-slate-500">لم يعد التعليق الذي عليه هذا البلاغ موجودًا.</div>
              )}

              {report.reviewer?.name ? (
                <div className="text-[10px] text-slate-400">
                  حسمه: {report.reviewer.name}
                  {report.reviewed_at ? ` — ${formatDateTime(report.reviewed_at, locale)}` : ''}
                </div>
              ) : null}

              <div className="flex flex-wrap items-end gap-2">
                <LabeledSelect
                  label="سبب الإزالة"
                  value={reasons[report.id] ?? ''}
                  onChange={(value) => setReasons((prev) => ({ ...prev, [report.id]: value }))}
                  options={[{ value: '', label: '—' }, ...MODERATION_REASONS.map((item) => ({ value: item.value, label: item.ar }))]}
                />
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 pb-2">
                  <input
                    type="checkbox"
                    checked={Boolean(takeDown[report.id])}
                    onChange={(event) => setTakeDown((prev) => ({ ...prev, [report.id]: event.target.checked }))}
                    className="cursor-pointer"
                  />
                  <span>إزالة التعليق مع قبول البلاغ</span>
                </label>
                <DecisionButton
                  tone="primary"
                  busy={busyId === report.id}
                  onClick={() => void reviewReport(report, 'upheld')}
                >
                  قبول البلاغ
                </DecisionButton>
                <DecisionButton busy={busyId === report.id} onClick={() => void reviewReport(report, 'dismissed')}>
                  رفض البلاغ
                </DecisionButton>
              </div>
            </div>
          ))}
        </div>
      </PanelShell>
    </div>
  );
};
