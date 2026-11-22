import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Trash2, UserCheck } from 'lucide-react';
import { fieldError } from '@/core/api/http';
import type { ApiResult } from '@/core/api/http';
import { serverMessage } from '@/core/api/refusal';
import { bulkMemberPermissions, createOrganizationRole, deleteOrganizationRole, getMemberPermissions, getOrganizationRoles, updateMemberPermissions, updateOrganizationRole } from '@/features/organizations/api';
import type { MemberPermissionsView, OrganizationRolesSnapshot, UserMembership } from '@/features/organizations/types';
import { BannerView, DecisionButton, ErrorNote, LabeledSelect, PanelShell, TextInput } from '@/shared/ui/panel';
import type { Banner } from '@/shared/ui/panel';
import { PermissionPicker, splitStates, statesFrom } from '@/features/identity/components/PermissionPicker';
import type { OverrideState } from '@/features/identity/components/PermissionPicker';

/**
 * What a company's own standings are worth, and what one person inside it is worth.
 *
 * This is the organization door of the permissions system, and the component is
 * built around the three boundaries the server enforces behind it:
 *
 *   * The names on offer come from `grantable_permissions` in the same response as
 *     the roles, which is the list the route accepts — platform capabilities are
 *     absent from it. Nothing here filters by a list of names written in the
 *     client, so a rename in `config/rbac.php` cannot leave a stale checkbox that
 *     only fails at submit time.
 *   * Authority is per company and per page: the routes take the organization id,
 *     and the caller's membership in *that* company is asked for `members.manage`.
 *     The tenant header is set by the session, not chosen here.
 *   * The owner standing and the owner's own rows resist being edited into
 *     helplessness, which the server answers with `OWNER_STANDING_PROTECTED`. That
 *     refusal is shown rather than pre-empted: hiding the save on the owner row
 *     would be this screen inventing its own rule about ownership.
 *
 * Two editors, because the two decisions are different in kind. A standing says
 * what a *kind* of job in this company can do; an override says what *this person*
 * can do beyond or beneath the standing they hold. The override editor shows both
 * the standing's grants and the resulting effective set, because a manager who
 * cannot see the difference between the two will keep "fixing" a role that was
 * already narrowed by a denial nobody remembers writing.
 */

/**
 * The organization's fallback line, on top of the reading rule in `core/api/refusal`.
 *
 * Role writes answer with the operator's own sentence — an immutable standing, a key
 * already taken — so this only supplies what to say when the envelope carried none.
 */
const refusalOf = (result: ApiResult<unknown>): string =>
  serverMessage(result, 'تعذّر تنفيذ الأمر على المنشأة');

/** The key the column stores; anything the server would reject is caught here first. */
const KEY_PATTERN = /^[a-z][a-z0-9_]{1,62}$/;

interface OrganizationRolesPanelProps {
  organizationId: number;
  organizationName: string | null;
  members: UserMembership[];
  /** `members.manage`, resolved by the caller the way every other screen does. */
  canManage: boolean;
  /** Set when the roster asks to edit one person's overrides; null opens the list. */
  focusMemberId: number | null;
  onFocusMemberHandled: () => void;
  onNotify?: (message: string) => void;
}

export const OrganizationRolesPanel: React.FC<OrganizationRolesPanelProps> = ({
  organizationId,
  organizationName,
  members,
  canManage,
  focusMemberId,
  onFocusMemberHandled,
  onNotify,
}) => {
  const [snapshot, setSnapshot] = useState<OrganizationRolesSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  const [denied, setDenied] = useState<string | null>(null);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<string[]>([]);
  const [roleReason, setRoleReason] = useState('');
  const [roleErrors, setRoleErrors] = useState<Record<string, string | null>>({});

  const [newKey, setNewKey] = useState('');
  const [newNameAr, setNewNameAr] = useState('');
  const [copyFrom, setCopyFrom] = useState('');
  const [newPermissions, setNewPermissions] = useState<string[]>([]);
  const [newReason, setNewReason] = useState('');
  const [newErrors, setNewErrors] = useState<Record<string, string | null>>({});

  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);
  const [memberView, setMemberView] = useState<MemberPermissionsView | null>(null);
  const [states, setStates] = useState<Record<string, OverrideState>>({});
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideErrors, setOverrideErrors] = useState<Record<string, string | null>>({});

  const available = snapshot?.grantable_permissions ?? [];

  const load = useCallback(async () => {
    setLoading(true);
    setDenied(null);
    try {
      const result = await getOrganizationRoles(organizationId);
      if (result.success && result.data) {
        setSnapshot(result.data);
      } else {
        setSnapshot(null);
        setDenied(refusalOf(result));
      }
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const editing = useMemo(
    () => snapshot?.roles.find((role) => role.key === editingKey) ?? null,
    [snapshot, editingKey]
  );

  useEffect(() => {
    if (editing) {
      setDraftPermissions([...editing.permissions]);
      setRoleReason('');
      setRoleErrors({});
    }
  }, [editing]);

  const openEditor = (key: string) => {
    setEditingKey(key);
    setBanner(null);
  };

  const saveRole = async () => {
    if (!editing) return;
    const reason = roleReason.trim();
    const errors: Record<string, string | null> = {};
    if (reason.length < 3) errors.reason = 'السبب مطلوب ويُحفظ مع القرار في سجل التدقيق';
    setRoleErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    setBusy(true);
    setBanner(null);
    try {
      const result = await updateOrganizationRole(organizationId, editing.key, { permissions: draftPermissions, reason });
      if (result.success) {
        setBanner({ kind: 'ok', text: `الدور «${editing.name_ar}» أصبح ${draftPermissions.length} صلاحية.` });
        onNotify?.('أدوار المنشأة محفوظة');
        setEditingKey(null);
        await load();
      } else {
        setRoleErrors({ permissions: fieldError(result, 'permissions'), reason: fieldError(result, 'reason') });
        setBanner({ kind: 'error', text: refusalOf(result) });
      }
    } finally {
      setBusy(false);
    }
  };

  const createRole = async () => {
    const reason = newReason.trim();
    const errors: Record<string, string | null> = {};
    if (!KEY_PATTERN.test(newKey.trim())) errors.key = 'مفتاح لاتيني صغير يبدأ بحرف: warehouse_keeper مثلًا';
    if (newNameAr.trim().length < 2) errors.name_ar = 'الاسم بالعربية مطلوب';
    if (reason.length < 3) errors.reason = 'السبب مطلوب ويُحفظ مع القرار';
    setNewErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    setBusy(true);
    setBanner(null);
    try {
      // `permissions` is sent always, including empty: an explicit list is what the
      // screen shows, and sending nothing while `copy_from` is set would let the
      // server decide what «نسخ من المالك» means after the boxes were unticked.
      const result = await createOrganizationRole(organizationId, {
        key: newKey.trim(),
        name_ar: newNameAr.trim(),
        permissions: copyFrom && newPermissions.length === 0 ? undefined : newPermissions,
        copy_from: copyFrom || null,
        reason,
      });
      if (result.success) {
        setBanner({ kind: 'ok', text: `أُنشئ الدور «${newNameAr.trim()}».` });
        onNotify?.('دور جديد للمنشأة');
        setNewKey('');
        setNewNameAr('');
        setCopyFrom('');
        setNewPermissions([]);
        setNewReason('');
        await load();
      } else {
        setNewErrors({
          key: fieldError(result, 'key') || (result.error_code === 'ROLE_KEY_RESERVED' ? 'هذا المفتاح اسم دور معتمد من المنصة' : null),
          name_ar: fieldError(result, 'name_ar'),
          permissions: fieldError(result, 'permissions'),
          reason: fieldError(result, 'reason'),
        });
        setBanner({ kind: 'error', text: refusalOf(result) });
      }
    } finally {
      setBusy(false);
    }
  };

  const deleteRole = async (key: string, name: string) => {
    const reason = window.prompt(`سبب إزالة الدور «${name}»؟ (مطلوب ويُحفظ في سجل التدقيق)`);
    const trimmed = (reason ?? '').trim();
    if (trimmed.length < 3) {
      setBanner({ kind: 'error', text: 'لا دور يُزال بلا سبب مسجَّل.' });
      return;
    }
    setBusy(true);
    setBanner(null);
    try {
      const result = await deleteOrganizationRole(organizationId, key, trimmed);
      if (result.success) {
        setBanner({ kind: 'ok', text: `أُزيل الدور «${name}».` });
        if (editingKey === key) setEditingKey(null);
        await load();
      } else {
        setBanner({ kind: 'error', text: refusalOf(result) });
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleMember = (userId: number) => {
    setSelectedMembers((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]));
    setMemberView(null);
  };

  // One person's row is readable; a group is not, because "the twelve except Ali"
  // has no single answer to show.
  useEffect(() => {
    let active = true;

    if (selectedMembers.length !== 1) {
      setMemberView(null);
      setStates({});
      return;
    }

    void getMemberPermissions(organizationId, selectedMembers[0]).then((result) => {
      if (!active) return;
      if (result.success && result.data) {
        setMemberView(result.data);
        setStates(statesFrom(result.data.grants, result.data.denials));
        setOverrideErrors({});
      } else {
        setMemberView(null);
        setBanner({ kind: 'error', text: refusalOf(result) });
      }
    });

    return () => {
      active = false;
    };
    // `setBanner` is stable and re-running on it would loop on every error.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMembers, organizationId]);

  useEffect(() => {
    if (focusMemberId !== null) {
      setSelectedMembers([focusMemberId]);
      setEditingKey(null);
      onFocusMemberHandled();
    }
    // The parent clears the request once it is taken; watching it is the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMemberId]);

  const saveOverrides = async () => {
    const { grants, denials } = splitStates(states);
    const reason = overrideReason.trim();
    const errors: Record<string, string | null> = {};
    if (reason.length < 3) errors.reason = 'السبب مطلوب ويُحفظ مع القرار';
    if (!selectedMembers.length) errors.user_ids = 'اختر عضوًا واحدًا أو أكثر';
    setOverrideErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    setBusy(true);
    setBanner(null);
    try {
      // Widened to the envelope the two doors share: one member answers with the
      // member's own row and a group answers with an `applied` list, and the only
      // thing either branch needs here is `success` plus the refusal's message.
      const result: ApiResult<unknown> =
        selectedMembers.length === 1
          ? await updateMemberPermissions(organizationId, selectedMembers[0], { grants, denials, reason })
          : await bulkMemberPermissions(organizationId, { user_ids: selectedMembers, grants, denials, reason });

      if (result.success) {
        setBanner({
          kind: 'ok',
          text:
            selectedMembers.length === 1
              ? `تجاوزات العضو محفوظة: ${grants.length} إضافة، ${denials.length} سحب.`
              : `طُبِّق على ${selectedMembers.length} أعضاء في قرار واحد.`,
        });
        onNotify?.('تجاوزات الأعضاء محفوظة');
        setOverrideReason('');
        if (selectedMembers.length === 1) {
          const refreshed = await getMemberPermissions(organizationId, selectedMembers[0]);
          if (refreshed.success && refreshed.data) {
            setMemberView(refreshed.data);
            setStates(statesFrom(refreshed.data.grants, refreshed.data.denials));
          }
        }
      } else {
        setOverrideErrors({
          grants: fieldError(result, 'grants'),
          denials: fieldError(result, 'denials'),
          reason: fieldError(result, 'reason'),
        });
        setBanner({ kind: 'error', text: refusalOf(result) });
      }
    } finally {
      setBusy(false);
    }
  };

  const roleOptions = (snapshot?.roles ?? []).map((role) => ({
    value: role.key,
    label: `${role.name_ar} — ${role.permissions.length} صلاحية${role.is_system ? ' (معتمد)' : ''}`,
  }));

  return (
    <div className="space-y-5">
      <PanelShell
        title="أدوار هذه المنشأة وصلاحياتها"
        hint={
          organizationName
            ? `ما تُحدده هنا يسري داخل «${organizationName}» وحدها. صلاحيات المنصة (مراجعة عروض الآخرين، اعتماد المنشآت، إدارة الحسابات) ليست في هذه القائمة ولا تُمنح من هذا الباب.`
            : 'أدوار المنشأة خاصة بمنشأة واحدة ولا تُقرأ كصلاحيات عامة.'
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
            <span>عدد الأدوار: {snapshot?.roles.length ?? 0}</span>
            {loading ? <span className="text-[10px] font-normal text-slate-500">جارٍ التحديث…</span> : null}
          </div>
          <DecisionButton onClick={() => void load()} busy={loading}>
            <RefreshCw className="w-3.5 h-3.5" />
            <span>تحديث</span>
          </DecisionButton>
        </div>

        {denied ? <ErrorNote text={denied} /> : null}
        <BannerView banner={banner} />

        {snapshot?.roles.length ? (
          <div className="min-w-0 overflow-x-auto rounded-lg border border-slate-200 dark:border-hassal-line">
            <table className="w-full min-w-[30rem] text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 dark:bg-hassal-raised dark:text-slate-300">
                <tr>
                  <th className="p-3 font-semibold">الدور</th>
                  <th className="p-3 font-semibold">المفتاح</th>
                  <th className="p-3 font-semibold">الحاملون</th>
                  <th className="p-3 font-semibold">الصلاحية</th>
                  {canManage ? <th className="p-3 text-center font-semibold">إجراء</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-hassal-line">
                {snapshot.roles.map((role) => (
                  <tr key={role.key} className={editingKey === role.key ? 'bg-emerald-50/60 dark:bg-emerald-950/20' : undefined}>
                    <td className="p-3 font-bold text-slate-900 dark:text-slate-100">{role.name_ar}</td>
                    <td className="p-3 text-slate-600 dark:text-slate-300" dir="ltr">
                      {role.key}
                      {role.is_system ? <span className="mr-1 text-[10px] text-slate-400">(منصة)</span> : null}
                    </td>
                    <td className="p-3 text-slate-600 tabular-nums dark:text-slate-300">{role.holder_count ?? 0}</td>
                    <td className="p-3 text-slate-600 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1">
                        <span className="tabular-nums">{role.permissions.length}</span>
                        <span className="text-[10px] text-slate-500" title={role.permissions.join('، ')} dir="ltr">
                          {role.permissions.slice(0, 3).join('، ')}
                          {role.permissions.length > 3 ? '…' : ''}
                        </span>
                      </span>
                    </td>
                    {canManage ? (
                      <td className="p-3">
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <button
                            onClick={() => openEditor(editingKey === role.key ? null : role.key)}
                            disabled={busy}
                            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-hassal-line dark:bg-hassal-raised dark:text-slate-100"
                          >
                            {editingKey === role.key ? 'إغلاق' : 'تحرير الصلاحيات'}
                          </button>
                          {role.is_system ? null : (
                            <button
                              onClick={() => void deleteRole(role.key, role.name_ar)}
                              disabled={busy}
                              title="إزالة الدور (لا يُزال دور يحملُه أحد)"
                              className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-40"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-6 text-center text-xs text-slate-500">
            {loading ? 'جارٍ جلب أدوار المنشأة…' : 'لا أدوار معروضة؛ اقرأ التوضيح أعلاه.'}
          </p>
        )}

        {editing ? (
          <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
            <div className="text-[11px] font-bold text-slate-800 dark:text-slate-100">
              تحرير «{editing.name_ar}» — <span dir="ltr">{editing.key}</span>
            </div>
            {editing.key === 'owner' ? (
              <ErrorNote text="دور المالك يبقى قادرًا على تعيين غيرهم: «members.manage» و«organizations.manage» لا تُسحبان من هذا الدور، والخادم يرفض تجريده منهما." />
            ) : null}
            <PermissionPicker available={available} selected={draftPermissions} onSelect={setDraftPermissions} disabled={busy} />
            <div className="flex flex-wrap items-end gap-3">
              <TextInput label="سبب التغيير (مطلوب)" value={roleReason} onChange={setRoleReason} placeholder="مثال: تكليف أمين المستودع بالتسليم" wide error={roleErrors.reason ?? undefined} />
              <DecisionButton tone="primary" onClick={() => void saveRole()} busy={busy}>
                <span>حفظ {draftPermissions.length} صلاحية</span>
              </DecisionButton>
            </div>
            {roleErrors.permissions ? <ErrorNote text={roleErrors.permissions} /> : null}
          </div>
        ) : null}

        {canManage ? (
          <div className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-hassal-line">
            <div className="text-[11px] font-bold text-slate-800 dark:text-slate-100">دور خاص بهذه المنشأة</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <TextInput label="المفتاح (لاتيني)" value={newKey} onChange={setNewKey} placeholder="warehouse_keeper" error={newErrors.key ?? undefined} help="يُستخدم في العضوية وسجل التدقيق" />
              <TextInput label="الاسم بالعربية" value={newNameAr} onChange={setNewNameAr} placeholder="أمين مستودع" error={newErrors.name_ar ?? undefined} />
              <LabeledSelect
                label="نسخ من دور موجود"
                value={copyFrom}
                onChange={setCopyFrom}
                options={[{ value: '', label: 'ابدأ بلا صلاحيات' }, ...roleOptions]}
              />
            </div>
            <PermissionPicker available={available} selected={newPermissions} onSelect={setNewPermissions} disabled={busy} />
            <div className="flex flex-wrap items-end gap-3">
              <TextInput label="سبب الإنشاء (مطلوب)" value={newReason} onChange={setNewReason} placeholder="مثال: فصل الاستلام عن المبيعات" wide error={newErrors.reason ?? undefined} />
              <DecisionButton tone="primary" onClick={() => void createRole()} busy={busy}>
                <Plus className="w-3.5 h-3.5" />
                <span>إنشاء الدور</span>
              </DecisionButton>
            </div>
            <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
              صندوق «نسخ من» ينقل صلاحيات الدور كما هي عند النقر؛ إذا حددت صناديق الصلاحيات فإن ما حددته هو ما يُحفظ.
              الأدوار الخاصة لا تُحذف ما دام أحد يحملها — انقل صاحبه إلى دور آخر أولًا.
            </p>
            {newErrors.permissions ? <ErrorNote text={newErrors.permissions} /> : null}
          </div>
        ) : null}
      </PanelShell>

      <PanelShell
        title="منح وسحب فردي داخل المنشأة"
        hint="المنح يضيف فوق الدور، والسحب يمنعه حتى لو كان الدور يحمله. التجاوزات خاصة بهذا الحساب في هذه المنشأة: لا تنتقل معه إلى شركة أخرى ولا تتغير بالنسبة لزملائه في الدور نفسه."
      >
        {!canManage ? (
          <ErrorNote text="إدارة عضوية هذه المنشأة لغير المالك ومدير المنشأة؛ لا تظهر هنا خيارات قد يرفضها الخادم." />
        ) : (
          <>
            <div className="min-w-0 space-y-1">
              {members.length ? (
                members.map((member) => (
                  <label key={member.user_id} className="flex cursor-pointer items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={selectedMembers.includes(member.user_id)}
                      onChange={() => toggleMember(member.user_id)}
                      className="h-3.5 w-3.5 accent-emerald-600"
                    />
                    <span className="font-bold">{member.user?.name || `مستخدم #${member.user_id}`}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 dark:bg-hassal-raised dark:text-slate-300" dir="ltr">
                      {member.role}
                    </span>
                    {member.is_active ? null : <span className="text-[10px] text-rose-600">عضوية موقوفة</span>}
                  </label>
                ))
              ) : (
                <p className="text-[11px] text-slate-500">لا أعضاء نشطين في هذه المنشأة بعد.</p>
              )}
            </div>

            {selectedMembers.length > 1 ? (
              <ErrorNote text={`جماعي على ${selectedMembers.length} حسابات: القوائم تُستبدل للجميع كما تظهر هنا، والسبب يُسجَّل في قرار واحد يغطي الأسماء كلهم.`} />
            ) : null}

            {memberView ? (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] dark:border-hassal-line dark:bg-hassal-raised">
                <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-700" />
                  <span>الدور الحالي: {memberView.role}</span>
                  <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400">
                    {memberView.role_permissions.length} من الدور · {memberView.effective.length} نافذة فعليًا
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <div className="font-bold text-slate-700 dark:text-slate-200">من الدور ({memberView.role_permissions.length})</div>
                    <div className="break-all text-slate-600 dark:text-slate-400" dir="ltr">
                      {memberView.role_permissions.length ? memberView.role_permissions.join('، ') : 'لا شيء'}
                    </div>
                  </div>
                  <div>
                    <div className="font-bold text-slate-700 dark:text-slate-200">النافذة لهذا العضو ({memberView.effective.length})</div>
                    <div className="break-all text-slate-600 dark:text-slate-400" dir="ltr">
                      {memberView.effective.length ? memberView.effective.join('، ') : 'لا شيء'}
                    </div>
                  </div>
                </div>
                <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                  القائمة اليمنى هي قرار الوسيط نفسه، وهي ما يراه وسيط الصلاحيات قبل تنفيذ أي طلب؛ لا تُخمَّن بحساب
                  الصناديق هنا.
                </p>
              </div>
            ) : null}

            <PermissionPicker available={available} selected={[]} states={states} onStatesChange={setStates} inherited={memberView?.role_permissions} disabled={busy} />

            <div className="flex flex-wrap items-end gap-3">
              <TextInput
                label="سبب القرار (مطلوب)"
                value={overrideReason}
                onChange={setOverrideReason}
                placeholder="مثال: إغلاق المنشورات المنتهية كل نهاية شهر"
                wide
                error={overrideErrors.reason ?? undefined}
              />
              <DecisionButton tone="primary" onClick={() => void saveOverrides()} busy={busy}>
                <span>
                  {selectedMembers.length === 1 ? 'حفظ تجاوزات العضو' : `تطبيق على ${selectedMembers.length || 0}`}
                </span>
              </DecisionButton>
            </div>
            {overrideErrors.grants || overrideErrors.denials ? (
              <ErrorNote text={[overrideErrors.grants, overrideErrors.denials].filter(Boolean).join(' — ')} />
            ) : null}
          </>
        )}
      </PanelShell>
    </div>
  );
};
