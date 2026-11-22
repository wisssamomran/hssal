import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { BannerView, DecisionButton, ErrorNote, PanelShell } from '@/shared/ui/panel';
import type { Banner } from '@/shared/ui/panel';
import { serverMessage } from '@/core/api/refusal';
import { formatDateTime, getLocale } from '@/core/i18n';
import { usePlatformConfig } from '@/core/config';
import { createCurrency, getCurrencies, setDefaultCurrency, updateCurrency } from '@/features/platform/api';
import type { Currency } from '@/features/platform/types';
import { CurrencyRegistrationForm } from './CurrencyRegistrationForm';
import {
  EMPTY_EDIT,
  EMPTY_REGISTRATION,
  baseCurrencyMessage,
  currencyEdit,
  currencyEditPayload,
  currencyProblem,
  currencyStatusLabel,
  registrationPayload,
  type CurrencyEdit,
  type CurrencyRegistration,
} from './currency';

/**
 * The platform's money vocabulary: which currencies exist, what each is worth
 * against the base, and which one the base is.
 *
 * Rates are entered by the operator and stamped `MANUAL_ADMIN_RATE`; no exchange
 * feed is called anywhere in this codebase, so the screen never calls these market
 * prices. What is decided here is the registry; what a deal was actually priced in
 * stays on the deal, which keeps its own rate snapshot rather than re-reading this
 * table.
 *
 * Editing a row rewrites only the four fields the route accepts on a stored currency
 * — symbol, decimals, rate and whether it is active. The ISO code and the two names
 * identify the row: they are asked for when it is created and are not editable
 * afterwards, because a row that changed its code is a different currency wearing
 * the old row's id, and every deal that priced itself in it would silently mean
 * something else.
 */
export const CurrenciesPanel: React.FC<{ onNotify?: (m: string) => void }> = ({ onNotify }) => {
  const config = usePlatformConfig();
  const [rows, setRows] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);
  /** `-1` is the create button's own busy id: no stored row has that id. */
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [edit, setEdit] = useState<CurrencyEdit>(EMPTY_EDIT);
  const [creating, setCreating] = useState(false);
  const [registration, setRegistration] = useState<CurrencyRegistration>(EMPTY_REGISTRATION);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getCurrencies();
    if (result.success) setRows(result.data ?? []);
    else setBanner({ kind: 'error', text: serverMessage(result, 'تعذّر قراءة سجل العملات') });
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (currency: Currency) => {
    setEditing(currency.id);
    setEdit(currencyEdit(currency));
  };

  const saveEdit = async (currency: Currency) => {
    setBusyId(currency.id);
    setBanner(null);
    const result = await updateCurrency(currency.id, currencyEditPayload(edit));
    setBusyId(null);
    if (!result.success) {
      setBanner({
        kind: 'error',
        text: currencyProblem(result, ['exchange_rate_to_base', 'decimal_places', 'symbol'], 'تعذّر تحديث العملة'),
      });
      return;
    }
    setEditing(null);
    onNotify?.(`تم تحديث ${currency.iso_code}`);
    await load();
  };

  const register = async () => {
    setBusyId(-1);
    setBanner(null);
    const result = await createCurrency(registrationPayload(registration));
    setBusyId(null);
    if (!result.success) {
      setBanner({
        kind: 'error',
        text: currencyProblem(
          result,
          ['iso_code', 'name_ar', 'name_en', 'symbol', 'exchange_rate_to_base', 'decimal_places'],
          'تعذّر إضافة العملة'
        ),
      });
      return;
    }
    setCreating(false);
    setRegistration(EMPTY_REGISTRATION);
    onNotify?.(`أُضيفت ${registration.iso_code.toUpperCase()}`);
    await load();
  };

  const makeDefault = async (currency: Currency) => {
    setBusyId(currency.id);
    setBanner(null);
    const result = await setDefaultCurrency(currency.id);
    setBusyId(null);
    if (!result.success) {
      setBanner({ kind: 'error', text: currencyProblem(result, [], 'تعذّر ضبط العملة الأساسية') });
      return;
    }
    await load();
    setBanner({ kind: 'ok', text: baseCurrencyMessage(currency.iso_code) });
    onNotify?.(`العملة الأساسية الآن ${currency.iso_code}`);
  };

  return (
    <PanelShell
      title="سجل العملات وأسعارها"
      hint="الأسعار يدوية من المشغّل (MANUAL_ADMIN_RATE) ومقيسة على العملة الأساسية. المنصة لا تجلب سعر صرف من جهة خارجية ولا تدّعي أنه سعر السوق."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-[11px] text-slate-500">
          {/* Counted from the registry the server returned in full. */}
          {loading ? '…' : `${rows.length} عملة مسجّلة`} · الأساسية: {config.baseCurrency ?? 'لم تُضبط'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <DecisionButton onClick={() => void load()} busy={loading}>
            <RefreshCw className="w-3.5 h-3.5" />
            إعادة القراءة
          </DecisionButton>
          <DecisionButton onClick={() => setCreating((open) => !open)}>{creating ? 'إخفاء النموذج' : 'عملة جديدة'}</DecisionButton>
        </div>
      </div>

      <BannerView banner={banner} />

      {creating ? (
        <CurrencyRegistrationForm
          draft={registration}
          onChange={setRegistration}
          onSubmit={() => void register()}
          onCancel={() => setCreating(false)}
          busy={busyId === -1}
        />
      ) : null}

      <p className="text-[10px] text-slate-400 sm:hidden">
        اسحب الجدول أفقيًا؛ عمود الإجراء آخره. اضغط «تعديل» ليصير الحقل صندوقًا قابلًا للكتابة.
      </p>
      <div className="min-w-0 overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-right text-xs">
          <thead className="bg-slate-50 text-[11px] font-black text-slate-700">
            <tr>
              <th className="px-3 py-2.5 min-w-0">العملة</th>
              <th className="px-3 py-2.5">الرمز</th>
              <th className="px-3 py-2.5">خانات</th>
              <th
                className="px-3 py-2.5"
                title="كم من هذه العملة يعادل وحدة واحدة من العملة الأساسية للمنصة. يكون هذا الرقم ١ للعملة الأساسية نفسها."
              >
                سعر الصرف (لوحدة أساسية)
              </th>
              <th className="px-3 py-2.5">أُضيف يدويًا</th>
              <th className="px-3 py-2.5">الحالة</th>
              <th className="px-3 py-2.5 w-full min-w-0 text-left">إجراء</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((currency) => {
              const isEditing = editing === currency.id;
              return (
                <tr key={currency.id} className={currency.is_default ? 'bg-emerald-50/40' : ''}>
                  <td className="px-3 py-2.5 min-w-0">
                    <div className="font-bold text-slate-900">{currency.iso_code}</div>
                    <div className="text-[10px] text-slate-500">{currency.name_ar}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    {isEditing ? (
                      <input
                        value={edit.symbol}
                        onChange={(event) => setEdit({ ...edit, symbol: event.target.value })}
                        className="w-full min-w-[3.5rem] rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                      />
                    ) : (
                      currency.symbol
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {isEditing ? (
                      <input
                        value={edit.decimal_places}
                        onChange={(event) => setEdit({ ...edit, decimal_places: event.target.value })}
                        className="w-full min-w-[3rem] rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                      />
                    ) : (
                      currency.decimal_places
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {isEditing ? (
                      <input
                        value={edit.exchange_rate_to_base}
                        onChange={(event) => setEdit({ ...edit, exchange_rate_to_base: event.target.value })}
                        className="w-full min-w-[6.5rem] rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                      />
                    ) : (
                      <span className="tabular-nums">{currency.exchange_rate_to_base}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[10px] text-slate-500">
                    {currency.rate_updated_at ? formatDateTime(currency.rate_updated_at, getLocale()) || '—' : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    {isEditing ? (
                      <select
                        value={edit.is_active}
                        onChange={(event) => setEdit({ ...edit, is_active: event.target.value === '1' ? '1' : '0' })}
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                      >
                        <option value="1">نشطة</option>
                        <option value="0">موقوفة</option>
                      </select>
                    ) : (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap ${
                          currency.is_default
                            ? 'bg-emerald-100 text-emerald-800'
                            : currency.is_active
                              ? 'bg-slate-100 text-slate-600'
                              : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {currencyStatusLabel(currency)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {isEditing ? (
                        <>
                          <DecisionButton onClick={() => void saveEdit(currency)} busy={busyId === currency.id} tone="primary">
                            حفظ التعديل
                          </DecisionButton>
                          <DecisionButton onClick={() => setEditing(null)}>إلغاء</DecisionButton>
                        </>
                      ) : (
                        <>
                          <DecisionButton onClick={() => startEdit(currency)}>تعديل</DecisionButton>
                          {!currency.is_default ? (
                            <DecisionButton onClick={() => void makeDefault(currency)} busy={busyId === currency.id}>
                              ضبط كأساسية
                            </DecisionButton>
                          ) : null}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && !rows.length ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  لا عملات مسجّلة. لا تعرض الواجهة رمزًا ولا سعرًا حتى توجد قيمة مضبوطة في السجل.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <ErrorNote text="تغيير العملة الأساسية يعيد تعريف ما تُقاس إليه كل الأسعار: راجِع أسعار العملات الأخرى بعد ضبطها وإلا ستُنسب صفقات قائمة إلى أسعار محسوبة على أساس قديم." />
    </PanelShell>
  );
};
