import React, { useEffect, useState } from 'react';
import { Copy, QrCode } from 'lucide-react';
import type { Locale } from '@/core/i18n';
import { formatDateTime } from '@/core/i18n';
import { formatMoney, num, percent } from '@/core/config';
import { ValueRow } from '@/shared/ui/panel';
import { Sheet } from '@/shared/ui/Sheet';
import { getHandover } from '../api';
import type { Deal, DealStatus, HandoverView } from '../types';
import { dealStatusLabel } from '../labels';
import { QrGlyph } from './QrGlyph';

/**
 * The contract as one record: the two businesses, the frozen price, the delivery
 * code and everything the platform has witnessed about it.
 *
 * The code is re-read from its own endpoint rather than taken on trust from the
 * list. The list row is a moment old by the time a person opens this sheet, and
 * somebody at the gate may have spent the code in between; this is also where
 * `verifiable` comes from, since that answer is the state machine's, not a column.
 */
export const DealDetail: React.FC<{
  deal: Deal;
  locale: Locale;
  onClose: () => void;
}> = ({ deal, locale, onClose }) => {
  const vat = locale === 'ar' ? 'الرقم الضريبي' : 'Tax number';
  const [handover, setHandover] = useState<HandoverView | null>(null);

  useEffect(() => {
    let live = true;
    setHandover(null);

    // Only when a code is known to exist: `deals/{id}/handover` answers 422 with
    // `HANDOVER_NOT_ISSUED` before the seller accepts, and asking a question the
    // list already answered would only turn a normal state into a failed call.
    if (!deal.handover) return;

    void getHandover(deal.id).then((response) => {
      if (live && response.success && response.data) setHandover(response.data);
    });

    return () => {
      live = false;
    };
  }, [deal.id, deal.handover]);

  const record = handover ?? deal.handover;

  return (
    <Sheet
      size="xl"
      title={
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-black text-slate-900">{deal.deal_number}</span>
            <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800">
              {dealStatusLabel(deal.status, locale)}
            </span>
          </div>
          <p className="pt-0.5 text-xs text-slate-500">
            {locale === 'ar' ? 'لقطة تجارية مثبتة وقت إنشاء الصفقة' : 'Commercial snapshot frozen when the deal was formed'}
          </p>
        </div>
      }
      onClose={onClose}
    >
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs sm:grid-cols-2">
        <div className="space-y-1">
          <span className="text-slate-400">{locale === 'ar' ? 'الطرف الأول (البائع)' : 'First party (seller)'}</span>
          <p className="font-bold text-slate-900">{deal.seller_organization?.name_ar || '—'}</p>
          <p className="text-[11px] text-slate-500">
            {vat}: {deal.seller_organization?.vat_number || (locale === 'ar' ? 'غير مسجَّل' : 'not recorded')}
          </p>
        </div>
        <div className="space-y-1">
          <span className="text-slate-400">{locale === 'ar' ? 'الطرف الثاني (المشتري)' : 'Second party (buyer)'}</span>
          <p className="font-bold text-slate-900">{deal.buyer_organization?.name_ar || '—'}</p>
          <p className="text-[11px] text-slate-500">
            {vat}: {deal.buyer_organization?.vat_number || (locale === 'ar' ? 'غير مسجَّل' : 'not recorded')}
          </p>
        </div>
      </div>

      {deal.items && deal.items.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-slate-800">
            {locale === 'ar' ? 'أصناف الصفقة (لقطة ثابتة)' : 'Deal lines (immutable snapshot)'}
          </h4>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full min-w-[520px] text-right text-xs">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="p-2.5 font-semibold">{locale === 'ar' ? 'المنتج' : 'Product'}</th>
                  <th className="p-2.5 font-semibold">SKU</th>
                  <th className="p-2.5 font-semibold">{locale === 'ar' ? 'الكمية' : 'Qty'}</th>
                  <th className="p-2.5 font-semibold">{locale === 'ar' ? 'سعر الوحدة' : 'Unit'}</th>
                  <th className="p-2.5 font-semibold">{locale === 'ar' ? 'الإجمالي' : 'Total'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deal.items.map((item) => (
                  <tr key={item.id}>
                    <td className="p-2.5 font-bold text-slate-900">{item.snapshot_product_name || '—'}</td>
                    <td className="p-2.5 font-mono text-slate-500">{item.snapshot_sku || '—'}</td>
                    <td className="p-2.5">
                      {num(item.quantity)} {item.snapshot_unit_name ?? ''}
                    </td>
                    <td className="p-2.5">{formatMoney(item.unit_price, deal.currency_code)}</td>
                    <td className="p-2.5 font-bold text-emerald-800">{formatMoney(item.subtotal_amount, deal.currency_code)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs sm:p-4">
        <ValueRow label={locale === 'ar' ? 'قيمة البضاعة' : 'Goods value'} value={formatMoney(deal.base_amount, deal.currency_code)} />
        <ValueRow
          label={
            locale === 'ar'
              ? `الضريبة (${percent(deal.tax_rate_snapshot)})`
              : `Tax (${percent(deal.tax_rate_snapshot)})`
          }
          value={formatMoney(deal.tax_amount, deal.currency_code)}
        />
        <ValueRow
          label={
            locale === 'ar'
              ? `عمولة المنصة (${percent(deal.platform_fee_rate_snapshot)})`
              : `Platform fee (${percent(deal.platform_fee_rate_snapshot)})`
          }
          value={formatMoney(deal.platform_fee_amount, deal.currency_code)}
        />
        {num(deal.delivery_fee_amount) > 0 && (
          <ValueRow
            label={locale === 'ar' ? 'أجرة التوصيل' : 'Delivery fee'}
            value={formatMoney(deal.delivery_fee_amount, deal.currency_code)}
          />
        )}
        {/* The total is read as the last line of a sum, so it keeps the rule above
            it rather than only a weight change: without the divider this is a
            number in a column, with it this is the answer. */}
        <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-sm font-black text-slate-900">
          <span>{locale === 'ar' ? 'الإجمالي على المشتري' : 'Buyer total'}</span>
          <span className="font-serif text-emerald-700">{formatMoney(deal.buyer_total_amount, deal.currency_code)}</span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>{locale === 'ar' ? 'صافي البائع' : 'Seller net'}</span>
          <span>{formatMoney(deal.seller_net_amount, deal.currency_code)}</span>
        </div>
        {deal.exchange_rate_snapshot && deal.base_currency && deal.base_currency !== deal.currency_code && (
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>{locale === 'ar' ? `سعر الصرف المثبَّت إلى ${deal.base_currency}` : `Frozen rate to ${deal.base_currency}`}</span>
            <span className="font-mono">
              {num(deal.exchange_rate_snapshot)} • {deal.rate_source || '—'}
            </span>
          </div>
        )}
      </div>

      {/*
        Money and the delivery code.

        There is no payment endpoint on this platform: HASSAL does not hold a
        customer's money, so this block reports the price the record froze and
        says plainly that settling it happens between the two businesses. No
        screen here shows a bank account or confirms a transfer a real source
        never reported.

        What the platform *does* witness is the handover of the goods, and that
        is the record below: the code issued when the seller accepted the order,
        and the moment a scan spent it.
      */}
      <div className="space-y-2 rounded-xl border border-slate-200 p-3.5">
        <h4 className="flex items-center gap-2 text-xs font-bold text-slate-800">
          <QrCode className="h-4 w-4 text-slate-500" />
          {locale === 'ar' ? 'كود التسليم' : 'Delivery code'}
        </h4>

        {record ? (
          <div className="space-y-1.5 text-[11px] text-slate-600">
            <div className="flex items-center justify-between gap-2">
              <span>{locale === 'ar' ? 'الرمز' : 'Code'}</span>
              <span dir="ltr" className="font-mono font-bold text-slate-900">{record.code}</span>
            </div>

            {/* This sheet is the record, and a record is also what somebody prints
                when the phone that carried the code did not arrive with the goods.
                The symbol from `GET /deals/{id}/handover` is drawn here — unspent
                only — so the same picture is on the screen whether the buyer is
                holding it up at a gate or a desk is sending it to a printer. */}
            {handover?.qr && handover.status === 'ACTIVE' && (
              <div className="flex justify-center border-y border-slate-100 py-3">
                <QrGlyph symbol={handover.qr} className="h-[min(52vw,220px)] w-[min(52vw,220px)] min-w-[140px]" />
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <span>{locale === 'ar' ? 'حالته' : 'State'}</span>
              <span className={`font-bold ${record.status === 'USED' ? 'text-emerald-700' : record.status === 'ACTIVE' ? 'text-amber-700' : 'text-slate-500'}`}>
                {record.status === 'USED'
                  ? (locale === 'ar' ? 'استُخدم مرة واحدة' : 'Spent, once')
                  : record.status === 'ACTIVE'
                    ? (locale === 'ar' ? 'فعّال لم يُستخدم' : 'Live, unused')
                    : (locale === 'ar' ? 'مسحوب مع إيقاف العقد' : 'Retired with the order')}
              </span>
            </div>
            {record.issued_at && (
              <div className="flex items-center justify-between gap-2">
                <span>{locale === 'ar' ? 'أُصدر' : 'Issued'}</span>
                <span>{formatDateTime(record.issued_at, locale) || record.issued_at}</span>
              </div>
            )}
            {record.verified_at && (
              <div className="flex items-center justify-between gap-2">
                <span>{locale === 'ar' ? 'مُسح في' : 'Scanned'}</span>
                <span>{formatDateTime(record.verified_at, locale) || record.verified_at}</span>
              </div>
            )}
            {record.verified_at && record.verified_by_organization_id && (
              <div className="flex items-center justify-between gap-2">
                <span>{locale === 'ar' ? 'من طرف' : 'By side'}</span>
                <span>
                  {record.verified_by_organization_id === deal.buyer_organization_id
                    ? (locale === 'ar' ? 'المشتري' : 'Buyer')
                    : record.verified_by_organization_id === deal.seller_organization_id
                      ? (locale === 'ar' ? 'البائع' : 'Seller')
                      : `#${record.verified_by_organization_id}`}
                </span>
              </div>
            )}
            {record.verification_notes && (
              <p className="border-t border-slate-100 pt-1.5 leading-relaxed text-slate-600">
                {record.verification_notes}
              </p>
            )}

            {/* The label's own text, from the endpoint that computes it. Whoever
                prints the sticker encodes this string, not the bare code — the
                payload carries the order number, so a label that wanders off to
                another pallet says so the moment it is read. */}
            {handover && (
              <div className="space-y-1 border-t border-slate-100 pt-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span>{locale === 'ar' ? 'ما يرمّزه الملصق' : 'What the label encodes'}</span>
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard?.writeText(handover.qr_payload).catch(() => undefined)}
                    className="flex shrink-0 cursor-pointer items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    <Copy className="h-3 w-3" />
                    {locale === 'ar' ? 'نسخ' : 'Copy'}
                  </button>
                </div>
                <p dir="ltr" className="break-all font-mono text-[10px] text-slate-500">{handover.qr_payload}</p>
                <p className="text-[10px] leading-relaxed text-slate-500">
                  {handover.verifiable
                    ? (locale === 'ar'
                      ? 'هذا الرمز قابل للمسح في حالة الصفقة الحالية.'
                      : 'This code can be scanned in the order’s current state.')
                    : (locale === 'ar'
                      ? 'لا يقبل النظام مسح هذا الرمز في حالة الصفقة الحالية — إمّا استُخدم أو سُحب أو أن الأمر أُغلق.'
                      : 'The system will not accept a scan of this code in the order’s current state — it is spent, retired, or the matter is closed.')}
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[11px] leading-relaxed text-slate-500">
            {locale === 'ar'
              ? 'لم يُصدر رمز تسليم بعد؛ يُصدره النظام لحظة قبول البائع للطلب، ولا تُغلق الصفقة بدونه.'
              : 'No delivery code has been issued yet; the system issues it when the seller accepts the order, and the order cannot close without it.'}
          </p>
        )}

        <p className="border-t border-slate-100 pt-2 text-[11px] leading-relaxed text-slate-600">
          {locale === 'ar'
            ? 'أما المال فليس من شأن هذه الشاشة: تتم التسوية بين المنشأتين خارج المنصة، ولا تعرض هنا رقم حساب ولا تؤكد دفعًا لم يرد به خبر من مصدر حقيقي.'
            : 'The money is not this screen’s business: settlement happens between the two businesses outside the platform, and no bank account or payment confirmation appears here.'}
        </p>
      </div>

      {deal.status_histories && deal.status_histories.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-slate-800">{locale === 'ar' ? 'سجل الحالات' : 'Status history'}</h4>
          <ul className="max-h-44 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
            {deal.status_histories.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
                <span className="min-w-0 flex-1">
                  {dealStatusLabel(entry.from_status as DealStatus, locale)} ← {dealStatusLabel(entry.to_status as DealStatus, locale)}
                  {entry.notes ? ` — ${entry.notes}` : ''}
                </span>
                <span className="shrink-0 text-[10px] text-slate-400">
                  {formatDateTime(entry.created_at, locale) || entry.created_at}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  );
};
