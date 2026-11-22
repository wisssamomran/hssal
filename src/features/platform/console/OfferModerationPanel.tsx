import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Check, Undo2 } from 'lucide-react';
import { BannerView, ErrorNote, LabeledSelect, PanelShell, TextInput, recorded } from '@/shared/ui/panel';
import { Banner } from '@/shared/ui/panel';
import { serverMessage } from '@/core/api/refusal';
import { getModerationQueue, reviewOffer } from '@/features/marketplace/api';
import { Offer, OfferStatus } from '@/features/marketplace/types';
import { formatMoney, opportunityReasonLabel } from '@/core/config';
import { offerStatusLabel } from '@/features/marketplace/labels';
import { ReviewDecision, REVIEW_STATUS_OPTIONS, decisionMessage, reviewReasonProblem } from './offer-review';
import { ModerationDossier } from './OfferModerationDossier';

/**
 * The queue of listings waiting on the platform's word, and the two buttons that give it.
 *
 * This component draws the queue and holds its state — which filter is open, which
 * dossier is unfolded, what the reviewer has typed per row. It decides nothing: which
 * statuses can be asked about, that a return needs a reason, and what each refusal
 * means all live in `offer-review`, because a rule that lives inside a table is a rule
 * only the table can use, and the dossier beside it needs the same reading.
 *
 * The rows the server returns are shown as it returned them. Prices, quantities and
 * cities are the platform's stored numbers, not recomputed here, and the raw status
 * code stays visible under the Arabic label: the reviewer's next sentence to a seller
 * quotes that code, and a screen that hides it makes them guess.
 */
export const OfferModerationPanel: React.FC<{ onNotify?: (m: string) => void }> = ({ onNotify }) => {
  const [status, setStatus] = useState<OfferStatus>('PENDING_REVIEW');
  const [search, setSearch] = useState('');
  const [offers, setOffers] = useState<Offer[]>([]);
  /** One dossier open at a time: a reviewer reads one business at a time. */
  const [openId, setOpenId] = useState<number | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [reasons, setReasons] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const result = await getModerationQueue({ status, search: search || undefined, per_page: 25 });
    if (result.success) {
      setOffers(result.data ?? []);
      setTotal(result.pagination?.total_items ?? null);
    } else {
      setOffers([]);
      setTotal(null);
      setLoadError(serverMessage(result, 'لم ترد قائمة المراجعة من الخادم'));
    }
    setLoading(false);
  }, [status, search]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (offer: Offer, decision: ReviewDecision) => {
    const reason = (reasons[offer.id] ?? '').trim();
    const problem = reviewReasonProblem(decision, reason);
    if (problem) {
      setBanner({ kind: 'error', text: problem });
      return;
    }

    setBusyId(offer.id);
    setBanner(null);
    const result = await reviewOffer(offer.id, decision, decision === 'RETURN' ? reason : undefined);
    setBusyId(null);

    if (result.success) {
      setBanner({ kind: 'ok', text: serverMessage(result, 'سُجّل القرار') });
      setReasons((prev) => ({ ...prev, [offer.id]: '' }));
      load();
      onNotify?.('تم تحديث قائمة المراجعة');
      return;
    }
    setBanner({ kind: 'error', text: decisionMessage(result) });
  };

  return (
    <PanelShell
      title="مراجعة العروض قبل النشر"
      hint="العروض هنا لم تنشر بعد؛ النشر يجعلها حقيقة تجارية تدخل محرك المطابقة، والإرجاع يعيدها إلى البائع كمسودة مع السبب."
    >
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <LabeledSelect
          label="حالة العرض"
          value={status}
          onChange={(value) => setStatus(value as OfferStatus)}
          options={REVIEW_STATUS_OPTIONS}
        />
        <TextInput label="بحث في العنوان" value={search} onChange={setSearch} placeholder="اسم المنتج أو عنوان العرض" />
        <button
          onClick={load}
          className="flex w-full items-center justify-center gap-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg px-3 py-2 hover:bg-slate-50 cursor-pointer sm:w-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>تحديث القائمة</span>
        </button>
        {/* Counted by the server for this filter, not by the browser. */}
        <p className="text-[11px] font-medium text-slate-500 sm:pb-2">
          {total !== null ? `${total} نتيجة بالفلتر الحالي` : 'لم يردّ الخادم بعدد النتائج'}
        </p>
      </div>

      <BannerView banner={banner} />
      {loadError && <ErrorNote text={loadError} />}

      <p className="text-[10px] text-slate-400 sm:hidden">اسحب الجدول أفقيًا لقراءة كل الأعمدة؛ عمود القرار آخرها.</p>
      <div className="min-w-0 border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-xs text-right">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
            <tr>
              <th className="p-3">العرض</th>
              <th className="p-3">المورّد</th>
              <th className="p-3">السعر / الكمية المتاحة</th>
              <th className="p-3">سبب التصريف</th>
              <th className="p-3">الموقع</th>
              <th className="p-3 min-w-0 text-left">القرار</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-slate-400">جارٍ التحميل…</td>
              </tr>
            )}
            {!loading && !offers.length && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-slate-400">
                  لا توجد عروض بهذه الحالة الآن.
                </td>
              </tr>
            )}
            {!loading && offers.map((offer) => (
              <React.Fragment key={offer.id}>
              <tr className="align-top hover:bg-slate-50/60">
                <td className="p-3 min-w-0">
                  <div className="font-bold text-slate-900">{offer.title_ar}</div>
                  <div className="text-[11px] text-slate-500">
                    {recorded(offer.variant_name_ar || offer.product_name_ar)} · #{offer.id}
                  </div>
                  {/* The word the seller's screens use, and the code the reviewer quotes back. */}
                  <div className="text-[10px] text-slate-500 mt-0.5">{offerStatusLabel(offer.status)}</div>
                  <div className="text-[10px] font-mono text-slate-400">{offer.status} · #{offer.id}</div>
                  <button
                    onClick={() => setOpenId(openId === offer.id ? null : offer.id)}
                    className="mt-1.5 text-[10px] font-bold text-emerald-800 border border-emerald-200 rounded-lg px-2 py-1 hover:bg-emerald-50 cursor-pointer"
                  >
                    {openId === offer.id ? 'إخفاء ملف المراجعة' : 'ملف المراجعة'}
                  </button>
                </td>
                <td className="p-3 text-slate-700">{recorded(offer.seller_name_ar || offer.seller_name_en)}</td>
                <td className="p-3 text-slate-700 whitespace-nowrap">
                  {formatMoney(offer.unit_price, offer.currency_code)}
                  <div className="text-[11px] text-slate-500">
                    {offer.available_quantity} {offer.unit} · حد أدنى {offer.min_order_quantity}
                  </div>
                </td>
                <td className="p-3 min-w-0 text-slate-700">
                  {opportunityReasonLabel(offer.opportunity_reason, 'ar') || '—'}
                  {offer.opportunity_reason_notes && (
                    <div className="text-[11px] text-slate-500">{offer.opportunity_reason_notes}</div>
                  )}
                </td>
                <td className="p-3 text-slate-700">{recorded(offer.warehouse_city)}</td>
                <td className="p-3 w-full min-w-0">
                  <textarea
                    value={reasons[offer.id] ?? ''}
                    onChange={(event) => setReasons((prev) => ({ ...prev, [offer.id]: event.target.value }))}
                    placeholder="سبب الإرجاع (مطلوب عند الإرجاع فقط)"
                    rows={2}
                    className="w-full min-w-[10rem] mb-2 bg-slate-50 border border-slate-200 rounded-lg p-2 text-[11px] focus:bg-white focus:outline-none"
                  />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => decide(offer, 'APPROVE')}
                      disabled={busyId === offer.id || offer.status !== 'PENDING_REVIEW'}
                      className="bg-emerald-600 disabled:opacity-40 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>نشر في السوق</span>
                    </button>
                    <button
                      onClick={() => decide(offer, 'RETURN')}
                      disabled={busyId === offer.id || offer.status !== 'PENDING_REVIEW'}
                      className="bg-white disabled:opacity-40 border border-slate-300 hover:bg-slate-100 text-slate-800 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>إرجاع للبائع</span>
                    </button>
                  </div>
                  {offer.status !== 'PENDING_REVIEW' && (
                    <div className="text-[10px] text-slate-400 pt-1">
                      لم يعد هذا العرض بانتظار قرار.
                    </div>
                  )}
                </td>
              </tr>
              {openId === offer.id ? (
                <tr className="bg-slate-50/70">
                  <td colSpan={6} className="p-3">
                    <ModerationDossier offer={offer} />
                  </td>
                </tr>
              ) : null}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </PanelShell>
  );
};
