import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { deleteOrganizationDocument, getOrganizationDocuments, reviewOrganizationDocument, uploadOrganizationDocument } from '@/features/organizations/api';
import type { OrganizationDocument } from '@/features/organizations/types';
import {
  CHOOSABLE_FILING_TYPES,
  MAIN_FILING_TYPES,
  ORGANIZATION_DOCUMENT_TYPE_LABELS,
  type DocumentDecision,
  type DocumentUploadType,
  type IdCardSide,
  documentDecisionMessage,
  documentDecisionProblem,
  documentStatusLabel,
  mayDecideDocument,
  mayFileDocument,
} from '@/features/organizations/review';
import { serverMessage } from '@/core/api/refusal';
import { formatDateTime, getLocale } from '@/core/i18n';
import { CameraCapture } from '@/shared/ui/CameraCapture';
import { BannerView, DecisionButton, ErrorNote, PanelShell, TextInput, recorded } from '@/shared/ui/panel';
import type { Banner } from '@/shared/ui/panel';

/**
 * The legal papers a business files, and the platform's decision on each copy.
 *
 * Why this sits outside the verification gate: filing is how an applicant
 * *becomes* verified. A screen that refused uploads to an unverified business
 * would lock the door it exists to open. Reading and filing are `organizations.manage`
 * inside one's own business; deciding a paper is `organizations.verify`, which
 * no business role holds — so the accept/reject controls only render for staff.
 *
 * What a decision means: `accepted` records that a member of this platform's
 * staff read this copy. The platform queries no ministry, chamber or register
 * anywhere in its code, so nothing here may say a number was confirmed
 * officially — the label reads "قبِلها مراجع المنصة" for that reason.
 */

const ID_CARD_SIDES_UI: { side: IdCardSide; label: string; hint: string }[] = [
  { side: 'id_card_front', label: 'الوجه الأمامي', hint: 'الجهة التي فيها الصورة والاسم' },
  { side: 'id_card_back', label: 'الوجه الخلفي', hint: 'الجهة التي فيها العنوان وتاريخ الانتهاء' },
];

/** Mirrors `config('hassal.uploads.documents')` on the server; the server's refusal is the rule. */
const ACCEPTED_EXTENSIONS = '.pdf,.jpg,.jpeg,.png';

export const OrganizationDocumentsPanel: React.FC<{
  organizationId: number;
  organizationStatus: string;
  can: (permission: string) => boolean;
  isSuperAdmin: boolean;
}> = ({ organizationId, organizationStatus, can, isSuperAdmin }) => {
  const locale = getLocale();
  const ar = locale === 'ar';
  const fileInput = useRef<HTMLInputElement | null>(null);

  const [documents, setDocuments] = useState<OrganizationDocument[]>([]);
  const [acceptedTypes, setAcceptedTypes] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  const [type, setType] = useState<DocumentUploadType>('commercial_registration');
  const [reference, setReference] = useState('');
  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const mayFile = mayFileDocument(can, isSuperAdmin);
  const mayDecide = mayDecideDocument(can, isSuperAdmin);

  const load = useCallback(async () => {
    setReadError(null);
    const result = await getOrganizationDocuments(organizationId);
    setLoaded(true);
    if (!result.success) {
      setReadError(serverMessage(result, ar ? 'لم تُقرأ الوثائق' : 'The papers could not be read'));
      return;
    }
    setDocuments(result.data?.documents ?? []);
    setAcceptedTypes(result.data?.accepted_types ?? []);
  }, [organizationId, ar]);

  useEffect(() => {
    void load();
  }, [load]);

  const file = async () => {
    const chosen = fileInput.current?.files?.[0];

    if (!chosen) {
      setBanner({ kind: 'error', text: ar ? 'اختر ملفًا أولًا.' : 'Choose a file first.' });
      return;
    }

    setBusy(true);
    setBanner(null);

    const result = await uploadOrganizationDocument(organizationId, {
      type,
      file: chosen,
      reference_number: reference || undefined,
    });

    setBusy(false);

    if (!result.success) {
      // The server's own wording is the useful one here: it distinguishes
      // "this kind is already accepted" from "you filed twenty papers", and it
      // carries the live limits — so nothing is paraphrased over it.
      setBanner({ kind: 'error', text: serverMessage(result, ar ? 'رُفض الرفع' : 'The filing was refused') });
      return;
    }

    setBanner({ kind: 'ok', text: serverMessage(result, ar ? 'تم الرفع' : 'Filed') });
    setReference('');
    if (fileInput.current) fileInput.current.value = '';
    void load();
  };

  const withdraw = async (documentId: number) => {
    setBusy(true);
    setBanner(null);
    const result = await deleteOrganizationDocument(organizationId, documentId);
    setBusy(false);
    setBanner(result.success
      ? { kind: 'ok', text: serverMessage(result, ar ? 'سُحبت الوثيقة' : 'Withdrawn') }
      : { kind: 'error', text: serverMessage(result, ar ? 'لم تُسحب الوثيقة' : 'The copy was not withdrawn') });
    void load();
  };

  const decide = async (documentId: number, action: DocumentDecision, reason?: string) => {
    setBusy(true);
    setBanner(null);
    const result = await reviewOrganizationDocument(organizationId, documentId, { action, reason });
    setBusy(false);

    if (!result.success) {
      setBanner({ kind: 'error', text: documentDecisionMessage(result) });
      return;
    }

    setRejecting(null);
    setRejectReason('');
    setBanner({ kind: 'ok', text: documentDecisionMessage(result, ar ? 'سُجّل القرار' : 'Recorded') });
    void load();
  };

  // The two ID-card sides are reported by their own block below, with their own
  // per-side state, so repeating them in this line would say one thing twice.
  const missing = MAIN_FILING_TYPES
    .filter((key) => !acceptedTypes.includes(key))
    .map((key) => ORGANIZATION_DOCUMENT_TYPE_LABELS[key]);

  return (
    <PanelShell
      title={ar ? 'وثائق المنشأة القانونية' : 'Legal documents'}
      hint={ar
        ? 'الرفع متاح قبل المراجعة: منشأة لا تستطيع رفع شهادتها لا يمكن أن تُراجَع. «قبِلها مراجع المنصة» تعني أن موظفًا قرأ هذه النسخة، لا أن جهة رسمية صدّقت رقمًا — المنصة لا تستعلم عن أي سجل.'
        : 'Filing works before review — a business that cannot upload its certificate can never be reviewed. “Accepted” means platform staff read this copy; the platform queries no official register.'}
    >
      <BannerView banner={banner} />
      {readError ? <ErrorNote text={readError} /> : null}

      {loaded && documents.length === 0 && !readError ? (
        <ErrorNote
          text={ar
            ? 'لا وثيقة مرفوعة بعد. المراجعة لا تتم على ورقة غير موجودة.'
            : 'Nothing has been filed yet. A review cannot happen against a paper that was never uploaded.'}
        />
      ) : null}

      {loaded && documents.length > 0 ? (
        <div className="text-[10px] text-slate-500">
          {ar
            ? `لم يقبل المراجع بعد: ${missing.length ? missing.join('، ') : 'كل الأنواع الرئيسية'}`
            : `Not yet accepted: ${missing.length ? missing.join(', ') : 'every main type'}`}
        </div>
      ) : null}

      {mayFile ? (
        <IdCardFilings
          organizationId={organizationId}
          documents={documents}
          onChanged={() => void load()}
        />
      ) : null}

      {documents.length > 0 ? (
        <ul className="space-y-2">
          {documents.map((document) => (
            <li key={document.id} className="border border-slate-200 rounded-lg p-3 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-bold text-slate-900">{ORGANIZATION_DOCUMENT_TYPE_LABELS[document.type] ?? document.type}</span>
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-bold border ${
                    document.status === 'accepted'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : document.status === 'rejected'
                        ? 'bg-rose-50 border-rose-200 text-rose-900'
                        : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  {documentStatusLabel(document.status)}
                </span>
                {document.url ? (
                  <a
                    href={document.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] font-bold text-emerald-800 underline"
                  >
                    {ar ? 'فتح النسخة' : 'Open copy'}
                  </a>
                ) : null}
              </div>

              <div className="text-[10px] text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
                <span>{document.original_name ?? recorded(null)}</span>
                <span>{document.size_bytes ? `${Math.round(document.size_bytes / 1024)} KB` : ''}</span>
                <span>{document.reference_number ? `${ar ? 'الرقم: ' : 'Ref: '}${document.reference_number}` : ''}</span>
                <span>
                  {ar ? 'رُفعت ' : 'Filed '}
                  {document.uploaded_at ? formatDateTime(document.uploaded_at, locale) : recorded(null)}
                </span>
                {document.uploaded_by_name ? <span>{document.uploaded_by_name}</span> : null}
              </div>

              {document.review_reason ? (
                <div className="text-[10px] text-rose-800">
                  {ar ? 'سبب القرار: ' : 'Decision reason: '}
                  {document.review_reason}
                  {document.reviewed_by_name ? ` — ${document.reviewed_by_name}` : ''}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                {mayFile && document.status === 'pending' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void withdraw(document.id)}
                    className="text-[10px] font-bold text-slate-700 border border-slate-300 rounded-lg px-2 py-1 hover:bg-slate-100 disabled:opacity-40"
                  >
                    {ar ? 'سحب النسخة' : 'Withdraw copy'}
                  </button>
                ) : null}

                {mayDecide && document.status === 'pending' ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void decide(document.id, 'accept')}
                      className="text-[10px] font-bold text-white bg-emerald-700 rounded-lg px-2 py-1 hover:bg-emerald-800 disabled:opacity-40"
                    >
                      {ar ? 'قبول النسخة' : 'Accept copy'}
                    </button>
                    {rejecting === document.id ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <TextInput
                          label={ar ? 'سبب الرفض (مطلوب)' : 'Reason (required)'}
                          value={rejectReason}
                          onChange={setRejectReason}
                        />
                        <button
                          type="button"
                          disabled={busy || Boolean(documentDecisionProblem('reject', rejectReason))}
                          onClick={() => void decide(document.id, 'reject', rejectReason.trim())}
                          className="text-[10px] font-bold text-white bg-rose-700 rounded-lg px-2 py-1.5 hover:bg-rose-800 disabled:opacity-40"
                        >
                          {ar ? 'تسجيل الرفض' : 'Record rejection'}
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setRejecting(document.id); setRejectReason(''); }}
                        className="text-[10px] font-bold text-rose-800 border border-rose-300 rounded-lg px-2 py-1 hover:bg-rose-50"
                      >
                        {ar ? 'رفض' : 'Reject'}
                      </button>
                    )}
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {mayFile ? (
        <div className="border-t border-slate-100 pt-3 space-y-3">
          <div className="flex flex-wrap gap-3">
            <label className="space-y-1">
              <span className="block text-[11px] font-bold text-slate-600">{ar ? 'نوع الوثيقة' : 'Document type'}</span>
              <select
                value={type}
                onChange={(event) => setType(event.target.value as OrganizationDocument['type'])}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-800 min-w-[12rem]"
              >
                {/* The card sides have their own camera block above; listing them
                    here would offer a second, worse path to the same row. */}
                {CHOOSABLE_FILING_TYPES.map((key) => (
                  <option key={key} value={key}>{ORGANIZATION_DOCUMENT_TYPE_LABELS[key]}</option>
                ))}
              </select>
            </label>
            <TextInput
              label={ar ? 'رقم الوثيقة (اختياري)' : 'Reference number (optional)'}
              value={reference}
              onChange={setReference}
              wide
            />
          </div>

          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            className="text-xs text-slate-600"
          />

          <p className="text-[10px] text-slate-500">
            {ar
              ? 'PDF أو صورة. إعادة رفع نسخة مرفوضة تستبدلها بدل أن تضاعفها، والوثيقة التي صدر قرار بشأنها لا تُحذف — اطلب من فريق المنصة إعادة النظر فيها.'
              : 'PDF or an image. Re-filing a rejected copy replaces it instead of duplicating it, and a decided document cannot be deleted — ask staff to reconsider it.'}
          </p>

          <DecisionButton tone="primary" busy={busy} onClick={() => void file()}>
            {busy ? (ar ? 'جارٍ الرفع…' : 'Uploading…') : (ar ? 'رفع الوثيقة' : 'File document')}
          </DecisionButton>
        </div>
      ) : (
        <ErrorNote
          text={ar
            ? 'رفع الوثائق لمالك المنشأة أو مديرها أو لفريق المنصة.'
            : 'Filing is for the organization’s owner, admin, or platform staff.'}
        />
      )}

      {organizationStatus !== 'verified' ? (
        <p className="text-[10px] text-amber-800">
          {ar
            ? 'قبول كل نسخة لا يفتح التداول وحده: قرار حالة المنشأة يسجّله فريق المنصة من شاشة قرارات المنصة.'
            : 'Accepting every copy does not open trading by itself: the organization’s status is decided on the platform decisions screen.'}
        </p>
      ) : null}
    </PanelShell>
  );
};

/**
 * The same papers read by the platform side.
 *
 * The panel above belongs to the business that owns them. A reviewer deciding
 * another company's papers works from the decisions console, and what that
 * person needs is only the copy and its history: no upload form (the applicant
 * files), and no withdraw button (removing a paper the owner filed is not a
 * reviewer's act).
 *
 * `GET /organizations/{id}/documents` answers for staff too, so this reads the
 * same rows the applicant sees rather than a second copy of the truth.
 */
export const StaffDocumentReview: React.FC<{
  organizationId: number;
  onDecided?: () => void;
}> = ({ organizationId, onDecided }) => {
  const locale = getLocale();
  const ar = locale === 'ar';

  const [documents, setDocuments] = useState<OrganizationDocument[]>([]);
  const [readError, setReadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setReadError(null);
    const result = await getOrganizationDocuments(organizationId);
    setLoaded(true);
    if (!result.success) {
      setReadError(serverMessage(result, ar ? 'لم تُقرأ الوثائق' : 'The papers could not be read'));
      return;
    }
    setDocuments(result.data?.documents ?? []);
  }, [organizationId, ar]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (documentId: number, action: DocumentDecision, rejectReason?: string) => {
    setBusy(true);
    setBanner(null);
    const result = await reviewOrganizationDocument(organizationId, documentId, {
      action,
      reason: rejectReason,
    });
    setBusy(false);

    if (!result.success) {
      setBanner({ kind: 'error', text: documentDecisionMessage(result) });
      return;
    }

    setRejecting(null);
    setReason('');
    setBanner({ kind: 'ok', text: documentDecisionMessage(result, ar ? 'سُجّل القرار' : 'Recorded') });
    void load();
    onDecided?.();
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-slate-500">
        {ar
          ? 'هنا تُقرأ النسخ التي رفعتها المنشأة نفسها. القبول يعني أن موظف المنصة فتح هذه النسخة وقرأها؛ المنصة لا تستعلم عن سجل تجاري أو رقم ضريبي من أي جهة، فلا قرار هنا يصديق جهة رسمية. إذن التداول نفسه هو قرار حالة المنشأة المسجَّل في هذه اللوحة، وليس قبول نسخة بعينها.'
          : 'These are the copies the business filed. Accepting one means a platform employee opened and read this copy; the platform queries no register, so no decision here is an official confirmation. The permission to trade is the organization status decision recorded in this console, not the acceptance of one copy.'}
      </p>

      <BannerView banner={banner} />
      {readError ? <ErrorNote text={readError} /> : null}
      {loaded && !documents.length && !readError ? (
        <ErrorNote text={ar ? 'لم ترفع هذه المنشأة أي وثيقة بعد.' : 'This business has filed nothing.'} />
      ) : null}

      {documents.map((document) => (
        <div key={document.id} className="border border-slate-200 rounded-lg p-2.5 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="font-bold text-slate-900">{ORGANIZATION_DOCUMENT_TYPE_LABELS[document.type] ?? document.type}</span>
            <span
              className={`rounded-md px-2 py-0.5 text-[10px] font-bold border ${
                document.status === 'accepted'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : document.status === 'rejected'
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              {documentStatusLabel(document.status)}
            </span>
            {document.url ? (
              <a href={document.url} target="_blank" rel="noreferrer" className="text-[10px] font-bold text-emerald-800 underline">
                {ar ? 'فتح النسخة' : 'Open copy'}
              </a>
            ) : null}
            <span className="text-[10px] text-slate-500">
              {document.original_name ?? recorded(null)}
              {document.size_bytes ? ` · ${Math.round(document.size_bytes / 1024)} KB` : ''}
              {document.reference_number ? ` · ${ar ? 'الرقم' : 'Ref'}: ${document.reference_number}` : ''}
              {' · '}
              {document.uploaded_at ? formatDateTime(document.uploaded_at, locale) : recorded(null)}
            </span>
          </div>

          {document.review_reason ? (
            <div className="text-[10px] text-rose-800">
              {ar ? 'سبب القرار: ' : 'Decision reason: '}
              {document.review_reason}
              {document.reviewed_by_name ? ` — ${document.reviewed_by_name}` : ''}
            </div>
          ) : null}

          {document.status === 'pending' ? (
            <div className="flex flex-wrap items-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void decide(document.id, 'accept')}
                className="text-[10px] font-bold text-white bg-emerald-700 rounded-lg px-2 py-1 hover:bg-emerald-800 disabled:opacity-40"
              >
                {ar ? 'قبول النسخة' : 'Accept copy'}
              </button>
              {rejecting === document.id ? (
                <>
                  <TextInput
                    label={ar ? 'سبب الرفض (مطلوب)' : 'Reason (required)'}
                    value={reason}
                    onChange={setReason}
                  />
                  <button
                    type="button"
                    disabled={busy || Boolean(documentDecisionProblem('reject', reason))}
                    onClick={() => void decide(document.id, 'reject', reason.trim())}
                    className="text-[10px] font-bold text-white bg-rose-700 rounded-lg px-2 py-1.5 hover:bg-rose-800 disabled:opacity-40"
                  >
                    {ar ? 'تسجيل الرفض' : 'Record rejection'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRejecting(null); setReason(''); }}
                    className="text-[10px] font-bold text-slate-600 underline"
                  >
                    {ar ? 'إلغاء' : 'Cancel'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => { setRejecting(document.id); setReason(''); }}
                  className="text-[10px] font-bold text-rose-800 border border-rose-300 rounded-lg px-2 py-1 hover:bg-rose-50"
                >
                  {ar ? 'رفض' : 'Reject'}
                </button>
              )}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
};

/**
 * The identity card: two photographs, ruled on as two papers.
 *
 * This block exists separately from the generic uploader because the card is
 * not a file a person already has — it is an object in their hand. So the
 * primary control is a camera, and the file picker is the fallback for the
 * desktop and for the http:// case where the browser will not open a camera at
 * all (`CameraCapture` says which of those it is rather than failing quietly).
 *
 * Each side keeps its own status because the platform's reviewer decides one
 * copy at a time: a readable front and a blurry back is a real outcome, and
 * hiding it behind a single "identity" row would make the applicant re-shoot
 * both for no reason. `id_proof` stays a separate, optional type — this is the
 * card, not any document that happens to prove who someone is.
 *
 * Nothing here claims the identity was checked against a register. Capturing
 * both sides records what the applicant holds; §7 still forbids stating an
 * official confirmation the platform has no source for.
 */
const IdCardFilings: React.FC<{
  organizationId: number;
  documents: OrganizationDocument[];
  onChanged: () => void;
}> = ({ organizationId, documents, onChanged }) => {
  const locale = getLocale();
  const ar = locale === 'ar';

  const [openSide, setOpenSide] = useState<IdCardSide | null>(null);
  const [busySide, setBusySide] = useState<IdCardSide | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const pickers = useRef<Record<string, HTMLInputElement | null>>({});

  const latestFor = (side: IdCardSide): OrganizationDocument | undefined => {
    const rows = documents.filter((document) => document.type === side);
    // Uploads replace a rejected copy server-side, so more than one row means
    // history; the newest id is what the applicant is looking at.
    return rows.length ? rows.reduce((a, b) => (b.id > a.id ? b : a)) : undefined;
  };

  const send = async (side: IdCardSide, file: File) => {
    setBusySide(side);
    setBanner(null);
    const result = await uploadOrganizationDocument(organizationId, { type: side, file });
    setBusySide(null);

    if (!result.success) {
      setBanner({ kind: 'error', text: serverMessage(result, ar ? 'رُفض الرفع' : 'The photo was not filed') });
      return;
    }

    setBanner({ kind: 'ok', text: serverMessage(result, ar ? 'تم حفظ الصورة' : 'Saved') });
    setOpenSide(null);
    onChanged();
  };

  const pick = (side: IdCardSide) => {
    const chosen = pickers.current[side]?.files?.[0];
    if (pickers.current[side]) pickers.current[side]!.value = '';
    if (!chosen) {
      setBanner({ kind: 'error', text: ar ? 'اختر ملفًا أولًا.' : 'Choose a file first.' });
      return;
    }
    void send(side, chosen);
  };

  return (
    <div className="border border-slate-200 dark:border-hassal-line rounded-xl p-3 space-y-2.5">
      <div>
        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
          {ar ? 'البطاقة الشخصية' : 'Identity card'}
        </h4>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed pt-0.5">
          {ar
            ? 'تُلتقط الجهتان أماميًا وخلفيًا. الصورة ترفع بنفس شروط الملفات (صيغة وحجم وحصّة)، وتُراجَع كل جهة وحدها. التقاط الجهتين يسجّل ما بيد مقدّم الطلب؛ المنصة لا تقارنه بسجل أحوال ولا تصدّق هوية من أي جهة.'
            : 'Capture the front and the back. Photos go through the same format, size and quota rules as files, and each side is reviewed on its own. Recording both sides logs what the applicant holds — the platform compares it against no civil register.'}
        </p>
      </div>

      <BannerView banner={banner} />

      {ID_CARD_SIDES_UI.map((entry) => {
        const row = latestFor(entry.side);
        const capturing = openSide === entry.side;
        const uploading = busySide === entry.side;

        return (
          <div key={entry.side} className="border border-slate-100 dark:border-hassal-line rounded-lg p-2.5 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="font-bold text-slate-800 dark:text-slate-200">{ar ? entry.label : entry.side}</span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">{ar ? entry.hint : ''}</span>
              {row ? (
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-bold border ${
                    row.status === 'accepted'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : row.status === 'rejected'
                        ? 'bg-rose-50 border-rose-200 text-rose-900'
                        : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  {documentStatusLabel(row.status)}
                </span>
              ) : (
                <span className="rounded-md px-2 py-0.5 text-[10px] font-bold border bg-slate-50 border-slate-200 text-slate-600">
                  {ar ? 'لم تُلتقط' : 'Not captured'}
                </span>
              )}
            </div>

            {row?.url ? (
              <a href={row.url} target="_blank" rel="noreferrer" className="text-[10px] font-bold text-emerald-800 underline">
                {ar ? 'فتح الصورة' : 'Open photo'}
              </a>
            ) : null}

            {row?.review_reason ? (
              <div className="text-[10px] text-rose-800">
                {ar ? 'سبب القرار: ' : 'Decision reason: '}
                {row.review_reason}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={uploading}
                onClick={() => { setBanner(null); setOpenSide(capturing ? null : entry.side); }}
                className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 bg-white text-slate-800 border-slate-300 hover:bg-slate-100 disabled:opacity-40 dark:bg-hassal-raised dark:text-slate-100 dark:border-hassal-line dark:hover:bg-hassal-surface"
              >
                <Camera className="w-3.5 h-3.5" />
                {capturing
                  ? (ar ? 'إغلاق الكاميرا' : 'Close camera')
                  : (ar ? (row ? 'إعادة الالتقاط' : 'التقاط بالكاميرا') : (row ? 'Retake' : 'Capture'))}
              </button>

              <label className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg border cursor-pointer bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-hassal-raised dark:text-slate-200 dark:border-hassal-line">
                {ar ? 'أو اختيار ملف' : 'or pick a file'}
                <input
                  ref={(node) => { pickers.current[entry.side] = node; }}
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={() => pick(entry.side)}
                />
              </label>

              {uploading ? <span className="text-[10px] text-slate-500">{ar ? 'جارٍ الرفع…' : 'Uploading…'}</span> : null}
            </div>

            {capturing ? (
              <CameraCapture
                subjectLabel={`${ar ? entry.label : entry.side} — ${ar ? 'البطاقة الشخصية' : 'Identity card'}`}
                fileName={`${entry.side}.jpg`}
                disabled={uploading}
                onCaptured={(file) => void send(entry.side, file)}
                onClose={() => setOpenSide(null)}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
