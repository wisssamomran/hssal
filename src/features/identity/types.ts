import type { OrganizationSummary } from '@/features/organizations/types';

/**
 * The platform's view of a person — the account row, the platform roles they
 * hold, and the RBAC snapshot the console edits.
 *
 * A standing *inside a company* is not here. `MembershipRole` and the member
 * permission views live in `organizations`, because that layer is what decides
 * what the person may do there.
 *
 * These mirror what the endpoints actually return: statuses keep the server's uppercase
 * vocabulary, amounts arrive as decimal strings from MySQL, and any field the
 * platform only knows after a human entered it is nullable. When a component and
 * a type here disagree, the component is wrong.
 */

export interface User {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  national_id?: string | null;
  status: string;
  roles?: string[];
  permissions?: string[];
}

/**
 * A row from `GET /users`, the platform-admin listing.
 *
 * `roles` are the Spatie names attached to the account — the same strings
 * `/auth/me` gives — so `roles[0]` is `'SuperAdmin'`, not an object. Only the
 * platform's own roles can appear here now: `POST /users/{id}/roles` accepts
 * nothing outside `GET /users/roles`, and a migration detached the retired
 * business names (`SellerAdmin` and the rest) from the accounts that carried
 * them, so a list no longer mixes two layers that mean different things.
 *
 * `organizations[].role` is the person's standing inside that business, read
 * from `organization_memberships`, and it is the layer that decides what they
 * may do there. It arrives as a named field for the same reason this type exists:
 * when the endpoint handed back raw models the standing lived in `pivot.role`,
 * this field was `undefined`, and every dropdown on the screen fell back to its
 * first option and showed the wrong role.
 */
export interface ManagedUser {
  id: number;
  name: string;
  email: string | null;
  phone?: string | null;
  national_id?: string | null;
  /** Lowercase: `active`, `suspended`, `inactive`. Login only allows `active`. */
  status: 'active' | 'suspended' | 'inactive' | string;
  roles?: string[];
  organizations?: OrganizationSummary[];
  email_verified_at?: string | null;
  phone_verified_at?: string | null;
  created_at?: string;
}

/**
 * One capability in the catalog, with the scope the platform classified it under.
 *
 * `platform` names never appear in an organization response and `business` names
 * never appear in an account one, so the two editors on the web can only offer
 * what their own door is allowed to write.
 */
export interface ScopedPermission {
  name: string;
  scope: 'platform' | 'business' | 'both';
}

/** The payload of `GET /rbac/platform`. */
export interface PlatformRbacSnapshot {
  permissions: ScopedPermission[];
  roles: {
    name: string;
    declared: string[];
    is_immutable: boolean;
    holder_count: number;
    permissions: string[];
  }[];
  account_forbidden: string[];
}

/** The payload of `GET /rbac/platform/users/{id}/permissions`. */
export interface AccountPermissionsView {
  user_id: number;
  roles: string[];
  grants: string[];
  effective: string[];
}

/**
 * One row from `GET /users/roles` — the roles a platform account may be granted,
 * read from the `roles` table narrowed to `config('rbac.platform_roles')`.
 *
 * `permissions` is the role's actual worth, counted by the server from its own
 * synced rows rather than a list copied into the client, so the console can say
 * what `Auditor` grants before anyone hands it out. Optional because a role that
 * has not been synced yet reports nothing; the screen then shows the name alone
 * rather than a number it invented.
 */
export interface PlatformRoleOption {
  id: number;
  name: string;
  permission_count?: number;
  permissions?: string[];
}
