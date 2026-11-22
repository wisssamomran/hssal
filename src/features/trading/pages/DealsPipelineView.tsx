import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { getLocale } from '@/core/i18n';
import { usePlatformConfig } from '@/core/config';
import {
  cancelReservation,
  createDealFromReservation,
  getDeal,
  getDeals,
  getPurchaseRequests,
  getReservations,
  transitionDeal,
  verifyHandover,
} from '@/features/trading/api';
import type { Deal, DealStatus, PurchaseRequest, Reservation } from '@/features/trading/types';
import { requiresReason, sideOfDeal } from '@/features/trading/deal-machine';
import { dealStatusLabel } from '@/features/trading/labels';
import { ConvertHoldSheet } from '@/features/trading/components/ConvertHoldSheet';
import { DealCard } from '@/features/trading/components/DealCard';
import { DealDetail } from '@/features/trading/components/DealDetail';
import { ReasonSheet, type ReasonAsk } from '@/features/trading/components/ReasonSheet';
import { RequestsTab } from '@/features/trading/components/RequestsTab';
import { ReservationsTab } from '@/features/trading/components/ReservationsTab';
import { ScanSheet } from '@/features/trading/components/ScanSheet';

interface DealsPipelineProps {
  /**
   * The active organization's id, as the session holds it — an account with no
   * organization in context passes an empty string, which on this screen means
   * "nobody's side of the trade", and the platform sees every move it can rule.
   *
   * The side matters because one endpoint serves both counterparties: the state
   * machine asks not "may this account do that" but "is this account the buyer or
   * the seller of *this* order", and a button that ignores the difference is a
   * refusal waiting to be clicked.
   */
  currentPersonaId: string;
  onOpenDispute?: (dealId: number) => void;
  /**
   * The session's permission check. Offered actions are filtered by it, but it
   * is only a courtesy: the route middlewares decide, and their refusal is what
   * the screen shows (§36).
   */
  can?: (permission: string) => boolean;
}

type Tab = 'deals' | 'requests' | 'reservations';

/** The three lists this screen keeps, and the names its tabs print. */
const TABS: Array<{ key: Tab; ar: string; en: string }> = [
  { key: 'deals', ar: 'الصفقات', en: 'Deals' },
  { key: 'requests', ar: 'طلبات الشراء', en: 'Requests' },
  { key: 'reservations', ar: 'الحجوزات النشطة', en: 'Active holds' },
];

/**
 * The trade ledger a business works from: the asks against its offers, the
 * quantities its sellers have agreed to keep, and the orders those holds became.
 *
 * This file is composition and nothing else. Which moves exist, who may make them,
 * what the delivery code gates and which transitions need a written reason are in
 * `deal-machine.ts`; what each state is called in either language is in `labels.ts`;
 * the counter-offer's floors are in `purchase-request.ts`. What is left here is the
 * handful of things only a screen can own: asking the server for three lists,
 * holding which one is on show, and handing the answer to the component that draws
 * it — because a screen that decides is a screen nobody can test without a browser.
 */
export const DealsPipelineView: React.FC<DealsPipelineProps> = ({ currentPersonaId, onOpenDispute, can }) => {
  usePlatformConfig();
  const locale = getLocale();
  // Which side of a trade this session stands on, for every card below. An account
  // with no organization in context is nobody's party, and the platform's own moves
  // are made from the disputes screen.
  const organizationId = Number(currentPersonaId) || null;

  const [activeTab, setActiveTab] = useState<Tab>('deals');
  const [deals, setDeals] = useState<Deal[]>([]);
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [pendingDealId, setPendingDealId] = useState<number | null>(null);
  const [releasingId, setReleasingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // A list the server refused, named. `requests.length === 0` is not the same fact
  // as "the server would not answer this account", and printing the first for the
  // second tells a platform operator that nothing is waiting when the real answer is
  // "you have no organization in context to ask about".
  const [refusals, setRefusals] = useState<string[]>([]);
  // Which of the three tabs the server would not answer, so its counter can read
  // "—" instead of a "0" that would be a number nobody counted.
  const [unreadable, setUnreadable] = useState<Tab[]>([]);

  const [dealDraft, setDealDraft] = useState<Reservation | null>(null);
  /**
   * A reason the record asks for, collected in a sheet rather than in
   * `window.prompt`: iOS Safari has no prompt, so on an iPhone every one of those
   * buttons read `null` and did nothing at all. The text goes to the same call,
   * with the same checks, as before.
   */
  const [reasonAsk, setReasonAsk] = useState<ReasonAsk | null>(null);

  /**
   * The order whose delivery code is being written down at the gate, and the
   * request in flight. Kept apart from `reasonAsk` on purpose: a code is not a
   * reason, it goes to a different endpoint, and its failure is a fact about the
   * goods rather than about somebody's decision.
   */
  const [scanAsk, setScanAsk] = useState<Deal | null>(null);
  const [scanningId, setScanningId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [dealsRes, requestsRes, reservationsRes] = await Promise.all([
        getDeals(),
        getPurchaseRequests(),
        getReservations({ status: 'ACTIVE' }),
      ]);

      const messages: string[] = [];
      const keys: Tab[] = [];
      const note = (key: Tab, label: string, res: { success?: boolean; error_code?: string }) => {
        if (res.success) return;
        keys.push(key);
        messages.push(
          res.error_code === 'TENANT_REQUIRED'
            ? locale === 'ar'
              ? `${label}: الخادم طلب منشأة في السياق، وهذا الحساب لا يُمثّل واحدة الآن.`
              : `${label}: the server asked for an organization in context, and this account represents none.`
            : `${label}: ${res.error_code ?? 'ERROR'}`,
        );
      };

      if (dealsRes.success) setDeals(dealsRes.data ?? []);
      if (requestsRes.success) setRequests(requestsRes.data ?? []);
      if (reservationsRes.success) setReservations(reservationsRes.data ?? []);

      // One loop over the tabs rather than three near-identical calls, because the
      // three lists failing differently is the fact worth keeping straight — and a
      // fourth list added to this screen will be counted, named and refused in the
      // same sentence as the others.
      TABS.forEach(({ key, ar, en }) => {
        const response = key === 'deals' ? dealsRes : key === 'requests' ? requestsRes : reservationsRes;
        note(key, locale === 'ar' ? ar : en, response);
      });

      setRefusals(messages);
      setUnreadable(keys);
    } catch (error) {
      console.error(error);
      // Nothing on this screen was read, so nothing may claim to have counted zero
      // either.
      setRefusals([locale === 'ar' ? 'لم يستجب الخادم لسجل الصفقات.' : 'The server did not answer for the deal record.']);
      setUnreadable(['deals', 'requests', 'reservations']);
      setActionError(locale === 'ar' ? 'تعذر تحميل سجل الصفقات.' : 'The deal record could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    loadData();
  }, [currentPersonaId, loadData]);

  /** The move itself: the same call, the same server answer as ever. */
  const runTransition = async (deal: Deal, target: DealStatus, notes?: string) => {
    setPendingDealId(deal.id);
    setActionError(null);
    const response = await transitionDeal(deal.id, target, notes);
    setPendingDealId(null);

    if (!response.success) {
      // The server's own words, because it is the one that knows whether this
      // actor, in this state, with this capability configured, may do that.
      setActionError(response.message || (locale === 'ar' ? 'تعذر تغيير حالة الصفقة.' : 'The deal state could not be changed.'));
      return;
    }

    setNotice(response.message || undefined);
    await loadData();
    if (selectedDeal?.id === deal.id) {
      const fresh = await getDeal(deal.id);
      if (fresh.success && fresh.data) setSelectedDeal(fresh.data);
    }
  };

  /**
   * Ask before deciding against the other business.
   *
   * Three of the machine's transitions — cancellation, dispute, ruling — are
   * refused by the server without a written reason, and that reason goes to the
   * audit log rather than into the void. Everything else the state offers goes
   * straight through: a person made to explain «بدء التجهيز» every time learns to
   * stop reading the dialog that asks.
   */
  const askTransition = (deal: Deal, target: DealStatus) => {
    if (!requiresReason(target)) {
      void runTransition(deal, target);
      return;
    }

    const label = dealStatusLabel(target, locale);
    setReasonAsk({
      title: locale === 'ar'
        ? `سبب "${label}" مطلوب ويُحفظ في سجل التدقيق`
        : `A reason for "${label}" is required and written to the audit log`,
      placeholder: locale === 'ar' ? 'اكتب السبب هنا' : 'Write the reason',
      confirmLabel: locale === 'ar' ? 'تسجيل السبب' : 'Record the reason',
      optional: false,
      proceed: (answer) => {
        setReasonAsk(null);
        if (answer.trim().length < 3) {
          setActionError(locale === 'ar' ? 'السبب قصير جداً؛ المطلوب سبب مكتوب لا تأكيد.' : 'A short reason is required, not just a confirmation.');
          return;
        }
        void runTransition(deal, target, answer.trim());
      },
    });
  };

  /**
   * Spend the order's delivery code, on the server's authority and no other.
   *
   * This client sends what it was handed — a camera's payload or sixteen characters
   * read off a label — and prints the answer. That is not laziness: "already spent",
   * "this code belongs to another order", "this one was retired" and "this is not an
   * order a scan can close" are four different things to say to a person standing at
   * a gate with a phone in one hand, and only the service holding the row lock knows
   * which happened. A check duplicated here could only be a guess, and a guess that
   * disagrees with the server costs someone their delivery receipt.
   */
  const runScan = async (deal: Deal, code: string) => {
    setScanningId(deal.id);
    setActionError(null);
    const response = await verifyHandover(deal.id, { code: code.trim() });
    setScanningId(null);

    if (!response.success) {
      setActionError(
        response.error?.message ??
          response.message ??
          (locale === 'ar' ? 'لم يُقبل رمز التسليم.' : 'The delivery code was not accepted.')
      );
      return;
    }

    setScanAsk(null);
    setNotice(
      locale === 'ar'
        ? 'مُسح رمز التسليم وسُجِّل. للمشتري الآن أن يفتح مهلة الفحص أو يؤكد الاستلام؛ الصفقة لا تُغلق بدون هذه الخطوة.'
        : 'The delivery code was spent and recorded. The buyer can now open the inspection window or confirm receipt — an order does not close without this step.'
    );
    await loadData();
  };

  const convertReservation = async (input: {
    delivery_method: 'PICKUP' | 'SELLER_DELIVERY' | 'THIRD_PARTY_CARRIER';
    delivery_address?: string;
  }) => {
    if (!dealDraft) return;
    setPendingDealId(dealDraft.id);
    const response = await createDealFromReservation({ reservation_id: dealDraft.id, ...input });
    setPendingDealId(null);

    if (!response.success) {
      setActionError(response.message || (locale === 'ar' ? 'تعذر إنشاء الصفقة من الحجز.' : 'The deal could not be formed from this hold.'));
      return;
    }
    setDealDraft(null);
    setNotice(response.message || undefined);
    setActiveTab('deals');
    await loadData();
  };

  const runRelease = async (reservation: Reservation, answer: string) => {
    setReleasingId(reservation.id);
    setActionError(null);
    const response = await cancelReservation(reservation.id, answer.trim() || undefined);
    setReleasingId(null);

    if (!response.success) {
      setActionError(
        response.error?.message ??
          response.message ??
          (locale === 'ar' ? 'لم يُطلَق الحجز.' : 'The hold could not be released.')
      );
      // The hold may have gone anyway — a refused release and a released one can
      // look identical from here, so the list is asked again rather than trusted.
      await loadData();
      return;
    }

    setNotice(
      response.message ??
        (locale === 'ar'
          ? 'أُطلقت الكمية وعادت إلى مخزون البائع المتاح.'
          : 'The quantity was released back to the seller’s available stock.')
    );
    await loadData();
  };

  /**
   * Releasing a hold the buyer no longer wants. The quantity goes back to the
   * seller's shelf, so the screen says that happened rather than "request sent".
   */
  const releaseReservation = (reservation: Reservation) => {
    setReasonAsk({
      title: locale === 'ar' ? 'التخلّي عن الكمية المحجوزة' : 'Giving this hold back',
      placeholder: locale === 'ar'
        ? 'سبب التخلّي (اختياري، يُحفظ في السجل)'
        : 'Why this hold is given up (optional, kept on record)',
      confirmLabel: locale === 'ar' ? 'إطلاق الكمية' : 'Release the stock',
      optional: true,
      proceed: (answer) => {
        setReasonAsk(null);
        void runRelease(reservation, answer);
      },
    });
  };

  /** The contract, re-read before it is shown: a list row is a moment old. */
  const openDetail = async (deal: Deal) => {
    const detailed = await getDeal(deal.id);
    setSelectedDeal(detailed.success && detailed.data ? detailed.data : deal);
  };

  const counts: Record<Tab, number> = { deals: deals.length, requests: requests.length, reservations: reservations.length };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-6 px-3 sm:px-6 lg:px-8 py-6">
      <div className="flex flex-col items-stretch gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="font-serif text-lg font-black text-slate-900">
            {locale === 'ar' ? 'مركز الصفقات وعقود التوريد' : 'Deals and supply contracts'}
          </h2>
          <p className="text-xs text-slate-500">
            {locale === 'ar'
              ? 'المسار: عرض ← طلب شراء ← قبول البائع وحجز الكمية ← أمر شراء ← تسليم برُمز مسح ← فحص ← إغلاق. السداد بين الطرفين خارج المنصة.'
              : 'Path: offer → purchase request → seller acceptance and held stock → order → delivery attested by a scanned code → inspection → closed. The price is settled between the two businesses, outside the platform.'}
          </p>
        </div>

        <div className="grid w-full grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 text-xs font-semibold sm:flex sm:w-auto sm:items-center">
          {TABS.map(({ key, ar, en }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              aria-pressed={activeTab === key}
              className={`min-w-0 cursor-pointer rounded-lg px-2 py-2 text-center leading-tight transition ${
                activeTab === key ? 'bg-white font-bold text-emerald-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {/* A counter the server never answered is a dash, not a zero: «٠ طلبات»
                  and «لم يُجب عني» are different facts, and one of them is a reason to
                  close the tab. */}
              {unreadable.includes(key) ? `${locale === 'ar' ? ar : en} (—)` : `${locale === 'ar' ? ar : en} (${counts[key]})`}
            </button>
          ))}
        </div>
      </div>

      {refusals.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 sm:p-3.5 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="min-w-0 space-y-1">
            <p className="font-bold">
              {locale === 'ar'
                ? 'بعض قوائم هذه الشاشة لم تُحمَل؛ ما يُعرض أدناه ليس كل ما عند الخادم.'
                : 'Some lists on this screen did not load; what is below is not everything the server holds.'}
            </p>
            {refusals.map((message) => (
              <p key={message}>• {message}</p>
            ))}
          </div>
        </div>
      )}

      {actionError && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 sm:p-3.5 text-xs text-rose-800">
          <div className="flex min-w-0 items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <span className="min-w-0">{actionError}</span>
          </div>
          <button type="button" className="shrink-0 cursor-pointer font-bold text-rose-500 hover:text-rose-800" onClick={() => setActionError(null)}>
            ✕
          </button>
        </div>
      )}

      {notice && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 sm:p-3.5 text-xs text-emerald-900">
          <div className="flex min-w-0 items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0">{notice}</span>
          </div>
          <button type="button" className="shrink-0 cursor-pointer font-bold text-emerald-600" onClick={() => setNotice(null)}>
            ✕
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2 py-20 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
          <p className="text-xs text-slate-500">{locale === 'ar' ? 'جارٍ التحميل…' : 'Loading…'}</p>
        </div>
      ) : activeTab === 'requests' ? (
        <RequestsTab
          requests={requests}
          locale={locale}
          onDecided={async (message) => {
            setNotice(message);
            await loadData();
          }}
          onError={setActionError}
        />
      ) : activeTab === 'reservations' ? (
        <ReservationsTab
          reservations={reservations}
          locale={locale}
          canRelease={Boolean(can?.('requests.cancel'))}
          releasingId={releasingId}
          onRelease={releaseReservation}
          onSelect={(reservation) => {
            setDealDraft(reservation);
            setActionError(null);
          }}
        />
      ) : deals.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500 sm:p-12">
          {locale === 'ar'
            ? 'لا توجد صفقات بعد. تظهر الصفقة هنا بعد أن يقبل البائع طلب شراء ويحوَّل الحجز إلى صفقة.'
            : 'No deals yet. A deal appears once the seller accepts a purchase request and the hold is converted.'}
        </div>
      ) : (
        <div className="space-y-4">
          {deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              locale={locale}
              side={sideOfDeal(deal, organizationId)}
              can={can}
              pending={pendingDealId === deal.id}
              onTransition={askTransition}
              onOpenDetail={(target) => void openDetail(target)}
              onScan={setScanAsk}
              onOpenDispute={onOpenDispute}
            />
          ))}
        </div>
      )}

      {dealDraft && (
        <ConvertHoldSheet
          reservation={dealDraft}
          locale={locale}
          pending={pendingDealId === dealDraft.id}
          onClose={() => setDealDraft(null)}
          onSubmit={(input) => void convertReservation(input)}
        />
      )}

      {selectedDeal && <DealDetail deal={selectedDeal} locale={locale} onClose={() => setSelectedDeal(null)} />}

      {scanAsk && (
        <ScanSheet
          deal={scanAsk}
          locale={locale}
          busy={scanningId === scanAsk.id}
          onCancelLabel={locale === 'ar' ? 'تراجع' : 'Back'}
          onClose={() => setScanAsk(null)}
          onSubmit={(code) => runScan(scanAsk, code)}
        />
      )}

      {reasonAsk && (
        <ReasonSheet ask={reasonAsk} cancelLabel={locale === 'ar' ? 'تراجع' : 'Back'} onClose={() => setReasonAsk(null)} />
      )}
    </div>
  );
};
