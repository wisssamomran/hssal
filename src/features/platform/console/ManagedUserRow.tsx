import React, { useState } from 'react';
import { recorded } from '@/shared/ui/panel';
import type { ApiResult } from '@/core/api/http';
import { assignUserRole, revokeUserRole, updateUserStatus } from '@/features/identity/api';
import type { ManagedUser, PlatformRoleOption } from '@/features/identity/types';
import { updateOrganizationMember } from '@/features/organizations/api';
import type { MembershipRoleOption } from '@/features/organizations/types';
import { getLocale } from '@/core/i18n';
import { PermissionsList } from './PermissionsList';
import {
  ACTION_REASON_MISSING,
  accountStatusLabel,
  accountStatusEffect,
  assignableRoles,
  hasActionReason,
  nextAccountStatus,
  splitHeldRoles,
} from './account-review';

/**
 * One account, its two standings, and the writes that move them.
 *
 * The columns are the point of the row and they are deliberately not merged: "أدوار
 * المنصة" is what the platform granted this account by its own name, "الدور داخل
 * منشآته" is what a company's owner made that person inside it. Changing one leaves the
 * other alone, so each carries its own control and its own explanation, and the split
 * between them is computed by `splitHeldRoles()` from the server's role vocabulary
 * rather than from how a name reads.
 *
 * The drafts live here, not in the desk above: which role the operator is about to
 * grant and which standing they are about to move are this row's business, and the
 * panel holding a `Record<user, draft>` for each was how one row's pick leaked into
 * another's after a reload reordered the page.
 *
 * Everything the row writes carries a reason, because `PlatformAccountService` stores
 * one with every decision and an unexplained grant cannot be audited or objected to
 * later — so the buttons wait for the box, and say why they are waiting.
 */
export const ManagedUserRow: React.FC<{
  user: ManagedUser;
  platformRoles: PlatformRoleOption[];
  membershipRoles: MembershipRoleOption[];
  selected: boolean;
  busy: boolean;
  reason: string;
  mayGovernAccounts: boolean;
  onToggleSelected: () => void;
  /** Owned by the desk, because the same box feeds the bulk decision and the audit entry. */
  onReasonChange: (value: string) => void;
  /** Every write goes through the desk, which owns the banner, the busy id and the reload. */
  onRun: (action: () => Promise<ApiResult<unknown>>, done: string) => void;
  onEditDirect: () => void;
}> = ({
  user,
  platformRoles,
  membershipRoles,
  selected,
  busy,
  reason,
  mayGovernAccounts,
  onToggleSelected,
  onReasonChange,
  onRun,
  onEditDirect,
}) => {
  const heldNames = user.roles ?? [];
  const { platform: platformNames, company: companyNames } = splitHeldRoles(heldNames, platformRoles);
  const assignable = assignableRoles(platformNames, platformRoles);

  const [pendingRole, setPendingRole] = useState('');
  const [pendingMemberRoles, setPendingMemberRoles] = useState<Record<number, string>>({});

  const nextRole = pendingRole || assignable[0]?.name || '';
  const nextRoleOption = platformRoles.find((role) => role.name === nextRole);
  const targetStatus = nextAccountStatus(user);
  const memberships = user.organizations ?? [];
  const reasonGiven = hasActionReason(reason);
  // Sent rather than the raw box: the server reads a name written as spaces as no
  // name at all, and a reason stored with padding is a reason nobody recognises
  // when they read the audit entry a year later.
  const reasonText = reason.trim();

  return (
    <tr className="align-top hover:bg-slate-50/60">
      <td className="p-3 min-w-0">
        {mayGovernAccounts ? (
          <label className="mb-1 flex cursor-pointer items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelected}
              className="h-3.5 w-3.5 accent-emerald-600"
            />
            <span>اختيار لقرار جماعي</span>
          </label>
        ) : null}
        <div className="font-bold text-slate-900">{user.name}</div>
        <div className="text-[11px] text-slate-500 break-all" dir="ltr">
          {recorded(user.email)}
        </div>
        <div className="text-[11px] text-slate-400">#{user.id}</div>
        {/* One reason per account, written where the row starts: the server stores it
            with every decision made below it, in either column. */}
        <label className="block space-y-1 pt-2">
          <span className="block text-[10px] font-bold text-slate-600">سبب الإجراء (مطلوب)</span>
          <input
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="مثال: انتقال المسؤول عن فريق الاستيراد"
            className="w-full min-w-[11rem] bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] focus:bg-white focus:outline-none"
          />
        </label>
      </td>

      {/* 1. The platform's own standing. */}
      <td className="p-3 min-w-0">
        {platformNames.length ? (
          <div className="space-y-1">
            {platformNames.map((role) => {
              const held = platformRoles.find((option) => option.name === role);
              return (
                <div key={role} className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-800">
                      {role}
                    </span>
                    {held?.permissions?.length ? (
                      <span className="text-[10px] text-slate-500">{held.permissions.length} صلاحية</span>
                    ) : null}
                    <button
                      disabled={busy || !reasonGiven}
                      onClick={() => onRun(() => revokeUserRole(user.id, role, reasonText), 'تم سحب الدور')}
                      className="text-[10px] font-bold text-rose-700 border border-rose-200 rounded-lg px-2 py-1 disabled:opacity-40 cursor-pointer"
                    >
                      سحب الدور
                    </button>
                  </div>
                  {/* What is being taken away, in the same native disclosure as what is
                      being given: a revocation read as "12 صلاحيات" is a guess about who
                      stops working tomorrow. */}
                  {held?.permissions?.length ? (
                    <PermissionsList label={`يسحب ${held.permissions.length} صلاحية — اضغط لعرضها`} permissions={held.permissions} />
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <span className="text-[11px] text-slate-400">لا دور على المنصة</span>
        )}

        {assignable.length ? (
          <div className="mt-2 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/70 p-2">
            <div className="text-[10px] font-bold text-slate-600">إسناد دور منصة</div>
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                value={nextRole}
                onChange={(event) => setPendingRole(event.target.value)}
                className="min-w-0 flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-mono"
              >
                {assignable.map((role) => (
                  <option key={role.id} value={role.name}>
                    {role.name}
                    {role.permissions?.length ? ` (${role.permissions.length} صلاحية)` : ''}
                  </option>
                ))}
              </select>
              <button
                disabled={busy || !nextRole || !reasonGiven}
                onClick={() => {
                  onRun(() => assignUserRole(user.id, nextRole, reasonText), 'تم إسناد الدور');
                  setPendingRole('');
                }}
                className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 disabled:opacity-40 cursor-pointer"
              >
                إسناد
              </button>
            </div>
            {/* Naming the grant without its worth is how an admin gives `users.manage`
                expecting a read-only reviewer. */}
            {nextRoleOption?.permissions?.length ? (
              <PermissionsList
                label={`يمنح ${nextRoleOption.permissions.length} صلاحية على المنصة كلها — اضغط لعرضها`}
                permissions={nextRoleOption.permissions}
              />
            ) : null}
            {!reasonGiven ? (
              <div className="text-[10px] font-bold text-amber-700">{ACTION_REASON_MISSING}</div>
            ) : null}
          </div>
        ) : null}

        {/* A company standing shows here so it is not mistaken for a platform one, and
            is not touchable here: `NOT_A_PLATFORM_ROLE` is what the desk answers anyone
            who tries. */}
        {companyNames.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {companyNames.map((role) => (
              <span
                key={role}
                title="دور داخل منشأة؛ يُغيَّر من العمود المجاور"
                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-500"
              >
                {role}
              </span>
            ))}
          </div>
        )}
      </td>

      {/* 2. The standing inside each company the person belongs to. */}
      <td className="p-3 min-w-0">
        {memberships.length ? (
          <div className="space-y-2">
            {memberships.map((org) => {
              const choices = membershipRoles.length ? membershipRoles : [{ value: org.role, label: org.role }];
              const wanted = pendingMemberRoles[org.id] ?? org.role;
              const changed = wanted !== org.role;
              const active = org.membership_active !== false;
              const roleLabel = (value: string) => choices.find((option) => option.value === value)?.label ?? value;
              // What the standing is worth, from the server's own matrix: a dropdown
              // that names a role without saying what it grants is an appointment made
              // by guessing. Absent until the vocabulary endpoint has answered.
              const picked = choices.find((option) => option.value === wanted);

              return (
                <div
                  key={org.id}
                  className="min-w-0 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/70 p-2"
                >
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <span className="min-w-0 text-[11px] font-bold text-slate-700">
                      <span className="block truncate">
                        {recorded(getLocale() === 'ar' ? org.name_ar : org.name_en)}
                      </span>
                      {!active && (
                        <span className="block text-[10px] font-medium text-amber-700">عضوية منتهية الوصول</span>
                      )}
                    </span>
                    {!changed && (
                      <span className="shrink-0 text-[10px] text-slate-400">مسجَّل: {roleLabel(org.role)}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <select
                      value={wanted}
                      onChange={(event) => setPendingMemberRoles((prev) => ({ ...prev, [org.id]: event.target.value }))}
                      className="min-w-0 flex-1 bg-white border border-slate-200 rounded-lg px-1.5 py-1 text-[11px]"
                    >
                      {choices.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                          {option.permissions?.length ? ` (${option.permissions.length} صلاحية)` : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={!changed || busy || !reasonGiven}
                      onClick={() =>
                        onRun(
                          () => updateOrganizationMember(org.id, user.id, wanted, reasonText),
                          'تم تحديث الدور داخل المنشأة'
                        )
                      }
                      className="text-[10px] font-bold text-slate-700 bg-white border border-slate-300 rounded-lg px-2 py-1 disabled:opacity-40 cursor-pointer"
                    >
                      حفظ الدور
                    </button>
                    <button
                      disabled={busy || !reasonGiven}
                      title="الوصول داخل المنشأة، لا الحالة العامة للحساب"
                      onClick={() =>
                        onRun(
                          () => updateOrganizationMember(org.id, user.id, org.role, reasonText, !active),
                          active ? 'أُنهيت عضوية الشخص في هذه المنشأة' : 'أُعيدت العضوية'
                        )
                      }
                      className="text-[10px] font-bold text-slate-600 bg-white border border-slate-300 rounded-lg px-2 py-1 disabled:opacity-40 cursor-pointer"
                    >
                      {active ? 'إنهاء الوصول' : 'إعادة الوصول'}
                    </button>
                  </div>
                  {picked?.permissions?.length ? (
                    <PermissionsList
                      label={`${wanted === org.role ? 'يملك' : 'سيصبح'} ${roleLabel(wanted)} بـ ${picked.permissions.length} صلاحية داخل هذه المنشأة — اضغط لعرضها`}
                      permissions={picked.permissions}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <span className="text-[11px] text-slate-400">لا عضوية في منشأة</span>
        )}
      </td>

      <td className="p-3 min-w-0">
        <span
          className={`inline-block whitespace-nowrap text-[11px] font-bold px-2 py-0.5 rounded-full border ${
            user.status === 'active'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {accountStatusLabel(user.status)}
        </span>
      </td>

      <td className="p-3 w-full min-w-0">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
          {mayGovernAccounts ? (
            <button
              disabled={busy}
              onClick={onEditDirect}
              title="ما أُسنِد لهذا الحساب باسمه، لا ما أتاه من دور"
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer dark:border-hassal-line dark:bg-hassal-raised dark:text-slate-100"
            >
              المنح المباشر
            </button>
          ) : null}
          <button
            disabled={busy || !reasonGiven}
            onClick={() => onRun(() => updateUserStatus(user.id, targetStatus, reasonText), 'تم تحديث حالة الحساب')}
            className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border disabled:opacity-40 cursor-pointer ${
              targetStatus === 'suspended'
                ? 'bg-rose-600 text-white border-rose-600'
                : 'bg-emerald-600 text-white border-emerald-600'
            }`}
          >
            {targetStatus === 'suspended' ? 'إيقاف الحساب' : 'إعادة تفعيل الحساب'}
          </button>
          {/* Said next to the button, because the column above changes a person's
              standing inside one company and this one changes the door itself. */}
          <span className="text-[10px] leading-relaxed text-slate-500">{accountStatusEffect(targetStatus)}</span>
        </div>
        {!reasonGiven ? (
          <div className="text-[10px] font-bold text-amber-700 pt-1">{ACTION_REASON_MISSING}</div>
        ) : null}
      </td>
    </tr>
  );
};
