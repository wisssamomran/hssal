import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { BannerView, DecisionButton, ErrorNote, PanelShell, TextInput } from '@/shared/ui/panel';
import type { Banner } from '@/shared/ui/panel';
import { serverMessage } from '@/core/api/refusal';
import { getSettings, updateSetting } from '@/features/platform/api';
import type { SystemSetting } from '@/features/platform/types';
import { SettingRow } from './SettingRow';
import {
  groupSettings,
  matchesSettingSearch,
  settingGroupName,
  settingIsUnread,
  settingSavedMessage,
  settingWriteProblem,
} from './settings';

/**
 * The platform's general values, one row of `system_settings` at a time.
 *
 * What decides a value here is not this screen: the key, its declared type, its
 * group and whether it may be edited at all are the row's own fields, and the write
 * is checked against them by the route. The panel therefore offers a box per row and
 * reports what came back — it holds no list of keys, no idea what each one is used
 * for, and no local rule about what a value should look like.
 *
 * One fact on this screen cannot be inferred from anything the client knows: whether
 * any code path reads the key that was just saved. `meta.in_catalog` is the server's
 * answer, and a key outside the catalog is a switch that looks live and does nothing,
 * which is said on the row and in the banner the moment the write returns.
 */
export const SettingsPanel: React.FC<{ onNotify?: (m: string) => void }> = ({ onNotify }) => {
  const [rows, setRows] = useState<SystemSetting[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  /** Keys the server said no code reads — a fact about the write that just happened. */
  const [unread, setUnread] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getSettings();
    if (result.success) {
      const list = result.data ?? [];
      setRows(list);
      setDrafts((current) => {
        const next: Record<string, string> = { ...current };
        list.forEach((row) => {
          // An edit already in a box survives the reload; a key the operator has not
          // touched takes the value the server just read.
          if (next[row.key] === undefined) next[row.key] = row.value ?? '';
        });
        return next;
      });
    } else {
      setBanner({ kind: 'error', text: serverMessage(result, 'تعذّر قراءة الإعدادات') });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A row with an organization id is that business's own licensed override; it is
  // edited on the business's screen, under its own tenant, and never from here.
  const platformRows = useMemo(() => rows.filter((row) => !row.organization_id), [rows]);
  const overrides = rows.length - platformRows.length;

  /** The box under the search filters this list in the browser; the server sent it whole. */
  const visibleCount = useMemo(
    () => platformRows.filter((row) => matchesSettingSearch(row, search)).length,
    [platformRows, search]
  );
  const grouped = useMemo(() => groupSettings(platformRows), [platformRows]);

  const save = async (row: SystemSetting) => {
    const value = drafts[row.key] ?? '';
    setBusyKey(row.key);
    setBanner(null);
    const result = await updateSetting(row.key, value);
    setBusyKey(null);

    if (!result.success) {
      setBanner({ kind: 'error', text: settingWriteProblem(result, row) });
      return;
    }

    const isUnread = settingIsUnread(result);
    setUnread((current) => ({ ...current, [row.key]: isUnread }));
    setBanner({ kind: 'ok', text: settingSavedMessage(row.key, isUnread) });
    onNotify?.('تم حفظ الإعداد');
    await load();
  };

  return (
    <PanelShell
      title="قيم المنصة العامة"
      hint="كل سطر هو صف في قاعدة البيانات: قيمته، ونوعه الذي فُحص عند الكتابة، ومجموعته. التعديل يُرسل إلى /settings/update ويُسجَّل باسم الحساب."
    >
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
        <TextInput label="بحث بالمفتاح" value={search} onChange={setSearch} placeholder="tax.rate" />
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-end">
          {/* Counted here from what the server returned for this filter — a read
              count of the list, never a metric the platform publishes. */}
          <span className="order-2 text-center text-[11px] text-slate-500 sm:order-1 sm:text-right">
            {search.trim()
              ? `يطابق بحثك ${visibleCount} من ${platformRows.length} إعدادًا قرأها الخادم`
              : `${platformRows.length} إعدادًا قرأها الخادم`}
          </span>
          <span className="order-1 sm:order-2">
            <DecisionButton onClick={() => void load()} busy={loading}>
              <RefreshCw className="w-3.5 h-3.5" />
              إعادة القراءة
            </DecisionButton>
          </span>
        </div>
      </div>

      <BannerView banner={banner} />

      {overrides > 0 && (
        <ErrorNote
          text={`${overrides} إعداد مرخَّص لمنشأة بعينها؛ تُدار من شاشة تلك المنشأة ولا تُعدَّل من هنا.`}
        />
      )}

      {loading && !platformRows.length ? <p className="text-xs text-slate-500">…</p> : null}

      {!loading && !platformRows.length ? (
        <p className="text-xs text-slate-500">
          لا توجد إعدادات مرخَّصة بعد. تُنشأ بقيام المشغّل بتعريفها، لا بتخمين قيم داخل الواجهة.
        </p>
      ) : null}

      {grouped.map(([group, list]) => {
        const visible = list.filter((row) => matchesSettingSearch(row, search));
        if (!visible.length) return null;
        return (
          <div key={group} className="space-y-2">
            <h4 className="text-[11px] font-black text-slate-700">
              {settingGroupName(group)}
              <span className="ps-1.5 font-medium text-slate-400">({visible.length})</span>
            </h4>
            {visible.map((row) => (
              <SettingRow
                key={row.key}
                row={row}
                draft={drafts[row.key] ?? row.value ?? ''}
                onDraft={(value) => setDrafts((current) => ({ ...current, [row.key]: value }))}
                onSave={() => void save(row)}
                busy={busyKey === row.key}
                unread={unread[row.key] === true}
              />
            ))}
          </div>
        );
      })}
    </PanelShell>
  );
};
