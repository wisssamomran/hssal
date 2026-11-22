import React, { useState } from 'react';
import { MapPin, Package, Truck } from 'lucide-react';
import { formatMoney, taxSummary, usePlatformConfig } from '@/core/config';
import { localizedField, type Locale } from '@/core/i18n';
import { offerDisplayName, sellerLabel } from '@/features/marketplace/labels';
import type { Offer } from '@/features/marketplace/types';
import { refusalWithGate } from '@/features/organizations/api';
import { createPurchaseRequestFromOffer } from '@/features/trading/api';
import type { PurchaseRequest } from '@/features/trading/types';
import { BannerView, Form, FormFooter, ValueRow } from '@/shared/ui/panel';
import { Sheet } from '@/shared/ui/Sheet';
import {
  ORDER_REFUSAL_CODES,
  askFieldProblems,
  askLimits,
  askQuantityProblem,
  askPayload,
  deliveryChoicesFor,
  initialAskQuantity,
  initialDeliveryPreference,
  steppedAskQuantity,
} from '@/features/trading/order-request';

/**
 * The ask: what a buyer raises against a listing they found.
 *
 * It is a `Sheet` like every other decision on this platform — same way out on a
 * phone, same Escape, same proportions — and the only judgement it holds is the one
 * the rules in `order-request.ts` already make: whether the quantity can be sent and
 * which delivery halves the seller left open.
 *
 * What the dialog must never imply is a hold. Stock is reserved when the seller
 * accepts, and a buyer who thought their tap locked the pallet will plan a delivery
 * around a quantity that is still on the open market — so the header says the review
 * comes first, and the money block says the figures it does not compute are the
 * server's to compute at the deal.
 */
export const OrderRequestSheet: React.FC<{
  offer: Offer;
  locale: Locale;
  /** The listing may have moved while the dialog was open; the caller reloads on success. */
  onCreated: (request: PurchaseRequest) => void;
  onClose: () => void;
}> = ({ offer, locale, onCreated, onClose }) => {
  const config = usePlatformConfig();
  const limits = askLimits(offer);
  const choices = deliveryChoicesFor(offer.delivery_terms);

  const [quantity, setQuantity] = useState<number>(() => initialAskQuantity(offer));
  const [preference, setPreference] = useState(() => initialDeliveryPreference(offer.delivery_terms));
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  /** The platform's reading of a refusal, kept apart from the field it refused. */
  const [refusal, setRefusal] = useState<string | null>(null);
  const [problems, setProblems] = useState<Record<string, string>>({});

  const name = offerDisplayName(offer, locale);
  const variant = localizedField(offer, 'variant_name', locale);
  const cover = offer.product_cover_image || offer.product_image || offer.variant_image;
  const image = typeof cover === 'string' ? cover : '';
  const seller = sellerLabel(offer, locale);
  const warehouse = [offer.warehouse_city, offer.warehouse_name].filter(Boolean).join(' — ');

  const problem = askQuantityProblem(quantity, limits, offer.unit);
  const quantityNote = problems.requested_quantity || problem;

  /**
   * Send the ask.
   *
   * The button is a form submit, so a phone's keyboard and the on-screen button take
   * the same road, and a refusal returns the person to the same dialog with their
   * numbers still in it: the field the server named goes under its box, the code's
   * meaning goes above the buttons, and nothing the buyer typed is thrown away.
   */
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (problem || busy) return;
    setBusy(true);
    setRefusal(null);
    setProblems({});

    const result = await createPurchaseRequestFromOffer(askPayload(offer.id, { quantity, preference, notes }));
    setBusy(false);

    if (result.success && result.data) {
      onCreated(result.data);
      return;
    }
    setProblems(askFieldProblems(result));
    setRefusal(
      refusalWithGate(result, { fallback: 'لم يُسجَّل طلب الشراء لدى الخادم', codes: ORDER_REFUSAL_CODES })
    );
  };

  return (
    <Sheet
      size="lg"
      onClose={onClose}
      title={
        <div className="min-w-0">
          <span className="block text-[11px] font-medium text-emerald-700">
            البائع يراجع الطلب، والحجز يحدث عندها لا هنا
          </span>
          <h2 className="text-sm font-black text-slate-900 pt-0.5">طلب شراء على مخزون العرض</h2>
        </div>
      }
    >
      <Form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5 text-xs">
        {/* What is being asked for, read by the same rule the card uses */}
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
            {image ? (
              <img src={image} alt={name} className="h-full w-full object-cover" />
            ) : (
              <Package className="h-6 w-6 text-slate-300" />
            )}
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-slate-900">{name}</h4>
            {/* The variant only when it says something the name does not: a seller
                with one product usually names the variant after it. */}
            {variant && variant !== name && <p className="text-[11px] text-slate-500">{variant}</p>}
            <p className="text-[11px] text-slate-500">{seller.text}</p>
            <p className="pt-0.5 text-[11px] font-semibold text-emerald-700">
              سعر الوحدة: {formatMoney(limits.unitPrice, offer.currency_code)} / {offer.unit}
            </p>
          </div>
        </div>

        {/* Quantity: the two bounds the seller set, printed beside the box */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
            <label className="font-bold text-slate-700" htmlFor="ask-quantity">
              الكمية المطلوبة ({offer.unit}):
            </label>
            <span className="text-slate-500">
              الحد الأدنى: {limits.floor} • المتاح: {limits.ceiling}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setQuantity((previous) => steppedAskQuantity(previous, -limits.step, limits))}
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-slate-100 text-lg font-bold text-slate-800 hover:bg-slate-200"
              title="إنقاص كمية"
            >
              -
            </button>

            <input
              id="ask-quantity"
              type="number"
              min={limits.floor}
              max={limits.ceiling || undefined}
              step={limits.step}
              inputMode="decimal"
              value={quantity}
              onChange={(event) => setQuantity(parseFloat(event.target.value) || 0)}
              className={`min-w-0 flex-1 rounded-lg border bg-slate-50 py-2.5 text-center text-base font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                quantityNote ? 'border-rose-300' : 'border-slate-300'
              }`}
            />

            <button
              type="button"
              onClick={() => setQuantity((previous) => steppedAskQuantity(previous, limits.step, limits))}
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-slate-100 text-lg font-bold text-slate-800 hover:bg-slate-200"
              title="زيادة كمية"
            >
              +
            </button>
          </div>

          {quantityNote && <p className="text-[11px] font-semibold text-rose-700">{quantityNote}</p>}
        </div>

        {/* Delivery: only the halves this seller left open */}
        <div className="space-y-2">
          <span className="block text-xs font-bold text-slate-700">طريقة التسليم (كما حددها البائع):</span>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={!choices.pickup}
              onClick={() => setPreference('PICKUP')}
              className={`rounded-xl border p-3 text-right transition-all ${
                preference === 'PICKUP' && choices.pickup
                  ? 'cursor-pointer bg-emerald-50 font-bold text-emerald-950 ring-1 ring-emerald-500'
                  : choices.pickup
                    ? 'cursor-pointer border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    : 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
              } ${preference === 'PICKUP' && choices.pickup ? 'border-emerald-500' : ''}`}
            >
              <span className="flex items-center gap-2 text-xs">
                <MapPin className="h-4 w-4 shrink-0 text-emerald-600" />
                <span className="min-w-0">استلام من مستودع البائع</span>
              </span>
              <span className="block break-words pt-1 text-[10px] font-normal">
                {choices.pickup ? warehouse || 'مستودع غير محدد' : 'البائع لم يفتح الاستلام المباشر لهذا العرض'}
              </span>
            </button>

            <button
              type="button"
              disabled={!choices.delivery}
              onClick={() => setPreference('DELIVERY')}
              className={`rounded-xl border p-3 text-right transition-all ${
                preference === 'DELIVERY' && choices.delivery
                  ? 'cursor-pointer bg-emerald-50 font-bold text-emerald-950 ring-1 ring-emerald-500'
                  : choices.delivery
                    ? 'cursor-pointer border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    : 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
              } ${preference === 'DELIVERY' && choices.delivery ? 'border-emerald-500' : ''}`}
            >
              <span className="flex items-center gap-2 text-xs">
                <Truck className="h-4 w-4 shrink-0 text-emerald-600" />
                <span className="min-w-0">توصيل بطلب من البائع</span>
              </span>
              <span className="block pt-1 text-[10px] font-normal">
                {choices.delivery ? 'يتفق الطرفان على الشحن عند تأكيد الصفقة' : 'البائع لا يوفر التوصيل لهذا العرض'}
              </span>
            </button>
          </div>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">ملاحظات للبائع (تُحفظ مع طلب الشراء):</span>
          <textarea
            rows={2}
            maxLength={500}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="موعد الاستلام المناسب، متطلبات التجهيز..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </label>

        {/* The arithmetic this step actually performs, and the silence about the rest */}
        <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs">
          <ValueRow
            label={`قيمة الكمية المطلوبة (${quantity} × ${formatMoney(limits.unitPrice, offer.currency_code)}):`}
            value={formatMoney(quantity * limits.unitPrice, offer.currency_code)}
          />

          <ValueRow
            label="الضريبة"
            value={(() => {
              const tax = taxSummary();
              return tax
                ? `${tax.label || 'ضريبة'} ${tax.ratePercent}%${tax.inclusive ? ' (متضمنة)' : ''} — تُطبَّق في الصفقة`
                : 'لم تُفعَّل في إعدادات المنصة';
            })()}
          />

          <ValueRow
            label="عمولة المنصة"
            value={
              config.commissionRate
                ? `${(config.commissionRate * 100).toFixed(2).replace(/\.?0+$/, '')}% — تُحتسب في الصفقة`
                : 'غير مقررة في الإعدادات'
            }
          />

          <p className="border-t border-slate-200 pt-2 text-[11px] leading-relaxed text-slate-500">
            هذا الطلب لا يوقف أي كمية: يُسجَّل لدى البائع للمراجعة، والمبلغ النهائي وأسراره يحسبها الخادم عند إنشاء
            الصفقة، ولا تلغي هذه الشاشة أياً منها ولا تعرض ضماناً مالياً.
          </p>
        </div>

        {refusal && <BannerView banner={{ kind: 'error', text: refusal }} />}

        <FormFooter
          onCancel={onClose}
          submitLabel="إرسال طلب الشراء للبائع"
          busyLabel="يُرسل الطلب…"
          busy={busy}
          disabled={Boolean(problem)}
        />
      </Form>
    </Sheet>
  );
};
