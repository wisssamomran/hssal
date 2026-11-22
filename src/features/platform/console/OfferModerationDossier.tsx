import React from 'react';
import { ErrorNote, Fact, recorded } from '@/shared/ui/panel';
import { Offer } from '@/features/marketplace/types';
import { ORGANIZATION_DOCUMENT_TYPE_LABELS, organizationStatusLabel } from '@/features/organizations/review';
import { formatDateTime, getLocale } from '@/core/i18n';

/**
 * Everything a reviewer needs that is not on the listing itself.
 *
 * The server already assembles this per row (`OfferController::moderationContext`);
 * before this panel existed the reviewer saw a title, a price and a city, and had
 * to know to open three other screens to see whether the business behind the
 * listing had ever filed a registration certificate at all. That is how a
 * moderation queue turns into a rubber stamp.
 *
 * Two wording rules hold throughout:
 *
 *   * A date in the legal record is *this platform's own* decision, so it reads
 *     «قرّر موظف المنصة» and never implies a ministry confirmed a number (§7).
 *   * A waiting time is measured from the row's last write, because the offers
 *     table records no submission timestamp; the panel says so rather than
 *     presenting it as an exact queue age.
 */
export const ModerationDossier: React.FC<{ offer: Offer }> = ({ offer }) => {
  const locale = getLocale();
  const ar = locale === 'ar';
  const context = offer.moderation;

  if (!context) {
    return (
      <ErrorNote
        text={ar
          ? 'لم يُرسل الخادم ملف المراجعة لهذا العرض؛ اعرض القائمة من جديد قبل اتخاذ قرار.'
          : 'The server sent no review dossier for this listing; reload the queue before deciding.'}
      />
    );
  }

  const legal = context.seller_legal_record;
  const history = context.seller_history;
  const documents = context.documents ?? [];

  return (
    // On a handset the dossier sits inside a swipeable table row, so it is capped
    // to the screen width: a reviewer who opens it must read it without swiping
    // back and forth under every tile.
    <div className="space-y-3 max-w-[calc(100vw-2.5rem)] sm:max-w-none">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-[11px] font-black text-slate-900">
          {ar ? 'ملف المراجعة' : 'Review dossier'}
        </h4>
        {offer.show_seller_identity === false ? (
          <span className="text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 rounded-full px-2 py-0.5">
            {ar ? 'هذا البائع لن يُظهر اسمه في السوق' : 'This seller hides their name on the market'}
          </span>
        ) : null}
        {context.waiting_hours !== null && context.waiting_hours !== undefined ? (
          <span className="text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-200 rounded-full px-2 py-0.5">
            {ar
              ? `منتظر منذ ${context.waiting_hours} ساعة (محسوبة من آخر كتابة على الصف، فلا تاريخ تقديم مسجّل)`
              : `Waiting ~${context.waiting_hours} h, measured from the row's last write`}
          </span>
        ) : null}
      </div>

      {legal ? (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Fact label={ar ? 'المنشأة' : 'Business'} value={recorded(legal.name_ar)} />
          <Fact label={ar ? 'البلد / المدينة' : 'Country / city'} value={`${recorded(legal.country_code)} · ${recorded(legal.city)}`} />
          <Fact label={ar ? 'حالة المنشأة لدى المنصة' : 'Status on platform'} value={organizationStatusLabel(legal.platform_status)} />
          <Fact label={ar ? 'آخر قرار لحالة المنشأة' : 'Last status decision'} value={legal.reviewed_at ? formatDateTime(legal.reviewed_at, locale) : recorded(null)} />
          <Fact label={ar ? 'رقم السجل التجاري' : 'Registration no.'} value={recorded(legal.registration_no)} />
          <Fact label={ar ? 'الرقم الضريبي' : 'Tax no.'} value={recorded(legal.tax_no)} />
          <Fact label={ar ? 'الهاتف' : 'Phone'} value={recorded(legal.phone)} />
          <Fact label={ar ? 'الموقع الإلكتروني' : 'Website'} value={recorded(legal.website)} />
          <Fact label={ar ? 'عدد أعضاء المنشأة' : 'Members'} value={String(legal.member_count)} />
        </div>
      ) : (
        <ErrorNote text={ar ? 'لا سجل منشأة مُرفق بهذا العرض.' : 'No business record is attached to this listing.'} />
      )}

      <div>
        <div className="text-[10px] font-bold text-slate-600 mb-1">
          {ar
            ? 'الوثائق التي رفعتها المنشأة — والقرارات المسجّلة عليها من موظف المنصة، لا تصديق أي جهة خارجية'
            : 'Papers the business filed — and this platform staff’s own decisions on them, not a third party’s confirmation'}
        </div>
        {!documents.length ? (
          <ErrorNote
            text={ar
              ? 'لم ترفع هذه المنشأة أي وثيقة: لا يمكن معاينة شهادة لم تُرفع، وقرار النشر هنا على ما في العرض وحده.'
              : 'This business has filed nothing: there is no certificate to read, so a decision here rests on the listing alone.'}
          />
        ) : (
          <ul className="space-y-1">
            {documents.map((document) => (
              <li key={document.id} className="flex flex-wrap items-center gap-2 text-[10px] bg-white border border-slate-200 rounded-lg px-2 py-1.5">
                <span className="font-bold text-slate-800">{ORGANIZATION_DOCUMENT_TYPE_LABELS[document.type] ?? document.type}</span>
                <span
                  className={`rounded px-1.5 py-0.5 font-bold border ${
                    document.status === 'accepted'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : document.status === 'rejected'
                        ? 'bg-rose-50 border-rose-200 text-rose-900'
                        : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  {document.status === 'accepted'
                    ? (ar ? 'قبِلها المراجع' : 'Accepted')
                    : document.status === 'rejected'
                      ? (ar ? 'رفضها المراجع' : 'Rejected')
                      : (ar ? 'بانتظار المراجعة' : 'Awaiting review')}
                </span>
                {document.reference_number ? <span className="text-slate-600">{document.reference_number}</span> : null}
                {document.reviewed_by ? (
                  <span className="text-slate-500">
                    {ar ? `باسم ${document.reviewed_by}` : `by ${document.reviewed_by}`}
                  </span>
                ) : null}
                {document.url ? (
                  <a href={document.url} target="_blank" rel="noreferrer" className="font-bold text-emerald-800 underline">
                    {ar ? 'فتح النسخة' : 'Open copy'}
                  </a>
                ) : (
                  <span className="text-slate-400">{ar ? 'نسخة غير متاحة' : 'copy unavailable'}</span>
                )}
                {document.review_reason ? (
                  <span className="w-full text-rose-800">{ar ? 'سبب القرار: ' : 'Reason: '}{document.review_reason}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {history ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Fact label={ar ? 'عروض' : 'Offers'} value={String(history.offers_total)} />
          <Fact label={ar ? 'معروضة الآن' : 'Active'} value={String(history.offers_active)} />
          <Fact label={ar ? 'منتهية' : 'Expired'} value={String(history.offers_expired)} />
          <Fact label={ar ? 'صفقات' : 'Deals'} value={String(history.deals_total)} />
          <Fact label={ar ? 'مُسدَّدة' : 'Settled'} value={String(history.deals_settled)} />
          <Fact label={ar ? 'متنازَع عليها' : 'Disputed'} value={String(history.deals_disputed)} />
        </div>
      ) : null}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Fact label={ar ? 'المستودع' : 'Warehouse'} value={recorded(context.warehouse?.name)} />
        <Fact label={ar ? 'رمز المستودع' : 'Warehouse code'} value={recorded(context.warehouse?.code)} />
        <Fact
          label={ar ? 'الإحداثيات' : 'Coordinates'}
          value={context.warehouse?.lat && context.warehouse?.lon
            ? `${context.warehouse.lat}, ${context.warehouse.lon}`
            : recorded(null)}
        />
        <Fact label={ar ? 'صور المنتج' : 'Product images'} value={String(context.image_count ?? 0)} />
      </div>
    </div>
  );
};
