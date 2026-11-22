import React from 'react';
import { DecisionButton, LabeledSelect, TextInput, recorded } from '@/shared/ui/panel';
import type { SystemSetting } from '@/features/platform/types';
import {
  appliedSettingLabel,
  booleanSettingDraft,
  settingTypeLabel,
  storedSettingValue,
} from './settings';

/**
 * One setting row: what the database holds, what the box holds, and the write that
 * moves the second into the first.
 *
 * Those two values are shown apart on purpose. The line «القيمة المطبَّقة الآن» is
 * the row as the platform reads it, and the chip above the box says when the box has
 * drifted from it — an operator who edits a tax rate and walks away without saving
 * must not leave believing the new number is live. Nothing is written until this
 * row's own button is pressed.
 *
 * A locked row still shows its box: `is_editable` is the row's fact, sent by the
 * server and honoured by its write route, and the console's job is to say which rows
 * it will not change rather than to hide the ones it was told not to touch.
 */
export const SettingRow: React.FC<{
  row: SystemSetting;
  draft: string;
  onDraft: (value: string) => void;
  onSave: () => void;
  busy: boolean;
  /** Whether the server said, after the last write, that no code path reads this key. */
  unread: boolean;
}> = ({ row, draft, onDraft, onSave, busy, unread }) => {
  const locked = !row.is_editable;
  const dirty = draft !== storedSettingValue(row);

  return (
    <div className="min-w-0 space-y-3 rounded-lg border border-slate-200 p-3 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(9rem,15rem)_auto] sm:items-end sm:gap-3 sm:space-y-0">
      <div className="flex-1 space-y-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <code className="text-[11px] font-bold text-slate-800">{row.key}</code>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
            {settingTypeLabel(row.type)}
          </span>
          {row.is_public ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700">يُرسل لعملاء المنصة</span>
          ) : null}
          {locked ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">مقفل</span>
          ) : null}
          {unread ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700">لا يقرأه النظام</span>
          ) : null}
          {dirty && !locked ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700">
              مكتوب في الصندوق، لم يُحفظ بعد
            </span>
          ) : null}
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          {/* `||` rather than `??`: a description stored as an empty string is not a
              missing one, and the English text the row carries is still the truth. */}
          {recorded(row.description_ar || row.description_en)}
          {row.value === null ? ' — لم تُضبط قيمة بعد' : ''}
        </p>
        {/* The live value, so an unsaved edit in the box below is never mistaken for it. */}
        <p className="text-[10px] text-slate-400">
          القيمة المطبَّقة الآن:{' '}
          <code className="break-all font-bold text-slate-600">{appliedSettingLabel(row)}</code>
        </p>
      </div>

      {row.type === 'boolean' ? (
        <LabeledSelect
          label="القيمة"
          value={booleanSettingDraft(draft)}
          onChange={onDraft}
          options={[
            { value: '1', label: 'مُفعّل' },
            { value: '0', label: 'موقوف' },
          ]}
        />
      ) : (
        <TextInput
          label="القيمة"
          value={draft}
          onChange={onDraft}
          wide
          placeholder={row.type === 'decimal' ? '0.0000' : row.type === 'integer' ? '0' : ''}
        />
      )}

      <DecisionButton onClick={onSave} busy={busy} tone={locked ? 'default' : 'primary'}>
        {locked ? 'مقفل في قاعدة البيانات' : dirty ? 'حفظ التعديل' : 'حفظ القيمة'}
      </DecisionButton>
    </div>
  );
};
