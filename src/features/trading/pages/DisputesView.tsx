import React, { useCallback, useEffect, useState } from 'react';
import { Scale, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { fieldError } from '@/core/api/http';
import { getDeals, getDisputes, openDispute, resolveDispute } from '@/features/trading/api';
import type { Deal, Dispute, DisputeStatus } from '@/features/trading/types';
import { formatMoney, usePlatformConfig } from '@/core/config';
import { formatDateTime, getLocale } from '@/core/i18n';
import { BannerView, DecisionButton, ErrorNote, LabeledSelect, PanelShell, TextInput } from '@/shared/ui/panel';
import type { Banner } from '@/shared/ui/panel';
import { Sheet } from '@/shared/ui/Sheet';

/**
 * Disputes: what a party to a deal can raise, and what the platform can decide.
 *
 * Two things this screen refuses to do. It does not describe money the platform
 * is holding: filing a dispute moves the deal to DISPUTED and records a claim —
 * no endpoint here touches funds, so no wording may imply an escrow that is not
 * there, and no ruling on this screen names an amount to hand back. And it does
 * not invent vocabularies: the reason is one of the six codes `Dispute::REASONS`
 * accepts (the server validates `in:` that list, so typing prose would only
 * produce a refusal), while the decision and the status are exactly the
 * constants the server accepts and returns.
 *
 * The arbitration control is shown to a platform account because the controller
 * requires `hasRole('SuperAdmin')`; the list itself is scoped server-side to the
 * organizations that are party to each dispute (§36).
 */

const STATUS_LABELS: Record<DisputeStatus, string> = {
  OPEN: 'مفتوح',
  UNDER_REVIEW: 'قيد المراجعة',
  EVIDENCE_REQUIRED: 'مطلوب فيه أدلة',
  RESOLVED_RELEASE: 'قرار: الصفقة ماضية إلى الاستلام',
  RESOLVED_CANCELLATION: 'قرار: إلغاء الصفقة',
};

const OPEN_STATUSES: DisputeStatus[] = ['OPEN', 'UNDER_REVIEW', 'EVIDENCE_REQUIRED'];

/** The two rulings `disputes/{id}/resolve` will accept, and what each does. */
const DECISIONS: { value: 'RESOLVED_RELEASE' | 'RESOLVED_CANCELLATION'; label: string; effect: string }[] = [
  {
    value: 'RESOLVED_RELEASE',
    label: 'الصفقة ماضية: يُسمح للمستلم بإتمام الاستلام',
    effect:
      'يُنهي هذا القرار النزاع ويُبقي الصفقة في حالة «محلولة»، أي أن مسار التسليم يستأنف من حيث توقف: رمز التسليم باقٍ، وتأكيد الاستلام يبقى حق المشتري. لا مبلغ يُرد ولا أموال تُحرَّك، لأن المنصة لا تحتفظ بشيء.',
  },
  {
    value: 'RESOLVED_CANCELLATION',
    label: 'الصفقة ملغاة: تُستدعى البضاعة وتُطلَق الكمية المحجوزة',
    effect:
      'يُنهي هذا القرار النزاع وينقل الصفقة إلى «مُلغاة»: الكمية المحجوزة تعود إلى المتاح، ورمز التسليم يُسحب من الاستعمال. التسوية المالية بين المنشأتين تبقى خارج المنصة، والسجل هنا يحكي ما تقرر لا ما دُفع.',
  },
];

/** The codes `Dispute::REASONS` accepts — the server validates against this list. */
const REASONS: { value: 'QUALITY_DEFECT' | 'QUANTITY_MISMATCH' | 'WRONG_ITEM' | 'DELIVERY_DELAY' | 'TEMPERATURE_ABUSE' | 'OTHER'; label: string }[] = [
  { value: 'QUALITY_DEFECT', label: 'عيب في الجودة' },
  { value: 'QUANTITY_MISMATCH', label: 'فارق في الكمية المسلَّمة' },
  { value: 'WRONG_ITEM', label: 'صنف غير المطلوب' },
  { value: 'DELIVERY_DELAY', label: 'تأخر في التسليم' },
  { value: 'TEMPERATURE_ABUSE', label: 'خروج عن سلسلة التبريد' },
  { value: 'OTHER', label: 'سبب آخر يُشرح في المطالبة' },
];

const REASON_LABELS: Record<string, string> = Object.fromEntries(REASONS.map((item) => [item.value, item.label]));

interface DisputesViewProps {
  currentPersonaId: string;
  initialDealId?: number | null;
  /** The resolve endpoint checks `hasRole('SuperAdmin')`, so the console mirrors it. */
  isPlatformAdmin: boolean;
  onNotify?: (message: string) => void;
}

export const DisputesView: React.FC<DisputesViewProps> = ({ currentPersonaId, initialDealId, isPlatformAdmin, onNotify }) => {
  const config = usePlatformConfig();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const [showOpenModal, setShowOpenModal] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState<number | ''>(initialDealId || '');
  const [reason, setReason] = useState<(typeof REASONS)[number]['value'] | ''>('');
  const [description, setDescription] = useState('');
  const [claimedAmount, setClaimedAmount] = useState('');
  const [evidenceUrls, setEvidenceUrls] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [deciding, setDeciding] = useState<Dispute | null>(null);
  const [decision, setDecision] = useState<(typeof DECISIONS)[number]['value']>('RESOLVED_RELEASE');
  const [notes, setNotes] = useState('');

  const loadData = useCallback(
    async (page = 1) => {
      setLoading(true);
      const [disputesRes, dealsRes] = await Promise.all([
        getDisputes({ status: statusFilter || undefined, page }),
        getDeals({ page: 1 }),
      ]);

      if (disputesRes.success) {
        setDisputes((disputesRes.data ?? []) as Dispute[]);
        setTotal(disputesRes.pagination?.total_items ?? null);
        setBanner(null);
      } else {
        setBanner({
          kind: 'error',
          text:
            disputesRes.error_code === 'TENANT_REQUIRED'
              ? 'سجل النزاعات مرتبط بمنشأة: اختر سياق منشأة أولًا.'
              : disputesRes.message || 'تعذّر قراءة سجل النزاعات',
        });
      }

      if (dealsRes.success) setDeals((dealsRes.data ?? []) as Deal[]);
      setLoading(false);
    },
    [statusFilter]
  );

  useEffect(() => {
    void loadData(1);
  }, [loadData]);

  useEffect(() => {
    if (initialDealId) {
      setSelectedDealId(initialDealId);
      setShowOpenModal(true);
    }
  }, [currentPersonaId, initialDealId]);

  const fileDispute = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedDealId) return;
    // The server's `in:` rule would refuse prose anyway; refusing here keeps the
    // message on the field the person has to fill rather than in a banner.
    if (!reason) {
      setBanner({ kind: 'error', text: 'اختر سببًا من الأسباب التي يقبلها السجل.' });
      return;
    }
    setSubmitting(true);
    setBanner(null);

    const urls = evidenceUrls
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const res = await openDispute({
      deal_id: Number(selectedDealId),
      reason,
      description: description.trim(),
      claimed_amount: Number(claimedAmount),
      evidence_urls: urls.length ? urls : undefined,
    });

    setSubmitting(false);
    if (res.success) {
      setShowOpenModal(false);
      setReason('');
      setDescription('');
      setClaimedAmount('');
      setEvidenceUrls('');
      onNotify?.('سُجّل النزاع وتحوّلت الصفقة إلى حالة نزاع');
      await loadData(1);
    } else {
      setBanner({
        kind: 'error',
        text:
          fieldError(res, 'claimed_amount') ||
          fieldError(res, 'reason') ||
          fieldError(res, 'description') ||
          fieldError(res, 'deal_id') ||
          res.message ||
          'تعذّر تسجيل النزاع',
      });
    }
  };

  const ruleDispute = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!deciding) return;
    setSubmitting(true);
    setBanner(null);

    const res = await resolveDispute(deciding.id, {
      status: decision,
      notes: notes.trim(),
    });

    setSubmitting(false);
    if (res.success) {
      setDeciding(null);
      setNotes('');
      onNotify?.('سُجّل قرار المنصة على النزاع');
      await loadData(1);
    } else {
      setBanner({
        kind: 'error',
        text:
          fieldError(res, 'notes') ||
          fieldError(res, 'status') ||
          res.message ||
          'تعذّر تسجيل القرار',
      });
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-slate-900">نزاعات الصفقات</h2>
          <p className="text-xs leading-relaxed text-slate-500 pt-0.5">
            فتح النزاع حقٌّ لطرفَي الصفقة ويُنقل إليها حالة «نزاع»؛ أما قرار التسوية فقرار المنصة ويُنفَّذ في الخادم.{' '}
            {config.inspectionWindowHours === null
              ? 'مهلة الفحص لم تضبط بعد في إعدادات المنصة.'
              : `مهلة الفحص المضبوطة: ${config.inspectionWindowHours} ساعة من الاستلام.`}
          </p>
        </div>
        <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,12rem)_auto_auto]">
          <LabeledSelect
            label="الحالة"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: '', label: 'كل الحالات' },
              ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
            ]}
          />
          <DecisionButton onClick={() => void loadData(1)} busy={loading}>
            <RefreshCw className="w-3.5 h-3.5" />
            تحديث السجل
          </DecisionButton>
          <button
            onClick={() => setShowOpenModal(true)}
            className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-rose-700"
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>فتح نزاع على صفقة</span>
          </button>
        </div>
      </div>

      <BannerView banner={banner} />

      <PanelShell
        title="سجل النزاعات"
        hint="كل صف هو مطالبة مسجّلة باسم منشأة وحساب، بما قرره الخادم عليها. لا تُعرض هنا أي أرقام عن أموال محتجزة أو مبالغ مُحوَّلة: المنصة لا تشغّل حساب ضمان ولا تحتفظ بثمن صفقة، فالتسوية تتم بين المنشأتين خارجها ويقتصر سجلها على حالة الصفقة وما تقرر فيها."
      >
        {total !== null ? (
          <p className="text-[11px] text-slate-500">
            {/* The server's total for the filter applied; the list below is the first
                page it sent, and the screen says so rather than implying more. */}
            {total} نزاع بالفلتر الحالي — تُعرض هنا نتائج الصفحة الأولى منها
          </p>
        ) : null}

        {loading ? (
          <p className="text-xs text-slate-500">…</p>
        ) : disputes.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <CheckCircle2 className="w-9 h-9 text-emerald-500 mx-auto" />
            <p className="text-xs text-slate-500">لا نزاعات بهذه المعايير للمنشآت التي يقرأها هذا الحساب.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {disputes.map((dispute) => {
              const currency = dispute.deal?.currency_code ?? null;
              return (
                <div key={dispute.id} className="min-w-0 space-y-2 rounded-lg border border-slate-200 p-3 sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900">{dispute.dispute_number}</span>
                        <span
                          className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            OPEN_STATUSES.includes(dispute.status)
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {STATUS_LABELS[dispute.status] ?? dispute.status}
                        </span>
                        {dispute.deal ? (
                          <span className="whitespace-nowrap rounded bg-emerald-50 px-2 py-0.5 font-mono text-[10px] text-emerald-800">
                            {dispute.deal.deal_number}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-slate-700">
                        السبب: <strong className="break-words">{REASON_LABELS[dispute.reason] ?? dispute.reason}</strong>
                      </p>
                      {dispute.description ? (
                        <p className="text-[11px] leading-relaxed text-slate-500">{dispute.description}</p>
                      ) : null}
                      <p className="text-[11px] text-slate-500">
                        المطالبة: {formatMoney(dispute.claimed_amount, currency)} · تاريخ التسجيل:{' '}
                        {dispute.created_at ? formatDateTime(dispute.created_at, getLocale()) || dispute.created_at : '—'}
                      </p>
                    </div>

                    {isPlatformAdmin && OPEN_STATUSES.includes(dispute.status) ? (
                      <button
                        onClick={() => {
                          setDeciding(dispute);
                          setDecision('RESOLVED_RELEASE');
                          setNotes('');
                        }}
                        className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 sm:w-auto"
                      >
                        <Scale className="w-3.5 h-3.5 shrink-0" />
                        <span>تسجيل قرار المنصة</span>
                      </button>
                    ) : null}
                  </div>

                  {!OPEN_STATUSES.includes(dispute.status) ? (
                    <div className="min-w-0 space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px]">
                      <div className="font-bold text-slate-800">
                        القرار المسجَّل: {STATUS_LABELS[dispute.status] ?? dispute.status}
                      </div>
                      <div className="text-slate-600">
                        {dispute.resolved_at && formatDateTime(dispute.resolved_at, getLocale())
                          ? `بتاريخ ${formatDateTime(dispute.resolved_at, getLocale())}`
                          : 'بتاريخ غير مسجَّل'}
                      </div>
                      {dispute.resolution_notes ? (
                        <p className="break-words leading-relaxed text-slate-600">المسببات: {dispute.resolution_notes}</p>
                      ) : null}
                      <p className="leading-relaxed text-slate-500">
                        الأثر على الصفقة: {dispute.deal ? dispute.deal.status : 'غير متاح'} — والمطالبة المسجَّلة {formatMoney(dispute.claimed_amount, currency)}
                        تبقى رواية صاحبها عن الخسارة، لا أمراً بالتنفيذ: لا تملك المنصة مالاً لتعيده.
                      </p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </PanelShell>

      {showOpenModal ? (
        <Sheet size="lg" title="فتح نزاع على صفقة" onClose={() => setShowOpenModal(false)}>
          <form onSubmit={fileDispute} className="space-y-3 text-xs">
            <label className="block min-w-0 space-y-1">
              <span className="font-bold text-slate-700">الصفقة</span>
              <select
                value={selectedDealId}
                onChange={(e) => setSelectedDealId(Number(e.target.value))}
                className="w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-2 focus:bg-white focus:outline-none"
              >
                <option value="">— اختر صفقة —</option>
                {deals.map((deal) => (
                  <option key={deal.id} value={deal.id}>
                    {deal.deal_number} · {formatMoney(deal.buyer_total_amount, deal.currency_code)} · {deal.status}
                  </option>
                ))}
              </select>
              {!deals.length ? (
                <span className="block text-[10px] text-slate-400">
                  لم تصل صفقات إلى هذه الشاشة بعد؛ لا يمكن فتح نزاع بلا صفقة مسجَّلة.
                </span>
              ) : null}
            </label>

            {/* A code list, not free text: `reason` is validated `in:Dispute::REASONS`,
                and a sentence typed into a field the server reads as an enum is a
                refusal arriving three seconds after the person did their work. */}
            <LabeledSelect
              label="سبب النزاع"
              value={reason}
              onChange={(value) => setReason(value as (typeof REASONS)[number]['value'] | '')}
              options={[
                { value: '', label: '— اختر سببًا —' },
                ...REASONS.map((item) => ({ value: item.value, label: item.label })),
              ]}
            />

            <label className="block min-w-0 space-y-1">
              <span className="font-bold text-slate-700">شرح المطالبة</span>
              <textarea
                rows={3}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="ما الذي وُجد مخالفًا، وبأي وثيقة أو تقرير استلام…"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 focus:bg-white focus:outline-none"
              />
            </label>

            <TextInput
              label="المبلغ المطالب به (بعملة الصفقة)"
              value={claimedAmount}
              onChange={setClaimedAmount}
              placeholder="0"
              wide
            />

            <label className="block min-w-0 space-y-1">
              <span className="font-bold text-slate-700">روابط الأدلة (اختياري، سطر لكل رابط)</span>
              <textarea
                rows={2}
                value={evidenceUrls}
                onChange={(e) => setEvidenceUrls(e.target.value)}
                placeholder="https://…"
                dir="ltr"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 focus:bg-white focus:outline-none"
              />
            </label>

            <ErrorNote text="الإرسال يسجّل المطالبة ويحوّل الصفقة إلى حالة نزاع لدى الطرفين. لا يوقف تحويل أموال ولا يمسّ أي حساب ضمان." />

            <SubmitRow onCancel={() => setShowOpenModal(false)} submitting={submitting} label="تسجيل النزاع" />
          </form>
        </Sheet>
      ) : null}

      {deciding ? (
        <Sheet size="lg" title={`قرار المنصة في ${deciding.dispute_number}`} onClose={() => setDeciding(null)}>
          <form onSubmit={ruleDispute} className="space-y-3 text-xs">
            <p className="min-w-0 text-[11px] leading-relaxed text-slate-500">
              المطالبة المسجَّلة: {formatMoney(deciding.claimed_amount, deciding.deal?.currency_code ?? null)} — والسبب: {deciding.reason}
            </p>

            <LabeledSelect
              label="القرار"
              value={decision}
              onChange={(value) => setDecision(value as (typeof DECISIONS)[number]['value'])}
              options={DECISIONS.map((item) => ({ value: item.value, label: item.label }))}
            />
            {/* What the chosen value does, in the console's own words about the
                two constants `disputes/{id}/resolve` accepts. Neither of them
                names an amount, because neither of them moves money. */}
            <p className="text-[10px] font-bold leading-relaxed text-slate-600">
              {DECISIONS.find((item) => item.value === decision)?.effect}
            </p>

            <label className="block min-w-0 space-y-1">
              <span className="font-bold text-slate-700">مسببات القرار (مطلوبة)</span>
              <textarea
                rows={3}
                required
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ما الذي بُني عليه القرار، وما الأدلة التي اعتُمدت…"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 focus:bg-white focus:outline-none"
              />
            </label>

            <ErrorNote text="القرار يُسجَّل باسم الحساب المتخذ له ويُنقل أثره إلى حالة الصفقة في سجل المنصة؛ وهو قرار داخلي لا نسبة إلى جهة تحكيم خارجية." />

            <SubmitRow onCancel={() => setDeciding(null)} submitting={submitting} label="اعتماد القرار" />
          </form>
        </Sheet>
      ) : null}
    </div>
  );
};

/**
 * A decision sheet's two buttons: the way back on the left of the thumb, the
 * commitment on the right, and both full-width on a phone.
 *
 * It is a `type="submit"` row rather than a callback because both sheets on this
 * screen are forms — the browser's own submit keeps the required fields, the
 * disabled state and the Enter key working without each form re-implementing them.
 */
const SubmitRow: React.FC<{ onCancel: () => void; submitting: boolean; label: string }> = ({
  onCancel,
  submitting,
  label,
}) => (
  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
    <button
      type="button"
      onClick={onCancel}
      className="flex-1 cursor-pointer rounded-xl bg-slate-100 py-2.5 font-semibold text-slate-700 hover:bg-slate-200"
    >
      إلغاء
    </button>
    <button
      type="submit"
      disabled={submitting}
      className="flex-1 cursor-pointer rounded-xl bg-slate-900 py-2.5 font-bold text-white hover:bg-slate-800 disabled:opacity-50"
    >
      {submitting ? 'جارٍ الإرسال…' : label}
    </button>
  </div>
);
