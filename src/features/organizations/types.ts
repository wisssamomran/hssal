import type { ScopedPermission, User } from '@/features/identity/types';

/**
 * A business as the platform records it: its registration and status, the
 * standings it hands out, the overrides an individual member carries, the people
 * who belong to it, and the documents that carry it to `verified`.
 *
 * These mirror what the endpoints actually return: statuses keep the server's uppercase
 * vocabulary, amounts arrive as decimal strings from MySQL, and any field the
 * platform only knows after a human entered it is nullable. When a component and
 * a type here disagree, the component is wrong.
 */

/**
 * What a person is inside one business. Membership role and platform role are
 * separate: an `admin` here is an administrator *of that organization*, and the
 * server accepts no other value.
 *
 * `staff` is the ordinary employee standing; it replaced `operator`, which only
 * ever existed in the column default and in a validator that rejected the value
 * (`staff`) the rows actually held.
 *
 * The five names are the platform's own standings. A company may also invent one
 * of its own (`warehouse_keeper`), and the column holds its key — so the type
 * keeps the five for autocomplete and still accepts whatever this company's
 * `GET /organizations/{id}/roles` returned. A client that treated the union as
 * closed would render a colleague's real standing as an empty cell.
 */
export type KnownMembershipRole = 'owner' | 'admin' | 'staff' | 'finance' | 'auditor';

export type MembershipRole = KnownMembershipRole | (string & {});

/**
 * One standing of one company, from `GET /organizations/{id}/roles`.
 *
 * `is_system` is the platform's own vocabulary: the five standings are re-provisioned
 * for every company and may be edited but not deleted, while a custom row belongs
 * to this company alone and disappears with it.
 */
export interface OrganizationRoleRow {
  id: number;
  key: string;
  name_ar: string;
  name_en: string | null;
  is_system: boolean;
  holder_count?: number;
  permissions: string[];
}

/** The payload of `GET /organizations/{id}/roles`. */
export interface OrganizationRolesSnapshot {
  organization_id: number;
  grantable_permissions: ScopedPermission[];
  roles: OrganizationRoleRow[];
}

/**
 * One member's place in the permission decision, from
 * `GET /organizations/{id}/members/{userId}/permissions`.
 *
 * Three lists, deliberately separate: `role_permissions` is what the standing
 * carries for everybody who holds it, `grants`/`denials` are this person's own
 * override rows, and `effective` is what the server's middleware will actually
 * honour. Showing the third is the point — a screen that displayed only the
 * first two asked the user to do the arithmetic the enforcement path does.
 */
export interface MemberPermissionsView {
  user_id: number;
  organization_id: number;
  role: MembershipRole;
  is_active: boolean;
  role_permissions: string[];
  grants: string[];
  denials: string[];
  effective: string[];
}

/** One row of `data.applied` from the bulk override route. */
export interface BulkOverrideResult {
  user_id: number;
  grants: string[];
  denials: string[];
  changed: boolean;
}

/**
 * One option from `GET /organizations/membership-roles` — the server's own
 * vocabulary plus the label it wants shown for it, so no screen writes the
 * list out and drifts from what the validator accepts.
 *
 * `permissions` is the standing's actual worth, read from the same matrix the
 * server enforces with. It is optional because a row can be built from a stored
 * role name alone when the vocabulary endpoint has not answered; such a row
 * names the standing but cannot say what it grants, and the screens that would
 * show the grants stay silent rather than guess.
 */
export interface MembershipRoleOption {
  value: string;
  label: string;
  /** False for a standing this company invented; such a row can be deleted. */
  is_system?: boolean;
  permission_count?: number;
  permissions?: string[];
}

/** The organization the current session acts as (`auth/me.current_organization`). */
export interface ActiveOrganization {
  id: number;
  name_ar: string;
  name_en: string;
  type: OrganizationType;
  status: OrganizationStatus;
  cr_number: string | null;
  vat_number: string | null;
  credit_limit: string | number | null;
  /** null until completed deals and inspections produce a real score. */
  rating: number | null;
  membership_role?: string | null;
}

/**
 * One of the organizations a user belongs to (`auth/me.organizations`, and the
 * same shape in a `GET /users` row, where `role` is the membership standing).
 *
 * `membership_active` and `joined_at` only arrive on the admin listing: an
 * ended membership stays listed there, because a console that dropped it would
 * hide the fact an operator is asking about.
 */
export interface OrganizationSummary {
  id: number;
  name_ar: string;
  name_en: string;
  type: OrganizationType;
  status: OrganizationStatus;
  role: string;
  membership_active?: boolean;
  joined_at?: string | null;
}

export type OrganizationType = 'buyer' | 'seller' | 'intermediary' | 'admin';

/**
 * `verified` means an administrator of this platform accepted the documents
 * submitted to it. It does not mean a government system confirmed anything,
 * and no screen may say otherwise.
 */
export type OrganizationStatus = 'pending_kyc' | 'verified' | 'suspended' | 'rejected';

/** A business as stored (`organizations`), returned by the organization endpoints. */
export interface Organization {
  id: number;
  name_ar: string;
  name_en: string;
  trade_name_ar?: string | null;
  trade_name_en?: string | null;
  type: OrganizationType;
  country_code?: string | null;
  city?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  commercial_registration_number?: string | null;
  vat_number?: string | null;
  status: OrganizationStatus;
  credit_limit?: string | number | null;
  rating: number | null;
  /**
   * When an administrator marked this business's documents as reviewed. The
   * column keeps the legacy name `kyc_verified_at`; it records an internal
   * review, never a claim that an official source confirmed anything.
   */
  kyc_verified_at?: string | null;
  /** Active memberships, counted by the endpoint rather than stored. */
  members_count?: number;
  created_at?: string | null;
  metadata?: Record<string, unknown> | string | null;
}

/**
 * The organization objects nested inside deals, demands and quotations.
 *
 * Those endpoints serialize the whole `organizations` row, so a screen may show a
 * tax number or a registration state from here — but only the five identifying
 * fields are guaranteed, which is why this is a projection of {@link Organization}
 * rather than the record itself. Anything a screen does show must be rendered as
 * recorded: a missing number says "not recorded", never a placeholder.
 */
export type BusinessSummary = Pick<
  Organization,
  'id' | 'name_ar' | 'name_en' | 'type' | 'status'
> &
  Partial<Organization>;

/** A person's place inside one organization — separate from their platform role. */
export interface UserMembership {
  id: number;
  organization_id: number;
  user_id: number;
  role: MembershipRole;
  is_active: boolean;
  joined_at: string;
  user?: Pick<User, 'id' | 'name' | 'email' | 'phone' | 'status'> | null;
}

/**
 * A legal paper a business filed, and the platform's decision on that copy.
 *
 * `accepted` records that a member of this platform's staff read the file. No
 * official register is queried anywhere in the product, so no label may say a
 * number was confirmed by a ministry (§47).
 */
export interface OrganizationDocument {
  id: number;
  organization_id: number;
  type:
    | 'commercial_registration'
    | 'tax_certificate'
    | 'trade_license'
    | 'founding_statute'
    | 'id_proof'
    /** The national ID card, photographed as two separate filings. */
    | 'id_card_front'
    | 'id_card_back'
    | 'other';
  reference_number?: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  original_name?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  url: string | null;
  uploaded_at?: string;
  uploaded_by_name?: string | null;
  reviewed_at?: string | null;
  reviewed_by_name?: string | null;
  review_reason?: string | null;
}

/**
 * A business's filing as another screen's payload carries it.
 *
 * `OfferModerationContext` nests the seller's papers beside the offer it is
 * showing, and projects them: it names the person who reviewed the copy
 * (`reviewed_by`, a display name) where the review queue names the reviewer's own
 * row (`reviewed_by_name`), and it drops the file metadata a moderator never
 * opens. Keeping that projection as its own type is the honest option — reusing
 * {@link OrganizationDocument} would make fields the endpoint does not send look
 * present, and a screen would read `undefined` as "no reviewer".
 */
export interface OrganizationDocumentBrief {
  id: number;
  type: OrganizationDocument['type'];
  status: OrganizationDocument['status'];
  reference_number?: string | null;
  original_name?: string | null;
  url: string | null;
  uploaded_at?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  review_reason?: string | null;
}

/** How long a pending copy has been waiting, and which papers are already accepted. */
export interface DocumentQueueRow extends OrganizationDocument {
  waiting_hours?: number | null;
  organization?: {
    id: number;
    name_ar: string;
    name_en: string | null;
    type: OrganizationType;
    status: OrganizationStatus;
    city: string | null;
    country_code: string;
    registration_no: string | null;
    tax_no: string | null;
    kyc_verified_at: string | null;
    accepted_types: string[];
  } | null;
}

/** `GET /organizations/document-summary` — counts the server took itself. */
export interface DocumentReviewSummary {
  by_status: { pending: number; accepted: number; rejected: number };
  organizations_with_pending_documents: number;
}

/** One line of the checklist the verification gate sends back with its refusal. */
export interface VerificationChecklistItem {
  key: string;
  label_ar: string;
  /** Required by the operator's `legal.require_*` settings, not by this screen. */
  required: boolean;
  done: boolean;
}

/** The `details` object of an `ORGANIZATION_NOT_VERIFIED` error. */
export interface VerificationGateDetails {
  required_action?: string;
  organization_status?: OrganizationStatus | string;
  checklist?: VerificationChecklistItem[];
}
