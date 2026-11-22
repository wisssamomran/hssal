import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpenCheck,
  Landmark,
  Scale,
  ScrollText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { ApiResult } from '@/core/api/http';
import { refusalCode, serverMessage } from '@/core/api/refusal';
import { getJournalEntries, getLedgerAccounts, getTrialBalance } from '@/features/trading/api';
import type { LedgerAccount, LedgerEntry, TrialBalance } from '@/features/trading/types';
import { formatMoney, getPlatformConfig } from '@/core/config';
import { formatDateTime, getLocale } from '@/core/i18n';
import { BannerView, ErrorNote, Fact, PanelShell } from '@/shared/ui/panel';
import type { Banner } from '@/shared/ui/panel';

/**
 * دفتر الأستاذ المزدوج.
 *
 * What this screen is allowed to say is limited by what the three ledger routes
 * return: a chart of accounts with signed balances, journal entries with their
 * debit/credit lines, and a trial balance that either balances or does not.
 *
 * It deliberately says nothing about money the platform holds. There is no
 * "available for withdrawal" figure here and no wallet, because no route on this
 * server computes one — an account balance is a bookkeeping posting, not a bank
 * position, and the two must never look identical on screen.
 *
 * Both ledger routes sit behind `permission:ledger.view` *and*
 * `feature:double_entry_ledger`, so a deployment without the capability answers
 * 503 FEATURE_DISABLED. That is a legitimate state, shown as one.
 */

interface LedgerViewProps {
  currentPersonaId: string;
}

const TYPE_LABELS: Record<string, string> = {
  ASSET: 'أصول',
  LIABILITY: 'التزامات',
  EQUITY: 'حقوق ملكية',
  REVENUE: 'إيرادات',
  EXPENSE: 'مصروفات',
};

/** A quoted string, a plain number, or nothing — the API mixes all three. */
function amount(value: string | number | null | undefined): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function accountName(account: LedgerAccount | null | undefined): string {
  if (!account) return '—';
  const locale = getLocale();
  return (locale === 'en' ? account.name_en || account.name_ar : account.name_ar || account.name_en)
    || account.account_code;
}

/**
 * Why a ledger call failed, in the one shape these panels need.
 *
 * The ledger branches on the code — a disabled feature and a refused permission get
 * different advice, not just different words — so it takes both halves rather than a
 * sentence. Reading them out of the envelope is `core/api/refusal`'s job.
 */
function refusalOf(result: ApiResult<unknown>): { code: string; message: string } | null {
  if (result.success) return null;
  return {
    code: refusalCode(result) || 'UNKNOWN',
    message: serverMessage(result, 'تعذّر تنفيذ الطلب'),
  };
}

export const LedgerView: React.FC<LedgerViewProps> = ({ currentPersonaId }) => {
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [trialBalance, setTrialBalance] = useState<TrialBalance | null>(null);
  const [pagination, setPagination] = useState<{
    current_page: number;
    total_pages: number;
    total_items: number;
    has_more: boolean;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState('');
  const [banner, setBanner] = useState<Banner>(null);
  const [blocked, setBlocked] = useState<{ code: string; message: string } | null>(null);
  const [openEntryId, setOpenEntryId] = useState<number | null>(null);

  const load = useCallback(async (targetPage: number, filter: string) => {
    setLoading(true);
    setBanner(null);
    try {
      // Three reads, because three routes exist. An earlier version also called
      // a "reconciliation audit"; no such route was ever on the server, so the
      // 404 it produced was being read here as a ledger denial.
      const [accountsRes, entriesRes, trialRes] = await Promise.all([
        getLedgerAccounts(),
        getJournalEntries({ page: targetPage, ...(filter ? { entity_type: filter } : {}) }),
        getTrialBalance(),
      ]);

      // One gate covers all three routes, so the first refusal describes the rest.
      const denial = refusalOf(accountsRes) || refusalOf(entriesRes) || refusalOf(trialRes);
      setBlocked(denial ? { code: denial.code, message: denial.message } : null);

      if (accountsRes.success && Array.isArray(accountsRes.data)) setAccounts(accountsRes.data);
      if (entriesRes.success && Array.isArray(entriesRes.data)) {
        setEntries(entriesRes.data);
        setPagination(entriesRes.pagination ?? null);
      }
      if (trialRes.success && trialRes.data) setTrialBalance(trialRes.data as unknown as TrialBalance);
    } catch (err) {
      console.error(err);
      setBanner({ kind: 'error', text: 'انقطع الاتصال بخادم القيود. لم يُحذف أو يُعدَّل أي قيد.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(page, entityType);
  }, [currentPersonaId, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const baseCurrency = getPlatformConfig().baseCurrency;
  const entityTypes = Array.from(new Set(entries.map((e) => e.entity_type).filter(Boolean))) as string[];

  if (blocked) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        <LedgerHeader />
        {blocked.code === 'FEATURE_DISABLED' ? (
          <ErrorNote
            text="قدرة «الدفتر المزدوج» غير مفعّلة في هذا النشر، لذلك لا توجد قيود تُعرض. التفعيل من شاشة إعدادات المنصة وقدراتها، وعندها فقط تبدأ القيود بالتكوّن."
          />
        ) : blocked.code === 'PERMISSION_DENIED' ? (
          <ErrorNote text="صلاحية ledger.view غير ممنوحة لهذا الحساب ضمن المؤسسة الحالية، والقيود لا تُعرض بدونها." />
        ) : (
          <BannerView banner={{ kind: 'error', text: `${blocked.message} (${blocked.code})` }} />
        )}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      <LedgerHeader />

      {banner && <BannerView banner={banner} />}

      {/* Trial balance — the one number this screen can assert about itself */}
      <PanelShell
        title="ميزان المراجعة"
        hint="يُجمَّع كل طرف من أطراف القيود في عمود مدين وعمود كريديت حسب طبيعة الحساب. تساوي الطرفين يعني أن القيود متزنة، ولا يعني أن الأرصدة مطابقة لأي حساب بنكي."
      >
        {!trialBalance ? (
          <div className="text-xs text-slate-500 py-3">
            {loading ? 'جارٍ حساب ميزان المراجعة...' : 'لم يصل ميزان مراجعة من الخادم.'}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Fact label="إجمالي المدين" value={formatMoney(trialBalance.total_debit, baseCurrency)} />
              <Fact label="إجمالي الكريديت" value={formatMoney(trialBalance.total_credit, baseCurrency)} />
              <div
                className={`rounded-lg px-3 py-2 border ${
                  trialBalance.is_balanced
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-rose-50 border-rose-200'
                }`}
              >
                <div className="text-[10px] text-slate-500">حالة الاتزان</div>
                <div
                  className={`text-[11px] font-bold ${
                    trialBalance.is_balanced ? 'text-emerald-800' : 'text-rose-800'
                  }`}
                >
                  {trialBalance.is_balanced ? 'متزن: المدين = الكريديت' : 'غير متزن: فرق بين الطرفين'}
                </div>
              </div>
            </div>

            <p className="text-[10px] text-slate-400">
              أُعلن الميزان في {formatDateTime(trialBalance.generated_at, getLocale()) || trialBalance.generated_at}، وهو يغطي كل الحسابات العائدة لنطاق هذا الطلب.
            </p>
          </div>
        )}
      </PanelShell>

      {/* Chart of accounts */}
      <div className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-2xs">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Landmark className="w-4 h-4 shrink-0 text-emerald-700" />
              <span>دليل الحسابات وأرصدته</span>
            </h3>
            <p className="text-[11px] leading-relaxed text-slate-500 pt-1">
              الرصيد موقّع كما خزّنه الخادم؛ الحساب بلا مؤسسة هو حساب على مستوى المنصة، والحساب الممؤسس يخصّ مؤسستك الحالية فقط.
            </p>
          </div>
          {/* Counted in the browser from the list the ledger route returned whole. */}
          <div className="text-[11px] text-slate-500">
            عدد الحسابات: <strong className="text-slate-800">{accounts.length}</strong>
            <span className="block text-[10px] text-slate-400 sm:text-left">كما أرسلها الخادم في هذه القراءة</span>
          </div>
        </div>

        {loading && accounts.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">جارٍ تحميل دليل الحسابات...</div>
        ) : accounts.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 sm:p-8">
            لم يُنشئ الخادم أي حساب بعد. يُبنى الدليل تلقائياً عند أول قراءة لصلاحيات الدفتر.
          </div>
        ) : (
          <>
            <p className="px-4 pt-3 text-[10px] text-slate-400 sm:hidden">اسحب الجدول أفقيًا لقراءة الرصيد آخر عمود.</p>
            <div className="min-w-0 overflow-x-auto px-2 pb-2 sm:px-0 sm:pb-0">
              <table className="w-full text-xs text-right">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="p-3 whitespace-nowrap">رمز الحساب</th>
                    <th className="p-3 min-w-0">اسم الحساب</th>
                    <th className="p-3 whitespace-nowrap">الطبيعة</th>
                    <th className="p-3 whitespace-nowrap">العملة</th>
                    <th className="p-3 whitespace-nowrap">نطاق</th>
                    <th className="p-3 text-left whitespace-nowrap">الرصيد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {accounts.map((account) => (
                    <tr key={account.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3 font-mono text-slate-500 whitespace-nowrap">{account.account_code}</td>
                      <td className="p-3 min-w-0 font-bold text-slate-800">{accountName(account)}</td>
                      <td className="p-3">
                        <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                          {TYPE_LABELS[account.type] ?? account.type}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-slate-600">{account.currency_code || '—'}</td>
                      <td className="p-3 whitespace-nowrap text-slate-500">
                        {account.organization_id ? `مؤسسة #${account.organization_id}` : 'المنصة'}
                      </td>
                      <td className="p-3 text-left font-black font-serif whitespace-nowrap text-slate-900">
                        {formatMoney(amount(account.balance), account.currency_code)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Journal entries */}
      <div className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <ScrollText className="w-4 h-4 shrink-0 text-emerald-700" />
              <span>القيود اليومية</span>
            </h3>
            <p className="text-[11px] leading-relaxed text-slate-500 pt-1">
              كل قيد يصل بطرفيه: مجموع مدين ومجموع كريديت. فتح القيد يعرض الحسابات الأطراف وقيمة كل طرف.
            </p>
          </div>

          <label className="min-w-0 space-y-1">
            <span className="block text-[11px] font-bold text-slate-600">تصفية بكيان القيد</span>
            <select
              value={entityType}
              onChange={(event) => {
                setEntityType(event.target.value);
                setPage(1);
                load(1, event.target.value);
              }}
              className="w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-medium text-slate-800 lg:w-56"
            >
              <option value="">كل الكيانات</option>
              {entityTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            {/* The server's own pagination for the page currently shown. */}
            {pagination && (
              <span className="block text-center text-[11px] text-slate-500 lg:text-right">
                صفحة {pagination.current_page} من {pagination.total_pages} • {pagination.total_items} قيد
              </span>
            )}
          </label>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-500 text-xs">جارٍ تحميل القيود...</div>
        ) : entries.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 space-y-1 sm:p-8">
            <p>لا توجد قيود في هذا النطاق{entityType ? ` للكيان ${entityType}` : ''}.</p>
            <p className="text-[11px] text-slate-400">
              تظهر القيود عندما يسجّل مسار عمل مؤثّر قيداً؛ لا تُكتب القيود يدوياً من هذه الشاشة.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => {
              const lines = entry.lines ?? [];
              const isOpen = openEntryId === entry.id;
              return (
                <div key={entry.id} className="min-w-0 overflow-hidden rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setOpenEntryId(isOpen ? null : entry.id)}
                    className="flex w-full cursor-pointer items-start justify-between gap-3 bg-slate-50/60 px-3 py-3 text-right hover:bg-slate-100 sm:px-4"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900">{entry.entry_number}</span>
                        {entry.is_reversal && (
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                            قيد عكسي
                          </span>
                        )}
                        {entry.entity_type && (
                          <span className="whitespace-nowrap rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                            {entry.entity_type}
                            {entry.entity_id ? ` #${entry.entity_id}` : ''}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] leading-relaxed text-slate-600">{entry.description || 'بدون بيان'}</p>
                      <p className="font-mono text-[10px] text-slate-400">
                        {entry.posted_at || entry.created_at} • {lines.length} طرف
                      </p>
                    </div>
                    <div className="shrink-0 space-y-0.5 text-left">
                      <div className="whitespace-nowrap text-[11px] font-bold text-slate-700">
                        مدين {formatMoney(amount(entry.total_debit), entry.currency_code)}
                      </div>
                      <div className="whitespace-nowrap text-[11px] font-bold text-slate-500">
                        كريديت {formatMoney(amount(entry.total_credit), entry.currency_code)}
                      </div>
                      <div className="flex justify-end pt-0.5">
                        {isOpen ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="min-w-0 space-y-2 bg-white px-3 py-3 sm:px-4">
                      {entry.transaction_reference && (
                        <p className="text-[10px] text-slate-500 font-mono">
                          المرجع: {entry.transaction_reference}
                          {amount(entry.exchange_rate_to_base) > 0 && amount(entry.exchange_rate_to_base) !== 1
                            ? ` • سعر الصرف المسجَّل ${entry.exchange_rate_to_base}`
                            : ''}
                        </p>
                      )}
                      {lines.length === 0 ? (
                        <p className="text-[11px] text-slate-500">
                          لم يُرسل الخادم أطراف هذا القيد؛ الرصيد أعلاه كما سجّله.
                        </p>
                      ) : (
                        <div className="min-w-0 overflow-x-auto">
                          <table className="w-full text-[11px] text-right">
                            <thead className="text-slate-500 border-b border-slate-100">
                              <tr>
                                <th className="py-1.5 font-semibold min-w-0">الحساب</th>
                                <th className="py-1.5 font-semibold min-w-0">البيان</th>
                                <th className="py-1.5 text-left font-semibold whitespace-nowrap">مدين</th>
                                <th className="py-1.5 text-left font-semibold whitespace-nowrap">كريديت</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {lines.map((line) => (
                                <tr key={line.id}>
                                  <td className="py-1.5 min-w-0">
                                    <span className="font-mono text-slate-500">{line.account?.account_code ?? '—'}</span>{' '}
                                    <span className="font-bold text-slate-800">{accountName(line.account)}</span>
                                    {line.organization_id ? (
                                      <span className="text-slate-400"> • مؤسسة #{line.organization_id}</span>
                                    ) : null}
                                  </td>
                                  <td className="py-1.5 min-w-0 text-slate-600">{line.memo || '—'}</td>
                                  <td className="py-1.5 text-left font-mono whitespace-nowrap text-slate-800">
                                    {amount(line.debit_amount) ? formatMoney(amount(line.debit_amount), entry.currency_code) : '—'}
                                  </td>
                                  <td className="py-1.5 text-left font-mono whitespace-nowrap text-slate-800">
                                    {amount(line.credit_amount) ? formatMoney(amount(line.credit_amount), entry.currency_code) : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {entry.createdByUser?.name && (
                        <p className="text-[10px] text-slate-400">سجّله: {entry.createdByUser.name}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {pagination && pagination.total_pages > 1 && (
              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                <button
                  type="button"
                  disabled={pagination.current_page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-40 cursor-pointer"
                >
                  الصفحة السابقة
                </button>
                <span className="text-[11px] text-slate-500">
                  صفحة {pagination.current_page} من {pagination.total_pages}
                </span>
                <button
                  type="button"
                  disabled={!pagination.has_more}
                  onClick={() => setPage((current) => current + 1)}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-40 cursor-pointer"
                >
                  الصفحة التالية
                </button>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
};

const LedgerHeader: React.FC = () => (
  <div className="min-w-0 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 p-5 text-white shadow-lg sm:p-7">
    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
      <BookOpenCheck className="w-3.5 h-3.5 shrink-0" />
      <span>القيود المحاسبية المزدوجة</span>
    </div>
    <h2 className="flex flex-wrap items-center gap-2 pt-2 font-serif text-lg font-black sm:text-2xl">
      <Scale className="w-5 h-5 shrink-0 text-emerald-300" />
      <span>دفتر الأستاذ وميزان المراجعة</span>
    </h2>
    <p className="max-w-2xl pt-1.5 text-xs leading-relaxed text-slate-300">
      هذه الشاشة قراءةٌ لما دوّنه النظام من قيود: أرصدة حسابات، وأطراف كل قيد، وهل اتّزن الميزان. لا تُنفّذ هنا حركة مالية،
      ولا تمثّل أموالاً تحفظها المنصة أو أرصدة قابلة للسحب.
    </p>
  </div>
);
