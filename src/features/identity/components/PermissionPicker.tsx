import React, { useMemo, useState } from 'react';
import type { ScopedPermission } from '@/features/identity/types';

/**
 * A checkbox list of capabilities the caller is allowed to offer.
 *
 * It exists because two doors — the platform's matrix and one company's standings —
 * select from the same catalog under different rules, and the rule that matters is
 * *which names appear at all*. Every screen passes the list the server's own read
 * endpoint returned (`grantable_permissions` inside a company, `permissions` minus
 * `account_forbidden` on the platform console), so a box the route would refuse is
 * never rendered. A picker that filtered by a hardcoded list of names would be a
 * second copy of the boundary, and copies of boundaries drift.
 *
 * Two modes because the two write shapes differ: `dual` shows three states per name
 * (منح / لا شيء / سحب) for a member's individual override, where the write takes a
 * grants list and a denials list, and `single` shows a tick for the role editors,
 * where the write takes one replacement list.
 */

export type OverrideState = 'grant' | 'none' | 'deny';

const SCOPE_LABELS: Record<ScopedPermission['scope'], string> = {
  platform: 'صلاحية منصة',
  business: 'صلاحية منشأة',
  both: 'مشتركة',
};

const STATE_LABELS: Record<OverrideState, string> = {
  grant: 'منح',
  none: 'كالدور',
  deny: 'سحب',
};

/** Stable ordering: the platform's own names first, then alphabetically. */
function byScopeThenName(a: ScopedPermission, b: ScopedPermission): number {
  const rank = (scope: ScopedPermission['scope']) => (scope === 'platform' ? 0 : scope === 'both' ? 1 : 2);
  return rank(a.scope) - rank(b.scope) || a.name.localeCompare(b.name);
}

interface PickerProps {
  /** What the server offered this screen. Anything outside it cannot be picked. */
  available: ScopedPermission[];
  /** The names the stored row currently carries, so the editor opens honest. */
  selected: string[];
  onSelect?: (names: string[]) => void;
  states?: Record<string, OverrideState>;
  onStatesChange?: (states: Record<string, OverrideState>) => void;
  /** A name the account already holds through its role: labelled, not clickable-off. */
  inherited?: string[];
  disabled?: boolean;
}

export const PermissionPicker: React.FC<PickerProps> = ({
  available,
  selected,
  onSelect,
  states,
  onStatesChange,
  inherited = [],
  disabled,
}) => {
  const [query, setQuery] = useState('');

  const isDual = states !== undefined && onStatesChange !== undefined;

  const chosen = useMemo(() => new Set(selected), [selected]);
  const passedDown = useMemo(() => new Set(inherited), [inherited]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...available]
      .filter((entry) => !needle || entry.name.toLowerCase().includes(needle))
      .sort(byScopeThenName);
  }, [available, query]);

  const toggleSingle = (name: string) => {
    if (!onSelect) return;
    onSelect(chosen.has(name) ? selected.filter((entry) => entry !== name) : [...selected, name]);
  };

  const cycle = (name: string) => {
    if (!states || !onStatesChange) return;
    const current = states[name] ?? 'none';
    const next: OverrideState = current === 'none' ? 'grant' : current === 'grant' ? 'deny' : 'none';
    onStatesChange({ ...states, [name]: next });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ابحث عن صلاحية…"
          disabled={disabled}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs focus:bg-white focus:outline-none disabled:opacity-50 sm:w-56 dark:border-hassal-line dark:bg-hassal-raised dark:text-slate-100"
        />
        <span className="text-[10px] text-slate-500 dark:text-slate-400">
          {isDual
            ? `${Object.values(states ?? {}).filter((state) => state === 'grant').length} مُضافة · ${
                Object.values(states ?? {}).filter((state) => state === 'deny').length
              } مسحوبة`
            : `${selected.length} من ${available.length}`}
        </span>
      </div>

      {isDual ? (
        <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
          الاسم يُنقر بالدوران: منح يضيف فوق الدور، سحب يمنعه حتى لو كان الدور يحمله، ولا شيء يتركه كما هو.
        </p>
      ) : null}

      <div className="max-h-72 min-w-0 overflow-y-auto rounded-lg border border-slate-200 dark:border-hassal-line">
        {visible.length === 0 ? (
          <p className="p-3 text-[11px] text-slate-500 dark:text-slate-400">
            {available.length ? 'لا اسم يطابق البحث.' : 'لم تصل قائمة الصلاحيات من الخادم.'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-hassal-line">
            {visible.map((entry) => {
              const state = isDual ? states?.[entry.name] ?? 'none' : chosen.has(entry.name) ? 'grant' : 'none';
              const carries = passedDown.has(entry.name);

              return (
                <li key={entry.name} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-bold text-slate-800 dark:text-slate-100" dir="ltr" title={entry.name}>
                      {entry.name}
                    </div>
                    <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                      <span>{SCOPE_LABELS[entry.scope]}</span>
                      {/* Said out loud because the alternative is a ticked box that
                          does nothing, which reads as a bug in the save. */}
                      {carries && !isDual ? <span className="text-emerald-700 dark:text-emerald-400">موروثة من الدور</span> : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => (isDual ? cycle(entry.name) : toggleSingle(entry.name))}
                    className={`shrink-0 rounded-lg border px-2 py-1 text-[10px] font-bold transition-colors disabled:opacity-40 ${
                      state === 'grant'
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : state === 'deny'
                          ? 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-hassal-line dark:bg-hassal-raised dark:text-slate-300'
                    }`}
                  >
                    {isDual ? STATE_LABELS[state] : state === 'grant' ? 'مشمولة' : 'غير مشمولة'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

/** The two lists a dual picker holds, split the way the route expects them. */
export function splitStates(states: Record<string, OverrideState>): { grants: string[]; denials: string[] } {
  const entries = Object.entries(states);
  return {
    grants: entries.filter(([, state]) => state === 'grant').map(([name]) => name).sort(),
    denials: entries.filter(([, state]) => state === 'deny').map(([name]) => name).sort(),
  };
}

/** A stored pair rebuilt as picker state, so an editor opens on what the row says. */
export function statesFrom(grants: string[], denials: string[]): Record<string, OverrideState> {
  const states: Record<string, OverrideState> = {};
  for (const name of grants) states[name] = 'grant';
  for (const name of denials) states[name] = 'deny';
  return states;
}
