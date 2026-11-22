import React, { useCallback, useEffect, useState } from 'react';
import { Users, UserPlus, Trash2, RefreshCw, Info } from 'lucide-react';
import { fieldError } from '@/core/api/http';
import type { ApiResult } from '@/core/api/http';
import { serverMessage } from '@/core/api/refusal';
import { addOrganizationMember, getMembershipRoles, getOrganizationMembers, removeOrganizationMember, updateOrganizationMember } from '@/features/organizations/api';
import type { MembershipRoleOption, UserMembership } from '@/features/organizations/types';
import { formatDate, getLocale } from '@/core/i18n';
import { BannerView, DecisionButton, ErrorNote, LabeledSelect, PanelShell, TextInput } from '@/shared/ui/panel';
import type { Banner } from '@/shared/ui/panel';
import { OrganizationRolesPanel } from '@/features/organizations/components/OrganizationRolesPanel';

interface MembersViewProps {
  /** The organization the session is acting as. Null when nobody is signed in. */
  organizationId: number | null;
  organizationName: string | null;
  /** `auth/me.current_organization.membership_role` — not a guess from the client. */
  myRole: string | null;
  isSuperAdmin: boolean;
  can: (permission: string) => boolean;
}

/**
 * Why the notes live beside the role and not in a help page: choosing a standing
 * here decides what that person can do to this company's offers, deals and
 * documents, so the consequence has to be readable at the moment of the choice.
 * The words themselves come from the server with the values; this map only adds
 * the consequence, and falls back to the server label for a role it predates.
 */
const ROLE_NOTES: Record<string, string> = {
  owner: 'يدير كل الأدوار ولا تُزال ملكيته إن كان آخر مالك',
  admin: 'يضيف الأعضاء ويغيّر أدوارهم دون الملكية',
  staff: 'تنفيذ يومي على العروض والطلبات داخل المنشأة',
  finance: 'الدفعات والدفتر والتسويات',
  auditor: 'اطّلاع ومراجعة دون تنفيذ',
};

/** Same rule the server applies before it honours any membership write. */
const mayManage = (myRole: string | null, isSuperAdmin: boolean): boolean =>
  isSuperAdmin || myRole === 'owner' || myRole === 'admin';

/**
 * The roster's fallback line, on top of the reading rule in `core/api/refusal`.
 *
 * Which half of the envelope carries the server's answer is settled once for the whole
 * client; a membership write that arrives with nothing to say is rare enough that this
 * sentence only names the subject — the roster — so a banner never reads as a generic
 * failure.
 */
const refusalOf = (result: ApiResult<unknown>): string =>
  serverMessage(result, 'تعذّر تنفيذ الأمر على المنشأة');

/**
 * The server's own vocabulary, asked for rather than written out.
 *
 * The hardcoded list this replaced named `operator`, which no validator had
 * ever accepted while the column defaulted to it and the stored rows said
 * `staff` — so the option a user picked was sometimes the one the server would
 * reject, and the standing a member actually held was not in the dropdown at
 * all. `GET /organizations/membership-roles` is the same list the validator and
 * the column CHECK are built from.
 */
const useMembershipRoles = () => {
  const [options, setOptions] = useState<MembershipRoleOption[]>([]);

  useEffect(() => {
    let active = true;
    void getMembershipRoles().then((result) => {
      if (active && result.success && Array.isArray(result.data)) setOptions(result.data);
    });
    return () => {
      active = false;
    };
  }, []);

  return options;
};

export const MembersView: React.FC<MembersViewProps> = ({
  organizationId,
  organizationName,
  myRole,
  isSuperAdmin,
  can,
}) => {
  const locale = getLocale();
  const [members, setMembers] = useState<UserMembership[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  const [denied, setDenied] = useState<string | null>(null);

  const roleOptions = useMembershipRoles();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [addReason, setAddReason] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});

  const [editing, setEditing] = useState<number | null>(null);
  const [editRole, setEditRole] = useState('');
  /** One reason per row, sent with whichever action that row finally takes. */
  const [rowReasons, setRowReasons] = useState<Record<number, string>>({});
  /**
   * The member whose individual grants the editor below should open on, set from
   * the roster row and cleared once taken. A scroll-and-select rather than a
   * second table because the overrides belong to the same decision as the
   * standing: a person who changes a role and then adds to it is making one
   * choice about one colleague.
   */
  const [focusMember, setFocusMember] = useState<number | null>(null);

  const canManage = can('members.manage') && mayManage(myRole, isSuperAdmin);

  const selectOptions = (roleOptions.length
    ? roleOptions.map((entry) => ({
        value: entry.value,
        label:
          `${entry.label}${ROLE_NOTES[entry.value] ? ` — ${ROLE_NOTES[entry.value]}` : ''}` +
          // The number is the server's own matrix, not a copy written here, so
          // the option says what it is worth in the same breath as its name.
          (entry.permissions?.length ? ` (${entry.permissions.length} صلاحية)` : ''),
      }))
    : []);

  /**
   * Ownership is left in the list only for someone who can actually grant it.
   * The server refuses the attempt for an admin either way; hiding the option
   * saves the person from a choice that can only come back as a refusal.
   */
  const addableOptions = mayManage(myRole, isSuperAdmin) && (isSuperAdmin || myRole === 'owner')
    ? selectOptions
    : selectOptions.filter((entry) => entry.value !== 'owner');

  useEffect(() => {
    if (!role && addableOptions.length) {
      const preferred = addableOptions.find((entry) => entry.value === 'staff') ?? addableOptions[0];
      setRole(preferred.value);
    }
    // `role` is in the condition on purpose: it is set once and never needs to
    // re-run, and watching the options object would reset a pick on refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addableOptions.length]);

  /** The standing a member holds that the vocabulary no longer names. */
  const labelFor = (value: string): string =>
    roleOptions.find((entry) => entry.value === value)?.label ?? value;

  /** What a standing grants, from the server. Empty when the row was built from
   *  a stored role name alone and the vocabulary has not arrived. */
  const grantsFor = (value: string): string[] =>
    roleOptions.find((entry) => entry.value === value)?.permissions ?? [];

  const load = useCallback(async () => {
    if (!organizationId) {
      setMembers([]);
      setDenied(null);
      return;
    }
    setLoading(true);
    setDenied(null);
    try {
      const result = await getOrganizationMembers(organizationId);
      if (result.success && Array.isArray(result.data)) {
        setMembers(result.data);
      } else {
        // An empty roster and a roster you may not read are different facts.
        setMembers([]);
        setDenied(refusalOf(result));
      }
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (label: string, action: () => Promise<ApiResult<unknown>>) => {
    setBusy(true);
    setBanner(null);
    setFieldErrors({});
    try {
      const result = await action();
      if (result.success) {
        setBanner({ kind: 'ok', text: result.message && result.message !== 'OK' ? result.message : label });
        await load();
      } else {
        setFieldErrors({
          email: fieldError(result, 'email'),
          role: fieldError(result, 'role'),
          reason: fieldError(result, 'reason'),
        });
        setBanner({ kind: 'error', text: refusalOf(result) });
      }
    } finally {
      setBusy(false);
    }
  };

  const addMember = () => {
    const trimmed = email.trim();
    const reason = addReason.trim();
    const errors: Record<string, string | null> = {};
    if (!trimmed) errors.email = 'البريد الإلكتروني مطلوب';
    if (!role) errors.role = 'اختر الدور داخل المنشأة';
    if (reason.length < 3) errors.reason = 'السبب مطلوب ويُحفظ في سجل التدقيق';
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    void run('أُضيف العضو إلى المنشأة.', () =>
      addOrganizationMember(Number(organizationId), { email: trimmed, role, reason })
    );
    setEmail('');
    setAddReason('');
  };

  const changeRole = async (userId: number) => {
    const reason = (rowReasons[userId] ?? '').trim();
    if (reason.length < 3) {
      setBanner({ kind: 'error', text: 'السبب مطلوب قبل حفظ تغيير الدور.' });
      return;
    }
    await run('تم تحديث دور العضو.', () =>
      updateOrganizationMember(Number(organizationId), userId, editRole, reason)
    );
    setEditing(null);
  };

  const removeMember = (userId: number, name: string) => {
    const reason = (rowReasons[userId] ?? '').trim();
    if (reason.length < 3) {
      setBanner({ kind: 'error', text: 'اكتب سبب الإزالة أولًا؛ يُحفظ مع القرار في سجل التدقيق.' });
      return;
    }
    if (!window.confirm(`إزالة ${name || 'هذا المستخدم'} من المنشأة؟ سيفقد وصوله إليها فوراً.`)) return;
    void run('أُزيل العضو من المنشأة.', () =>
      removeOrganizationMember(Number(organizationId), userId, reason)
    );
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-3 py-6 sm:px-6 lg:px-8">
      <PanelShell
        title="أعضاء المنشأة وأدوارهم"
        hint={
          organizationName
            ? `الدور هنا خاص بمنشأتك «${organizationName}» ولا يمنح صلاحيات في منشأة أخرى. الأدوار تُطابق التحقق في الخادم لكل عملية كتابة.`
            : 'الأدوار مرتبطة بعضوية المنشأة، ولا تُقرأ كصلاحيات عامة.'
        }
      >
        {!organizationId ? (
          <ErrorNote text="لا منشأة نشطة لهذا الجلسة. سجّل الدخول واختر منشأة لعرض عضويتها." />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <Users className="w-4 h-4 text-emerald-700" />
                <span>عدد الأعضاء النشطين: {members.length}</span>
              </div>
              <DecisionButton onClick={() => void load()} busy={loading}>
                <RefreshCw className="w-3.5 h-3.5" />
                <span>تحديث القائمة</span>
              </DecisionButton>
            </div>

            {can('members.manage') && !mayManage(myRole, isSuperAdmin) ? (
              <ErrorNote text="صلاحية إدارة الأعضاء موجودة، لكن دورك في هذه المنشأة لا يسمح بتعديل عضويتها: الإدارة للمالك أو مدير المنشأة فقط." />
            ) : null}

            {!roleOptions.length ? (
              <ErrorNote text="لم تصل قائمة الأدوار من الخادم؛ لا تُعرض خيارات قد يرفضها. أعد المحاولة بالتحديث." />
            ) : null}

            <BannerView banner={banner} />

            {denied ? <ErrorNote text={denied} /> : null}

            {loading && members.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">جارٍ جلب العضوية…</p>
            ) : members.length === 0 && !denied ? (
              <p className="py-8 text-center text-xs text-slate-500">
                لا توجد عضويات نشطة مسجّلة لهذه المنشأة في قاعدة البيانات.
              </p>
            ) : (
              <div className="min-w-0 overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[34rem] text-right text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="p-3 font-semibold">المستخدم</th>
                      <th className="p-3 font-semibold">البريد / الهاتف</th>
                      <th className="p-3 font-semibold">الدور في المنشأة</th>
                      <th className="p-3 font-semibold">حالة الحساب</th>
                      <th className="p-3 font-semibold">انضم في</th>
                      {canManage ? <th className="p-3 text-center font-semibold">إجراء</th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {members.map((member) => (
                      <tr key={member.id} className="hover:bg-slate-50/70">
                        <td className="p-3 font-bold text-slate-900">
                          <div className="max-w-[10rem] truncate" title={member.user?.name || `مستخدم #${member.user_id}`}>
                            {member.user?.name || `مستخدم #${member.user_id}`}
                          </div>
                        </td>
                        <td className="p-3 text-slate-600">
                          <div className="max-w-[11rem] truncate" dir="ltr" title={recordedText(member.user?.email)}>
                            {recordedText(member.user?.email)}
                          </div>
                          <div className="max-w-[11rem] truncate text-[10px] text-slate-400" dir="ltr" title={recordedText(member.user?.phone)}>
                            {recordedText(member.user?.phone)}
                          </div>
                        </td>
                        <td className="p-3">
                          {editing === member.user_id ? (
                            <div className="space-y-2">
                              <LabeledSelect
                                label="الدور الجديد"
                                value={editRole}
                                onChange={setEditRole}
                                options={
                                  selectOptions.some((entry) => entry.value === editRole)
                                    ? selectOptions
                                    : [{ value: editRole, label: `${labelFor(editRole)} (المسجَّل حالياً)` }, ...selectOptions]
                                }
                              />
                              <input
                                value={rowReasons[member.user_id] ?? ''}
                                onChange={(event) => setRowReasons((prev) => ({ ...prev, [member.user_id]: event.target.value }))}
                                placeholder="سبب التغيير (مطلوب)"
                                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] focus:bg-white focus:outline-none"
                              />
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  onClick={() => changeRole(member.user_id)}
                                  disabled={busy}
                                  className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
                                >
                                  حفظ
                                </button>
                                <button
                                  onClick={() => setEditing(null)}
                                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-100"
                                >
                                  إلغاء
                                </button>
                              </div>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-800">
                                {labelFor(member.role)}
                              </span>
                              {/* The number is the point of the column: `admin` and `auditor` are
                                  both read-only-sounding words until something says one can
                                  delete a shipment and the other cannot. */}
                              {grantsFor(member.role).length ? (
                                <span
                                  className="text-[10px] text-slate-500"
                                  title={grantsFor(member.role).join('، ')}
                                >
                                  {grantsFor(member.role).length} صلاحية
                                </span>
                              ) : null}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-slate-600">{recordedText(member.user?.status)}</td>
                        <td className="whitespace-nowrap p-3 text-slate-600">{formatDate(member.joined_at, locale) || 'غير مسجّل'}</td>
                        {canManage ? (
                          <td className="p-3">
                            <div className="flex flex-wrap items-center justify-center gap-2">
                              {editing !== member.user_id && (
                                <input
                                  value={rowReasons[member.user_id] ?? ''}
                                  onChange={(event) => setRowReasons((prev) => ({ ...prev, [member.user_id]: event.target.value }))}
                                  placeholder="سبب الإجراء"
                                  className="w-full min-w-[7rem] rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] focus:bg-white focus:outline-none sm:w-36"
                                />
                              )}
                              <button
                                onClick={() => {
                                  setEditing(member.user_id);
                                  setEditRole(member.role);
                                  setBanner(null);
                                }}
                                disabled={busy}
                                className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                              >
                                تغيير الدور
                              </button>
                              <button
                                onClick={() => {
                                  setFocusMember(member.user_id);
                                  document.getElementById('org-roles')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }}
                                disabled={busy}
                                title="منح أو سحب فردي لهذا العضو داخل هذه المنشأة"
                                className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                              >
                                تجاوزات فردية
                              </button>
                              <button
                                onClick={() => removeMember(member.user_id, member.user?.name ?? '')}
                                disabled={busy}
                                title="إزالة العضوية (تحتاج سببًا)"
                                className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-40"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </PanelShell>

      {organizationId && canManage ? (
        <PanelShell
          title="إضافة عضو إلى المنشأة"
          hint="المنصة لا ترسل دعوات بالبريد ولا تُنشئ حسابات من هنا: البريد يجب أن يكون لحساب مسجّل بالفعل، وإلا يرفض الخادم الطلب برسالة «المستخدم غير موجود»."
        >
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TextInput
              label="البريد الإلكتروني للحساب المسجّل"
              value={email}
              onChange={setEmail}
              placeholder="name@example.com"
              wide
            />
            {addableOptions.length ? (
              <LabeledSelect
                label="الدور داخل المنشأة"
                value={role || addableOptions[0].value}
                onChange={setRole}
                options={addableOptions}
              />
            ) : null}
            <label className="block space-y-1">
              <span className="block text-[11px] font-bold text-slate-600">سبب الإضافة (مطلوب)</span>
              <input
                value={addReason}
                onChange={(event) => setAddReason(event.target.value)}
                placeholder="مثال: مسؤول المخزون في الفرع"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs focus:bg-white focus:outline-none"
              />
            </label>
            <DecisionButton tone="primary" onClick={addMember} busy={busy}>
              <UserPlus className="w-3.5 h-3.5" />
              <span>إضافة العضو</span>
            </DecisionButton>
          </div>

          {fieldErrors.email ? <ErrorNote text={fieldErrors.email} /> : null}
          {fieldErrors.role ? <ErrorNote text={fieldErrors.role} /> : null}
          {fieldErrors.reason ? <ErrorNote text={fieldErrors.reason} /> : null}

          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
            <span>
              إذا كان العضو يملك بالفعل دوراً في هذه المنشأة، فإن الإجراء يحدّث دوره بدل أن يُنشئ عضوية مكرّرة.
              منح الملكية أو سحبها يكونان بقرار المالك الحالي أو إدارة المنصة، والسبب يُحفظ مع القرار في سجل التدقيق.
            </span>
          </p>
        </PanelShell>
      ) : null}

      {organizationId ? (
        <div id="org-roles" className="scroll-mt-24">
          <OrganizationRolesPanel
            organizationId={organizationId}
            organizationName={organizationName}
            members={members}
            canManage={canManage}
            focusMemberId={focusMember}
            onFocusMemberHandled={() => setFocusMember(null)}
          />
        </div>
      ) : null}
    </div>
  );
};

/** A contact detail as stored, or the words that say it never was. */
function recordedText(value: string | null | undefined): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || 'غير مسجّل';
}
