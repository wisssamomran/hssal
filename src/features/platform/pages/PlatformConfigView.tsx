import React, { useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal, ToggleRight, Coins, ScrollText, PieChart, Wand2 } from 'lucide-react';
import { SetupWizardPanel } from '@/features/platform/components/SetupWizardPanel';
import { SettingsPanel } from '@/features/platform/config/SettingsPanel';
import { CapabilitiesPanel } from '@/features/platform/config/CapabilitiesPanel';
import { CurrenciesPanel } from '@/features/platform/config/CurrenciesPanel';
import { AuditPanel } from '@/features/platform/config/AuditPanel';
import { ReportsPanel } from '@/features/platform/config/ReportsPanel';

/**
 * The platform's own configuration, as the server holds it.
 *
 * This file is the tab bar and nothing else. Which sections a given account sees is
 * the whole of its knowledge, and every section lives in `features/platform/config/`
 * with the rules that say what a stored value means, what a refusal is, and what may
 * be written at all. A screen that draws and asks, while the judgements come from a
 * module the tests can reach without rendering anything, is the point of the split.
 *
 * Everything on this screen is read from an endpoint and written back through the
 * same contract; nothing here is a setting the client could invent. That distinction
 * matters more on this screen than anywhere else: a field that looks editable but is
 * not read by any code path is a switch that trains an operator to believe it does
 * something — which is why the settings panel marks a key the server says no code
 * reads, instead of quietly accepting the value.
 *
 * The gates below mirror the route middleware one for one: the settings registry, the
 * currency registry and the setup wizard are `role:SuperAdmin` server-side, capability
 * flags need `settings.manage`, the audit trail `audit.view`, and the reports
 * `reports.view`. Integration endpoints (API keys, webhooks) are deliberately absent:
 * they are scoped to one business, so they belong to that business's screen and not
 * to the platform's.
 */

type ConfigTab = 'settings' | 'wizard' | 'capabilities' | 'currencies' | 'audit' | 'reports';

interface PlatformConfigViewProps {
  can: (permission: string) => boolean;
  isPlatformAdmin: boolean;
  onNotify?: (message: string) => void;
}

export const PlatformConfigView: React.FC<PlatformConfigViewProps> = ({ can, isPlatformAdmin, onNotify }) => {
  const tabs = useMemo(() => {
    const available: { id: ConfigTab; label: string; icon: React.ElementType }[] = [];
    if (isPlatformAdmin) available.push({ id: 'settings', label: 'إعدادات المنصة', icon: SlidersHorizontal });
    if (isPlatformAdmin) available.push({ id: 'wizard', label: 'الإعداد الأولي', icon: Wand2 });
    if (can('settings.manage')) available.push({ id: 'capabilities', label: 'القدرات المُفعّلة', icon: ToggleRight });
    if (isPlatformAdmin) available.push({ id: 'currencies', label: 'سجل العملات', icon: Coins });
    if (can('audit.view')) available.push({ id: 'audit', label: 'سجل الأحداث', icon: ScrollText });
    if (can('reports.view')) available.push({ id: 'reports', label: 'تقارير الصفقات', icon: PieChart });
    return available;
  }, [can, isPlatformAdmin]);

  const [activeTab, setActiveTab] = useState<ConfigTab>('settings');
  useEffect(() => {
    if (tabs.length && !tabs.some((tab) => tab.id === activeTab)) setActiveTab(tabs[0].id);
  }, [tabs, activeTab]);

  if (!tabs.length) {
    return (
      <div className="mx-auto my-12 max-w-3xl space-y-2 rounded-xl border border-slate-200 bg-white p-6 text-center sm:p-8">
        <SlidersHorizontal className="w-6 h-6 mx-auto text-slate-400" />
        <h2 className="text-sm font-black text-slate-900">هذه الشاشة لإعدادات المنصة</h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          تظهر الأقسام هنا فقط للصلاحيات التي يمنحها الخادم للحساب الحالي: ضبط إعدادات المنصة وسجل العملات
          (دور إشرافي على المنصة)، أو تفعيل القدرات، أو قراءة سجل الأحداث، أو تقارير الصفقات.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-slate-900">إعدادات المنصة</h2>
          <p className="text-xs text-slate-500 pt-0.5 leading-relaxed">
            كل قيمة هنا مقروءة من الخادم وتُكتب إليه. ما لا يقرأه أي مسار في النظام معلَّم صراحةً.
          </p>
        </div>
        {/* Six sections do not fit a phone row: the strip swipes instead of
            breaking into two lines of chips nobody can compare. */}
        <div
          role="tablist"
          className="scrollbar-none -mx-1 flex min-w-0 items-center gap-1.5 overflow-x-auto rounded-xl bg-slate-100 p-1 text-xs font-semibold sm:mx-0"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 transition-all ${
                  activeTab === tab.id ? 'bg-white text-emerald-900 shadow-2xs font-bold' : 'text-slate-600'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Each panel re-reads its own endpoint when it opens, so switching tabs cannot
          leave one section showing another's cached answer. */}
      {activeTab === 'settings' && isPlatformAdmin && <SettingsPanel onNotify={onNotify} />}
      {activeTab === 'wizard' && isPlatformAdmin && <SetupWizardPanel />}
      {activeTab === 'capabilities' && can('settings.manage') && <CapabilitiesPanel onNotify={onNotify} />}
      {activeTab === 'currencies' && isPlatformAdmin && <CurrenciesPanel onNotify={onNotify} />}
      {activeTab === 'audit' && can('audit.view') && <AuditPanel isPlatform={isPlatformAdmin} />}
      {activeTab === 'reports' && can('reports.view') && <ReportsPanel onNotify={onNotify} />}
    </div>
  );
};
