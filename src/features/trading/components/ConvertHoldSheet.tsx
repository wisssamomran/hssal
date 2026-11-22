import React, { useState } from 'react';
import { PackageCheck } from 'lucide-react';
import { formatMoney, num } from '@/core/config';
import type { Locale } from '@/core/i18n';
import { formatDateTime } from '@/core/i18n';
import { Sheet } from '@/shared/ui/Sheet';
import type { Reservation } from '../types';

/** How the goods reach the buyer, as the contract records it. */
export type DeliveryMethod = 'PICKUP' | 'SELLER_DELIVERY' | 'THIRD_PARTY_CARRIER';

/**
 * Turning a hold into a contract.
 *
 * The quantity is already reserved; what this step adds is the price and the terms
 * as they were agreed at that moment. The server freezes them into a snapshot that
 * later changes to the platform's settings never rewrite — which is the sentence a
 * person needs before pressing it, because it is the difference between an offer
 * that still moves and a document two businesses will read back in a year.
 */
export const ConvertHoldSheet: React.FC<{
  reservation: Reservation;
  locale: Locale;
  /** A conversion for this hold is on the wire. */
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: { delivery_method: DeliveryMethod; delivery_address?: string }) => void;
}> = ({ reservation, locale, pending, onClose, onSubmit }) => {
  const [method, setMethod] = useState<DeliveryMethod>('PICKUP');
  const [address, setAddress] = useState('');

  return (
    <Sheet title={locale === 'ar' ? 'تحويل الحجز إلى صفقة' : 'Convert hold into a deal'} onClose={onClose}>
      <p className="text-xs text-slate-600">
        {locale === 'ar'
          ? 'الكمية محجوزة بالفعل لهذا الحجز؛ إنشاء الصفقة يثبّت السعر وتاريخ الحجز في لقطة لا تتغير بتغيير الإعدادات لاحقاً.'
          : 'The quantity is already held. Forming the deal freezes price and hold terms into a snapshot that later setting changes never rewrite.'}
      </p>

      <dl className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <dt className="text-slate-500">{locale === 'ar' ? 'رقم الحجز' : 'Reservation'}</dt>
          <dd className="font-mono font-bold">{reservation.reservation_number}</dd>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <dt className="text-slate-500">{locale === 'ar' ? 'الكمية' : 'Quantity'}</dt>
          <dd className="font-semibold">
            {num(reservation.quantity)} {reservation.offer?.unit ?? ''}
          </dd>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <dt className="text-slate-500">{locale === 'ar' ? 'سعر الوحدة' : 'Unit price'}</dt>
          <dd className="font-semibold">{formatMoney(reservation.unit_price, reservation.currency_code)}</dd>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-t border-slate-200 pt-1.5">
          <dt className="text-slate-500">{locale === 'ar' ? 'قيمة البضاعة' : 'Goods value'}</dt>
          <dd className="font-black text-emerald-800">{formatMoney(reservation.total_amount, reservation.currency_code)}</dd>
        </div>
        {reservation.expires_at && formatDateTime(reservation.expires_at, locale) && (
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-amber-700">
            <dt>{locale === 'ar' ? 'ينتهي الحجز' : 'Hold expires'}</dt>
            <dd className="font-semibold">{formatDateTime(reservation.expires_at, locale)}</dd>
          </div>
        )}
      </dl>

      <label className="block text-xs font-bold text-slate-700">
        {locale === 'ar' ? 'طريقة التسليم' : 'Delivery method'}
        <select
          value={method}
          onChange={(event) => setMethod(event.target.value as DeliveryMethod)}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2.5 font-normal outline-none focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value="PICKUP">{locale === 'ar' ? 'استلام من المستودع' : 'Buyer pickup'}</option>
          <option value="SELLER_DELIVERY">{locale === 'ar' ? 'توصيل من البائع' : 'Seller delivery'}</option>
          <option value="THIRD_PARTY_CARRIER">{locale === 'ar' ? 'ناقل خارجي' : 'Third-party carrier'}</option>
        </select>
      </label>

      {/* An address means nothing to a pickup, and sending an empty one is the
          server's business to refuse — so the field appears with the choice that
          needs it instead of standing there demanding a reason to leave it blank. */}
      {method !== 'PICKUP' && (
        <label className="block text-xs font-bold text-slate-700">
          {locale === 'ar' ? 'عنوان التسليم' : 'Delivery address'}
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs font-normal focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </label>
      )}

      <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:gap-3">
        <button
          type="button"
          onClick={onClose}
          className="w-full cursor-pointer rounded-xl bg-slate-100 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-200 sm:w-auto sm:flex-1 sm:py-2.5"
        >
          {locale === 'ar' ? 'تراجع' : 'Back'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            onSubmit({
              delivery_method: method,
              delivery_address: address.trim() || undefined,
            })
          }
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 sm:w-auto sm:flex-1 sm:py-2.5"
        >
          <PackageCheck className="h-4 w-4" />
          {locale === 'ar' ? 'إنشاء الصفقة' : 'Form the deal'}
        </button>
      </div>
    </Sheet>
  );
};
