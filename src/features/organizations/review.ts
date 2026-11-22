import { fieldError, type ApiResult } from '@/core/api/http';
import { explainRefusal, refusalCode, serverMessage, type RefusalCodeText } from '@/core/api/refusal';
import type { Locale } from '@/core/i18n';
import type { Organization, OrganizationDocument, OrganizationStatus, OrganizationType } from './types';

/**
 * The words the platform uses for a business and its papers, and the two rules a
 * reviewer's decision carries.
 *
 * Two screens read these and they must not disagree: the business's own document
 * panel, where an applicant uploads a certificate and sees what happened to it, and
 * the platform's console, where a staff member rules on the same row from the other
 * side. Before this file each of them held its own table, and the two had already
 * drifted — one called a pending paper "بانتظار مراجعة المنصة" and the other
 * "بانتظار القرار".
 *
 * Labels are the smaller half of this module. The larger half is why a decision that
 * needs a reason is asked for one before the call goes out, and what the server's
 * refusal means once it comes back: `OrganizationVerificationService::decide()` and
 * `OrganizationDocumentController::review()` each hold that rule, and a console that
 * only learned it from the error would show a reviewer their own blank box as the
 * server's problem.
 *
 * Nothing here decides anything. These are labels over states the server holds
 * (`App\Enums\OrganizationStatus`, and the `status` column of
 * `organization_documents`), and the server's answer to a decision is what changes
 * the row.
 */

/** The four states `Organization::$status` takes, in the order the console filters them. */
export const ORGANIZATION_STATUSES: { value: OrganizationStatus; label: string }[] = [
  { value: 'pending_kyc', label: 'بانتظار المراجعة' },
  { value: 'verified', label: 'معتمدة' },
  { value: 'suspended', label: 'موقوفة عن التداول' },
  { value: 'rejected', label: 'مرفوضة' },
];

/**
 * What a business says it is. The list is the column's enum, not a taxonomy.
 *
 * Both languages sit in one row because the same word is read in two places that must
 * agree: the header's organization switcher, which shows it bare next to the business's
 * name, and this platform's own screens, which show it inside a labelled field. Keeping
 * an English copy in the header and an Arabic copy here is how one column ended up with
 * four names for the same four values.
 */
export const ORGANIZATION_TYPES: { value: OrganizationType; label: string; label_en: string }[] = [
  { value: 'buyer', label: 'مشترٍ', label_en: 'Buyer' },
  { value: 'seller', label: 'مورّد', label_en: 'Seller' },
  { value: 'intermediary', label: 'وسيط', label_en: 'Intermediary' },
  { value: 'admin', label: 'إشرافية', label_en: 'Platform' },
];

/**
 * A business's activity in words, in the language the screen is written in.
 *
 * An unlisted value prints itself: a type this table has not met is a change to the
 * column, and guessing at it would dress an unknown up as a known one.
 */
export function organizationTypeLabel(type: string | null | undefined, locale: Locale): string {
  if (!type) return locale === 'ar' ? 'لم يُسجَّل نوع' : 'No type recorded';
  const entry = ORGANIZATION_TYPES.find((candidate) => candidate.value === type);
  if (!entry) return type;
  return locale === 'ar' ? entry.label : entry.label_en;
}

/**
 * The kinds a business may register as, and the wording each one carries.
 *
 * A subset of `ORGANIZATION_TYPES`, and deliberately taken from it rather than
 * retyped: `StoreOrganizationRequest` lets a platform-admin caller ask for any of the
 * four and gives a self-service registrant only these two, so the console's filter and
 * the registration form are naming the same column values at different audiences. A
 * second hard-coded pair is how `intermediary` can appear in one screen and vanish from
 * the other with nobody noticing the column grew.
 */
export const SELF_REGISTRATION_TYPES: { value: OrganizationType; label: string }[] = ORGANIZATION_TYPES
  .filter(({ value }) => value === 'buyer' || value === 'seller')
  .map(({ value, label }) => ({ value, label }));

/**
 * A business's state in words.
 *
 * An unlisted value prints itself rather than a guess: `pending_kyc` becoming
 * "غير معتمدة" would hide the difference between a file nobody has opened and one
 * that was refused.
 */
export function organizationStatusLabel(status: string | null | undefined): string {
  if (!status) return 'لم تُسجَّل حالة';
  return ORGANIZATION_STATUSES.find((entry) => entry.value === status)?.label ?? status;
}

/** Any row that carries a business's two names: the active one, a membership, a record. */
export interface NamedOrganization {
  name_ar: string;
  name_en: string;
}

/**
 * A business's name in the language the screen is written in.
 *
 * Arabic is the name the platform stores and English is the one an applicant may leave
 * blank, so the fallback runs English→Arabic and never the other way: a header that
 * printed «لا منشأة» beside an account that is standing in one is a wrong statement
 * about the session, and a blank cell where a name should be reads as a lost record.
 *
 * The bar used to pick the two fields inline, in three places, with two different
 * fallback orders — which is how one screen could show a business by its English name
 * and the sheet beside it by its Arabic one.
 */
export function organizationName(
  organization: NamedOrganization | null | undefined,
  locale: Locale,
  whenMissing = 'لا منشأة'
): string {
  if (!organization) return whenMissing;
  const name = locale === 'en' ? organization.name_en || organization.name_ar : organization.name_ar || organization.name_en;
  return name?.trim() || whenMissing;
}

/**
 * What the dot beside the account says about this business.
 *
 * Three states and three colours, because the difference between «not approved yet»
 * and «not in context at all» is the difference between waiting on the platform and
 * having no business to trade as. The tone is returned with the sentence: a chip that
 * coloured itself from the status string separately would be one more place where the
 * rule could be broken.
 */
export function organizationVerification(
  status: string | null | undefined,
  locale: Locale
): { tone: 'ok' | 'pending' | 'none'; title: string } {
  if (!status) {
    return { tone: 'none', title: locale === 'en' ? 'No organization in context' : 'لا منشأة في السياق' };
  }
  if (status === 'verified') {
    return { tone: 'ok', title: locale === 'en' ? 'Organization approved for trading' : 'المنشأة معتمدة للتداول' };
  }
  return { tone: 'pending', title: locale === 'en' ? 'Organization not approved yet' : 'المنشأة لم تُعتمد للتداول بعد' };
}

/**
 * The switcher's sentence when there is nothing to switch between.
 *
 * «سجّل الدخول لاختيار المنظمة» used to be printed at an account that is already
 * signed in and simply has no business yet: it told a person standing in the doorway
 * that they first had to come in. Three situations now say three different things, and
 * each of the two a person can act on carries the action — registering needs only a
 * token, and choosing is what the account's business file is for.
 */
export function organizationContextNotice(
  state: { signedIn: boolean; memberships: number },
  locale: Locale
): { text: string; action: 'login' | 'open-organization-file' } {
  if (!state.signedIn) {
    return {
      text: locale === 'en' ? 'Sign in to choose a business' : 'سجّل الدخول لاختيار منشأة',
      action: 'login',
    };
  }
  if (state.memberships === 0) {
    return {
      text: locale === 'en' ? 'No business registered yet — register one' : 'لا توجد منشأة بعد — سجّل منشأتك',
      action: 'open-organization-file',
    };
  }
  return {
    text: locale === 'en' ? 'No business chosen — open the file' : 'لم تُختر منشأة — افتح ملفها',
    action: 'open-organization-file',
  };
}

/** A document row's state, which only a reviewer can put on a paper. */
export type DocumentState = OrganizationDocument['status'];

/** The kinds an applicant can hand in — what `OrganizationDocument::$type` holds. */
export type DocumentUploadType = OrganizationDocument['type'];

/**
 * The papers a business can file.
 *
 * `OrganizationDocument::$type` is a string column, not a PHP enum, so this object —
 * not a database constraint — is what keeps the upload form and the review queue
 * naming the same documents. It also drives the "what is still missing" line on the
 * applicant's own panel, which reads its keys as the full set.
 */
export const ORGANIZATION_DOCUMENT_TYPE_LABELS: Record<DocumentUploadType, string> = {
  commercial_registration: 'شهادة السجل التجاري',
  tax_certificate: 'شهادة الرقم الضريبي',
  trade_license: 'الرخصة التجارية',
  founding_statute: 'العقد التأسيسي / النظام الأساسي',
  id_proof: 'إثبات الهوية',
  id_card_front: 'صورة الوجه الأمامي للبطاقة الشخصية',
  id_card_back: 'صورة الوجه الخلفي للبطاقة الشخصية',
  other: 'وثيقة أخرى',
};

/** The same set as `<select>` options, in declaration order. */
export const ORGANIZATION_DOCUMENT_TYPE_OPTIONS: { value: DocumentUploadType; label: string }[] = (
  Object.keys(ORGANIZATION_DOCUMENT_TYPE_LABELS) as DocumentUploadType[]
).map((key) => ({ value: key, label: ORGANIZATION_DOCUMENT_TYPE_LABELS[key] }));

/**
 * The identity card, photographed as two filings rather than picked from the uploader.
 *
 * Named here because three screens need the same answer to "is this kind one of the
 * card's sides?": the uploader, which must not list them twice, the "what is still
 * owed" line, which reports each side in its own block, and the camera panel itself.
 * The labels and the shooting hints stay with the camera component — they are UI copy,
 * and a domain module that holds them would be a module that draws a button.
 */
export type IdCardSide = Extract<DocumentUploadType, 'id_card_front' | 'id_card_back'>;

export const ID_CARD_SIDES: IdCardSide[] = ['id_card_front', 'id_card_back'];

const isIdCardSide = (type: DocumentUploadType): boolean => (ID_CARD_SIDES as string[]).includes(type);

/**
 * The kinds the generic uploader offers.
 *
 * Everything except the two card sides: they have their own camera block, and listing
 * them again here would give an applicant a file-picker path to the same row the
 * camera writes — usually a worse copy of it.
 */
export const CHOOSABLE_FILING_TYPES: DocumentUploadType[] = (
  Object.keys(ORGANIZATION_DOCUMENT_TYPE_LABELS) as DocumentUploadType[]
).filter((type) => !isIdCardSide(type));

/**
 * The papers whose absence the panel counts as "still not accepted".
 *
 * `other` is excluded on purpose: it is an envelope for anything extra an applicant
 * volunteers, and a checklist that reported it missing would ask for a document nobody
 * requires. The card sides are excluded because their own block reports them per side,
 * and naming them twice would make one paper look like two obligations.
 */
export const MAIN_FILING_TYPES: DocumentUploadType[] = CHOOSABLE_FILING_TYPES.filter((type) => type !== 'other');

/**
 * The shape one filing takes.
 *
 * Named here rather than spelled out at each call site because the route validates
 * `type` against the keys of `ORGANIZATION_DOCUMENT_TYPE_LABELS` and nothing else: an
 * upload form and the transport that each typed their own copy of that list is how a
 * document type ends up selectable on one screen and refused by the other. A
 * `DocumentState` is deliberately not filing-able — `pending` is what the desk leaves
 * the row at, not an option somebody can choose.
 */
export interface DocumentFiling {
  type: DocumentUploadType;
  file: File;
  reference_number?: string;
}

/**
 * What happened to one copy, said to the person who filed it.
 *
 * Each label names the actor, because the platform queries no ministry, chamber or
 * register anywhere in its code: an accepted paper means a staff member read this
 * copy, and nothing may read as an official confirmation of the number on it.
 */
const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'بانتظار مراجعة المنصة',
  accepted: 'قبِلها مراجع المنصة',
  rejected: 'رفضها مراجع المنصة',
};

export function documentStatusLabel(status: string | null | undefined): string {
  if (!status) return 'لم تُسجَّل حالة';
  return DOCUMENT_STATUS_LABELS[status] ?? status;
}

/** The same three states as the console's filter: short, because it sits in a select. */
export const DOCUMENT_FILTER_OPTIONS: { value: DocumentState; label: string }[] = [
  { value: 'pending', label: 'بانتظار القرار' },
  { value: 'accepted', label: 'مقبولة' },
  { value: 'rejected', label: 'مرفوضة' },
];

/**
 * Whether a person may hand a paper in.
 *
 * `organizations.manage` inside the business, and the route treats platform staff the
 * same way: an applicant who cannot upload its registration certificate has no way to
 * become verified, which is why filing sits outside the verification gate.
 */
export function mayFileDocument(can: (permission: string) => boolean, isSuperAdmin: boolean): boolean {
  return isSuperAdmin || can('organizations.manage');
}

/**
 * Whether a staff member may rule on a paper.
 *
 * The route enforces this (`organizations.verify`); the screen hides the buttons for
 * the same reason it hides any control the account cannot use — a rejection with a
 * permission code is a worse answer than a button that was never offered.
 */
export function mayDecideDocument(can: (permission: string) => boolean, isSuperAdmin: boolean): boolean {
  return isSuperAdmin || can('organizations.verify');
}

/* ───────────────────────── the reviewer's two decisions ───────────────────────── */

/** The four rulings `OrganizationVerificationService::decide()` accepts. */
export type OrganizationDecision = 'VERIFY' | 'REJECT' | 'SUSPEND' | 'REINSTATE';

/** The two rulings `OrganizationDocumentController::review()` accepts. */
export type DocumentDecision = 'accept' | 'reject';

/**
 * A decision against a business has to say why, and the console asks before sending.
 *
 * The service throws `REASON_REQUIRED` for REJECT and SUSPEND — a verdict nobody
 * wrote a reason for cannot be answered, appealed or reconstructed — but the
 * reviewer who learns that from the refusal has already watched their own click
 * fail. Approval needs no reason: it grants a thing rather than withholding one.
 */
export function organizationDecisionProblem(decision: OrganizationDecision, reason: string): string | null {
  if (decision !== 'REJECT' && decision !== 'SUSPEND') return null;
  return reason.trim() ? null : 'الرفض والإيقاف يحتاجان سببًا مسجلًا؛ قرار بلا سبب لا يمكن الرد عليه لاحقًا.';
}

/**
 * The same rule on one page of paperwork, in the desk's own words.
 *
 * `reason` is `required_if:action,reject` on the route. The sentence names the paper
 * rather than the business because the desk rules on a copy: an applicant refused
 * without being told which sheet is wrong resubmits the right one and waits again.
 */
export function documentDecisionProblem(action: DocumentDecision, reason: string): string | null {
  if (action !== 'reject') return null;
  return reason.trim() ? null : 'الرفض يحتاج سببًا؛ بلا سبب لا تعرف المنشأة أي ورقة تصلّح.';
}

/**
 * The two legal fields the platform can demand before it lets a business trade.
 *
 * `missingRequiredLegalFields()` returns machine column names, and it can return only
 * these two — they are what `legal.require_commercial_registration` and
 * `legal.require_vat_number` gate. Printed raw, a reviewer sees
 * `commercial_registration_number` in the middle of an Arabic sentence; the console's
 * job is to say which paper is missing, in the words the applicant would use.
 */
const LEGAL_FIELD_LABELS: Record<string, string> = {
  commercial_registration_number: 'رقم السجل التجاري',
  vat_number: 'الرقم الضريبي',
};

function missingLegalFields(result: ApiResult<Organization>): string {
  const missing = result.error?.details?.missing_fields ?? [];
  const named = missing.map((field) => LEGAL_FIELD_LABELS[field] ?? field);
  return named.length ? named.join('، ') : 'بيانات نظامية غير مسمّى بعضها';
}

const ORGANIZATION_DECISION_CODES: Record<string, RefusalCodeText> = {
  DECISION_ALREADY_APPLIED: 'المنشأة في هذه الحالة بالفعل؛ حدّث القائمة قبل أن تعيد القرار.',
  REASON_REQUIRED: 'لم يُسجَّل القرار: الرفض والإيقاف يحتاجان سببًا.',
  PERMISSION_DENIED: 'اعتماد المنشأة للتداول صلاحية منصة؛ هذا الحساب لا يملكها.',
};

/**
 * A verification refusal read back to the reviewer, field first.
 *
 * `LEGAL_FIELDS_INCOMPLETE` is named here rather than left to `explainRefusal` because
 * its actionable part is not the message line but the `missing_fields` array beside it:
 * the reviewer needs the field, not the fact that a field was missing.
 */
export function organizationDecisionMessage(result: ApiResult<Organization>): string {
  if (refusalCode(result) === 'LEGAL_FIELDS_INCOMPLETE') {
    return `لا يمكن الاعتماد قبل استكمال: ${missingLegalFields(result)}.`;
  }
  if (result.error?.code === 'VALIDATION_FAILED' || result.error_code === 'VALIDATION_FAILED') {
    return (
      fieldError(result, 'reason')
      || fieldError(result, 'decision')
      || explainRefusal(result, { fallback: 'رفض الخادم القرار', codes: ORGANIZATION_DECISION_CODES })
    );
  }
  return explainRefusal(result, { fallback: 'تعذّر تسجيل القرار', codes: ORGANIZATION_DECISION_CODES });
}

const DOCUMENT_DECISION_CODES: Record<string, RefusalCodeText> = {
  NOT_FOUND: 'لم تعد هذه الوثيقة في قائمة المنشأة؛ حدّث القائمة قبل الحكم عليها.',
  PERMISSION_DENIED: 'الفصل في وثيقة منشأة صلاحية منصة؛ هذا الحساب لا يملكها.',
};

/**
 * A paperwork refusal read back to the desk.
 *
 * Success goes through the same function, because the desk's banner shows the server's
 * acknowledgement when the ruling lands (`تم تسجيل قرار الوثيقة`) and its refusal when
 * it does not — one envelope, one way to read the line out of it.
 */
export function documentDecisionMessage(result: ApiResult<OrganizationDocument>, fallback = 'تعذّر تسجيل القرار'): string {
  if (result.success) return serverMessage(result, fallback);
  if (result.error?.code === 'VALIDATION_FAILED' || result.error_code === 'VALIDATION_FAILED') {
    return (
      fieldError(result, 'reason')
      || fieldError(result, 'action')
      || explainRefusal(result, { fallback: 'رفض الخادم القرار', codes: DOCUMENT_DECISION_CODES })
    );
  }
  return explainRefusal(result, { fallback, codes: DOCUMENT_DECISION_CODES });
}
