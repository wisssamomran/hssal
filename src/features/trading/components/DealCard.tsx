import React from 'react';
import { Clock, QrCode, Receipt } from 'lucide-react';
import type { Locale } from '@/core/i18n';
import { formatDateTime } from '@/core/i18n';
import { formatMoney, num } from '@/core/config';
import type { Deal, DealStatus } from '../types';
import {
  FULFILMENT_STEPS,
  awaitingScan,
  canSpendHandover,
  forwardMove,
  isTerminal,
  nextParty,
  offeredMoves,
  otherMoves,
  type DealSide,
} from '../deal-machine';
import { dealActionLabel, dealStatusLabel } from '../labels';
import { HandoverStrip } from './HandoverStrip';
import { StepsTrack } from './StepsTrack';

/**
 * One order in the pipeline: where it stands, what this account may do about it,
 * and what happens to the goods at the gate.
 *
 * The card decides nothing on its own. Every button here is a move
 * `deal-machine.ts` says this party may make in this state with this session's
 * permissions, and every sentence about a missing button is the same module's
 * answer about why it is missing — the code unspent, the turn held by the other
 * business, the organization not a party at all. Whether the move is legal is the
 * server's decision, made again on every call; this is the part that decides what
 * to put under a thumb.
 */
export const DealCard: React.FC<{
  deal: Deal;
  locale: Locale;
  /** Which side of this contract the session stands on; `null` reads only. */
  side: DealSide;
  can?: (permission: string) => boolean;
  /** A transition for this order is on the wire. */
  pending: boolean;
  onTransition: (deal: Deal, target: DealStatus) => void;
  /** Ask for the whole record — the card row is a moment old by then. */
  onOpenDetail: (deal: Deal) => void;
  onScan: (deal: Deal) => void;
  onOpenDispute?: (dealId: number) => void;
}> = ({ deal, locale, side, can, pending, onTransition, onOpenDetail, onScan, onOpenDispute }) => {
  const steps = FULFILMENT_STEPS;
  const currentIndex = steps.indexOf(deal.status);
  const terminal = isTerminal(deal.status);
  const moves = offeredMoves(deal, side, can);
  /* The scan gate is the only thing presentation removes beyond party and
     permission here, so the two lists differ exactly where a code is still
     unspent. */
  const codeAwaited = awaitingScan(deal, side, can);
  /* The one move that carries the deal onward, and the rest of the same
     server-offered transitions a tap deeper. Nothing here adds or removes a
     state: the machine only removes the ones this account is not a party to. */
  const forward = forwardMove(moves);
  const others = otherMoves(moves, forward);
  const handover = deal.handover ?? null;
  const owedTo = nextParty(deal);

  return (
    <article className="space-y-3.5 sm:space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs transition hover:border-slate-300">
      <header className="flex flex-col items-start justify-between gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <span className="font-mono text-base font-black tracking-wide text-slate-900">{deal.deal_number}</span>
            <span
              className={`rounded-md border px-2.5 py-0.5 text-xs font-bold ${
                terminal ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
              }`}
            >
              {dealStatusLabel(deal.status, locale)}
            </span>
            {/*
              The order's delivery code, in the one word that says which of its
              three lives it is in. No escrow chip beside it, and none will return:
              the platform holds no funds, so there was never a state of theirs to
              badge.
            */}
            {handover && (
              <span
                className={`flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium ${
                  handover.status === 'USED'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : handover.status === 'ACTIVE'
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-slate-50 text-slate-500'
                }`}
              >
                <QrCode className="h-3 w-3 shrink-0" />
                {handover.status === 'USED'
                  ? (locale === 'ar' ? 'رُمز التسليم مُمسوح' : 'Handover scanned')
                  : handover.status === 'ACTIVE'
                  ? (locale === 'ar' ? 'رُمز التسليم جاهز' : 'Handover code ready')
                  : (locale === 'ar' ? 'رُمز التسليم مُسحب' : 'Handover code retired')}
              </span>
            )}
          </div>
          <p className="pt-1 text-xs text-slate-500">
            {locale === 'ar' ? 'البائع' : 'Seller'}: {deal.seller_organization?.name_ar || '—'} •{' '}
            {locale === 'ar' ? 'المشتري' : 'Buyer'}: {deal.buyer_organization?.name_ar || '—'}
          </p>
        </div>

        <div className="shrink-0 text-start sm:text-left">
          <div className="font-serif text-lg font-black text-slate-900">
            {formatMoney(deal.buyer_total_amount, deal.currency_code)}
          </div>
          <div className="text-[11px] text-slate-400">
            {num(deal.quantity)} × {formatMoney(deal.unit_price, deal.currency_code)}
          </div>
        </div>
      </header>

      {/*
        A phone cannot swipe a ten-step track with a thumb and still read it, so on
        a handset the one thing that matters — how far along the drawn path this deal
        is — stands alone, and the whole track sits behind a single disclosure. The
        status itself is already on the card header, so it is not printed twice.
      */}
      {currentIndex >= 0 && (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs font-bold text-emerald-900 sm:hidden">
          {locale === 'ar'
            ? `الخطوة ${currentIndex + 1} من ${steps.length} في مسار التسليم`
            : `Step ${currentIndex + 1} of ${steps.length} on the fulfilment path`}
        </div>
      )}
      <div className="sm:hidden">
        <details className="text-xs">
          <summary className="cursor-pointer select-none font-bold text-slate-500 hover:text-slate-800">
            {locale === 'ar' ? 'مسار التسليم الكامل' : 'Full fulfilment path'}
          </summary>
          <div className="mt-1 overflow-x-auto py-1 scrollbar-none">
            <StepsTrack steps={steps} currentIndex={currentIndex} locale={locale} />
          </div>
        </details>
      </div>
      <div className="hidden overflow-x-auto py-2 scrollbar-none sm:block">
        <StepsTrack steps={steps} currentIndex={currentIndex} locale={locale} />
      </div>

      <div className="space-y-2.5 rounded-lg bg-slate-50 p-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
          <span className="flex min-w-0 items-center gap-1.5">
            <Receipt className="h-4 w-4 shrink-0 text-slate-500" />
            <span className="min-w-0">
              {deal.warehouse_id
                ? `${locale === 'ar' ? 'مستودع' : 'Warehouse'} #${deal.warehouse_id}`
                : locale === 'ar'
                  ? 'لا مستودع مسجَّل على هذه الصفقة'
                  : 'No warehouse recorded'}
            </span>
          </span>
          {deal.inspection_deadline_at && formatDateTime(deal.inspection_deadline_at, locale) && (
            <span className="flex min-w-0 items-center gap-1 text-amber-700">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              {locale === 'ar'
                ? `مهلة الفحص حتى ${formatDateTime(deal.inspection_deadline_at, locale)}`
                : `Inspection until ${formatDateTime(deal.inspection_deadline_at, locale)}`}
            </span>
          )}
        </div>

        <HandoverStrip
          deal={deal}
          locale={locale}
          side={side}
          canScan={canSpendHandover(deal, side, can)}
          onScan={() => onScan(deal)}
        />

        {/* One move forward, and the contract; everything else the server would
            still accept stays under one disclosure. */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenDetail(deal)}
            className="flex-1 cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:flex-none"
          >
            {locale === 'ar' ? 'تفاصيل العقد والفاتورة' : 'Contract and invoice'}
          </button>

          {forward && (
            <button
              key={forward}
              type="button"
              disabled={pending}
              onClick={() => onTransition(deal, forward)}
              className="flex-1 cursor-pointer rounded-lg bg-emerald-600 px-3 py-2 text-center text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50 sm:flex-none"
            >
              {dealActionLabel(forward, locale)}
            </button>
          )}
        </div>

        {/*
          A card with no button is a question, and it deserves an answer: whose move
          this is. The order is not stuck and nothing has been skipped — the goods,
          or the word about them, are with the other business. When the machine
          offers moves but none of them belong to this account, that is said too,
          because the alternative is a person assuming the platform has lost their
          order.
        */}
        {moves.length === 0 && !codeAwaited && !terminal && (
          <p className="text-[11px] text-slate-500">
            {side === null
              ? (locale === 'ar'
                ? 'هذه المنشأة ليست طرفًا في هذا العقد، لذا لا إجراءات لك هنا.'
                : 'This organization is not a party to this contract, so there is nothing for it to do here.')
              : (locale === 'ar'
                ? 'لا انتقال متاح لهذه الصفحة من العقد.'
                : 'No transition is offered from this state.')}
          </p>
        )}
        {moves.length === 0 && !codeAwaited && !terminal && side !== null && owedTo && (
          <p className="text-[11px] font-semibold text-slate-600">
            {owedTo === 'buyer'
              ? (locale === 'ar' ? 'الخطوة التالية على المشتري.' : 'The next move is the buyer’s.')
              : (locale === 'ar' ? 'الخطوة التالية على البائع.' : 'The next move is the seller’s.')}
          </p>
        )}

        {/*
          The step that is missing is a physical one: somebody has to stand at the
          goods with a camera. Saying so keeps an unscanned order from reading as a
          stuck one, and naming the permission covers the account that can see the
          gate but not operate it.
        */}
        {codeAwaited && !terminal && (
          <>
            <p className="text-[11px] font-semibold text-slate-600">
              {side === 'buyer'
                ? (locale === 'ar'
                  ? 'لا فحص ولا إغلاق قبل أن يمسح البائع كود التسليم: أعْرِضه عليه من الشريط أعلاه.'
                  : 'Neither inspection nor closure is offered until the seller spends your delivery code — show it to them from the strip above.')
                : (locale === 'ar'
                  ? 'لا فحص ولا إغلاق قبل مسح كود المشتري: امسحه من الشريط أعلاه واحفظه.'
                  : 'Neither inspection nor closure is offered until the buyer’s code is scanned — spend it from the strip above and save.')}
            </p>
            {side !== 'buyer' && !can?.('deals.deliver') && (
              <p className="text-[11px] text-slate-500">
                {locale === 'ar'
                  ? 'والمسح صلاحيةٌ (deals.deliver) لا تحملها هذه الجلسة؛ يجريه من سلّم البضاعة.'
                  : 'Scanning is a deals.deliver permission this session does not hold; whoever delivered the goods runs it.'}
              </p>
            )}
          </>
        )}

        {(others.length > 0 || (deal.status === 'DELIVERED' && onOpenDispute)) && (
          <details className="text-xs">
            <summary className="cursor-pointer select-none font-bold text-slate-500 hover:text-slate-800">
              {locale === 'ar' ? 'بقية الإجراءات على هذه الصفقة' : 'Other moves on this deal'}
            </summary>
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2">
              {others.map((target) => (
                <button
                  key={target}
                  type="button"
                  disabled={pending}
                  onClick={() => onTransition(deal, target)}
                  className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold text-white transition disabled:opacity-50 ${
                    target === 'CANCELLED' ? 'bg-slate-500 hover:bg-slate-600' : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {dealActionLabel(target, locale)}
                </button>
              ))}

              {deal.status === 'DELIVERED' && onOpenDispute && (
                <button
                  type="button"
                  onClick={() => onOpenDispute(deal.id)}
                  className="cursor-pointer rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                >
                  {locale === 'ar' ? 'فتح نزاع' : 'Open dispute'}
                </button>
              )}
            </div>
          </details>
        )}
      </div>

      {terminal && deal.status === 'CANCELLED' && deal.cancellation_reason && (
        <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          {locale === 'ar' ? 'سبب الإلغاء: ' : 'Cancellation reason: '}
          {deal.cancellation_reason}
        </p>
      )}
    </article>
  );
};
