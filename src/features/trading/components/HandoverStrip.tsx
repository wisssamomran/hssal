import React, { useEffect, useState } from 'react';
import { Copy, Printer, QrCode, ScanLine } from 'lucide-react';
import type { Locale } from '@/core/i18n';
import { formatDateTime } from '@/core/i18n';
import { getHandover, handoverLabelUrl } from '../api';
import type { Deal, QrSymbol } from '../types';
import type { DealSide } from '../deal-machine';
import { QrGlyph } from './QrGlyph';

/**
 * What this order's delivery code looks like from where the reader is standing.
 *
 * Three sentences and no more, because each is a different fact about goods:
 *
 *   no code      — the seller has not accepted, so nothing has been issued. The
 *                  server says the same thing when asked, which is why this is a
 *                  line rather than an empty box.
 *   active code  — the label is printed and unspent. The order cannot be opened
 *                  for inspection or closed until somebody at the gate reads it
 *                  to the platform, so the screen says that in the same breath as
 *                  it shows the characters.
 *   spent        — the receipt the whole cycle exists to produce: when, and that
 *                  it happened once.
 *
 * A retired code is shown as retired. It is not deleted from view, because "the
 * order was called off and its proof of delivery was withdrawn" is a thing two
 * businesses may need to read back months later.
 */
export const HandoverStrip: React.FC<{
  deal: Deal;
  locale: Locale;
  side: DealSide;
  /** Whether this session operates the gate; `deal-machine.ts` answers it. */
  canScan: boolean;
  onScan: () => void;
}> = ({ deal, locale, side, canScan, onScan }) => {
  const handover = deal.handover ?? null;
  const [copied, setCopied] = useState(false);
  const [presented, setPresented] = useState(false);
  const [symbol, setSymbol] = useState<QrSymbol | null>();
  const [labelUrl, setLabelUrl] = useState<string | null>(null);
  const [labelNote, setLabelNote] = useState<string | null>(null);

  // An object URL is a live reference to a document holding a live code. When
  // this card stops being looked at, the reference goes with it.
  useEffect(() => () => {
    if (labelUrl) window.URL.revokeObjectURL(labelUrl);
  }, [labelUrl]);

  const openLabel = () => {
    setLabelNote(null);
    void handoverLabelUrl(deal.id).then((result) => {
      if (result.success && result.url) setLabelUrl(result.url);
      else setLabelNote(result.message ?? (locale === 'ar' ? 'تعذّر تجهيز الملصق.' : 'The label could not be prepared.'));
    });
  };

  /**
   * Show the code — and ask, once, for the thing to show.
   *
   * The pipeline list carries the handover row: the characters, their status, who
   * spent them. It does not carry a symbol, because encoding one for every order on
   * the screen would be forty QR builds for the handful of times a person actually
   * holds a phone up to a monitor. So the grid arrives from `GET /deals/{id}/handover`
   * — the same endpoint the detail sheet re-reads for `verifiable` — fetched on the
   * press that means somebody wants it.
   *
   * `symbol` therefore has three states and they are not interchangeable:
   * `undefined` means not asked yet or still on the wire, `null` means asked and the
   * platform cannot build one (the payload needs a bigger symbol than §4.7 encodes),
   * and a value means draw it. The last two both end at the characters, but only the
   * second one says why — a screen that silently downgrades to a text code reads as
   * a design choice, and it is a limitation somebody at a loading bay has a right to
   * see.
   */
  const present = () => {
    const opening = !presented;
    setPresented(opening);

    if (!opening || handover === null || symbol !== undefined) return;

    void getHandover(deal.id).then((response) => {
      // A failure is not turned into a message: the response's own error code
      // belongs to the scan sheet and the closing gate, not to a picture. Here
      // the only useful outcome is that the characters stay on screen, which is
      // what `null` already produces.
      setSymbol(response.success ? (response.data?.qr ?? null) : null);
    });
  };

  if (!handover) {
    if (deal.status !== 'PENDING_SELLER_APPROVAL' && deal.status !== 'DRAFT') return null;

    return (
      <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
        {locale === 'ar'
          ? 'يصدر رمز التسليم حين يقبل البائع هذا العقد، ولا تُغلق الصفقة بدونه.'
          : 'The delivery code is issued when the seller accepts this contract, and the order cannot be closed without it.'}
      </p>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(handover.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // A browser that refuses the clipboard is not a reason to hide the code;
      // it is on the screen to be read, and the label it was printed on is
      // beside the goods anyway.
      setCopied(false);
    }
  };

  return (
    <div
      className={`space-y-1.5 rounded-lg border px-3 py-2 text-[11px] ${
        handover.status === 'USED'
          ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
          : handover.status === 'ACTIVE'
          ? 'border-blue-200 bg-white text-slate-700'
          : 'border-slate-200 bg-white text-slate-500'
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <QrCode className="h-3.5 w-3.5 shrink-0" />
        <span className="font-bold">
          {locale === 'ar' ? 'رمز التسليم' : 'Handover code'}
        </span>
        <span dir="ltr" className="min-w-0 font-mono text-[12px] font-black tracking-[0.12em]">
          {handover.code}
        </span>
        {handover.status === 'ACTIVE' && (
          <button
            type="button"
            onClick={copy}
            className="flex cursor-pointer items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-semibold text-slate-600 hover:bg-slate-100"
          >
            <Copy className="h-3 w-3" />
            {copied ? (locale === 'ar' ? 'نُسخ' : 'Copied') : (locale === 'ar' ? 'نسخ' : 'Copy')}
          </button>
        )}
      </div>

      {handover.status === 'ACTIVE' && (
        <>
          <p className="text-slate-500">
            {side === 'buyer'
              ? (locale === 'ar'
                ? 'هذا رمزك: أعْرِضه للبائع أو لسائقه عند وصول البضاعة، فهو من يمسحه ويحفظ إثبات التسليم. لا يبدأ الفحص ولا تُغلق الصفقة قبل ذلك المسح.'
                : 'This is your code: show it to the seller or their driver when the goods arrive — theirs is the scan that records the handover. Neither the inspection window nor the closing of this order opens before it.')
              : (locale === 'ar'
                ? 'امسح رمز المشتري أو اكتُب ما على الملصق واحفظه: لا يفتح الفحص ولا تُغلق الصفقة قبل أن يُسجَّل مسحه مرة واحدة.'
                : 'Scan the buyer’s code, or type what the label says, and save it: the inspection window and the closing of this order both wait for that one recording.')}
          </p>

          {/* The buyer's side of the handover is a screen the other business
              reads with a camera held at arm's length, so it is drawn for that:
              the symbol the platform encoded, at the size a phone pointed at it
              can resolve, on the whitest surface the console has. The characters
              stay underneath, because a cracked lens or a glare-washed panel
              ends in somebody reading them out across a loading bay — and the
              scan sheet accepts either. */}
          {side === 'buyer' && (
            <>
              <button
                type="button"
                onClick={present}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 font-bold text-blue-800 transition hover:bg-blue-100"
              >
                <QrCode className="h-3.5 w-3.5" />
                {presented
                  ? (locale === 'ar' ? 'إخفاء العرض' : 'Hide the display')
                  : (locale === 'ar' ? 'اعرض الرمز للبائع' : 'Show the code to the seller')}
              </button>
              {presented && (
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-5 text-center">
                  <div className="text-[11px] text-slate-500" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
                    {locale === 'ar' ? 'كود تسليم العقد' : 'Handover code for'}{' '}
                    <span className="font-mono">{deal.deal_number}</span>
                  </div>

                  {symbol === undefined && (
                    <div className="flex items-center justify-center py-4 text-[11px] text-slate-400">
                      {locale === 'ar' ? '… يُجهَّز الرمز' : '… preparing the symbol'}
                    </div>
                  )}

                  {symbol !== undefined && (
                    <div className="flex justify-center py-4">
                      {symbol ? (
                        <QrGlyph
                          symbol={symbol}
                          className="h-[min(58vw,260px)] w-[min(58vw,260px)] min-w-[150px]"
                        />
                      ) : (
                        /* No symbol, so the characters take the picture's place at
                           the picture's size — large enough that a person across a
                           cab can read them off the screen without leaning on it. */
                        <div dir="ltr" className="font-mono text-3xl font-black tracking-[0.18em] text-slate-900 sm:text-4xl">
                          {handover.code}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Under the picture, not instead of it: what the symbol says,
                      for the person who has to type it or read it aloud. */}
                  <div dir="ltr" className="pt-1 font-mono text-[13px] font-bold tracking-[0.14em] text-slate-700">
                    {handover.code}
                  </div>

                  <p className="pt-3 text-[11px] text-slate-500">
                    {symbol === undefined
                      ? (locale === 'ar'
                        ? 'انتظر حتى يظهر الرمز، ثم وجّه كاميرا البائع إليه.'
                        : 'Wait for the symbol, then point the seller’s camera at it.')
                      : symbol
                      ? (locale === 'ar'
                        ? 'وجّه كاميرا البائع إلى هذا الرمز؛ يمسحه ثم يحفظ إثبات التسليم. أو امسح ملصق الصندوق بنفسك إن كان معك.'
                        : 'Point the seller’s camera at this symbol; they scan it and save the proof of handover — or spend the label printed on the box if it is with you.')
                      : (locale === 'ar'
                        ? 'لم يرسل النظام رمزًا قابلًا للمسح لهذا الطلب؛ اقرأ الكود على البائع ليسجله يدويًا.'
                        : 'The platform sent no scannable symbol for this order, so read the code to the seller and let them type it in.')}
                  </p>

                  {/* The box leaves before the phone does, so the same symbol is
                      offered as a document — the server's own SVG, at the route
                      built for it. Two steps rather than one link because a
                      browser sends no bearer token when somebody clicks an href:
                      the first press asks with this session's headers, and only
                      then does the download become real. */}
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-3">
                    {labelUrl ? (
                      <a
                        href={labelUrl}
                        download={`hassal-handover-${deal.deal_number}.svg`}
                        className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-700 transition hover:bg-slate-50"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        {locale === 'ar' ? 'حفظ الملصق للطباعة' : 'Save the label to print'}
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={openLabel}
                        className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-700 transition hover:bg-slate-50"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        {locale === 'ar' ? 'ملصق للطباعة' : 'Printable label'}
                      </button>
                    )}
                    {labelNote && (
                      <span className="text-[11px] text-red-600" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
                        {labelNote}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {canScan && (
            <button
              type="button"
              onClick={onScan}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 font-bold text-white transition hover:bg-blue-700"
            >
              <ScanLine className="h-3.5 w-3.5" />
              {locale === 'ar' ? 'مسح كود المشتري وحفظه' : 'Scan the buyer’s code and save'}
            </button>
          )}
          {side === 'buyer' && !presented && (
            <p className="text-[11px] text-slate-500">
              {locale === 'ar'
                ? 'المسح من جهة البائع؛ لا زرّ مسح عندك في هذه الصفحة.'
                : 'The scan is the seller’s button; this page gives you none.'}
            </p>
          )}
        </>
      )}

      {handover.status === 'USED' && (
        <p>
          {locale === 'ar' ? 'مُسح' : 'Scanned'}
          {handover.verified_by_organization_id != null && (
            <>
              {' • '}
              {Number(handover.verified_by_organization_id) === Number(deal.seller_organization_id)
                ? (locale === 'ar' ? 'بمسح البائع' : 'by the seller')
                : Number(handover.verified_by_organization_id) === Number(deal.buyer_organization_id)
                ? (locale === 'ar' ? 'بمسح المشتري' : 'by the buyer')
                : (locale === 'ar' ? 'بمسح المنصة' : 'by the platform')}
            </>
          )}
          {formatDateTime(handover.verified_at ?? '', locale) ? ` • ${formatDateTime(handover.verified_at ?? '', locale)}` : ''}
          {handover.verification_notes ? ` • ${handover.verification_notes}` : ''}
        </p>
      )}

      {handover.status === 'INVALIDATED' && (
        <p>
          {locale === 'ar'
            ? 'سُحب هذا الرمز مع إيقاف العقد، ولا يمكن مسحهُ مرة أخرى.'
            : 'This code was retired when the order was called off, and it cannot be scanned.'}
        </p>
      )}
    </div>
  );
};
