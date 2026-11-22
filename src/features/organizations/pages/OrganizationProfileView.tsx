import React, { useCallback, useEffect, useState } from 'react';
import { fieldError } from '@/core/api/http';
import { createOrganization, getOrganization, updateOrganization } from '@/features/organizations/api';
import type { Organization } from '@/features/organizations/types';
import { getLocale, formatDateTime, formatDate } from '@/core/i18n';
import { BannerView, DecisionButton, ErrorNote, Fact, PanelShell, TextInput, recorded } from '@/shared/ui/panel';
import type { Banner } from '@/shared/ui/panel';
import { IntegrationsPanel } from '@/features/platform/components/IntegrationsPanel';
import { OrganizationDocumentsPanel } from '@/features/organizations/components/OrganizationDocumentsPanel';
import { SELF_REGISTRATION_TYPES, organizationStatusLabel, organizationTypeLabel } from '@/features/organizations/review';
import { serverMessage } from '@/core/api/refusal';

/**
 * The business's own record: what the platform holds about it, what the
 * business may correct, and what happens when a legal identifier moves.
 *
 * The status line is the part most easily overstated. `verified` here means a
 * HASSAL reviewer accepted the numbers the business submitted; the platform
 * queries no registry, no tax authority and no chamber of commerce, so this
 * screen says "reviewed by the platform" and never "confirmed by the state".
 *
 * The write is scoped by two things the server checks and the screen mirrors:
 * the `organizations.manage` permission, and — inside that — the membership role,
 * where only an owner or an administrator may edit the profile.
 */

const OWNERSHIP_ROLES = ['owner', 'admin'];

interface OrganizationProfileViewProps {
  organizationId: number | null;
  organizationName: string | null;
  myRole: string | null;
  isSuperAdmin: boolean;
  can: (permission: string) => boolean;
  /**
   * Registering a second business changes the membership list the header
   * switcher offers, which only the server's `/auth/me` answer carries.
   */
  onSessionChanged?: () => void;
}

export const OrganizationProfileView: React.FC<OrganizationProfileViewProps> = ({
  organizationId,
  organizationName,
  myRole,
  isSuperAdmin,
  can,
  onSessionChanged,
}) => {
  const locale = getLocale();
  const [record, setRecord] = useState<Organization | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [tradeNameAr, setTradeNameAr] = useState('');
  const [tradeNameEn, setTradeNameEn] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [crNumber, setCrNumber] = useState('');
  const [vatNumber, setVatNumber] = useState('');

  const canEditProfile = isSuperAdmin || (can('organizations.manage') && OWNERSHIP_ROLES.includes(myRole ?? ''));

  const applyRecord = useCallback((org: Organization) => {
    setRecord(org);
    setNameAr(org.name_ar ?? '');
    setNameEn(org.name_en ?? '');
    setTradeNameAr(org.trade_name_ar ?? '');
    setTradeNameEn(org.trade_name_en ?? '');
    setCountryCode(org.country_code ?? '');
    setCity(org.city ?? '');
    setPhone(org.phone ?? '');
    setEmail(org.email ?? '');
    setWebsite(org.website ?? '');
    setCrNumber(org.commercial_registration_number ?? '');
    setVatNumber(org.vat_number ?? '');
  }, []);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setReadError(null);
    const result = await getOrganization(organizationId);
    if (result.success && result.data) applyRecord(result.data);
    else setReadError(serverMessage(result, 'لم تُقرأ المنشأة'));
  }, [applyRecord, organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const legalNumbersChanged =
    Boolean(record) &&
    ((crNumber || null) !== (record?.commercial_registration_number ?? null)
      || (vatNumber || null) !== (record?.vat_number ?? null));

  const save = async () => {
    if (!organizationId) return;
    setBusy(true);
    setBanner(null);
    setFieldErrors({});

    const result = await updateOrganization(organizationId, {
      name_ar: nameAr,
      name_en: nameEn,
      trade_name_ar: tradeNameAr || null,
      trade_name_en: tradeNameEn || null,
      country_code: countryCode || null,
      city: city || null,
      phone: phone || null,
      email: email || null,
      website: website || null,
      commercial_registration_number: crNumber || null,
      vat_number: vatNumber || null,
    });

    setBusy(false);

    if (!result.success) {
      const mapped: Record<string, string> = {};
      for (const key of ['name_ar', 'name_en', 'country_code', 'city', 'phone', 'email', 'website',
        'commercial_registration_number', 'vat_number']) {
        const message = fieldError(result, key);
        if (message) mapped[key] = message;
      }
      setFieldErrors(mapped);
      setBanner({ kind: 'error', text: serverMessage(result, 'رفض الخادم الطلب') });
      return;
    }

    setBanner({ kind: 'ok', text: serverMessage(result, 'حُفظ ملف المنشأة') });
    if (result.data) applyRecord(result.data);
  };

  /**
   * A session with no organization is not an error state — it is where every
   * account starts now that registration creates a person and not a business.
   * The screen used to answer it with "choose your organization from the top of
   * the screen", which is a dead end for someone who has none: this is the only
   * door through which a business is created.
   */
  if (!organizationId) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-hassal-line dark:bg-hassal-surface">
          <h2 className="text-base font-black text-slate-900 dark:text-slate-50">
            {locale === 'en' ? 'Register your organization' : 'سجّل منشأتك'}
          </h2>
          <p className="pt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {locale === 'en'
              ? 'The business is a record of its own: its name, its type, and the legal numbers this platform requires. Until a reviewer accepts its documents it stays pending and cannot trade.'
              : 'المنشأة سجل مستقل: اسمها ونوعها وأرقامها القانونية التي تطلبها إعدادات المنصة. تبقى بانتظار مراجعة المنصة ولا تتداول حتى تُقبل وثائقها.'}
          </p>
        </div>
        <RegisterOrganizationPanel first onCreated={() => onSessionChanged?.()} />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-black text-slate-900">
          {locale === 'en' ? 'Organization record' : 'ملف المنشأة والسجل'}
        </h2>
        <p className="text-xs leading-relaxed text-slate-500 pt-0.5">
          {organizationName ?? record?.name_ar ?? ''} — ما تقرأه هذه الشاشة هو ما تحفظه المنصة عن منشأتك، وما تُصلحه
          هنا يُكتب إليها.
        </p>
      </div>

      {readError ? <ErrorNote text={`لم يُقرأ ملف المنشأة: ${readError}`} /> : null}

      <PanelShell
        title="ما سجّلته المنصة عن منشأتك"
        hint="الحالة قرار داخلي: «معتمدة» تعني أن مراجعاً في منصة حصّال قرأ ما رُفع إليه وقَبِله، ولا تعني أن جهة رسمية تحققت من رقم."
      >
        {record ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Fact label="رقم السجل التجاري" value={recorded(record.commercial_registration_number)} />
            <Fact label="رقم التعريف الضريبي" value={recorded(record.vat_number)} />
            <Fact label="حالة المنشأة" value={organizationStatusLabel(record.status)} />
            <Fact
              label="تاريخ مراجعة المنصة"
              value={record.kyc_verified_at ? formatDate(record.kyc_verified_at, locale) : recorded(null)}
            />
            <Fact label="العضو العامل" value={String(record.members_count ?? 0)} />
            <Fact label="نوع النشاط" value={organizationTypeLabel(record.type, locale)} />
            <Fact label="تاريخ التأسيس في المنصة" value={record.created_at ? formatDateTime(record.created_at, locale) : recorded(null)} />
            <Fact label="الحد الائتماني" value={recorded(String(record.credit_limit ?? ''))} />
            <Fact label="التقييم" value={record.rating === null || record.rating === undefined ? recorded(null) : String(record.rating)} />
          </div>
        ) : (
          <div className="text-xs text-slate-500">جارٍ قراءة الملف…</div>
        )}
      </PanelShell>

      <PanelShell
        title="تصحيح الملف"
        hint="الاسم التجاري والموقع ووسائل التواصل أحرارك في تصحيحها. أما رقم السجل أو الرقم الضريبي فقرار المنصة عنهما يسقط عند تغييرهما حتى يُراجعا من جديد."
      >
        <BannerView banner={banner} />

        {!canEditProfile ? (
          <ErrorNote text="تعديل ملف المنشأة للمالك أو مدير المنشأة فقط؛ الخادم يرفض هذا الحفظ لدورك الحالي." />
        ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextInput
              label="الاسم التجاري (عربي)"
              value={nameAr}
              onChange={setNameAr}
              wide
              error={fieldErrors.name_ar}
            />
            <TextInput
              label="الاسم التجاري (إنجليزي)"
              value={nameEn}
              onChange={setNameEn}
              wide
              error={fieldErrors.name_en}
            />
            <TextInput label="اسم الشهرة (عربي)" value={tradeNameAr} onChange={setTradeNameAr} wide />
            <TextInput label="اسم الشهرة (إنجليزي)" value={tradeNameEn} onChange={setTradeNameEn} wide />
            <TextInput
              label="رمز الدولة (حرفان)"
              value={countryCode}
              onChange={setCountryCode}
              placeholder="YE"
              wide
              error={fieldErrors.country_code}
            />
            <TextInput label="المدينة" value={city} onChange={setCity} wide error={fieldErrors.city} />
            <TextInput label="الهاتف" value={phone} onChange={setPhone} wide error={fieldErrors.phone} />
            <TextInput
              label="البريد التجاري"
              value={email}
              onChange={setEmail}
              wide
              type="email"
              error={fieldErrors.email}
            />
            <TextInput
              label="الموقع الإلكتروني"
              value={website}
              onChange={setWebsite}
              wide
              placeholder="https://"
              error={fieldErrors.website}
            />
          </div>

          {/* The two numbers the platform's own decision rests on, kept apart from
              the free fields so a correction here is never made by accident. */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="text-[11px] font-black text-slate-700">الرقمان القانونيان</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextInput
                label="رقم السجل التجاري"
                value={crNumber}
                onChange={setCrNumber}
                wide
                error={fieldErrors.commercial_registration_number}
              />
              <TextInput
                label="رقم التعريف الضريبي"
                value={vatNumber}
                onChange={setVatNumber}
                wide
                error={fieldErrors.vat_number}
              />
            </div>
            {legalNumbersChanged && record?.status === 'verified' ? (
              <ErrorNote text="تغيير أحد الرقمين القانونيين يعيد منشأتك إلى قائمة المراجعة ويلغي تاريخ المراجعة الحالي." />
            ) : null}
          </div>

          {/* Every refusal the server returns for a field is printed under that
              field; anything it refuses outside them is in the banner above. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[10px] leading-relaxed text-slate-500">
              الحفظ يُرسل كل الحقول أعلاه دفعة واحدة؛ ما لا تغيّره يُرسل كما قرأته هذه الشاشة.
            </p>
            <DecisionButton tone="primary" busy={busy} onClick={() => void save()}>
              حفظ الملف
            </DecisionButton>
          </div>
        </div>
        )}
      </PanelShell>

      {/* Filing is the way out of `pending_kyc`, so this panel is never hidden
          behind the organization's own status. */}
      <OrganizationDocumentsPanel
        organizationId={organizationId}
        organizationStatus={record?.status ?? ''}
        can={can}
        isSuperAdmin={isSuperAdmin}
      />

      {can('api.manage') ? <IntegrationsPanel can={can} /> : null}

      <RegisterOrganizationPanel onCreated={() => onSessionChanged?.()} />
    </div>
  );
};

/* ─────────────────────── registering another business ────────────────────── */

/**
 * A second business for the same person.
 *
 * The route carries only the idempotency middleware — no permission — because
 * creating a business you will own is not an administrative act. What the
 * server does decide is which organization types you may give yourself: `admin`
 * and `intermediary` are reserved for the platform, and self-service is buyer
 * or seller. Any new record starts as `pending_kyc` whatever it contains.
 */
const RegisterOrganizationPanel: React.FC<{ onCreated: () => void; first?: boolean }> = ({
  onCreated,
  first = false,
}) => {
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [type, setType] = useState('buyer');
  const [crNumber, setCrNumber] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    setBanner(null);

    const result = await createOrganization({
      name_ar: nameAr,
      name_en: nameEn,
      type,
      commercial_registration_number: crNumber || undefined,
      vat_number: vatNumber || undefined,
    });

    setBusy(false);

    if (!result.success) {
      setBanner({
        kind: 'error',
        text:
          fieldError(result, 'name_ar')
          ?? fieldError(result, 'name_en')
          ?? fieldError(result, 'type')
          ?? fieldError(result, 'commercial_registration_number')
          ?? fieldError(result, 'vat_number')
          ?? serverMessage(result, 'رفض الخادم الطلب'),
      });
      return;
    }

    setBanner({
      kind: 'ok',
      text: first
        ? 'تم تسجيل منشأتك وهي بانتظار مراجعة المنصة. اخترها من أعلى الشاشة لتعمل بها، وارفع وثائقها من هذه الشاشة.'
        : 'تم تسجيل المنشأة وهي في انتظار مراجعة المنصة. اخترها من مبدّل المنشآت أعلى الشاشة لتعمل بها؛ هذه الشاشة تعرض ملف المنشأة التي كنت تعمل عليها.',
    });
    setNameAr('');
    setNameEn('');
    setCrNumber('');
    setVatNumber('');
    onCreated();
  };

  return (
    <PanelShell
      title={first ? 'تسجيل منشأتك الأولى' : 'تسجيل منشأة أخرى بهذا الحساب'}
      hint="الرقمان القانونيان لا يلزمهما إلا ما تطلبه إعدادات المنصة؛ إن طلبهما الخادم يظهر رفضه على الحقل نفسه. اتركهما فارغين فيُحفظان كـ«لم يُقدَّم»، ولا تخترع المنصة رقماً عنك."
    >
      <BannerView banner={banner} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextInput label="الاسم التجاري (عربي)" value={nameAr} onChange={setNameAr} wide />
        <TextInput label="الاسم التجاري (إنجليزي)" value={nameEn} onChange={setNameEn} wide />
        {/* Two self-service choices read better as two big buttons than as a
            picker the operator has to open to find out what the other one is. The
            pair comes from `SELF_REGISTRATION_TYPES`, which is the same four values
            the console filters on minus the two a registrant cannot grant itself. */}
        <div className="min-w-0 space-y-1 sm:col-span-2">
          <span className="block text-[11px] font-bold text-slate-600">نوع النشاط</span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SELF_REGISTRATION_TYPES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setType(option.value)}
                aria-pressed={type === option.value}
                className={`cursor-pointer rounded-lg border px-3 py-2 text-xs font-bold ${
                  type === option.value
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <span className="block text-[10px] leading-relaxed text-slate-400">
            نوع «الوسيط» و«إدارة المنصة» لا يمنحهما الحساب لنفسه: هذان للمنفذ من أدوار المنصة فقط.
          </span>
        </div>
        <TextInput label="رقم السجل التجاري" value={crNumber} onChange={setCrNumber} wide />
        <TextInput label="رقم التعريف الضريبي" value={vatNumber} onChange={setVatNumber} wide />
      </div>
      <p className="text-[10px] leading-relaxed text-slate-500">
        يبقى الحساب مالكًا للمنشأة الجديدة، وتبدأ «بانتظار المراجعة» مهما حملت من أرقام.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-[10px] text-slate-400">التسجيل يكتب سجلًا جديدًا لدى المنصة ولا ينشر شيئًا في السوق.</span>
        <DecisionButton tone="primary" busy={busy} onClick={() => void create()}>
          تسجيل المنشأة
        </DecisionButton>
      </div>
    </PanelShell>
  );
};
