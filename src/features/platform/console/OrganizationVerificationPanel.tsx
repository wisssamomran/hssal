import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Info, FileSearch } from 'lucide-react';
import { BannerView, DecisionButton, ErrorNote, Fact, LabeledSelect, PanelShell, TextInput, recorded } from '@/shared/ui/panel';
import { Banner } from '@/shared/ui/panel';
import { serverMessage } from '@/core/api/refusal';
import { decideOrganizationVerification, getOrganizations } from '@/features/organizations/api';
import { Organization } from '@/features/organizations/types';
import { StaffDocumentReview } from '@/features/organizations/components/OrganizationDocumentsPanel';
import { formatDateTime, getLocale } from '@/core/i18n';
import {
  ORGANIZATION_STATUSES,
  ORGANIZATION_TYPES,
  OrganizationDecision,
  organizationDecisionMessage,
  organizationDecisionProblem,
  organizationStatusLabel,
} from '@/features/organizations/review';

/**
 * Which businesses the platform has opened the market to.
 *
 * The panel lists what the server says about each business and offers the four
 * rulings that change it. Every judgement it applies — that a refusal or a
 * suspension needs a written reason, that a business cannot be verified while its
 * legal data is incomplete, what each refusal means — comes from
 * `features/organizations/review`, the same module the business's own document panel
 * reads. A rule kept inside this table would be true on one screen and absent on the
 * other, and the two screens are the two sides of the same decision.
 *
 * The papers behind a business open below its own row rather than on another tab:
 * ruling on a business without reading what it filed is how a platform ends up
 * trading on an unread certificate.
 */
export const OrganizationVerificationPanel: React.FC<{ onNotify?: (m: string) => void }> = ({ onNotify }) => {
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [reasons, setReasons] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const result = await getOrganizations({
      status: status || undefined,
      type: type || undefined,
      search: search || undefined,
      per_page: 25,
    });
    if (result.success) {
      setOrganizations(result.data ?? []);
      setTotal(result.pagination?.total_items ?? null);
    } else {
      setOrganizations([]);
      setTotal(null);
      setLoadError(serverMessage(result, 'لم ترد قائمة المنشآت من الخادم'));
    }
    setLoading(false);
  }, [status, type, search]);

  /** Which organization's filed papers are open right now — one drawer at a time. */
  const [docsFor, setDocsFor] = useState<number | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (organization: Organization, decision: OrganizationDecision) => {
    const reason = (reasons[organization.id] ?? '').trim();
    const problem = organizationDecisionProblem(decision, reason);
    if (problem) {
      setBanner({ kind: 'error', text: problem });
      return;
    }

    setBusyId(organization.id);
    setBanner(null);
    const result = await decideOrganizationVerification(organization.id, decision, reason || undefined);
    setBusyId(null);

    if (result.success) {
      setBanner({ kind: 'ok', text: serverMessage(result, 'سُجّل القرار') });
      setReasons((prev) => ({ ...prev, [organization.id]: '' }));
      load();
      onNotify?.('تم تحديث قائمة المنشآت');
      return;
    }

    setBanner({ kind: 'error', text: organizationDecisionMessage(result) });
  };

  return (
    <PanelShell
      title="إذن التداول للمنشآت"
      hint="«معتمدة» تعني أن حسابًا في منصة حصّال راجع ما رفعته المنشأة من بيانات. المنصة لا تتصل بأي سجل رسمي، ولا تعرض نفسها على أنها جهة تحقق."
    >
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <LabeledSelect
          label="حالة المراجعة"
          value={status}
          onChange={setStatus}
          options={[{ value: '', label: 'كل الحالات' }, ...ORGANIZATION_STATUSES]}
        />
        <LabeledSelect
          label="نوع النشاط"
          value={type}
          onChange={setType}
          options={[{ value: '', label: 'كل الأنواع' }, ...ORGANIZATION_TYPES]}
        />
        <TextInput label="بحث بالاسم" value={search} onChange={setSearch} placeholder="الاسم التجاري أو المسجل" />
        <div className="flex flex-col gap-1">
          <button
            onClick={load}
            className="flex w-full items-center justify-center gap-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg px-3 py-2 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>تحديث القائمة</span>
          </button>
          {/* The server's own count for the filter applied; nothing is added up here. */}
          <span className="text-center text-[11px] font-medium text-slate-500">
            {total !== null ? `${total} منشأة بالفلتر الحالي` : 'لم يردّ الخادم بعدد النتائج'}
          </span>
        </div>
      </div>

      <BannerView banner={banner} />
      {loadError && <ErrorNote text={loadError} />}

      <div className="space-y-3">
        {loading && <div className="p-6 text-center text-slate-400 text-xs">جارٍ التحميل…</div>}
        {!loading && !organizations.length && (
          <div className="p-6 text-center text-slate-400 text-xs">لا توجد منشآت مطابقة.</div>
        )}
        {!loading && organizations.map((organization) => (
          <div key={organization.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-black text-slate-900">{organization.name_ar}</div>
                <div className="text-[11px] text-slate-500">{organization.name_en} · #{organization.id}</div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                  {organization.type}
                </span>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                    organization.status === 'verified'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : organization.status === 'pending_kyc'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}
                >
                  {organizationStatusLabel(organization.status)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
              <Fact label="السجل التجاري" value={recorded(organization.commercial_registration_number)} />
              <Fact label="الرقم الضريبي" value={recorded(organization.vat_number)} />
              <Fact label="الدولة" value={recorded(organization.country_code)} />
              <Fact
                label="تاريخ المراجعة داخل المنصة"
                value={organization.kyc_verified_at ? formatDateTime(String(organization.kyc_verified_at), getLocale()) || String(organization.kyc_verified_at) : 'لم تُراجع بعد'}
              />
            </div>

            <div className="pt-1">
              <button
                onClick={() => setDocsFor(docsFor === organization.id ? null : organization.id)}
                className="text-[11px] font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-100 flex items-center gap-1.5 cursor-pointer"
              >
                <FileSearch className="w-3.5 h-3.5" />
                <span>{docsFor === organization.id ? 'إخفاء الوثائق المرفوعة' : 'عرض الوثائق المرفوعة'}</span>
              </button>

              {docsFor === organization.id ? (
                <div className="mt-2 border border-slate-200 rounded-xl p-3 bg-slate-50/40">
                  <StaffDocumentReview organizationId={organization.id} />
                  <p className="text-[10px] text-slate-500 pt-2">
                    قبول النسخ أو رفضها إجراء على ورقة واحدة؛ قرار «اعتماد للتداول» أو «رفض» أسفل هذا المربع هو ما
                    يفتح السوق للمنشأة أو يبقيها خارجه، وهو ما يُسجَّل باسم حالة المنشأة.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 pt-1">
              <div className="text-[11px] font-black text-slate-800">القرار على حالة التداول</div>
              <TextInput
                label="سبب القرار"
                value={reasons[organization.id] ?? ''}
                onChange={(value) => setReasons((prev) => ({ ...prev, [organization.id]: value }))}
                placeholder="مطلوب عند الرفض أو الإيقاف"
                wide
              />
              <div className="flex flex-wrap items-center gap-2">
                {(organization.status === 'pending_kyc' || organization.status === 'rejected') && (
                  <DecisionButton
                    tone="primary"
                    busy={busyId === organization.id}
                    onClick={() => decide(organization, 'VERIFY')}
                  >
                    اعتماد للتداول
                  </DecisionButton>
                )}
                {organization.status === 'pending_kyc' && (
                  <DecisionButton
                    busy={busyId === organization.id}
                    onClick={() => decide(organization, 'REJECT')}
                  >
                    رفض
                  </DecisionButton>
                )}
                {organization.status === 'verified' && (
                  <DecisionButton
                    busy={busyId === organization.id}
                    onClick={() => decide(organization, 'SUSPEND')}
                  >
                    إيقاف عن التداول
                  </DecisionButton>
                )}
                {(organization.status === 'suspended' || organization.status === 'rejected') && (
                  <DecisionButton
                    busy={busyId === organization.id}
                    onClick={() => decide(organization, 'REINSTATE')}
                  >
                    إعادة تفعيل
                  </DecisionButton>
                )}
              </div>
              {/* Said next to the buttons, because a decision whose effect is
                  guessed at is a decision that gets reversed the next day. */}
              <p className="text-[10px] leading-relaxed text-slate-500">
                {organization.status === 'pending_kyc'
                  ? '«اعتماد للتداول» يُدخل منشأتك السوق؛ «رفض» يبقيها خارجه مع سبب يُرسل إليها.'
                  : organization.status === 'rejected'
                    ? '«اعتماد للتداول» يعيد المنشأة إلى السوق بعد استكمال ما رفض؛ القرار يُسجَّل باسمك وبالسبب.'
                    : organization.status === 'verified'
                      ? '«إيقاف عن التداول» ينزل عروض المنشأة من السوق ومن نتائج المطابقة.'
                      : '«إعادة تفعيل» تعيد المنشأة إلى السوق كما كانت قبل الإيقاف.'}
              </p>
            </div>

            {organization.status === 'suspended' && (
              <p className="text-[11px] text-rose-700 flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  الإيقاف يمنع التداول: عروض هذه المنشأة تنزل من السوق ومن نتائج المطابقة والبحث القريب،
                  ولا يستطيع مشترٍ الوصول إليها.
                </span>
              </p>
            )}
          </div>
        ))}
      </div>
    </PanelShell>
  );
};
