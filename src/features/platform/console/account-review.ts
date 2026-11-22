import type { ApiResult } from '@/core/api/http';
import { explainRefusal } from '@/core/api/refusal';
import type { RefusalCodeText } from '@/core/api/refusal';
import type { ManagedUser, PlatformRoleOption } from '@/features/identity/types';

/**
 * The rules behind the accounts desk, kept out of the table that draws it.
 *
 * Three judgements belong here rather than in a row component:
 * - which standing a row is allowed to move to, and what a refusal to move it means;
 * - that every write on this desk carries a reason, because the server stores one with
 *   each decision and an unexplained grant cannot be audited or objected to later;
 * - which of the names a person holds are the platform's and which are a company's,
 *   because that split is what decides which column of the row the operator may touch.
 *
 * The last one is the reason this file exists. The row used to compute it inline from
 * `roles.some(...)`, so the same rule was only knowable by reading the table — and the
 * bulk editor, which needs the same answer, would have had to grow its own copy.
 */

/** The account statuses the filter offers, in the words the console uses. */
export const USER_STATUS_LABELS: Record<string, string> = {
  active: 'نشط',
  suspended: 'موقوف',
  inactive: 'غير نشط',
};

/** The same words as the filter's options, with the "everything" choice the desk opens on. */
export const USER_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'كل الحالات' },
  ...Object.entries(USER_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

/** A standing in the console's words; an unmapped value prints itself rather than a guess. */
export function accountStatusLabel(status: string | null | undefined): string {
  if (!status) return 'لم تُسجَّل حالة';
  return USER_STATUS_LABELS[status] ?? status;
}

/**
 * The two standings the status button moves between.
 *
 * Only `active` and `suspended` are reachable from this desk: `inactive` is what an
 * account that never finished setting itself up sits at, and there is no route that
 * writes it by hand.
 */
export function nextAccountStatus(user: Pick<ManagedUser, 'status'>): 'active' | 'suspended' {
  return user.status === 'active' ? 'suspended' : 'active';
}

/**
 * What the status button is about to do, said before it is pressed.
 *
 * The row changes a person's door, not their rank: an account suspended for fighting
 * keeps its roles and its memberships and walks back into them when it is reactivated.
 * That is the difference operators most often get wrong on this screen, so it is said
 * next to the button rather than discovered in the audit log.
 */
export function accountStatusEffect(status: 'active' | 'suspended'): string {
  return status === 'suspended'
    ? 'يمنع الحساب من الدخول نهائيًا؛ لا يغيّر أدواره ولا عضوياته.'
    : 'يعيد للحساب دخول المنصة بأدواره وعضوياته المسجَّلة كما هي.';
}

/**
 * The reason every write here asks for.
 *
 * `UserManagementController` validates `reason` as required on status, grant and
 * revoke alike, so a blank box is a call that cannot succeed. The desk disables the
 * buttons and names the missing box in the same sentence — one rule, so the two
 * halves of the screen cannot drift into asking for different things.
 */
export const ACTION_REASON_MISSING = 'اكتب سبب الإجراء في عمود الحساب أولًا.';

export function hasActionReason(reason: string): boolean {
  return reason.trim().length > 0;
}

/**
 * Which of a person's role names belong to the platform.
 *
 * `GET /platform/users` answers one flat list of names, and the desk has to say which
 * column each came from. The test is the server's own vocabulary, not a prefix or a
 * hardcoded set: `assignUserRole()` refuses any name outside `getUserRoles()`, so a
 * name that list does not contain is a standing inside a company and belongs in the
 * column beside it.
 */
export function splitHeldRoles(
  heldNames: string[],
  platformRoles: PlatformRoleOption[]
): { platform: string[]; company: string[] } {
  const names = new Set(platformRoles.map((role) => role.name));
  return {
    platform: heldNames.filter((name) => names.has(name)),
    company: heldNames.filter((name) => !names.has(name)),
  };
}

/** The platform roles this account could still be given — what it does not already hold. */
export function assignableRoles(heldPlatformRoles: string[], platformRoles: PlatformRoleOption[]): PlatformRoleOption[] {
  return platformRoles.filter((role) => !heldPlatformRoles.includes(role.name));
}

/**
 * The refusals this desk's writes raise, and what each one means to the operator.
 *
 * The codes are `PlatformAccountService`'s: `CANNOT_DISABLE_SELF` and `CANNOT_REVOKE_SELF`
 * for acting on your own account, `LAST_SUPER_ADMIN` for the one revocation that would
 * lock every person out of the console, `ROLE_ALREADY_ASSIGNED`/`ROLE_NOT_HELD` for a
 * queue read minutes ago, and `NOT_A_PLATFORM_ROLE` for the mistake this two-column row
 * invites most: taking a company standing down through the platform's button.
 *
 * `LAST_SUPER_ADMIN` is worth its own sentence rather than the server's, because the
 * operator who reads "سحبه يُغلق المنصة على نفسها" still has to work out who else holds
 * the grade before pressing anything again — the answer is another account, not a retry.
 */
const ACCOUNT_ACTION_CODES: Record<string, RefusalCodeText> = {
  CANNOT_DISABLE_SELF: 'لا يمكنك إيقاف الحساب الذي أنت مسجَّل به.',
  CANNOT_REVOKE_SELF: 'لا يُسحب الدور الإشرافي من الحساب الذي يعمل باللوحة الآن.',
  LAST_SUPER_ADMIN: 'هذا آخر حساب إشرافي على المنصة: امنح غيرك الدور أولًا ثم اسحبه، وإلا لا يفتح اللوحة أحد.',
  NOT_A_PLATFORM_ROLE: 'هذا الدور وقوف داخل منشأة، ولا تُسحب الوقوفات من لوحة المنصة — تُغيَّر من عمود «الدور داخل منشآته».',
  ROLE_ALREADY_ASSIGNED: 'الحساب يحمل هذا الدور بالفعل؛ حدّث القائمة قبل الإسناد.',
  ROLE_NOT_HELD: 'لم يعد هذا الدور مسندًا للحساب؛ حدّث القائمة قبل السحب.',
  PERMISSION_DENIED: 'تعديل حسابات المنصة وأدوارها صلاحية لا يملكها هذا الحساب.',
};

export function accountActionMessage(result: ApiResult<unknown>, fallback: string): string {
  return explainRefusal(result, { fallback, codes: ACCOUNT_ACTION_CODES });
}
