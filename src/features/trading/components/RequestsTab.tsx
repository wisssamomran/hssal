import React, { useState } from 'react';
import { getTenantId } from '@/core/api/http';
import { serverMessage } from '@/core/api/refusal';
import { formatMoney, num } from '@/core/config';
import type { Locale } from '@/core/i18n';
import {
  acceptProposal,
  acceptPurchaseRequest,
  cancelPurchaseRequest,
  proposePurchaseRequest,
  rejectPurchaseRequest,
} from '../api';
import type { PurchaseRequest } from '../types';
import { proposalPayload, proposalProblem, requestParty } from '../purchase-request';
import { proposalProblemLabel, requestStatusChip } from '../labels';
import { ReasonSheet, type ReasonAsk } from './ReasonSheet';

/**
 * The asks a buyer has put against a seller's offers.
 *
 * A request is an offer to buy, not an order: no stock is held and no money moves
 * until the seller answers, and the seller's answer can be a counter instead of a
 * yes. The tab's job is to keep those three states legible — the chip says «nothing
 * held yet», the counter is printed above the buttons, and the party check decides
 * which of the four verbs this organization gets to use at all.
 *
 * Which side the session stands on is read from the tenant the requests were asked
 * with, not from the screen's persona prop: the server answered this list *as* that
 * organization, and a filter taken from anywhere else would offer a button on a row
 * that was never this account's to press.
 */
export const RequestsTab: React.FC<{
  requests: PurchaseRequest[];
  locale: Locale;
  /** A decision the server accepted, with the message it sent back. */
  onDecided: (message: string) => void;
  onError: (message: string) => void;
}> = ({ requests, locale, onDecided, onError }) => {
  const [busy, setBusy] = useState<number | null>(null);
  const [proposalFor, setProposalFor] = useState<number | null>(null);
  const [proposalQty, setProposalQty] = useState('');
  const [proposalPrice, setProposalPrice] = useState('');
  const [proposalNotes, setProposalNotes] = useState('');
  const [reasonAsk, setReasonAsk] = useState<ReasonAsk | null>(null);

  if (requests.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500 sm:p-12">
        {locale === 'ar' ? 'لا توجد طلبات شراء.' : 'No purchase requests.'}
      </div>
    );
  }

  /** The decision itself: same endpoints, same refusal handling as before. */
  const runDecide = async (id: number, kind: 'accept' | 'reject', reason?: string) => {
    setBusy(id);
    const response = kind === 'accept' ? await acceptPurchaseRequest(id) : await rejectPurchaseRequest(id, reason ?? '');
    setBusy(null);

    if (!response.success) {
      onError(serverMessage(response, locale === 'ar' ? 'تعذر تنفيذ القرار.' : 'The decision could not be recorded.'));
      return;
    }
    onDecided(response.message ?? '');
  };

  const decide = (id: number, kind: 'accept' | 'reject') => {
    if (kind === 'accept') {
      void runDecide(id, 'accept');
      return;
    }

    setReasonAsk({
      title: locale === 'ar' ? 'رفض طلب الشراء' : 'Declining this request',
      placeholder: locale === 'ar'
        ? 'سبب الرفض (يُرسل للمشتري ويُحفظ في السجل)'
        : 'Reason for rejecting (sent to the buyer, kept on record)',
      confirmLabel: locale === 'ar' ? 'تسجيل الرفض' : 'Record the rejection',
      optional: false,
      proceed: (answer) => {
        setReasonAsk(null);
        const reason = answer.trim();
        if (reason.length < 3) {
          onError(locale === 'ar' ? 'الرفض يحتاج سبباً مكتوباً.' : 'A rejection needs a written reason.');
          return;
        }
        void runDecide(id, 'reject', reason);
      },
    });
  };

  /** Seller counter-offer: records proposed terms and leaves the buyer's ask intact. */
  const sendProposal = async (request: PurchaseRequest) => {
    const fields = {
      quantity: proposalQty.trim() ? Number(proposalQty) : undefined,
      unitPrice: proposalPrice.trim() ? Number(proposalPrice) : undefined,
    };
    const problem = proposalProblem(fields);
    if (problem) {
      onError(proposalProblemLabel(problem, locale));
      return;
    }

    setBusy(request.id);
    const response = await proposePurchaseRequest(request.id, proposalPayload(fields), proposalNotes.trim() || undefined);
    setBusy(null);

    if (!response.success) {
      onError(serverMessage(response, locale === 'ar' ? 'تعذّر تسجيل الاقتراح.' : 'The proposal could not be recorded.'));
      return;
    }
    clearProposal();
    onDecided(response.message ?? '');
  };

  /** Buyer adopts the counter-offer, which puts the ask back on the seller. */
  const adoptProposal = async (id: number) => {
    setBusy(id);
    const response = await acceptProposal(id);
    setBusy(null);
    if (!response.success) {
      onError(serverMessage(response, locale === 'ar' ? 'تعذّر قبول اقتراح البائع.' : 'The proposal could not be adopted.'));
      return;
    }
    onDecided(response.message ?? '');
  };

  const runWithdraw = async (id: number, answer: string) => {
    setBusy(id);
    const response = await cancelPurchaseRequest(id, answer.trim() || undefined);
    setBusy(null);
    if (!response.success) {
      onError(serverMessage(response, locale === 'ar' ? 'تعذّر سحب الطلب.' : 'The request could not be withdrawn.'));
      return;
    }
    onDecided(response.message ?? '');
  };

  const withdraw = (id: number) => {
    setReasonAsk({
      title: locale === 'ar' ? 'سحب طلب الشراء' : 'Withdrawing this ask',
      placeholder: locale === 'ar'
        ? 'سبب السحب (اختياري، يُحفظ في السجل)'
        : 'Why the ask is withdrawn (optional, kept on record)',
      confirmLabel: locale === 'ar' ? 'سحب الطلب' : 'Withdraw the request',
      optional: true,
      proceed: (answer) => {
        setReasonAsk(null);
        void runWithdraw(id, answer);
      },
    });
  };

  const clearProposal = () => {
    setProposalFor(null);
    setProposalQty('');
    setProposalPrice('');
    setProposalNotes('');
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {requests.map((request) => {
        const { isBuyer, isSeller } = requestParty(request, getTenantId());
        const chip = requestStatusChip(request.status, locale);
        return (
          <article key={request.id} className="space-y-3.5 sm:space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1.5">
                <span className="block font-mono text-xs font-bold text-slate-900">{request.purchase_request_number}</span>
                <span className={`inline-block max-w-full rounded-full px-2 py-0.5 text-[10px] font-bold leading-relaxed ${chip.style}`}>
                  {chip.label}
                </span>
                <p className="text-xs text-slate-500 line-clamp-2" title={request.offer?.title_ar ?? undefined}>
                  {request.offer?.title_ar || (locale === 'ar' ? 'عرض محذوف أو غير متاح' : 'Offer removed or unavailable')}
                </p>
              </div>

              <div className="shrink-0 text-start sm:text-left">
                <div className="font-serif text-sm font-black text-emerald-800">
                  {formatMoney(num(request.requested_quantity) * num(request.requested_price), request.currency_code)}
                </div>
                <div className="text-[10px] text-slate-400">
                  {num(request.requested_quantity)} {request.unit} × {formatMoney(request.requested_price, request.currency_code)}
                </div>
              </div>
            </div>

            {request.proposed_terms && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                {locale === 'ar' ? 'البائع اقترح بدلاً من ذلك: ' : 'The seller proposed instead: '}
                {request.proposed_terms.quantity != null && `${request.proposed_terms.quantity} ${request.unit}`}
                {request.proposed_terms.unit_price != null &&
                  ` × ${formatMoney(request.proposed_terms.unit_price, request.proposed_terms.currency_code ?? request.currency_code)}`}
              </div>
            )}

            {request.notes && (
              <p className="border-t border-slate-100 pt-2 text-[11px] italic text-slate-500">“{request.notes}”</p>
            )}

            {proposalFor === request.id && (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-bold text-slate-700">
                  {locale === 'ar'
                    ? 'شروط بديلة تُرسل للمشتري (سؤاله الأصلي يبقى كما هو حتى يقبلها)'
                    : 'Terms sent back to the buyer (their ask stays as it was until they adopt these)'}
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="space-y-1 min-w-0">
                    <span className="block text-[10px] font-bold text-slate-600">
                      {locale === 'ar'
                        ? `الكمية المقترحة (المطلوبة: ${num(request.requested_quantity)} ${request.unit})`
                        : `Proposed quantity (asked: ${num(request.requested_quantity)} ${request.unit})`}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={proposalQty}
                      onChange={(e) => setProposalQty(e.target.value)}
                      className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                    />
                  </label>
                  <label className="space-y-1 min-w-0">
                    <span className="block text-[10px] font-bold text-slate-600">
                      {locale === 'ar'
                        ? `سعر الوحدة المقترح (المطلوب: ${formatMoney(request.requested_price, request.currency_code)})`
                        : `Proposed unit price (asked: ${formatMoney(request.requested_price, request.currency_code)})`}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.0001"
                      value={proposalPrice}
                      onChange={(e) => setProposalPrice(e.target.value)}
                      className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                    />
                  </label>
                </div>
                <label className="block space-y-1">
                  <span className="block text-[10px] font-bold text-slate-600">
                    {locale === 'ar' ? 'ملاحظة تُحفظ مع الطلب (اختياري)' : 'Note kept on the request (optional)'}
                  </span>
                  <input
                    type="text"
                    maxLength={500}
                    value={proposalNotes}
                    onChange={(e) => setProposalNotes(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                  />
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy === request.id}
                    onClick={() => sendProposal(request)}
                    className="flex-1 basis-full cursor-pointer rounded-lg bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 sm:basis-auto"
                  >
                    {locale === 'ar' ? 'إرسال الاقتراح' : 'Send the proposal'}
                  </button>
                  <button
                    type="button"
                    onClick={clearProposal}
                    className="cursor-pointer rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                  </button>
                </div>
              </div>
            )}

            <div className="border-t border-slate-100 pt-3">
              {isSeller && request.status === 'REQUESTED' && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busy === request.id}
                    onClick={() => decide(request.id, 'accept')}
                    className="flex-1 basis-full cursor-pointer rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 sm:basis-auto"
                  >
                    {locale === 'ar' ? 'قبول وحجز الكمية' : 'Accept and hold the stock'}
                  </button>
                  <button
                    type="button"
                    disabled={busy === request.id}
                    onClick={() => {
                      setProposalFor(request.id);
                      setProposalQty(String(num(request.requested_quantity)));
                      setProposalPrice(String(num(request.requested_price)));
                      setProposalNotes('');
                    }}
                    className="flex-1 cursor-pointer rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800 hover:bg-blue-100"
                  >
                    {locale === 'ar' ? 'اقتراح شروط' : 'Counter'}
                  </button>
                  <button
                    type="button"
                    disabled={busy === request.id}
                    onClick={() => decide(request.id, 'reject')}
                    className="flex-1 cursor-pointer rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                  >
                    {locale === 'ar' ? 'رفض' : 'Decline'}
                  </button>
                </div>
              )}

              {isBuyer && request.status === 'PROPOSED' && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busy === request.id}
                    onClick={() => adoptProposal(request.id)}
                    className="flex-1 basis-full cursor-pointer rounded-lg bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 sm:basis-auto"
                  >
                    {locale === 'ar' ? 'قبول شروط البائع' : 'Adopt the seller’s terms'}
                  </button>
                  <button
                    type="button"
                    disabled={busy === request.id}
                    onClick={() => withdraw(request.id)}
                    className="flex-1 cursor-pointer rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                  >
                    {locale === 'ar' ? 'سحب الطلب' : 'Withdraw'}
                  </button>
                </div>
              )}

              {isBuyer && request.status === 'REQUESTED' && (
                <button
                  type="button"
                  disabled={busy === request.id}
                  onClick={() => withdraw(request.id)}
                  className="w-full cursor-pointer rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                >
                  {locale === 'ar' ? 'سحب الطلب' : 'Withdraw the ask'}
                </button>
              )}

              {!isBuyer && !isSeller && (
                <p className="text-[11px] text-slate-500">
                  {locale === 'ar'
                    ? 'منشأتك ليست الطرف المشتري ولا البائع في هذا الطلب، فلا إجراء لك عليه.'
                    : 'Your organization is neither the buyer nor the seller here, so there is nothing for it to do.'}
                </p>
              )}

              {(request.status === 'ACCEPTED' || request.status === 'REJECTED' || request.status === 'CANCELLED') && (
                <p className="text-[11px] text-slate-500">
                  {request.status === 'ACCEPTED'
                    ? locale === 'ar'
                      ? 'الكمية صارت محجوزة؛ تحويلها إلى صفقة من تبويب الحجوزات.'
                      : 'The quantity is held; convert it to a deal from the holds tab.'
                    : locale === 'ar'
                      ? 'انتهى مسار هذا الطلب.'
                      : 'This request is closed.'}
                </p>
              )}
            </div>
          </article>
        );
      })}

      {reasonAsk && (
        <ReasonSheet
          ask={reasonAsk}
          cancelLabel={locale === 'ar' ? 'تراجع' : 'Back'}
          onClose={() => setReasonAsk(null)}
        />
      )}
    </div>
  );
};
