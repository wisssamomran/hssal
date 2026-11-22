/**
 * Signing in, and everything that follows from who is signed in: the session this
 * browser holds, the account's own details, the devices it is known on, and the
 * cold-start payload the app reads before it draws anything.
 *
 * Every path below is a route the server actually registers: `npm run check:api`
 * compares these modules against `php artisan route:list`, so a button here cannot
 * be wired to an endpoint that was never built. A call that must not run twice on a
 * retried click passes an `idempotencyKey`, and the transport that stamps it — the
 * token, the organization header, the envelope — is `src/core/api/http.ts`.
 */

import { idempotencyKey, request, setTenantId, setToken, signInDeviceFields } from '@/core/api/http';

import type { AuthSession, ProfileCompletion, SigninDevice } from '@/features/auth/types';
import type { User } from '@/features/identity/types';
import type { ActiveOrganization, OrganizationSummary } from '@/features/organizations/types';

/**
 * Adopt a session the server just handed back.
 *
 * The tenant header is set from `active_organization` and cleared when it is
 * absent. Both halves matter: a leftover id from a previous session would
 * silently attribute this person's actions to somebody else's business, which
 * is why "no organization" is a write, not a skip.
 */
export function adoptSession(session: AuthSession | undefined): void {
  if (!session?.token) return;
  setToken(session.token);
  setTenantId(session.active_organization?.id ?? null);
}

/**
 * Open an account: a person, nothing else.
 *
 * There is no organization key here because the server refuses them — a
 * business is created on its own through `POST /organizations`, where the
 * legal-record rules, the duplicate-register check and the per-account ceiling
 * are applied. Registration is the one door shared by password and Google
 * accounts, so it asks what both kinds can answer.
 */
export async function register(data: {
  name: string;
  email: string;
  phone?: string;
  national_id?: string;
  password: string;
  password_confirmation: string;
}) {
  const res = await request<AuthSession>('/api/v1/auth/register', {
    method: 'POST',
    body: { ...data, ...signInDeviceFields() },
    idempotencyKey: idempotencyKey('reg'),
  });
  if (res.success) adoptSession(res.data);
  return res;
}

export async function login(login: string, password: string) {
  const res = await request<AuthSession>('/api/v1/auth/login', {
    method: 'POST',
    body: { login, password, ...signInDeviceFields() },
  });
  if (res.success) adoptSession(res.data);
  return res;
}

/**
 * Exchange a Google ID token for a session.
 *
 * `nonce` is the random string this browser generated *before* it drew the
 * button, and it is passed to Google Identity Services at initialization so
 * Google signs it into the token. Sending it back lets the server prove the
 * token was minted for this attempt rather than carried in from an earlier
 * one — the check is required in both directions, so a token with a nonce and
 * no claim presented, or the reverse, is refused.
 */
export async function googleSignIn(credential: string, nonce: string) {
  const res = await request<AuthSession>('/api/v1/auth/google', {
    method: 'POST',
    body: { credential, nonce, device_name: 'متصفّح الويب', ...signInDeviceFields() },
  });
  if (res.success) adoptSession(res.data);
  return res;
}

export async function forgotPassword(email: string) {
  return request('/api/v1/auth/forgot-password', { method: 'POST', body: { email } });
}

export async function resetPassword(data: { email: string; token: string; password: string; password_confirmation: string }) {
  return request('/api/v1/auth/reset-password', { method: 'POST', body: data });
}

export async function logout() {
  await request('/api/v1/auth/logout', { method: 'POST' });
  setToken(null);
  setTenantId(null);
}

export async function getMe() {
  return request<{
    user: User;
    current_organization?: ActiveOrganization | null;
    organizations?: OrganizationSummary[];
    profile_completion?: ProfileCompletion;
  }>('/api/v1/auth/me');
}

/** The server validates the membership before honouring this. */
export async function switchOrganization(orgId: number) {
  const res = await request<{ organization: OrganizationSummary }>('/api/v1/auth/switch-organization', {
    method: 'POST',
    body: { organization_id: orgId },
  });
  if (res.success) setTenantId(orgId);
  return res;
}

/**
 * The person's own details — nothing else. `email` is not accepted here: a
 * form that moved an account's login identity would hand whoever typed into
 * it the next owner's password resets. It is also not the business record;
 * that is `PUT /organizations/{id}` behind `organizations.manage`.
 */
export async function updateProfile(data: { name?: string; phone?: string | null; national_id?: string | null }) {
  return request<Pick<User, 'id' | 'name' | 'email' | 'phone' | 'national_id'>>('/api/v1/auth/profile', {
    method: 'PATCH',
    body: data,
    idempotencyKey: idempotencyKey('profile'),
  });
}

/**
 * Re-hashes the password and revokes every other token on the account.
 *
 * The token in this browser survives because the server excludes the access
 * token that made the call — but any second device is signed out by this
 * action, so a screen that offers it has to say so.
 */
export async function changePassword(data: { current_password: string; password: string; password_confirmation: string }) {
  return request('/api/v1/auth/password', {
    method: 'POST',
    body: data,
    idempotencyKey: idempotencyKey('pwd'),
  });
}

/**
 * Every device this account is signed in from, with the one making the call
 * marked `current`.
 *
 * The list is the server's, not the browser's: a session can describe itself
 * but cannot know how many other handsets are holding a live token for the
 * same person, and a security panel that listed only the device it runs on
 * would be reassurance rather than information.
 */
export async function getDevices() {
  return request<SigninDevice[]>('/api/v1/auth/devices');
}

/**
 * Rename a device, or say whether it opens without a password.
 *
 * `biometric_unlock` is a label the handset writes about itself. No endpoint
 * accepts a fingerprint, so this field can never widen what a device is
 * allowed to do — it exists so a person can spot the phone they left in a
 * drawer and revoke it.
 */
export async function updateDevice(id: number, data: { name?: string; biometric_unlock?: boolean }) {
  return request<SigninDevice>(`/api/v1/auth/devices/${id}`, {
    method: 'PATCH',
    body: data,
    idempotencyKey: idempotencyKey('dev'),
  });
}

/** End the device's session by deleting its token; the row goes with it. */
export async function revokeDevice(id: number) {
  return request(`/api/v1/auth/devices/${id}`, { method: 'DELETE' });
}

export async function getBootstrap() {
  return request<Record<string, any>>('/api/v1/bootstrap');
}
