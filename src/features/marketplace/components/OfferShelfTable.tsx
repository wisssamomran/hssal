import React from 'react';
import { Clock, Package, Pause, Play, Send, Trash2 } from 'lucide-react';
import { formatDate, getLocale } from '@/core/i18n';
import { formatMoney, opportunityReasonLabel } from '@/core/config';
import type { Offer } from '../types';
import {
  SELLER_OFFER_ACTIONS,
  offerStatusHint,
  sellerActionsFor,
  type SellerOfferAction,
  type SellerRequestAction,
} from '../offer-actions';
import { deliveryTermsLabel, offerStatusLabel, offerStatusStyle } from '../labels';

/**
 * The shelf: this business's listings in every state the platform reports them in.
 *
 * A table, because a seller compares rows — quantities against prices against what
 * is still free — and reading nine columns down a line is what a table is for. The
 * only judgement here is which control each row gets, and that is asked of
 * `sellerActionsFor()` rather than decided in the markup: a button the server would
 * refuse is a button that teaches the seller that the screen lies.
 *
 * The table does not send anything. It names the action it was asked about and lets
 * the page that owns the loading state decide to show a banner and reload.
 */
export const OfferShelfTable: React.FC<{
  offers: Offer[];
  busy: boolean;
  onEdit: (offer: Offer) => void;
  /** The action the row's button was built from; the page prints its `recordLabel`. */
  onAction: (action: SellerRequestAction, offer: Offer) => void;
}> = ({ offers, busy, onEdit, onAction }) => {
  const locale = getLocale();

  return (
    <div className="min-w-0 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs dark:border-hassal-line dark:bg-hassal-surface">
      <table className="w-full min-w-[56rem] text-right text-xs text-slate-800">
        <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
          <tr>
            <th className="p-3">العرض والصنف</th>
            <th className="p-3">مستودع التخزين</th>
            <th className="p-3">المتاح</th>
            <th className="p-3">المحجوز</th>
            <th className="p-3">سعر الوحدة</th>
            <th className="p-3">حدّ الطلب</th>
            <th className="p-3">سبب الطرح</th>
            <th className="p-3">الحالة</th>
            <th className="p-3">إجراءاتك</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {offers.map((offer) => (
            <tr key={offer.id} className="align-top transition-colors hover:bg-slate-50/70">
              <td className="p-3">
                <div className="max-w-[16rem] font-bold text-slate-900" title={offer.title_ar}>
                  {offer.title_ar}
                </div>
                <div className="text-[11px] text-slate-500">
                  {[offer.product_name_ar, offer.variant_name_ar || offer.variant_sku].filter(Boolean).join(' · ') || '—'}
                </div>
                <div className="text-[10px] text-slate-400">التسليم: {deliveryTermsLabel(offer.delivery_terms)}</div>
              </td>
              <td className="p-3 text-slate-600">
                <div>{offer.warehouse_name || '—'}</div>
                <div className="text-[10px] text-slate-400">{offer.warehouse_city || ''}</div>
              </td>
              <td className="p-3 font-bold text-emerald-800">
                {offer.available_quantity} {offer.unit}
              </td>
              <td className="p-3 font-semibold text-amber-700">
                {offer.reserved_quantity} {offer.unit}
              </td>
              <td className="p-3 font-black font-serif text-slate-900">
                {formatMoney(offer.unit_price, offer.currency_code)}
              </td>
              <td className="p-3 text-[11px] text-slate-600">
                أدنى {offer.min_order_quantity} {offer.unit}
                {offer.max_order_quantity ? ` · أقصى ${offer.max_order_quantity}` : ''}
              </td>
              <td className="p-3">
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                  {opportunityReasonLabel(offer.opportunity_reason, locale)}
                </span>
              </td>
              <td className="p-3">
                <span
                  className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${offerStatusStyle(offer.status)}`}
                >
                  {offerStatusLabel(offer.status)}
                </span>
                {offer.expiry_date && formatDate(offer.expiry_date, locale) && (
                  <div className="pt-1 text-[10px] text-slate-400">الصلاحية: {formatDate(offer.expiry_date, locale)}</div>
                )}
              </td>
              <td className="p-3">
                <RowActions offer={offer} busy={busy} onEdit={onEdit} onAction={onAction} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/**
 * One row's controls, and the sentence that replaces them when there are none.
 *
 * An empty cell reads as a broken screen. `offerStatusHint()` says whose decision the
 * state is — the reviewer's, the market's, or nobody's any more — which is the
 * information the seller actually came to the shelf for.
 */
const RowActions: React.FC<{
  offer: Offer;
  busy: boolean;
  onEdit: (offer: Offer) => void;
  onAction: (action: SellerRequestAction, offer: Offer) => void;
}> = ({ offer, busy, onEdit, onAction }) => {
  const actions = sellerActionsFor(offer.status);
  const hint = offerStatusHint(offer.status);

  if (actions.length === 0) {
    return <span className="text-[10px] leading-relaxed text-slate-400">{hint ?? 'لا إجراءات.'}</span>;
  }

  return (
    <div className="flex min-w-[9rem] flex-wrap items-center gap-1.5">
      {actions.map((action) => (
        <RowButton
          key={action}
          action={action}
          busy={busy}
          onClick={() => (action === 'EDIT' ? onEdit(offer) : onAction(action, offer))}
        />
      ))}
      {hint && <p className="basis-full text-[10px] leading-relaxed text-slate-400">{hint}</p>}
    </div>
  );
};

const TONE_CLASSES: Record<(typeof SELLER_OFFER_ACTIONS)[SellerOfferAction]['tone'], string> = {
  primary: 'bg-emerald-600 text-white hover:bg-emerald-700',
  neutral: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100',
  warn: 'bg-amber-50 text-amber-700 hover:bg-amber-100',
  danger: 'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50',
};

const ACTION_ICONS: Partial<Record<SellerOfferAction, React.ComponentType<{ className?: string }>>> = {
  EDIT: Package,
  SUBMIT: Send,
  DELETE: Trash2,
  PAUSE: Pause,
  RESUME: Play,
  WITHDRAW: Clock,
};

const RowButton: React.FC<{ action: SellerOfferAction; busy: boolean; onClick: () => void }> = ({
  action,
  busy,
  onClick,
}) => {
  const spec = SELLER_OFFER_ACTIONS[action];
  const Icon = ACTION_ICONS[action];

  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-bold disabled:opacity-40 ${TONE_CLASSES[spec.tone]}`}
    >
      {Icon ? <Icon className="w-3 h-3" /> : null}
      <span>{spec.label}</span>
    </button>
  );
};
