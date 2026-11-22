/**
 * A business: its registration, its members, its own standings, the overrides one
 * person carries, and the legal papers behind its verification.
 *
 * Every path below is a route the server actually registers: `npm run check:api`
 * compares these modules against `php artisan route:list`, so a button here cannot
 * be wired to an endpoint that was never built. A call that must not run twice on a
 * retried click passes an `idempotencyKey`, and the transport that stamps it — the
 * token, the organization header, the envelope — is `src/core/api/http.ts`.
 */

import { idempotencyKey, qs, request } from '@/core/api/http';
import type { ApiResult } from '@/core/api/http';
import { explainRefusal, serverMessage } from '@/core/api/refusal';
import type { RefusalCodeText } from '@/core/api/refusal';

import type { BulkOverrideResult, DocumentQueueRow, DocumentReviewSummary, MemberPermissionsView, MembershipRoleOption, Organization, OrganizationDocument, OrganizationRoleRow, OrganizationRolesSnapshot, OrganizationStatus, UserMembership, VerificationGateDetails } from '@/features/organizations/types';
import type {
  DocumentDecision,
  DocumentFiling,
  DocumentState,
  DocumentUploadType,
  OrganizationDecision,
} from '@/features/organizations/review';

/**
 * Businesses. The same URL answers two different questions: for the platform
 * role it lists every business on the platform and filters by `type`,
 * `status` and `search`; for anyone else it lists only the businesses that
 * caller belongs to. The scope is decided server-side, not by a parameter.
 */
export async function getOrganizations(filters: {
  type?: string;
  status?: string;
  search?: string;
  page?: number;
  per_page?: number;
} = {}) {
  return request<Organization[]>('/api/v1/organizations' + qs({ ...filters }));
}

export async function getOrganization(id: number) {
  return request<Organization>(`/api/v1/organizations/${id}`);
}

export async function createOrganization(data: Record<string, unknown>) {
  return request<Organization>('/api/v1/organizations', {
    method: 'POST',
    body: data,
    idempotencyKey: idempotencyKey('org'),
  });
}

export async function updateOrganization(id: number, data: Record<string, unknown>) {
  return request<Organization>(`/api/v1/organizations/${id}`, { method: 'PUT', body: data });
}

/**
 * The platform's decision about one business.
 *
 * `VERIFY` is refused while a legal identifier the platform itself requires
 * (`legal.require_*`) is missing; `REJECT` and `SUSPEND` are refused without
 * a reason, because a decision nobody can explain cannot be answered later;
 * and a decision that would leave the organization in the state it is already
 * in is refused rather than silently accepted.
 *
 * What this records is a review conducted inside HASSAL by a named platform
 * account. No external register is queried, so no screen may describe the
 * result as a government verification (§47).
 */
export async function decideOrganizationVerification(
  id: number,
  decision: OrganizationDecision,
  reason?: string
) {
  return request<Organization>(`/api/v1/organizations/${id}/verification`, {
    method: 'PUT',
    body: { decision, ...(reason ? { reason } : {}) },
    idempotencyKey: idempotencyKey('org_ver'),
  });
}

/**
 * The standings a company may hold a person at, with the label the platform
 * shows for each. Read from the server because the same list is what the
 * validator accepts and what the column constrains — a dropdown typed out in
 * the client is a 422 the next time a rank is renamed.
 */
export async function getMembershipRoles() {
  return request<MembershipRoleOption[]>('/api/v1/organizations/membership-roles');
}

export async function getOrganizationMembers(orgId: number) {
  return request<UserMembership[]>(`/api/v1/organizations/${orgId}/members`);
}

//
// Two doors, and this is the one a business opens. The server refuses any
// platform capability by name here, so the screens below never render one:
// `grantable_permissions` in the roles snapshot is the list the same endpoint
// accepts, not a copy typed into the client.
/**
 * Reading provisions the company's standings when they do not exist yet, which
 * is why an editor can open on a company that has never been staffed from a
 * screen and still find the five rows it expects.
 */
export async function getOrganizationRoles(orgId: number) {
  return request<OrganizationRolesSnapshot>(`/api/v1/organizations/${orgId}/roles`);
}

/**
 * `permissions` is optional: omit it and the server copies `copy_from`, send it
 * and it is the whole definition. Both are stated rather than guessed because a
 * standing created from nothing is a real outcome («أمين المستودع» starts empty)
 * and an empty array means empty, not "I did not say".
 */
export async function createOrganizationRole(
  orgId: number,
  data: { key: string; name_ar: string; name_en?: string | null; permissions?: string[]; copy_from?: string | null; reason: string }
) {
  return request<OrganizationRoleRow>(`/api/v1/organizations/${orgId}/roles`, {
    method: 'POST',
    body: data,
    idempotencyKey: idempotencyKey('org_role_add'),
  });
}

/** Replaces the standing's capabilities wholesale — a matrix save, not a patch. */
export async function updateOrganizationRole(
  orgId: number,
  key: string,
  data: { permissions?: string[]; name_ar?: string; name_en?: string | null; reason: string }
) {
  return request<OrganizationRoleRow>(`/api/v1/organizations/${orgId}/roles/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: data,
    idempotencyKey: idempotencyKey('org_role_edit'),
  });
}

export async function deleteOrganizationRole(orgId: number, key: string, reason: string) {
  return request(`/api/v1/organizations/${orgId}/roles/${encodeURIComponent(key)}`, {
    method: 'DELETE',
    body: { reason },
    idempotencyKey: idempotencyKey('org_role_drop'),
  });
}

export async function getMemberPermissions(orgId: number, userId: number) {
  return request<MemberPermissionsView>(`/api/v1/organizations/${orgId}/members/${userId}/permissions`);
}

/**
 * Both lists are mandatory and both may be empty: the request states the screen.
 * A name in neither list is removed, which is why the caller sends the full
 * remaining set rather than a delta — a denial nobody remembers writing has to
 * be visible and clearable from the row that shows it.
 */
export async function updateMemberPermissions(
  orgId: number,
  userId: number,
  data: { grants: string[]; denials: string[]; reason: string }
) {
  return request<MemberPermissionsView>(`/api/v1/organizations/${orgId}/members/${userId}/permissions`, {
    method: 'PUT',
    body: data,
    idempotencyKey: idempotencyKey('member_override'),
  });
}

/** All-or-none on the server: a mistyped id fails the whole call. */
export async function bulkMemberPermissions(
  orgId: number,
  data: { user_ids: number[]; grants: string[]; denials: string[]; reason: string }
) {
  return request<{ organization_id: number; applied: BulkOverrideResult[] }>(
    `/api/v1/organizations/${orgId}/members/permissions/bulk`,
    {
      method: 'PUT',
      body: data,
      idempotencyKey: idempotencyKey('member_override_bulk'),
    }
  );
}

/**
 * `reason` is mandatory on all three staffing writes. Adding, demoting or
 * removing a person changes who can act on that company's offers, deals and
 * documents, so the audit row has to say who decided it and why — a roster
 * that only records "role: staff → admin" cannot answer an objection later.
 */
export async function addOrganizationMember(orgId: number, data: { email: string; role: string; reason: string }) {
  return request(`/api/v1/organizations/${orgId}/members`, {
    method: 'POST',
    body: data,
    idempotencyKey: idempotencyKey('member_add'),
  });
}

/**
 * `is_active` is optional and the server applies it in the same write as the
 * role, so ending or restoring a person's access is one decision with one
 * audit row rather than a role change plus a separate edit nobody recorded.
 */
export async function updateOrganizationMember(
  orgId: number,
  userId: number,
  role: string,
  reason: string,
  isActive?: boolean
) {
  return request(`/api/v1/organizations/${orgId}/members/${userId}`, {
    method: 'PUT',
    body: { role, reason, ...(isActive === undefined ? {} : { is_active: isActive }) },
    idempotencyKey: idempotencyKey('member_role'),
  });
}

/**
 * The reason travels in the body: a DELETE carries one here because removal
 * is a decision, not a navigation action, and the server refuses it without.
 */
export async function removeOrganizationMember(orgId: number, userId: number, reason: string) {
  return request(`/api/v1/organizations/${orgId}/members/${userId}`, {
    method: 'DELETE',
    body: { reason },
    idempotencyKey: idempotencyKey('member_remove'),
  });
}

/**
 * The papers one business filed, plus what was decided on each.
 *
 * `accepted_types` is the short answer a checklist needs — which kinds of
 * paper a reviewer has already accepted — and `status` is the organization's,
 * i.e. whether the marketplace gate is open.
 */
export async function getOrganizationDocuments(orgId: number) {
  return request<{
    organization_id: number;
    status: OrganizationStatus;
    accepted_types: OrganizationDocument['type'][];
    documents: OrganizationDocument[];
  }>(`/api/v1/organizations/${orgId}/documents`);
}

/**
 * File one paper. Sending it before verification is the point: an applicant
 * that could not upload its registration certificate because it was not
 * verified had no way to become verified.
 *
 * Three server answers a form has to surface rather than swallow:
 * `DOCUMENT_ALREADY_ACCEPTED` (this kind is already accepted — delete it to
 * replace it), `DOCUMENT_LIMIT_REACHED`, and `DOCUMENT_TYPE_UNSUPPORTED`.
 * Re-filing a rejected or still-pending copy replaces that copy, so the
 * reviewer's queue holds one row per open question.
 *
 * Acceptance records that a member of this platform's staff read this copy.
 * No official register is queried anywhere in the product, so no label here
 * may claim a ministry confirmed a number (§47).
 */
export async function uploadOrganizationDocument(orgId: number, data: DocumentFiling) {
  const form = new FormData();
  form.append('type', data.type);
  if (data.reference_number) form.append('reference_number', data.reference_number);
  form.append('file', data.file, data.file.name);
  return request<OrganizationDocument>(`/api/v1/organizations/${orgId}/documents`, {
    method: 'POST',
    form,
    idempotencyKey: idempotencyKey(`doc_${orgId}`),
  });
}

/** Withdraw a copy before anyone rules on it; a reviewed one refuses. */
export async function deleteOrganizationDocument(orgId: number, documentId: number) {
  return request<{ id: number; deleted: boolean }>(
    `/api/v1/organizations/${orgId}/documents/${documentId}`,
    { method: 'DELETE' }
  );
}

/**
 * The platform's review desk: filed papers across every business.
 *
 * `organizations.verify` gates it at the route, so a business asking for it is
 * refused rather than handed its own rows — a filtered list would still
 * disclose which other companies have filed anything.
 *
 * With no `status` filter the server answers what is *waiting*, not the whole
 * archive; a reviewer's first screen is the queue, and the archive is a choice.
 */
export async function getDocumentReviewQueue(
  filters: {
    status?: DocumentState;
    type?: DocumentUploadType;
    organization_id?: number;
    search?: string;
    page?: number;
    per_page?: number;
  } = {}
) {
  return request<DocumentQueueRow[]>('/api/v1/organizations/document-queue' + qs({ ...filters }));
}

/** The counts beside those tabs, taken by the server over the same rows. */
export async function getDocumentReviewSummary() {
  return request<DocumentReviewSummary>('/api/v1/organizations/document-summary');
}

/**
 * The staff decision on one document (`organizations.verify`).
 *
 * A rejection has to carry the reason, because "your papers were rejected" is
 * not actionable and an applicant who cannot tell which paper failed resubmits
 * the same one forever. This decides the copy, not the business: the
 * marketplace gate still opens on `decideOrganizationVerification`.
 */
export async function reviewOrganizationDocument(
  orgId: number,
  documentId: number,
  data: { action: DocumentDecision; reason?: string }
) {
  return request<OrganizationDocument>(
    `/api/v1/organizations/${orgId}/documents/${documentId}/review`,
    { method: 'PUT', body: data, idempotencyKey: idempotencyKey(`doc_rev_${documentId}`) }
  );
}

/**
 * The checklist a verification refusal arrived with, or `null`.
 *
 * A screen that hardcoded "upload your registration certificate" would be wrong
 * the moment an operator turned that requirement off, so the refusal carries
 * which items the platform actually requires and which are done.
 */
export function verificationGate<T>(result: ApiResult<T>): VerificationGateDetails | null {
  if (result.error_code !== 'ORGANIZATION_NOT_VERIFIED') return null;
  return (result.error?.details as VerificationGateDetails | undefined) ?? null;
}

/**
 * A refusal in the person's language, with the gate's outstanding items named.
 *
 * Verification is the one refusal that arrives holding a list, and the list is the
 * useful half of the answer: "منشأتك غير موثّقة" tells a buyer nothing they can act
 * on, while "المتبقي: وثائق مرفوعة" points at the box to fill. The items are read
 * from the response, never written here.
 *
 * This is the only place that sentence is written: the community buttons and the
 * buyer's ask dialog both hit the same middleware and used to explain it to their
 * own screen, in two slightly different Arabic wordings, from one response.
 */
export function refusalWithGate(
  result: ApiResult<unknown>,
  options: { fallback: string; codes?: Record<string, RefusalCodeText> }
): string {
  const gate = verificationGate(result);
  if (!gate) return explainRefusal(result, options);

  const open = (gate.checklist ?? []).filter((item) => !item.done);
  const message = serverMessage(result, options.fallback);
  return open.length ? `${message} — المتبقي: ${open.map((item) => item.label_ar).join('، ')}` : message;
}
