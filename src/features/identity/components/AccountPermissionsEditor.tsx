import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { fieldError } from '@/core/api/http';
import type { ApiResult } from '@/core/api/http';
import { explainRefusal } from '@/core/api/refusal';
import { getAccountPermissions, updateAccountPermissions } from '@/features/identity/api';
import type { AccountPermissionsView, PlatformRbacSnapshot } from '@/features/identity/types';
import { DecisionButton, ErrorNote, LabeledSelect, TextInput } from '@/shared/ui/panel';
import { PermissionPicker } from '@/features/identity/components/PermissionPicker';

/**
 * What one account holds on the platform by its own name, and the same change
 * applied to a group (§4.12).
 *
 * This is the account door, and it opens from the list of people rather than from
 * a screen of matrices: the operator who decides that a reviewer should also read
 * the ledger is standing at the row that says who the reviewer is. A second copy
 * of this editor, placed where nobody is looking for a person, is how two screens
 * end up with two rules about the same write.
 *
 * Three things shape it:
 *
 *   * The names offered are the server's catalog minus its own `account_forbidden`
 *     list. That exclusion is the scope rule (`business` capabilities follow a
 *     person into companies they never joined), published by
 *     `GET /rbac/platform` precisely so a console does not learn it from a 422.
 *   * `mode` is asked, never inferred. The same list of boxes means "these are all
 *     of them", "add these", or "take these away", and the difference between the
 *     three is a person's job or someone else's revoked access.
 *   * One account opens on its own rows: the read comes first, its grants prefill
 *     the picker, and the mode is `replace` because what is on screen is what will
 *     be saved. A group has no single current state to prefill from, so it starts
 *     at `add` and says so.
 *
 * The reason field is not decoration: the route requires `min:3`, and the audit
 * row it lands in is the only place a power change is explained six months later.
 */

/** The three verbs the endpoint takes, in the words that say what each destroys. */

const MODES: { value: string; label: string; help: string }[] = [
  {
    value: 'replace',
    label: 'هذه القائمة كلها',
    help: 'يستبدل المنح المسجَّل: ما ليس في القائمة يُسحب من الحساب.',
  },
  {
    value: 'add',
    label: 'أضِف لهؤلاء',
    help: 'لا يمسّ ما هو مسجَّل لكل حساب: يزيد هذه الأسماء فوق منحهم القائمة.',
  },
  {
    value: 'remove',
    label: 'اسحب من هؤلاء',
    help: 'يحذف هذه الأسماء من منح الحساب فقط؛ ما يأتيه من دوره على المنصة يبقى.',
  },
];

/**
 * The refusal in the sentence the operator can act on.
 *
 * The three codes this route raises are all "you asked through the wrong door", and
 * each one names what was wrong: which permission names, which account ids, which role
 * is edited in a file instead. `details` is declared as string lists because that is
 * what validation failures carry; this refusal's lists are names and ids, so the shape
 * is asserted here rather than widened into the shared envelope type.
 */
function accountRefusal(result: ApiResult<unknown>): string {
  const details = result.error?.details as unknown as
    | { permissions?: string[]; user_ids?: number[] }
    | undefined;
  const refused = details?.permissions;

  return explainRefusal(result, {
    fallback: 'رفض الخادم الطلب.',
    codes: {
      ACCOUNT_PERMISSION_REFUSED: refused?.length
        ? `أسماء لا تُسنَد للحساب من هذا الباب: ${refused.join('، ')}`
        : 'أسماء لا تُسنَد للحساب من هذا الباب؛ راجع قائمة صلاحيات المنصة.',
      USER_NOT_FOUND: `حسابات غير موجودة: ${(details?.user_ids ?? []).join('، ') || 'راجع الأرقام المطلوبة.'}`,
      ROLE_IMMUTABLE: 'دور مالك المنصة يُحرَّر في الملف لا في اللوحة.',
    },
  });
}

interface Target {
  id: number;
  name: string;
}

export const AccountPermissionsEditor: React.FC<{
  targets: Target[];
  snapshot: PlatformRbacSnapshot;
  onClose: () => void;
  onSaved: (message: string) => void;
}> = ({ targets, snapshot, onClose, onSaved }) => {
  const single = targets.length === 1;

  /**
   * The one thing the read is keyed on, taken out as a primitive.
   *
   * The parent rebuilds the `targets` array on every render, so an effect or a
   * callback that leaned on it would re-fire on each state change this sheet makes
   * — a fetch that answers, sets state, and fetches again. The id is the same fact
   * without the identity.
   */
  const singleId = single ? targets[0].id : null;

  const [mode, setMode] = useState('add');
  const [draft, setDraft] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [view, setView] = useState<AccountPermissionsView | null>(null);
  const [loading, setLoading] = useState(single);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** Names this door accepts — the published exclusion, not a prefix test. */
  const available = useMemo(() => {
    const forbidden = new Set(snapshot.account_forbidden);
    return snapshot.permissions.filter((entry) => !forbidden.has(entry.name));
  }, [snapshot]);

  /** What the account holds through its platform roles, which no box here grants. */
  const inherited = useMemo(() => {
    if (!view) return [];
    const raw = new Set(view.grants);
    return view.effective.filter((name) => !raw.has(name));
  }, [view]);

  const read = useCallback(async () => {
    if (singleId === null) return;
    const result = await getAccountPermissions(singleId);
    if (result.success && result.data) {
      setView(result.data);
      setDraft([...result.data.grants]);
      // Opened on the row's own state, so the save must mean "this list, exactly".
      setMode('replace');
      setBanner(null);
    } else {
      setView(null);
      setBanner(accountRefusal(result));
    }
  }, [singleId]);

  useEffect(() => {
    if (singleId === null) {
      setLoading(false);
      return;
    }
    let active = true;
    void read().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [read, singleId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async () => {
    const trimmed = reason.trim();
    const nextErrors: Record<string, string | undefined> = {};
    if (trimmed.length < 3) nextErrors.reason = 'السبب مطلوب (٣ أحرف على الأقل) ويُحفظ مع القرار.';
    if (mode !== 'replace' && !draft.length) nextErrors.permissions = 'لم تختر صلاحية لهذا القرار.';
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    setBusy(true);
    setBanner(null);
    setNotice(null);
    try {
      const result = await updateAccountPermissions({
        user_ids: targets.map((target) => target.id),
        permissions: draft,
        mode: mode as 'replace' | 'add' | 'remove',
        reason: trimmed,
      });

      if (result.success) {
        const applied = (result.data?.applied ?? []) as { changed: boolean }[];
        const changed = applied.filter((row) => row.changed).length;
        const message = single
          ? `حُفظت صلاحيات ${targets[0].name}: ${draft.length} اسمًا ممنوحًا باسمه.`
          : `طُبِّق القرار على ${applied.length} حسابًا (${changed} تغيّر فعلاً).`;
        // The parent's banner sits behind this overlay, so a save that only
        // reported there would look like a button that did nothing.
        setNotice(message);
        onSaved(message);
        setReason('');
        if (single) await read();
      } else {
        setErrors({
          permissions: fieldError(result, 'permissions'),
          reason: fieldError(result, 'reason'),
          user_ids: fieldError(result, 'user_ids'),
        });
        setBanner(accountRefusal(result));
      }
    } finally {
      setBusy(false);
    }
  };

  const modeHelp = MODES.find((entry) => entry.value === mode)?.help ?? '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="صلاحيات الحساب على المنصة"
        onClick={(event) => event.stopPropagation()}
        className="max-h-[92dvh] w-full space-y-4 overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:max-w-2xl sm:rounded-2xl sm:p-6 dark:border-hassal-line dark:bg-hassal-night"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-hassal-line">
          <div className="min-w-0 space-y-1">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {single ? `صلاحيات ${targets[0].name} على المنصة` : `قرار واحد على ${targets.length} حسابًا`}
            </h3>
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              ما يُمنح هنا يتبع الحساب في كل منشأة، لا في شركة واحدة؛ صلاحيات المنشأة داخل الشركة تُحرَّر من عضوية
              تلك الشركة. الأسماء المتاحة هي ما يقبله هذا الباب، وقد نشره الخادم لا هذه الشاشة.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="shrink-0 cursor-pointer rounded-lg border border-slate-200 px-2.5 py-1 text-sm font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {loading ? (
          <p className="py-6 text-center text-xs text-slate-500">جارٍ قراءة منح الحساب…</p>
        ) : (
          <>
            {view ? (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] dark:border-hassal-line dark:bg-hassal-raised">
                <div className="flex flex-wrap items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
                  <span>الحساب #{view.user_id}</span>
                  <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400">
                    أدوار المنصة: {view.roles.length ? view.roles.join('، ') : 'لا دور'}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <div className="font-bold text-slate-700 dark:text-slate-200">منح مباشرة محفوظة ({view.grants.length})</div>
                    <div className="break-all text-slate-600 dark:text-slate-400" dir="ltr">
                      {view.grants.length ? view.grants.join('، ') : 'لا شيء'}
                    </div>
                  </div>
                  <div>
                    <div className="font-bold text-slate-700 dark:text-slate-200">ما يقرره الوسيط فعليًا ({view.effective.length})</div>
                    <div className="break-all text-slate-600 dark:text-slate-400" dir="ltr">
                      {view.effective.length ? view.effective.join('، ') : 'لا شيء'}
                    </div>
                  </div>
                </div>
                <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                  القائمتان مختلفتان بالتصميم: الأولى صفوف الحساب الخام، والثانية ما يوافق عليه الخادم بعد قاعدة
                  النطاق. اسمٌ في الأولى بلا أثرٍ في الثانية لا يفتح بابًا، وهذا الفرق هو ما يفسَّره سجل التدقيق بعد
                  الواقعة لا هذه الصناديق.
                </p>
              </div>
            ) : null}

            {!single ? (
              <ErrorNote text="جماعي: لا تُقرأ تجاوزات كل حساب قبل العرض، فاستعمال «هذه القائمة كلها» يجعل منح كل حساب من هؤلاء مطابقًا تمامًا لما يُحدد هنا." />
            ) : null}

            <div className="flex flex-wrap items-end gap-3">
              <LabeledSelect label="طريقة التطبيق" value={mode} onChange={setMode} options={MODES.map(({ value, label }) => ({ value, label }))} />
              <p className="min-w-0 flex-1 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">{modeHelp}</p>
            </div>

            <PermissionPicker
              available={available}
              selected={draft}
              onSelect={(names) => {
                setDraft(names);
                setNotice(null);
              }}
              inherited={inherited}
              disabled={busy}
            />

            {notice ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-[11px] font-bold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                {notice}
              </p>
            ) : null}

            {errors.permissions ? <ErrorNote text={errors.permissions} /> : null}

            <div className="flex flex-wrap items-end gap-3">
              <TextInput
                label="سبب الإسناد (مطلوب)"
                value={reason}
                onChange={setReason}
                placeholder="مثال: تكليف مراجع مؤقت لعطلة نهاية الأسبوع"
                wide
                error={errors.reason}
              />
              <DecisionButton tone="primary" onClick={() => void save()} busy={busy}>
                <span>{mode === 'remove' ? 'حفظ السحب' : mode === 'add' ? 'حفظ المنح' : 'حفظ القائمة'}</span>
              </DecisionButton>
              <DecisionButton onClick={onClose} busy={busy}>
                <span>إغلاق</span>
              </DecisionButton>
            </div>

            {banner ? <ErrorNote text={banner} /> : null}
          </>
        )}
      </div>
    </div>
  );
};
