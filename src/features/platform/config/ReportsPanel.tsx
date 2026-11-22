import React, { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { BannerView, DecisionButton, ErrorNote, Fact, PanelShell } from '@/shared/ui/panel';
import type { Banner } from '@/shared/ui/panel';
import { formatDateTime, getLocale } from '@/core/i18n';
import { downloadDealsCsv, getSalesSummary } from '@/features/platform/api';
import type { SalesSummary } from '@/features/platform/types';
import {
  countedStatusLabels,
  exportProblem,
  periodFieldLabel,
  reportAmount,
  reportProblem,
  reportWindow,
} from './reports';

/**
 * The platform's own sales report, as the server computes it.
 *
 * The screen sends a window and draws what came back. It keeps no rule of its own:
 * which statuses count as turnover, what the money line means without a currency,
 * and which refusal the operator is looking at are all answered in `reports.ts`,
 * because those judgements belong to the report and not to this tab.
 *
 * What the panel does insist on is putting the basis next to the number. A total
 * with no stated window and no named set of states is a number nobody can check, and
 * this report is the one an operator quotes to people outside the platform. So the
 * counted statuses, the field the window cut on, and the fact that the commission is
 * accrued rather than collected all stay on screen with the figures.
 *
 * The CSV export is a fetch, not a link — the route answers `auth:sanctum`, and an
 * `<a href>` would download a 401 page as a spreadsheet.
 */
export const ReportsPanel: React.FC<{ onNotify?: (message: string) => void }> = ({ onNotify }) => {
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);

  const load = useCallback(async (window: ReturnType<typeof reportWindow> = {}) => {
    setLoading(true);
    setBanner(null);
    const result = await getSalesSummary(window);
    if (result.success) setSummary(result.data ?? null);
    else {
      // A refused report keeps no numbers on screen. The previous window's totals
      // would read as the answer to this one.
      setSummary(null);
      setBanner({ kind: 'error', text: reportProblem(result) });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const download = async () => {
    setExporting(true);
    setBanner(null);
    const result = await downloadDealsCsv(reportWindow(from, to));
    if (!result.ok || !result.blob || !result.filename) {
      setBanner({ kind: 'error', text: exportProblem(result) });
      setExporting(false);
      return;
    }
    const url = URL.createObjectURL(result.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setExporting(false);
    onNotify?.(`نُزِّل ملف ${result.filename}`);
  };

  return (
    <PanelShell
      title="تقرير الصفقات"
      hint="الدوران يُعدّ من الصفقات المكتملة وحدها — أي الطلب أُغلق بعد استلام البضاعة وإثبات التسليم. ما قبل ذلك نية وليس حجم تداول، والفترة تُطبَّق على تاريخ إنشاء الصفقة ويقول التقرير ذلك صراحةً."
    >
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="min-w-0 space-y-1 block">
          <span className="block text-[11px] font-bold text-slate-600">من تاريخ</span>
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs"
          />
        </label>
        <label className="min-w-0 space-y-1 block">
          <span className="block text-[11px] font-bold text-slate-600">إلى تاريخ</span>
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs"
          />
        </label>
        <div className="flex flex-col gap-2">
          <DecisionButton
            onClick={() => void load(reportWindow(from, to))}
            busy={loading}
            tone="primary"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            توليد التقرير لهذه الفترة
          </DecisionButton>
          <DecisionButton
            onClick={() => {
              setFrom('');
              setTo('');
              void load();
            }}
          >
            كل الفترات
          </DecisionButton>
        </div>
        <div className="flex flex-col gap-1">
          <DecisionButton onClick={() => void download()} busy={exporting}>
            <Download className="w-3.5 h-3.5" />
            تصدير الصفقات CSV
          </DecisionButton>
          <span className="text-center text-[10px] leading-relaxed text-slate-400">
            التصدير يستخدم التاريخين أعلاه كما هما، وقد يكون الملف كل السجل إن تُركا فارغين.
          </span>
        </div>
      </div>

      <BannerView banner={banner} />

      {summary ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="كل الصفقات بالنطاق" value={String(summary.total_deals_count)} />
          <Fact label="المغلقة باستلام مُؤكد" value={String(summary.completed_deals_count)} />
          <Fact
            label="حجم البضائع المتداولة"
            value={reportAmount(summary.gross_merchandise_value, summary.currency)}
          />
          <Fact
            label="عمولة المنصة المستحقّة"
            value={reportAmount(summary.platform_commission_accrued, summary.currency)}
          />
          <div className="col-span-full text-[11px] leading-relaxed text-slate-500">
            الأرقام محسوبة من حالات:{' '}
            <code>{countedStatusLabels(summary.counted_statuses, getLocale())}</code> — والعمولة مستحقّة لا
            محصّلة، لأن سدادها يتم بين المنصة والبائع خارج هذا النظام.
          </div>
          <div className="col-span-full text-[11px] leading-relaxed text-slate-500">
            العملة:{' '}
            {summary.currency ?? 'لم يضبط المشغّل عملة أساسية، لذلك تُعرض القيم بلا رمز'} · الفترة:{' '}
            {summary.period_from ?? 'بداية السجل'} ← {summary.period_to ?? 'اليوم'} على{' '}
            {periodFieldLabel(summary.period_field)} · أُنشئ{' '}
            {formatDateTime(summary.generated_at, getLocale()) || summary.generated_at}
          </div>
        </div>
      ) : null}

      {!loading && !summary ? (
        <p className="text-xs text-slate-500">
          لا أرقام تُعرض حتى يردّ الخادم بنطاق يستطيع قراءته الحساب الحالي.
        </p>
      ) : null}

      <ErrorNote text="هذه الأرقام ما سجلته المنصة نفسها: لا تصل إلى أنظمة الدولة ولا تعني أن صفقة تحققت خارج المنصة." />
    </PanelShell>
  );
};
