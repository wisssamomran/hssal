import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatMoney, num } from '@/core/config';
import { explainRefusal } from '@/core/api/refusal';
import { formatDate, type Locale } from '@/core/i18n';
import { createPurchaseRequestFromMatch } from '@/features/trading/api';
import {
  DEMAND_REFUSAL_CODES,
  MATCH_REQUEST_NOTES_MAX,
  matchAskDefaults,
  matchAskProblems,
  matchIsActionable,
  matchRequestPayload,
  matchRequestWriteProblems,
  matchSellerReference,
  matchStatusLabel,
  type DemandProblems,
} from '../demand';
import { offerDisplayName } from '../labels';
import type { DemandMatch } from '../types';
import { BannerView, Fact, Form, FormFooter, TextInput, recorded, type Banner } from '@/shared/ui/panel';

/**
 * One pairing the engine offered a buyer, and the ask it can be raised into.
 *
 * The score is never shown alone: `match_reasons` is the explanation and the number
 * beside it is only a ranking, so a row that displayed a bare "87%" would read like a
 * promise about the goods rather than the engine's opinion about them.
 *
 * Converting a match does not hold anything. `POST /purchase-requests/matches/{id}`
 * records a request and stops there; `reserved_quantity` moves when the seller accepts
 * it on their own requests screen. The notice under the buttons is the difference
 * between a buyer who plans around a booked pallet and one who does not.
 *
 * The seller is named by reference only. `DemandMatchingService` loads the offer with
 * its warehouse and variant but not its selling organization, so the offer row this
 * response carries has no business name in it — an empty name here is the shape of the
 * payload, not a seller who hides themselves.
 */
export const DemandMatchRow: React.FC<{
  match: DemandMatch;
  /** The buyer's unit and currency: the ask is stated in them, not in the seller's. */
  unit: string;
  currencyCode: string;
  canRequest: boolean;
  locale: Locale;
  onRequested: () => void;
}> = ({ match, unit, currencyCode, canRequest, locale, onRequested }) => {
  const [expanded, setExpanded] = useState(false);
  const [quantity, setQuantity] = useState(() => matchAskDefaults(match).quantity);
  const [notes, setNotes] = useState('');
  const [problems, setProblems] = useState<DemandProblems>({});
  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);

  const offer = match.offer;
  const actionable = matchIsActionable(match);

  /** A box the buyer is editing again has already been explained once. */
  const clearProblem = (field: string) => {
    setProblems((previous) => {
      const next = { ...previous };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBanner(null);

    const local = matchAskProblems(quantity, notes);
    setProblems(local);
    if (Object.keys(local).length > 0) return;

    setBusy(true);
    const result = await createPurchaseRequestFromMatch(match.id, matchRequestPayload(quantity, notes));
    setBusy(false);

    if (!result.success) {
      setProblems(matchRequestWriteProblems(result));
      setBanner({
        kind: 'error',
        text: explainRefusal(result, { fallback: 'رفض الخادم طلب الشراء', codes: DEMAND_REFUSAL_CODES }),
      });
      return;
    }

    setBanner({
      kind: 'ok',
      text: `${result.message ?? 'تم تسجيل طلب الشراء'} — رقمه ${result.data?.purchase_request_number ?? ''}. لم يُحجز شيء بعد: البائع يقرر الحجز من شاشة طلبات الشراء الواردة إليه.`,
    });
    onRequested();
  };

  const available = offer ? `${num(offer.available_quantity)} ${offer.unit || unit}` : '—';
  const minimum = offer ? `أدنى طلب ${num(offer.min_order_quantity)}` : null;

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-slate-900">
            {offer ? offerDisplayName(offer, locale) : `عرض رقم ${match.offer_id}`}
          </p>
          <p className="text-[10px] text-slate-500">
            {[`متاح ${available}`, minimum, matchSellerReference(match)].filter(Boolean).join(' · ')}
          </p>
        </div>
        <span className="shrink-0 text-[10px] font-bold text-slate-700">{matchStatusLabel(match.status)}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Fact
          label="درجة الترشيح"
          value={match.match_score === null || match.match_score === undefined ? recorded(null) : `${num(match.match_score)}%`}
        />
        <Fact
          label="إجمالي تقديري"
          value={match.estimated_total === null || match.estimated_total === undefined
            ? recorded(null)
            : formatMoney(match.estimated_total, currencyCode)}
        />
        <Fact
          label="تنتهي المطابقة"
          value={match.expires_at ? formatDate(match.expires_at, locale) : recorded(null)}
        />
      </div>

      {match.match_reasons && match.match_reasons.length > 0 ? (
        <p className="text-[10px] leading-relaxed text-slate-500">أسباب الترشيح: {match.match_reasons.join('، ')}</p>
      ) : (
        <p className="text-[10px] leading-relaxed text-slate-400">
          لم يسجّل المحرك أسباباً لهذه المطابقة؛ الدرجة وحدها ترتيبٌ لدى المنصة، لا وصف للبضاعة.
        </p>
      )}

      <BannerView banner={banner} />

      {canRequest && actionable ? (
        expanded ? (
          <Form onSubmit={handleSubmit} className="space-y-2 border-t border-slate-100 pt-2">
            <div className="flex flex-wrap gap-3">
              <TextInput
                label={`الكمية المطلوبة (${offer?.unit || unit})`}
                value={quantity}
                onChange={(value) => { setQuantity(value); clearProblem('requested_quantity'); }}
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                error={problems.requested_quantity}
              />
              <TextInput
                label="ملاحظة للبائع (اختياري)"
                value={notes}
                onChange={(value) => { setNotes(value); clearProblem('notes'); }}
                wide
                multiline
                maxLength={MATCH_REQUEST_NOTES_MAX}
                error={problems.notes}
              />
            </div>

            <FormFooter
              onCancel={() => setExpanded(false)}
              busy={busy}
              busyLabel="جارٍ الإرسال..."
              submitLabel="إرسال طلب الشراء"
            />

            <p className="text-[10px] text-slate-400">
              الحد الأدنى والمتاح يتحقق منهما الخادم عند وصول الطلب؛ إن خالفهما رفضه وظهر رفضه هنا.
            </p>
          </Form>
        ) : (
          <button
            onClick={() => setExpanded(true)}
            className="flex cursor-pointer items-center gap-1 text-[11px] font-bold text-emerald-800"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            تحويل هذه المطابقة إلى طلب شراء
          </button>
        )
      ) : (
        <p className="flex items-center gap-1 text-[10px] text-slate-400">
          <ChevronUp className="h-3.5 w-3.5" />
          {canRequest
            ? 'هذه المطابقة لم تعد فرصة مفتوحة.'
            : 'صلاحية إنشاء طلب شراء غير ممنوحة لهذا الحساب داخل منشأته.'}
        </p>
      )}
    </div>
  );
};
