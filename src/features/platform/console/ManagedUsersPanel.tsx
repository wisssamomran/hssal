import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Info } from 'lucide-react';
import { BannerView, ErrorNote, LabeledSelect, PanelShell, TextInput } from '@/shared/ui/panel';
import { Banner } from '@/shared/ui/panel';
import { ApiResult } from '@/core/api/http';
import { serverMessage } from '@/core/api/refusal';
import { getPlatformRbac, getUserRoles, getUsers } from '@/features/identity/api';
import { ManagedUser, PlatformRbacSnapshot, PlatformRoleOption } from '@/features/identity/types';
import { getMembershipRoles } from '@/features/organizations/api';
import { MembershipRoleOption } from '@/features/organizations/types';
import { AccountPermissionsEditor } from '@/features/identity/components/AccountPermissionsEditor';
import { ManagedUserRow } from './ManagedUserRow';
import { USER_STATUS_OPTIONS, accountActionMessage } from './account-review';

/* ───────────────────────────── platform accounts ─────────────────────────── */

/**
 * The accounts desk: who may sign in to the platform, and what each of them is
 * worth where.
 *
 * This screen draws and asks; it keeps no rule of its own. The standings it offers
 * to filter by, which of a person's role names are the platform's, what the status
 * button will actually do, when the reason box is the reason a button is dark, and
 * what each refusal from the server means all come from `account-review`, and the
 * writes are made by the row that displays them. What is left here is what a desk
 * genuinely owns: the page the server returned, the one banner above it, the
 * account currently being written to, and the selection a bulk decision takes.
 *
 * Two standings per person, and they never meet. «أدوار المنصة» is what the platform
 * granted an account by its own name; «الدور داخل منشآته» is what an owner made
 * that person inside each company they belong to. Changing one leaves the other
 * alone, which is why each column carries its own control — and why one reason box
 * sits in the account column, where both halves can reach it.
 */
export const ManagedUsersPanel: React.FC<{ onNotify?: (m: string) => void; can: (permission: string) => boolean }> = ({ onNotify, can }) => {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roles, setRoles] = useState<PlatformRoleOption[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  /**
   * One reason per account, held by the desk rather than the row: the same box
   * feeds the writes in both columns and the bulk decision opened over the
   * selection, and a decision that covers eight accounts is audited as one act.
   */
  const [reasons, setReasons] = useState<Record<number, string>>({});
  /**
   * The five business standings the server will accept, read once for the page.
   * They are the same list for every company; which of them a person holds, and in
   * which company, is the row's business rather than the desk's.
   */
  const [membershipRoles, setMembershipRoles] = useState<MembershipRoleOption[]>([]);

  /**
   * The account door (§4.12): the catalog, the roles and the names a person may
   * not be given. Read only where it can also be written — `roles.manage` guards
   * both halves — because a `users.manage` operator would spend a request on a
   * refusal for an editor they are not shown anyway.
   *
   * A standing is asked for here rather than inferred from the tab being open:
   * `users.manage` edits a person, `roles.manage` edits what a role is worth, and
   * one operator may hold exactly one of them.
   */
  const [snapshot, setSnapshot] = useState<PlatformRbacSnapshot | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [editing, setEditing] = useState<number[] | null>(null);
  const mayGovernAccounts = can('roles.manage');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [usersResult, rolesResult, memberRolesResult, rbacResult] = await Promise.all([
      getUsers({ search: search || undefined, status: status || undefined, per_page: 25 }),
      getUserRoles(),
      getMembershipRoles(),
      mayGovernAccounts ? getPlatformRbac() : Promise.resolve(null),
    ]);

    if (usersResult.success) {
      setUsers(usersResult.data ?? []);
      setTotal(usersResult.pagination?.total_items ?? null);
      // Nobody stays picked who is no longer on the page: the bulk decision names
      // its people by the rows the operator could see when they picked them.
      setSelected((current) => current.filter((id) => (usersResult.data ?? []).some((user) => user.id === id)));
    } else {
      setUsers([]);
      setTotal(null);
      setSelected([]);
      setLoadError(serverMessage(usersResult, 'تعذّر تحميل الحسابات'));
    }
    if (rolesResult.success) setRoles(rolesResult.data ?? []);
    if (memberRolesResult.success) setMembershipRoles(memberRolesResult.data ?? []);
    if (rbacResult?.success) setSnapshot(rbacResult.data ?? null);
    setLoading(false);
  }, [search, status, mayGovernAccounts]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSelected = (id: number) => {
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  };

  /**
   * One write, one banner, one reload.
   *
   * The row builds the request and names the sentence a success should print; the
   * desk decides what a failure says, because a refusal over one account has to be
   * read in the same place as a refusal over the whole selection. The readings
   * themselves are `accountActionMessage()`'s — including the one that stops an
   * operator revoking the supervisory role from the account they are signed in
   * with, and the one that explains why the last super admin cannot be demoted.
   */
  const run = async (id: number, action: () => Promise<ApiResult<unknown>>, done: string) => {
    setBusyId(id);
    setBanner(null);
    const result = await action();
    setBusyId(null);
    if (result.success) {
      setBanner({ kind: 'ok', text: serverMessage(result, done) });
      load();
      onNotify?.(done);
    } else {
      setBanner({ kind: 'error', text: accountActionMessage(result, 'تعذّر تنفيذ الإجراء') });
    }
  };

  /** The account door is only drawn where it can be opened and has been read. */
  const governAccounts = mayGovernAccounts && snapshot !== null;

  const targets = (ids: number[]) =>
    ids
      .map((id) => {
        const row = users.find((user) => user.id === id);
        return { id, name: row?.name?.trim() || `مستخدم #${id}` };
      });

  return (
    <PanelShell
      title="حسابات المنصة وأدوارها"
      hint="عمودان لا واحد: «أدوار المنصة» ما منحه حسابُ المنصة لنفسه، و«الدور داخل منشآته» ما هو فيه داخل كل شركة ينتسب إليها. تغيير أيٍّ منهما لا يمس الآخر، وكل إجراء يحتاج سببًا يُحفظ في سجل التدقيق. القائمتان تأتيان من الخادم حتى لا يعرض النظام اسمًا لم يعد يقبله. والمنح المباشر الذي لا يأتي من دور يُقرأ ويُكتب من صفّ الحساب نفسه، فردًا أو بعد تحديد عدة حسابات لقرار واحد."
    >
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TextInput label="بحث" value={search} onChange={setSearch} placeholder="الاسم أو البريد أو الهاتف" />
        <LabeledSelect label="حالة الحساب" value={status} onChange={setStatus} options={USER_STATUS_OPTIONS} />
        <div className="flex flex-col gap-1">
          <button
            onClick={load}
            className="flex w-full items-center justify-center gap-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg px-3 py-2 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>تحديث القائمة</span>
          </button>
          <span className="text-center text-[11px] font-medium text-slate-500">
            {total !== null ? `${total} حساب بالفلتر الحالي` : 'لم يردّ الخادم بعدد النتائج'}
          </span>
        </div>
      </div>

      <BannerView banner={banner} />
      {loadError && <ErrorNote text={loadError} />}
      {mayGovernAccounts && !snapshot && !loading ? (
        <ErrorNote text="لم تصل قائمة صلاحيات المنصة من الخادم؛ زرّ «المنح المباشر» غائب حتى تُقرأ القائمة، لأن الشاشة لا تعرض اسمًا قد يرفضه الباب." />
      ) : null}

      {/* The bulk handle sits above the rows it acts on, not in a corner nobody
          reads: one decision over eight accounts is the riskiest write on this
          page, and the names it covers are the ones already on screen. */}
      {governAccounts && users.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] dark:border-hassal-line dark:bg-hassal-raised">
          <button
            type="button"
            onClick={() =>
              setSelected((current) =>
                current.length === users.length ? [] : users.map((user) => user.id)
              )
            }
            className="cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-bold text-slate-700 hover:bg-slate-100 dark:border-hassal-line dark:bg-hassal-night dark:text-slate-100"
          >
            {selected.length === users.length ? 'إلغاء تحديد الكل' : `تحديد الكل (${users.length})`}
          </button>
          {selected.length > 0 ? (
            <>
              <span className="font-bold text-slate-700 dark:text-slate-200">
                محدد {selected.length} من {users.length}
              </span>
              <button
                type="button"
                onClick={() => setEditing(selected)}
                className="cursor-pointer rounded-lg bg-emerald-600 px-3 py-1 font-bold text-white hover:bg-emerald-700"
              >
                قرار واحد على {selected.length}
              </button>
              <button
                type="button"
                onClick={() => setSelected([])}
                className="cursor-pointer rounded-lg border border-slate-300 px-2.5 py-1 font-bold text-slate-600 hover:bg-slate-100"
              >
                مسح التحديد
              </button>
            </>
          ) : (
            <span className="text-slate-500 dark:text-slate-400">
              حدّد حسابات لتكتب لهم نفس المنح أو السحب في قرار واحد وسبب واحد.
            </span>
          )}
        </div>
      ) : null}

      <p className="text-[10px] text-slate-400 sm:hidden">
        اسحب الجدول أفقيًا: سبب الإجراء يظهر في عمود الحساب أول الجدول، وهو ما تحتاجه بقية الأعمدة.
      </p>
      <div className="min-w-0 border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-xs text-right">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
            <tr>
              <th className="p-3 min-w-0">الحساب وسبب الإجراء</th>
              <th className="p-3 min-w-0">أدوار المنصة</th>
              <th className="p-3 min-w-0">الدور داخل منشآته</th>
              <th className="p-3 min-w-0">الحالة</th>
              <th className="p-3 min-w-0 text-left">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-400">جارٍ التحميل…</td>
              </tr>
            )}
            {!loading && !users.length && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-400">لا توجد حسابات مطابقة.</td>
              </tr>
            )}
            {!loading &&
              users.map((user) => (
                <ManagedUserRow
                  key={user.id}
                  user={user}
                  platformRoles={roles}
                  membershipRoles={membershipRoles}
                  selected={selected.includes(user.id)}
                  busy={busyId === user.id}
                  reason={reasons[user.id] ?? ''}
                  mayGovernAccounts={governAccounts}
                  onToggleSelected={() => toggleSelected(user.id)}
                  onReasonChange={(value) => setReasons((prev) => ({ ...prev, [user.id]: value }))}
                  onRun={(action, done) => run(user.id, action, done)}
                  onEditDirect={() => setEditing([user.id])}
                />
              ))}
          </tbody>
        </table>
      </div>

      {editing?.length && snapshot ? (
        <AccountPermissionsEditor
          targets={targets(editing)}
          snapshot={snapshot}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setBanner({ kind: 'ok', text: message });
            setSelected([]);
            load();
            onNotify?.(message);
          }}
        />
      ) : null}

      <p className="text-[11px] text-slate-500 flex items-start gap-1.5">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
        <span>
          السجل هنا للقرارات وتواريخها، وهو ما يفتح باب الاعتراض لاحقًا. المنصة لا تحتفظ بكلمات المرور ولا تعرضها،
          ولا تمنح أي حساب صلاحية من هذه الشاشة خارج الأدوار المذكورة.
        </span>
      </p>
    </PanelShell>
  );
};
