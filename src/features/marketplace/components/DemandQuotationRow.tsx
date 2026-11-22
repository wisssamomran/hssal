import React from 'react';
import { formatMoney, num } from '@/core/config';
import { arabicCount } from '@/core/i18n';
import { quotationSellerName, quotationStatusLabel } from '../demand';
import type { Quotation } from '../types';
import { Fact, recorded } from '@/shared/ui/panel';

/**
 * A quotation as the platform stored it, read back to the buyer who owns the demand.
 *
 * The figures are the server's, unchanged: `total_amount` is what
 * `QuotationSubmissionService::submit()` computed from the quantity and the unit price
 * and wrote to the row, which is why the two are shown beside each other rather than
 * one of them alone — a buyer who adds up quotes compares that total, and a total whose
 * two inputs are hidden from them cannot be checked.
 *
 * The status is shown even when it is the only one a route can produce. `SUBMITTED`
 * means nobody has acted on this price, and the sentence beside it says so rather than
 * letting an unlabelled row look like a decision.
 *
 * The quantity is read in the buyer's unit because it is the only unit there is:
 * `quotations` stores a number and no unit column, so the demand's own — which the
 * server validated the quote against — is what the figure means.
 */
export const DemandQuotationRow: React.FC<{ quotation: Quotation; unit: string }> = ({ quotation, unit }) => (
  <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
    <div className="flex items-center justify-between gap-2">
      <span className="font-mono text-[10px] text-slate-500">{quotation.quotation_number}</span>
      <span className="text-[10px] font-bold text-slate-700">{quotationStatusLabel(quotation.status)}</span>
    </div>

    <div className="grid grid-cols-2 gap-2">
      <Fact label="المورِد" value={quotationSellerName(quotation)} />
      <Fact label="الكمية المعروضة" value={`${num(quotation.quoted_quantity)} ${unit}`} />
      <Fact label="سعر الوحدة" value={formatMoney(quotation.unit_price, quotation.currency_code)} />
      <Fact label="الإجمالي المسجَّل" value={formatMoney(quotation.total_amount, quotation.currency_code)} />
      <Fact
        label="سريان العرض"
        value={
          quotation.validity_days
            ? arabicCount(num(quotation.validity_days), {
                one: 'يوم واحد',
                two: 'يومان',
                few: 'أيام',
                many: 'يوماً',
              })
            : recorded(null)
        }
      />
    </div>

    {quotation.notes ? <p className="text-[11px] text-slate-600">{quotation.notes}</p> : null}
  </div>
);
