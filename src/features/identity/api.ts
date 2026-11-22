/**
 * The platform's own accounts: the people the console lists, and the roles and
 * permissions held over them.
 *
 * Every path below is a route the server actually registers: `npm run check:api`
 * compares these modules against `php artisan route:list`, so a button here cannot
 * be wired to an endpoint that was never built. A call that must not run twice on a
 * retried click passes an `idempotencyKey`, and the transport that stamps it — the
 * token, the organization header, the envelope — is `src/core/api/http.ts`.
 */

import { idempotencyKey, qs, request } from '@/core/api/http';

import type { AccountPermissionsView, ManagedUser, PlatformRbacSnapshot, PlatformRoleOption } from '@/features/identity/types';

//
// `roles.manage`, and nothing on this screen can touch a company: the server
// refuses a business capability here by the same rule that refuses a platform
// capability inside a company.
export async function getPlatformRbac() {
  return request<PlatformRbacSnapshot>('/api/v1/rbac/platform');
}

export async function updatePlatformRolePermissions(roleName: string, data: { permissions: string[]; reason: string }) {
  return request<{ name: string; permissions: string[] }>(
    `/api/v1/rbac/platform/roles/${encodeURIComponent(roleName)}/permissions`,
    {
      method: 'PUT',
      body: data,
      idempotencyKey: idempotencyKey('platform_role_edit'),
    }
  );
}

export async function getAccountPermissions(userId: number) {
  return request<AccountPermissionsView>(`/api/v1/rbac/platform/users/${userId}/permissions`);
}

/**
 * `mode` is explicit for the same reason the server requires it: the same
 * payload means "these are all of them", "add these" or "take these away", and
 * the difference between the three is too large to infer from a shape.
 */
export async function updateAccountPermissions(
  data: { user_ids: number[]; permissions: string[]; mode: 'replace' | 'add' | 'remove'; reason: string }
) {
  return request<{ mode: string; applied: { user_id: number; permissions: string[]; changed: boolean }[] }>(
    '/api/v1/rbac/platform/users/permissions',
    {
      method: 'PUT',
      body: data,
      idempotencyKey: idempotencyKey('platform_account_edit'),
    }
  );
}

/**
 * Accounts on the platform. The server filters by `search` (name, email,
 * phone) and `status` — there is no role filter, so a screen that wants
 * people by role reads `roles` off the rows it already has.
 */
export async function getUsers(filters: { search?: string; status?: string; page?: number; per_page?: number } = {}) {
  return request<ManagedUser[]>('/api/v1/users' + qs({ ...filters }));
}

export async function getUser(id: number) {
  return request<ManagedUser>(`/api/v1/users/${id}`);
}

/**
 * The roles the *platform* can grant, read from the `roles` table narrowed to
 * `config('rbac.platform_roles')`. The server rejects anything outside that
 * list, so a business role is never assigned from here — it belongs to one
 * organization and changes through `updateOrganizationMember`.
 *
 * Each row carries the permissions the role actually holds, so the console can
 * show what a grant is worth instead of a bare name.
 */
export async function getUserRoles() {
  return request<PlatformRoleOption[]>('/api/v1/users/roles');
}

/**
 * `reason` is required and lands in the audit entry beside the role, so a
 * grant stays explainable months later. The endpoint is idempotency-keyed:
 * a double click must not create two audit rows for one decision.
 */
export async function assignUserRole(id: number, roleName: string, reason: string) {
  return request(`/api/v1/users/${id}/roles`, {
    method: 'POST',
    body: { role_name: roleName, reason },
    idempotencyKey: idempotencyKey('role_grant'),
  });
}

/**
 * Revoking needs the same accounting as granting. The body is what makes a
 * DELETE carry it; the server also refuses to remove the last SuperAdmin or
 * to let an admin revoke their own platform role.
 */
export async function revokeUserRole(id: number, role: string, reason: string) {
  return request(`/api/v1/users/${id}/roles/${encodeURIComponent(role)}`, {
    method: 'DELETE',
    body: { reason },
    idempotencyKey: idempotencyKey('role_revoke'),
  });
}

/**
 * `active`, `suspended` or `inactive` — lowercase, the vocabulary the column
 * holds and the one login checks. The reason is required: it is stored in the
 * audit entry next to the previous status, so a lockout stays explainable.
 * An account cannot be suspended by the person signed in as it.
 */
export async function updateUserStatus(id: number, status: 'active' | 'suspended' | 'inactive', reason: string) {
  return request(`/api/v1/users/${id}/status`, { method: 'PUT', body: { status, reason } });
}
