import React from 'react';
import { ChevronRight, Clock, Truck } from 'lucide-react';
import { formatMoney, num } from '@/core/config';
import type { Locale } from '@/core/i18n';
import { formatDateTime } from '@/core/i18n';
import { ValueRow } from '@/shared/ui/panel';
import type { Reservation } from '../types';

/**
 * The quantities a seller has agreed to keep.
 *
 * A hold is what acceptance buys: the stock is off the shelf and priced, but it is
 * not yet a contract, and it expires. So this tab is the one place a person can see
 * the two ways a held quantity leaves them — converted into a deal, or given back —
 * and the difference in wording matters: converting freezes price and terms into a
 * snapshot, releasing returns the units to the seller's available stock.
 */
export const ReservationsTab: React.FC<{
  reservations: Reservation[];
  locale: Locale;
  canRelease: boolean;
  releasingId: number | null;
  onRelease: (reservation: Reservation) => void;
  onSelect: (reservation: Reservation) => void;
}> = ({ reservations, locale, canRelease, releasingId, onRelease, onSelect }) => {
  if (reservations.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500 sm:p-12">
        {locale === 'ar'
          ? 'لا توجد حجوزات نشطة. الحجز يبدأ حين يقبل البائع طلب شراء مرسلاً إليه من عرض أو من مطابقة.'
          : 'No active holds. A hold begins when the seller accepts a purchase request raised against one of their offers or matches.'}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {reservations.map((reservation) => (
        <article key={reservation.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <span className="block font-mono text-xs font-bold text-slate-900">{reservation.reservation_number}</span>
              <p className="text-xs text-slate-500 line-clamp-2" title={reservation.offer?.title_ar ?? undefined}>
                {reservation.offer?.title_ar || '—'}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
              {locale === 'ar' ? 'كمية محجوزة' : 'Stock held'}
            </span>
          </div>

          <div className="space-y-1 text-xs">
            <ValueRow
              label={locale === 'ar' ? 'الكمية' : 'Quantity'}
              value={`${num(reservation.quantity)} ${reservation.offer?.unit ?? ''}`}
            />
            <ValueRow
              label={locale === 'ar' ? 'القيمة' : 'Value'}
              value={formatMoney(reservation.total_amount, reservation.currency_code)}
            />
            <ValueRow
              label={locale === 'ar' ? 'تفضيل التسليم' : 'Delivery preference'}
              value={
                reservation.delivery_preference === 'DELIVERY'
                  ? locale === 'ar' ? 'توصيل' : 'Delivery'
                  : locale === 'ar' ? 'استلام' : 'Pickup'
              }
            />
            {reservation.expires_at && formatDateTime(reservation.expires_at, locale) && (
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-amber-700">
                <dt className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  {locale === 'ar' ? 'ينتهي' : 'Expires'}
                </dt>
                <dd className="font-semibold">{formatDateTime(reservation.expires_at, locale)}</dd>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => onSelect(reservation)}
            className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700"
          >
            <Truck className="h-3.5 w-3.5" />
            {locale === 'ar' ? 'تحويل الحجز إلى صفقة' : 'Form a deal from this hold'}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>

          {canRelease ? (
            <button
              type="button"
              disabled={releasingId !== null}
              onClick={() => onRelease(reservation)}
              className="w-full cursor-pointer rounded-lg border border-slate-300 bg-white py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:cursor-wait disabled:opacity-50"
            >
              {releasingId === reservation.id
                ? locale === 'ar'
                  ? 'جارٍ الإطلاق…'
                  : 'Releasing…'
                : locale === 'ar'
                  ? 'التخلّي عن الكمية وإعادتها للبائع'
                  : 'Give this hold back'}
            </button>
          ) : (
            <p className="text-[10px] leading-relaxed text-slate-400">
              {locale === 'ar'
                ? 'إطلاق الكمية المحجوزة ليس ضمن صلاحية هذه الجلسة.'
                : 'Releasing held stock is outside this session’s permissions.'}
            </p>
          )}
        </article>
      ))}
    </div>
  );
};
