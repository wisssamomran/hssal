import React, { useCallback, useEffect, useState } from 'react';
import { Heart, MessageCircle, Send } from 'lucide-react';
import type { ApiResult } from '@/core/api/http';
import { commentOnOffer, deleteOfferComment, getLikedOfferIds, getOfferComments, likeOffer, reportOfferComment, unlikeOffer } from '@/features/community/api';
import type { CommentReportReason, OfferComment } from '@/features/community/types';
import type { Offer } from '@/features/marketplace/types';
import { refusalWithGate } from '@/features/organizations/api';
import { formatDateTime, getLocale } from '@/core/i18n';

/**
 * Interest and questions on a listing.
 *
 * Two honest limits shape everything here:
 *
 *   1. There is no rating. A heart is one named business saying "I am looking
 *      at this", and `likes_count` is how many said it. No star, score or
 *      "popular" verdict is computed anywhere in this product, so none is shown.
 *   2. Whether the caller already liked a listing is not in the offer list —
 *      that endpoint answers identically signed in or not. `useOfferCommunity`
 *      reads `GET /marketplace/liked-offers` once and fills the buttons in from
 *      there, so a card cannot show a filled heart that the server disagrees
 *      with.
 *
 * Both actions are refused before platform staff review the business's papers.
 * The refusal is rendered rather than hidden, because a button that silently
 * does nothing teaches people the platform is lying about the gate.
 */

const REPORT_REASONS: { value: CommentReportReason; ar: string; en: string }[] = [
  { value: 'spam', ar: 'رسائل مزعجة', en: 'Spam' },
  { value: 'off_topic', ar: 'خارج موضوع العرض', en: 'Off topic' },
  { value: 'abusive', ar: 'إساءة', en: 'Abusive' },
  { value: 'contact_info', ar: 'نشر بيانات تواصل', en: 'Contact details' },
  { value: 'misleading', ar: 'معلومات مضللة', en: 'Misleading' },
  { value: 'other', ar: 'سبب آخر', en: 'Other' },
];

/**
 * A community refusal, with the checklist it came with.
 *
 * The wording — including the verification checklist, which every surface that
 * writes as a business can be refused by — belongs to `refusalWithGate`; this is the
 * screen's own fallback sentence for a response that carried neither a message nor
 * a code.
 */
function refusalOf(result: ApiResult<unknown>): string {
  return refusalWithGate(result, { fallback: 'رفض الخادم الطلب' });
}

/**
 * The caller's own likes, per person across every company they work for —
 * including the account that works for none: a consumer's list is theirs.
 *
 * A guest gets no request at all: the route is `auth:sanctum`, so fetching
 * would only produce a 401 the UI then has to explain away.
 */
export function useOfferCommunity(signedIn: boolean, personaKey: string) {
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!signedIn) {
      setLikedIds(new Set());
      return;
    }
    const result = await getLikedOfferIds();
    if (result.success && Array.isArray(result.data?.offer_ids)) {
      setLikedIds(new Set(result.data.offer_ids.map(Number)));
    }
    // A refused read leaves the set empty: buttons then offer to like, and the
    // server's answer is what stops anyone who genuinely may not.
  }, [signedIn]);

  useEffect(() => {
    void reload();
  }, [reload, personaKey]);

  /**
   * Toggle and take the count from the server's answer rather than adjusting
   * the one on the card, so two browsers pointed at the same listing converge
   * on the same number.
   */
  const toggleLike = async (offer: Offer): Promise<number | null> => {
    setBusyId(offer.id);
    setNotice(null);

    const already = likedIds.has(offer.id);
    const result = already ? await unlikeOffer(offer.id) : await likeOffer(offer.id);
    setBusyId(null);

    if (!result.success) {
      setNotice(refusalOf(result));
      return null;
    }

    const count = Number(result.data?.likes_count ?? 0);
    setLikedIds((previous) => {
      const next = new Set(previous);
      if (already) next.delete(offer.id);
      else next.add(offer.id);
      return next;
    });
    return count;
  };

  return { likedIds, busyId, notice, toggleLike, clearNotice: () => setNotice(null), reload };
}

export const OfferLikeButton: React.FC<{
  offer: Offer;
  liked: boolean;
  busy: boolean;
  onToggle: () => void;
  /** The count the server last answered for this listing, if it was counted. */
  count?: number;
  /** A guest sees the same count but is invited to sign in before recording interest. */
  signedIn?: boolean;
}> = ({ offer, liked, busy, onToggle, count, signedIn = true }) => (
  <button
    type="button"
    onClick={onToggle}
    disabled={busy}
    aria-pressed={liked}
    className={`text-[11px] font-bold px-2.5 py-2 rounded-lg border flex items-center gap-1.5 transition-colors disabled:opacity-40 ${
      liked
        ? 'bg-rose-50 border-rose-300 text-rose-800'
        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
    }`}
    title={!signedIn
      ? 'سجّل الدخول بمنشأتك لتسجيل الاهتمام'
      : liked ? 'إلغاء تسجيل الاهتمام بمنشأتك' : 'تسجيل أن منشأتك مهتمة بهذا العرض'}
  >
    <Heart className={`w-3.5 h-3.5 ${liked ? 'fill-rose-600 text-rose-600' : ''}`} />
    <span>{!signedIn ? 'اهتمام' : liked ? 'مهتم' : 'اهتمام'}</span>
    {count !== undefined ? <span className="text-slate-500">{count}</span> : null}
  </button>
);

/**
 * The public thread on one listing.
 *
 * Every row names its author and their business, and a comment written by the
 * selling company carries its badge — a buyer has to be able to tell an answer
 * from a rumour. With pre-moderation switched on the server answers `pending`
 * and says when it will appear; that message is shown verbatim instead of a
 * locally written "تم النشر".
 */
export const OfferThread: React.FC<{
  offer: Offer;
  signedIn: boolean;
  onCountChange?: (count: number) => void;
}> = ({ offer, signedIn, onCountChange }) => {
  const locale = getLocale();
  const ar = locale === 'ar';
  const [comments, setComments] = useState<OfferComment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<OfferComment | null>(null);
  const [posting, setPosting] = useState(false);
  const [reporting, setReporting] = useState<OfferComment | null>(null);
  const [reportReason, setReportReason] = useState<CommentReportReason>('spam');
  const [reportNote, setReportNote] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const result = await getOfferComments(offer.id);
    setLoaded(true);
    if (result.success) {
      const rows = result.data?.comments ?? [];
      setComments(rows);
      onCountChange?.(rows.reduce((total, row) => total + 1 + (row.replies?.length ?? 0), 0));
    } else {
      setError(refusalOf(result));
    }
    // onCountChange is a parent callback; including it would refetch forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const post = async () => {
    if (body.trim().length < 2) {
      setNotice(ar ? 'اكتب سؤالًا من حرفين على الأقل.' : 'Write at least two characters.');
      return;
    }

    setPosting(true);
    setNotice(null);

    const result = await commentOnOffer(offer.id, {
      body: body.trim(),
      // Whichever row was answered is enough: the server flattens a reply to a
      // reply onto the question itself, so the client never has to know depth.
      parent_id: replyTo?.id,
    });

    setPosting(false);

    if (!result.success) {
      setNotice(refusalOf(result));
      return;
    }

    setBody('');
    setReplyTo(null);
    // The server's message carries the moderation state, which the client
    // cannot know: published now, or queued for a reviewer.
    setNotice(result.message ?? null);
    void load();
  };

  const withdraw = async (comment: OfferComment) => {
    setNotice(null);
    const result = await deleteOfferComment(comment.id);
    if (!result.success) setNotice(refusalOf(result));
    else setNotice(result.message ?? null);
    void load();
  };

  const report = async (comment: OfferComment) => {
    setNotice(null);
    const result = await reportOfferComment(comment.id, {
      reason: reportReason,
      note: reportNote || undefined,
    });
    setReporting(null);
    setReportNote('');
    setNotice(result.success
      ? result.message ?? 'سُجّل البلاغ'
      : refusalOf(result));
    void load();
  };

  const renderRow = (comment: OfferComment, isReply: boolean) => (
    <li key={comment.id} className={`${isReply ? 'ms-6 border-slate-100' : 'border-slate-200'} border rounded-lg p-2.5 space-y-1`}>
      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        {comment.identity_hidden ? (
          <>
            {/* The server dropped these fields because the seller asked for this
                listing to carry no name; their answer underneath it would
                otherwise hand the name back one line lower. */}
            <span className="font-bold text-slate-500 italic">
              {ar ? 'البائع أخفى اسمه في هذا العرض' : 'The seller withholds their name on this listing'}
            </span>
          </>
        ) : (
          <>
            <span className="font-bold text-slate-800">{comment.author_name ?? 'غير مسجل'}</span>
            <span className="text-slate-500">{comment.organization_name ?? ''}</span>
          </>
        )}
        {comment.is_seller_reply ? (
          <span className="rounded bg-emerald-50 border border-emerald-200 text-emerald-900 px-1.5 py-0.5 font-bold">
            {ar ? 'من البائع' : 'From the seller'}
          </span>
        ) : null}
        {comment.created_at ? <span className="text-slate-400">{formatDateTime(comment.created_at, locale)}</span> : null}
        {comment.report_count ? (
          <span className="text-amber-700 font-bold">
            {ar ? `بلاغات: ${comment.report_count}` : `reports: ${comment.report_count}`}
          </span>
        ) : null}
      </div>

      <p className="text-[11px] text-slate-700 leading-relaxed whitespace-pre-line">{comment.body}</p>

      <div className="flex flex-wrap items-center gap-2 text-[10px]">
        {!isReply && signedIn ? (
          <button
            type="button"
            onClick={() => { setReplyTo(comment); setNotice(null); }}
            className="font-bold text-slate-600 hover:text-slate-900"
          >
            {ar ? 'رد' : 'Reply'}
          </button>
        ) : null}
        {signedIn ? (
          <button
            type="button"
            onClick={() => { setReporting(comment); setNotice(null); }}
            className="font-bold text-slate-500 hover:text-amber-800"
          >
            {ar ? 'إبلاغ' : 'Report'}
          </button>
        ) : null}
        {signedIn ? (
          <button
            type="button"
            onClick={() => void withdraw(comment)}
            className="font-bold text-slate-500 hover:text-rose-800"
          >
            {ar ? 'سحب' : 'Withdraw'}
          </button>
        ) : null}
      </div>

      {reporting?.id === comment.id ? (
        <div className="mt-2 border border-amber-200 bg-amber-50 rounded-lg p-2 space-y-2">
          <p className="text-[10px] text-amber-900">
            {ar
              ? 'البلاغ يصل فريق المنصة مع السبب؛ لا يحذف التعليق بصاحبه — الحذف قرار مراجع.'
              : 'A report reaches platform staff with its reason; it does not delete anything by itself.'}
          </p>
          <select
            value={reportReason}
            onChange={(event) => setReportReason(event.target.value as CommentReportReason)}
            className="w-full bg-white border border-amber-300 rounded-lg px-2 py-1.5 text-[11px]"
          >
            {REPORT_REASONS.map((reason) => (
              <option key={reason.value} value={reason.value}>{ar ? reason.ar : reason.en}</option>
            ))}
          </select>
          <input
            value={reportNote}
            onChange={(event) => setReportNote(event.target.value)}
            placeholder={ar ? 'تفصيل اختياري' : 'Optional note'}
            className="w-full bg-white border border-amber-300 rounded-lg px-2 py-1.5 text-[11px]"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void report(comment)}
              className="text-[10px] font-bold text-white bg-amber-700 rounded-lg px-2.5 py-1.5 hover:bg-amber-800"
            >
              {ar ? 'إرسال البلاغ' : 'Send report'}
            </button>
            <button
              type="button"
              onClick={() => setReporting(null)}
              className="text-[10px] font-bold text-slate-600 border border-slate-300 rounded-lg px-2.5 py-1.5"
            >
              {ar ? 'إلغاء' : 'Cancel'}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );

  return (
    <div className="space-y-3">
      {!loaded && !error ? <div className="text-[11px] text-slate-500">{ar ? 'جارٍ قراءة الأسئلة…' : 'Loading questions…'}</div> : null}
      {error ? <div className="text-[11px] text-rose-800">{error}</div> : null}

      {comments.length === 0 && loaded && !error ? (
        <div className="text-[11px] text-slate-500">
          {ar ? 'لا سؤال منشور على هذا العرض بعد.' : 'No published question on this listing yet.'}
        </div>
      ) : null}

      {comments.length > 0 ? (
        <ul className="space-y-2">
          {comments.map((comment) => (
            <React.Fragment key={comment.id}>
              {renderRow(comment, false)}
              {(comment.replies ?? []).map((reply) => (
                <React.Fragment key={reply.id}>{renderRow(reply, true)}</React.Fragment>
              ))}
            </React.Fragment>
          ))}
        </ul>
      ) : null}

      {notice ? <div className="text-[10px] font-bold text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1.5">{notice}</div> : null}

      {signedIn ? (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          {replyTo ? (
            <div className="text-[10px] text-slate-500 flex items-center gap-2">
              <span>{ar ? `رد على: ${replyTo.author_name ?? ''}` : `Replying to: ${replyTo.author_name ?? ''}`}</span>
              <button type="button" onClick={() => setReplyTo(null)} className="font-bold text-slate-700 underline">
                {ar ? 'إلغاء الرد' : 'Cancel reply'}
              </button>
            </div>
          ) : null}

          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={2}
            placeholder={replyTo
              ? (ar ? 'اكتب ردك…' : 'Write your reply…')
              : (ar ? 'اسأل البائع عن حالة التخزين أو التغليف أو الحد الأدنى…' : 'Ask the seller about storage, packaging, MOQ…')}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-[11px] focus:bg-white focus:outline-none"
          />

          <button
            type="button"
            onClick={() => void post()}
            disabled={posting}
            className="bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-40"
          >
            <Send className="w-3 h-3" />
            <span>{posting ? (ar ? 'جارٍ الإرسال…' : 'Sending…') : (ar ? 'إرسال' : 'Post')}</span>
          </button>
        </div>
      ) : (
        <div className="text-[10px] text-slate-500">
          {ar ? 'سجّل الدخول بمنشأتك لتسأل أو تسجّل اهتمامك.' : 'Sign in with your business to ask or record interest.'}
        </div>
      )}
    </div>
  );
};
