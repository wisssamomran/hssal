import React, { useEffect, useMemo, useState } from 'react';
import {
  Gavel,
  Building2,
  Users,
  ShieldAlert,
  MessagesSquare,
  FileSearch,
  Sparkles,
  LifeBuoy,
  ShieldCheck,
} from 'lucide-react';
import { getLocale } from '@/core/i18n';
import { CommunityModerationPanel } from '@/features/community/components/CommunityModerationPanel';
import { PlatformPermissionsPanel } from '@/features/identity/components/PlatformPermissionsPanel';
import { SupportQueuePanel } from '@/features/support/components/SupportDeskPanel';
import { OfferModerationPanel } from '../console/OfferModerationPanel';
import { FeaturePlacementPanel } from '../console/FeaturePlacementPanel';
import { OrganizationVerificationPanel } from '../console/OrganizationVerificationPanel';
import { DocumentReviewDeskPanel } from '../console/DocumentReviewDeskPanel';
import { ManagedUsersPanel } from '../console/ManagedUsersPanel';

/**
 * The platform's own console: the actions only HASSAL can take.
 *
 * Five things happen here and nothing else, because these are the decisions a
 * hosted business cannot make about itself:
 *
 *   1. publish or return another business's listing (offers.moderate),
 *   2. let a business trade, or stop it (organizations.verify),
 *   3. rule on the legal papers a business filed, across every business
 *      (organizations.verify again, because accepting a copy and flipping a
 *      status are the same capability looked at from two ends),
 *   4. give an account a platform role, or lock it (users.manage),
 *   5. decide what another business's people may say in public on a listing
 *      (community.moderate).
 *
 * There are no dashboards with invented totals on this screen. A number here is
 * either `pagination.total_items` for the filter currently applied — which the
 * server counted — or it is not shown. Business settings, currencies, feature
 * flags and the audit trail belong to the configuration screen, and a member
 * list belongs to the business that owns it.
 *
 * Every control below is also enforced at the route (§36). Hiding a tab is not
 * the protection; it only keeps the console honest about what the signed-in
 * account can actually do.
 *
 * What stays in this file is the tab list and nothing else. Each queue is its
 * own component under `console/`: a reviewer who opens offer moderation should
 * not scroll past two thousand lines of account and document code to reach it,
 * and the two organization queues now read one shared vocabulary
 * (`features/organizations/review.ts`) instead of each keeping its own idea of
 * what `pending` is called in Arabic.
 */

/** The console's queues, each gated on the capability that performs it. */
type ConsoleTab = 'moderation' | 'featured' | 'organizations' | 'documents' | 'community' | 'support' | 'users' | 'permissions';

interface AdminConsoleViewProps {
  can: (permission: string) => boolean;
  onNotify?: (message: string) => void;
}

export const AdminConsoleView: React.FC<AdminConsoleViewProps> = ({ can, onNotify }) => {
  const tabs = useMemo(() => {
    const available: { id: ConsoleTab; label: string; icon: React.ElementType }[] = [];
    if (can('offers.moderate')) available.push({ id: 'moderation', label: 'مراجعة العروض', icon: Gavel });
    if (can('offers.feature')) available.push({ id: 'featured', label: 'العروض المميّزة', icon: Sparkles });
    if (can('organizations.verify')) available.push({ id: 'organizations', label: 'المنشآت والتداول', icon: Building2 });
    if (can('organizations.verify')) available.push({ id: 'documents', label: 'وثائق المنشآت', icon: FileSearch });
    if (can('community.moderate')) available.push({ id: 'community', label: 'تعليقات السوق', icon: MessagesSquare });
    if (can('support.manage')) available.push({ id: 'support', label: 'بلاغات الدعم', icon: LifeBuoy });
    if (can('users.manage')) available.push({ id: 'users', label: 'حسابات المنصة', icon: Users });
    // A separate capability from `users.manage`, and a separate tab for it: editing
    // what a role is worth is not the same act as editing an account, and one
    // operator should be grantable the matrix without being grantable the people.
    if (can('roles.manage')) available.push({ id: 'permissions', label: 'صلاحيات المنصة', icon: ShieldCheck });
    return available;
  }, [can]);

  const [activeTab, setActiveTab] = useState<ConsoleTab>('moderation');
  useEffect(() => {
    if (tabs.length && !tabs.some((tab) => tab.id === activeTab)) setActiveTab(tabs[0].id);
  }, [tabs, activeTab]);

  if (!tabs.length) {
    return (
      <div className="mx-auto my-12 max-w-3xl space-y-2 rounded-xl border border-slate-200 bg-white p-6 text-center sm:p-8">
        <ShieldAlert className="w-6 h-6 mx-auto text-amber-600" />
        <h2 className="text-sm font-black text-slate-900">هذه اللوحة لقرارات المنصة</h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          لا تظهر الإجراءات هنا إلا للحساب الذي يملك صلاحية مراجعتها في الخادم: مراجعة عروض المنشآت الأخرى،
          أو اعتماد منشأة، أو الفصل في كلام منشور على عرض يخص شركة أخرى، أو إدارة حسابات المنصة.
          الصلاحيات تُمنح في قاعدة البيانات ولا تُفتح من الواجهة.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-slate-900">لوحة قرارات المنصة</h2>
          <p className="text-xs text-slate-500 pt-0.5 leading-relaxed">
            نشر العروض، وإذن التداول للمنشآت، وأدوار الحسابات — وهي قرارات تُسجَّل باسم الحساب المتخذ لها.
          </p>
        </div>
        {/* Five queues on a handset do not fit one row; they swipe instead of
            wrapping into two rows of chips nobody can read. */}
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

      {activeTab === 'moderation' && can('offers.moderate') && <OfferModerationPanel onNotify={onNotify} />}
      {activeTab === 'featured' && can('offers.feature') && <FeaturePlacementPanel onNotify={onNotify} />}
      {activeTab === 'organizations' && can('organizations.verify') && <OrganizationVerificationPanel onNotify={onNotify} />}
      {activeTab === 'documents' && can('organizations.verify') && <DocumentReviewDeskPanel onNotify={onNotify} />}
      {activeTab === 'community' && can('community.moderate') && <CommunityModerationPanel onNotify={onNotify} />}
      {activeTab === 'support' && can('support.manage') && <SupportQueuePanel locale={getLocale()} onNotify={onNotify} />}
      {activeTab === 'users' && can('users.manage') && <ManagedUsersPanel onNotify={onNotify} can={can} />}
      {activeTab === 'permissions' && can('roles.manage') && <PlatformPermissionsPanel onNotify={onNotify} />}
    </div>
  );
};
