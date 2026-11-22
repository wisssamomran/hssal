export type Locale = 'ar' | 'en';

export const LOCALE_KEY = 'hassal_locale';

export const translations = {
  ar: {
    language: 'العربية',
    switchLanguage: 'English',
    login: 'تسجيل الدخول',
    register: 'إنشاء حساب',
    logout: 'تسجيل الخروج',
    notifications: 'الإشعارات',
    noNotifications: 'لا توجد إشعارات',
    markAllRead: 'قراءة الكل',
    marketplace: 'سوق الفرص والمخزون',
    deals: 'الصفقات وطلبات الشراء',
    seller: 'إدارة العروض والمستودعات',
    demands: 'طلبات الاحتياج (RFQ)',
    maps: 'خريطة المستودعات واللوجستيات',
    members: 'عضوية المنشأة',
    catalog: 'كتالوج الأصناف',
    orgProfile: 'ملف المنشأة والسجل',
    profile: 'ملفي الشخصي',
    ledger: 'دفتر الأستاذ والقيود',
    disputes: 'النزاعات والتحكيم',
    admin: 'لوحة قرارات المنصة',
    config: 'إعدادات المنصة والقدرات',
    activeUser: 'مستخدم مسجّل',
    guest: 'غير مسجل',
    commercialContext: 'المنظور التجاري:',
    sessionOrganization: 'سياق المنظمة من الجلسة',
    currencyPrefix: 'العملة الأساسية:',
    notConfigured: 'غير مهيّأة',
    reset: 'تحديث',
    loading: 'جارٍ التحميل...',
    mapTitle: 'خريطة المستودعات واللوجستيات',
    mapDescription: 'مواقع المستودعات ومراكز التوزيع المسجلة في المنصة.',
    locations: 'المواقع',
  },
  en: {
    language: 'English',
    switchLanguage: 'العربية',
    login: 'Sign in',
    register: 'Create account',
    logout: 'Sign out',
    notifications: 'Notifications',
    noNotifications: 'No notifications',
    markAllRead: 'Mark all read',
    marketplace: 'Marketplace',
    deals: 'Deals & purchase requests',
    seller: 'Offers & warehouses',
    demands: 'Demand board (RFQ)',
    maps: 'Warehouse logistics map',
    members: 'Organization members',
    catalog: 'Product catalog',
    orgProfile: 'Organization & legal record',
    profile: 'My profile',
    ledger: 'Ledger & journal entries',
    disputes: 'Disputes & arbitration',
    admin: 'Platform decisions',
    config: 'Platform settings & capabilities',
    activeUser: 'Signed in',
    guest: 'Guest',
    commercialContext: 'Business context:',
    sessionOrganization: 'Organization session context',
    currencyPrefix: 'Base currency:',
    notConfigured: 'not configured',
    reset: 'Refresh',
    loading: 'Loading...',
    mapTitle: 'Warehouse logistics map',
    mapDescription: 'Registered warehouses and distribution centers on the platform.',
    locations: 'Locations',
  },
} as const;

export type TranslationKey = keyof typeof translations.ar;

export function getLocale(): Locale {
  if (typeof window === 'undefined') return 'ar';
  try {
    return window.localStorage.getItem(LOCALE_KEY) === 'en' ? 'en' : 'ar';
  } catch {
    return 'ar';
  }
}

export function localizedField<T extends object>(item: T, field: string, locale: Locale): string {
  const columns = item as Record<string, unknown>;
  const localized = columns[`${field}_${locale}`] ?? columns[`${field}_ar`] ?? columns[`${field}_en`];
  return typeof localized === 'string' ? localized : '';
}

function parseRecorded(value: string | null | undefined): { date: Date; dateOnly: boolean } | null {
  if (!value) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? null : { date, dateOnly };
}

/** The business day itself, without a clock — for expiry dates and due days. */
export function formatDate(value: string | null | undefined, locale: Locale): string {
  const parsed = parseRecorded(value);
  if (!parsed) return '';
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
    calendar: 'gregory',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(parsed.date);
}

/**
 * A recorded moment, readable.
 *
 * Dates arrive from the API in two shapes and they must not be confused: a
 * date-only value (`2027-07-15`, a business day such as an expiry date) and a
 * timestamp (`2027-07-15T21:00:00.000000Z`, an instant such as the end of a
 * hold). The first is shown as a day; the second carries its time, because the
 * countdown *is* the information.
 *
 * The calendar is pinned to Gregorian on purpose: browsers resolve plain `ar`
 * to an Islamic calendar for some regional variants, which would silently
 * rewrite a date the platform stored as a Gregorian one.
 *
 * Returns '' when nothing was recorded or the value cannot be parsed — the
 * caller then shows its own "غير مسجّل" wording rather than a fabricated day.
 */
export function formatDateTime(value: string | null | undefined, locale: Locale): string {
  const parsed = parseRecorded(value);
  if (!parsed) return '';

  const options: Intl.DateTimeFormatOptions = {
    calendar: 'gregory',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...(parsed.dateOnly ? {} : { hour: '2-digit', minute: '2-digit' }),
  };

  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', options).format(parsed.date);
}

/**
 * A counted thing, in the number of words Arabic requires.
 *
 * `${n} يوماً` is wrong at three of its four readings: one takes the noun alone, two
 * takes the dual, three through ten take the plural genitive (`٣ أيام`), and only
 * eleven and up take the singular accusative (`١١ يوماً`). The template form is what
 * makes a screen read like a translation of itself, and this is an Arabic-first
 * product — so the four shapes are named here and each caller supplies its own words.
 *
 * `one` and `two` are returned unchanged, without the digit, because the word carries
 * the count. Numbers are rendered as ASCII digits: the platform's money and dates
 * already print that way, and a card mixing `٣ أيام` with `12,000.00` is worse than
 * either one on its own.
 */
export function arabicCount(n: number, forms: { one: string; two: string; few: string; many: string }): string {
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  if (n >= 3 && n <= 10) return `${n} ${forms.few}`;
  return `${n} ${forms.many}`;
}
