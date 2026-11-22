import type { User } from '@/features/identity/types';
import type { Organization, OrganizationSummary } from '@/features/organizations/types';

/**
 * Who is signed in, from which device, and what the account still owes this
 * deployment. Nothing about a business is answered here: the record is
 * `organizations`' and the platform account is `identity`'s.
 *
 * These mirror what the endpoints actually return: statuses keep the server's uppercase
 * vocabulary, amounts arrive as decimal strings from MySQL, and any field the
 * platform only knows after a human entered it is nullable. When a component and
 * a type here disagree, the component is wrong.
 */

/**
 * What the account still owes this deployment, carried by `/auth/login`,
 * `/auth/register`, `/auth/google` and `/auth/me`.
 *
 * The client does not decide which fields a signup needs — the operator's
 * `account.require_*` settings do, and the server has already read them. So a
 * form here asks for exactly `missing_fields` and nothing else: no field can be
 * demanded after the setting is switched off, and none can be skipped while an
 * action is still refused.
 */
export interface ProfileCompletion {
  required: boolean;
  /** Field keys the server named, e.g. `phone`, `national_id`. */
  missing_fields: string[];
  has_organization: boolean;
  /** False for an account opened from a provider assertion: it has no local password. */
  has_password: boolean;
}

/**
 * One device this account is signed in from (§4.17).
 *
 * `biometric_unlock` is a label the device wrote about itself, not a capability:
 * no endpoint accepts a fingerprint, so the flag can never widen what a row on
 * this list is allowed to do. It is here so a person can recognise the handset
 * they left in a drawer and revoke the session it is holding.
 */
export interface SigninDevice {
  id: number;
  name: string;
  platform: 'android' | 'ios' | 'web';
  biometric_unlock: boolean;
  /** True for the device making the call, computed per request on the server. */
  current: boolean;
  last_seen_at: string | null;
  created_at: string | null;
}

/**
 * What every door that signs a session in returns inside `data`:
 * `/auth/login`, `/auth/register`, `/auth/google`.
 *
 * `active_organization` is the first membership the server found, not a choice
 * the buyer made — and it is the only organization key that exists. The old
 * `organization` sibling was a leftover from the days registration created a
 * business; keeping it here would invite a screen to read a field the API never
 * sends, which reads as "no organization" forever.
 */
export interface AuthSession {
  token: string;
  user?: User;
  active_organization?: Organization | null;
  organizations?: OrganizationSummary[];
  profile_completion?: ProfileCompletion;
}

