import React, { useEffect, useState } from 'react';
import { fieldError } from '@/core/api/http';
import type { ApiResult } from '@/core/api/http';
import { getSetupStatus, saveSetupConfiguration } from '@/features/platform/api';
import { activeCurrencies } from '@/core/config';
import { BannerView, DecisionButton, ErrorNote, LabeledSelect, PanelShell, TextInput } from '@/shared/ui/panel';
import type { Banner } from '@/shared/ui/panel';

/**
 * The first-run commercial configuration, in one form.
 *
 * This writes the same keys the settings panel writes, through the endpoint the
 * installer uses. It exists because the alternative is an operator running
 * `app:install-system` and hoping they guessed every value: here the platform
 * answers with what it currently holds (`GET /setup-wizard/status`) and the
 * operator corrects it, so the screen cannot show a number the server does not
 * have.
 *
 * Two things are deliberately not offered. The base currency is chosen from the
 * registry the platform already has, because inventing a code here would make
 * every formatted price a code with no rate and no decimals behind it — the
 * server refuses that with `CURRENCY_NOT_DEFINED`. And no legal field here
 * claims a check against a register: the two switches say only whether a
 * business must supply a number to this platform.
 */

interface SetupStatus {
  is_installed?: boolean;
  identity?: {
    name_ar?: string | null;
    name_en?: string | null;
    default_locale?: string | null;
    country?: string | null;
    default_city?: string | null;
    timezone?: string | null;
  };
  base_currency?: string | null;
  tax?: { enabled?: boolean; name?: string | null; rate?: number; inclusive?: boolean };
  commission_rate?: number;
  operations?: {
    reservation_timeout_minutes?: number;
    inspection_window_hours?: number;
    offer_requires_review?: boolean;
  };
  legal_requirements?: { require_commercial_registration?: boolean; require_vat_number?: boolean };
}

const BOOL = [
  { value: 'true', label: 'نعم' },
  { value: 'false', label: 'لا' },
];

export const SetupWizardPanel: React.FC = () => {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [localeValue, setLocaleValue] = useState('ar');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [timezone, setTimezone] = useState('');
  const [currency, setCurrency] = useState('');
  const [taxEnabled, setTaxEnabled] = useState('false');
  const [taxName, setTaxName] = useState('');
  const [taxRate, setTaxRate] = useState('0');
  const [taxInclusive, setTaxInclusive] = useState('false');
  const [commissionRate, setCommissionRate] = useState('0');
  const [reservationMinutes, setReservationMinutes] = useState('30');
  const [inspectionHours, setInspectionHours] = useState('48');
  const [offerReview, setOfferReview] = useState('false');
  const [requireCr, setRequireCr] = useState('false');
  const [requireVat, setRequireVat] = useState('false');

  const fill = (payload: SetupStatus) => {
    setNameAr(payload.identity?.name_ar ?? '');
    setNameEn(payload.identity?.name_en ?? '');
    setLocaleValue(payload.identity?.default_locale ?? 'ar');
    setCountry(payload.identity?.country ?? '');
    setCity(payload.identity?.default_city ?? '');
    setTimezone(payload.identity?.timezone ?? '');
    setCurrency(payload.base_currency ?? '');
    setTaxEnabled(String(Boolean(payload.tax?.enabled)));
    setTaxName(payload.tax?.name ?? '');
    setTaxRate(String(payload.tax?.rate ?? 0));
    setTaxInclusive(String(Boolean(payload.tax?.inclusive)));
    setCommissionRate(String(payload.commission_rate ?? 0));
    setReservationMinutes(String(payload.operations?.reservation_timeout_minutes ?? 30));
    setInspectionHours(String(payload.operations?.inspection_window_hours ?? 48));
    setOfferReview(String(Boolean(payload.operations?.offer_requires_review)));
    setRequireCr(String(Boolean(payload.legal_requirements?.require_commercial_registration)));
    setRequireVat(String(Boolean(payload.legal_requirements?.require_vat_number)));
  };

  const load = async () => {
    setReadError(null);
    const result: ApiResult<SetupStatus> = await getSetupStatus();
    if (result.success && result.data) {
      setStatus(result.data);
      fill(result.data);
      return;
    }
    setReadError(result.error?.message ?? result.message ?? 'لم تُقرأ حالة الإعداد الأولي');
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    setBusy(true);
    setBanner(null);
    setFieldErrors({});

    const result = await saveSetupConfiguration({
      platform_name_ar: nameAr,
      platform_name_en: nameEn,
      default_locale: localeValue,
      country_code: country || undefined,
      default_city: city || null,
      timezone: timezone || undefined,
      default_currency: currency,
      tax_enabled: taxEnabled === 'true',
      tax_name: taxName,
      tax_rate: Number(taxRate) || 0,
      tax_inclusive: taxInclusive === 'true',
      commission_rate: Number(commissionRate) || 0,
      reservation_timeout_minutes: Number(reservationMinutes) || 30,
      inspection_window_hours: Number(inspectionHours) || 48,
      require_offer_moderation: offerReview === 'true',
      require_commercial_registration: requireCr === 'true',
      require_vat_number: requireVat === 'true',
    });

    setBusy(false);

    if (!result.success) {
      const mapped: Record<string, string> = {};
      for (const key of [
        'platform_name_ar', 'platform_name_en', 'default_locale', 'default_currency', 'tax_name',
        'tax_rate', 'commission_rate', 'reservation_timeout_minutes', 'inspection_window_hours', 'country_code',
      ]) {
        const message = fieldError(result, key);
        if (message) mapped[key] = message;
      }
      setFieldErrors(mapped);
      setBanner({ kind: 'error', text: result.error?.message ?? result.message ?? 'لم يُحفظ' });
      return;
    }

    if (result.data) {
      setStatus(result.data as SetupStatus);
      fill(result.data as SetupStatus);
    }
    setBanner({ kind: 'ok', text: result.message ?? 'تم حفظ إعدادات المنصة' });
  };

  if (readError) {
    return <ErrorNote text={`لم تُقرأ حالة الإعداد الأولي من الخادم: ${readError}`} />;
  }

  if (!status) {
    return <div className="text-xs text-slate-500">جارٍ قراءة ما تسجّله المنصة حالياً…</div>;
  }

  const currencies = activeCurrencies();

  return (
    <div className="space-y-4">
      <BannerView banner={banner} />
      {!status.is_installed ? (
        <ErrorNote text="لم تُعلَّم هذه التهيئة كمُثبَّتة بعد (platform.installed). الحفظ هنا يُثبّت الإعدادات ويضع علامة التثبيت." />
      ) : null}

      <PanelShell title="هوية المنصة" hint="الأسماء واللغة والموقع الذي تبدأ منه المنصة. لا مدينة افتراضية: ما لم يُكتب يبقى فارغاً.">
        <div className="flex flex-wrap gap-3">
          <TextInput label="اسم المنصة (عربي)" value={nameAr} onChange={setNameAr} wide />
          <TextInput label="اسم المنصة (إنجليزي)" value={nameEn} onChange={setNameEn} wide />
          <LabeledSelect
            label="اللغة الافتراضية"
            value={localeValue}
            onChange={setLocaleValue}
            options={[{ value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }]}
          />
          <TextInput label="رمز الدولة (حرفان)" value={country} onChange={setCountry} placeholder="YE" />
          <TextInput label="مدينة الانطلاق" value={city} onChange={setCity} placeholder="عدن" />
          <TextInput label="المنطقة الزمنية" value={timezone} onChange={setTimezone} placeholder="Aden" />
        </div>
        {fieldErrors.platform_name_ar ? <ErrorNote text={fieldErrors.platform_name_ar} /> : null}
        {fieldErrors.platform_name_en ? <ErrorNote text={fieldErrors.platform_name_en} /> : null}
        {fieldErrors.country_code ? <ErrorNote text={fieldErrors.country_code} /> : null}
      </PanelShell>

      <PanelShell title="العملة الأساسية" hint="تُختار من سجل العملات الذي أنشأته الإدارة؛ إضافة عملة جديدة تتم من تبويب سجل العملات لا من هنا.">
        {currencies.length ? (
          <LabeledSelect
            label="العملة التي تُعرض بها الأسعار"
            value={currency}
            onChange={setCurrency}
            options={currencies.map((item) => ({
              value: item.iso_code,
              label: `${item.name_ar ?? item.iso_code} (${item.iso_code})`,
            }))}
          />
        ) : (
          <ErrorNote text="لا عملة مفعّلة في السجل بعد. أضفها من تبويب سجل العملات أولاً؛ الخادم يرفض اختيار عملة غير معروفة (CURRENCY_NOT_DEFINED)." />
        )}
        {fieldErrors.default_currency ? <ErrorNote text={fieldErrors.default_currency} /> : null}
      </PanelShell>

      <PanelShell title="الضريبة والعمولة" hint="النسب تُكتب ككسر: 0.05 يعني 5٪. احتساب الضريبة معطّل افتراضياً، وعمولة غير مضبوطة تعني صفراً لا رقماً افتراضياً.">
        <div className="flex flex-wrap gap-3 items-end">
          <LabeledSelect label="احتساب الضريبة" value={taxEnabled} onChange={setTaxEnabled} options={BOOL} />
          <TextInput label="اسم الضريبة" value={taxName} onChange={setTaxName} placeholder="ضريبة القيمة المضافة" />
          <TextInput label="نسبتها (0–1)" value={taxRate} onChange={setTaxRate} />
          <LabeledSelect label="مشمولة في السعر المعروض؟" value={taxInclusive} onChange={setTaxInclusive} options={BOOL} />
          <TextInput label="عمولة المنصة (0–0.5)" value={commissionRate} onChange={setCommissionRate} />
        </div>
        {fieldErrors.tax_name ? <ErrorNote text={fieldErrors.tax_name} /> : null}
        {fieldErrors.tax_rate ? <ErrorNote text={fieldErrors.tax_rate} /> : null}
        {fieldErrors.commission_rate ? <ErrorNote text={fieldErrors.commission_rate} /> : null}
      </PanelShell>

      <PanelShell title="تشغيل الصفقات" hint="نافذة الحجز وساعة الفحص ومراجعة العروض: كلها أرقام تقرأها الخدمات فعلياً عند كل حجز وعرض.">
        <div className="flex flex-wrap gap-3 items-end">
          <TextInput label="نافذة الحجز (دقائق، 5–1440)" value={reservationMinutes} onChange={setReservationMinutes} />
          <TextInput label="مدة الفحص (ساعات، 12–168)" value={inspectionHours} onChange={setInspectionHours} />
          <LabeledSelect label="هل يُراجع كل عرض قبل النشر؟" value={offerReview} onChange={setOfferReview} options={BOOL} />
        </div>
        {fieldErrors.reservation_timeout_minutes ? <ErrorNote text={fieldErrors.reservation_timeout_minutes} /> : null}
        {fieldErrors.inspection_window_hours ? <ErrorNote text={fieldErrors.inspection_window_hours} /> : null}
      </PanelShell>

      <PanelShell title="المتطلبات القانونية للتسجيل" hint="هذان مفتاحان لما تطلبه هذه المنصة من المنشأة، لا لما تحققه جهة رسمية. المطالبة برقم لا تعني أنه فُحص.">
        <div className="flex flex-wrap gap-3 items-end">
          <LabeledSelect label="رقم السجل التجاري إلزامي؟" value={requireCr} onChange={setRequireCr} options={BOOL} />
          <LabeledSelect label="رقم التعريف الضريبي إلزامي؟" value={requireVat} onChange={setRequireVat} options={BOOL} />
        </div>
      </PanelShell>

      <DecisionButton tone="primary" busy={busy} onClick={() => void save()}>
        حفظ الإعداد الأولي
      </DecisionButton>
    </div>
  );
};
