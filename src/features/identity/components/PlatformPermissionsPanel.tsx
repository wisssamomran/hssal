import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { fieldError } from '@/core/api/http';
import type { ApiResult } from '@/core/api/http';
import { serverMessage } from '@/core/api/refusal';
import { getPlatformRbac, updatePlatformRolePermissions } from '@/features/identity/api';
import type { PlatformRbacSnapshot } from '@/features/identity/types';
import { BannerView, DecisionButton, ErrorNote, LabeledSelect, PanelShell, TextInput } from '@/shared/ui/panel';
import type { Banner } from '@/shared/ui/panel';
import { PermissionPicker } from '@/features/identity/components/PermissionPicker';

/**
 * The platform's role matrix: what each standing of an account is worth.
 *
 * This screen edits the half of the vocabulary a company can never reach —
 * moderating a rival's listing, verifying a business, ruling a dispute, staffing
 * accounts. It is the account door, and it is deliberately incapable of opening a
 * company door: a business capability is not offered here at all (the names come
 * from the server's own `permissions` minus `account_forbidden`), and the route
 * refuses one by name if a request is composed anyway.
 *
 * What a *person* holds by their own name is not edited here. Grants attach to an
 * account, and the operator writing them is looking for somebody; that editor
 * therefore sits on the row in «حسابات المنصة», and this one keeps to the four
 * standings every account shares. Two copies of the same write on two screens is
 * how one of them ends up enforcing a rule the other does not.
 *
 * Two things are shown that the editor cannot change, both on purpose.
 *
 *   * `declared` — what `config/rbac.php` says the standing is for. It is printed
 *     beside the current grants because the file remains the source of the seed and
 *     of the meaning; the database holds this deployment's decision, and when the
 *     two differ, the operator should see that they differ rather than wonder.
 *   * `SuperAdmin` — read-only. The config declares it `'*'`, so replacing its
 *     rows from a screen would turn the platform owner into a checklist that could
 *     lock out the console fixing it. Selecting it shows why the save is absent.
 *
 * Every write needs a reason and lands in the audit log with the before and after,
 * because a permission change is only interesting after the fact.
 */

/**
 * The console's fallback line, on top of the reading rule in `core/api/refusal`.
 *
 * A platform write almost always arrives with the operator's own reason for being
 * refused — an immutable standing, a missing permission — so the generic line is only
 * what is left when the envelope carried neither.
 */
const refusalOf = (result: ApiResult<unknown>): string =>
  serverMessage(result, 'رفض الخادم الطلب');

export const PlatformPermissionsPanel: React.FC<{ onNotify?: (message: string) => void }> = ({ onNotify }) => {
  const [snapshot, setSnapshot] = useState<PlatformRbacSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  const [denied, setDenied] = useState<string | null>(null);

  const [roleName, setRoleName] = useState('');
  const [draft, setDraft] = useState<string[]>([]);
  const [roleReason, setRoleReason] = useState('');
  const [roleErrors, setRoleErrors] = useState<Record<string, string | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setDenied(null);
    try {
      const result = await getPlatformRbac();
      if (result.success && result.data) {
        setSnapshot(result.data);
        // Keep the selection if it survived the refresh, otherwise open on the
        // first editable standing — SuperAdmin first would show a read-only form.
        setRoleName((current) => {
          const names = result.data.roles.map((role) => role.name);
          if (current && names.includes(current)) return current;
          const editable = result.data.roles.find((role) => !role.is_immutable);
          return (editable ?? result.data.roles[0])?.name ?? '';
        });
      } else {
        setSnapshot(null);
        setDenied(refusalOf(result));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const role = useMemo(
    () => snapshot?.roles.find((entry) => entry.name === roleName) ?? null,
    [snapshot, roleName]
  );

  // The names this door may write: the catalog minus what the server declares
  // forbidden for an account. `account_forbidden` is the same rule the validator
  // applies, published rather than duplicated.
  const offerable = useMemo(() => {
    if (!snapshot) return [];
    const forbidden = new Set(snapshot.account_forbidden);
    return snapshot.permissions.filter((entry) => !forbidden.has(entry.name));
  }, [snapshot]);

  useEffect(() => {
    if (role) {
      setDraft([...role.permissions]);
      setRoleReason('');
      setRoleErrors({});
    }
  }, [role]);

  const saveRole = async () => {
    if (!role) return;
    const reason = roleReason.trim();
    const errors: Record<string, string | null> = {};
    if (reason.length < 3) errors.reason = 'السبب مطلوب ويُسجَّل مع القرار';
    setRoleErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    setBusy(true);
    setBanner(null);
    try {
      const result = await updatePlatformRolePermissions(role.name, { permissions: draft, reason });
      if (result.success) {
        setBanner({ kind: 'ok', text: result.message && result.message !== 'OK' ? result.message : 'حُفظت مصفوفة الدور.' });
        onNotify?.(`صلاحيات الدور ${role.name} محفوظة`);
        await load();
      } else {
        setRoleErrors({ reason: fieldError(result, 'reason') });
        setBanner({ kind: 'error', text: refusalOf(result) });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <PanelShell
      title="مصفوفة صلاحيات أدوار المنصة"
      hint="هذه أدوار الحسابات أمام السوق كله (مراجع، مشرف مجتمع، داعم فني). أدوار داخل المنشأة تُحرَّر من شاشة عضوية المنشأة، ولا يمكن لأيٍّ من البابين أن يكتب أسماء الباب الآخر — الرفض بالاسم في الخادم. أما منح الحساب نفسه، بلا واسطة دور، فيُقرأ ويُكتب من صفّ الحساب في «حسابات المنصة»."
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-end gap-3">
          {snapshot?.roles.length ? (
            <LabeledSelect
              label="الدور"
              value={roleName}
              onChange={setRoleName}
              options={snapshot.roles.map((entry) => ({
                value: entry.name,
                label: `${entry.name} — ${entry.is_immutable ? 'غير قابل للتحرير' : `${entry.permissions.length} صلاحية`} · ${entry.holder_count} حساب`,
              }))}
            />
          ) : null}
          <DecisionButton onClick={() => void load()} busy={loading}>
            <RefreshCw className="w-3.5 h-3.5" />
            <span>تحديث</span>
          </DecisionButton>
        </div>
        {role ? (
          <span className="text-[10px] text-slate-500 dark:text-slate-400">
            كما في الملف: {role.declared.length} اسمًا · في القاعدة: {role.permissions.length}
          </span>
        ) : null}
      </div>

      {denied ? <ErrorNote text={denied} /> : null}
      {!denied && !snapshot && !loading ? <ErrorNote text="لم تصل المصفوفة من الخادم." /> : null}

      {role?.is_immutable ? (
        <ErrorNote text="دور مالك المنصة يُعرَّف في config/rbac.php بالرمز '*' ولا يُحرَّر من هذه الشاشة: استبدال صفوفه من واجهة قد يقفل اللوحة التي تُصلِحها. غيّره في الملف المراقَب بالنسخ ثم أعد التزويد." />
      ) : null}

      <BannerView banner={banner} />

      {snapshot && !role?.is_immutable ? (
        <div className="space-y-3">
          <PermissionPicker available={offerable} selected={draft} onSelect={setDraft} inherited={role?.declared} disabled={busy} />
          <div className="flex flex-wrap items-end gap-3">
            <TextInput
              label="سبب التغيير (مطلوب)"
              value={roleReason}
              onChange={setRoleReason}
              placeholder="مثال: فصل مراجعة العروض عن اعتماد المنشآت"
              wide
              error={roleErrors.reason ?? undefined}
            />
            <DecisionButton tone="primary" onClick={() => void saveRole()} busy={busy}>
              <span>حفظ مصفوفة {role?.name}</span>
            </DecisionButton>
          </div>
          <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
            الحفظ يستبدل قائمة الصلاحيات كما تظهر هنا، ولا يضيف إليها: الاسم غير المُرسل يُسحب من الدور، لأن محرّر
            الصناديق يجب أن يحفظ ما يراه المستخدم لا ما نقص منه.
          </p>
        </div>
      ) : null}
    </PanelShell>
  );
};
