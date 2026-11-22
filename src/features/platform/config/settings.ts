import type { ApiResult } from '@/core/api/http';
import { explainRefusal } from '@/core/api/refusal';
import type { RefusalCodeText } from '@/core/api/refusal';
import type { FeatureFlag, SystemSetting } from '@/features/platform/types';

/**
 * What the platform's own registry means, kept out of the screens that write it.
 *
 * Three kinds of judgement live here, and none of them belongs to a panel:
 *
 * - the vocabulary the rows are filed under — the groups an operator reads them in
 *   and the type names the server validates a value against;
 * - how a stored value is read back, which is the server's rule rather than a
 *   convention the interface invented (`filter_var(..., FILTER_VALIDATE_BOOLEAN)`
 *   on a boolean column, and anything else the string the operator typed);
 * - what a refusal on these two endpoints means, since both of them answer with
 *   codes that only this module can name.
 *
 * The last one is why this file exists at all. `is_editable`, the declared `type`
 * and `meta.in_catalog` are facts about the row the write just touched, and a
 * screen that guesses at them prints a confident sentence about a setting nobody
 * reads.
 */

/* ─────────────────────────────── vocabulary ──────────────────────────────── */

/** Group names the server stores, in the order an operator reads them. */
const SETTING_GROUP_LABELS: Record<string, string> = {
  platform: 'هوية المنصة',
  tax: 'الضريبة',
  commission: 'عمولة المنصة',
  operations: 'تشغيل الصفقات',
  legal: 'المتطلبات القانونية',
  trust: 'الثقة والمراجعة',
  security: 'أسقف الطلبات',
  uploads: 'مساحة المنشآت',
  matching: 'المطابقة والقرب الجغرافي',
};

const SETTING_GROUP_ORDER = ['platform', 'tax', 'commission', 'operations', 'legal', 'trust', 'security', 'uploads', 'matching'];

/** The declared types, named as the console names them; an unknown one prints itself. */
const SETTING_TYPE_LABELS: Record<string, string> = {
  string: 'نص',
  boolean: 'نعم/لا',
  integer: 'عدد صحيح',
  decimal: 'عدد عشري',
  json: 'تركيبة',
};

export function settingGroupName(group: string): string {
  return SETTING_GROUP_LABELS[group] ?? group;
}

export function settingTypeLabel(type: string): string {
  return SETTING_TYPE_LABELS[type] ?? type;
}

/**
 * Rows filed by group, in the order an operator looks for them.
 *
 * A group the catalog has never used sorts last and alphabetically among its own
 * kind, so a newly-seen name appears in the list rather than vanishing from the
 * screen — the list is what the server returned, and hiding part of it because
 * this file has no label for it would be a claim about the data.
 */
export function groupSettings(rows: SystemSetting[]): [string, SystemSetting[]][] {
  const map = new Map<string, SystemSetting[]>();
  rows.forEach((row) => {
    const list = map.get(row.group) ?? [];
    list.push(row);
    map.set(row.group, list);
  });

  return [...map.entries()].sort(([a], [b]) => {
    const ia = SETTING_GROUP_ORDER.indexOf(a);
    const ib = SETTING_GROUP_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

/**
 * Whether the search box names this row.
 *
 * The list arrives whole: `/settings` has no search parameter, so this filter runs
 * in the browser and the count beside it says so out loud rather than implying the
 * server answered it.
 */
export function matchesSettingSearch(row: SystemSetting, term: string): boolean {
  const needle = term.trim().toLowerCase();
  return needle ? row.key.toLowerCase().includes(needle) : true;
}

/* ──────────────────────────── reading a value back ───────────────────────── */

/**
 * How the server reads a boolean setting.
 *
 * `SystemSetting::getTypedValueAttribute()` runs the stored string through
 * `filter_var(..., FILTER_VALIDATE_BOOLEAN)`, which counts `1`, `true`, `yes` and
 * `on` as enabled — and `valueProblem()` on the write route accepts exactly those
 * words plus their negatives. A screen that recognised only `1` and `true` would
 * show a setting the platform reads as on lying about itself as موقوفة, so the
 * read side follows the write side's whole list.
 */
const TRUE_WORDS = ['1', 'true', 'yes', 'on'];

export function isSettingTrue(value: string | null | undefined): boolean {
  return TRUE_WORDS.includes((value ?? '').trim().toLowerCase());
}

/** The same fact in the two values the console's own select works with. */
export function booleanSettingDraft(value: string | null | undefined): '1' | '0' {
  return isSettingTrue(value) ? '1' : '0';
}

/**
 * What the database holds for this row right now, as the row's own type reads it.
 *
 * Compared against the box below it, this is what makes «مكتوب في الصندوق، لم يُحفظ
 * بعد» an assertion rather than a guess.
 */
export function storedSettingValue(row: SystemSetting): string {
  return row.type === 'boolean' ? booleanSettingDraft(row.value) : (row.value ?? '');
}

/** The applied value in the operator's words: null was never set, not set to empty. */
export function appliedSettingLabel(row: SystemSetting): string {
  if (row.value === null) return 'لم تُضبط';
  if (row.type === 'boolean') return isSettingTrue(row.value) ? 'مُفعّلة' : 'موقوفة';
  return row.value;
}

/* ───────────────────────────── writing a value ───────────────────────────── */

/**
 * Why this write was refused, said as the next step rather than as the code.
 *
 * `SETTING_NOT_EDITABLE` and `SETTING_TYPE_MISMATCH` are both about the row, so the
 * row is what the sentence names: the key's declared type is the thing the operator
 * has to satisfy, and the server's own line for the mismatch («عدد صحيح مطلوب»)
 * stays in front because it is already the exact reason.
 */
export function settingWriteProblem(result: ApiResult<SystemSetting>, row: SystemSetting): string {
  const codes: Record<string, RefusalCodeText> = {
    SETTING_NOT_EDITABLE: 'هذا الإعداد مقفل في قاعدة البيانات ولا يقبل التعديل، لا من هذه الشاشة ولا من غيرها.',
    SETTING_TYPE_MISMATCH: (server) => `${server} — النوع المُعلَن للمفتاح ${row.key} هو ${settingTypeLabel(row.type)}.`,
    TENANT_REQUIRED: 'هذا المفتاح مرخَّص لمنشأة بعينها؛ يُدار من شاشة تلك المنشأة ولا يُكتب من إعدادات المنصة.',
  };
  return explainRefusal(result, { fallback: 'تعذّر حفظ الإعداد', codes });
}

/**
 * Whether any code path reads the key that was just written.
 *
 * The server answers `meta.in_catalog`, and only it can: the catalog that defines
 * which keys the platform actually looks up is backend code, so no list compiled
 * into this file could say the same thing after a deploy.
 */
export function settingIsUnread(result: ApiResult<SystemSetting>): boolean {
  return result.meta?.in_catalog === false;
}

export function settingSavedMessage(key: string, unread: boolean): string {
  return unread
    ? `حُفظت القيمة، لكن لا يقرأها أي مسار في النظام: المفتاح ${key} ليس في كتالوج الإعدادات.`
    : `حُفظت القيمة في ${key}.`;
}

/* ────────────────────────────── feature flags ────────────────────────────── */

/**
 * Why a capability could not be switched.
 *
 * `FLAG_NOT_IN_CATALOG` means the name is not one of the flags that gate a real
 * backend path, so the switch would change nothing: `isEnabled()` fails closed on
 * an unknown key, which is why the route refuses the insert instead of recording a
 * switch that does nothing.
 */
export function featureFlagProblem(result: ApiResult<FeatureFlag>): string {
  const codes: Record<string, RefusalCodeText> = {
    FLAG_NOT_IN_CATALOG: (server) => `${server} القدرات تُعرَّف في كتالوج الخادم ولا تُضاف من هذه الشاشة.`,
  };
  return explainRefusal(result, { fallback: 'تعذّر تبديل القدرة', codes });
}

/** What the switch is now, in the operator's words — read from the server's answer. */
export function featureFlagState(flag: FeatureFlag, enabled: boolean | undefined): string {
  return `${flag.name_ar}: ${enabled ? 'مُفعّلة' : 'موقوفة'}`;
}
