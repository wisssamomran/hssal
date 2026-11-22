import React, { useCallback, useEffect, useState } from 'react';
import { LifeBuoy, RefreshCw } from 'lucide-react';
import { BannerView, DecisionButton, ErrorNote, LabeledSelect, PanelShell, TextInput, recorded } from '@/shared/ui/panel';
import type { Banner } from '@/shared/ui/panel';
import { fieldError } from '@/core/api/http';
import type { ApiResult } from '@/core/api/http';
import { answerSupportTicket, createSupportTicket, getSupportQueue, getSupportSummary, getSupportTickets } from '@/features/support/api';
import type { SupportSummary, SupportTicket, SupportTicketCategory, SupportTicketStatus } from '@/features/support/types';
import { formatDateTime, getLocale } from '@/core/i18n';
import type { Locale } from '@/core/i18n';

/**
 * The complaint desk, from both sides of the counter.
 *
 * `SupportDeskView` is what a person sees: file a report about the platform, and
 * read the answers to the reports they already filed. `SupportQueuePanel` is the
 * same rows from the staff side — every report, oldest first, with the controls
 * that close one.
 *
 * The split matters more than either half. Filing needs no business permission
 * and is never gated on this screen: an account whose membership lapsed is still
 * an account that can see the app lost its data, and a desk that hides itself
 * from exactly the person standing in front of it is how "the platform is
 * unreachable" becomes the story. Answering is `support.manage`, which the
 * console only mounts for a holder — the route enforces it either way.
 *
 * Nothing here pretends to be a chat. One report, one thread, one answer, and a
 * number to quote (`SUP-00042`) that the server minted from the row itself.
 */

const CATEGORY_LABELS: Record<SupportTicketCategory, Record<Locale, string>> = {
  FUNCTIONAL_BUG: { ar: 'مشكلة في عمل الشاشة أو زر أو إجراء', en: 'A screen, button or action does not work' },
  WRONG_DATA: { ar: 'بيانات معروضة خطأ أو أرقام غير صحيحة', en: 'Wrong data or wrong figures on screen' },
  ACCOUNT_ACCESS: { ar: 'الدخول للحساب أو الجهاز أو الجلسة', en: 'Sign-in, device or session trouble' },
  LISTING_TRADE: { ar: 'عرض أو طلب شراء أو صفقة تعطلت', en: 'A listing, purchase request or deal is stuck' },
  SUGGESTION: { ar: 'اقتراح لتحسين المنصة', en: 'A suggestion for the platform' },
  OTHER: { ar: 'أمر آخر', en: 'Something else' },
};

const STATUS_LABELS: Record<SupportTicketStatus, Record<Locale, string>> = {
  open: { ar: 'بانتظار القراءة', en: 'Not yet read' },
  in_review: { ar: 'قيد المعالجة', en: 'Someone is on it' },
  resolved: { ar: 'تمت المعالجة', en: 'Resolved' },
  dismissed: { ar: 'انتهى بلا معالجة', en: 'Closed without action' },
};

const STATUS_TONES: Record<SupportTicketStatus, string> = {
  open: 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800',
  in_review: 'bg-sky-50 text-sky-900 border-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:border-sky-800',
  resolved: 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800',
  dismissed: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-hassal-raised dark:text-slate-300 dark:border-hassal-line',
};

/** The server's floor on a report; said before the send rather than after the refusal. */
const MIN_MESSAGE = 15;
const MAX_MESSAGE = 4000;

function categoryLabel(category: SupportTicketCategory, locale: Locale): string {
  return CATEGORY_LABELS[category]?.[locale] ?? category;
}

function statusPill(status: SupportTicketStatus, locale: Locale): React.ReactElement {
  return (
    <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_TONES[status] ?? STATUS_TONES.open}`}>
      {STATUS_LABELS[status]?.[locale] ?? status}
    </span>
  );
}

/**
 * What this browser can honestly say about itself.
 *
 * The server keeps five labelled keys and drops every other one, because
 * `context` is read by an agent as a fact about the software — text a client
 * invents is not that. So only the platform, the locale and the screen are sent,
 * and no version number is claimed here: nothing in this build reads one, and a
 * wrong one is worse than an absent one.
 */
function clientContext(screen: string, locale: Locale): Record<string, string> {
  return {
    platform: 'web',
    locale,
    ...(screen ? { screen_label: screen } : {}),
  };
}

const SupportTicketRow: React.FC<{ ticket: SupportTicket; locale: Locale; staff: boolean }> = ({ ticket, locale, staff }) => (
  <li className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2 dark:bg-hassal-raised dark:border-hassal-line">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200">{recorded(ticket.reference)}</span>
        {statusPill(ticket.status, locale)}
        <span className="min-w-0 text-[11px] text-slate-500 truncate dark:text-slate-400">
          {categoryLabel(ticket.category, locale)}
        </span>
      </div>
      <span className="text-[10px] text-slate-400 dark:text-slate-500">
        {formatDateTime(ticket.created_at, locale) || recorded(ticket.created_at)}
      </span>
    </div>

    <p className="text-xs leading-relaxed text-slate-800 whitespace-pre-line dark:text-slate-100">{ticket.message}</p>

    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500 dark:text-slate-400">
      {ticket.screen && <span className="font-mono">{ticket.screen}</span>}
      {ticket.context?.platform && <span>{ticket.context.platform}</span>}
      {staff && ticket.filed_by && <span>{locale === 'ar' ? 'المُبلِغ: ' : 'Filed by: '}{ticket.filed_by}</span>}
      {staff && ticket.organization_name && <span>{ticket.organization_name}</span>}
      {staff && ticket.answered_by && (
        <span>{locale === 'ar' ? `أجاب: ${ticket.answered_by}` : `Answered by: ${ticket.answered_by}`}</span>
      )}
    </div>

    {ticket.reply && (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 space-y-1 dark:border-emerald-800 dark:bg-emerald-950/40">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
          <LifeBuoy className="w-3 h-3" aria-hidden="true" />
          <span>{locale === 'ar' ? 'ردّ المنصة' : 'The platform’s answer'}</span>
          {ticket.answered_at && (
            <span className="font-normal text-emerald-700/80 dark:text-emerald-300/80">
              {formatDateTime(ticket.answered_at, locale)}
            </span>
          )}
        </div>
        <p className="text-xs leading-relaxed text-emerald-900 whitespace-pre-line dark:text-emerald-100">{ticket.reply}</p>
      </div>
    )}
  </li>
);

/* ───────────────────────────── the reporter's side ────────────────────────── */

interface SupportDeskViewProps {
  locale?: Locale;
  /** Where the person was when they gave up; sent as the report's `screen`. */
  screen?: string;
  screenLabel?: string;
  onNotify?: (message: string) => void;
}

export const SupportDeskView: React.FC<SupportDeskViewProps> = ({
  locale = getLocale(),
  screen = '',
  screenLabel = '',
  onNotify,
}) => {
  const [category, setCategory] = useState<SupportTicketCategory>('FUNCTIONAL_BUG');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<SupportTicketStatus | ''>('');
  const [sending, setSending] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  /** A field-level refusal from the server, printed under the box it belongs to. */
  const [messageError, setMessageError] = useState<string | undefined>(undefined);

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const result = await getSupportTickets({ ...(status ? { status } : {}), page });
    if (result.success) {
      // Appending rather than replacing: this list is read top-down for the
      // answer nobody has shown yet, and a page-2 fetch that wiped the first
      // twenty rows would hide the very reports a person is scrolling for.
      setTickets((previous) => (page === 1 ? (result.data ?? []) : [...previous, ...(result.data ?? [])]));
      setHasMore(Boolean(result.pagination?.has_more));
    } else {
      setTickets([]);
      setLoadError(result.message || (locale === 'ar' ? 'تعذّر تحميل بلاغاتك.' : 'Could not load your reports.'));
    }
    setLoading(false);
  }, [status, page, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const file = async () => {
    const text = message.trim();
    if (text.length < MIN_MESSAGE) {
      setMessageError(
        locale === 'ar'
          ? `اكتب ${MIN_MESSAGE} حرفًا على الأقل؛ وصفٌ أقصر من هذا لا يعرفه الموظف بما يكفي ليفتح الشاشة ويُنظر فيها.`
          : `A report needs at least ${MIN_MESSAGE} characters — shorter than that, nobody can find the screen.`
      );
      return;
    }

    setSending(true);
    setBanner(null);
    setMessageError(undefined);

    const result = await createSupportTicket({
      category,
      message: text,
      ...(screen ? { screen } : {}),
      context: clientContext(screenLabel || screen, locale),
    });
    setSending(false);

    if (result.success) {
      setMessage('');
      setBanner({
        kind: 'ok',
        text: locale === 'ar'
          ? `سُجّل بلاغك برقم ${result.data?.reference ?? ''}. الرد هنا وعلى إشعارات حسابك عند إغلاقه.`
          : `Reported as ${result.data?.reference ?? ''}. The answer appears here and in your notifications.`,
      });
      setPage(1);
      void load();
      onNotify?.(locale === 'ar' ? 'تم إرسال بلاغك للدعم' : 'Support report filed');
      return;
    }

    // One report pressed twice is refused, and the refusal carries the first
    // one's number — which is the only useful thing a duplicate can return.
    if (result.error_code === 'DUPLICATE_REPORT') {
      const reference = (result.error?.details as { reference?: string } | undefined)?.reference;
      setBanner({
        kind: 'warn',
        text: locale === 'ar'
          ? `هذا البلاغ مسجَّل قبلك برقم ${reference ?? ''}؛ لا حاجة لإرساله مرة أخرى.`
          : `You already filed this as ${reference ?? ''}; it does not need sending twice.`,
      });
      return;
    }

    setMessageError(fieldError(result, 'message'));
    setBanner({ kind: 'error', text: result.message || (locale === 'ar' ? 'رفض الخادم البلاغ.' : 'The server refused the report.') });
  };

  return (
    <div className="mx-auto max-w-4xl px-3 sm:px-6 lg:px-8 py-6 space-y-5">
      <PanelShell
        title={locale === 'ar' ? 'أبلغ عن مشكلة في المنصة' : 'Report a problem with the platform'}
        hint={
          locale === 'ar'
            ? 'هذا المكتب لمشاكل حَصّال نفسه: شاشة لا تعمل، رقم يُعرض خطأ، دخول مرفوض، عرضٌ تعطل. البلاغ يُحفظ باسمك وبرقمٍ تُراجع به، ولا يحتاج صلاحية في منشأتك — لأن إخبار المنصة بأنها مخطئة ليس شيئًا يُمنح لأحد ويُمنع عن آخر.'
            : 'This desk is for HASSAL itself: a screen that does not work, a figure shown wrong, a sign-in refused, a listing stuck. Filing needs no permission in your organization — telling the platform it is wrong is not something to be granted.'
        }
      >
        <div className="space-y-3">
          <LabeledSelect
            label={locale === 'ar' ? 'نوع المشكلة' : 'What kind of problem'}
            value={category}
            onChange={(value) => setCategory(value as SupportTicketCategory)}
            options={(Object.keys(CATEGORY_LABELS) as SupportTicketCategory[]).map((key) => ({
              value: key,
              label: CATEGORY_LABELS[key][locale],
            }))}
          />

          <TextInput
            label={locale === 'ar' ? 'ماذا حدث؟' : 'What happened?'}
            value={message}
            onChange={setMessage}
            placeholder={
              locale === 'ar'
                ? 'اذكر الشاشة والزر أو الإجراء، وما الذي ظهر بدل ما توقعت. لا تكتب رقم اعتمادك ولا كلمة مرورك في أي بلاغ.'
                : 'Name the screen and the action, and what appeared instead of what you expected. Never write a card number or a password into a report.'
            }
            multiline
            rows={5}
            wide
            error={messageError}
            help={
              locale === 'ar'
                ? `${message.trim().length}/${MAX_MESSAGE} — أقل عدد مفيد ${MIN_MESSAGE} حرفًا.`
                : `${message.trim().length}/${MAX_MESSAGE} — ${MIN_MESSAGE} characters is the shortest useful report.`
            }
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[10px] text-slate-400 dark:text-slate-500 min-w-0">
              {screen
                ? (locale === 'ar' ? `يُرفق موقعك في المنصة: ${screen}` : `Sent with the report: ${screen}`)
                : (locale === 'ar' ? 'هذا البلاغ بلا إشارة إلى شاشة؛ أرسله من الشاشة التي بها المشكلة إن أمكن.' : 'This report names no screen; file from the screen that has the problem if you can.')}
            </p>
            <DecisionButton onClick={() => { void file(); }} busy={sending || message.trim().length === 0} tone="primary">
              {locale === 'ar' ? 'إرسال البلاغ' : 'File the report'}
            </DecisionButton>
          </div>
        </div>

        <BannerView banner={banner} />
      </PanelShell>

      <PanelShell
        title={locale === 'ar' ? 'بلاغاتك وما رُدّ عليها' : 'Your reports and their answers'}
        hint={
          locale === 'ar'
            ? 'كل بلاغ برقمه. لا تُقرأ هنا بلاغات غيرك، ولا تُحذف بلاغاتك: ما يُغلق يبقى بقراره وردّه، لأن «أُغلق بلا سبب» لا يُبنى عليه شيء.'
            : 'Each report keeps its number. You see only your own, and closing one does not delete it — a report shut for no stated reason is worth nothing to the person who filed it.'
        }
      >
        <div className="flex flex-wrap items-end gap-3">
          <LabeledSelect
            label={locale === 'ar' ? 'تصفية بالحالة' : 'Filter by status'}
            value={status}
            onChange={(value) => { setStatus(value as SupportTicketStatus | ''); setPage(1); }}
            options={[
              { value: '', label: locale === 'ar' ? 'الكل' : 'All' },
              ...(Object.keys(STATUS_LABELS) as SupportTicketStatus[]).map((key) => ({
                value: key,
                label: STATUS_LABELS[key][locale],
              })),
            ]}
          />
          <button
            type="button"
            onClick={() => { setPage(1); void load(); }}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer dark:bg-hassal-raised dark:border-hassal-line dark:text-slate-100"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{locale === 'ar' ? 'تحديث' : 'Refresh'}</span>
          </button>
        </div>

        {loading && <p className="text-xs text-slate-400">{locale === 'ar' ? 'جارٍ التحميل…' : 'Loading…'}</p>}
        {loadError && <ErrorNote text={loadError} />}
        {!loading && !tickets.length && !loadError && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {locale === 'ar' ? 'لم تَبْلُغ عن شيء بعد. هذا ليس عيبًا في المنصة؛ هو يعني فقط أنك لم تحتج المكتب.' : 'No reports filed yet.'}
          </p>
        )}

        {!!tickets.length && (
          <ul className="space-y-2.5">
            {tickets.map((ticket) => (
              <SupportTicketRow key={ticket.id} ticket={ticket} locale={locale} staff={false} />
            ))}
          </ul>
        )}

        {hasMore && (
          <button
            type="button"
            onClick={() => setPage((current) => current + 1)}
            className="text-[11px] font-bold text-emerald-800 border border-emerald-200 rounded-lg px-3 py-1.5 hover:bg-emerald-50 cursor-pointer dark:text-emerald-300 dark:border-emerald-800"
          >
            {locale === 'ar' ? 'تحميل الأقدم' : 'Load older'}
          </button>
        )}
      </PanelShell>
    </div>
  );
};

/* ────────────────────────────── the staff queue ───────────────────────────── */

interface SupportQueuePanelProps {
  locale?: Locale;
  onNotify?: (message: string) => void;
}

/** The statuses an agent moves a report to; `open` is where the row starts, not a decision. */
const ANSWER_STATUSES: SupportTicketStatus[] = ['in_review', 'resolved', 'dismissed'];

export const SupportQueuePanel: React.FC<SupportQueuePanelProps> = ({ locale = getLocale(), onNotify }) => {
  const [status, setStatus] = useState<SupportTicketStatus | ''>('open');
  const [category, setCategory] = useState<SupportTicketCategory | ''>('');
  const [rows, setRows] = useState<SupportTicket[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [summary, setSummary] = useState<SupportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [replies, setReplies] = useState<Record<number, string>>({});
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [queue, counts] = await Promise.all([
      getSupportQueue({ ...(status ? { status } : {}), ...(category ? { category } : {}), page }),
      getSupportSummary(),
    ]);
    if (queue.success) {
      setRows(queue.data ?? []);
      setTotal(queue.pagination?.total_items ?? null);
    } else {
      setRows([]);
      setTotal(null);
      setLoadError(queue.message || (locale === 'ar' ? 'تعذّر تحميل البلاغات.' : 'Could not load the queue.'));
    }
    // The counts are a convenience, not a gate: a queue that would not open
    // because a summary call failed would hide reports somebody can still answer.
    if (counts.success && counts.data) setSummary(counts.data);
    setLoading(false);
  }, [status, category, page, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (ticket: SupportTicket, next: SupportTicketStatus) => {
    const reply = (replies[ticket.id] ?? '').trim();
    if ((next === 'resolved' || next === 'dismissed') && reply.length < 10) {
      setBanner({
        kind: 'error',
        text: locale === 'ar'
          ? 'لا يُغلق بلاغٌ بلا ردّ يُقرأ: أغلقته بلا جملةٍ واحدة يعني أن صاحب البلاغ لن يعرف ماذا حدث.'
          : 'A report cannot be closed without a reply — shutting one with nothing said leaves the filer without an answer.',
      });
      return;
    }

    setBusyId(ticket.id);
    setBanner(null);
    const result: ApiResult<SupportTicket> = await answerSupportTicket(ticket.id, {
      status: next,
      ...(reply ? { reply } : {}),
    });
    setBusyId(null);

    if (result.success) {
      setBanner({ kind: 'ok', text: result.message || (locale === 'ar' ? 'تم تحديث البلاغ' : 'Report updated') });
      setReplies((previous) => ({ ...previous, [ticket.id]: '' }));
      void load();
      onNotify?.(locale === 'ar' ? 'حُدِّث بلاغ الدعم' : 'Support ticket updated');
      return;
    }

    setBanner({
      kind: 'error',
      text: result.message || (locale === 'ar' ? 'رفض الخادم القرار.' : 'The server refused the decision.'),
    });
  };

  return (
    <PanelShell
      title={locale === 'ar' ? 'بلاغات الدعم عبر المنصة' : 'Support reports across the platform'}
      hint={
        locale === 'ar'
          ? 'كل بلاغ هنا وصل من حسابٍ في منشأةٍ ما، ويظهر باسم صاحبه لأن الرد يجب أن يصل إليه. الأقدم أولاً: قائمةٌ تُقرأ من أحدثها هي قائمةٌ يتقادم فيها الانتظار بصمت.'
          : 'Every row arrived from an account in some organization, and it names its author because an answer has to reach somebody. Oldest first: a queue read newest-first is a queue whose backlog ages in silence.'
      }
    >
      {/* Numbers the server counted, not this browser guessed. */}
      {summary && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(summary.by_status) as SupportTicketStatus[]).map((key) => (
            <div key={key} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-hassal-line dark:bg-hassal-raised">
              <div className="text-[10px] text-slate-500 dark:text-slate-400">{STATUS_LABELS[key][locale]}</div>
              <div className="text-sm font-black text-slate-900 dark:text-slate-100">{summary.by_status[key]}</div>
            </div>
          ))}
        </div>
      )}
      {summary && (
        <p className="text-[11px] text-slate-500 leading-relaxed dark:text-slate-400">
          {summary.awaiting_attention > 0
            ? (locale === 'ar'
                ? `${summary.awaiting_attention} بلاغًا بانتظار القراءة؛ أقدمها انتظر ${summary.oldest_open_minutes ?? 0} دقيقة.`
                : `${summary.awaiting_attention} awaiting attention; the oldest has waited ${summary.oldest_open_minutes ?? 0} minutes.`)
            : (locale === 'ar' ? 'لا بلاغ معلّق الآن.' : 'Nothing is waiting.')}
        </p>
      )}

      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
        <LabeledSelect
          label={locale === 'ar' ? 'الحالة' : 'Status'}
          value={status}
          onChange={(value) => { setStatus(value as SupportTicketStatus | ''); setPage(1); }}
          options={[
            { value: '', label: locale === 'ar' ? 'كل الحالات' : 'All statuses' },
            ...(Object.keys(STATUS_LABELS) as SupportTicketStatus[]).map((key) => ({
              value: key,
              label: STATUS_LABELS[key][locale],
            })),
          ]}
        />
        <LabeledSelect
          label={locale === 'ar' ? 'النوع' : 'Category'}
          value={category}
          onChange={(value) => { setCategory(value as SupportTicketCategory | ''); setPage(1); }}
          options={[
            { value: '', label: locale === 'ar' ? 'كل الأنواع' : 'All categories' },
            ...(Object.keys(CATEGORY_LABELS) as SupportTicketCategory[]).map((key) => ({
              value: key,
              label: CATEGORY_LABELS[key][locale],
            })),
          ]}
        />
        <button
          type="button"
          onClick={() => { setPage(1); void load(); }}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer dark:bg-hassal-raised dark:border-hassal-line dark:text-slate-100"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>{locale === 'ar' ? 'تحديث' : 'Refresh'}</span>
        </button>
      </div>

      <BannerView banner={banner} />
      {loadError && <ErrorNote text={loadError} />}

      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
        {total !== null
          ? (locale === 'ar' ? `${total} بلاغًا بالفلتر الحالي` : `${total} reports under this filter`)
          : (locale === 'ar' ? 'لم يردّ الخادم بعدد' : 'No count from the server yet')}
      </p>

      {loading && <p className="text-xs text-slate-400">{locale === 'ar' ? 'جارٍ التحميل…' : 'Loading…'}</p>}
      {!loading && !rows.length && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {locale === 'ar' ? 'لا بلاغات بهذه الحالة.' : 'No reports with this filter.'}
        </p>
      )}

      <ul className="space-y-3">
        {rows.map((ticket) => (
          <li key={ticket.id} className="space-y-2">
            <SupportTicketRow ticket={ticket} locale={locale} staff />
            <div className="px-1 space-y-2">
              <TextInput
                label={locale === 'ar' ? 'ردّك على صاحب البلاغ (مطلوب عند الإغلاق)' : 'Your reply to the reporter (required to close)'}
                value={replies[ticket.id] ?? ''}
                onChange={(value) => setReplies((previous) => ({ ...previous, [ticket.id]: value }))}
                placeholder={
                  locale === 'ar'
                    ? 'ما الذي سيُقرأ في إشعار صاحب البلاغ. لا رقم بطاقة ولا كلمة مرور ولا رابط داخلي.'
                    : 'What the filer will read in their notification.'
                }
                multiline
                rows={2}
                wide
              />
              <div className="flex flex-wrap items-center gap-1.5">
                {ANSWER_STATUSES.map((next) => (
                  <button
                    key={next}
                    type="button"
                    disabled={busyId === ticket.id}
                    onClick={() => { void decide(ticket, next); }}
                    className={`rounded-lg border px-3 py-1.5 text-[11px] font-bold cursor-pointer disabled:opacity-40 ${
                      next === 'resolved'
                        ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100 dark:bg-hassal-raised dark:border-hassal-line dark:text-slate-100'
                    }`}
                  >
                    {next === 'in_review'
                      ? (locale === 'ar' ? 'أنا أعالجه' : 'I am on it')
                      : next === 'resolved'
                        ? (locale === 'ar' ? 'تمت المعالجة' : 'Resolved')
                        : (locale === 'ar' ? 'انتهى بلا معالجة' : 'Dismissed')}
                  </button>
                ))}
                {ticket.status !== 'open' && (
                  <button
                    type="button"
                    disabled={busyId === ticket.id}
                    onClick={() => { void decide(ticket, 'open'); }}
                    className="rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-40 dark:border-hassal-line dark:text-slate-300"
                  >
                    {locale === 'ar' ? 'إعادة إلى المنتظرة' : 'Back to open'}
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2">
        {page > 1 && (
          <button type="button" onClick={() => setPage((p) => p - 1)} className="text-[11px] font-bold text-slate-600 cursor-pointer dark:text-slate-300">
            {locale === 'ar' ? 'السابق' : 'Previous'}
          </button>
        )}
        {rows.length > 0 && (
          <button type="button" onClick={() => setPage((p) => p + 1)} className="text-[11px] font-bold text-emerald-800 cursor-pointer dark:text-emerald-300">
            {locale === 'ar' ? 'التالي' : 'Next'}
          </button>
        )}
        <span className="text-[10px] text-slate-400 dark:text-slate-500">
          {locale === 'ar' ? `الصفحة ${page}` : `Page ${page}`}
        </span>
      </div>
    </PanelShell>
  );
};

export default SupportDeskView;
