import { Router, Request, Response } from 'express';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Envelope Helpers (matching App\Http\Responses\ApiResponse)
// ---------------------------------------------------------------------------

function makeMeta(extra: Record<string, unknown> = {}) {
  return {
    timestamp: new Date().toISOString(),
    correlation_id: crypto.randomUUID(),
    ...extra,
  };
}

function ok<T>(res: Response, data: T, message = 'OK', extraMeta: Record<string, unknown> = {}, status = 200) {
  return res.status(status).json({
    success: true,
    message,
    data,
    meta: makeMeta(extraMeta),
  });
}

function paginated<T>(
  res: Response,
  items: T[],
  pageInput: unknown = 1,
  perPageInput: unknown = 15,
  message = 'OK'
) {
  const page = Math.max(1, Number(pageInput) || 1);
  const perPage = Math.max(1, Math.min(100, Number(perPageInput) || 15));
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const start = (page - 1) * perPage;
  const slice = items.slice(start, start + perPage);

  return res.status(200).json({
    success: true,
    message,
    data: slice,
    pagination: {
      current_page: page,
      per_page: perPage,
      total_items: totalItems,
      total_pages: totalPages,
      has_more: page < totalPages,
    },
    meta: makeMeta(),
  });
}

function fail(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>
) {
  return res.status(status).json({
    success: false,
    error_code: code,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
    meta: makeMeta(),
  });
}

// ---------------------------------------------------------------------------
// RBAC & Catalog Reference Data (matching backend/config/rbac.php & Catalogs)
// ---------------------------------------------------------------------------

const MEMBERSHIP_ROLES = [
  { value: 'owner', label: 'مالك المنشأة' },
  { value: 'admin', label: 'مدير المنشأة' },
  { value: 'staff', label: 'موظف' },
  { value: 'finance', label: 'المالية' },
  { value: 'auditor', label: 'مدقق داخلي' },
];

const MEMBERSHIP_PERMISSIONS: Record<string, string[]> = {
  owner: [
    'offers.view', 'offers.create', 'offers.update', 'offers.delete',
    'offers.publish', 'offers.cancel', 'offers.like', 'comments.create',
    'catalog.manage', 'demands.view', 'demands.create', 'demands.quote',
    'requests.view', 'requests.create', 'requests.update', 'requests.cancel',
    'requests.approve', 'requests.reject',
    'deals.view', 'deals.create', 'deals.confirm', 'deals.dispatch',
    'deals.deliver', 'deals.dispute',
    'warehouses.view', 'warehouses.manage', 'disputes.open',
    'organizations.manage', 'members.manage', 'notifications.view',
    'reports.view', 'audit.view', 'ledger.view', 'api.manage',
  ],
  admin: [
    'offers.view', 'offers.create', 'offers.update', 'offers.delete',
    'offers.publish', 'offers.cancel', 'offers.like', 'comments.create',
    'catalog.manage', 'demands.view', 'demands.create', 'demands.quote',
    'requests.view', 'requests.create', 'requests.update', 'requests.cancel',
    'requests.approve', 'requests.reject',
    'deals.view', 'deals.create', 'deals.confirm', 'deals.dispatch',
    'deals.deliver', 'deals.dispute',
    'warehouses.view', 'warehouses.manage', 'disputes.open',
    'organizations.manage', 'members.manage', 'notifications.view',
    'reports.view', 'audit.view', 'ledger.view',
  ],
  staff: [
    'offers.view', 'offers.create', 'offers.update', 'offers.publish',
    'offers.like', 'comments.create', 'catalog.manage',
    'demands.view', 'demands.create',
    'requests.view', 'requests.create', 'requests.update', 'requests.cancel', 'requests.approve',
    'deals.view', 'deals.dispatch', 'deals.deliver', 'deals.dispute',
    'warehouses.view', 'warehouses.manage', 'disputes.open', 'notifications.view',
  ],
  finance: [
    'offers.view', 'demands.view', 'requests.view',
    'deals.view', 'deals.confirm', 'deals.dispute', 'disputes.open',
    'reports.view', 'audit.view', 'ledger.view', 'notifications.view',
    'comments.create', 'offers.like',
  ],
  auditor: [
    'offers.view', 'demands.view', 'requests.view', 'deals.view',
    'warehouses.view', 'reports.view', 'audit.view', 'ledger.view', 'notifications.view',
  ],
};

const PLATFORM_ROLES = [
  { id: 1, name: 'SuperAdmin', permissions: ['*'] },
  {
    id: 2,
    name: 'Auditor',
    permissions: [
      'offers.view', 'demands.view', 'requests.view', 'deals.view',
      'warehouses.view', 'audit.view', 'reports.view',
    ],
  },
];

const OPPORTUNITY_REASONS = [
  { code: 'SURPLUS_STOCK', label_ar: 'مخزون راكد وفائض', label_en: 'Surplus Stock' },
  { code: 'SLOW_MOVING', label_ar: 'بطء في دوران المخزون', label_en: 'Slow Moving' },
  { code: 'SEASONAL_STOCK', label_ar: 'فائض موسمي', label_en: 'Seasonal Stock' },
  { code: 'EXCESS_INVENTORY', label_ar: 'فائض توريد', label_en: 'Excess Inventory' },
  { code: 'LIQUIDATION', label_ar: 'تصفية مخزون', label_en: 'Liquidation' },
  { code: 'BRANCH_CLOSURE', label_ar: 'إغلاق فرع أو مستودع', label_en: 'Branch Closure' },
  { code: 'ASSORTMENT_CHANGE', label_ar: 'تغيير تشكيلة الأصناف', label_en: 'Assortment Change' },
  { code: 'LOW_LOCAL_DEMAND', label_ar: 'انخفاض الطلب المحلي', label_en: 'Low Local Demand' },
];

// ---------------------------------------------------------------------------
// QR Grid Generator (deterministic 21x21 module matrix for DealHandover)
// ---------------------------------------------------------------------------

function generateQrSymbol(payload: string) {
  const size = 21;
  const grid: string[][] = Array.from({ length: size }, () => Array(size).fill('0'));

  const drawFinder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const border = r === 0 || r === 6 || c === 0 || c === 6;
        const inner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[r0 + r][c0 + c] = border || inner ? '1' : '0';
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  const hash = crypto.createHash('sha256').update(payload).digest();
  let bitIdx = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const inFinder =
        (r < 8 && c < 8) ||
        (r < 8 && c >= size - 8) ||
        (r >= size - 8 && c < 8);
      if (inFinder) continue;
      if (r === 6 || c === 6) {
        grid[r][c] = (r + c) % 2 === 0 ? '1' : '0';
        continue;
      }
      const byteVal = hash[bitIdx % hash.length];
      const bit = (byteVal >> (bitIdx % 8)) & 1;
      grid[r][c] = bit ? '1' : '0';
      bitIdx++;
    }
  }

  return {
    payload,
    version: 1,
    size,
    mask: 0,
    ec_level: 'M',
    quiet_zone: 2,
    rows: grid.map((row) => row.join('')),
  };
}

function qrSymbolToSvg(qr: ReturnType<typeof generateQrSymbol>): string {
  const qz = qr.quiet_zone || 2;
  const total = qr.size + qz * 2;
  const rects: string[] = [];
  qr.rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] === '1') {
        rects.push(`<rect x="${c + qz}" y="${r + qz}" width="1" height="1" fill="#0f172a"/>`);
      }
    }
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="240" height="240" shape-rendering="crispEdges">
  <rect width="${total}" height="${total}" fill="#ffffff"/>
  ${rects.join('\n  ')}
</svg>`;
}

// ---------------------------------------------------------------------------
// In-Memory State Store
// ---------------------------------------------------------------------------

interface UserRecord {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  national_id: string | null;
  passwordHash: string;
  status: 'active' | 'suspended' | 'inactive';
  roles: string[];
  preferences: Record<string, unknown>;
  created_at: string;
}

interface TokenRecord {
  token: string;
  userId: number;
  deviceId: number;
  createdAt: string;
}

interface DeviceRecord {
  id: number;
  userId: number;
  device_key: string;
  name: string;
  platform: 'android' | 'ios' | 'web';
  biometric_unlock: boolean;
  last_seen_at: string;
  created_at: string;
}

interface OrgRecord {
  id: number;
  name_ar: string;
  name_en: string;
  trade_name_ar?: string | null;
  trade_name_en?: string | null;
  type: 'buyer' | 'seller' | 'intermediary' | 'admin';
  country_code: string;
  city: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  commercial_registration_number: string | null;
  vat_number: string | null;
  status: 'pending_kyc' | 'verified' | 'suspended' | 'rejected';
  credit_limit: string | null;
  rating: number | null;
  kyc_verified_at: string | null;
  created_at: string;
}

interface MembershipRecord {
  id: number;
  organization_id: number;
  user_id: number;
  role: string;
  is_active: boolean;
  joined_at: string;
  grants: string[];
  denials: string[];
}

function hashPassword(pw: string) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return Number((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
}

function createInitialStore() {
  const now = new Date().toISOString();
  const in30Days = new Date(Date.now() + 30 * 86400_000).toISOString();
  const in90Days = new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10);
  const in45Days = new Date(Date.now() + 45 * 86400_000).toISOString().slice(0, 10);
  const in120Days = new Date(Date.now() + 120 * 86400_000).toISOString().slice(0, 10);

  const settings = [
    { id: 1, key: 'platform.name_ar', value: 'منصة حصّال', type: 'string', group: 'platform', is_public: true, description_ar: 'اسم المنصة بالعربية', description_en: 'Platform name in Arabic', default_value: 'منصة حصّال', is_editable: true },
    { id: 2, key: 'platform.name_en', value: 'HASSAL', type: 'string', group: 'platform', is_public: true, description_ar: 'Platform name in English', description_en: 'Platform name in English', default_value: 'HASSAL', is_editable: true },
    { id: 3, key: 'platform.default_locale', value: 'ar', type: 'string', group: 'platform', is_public: true, description_ar: 'اللغة الافتراضية', description_en: 'Default locale', default_value: 'ar', is_editable: true },
    { id: 4, key: 'platform.country', value: 'YE', type: 'string', group: 'platform', is_public: true, description_ar: 'الدولة التي تبدأ فيها المنصة', description_en: 'Country', default_value: 'YE', is_editable: true },
    { id: 5, key: 'platform.default_city', value: 'عدن', type: 'string', group: 'platform', is_public: true, description_ar: 'المدينة التي تبدأ منها المنصة', description_en: 'Launch city', default_value: 'عدن', is_editable: true },
    { id: 6, key: 'platform.default_currency', value: 'YER', type: 'string', group: 'platform', is_public: true, description_ar: 'العملة الأساسية', description_en: 'Base currency code', default_value: 'YER', is_editable: true },
    { id: 7, key: 'tax.enabled', value: '0', type: 'boolean', group: 'tax', is_public: true, description_ar: 'تفعيل احتساب الضريبة', description_en: 'Enable tax calculation', default_value: '0', is_editable: true },
    { id: 8, key: 'tax.name', value: 'ضريبة المبيعات', type: 'string', group: 'tax', is_public: true, description_ar: 'اسم الضريبة في المستندات', description_en: 'Tax label', default_value: 'ضريبة المبيعات', is_editable: true },
    { id: 9, key: 'tax.rate', value: '0.0000', type: 'decimal', group: 'tax', is_public: true, description_ar: 'نسبة الضريبة', description_en: 'Tax rate', default_value: '0.0000', is_editable: true },
    { id: 10, key: 'tax.inclusive', value: '0', type: 'boolean', group: 'tax', is_public: true, description_ar: 'هل الأسعار شاملة الضريبة', description_en: 'Prices include tax', default_value: '0', is_editable: true },
    { id: 11, key: 'commission.rate', value: '0.0000', type: 'decimal', group: 'commission', is_public: false, description_ar: 'عمولة المنصة من صافي الصفقة', description_en: 'Platform commission rate', default_value: '0.0000', is_editable: true },
    { id: 12, key: 'reservation.timeout', value: '30', type: 'integer', group: 'operations', is_public: true, description_ar: 'مهلة حجز المخزون بالدقائق', description_en: 'Inventory hold in minutes', default_value: '30', is_editable: true },
    { id: 13, key: 'inspection.window', value: '48', type: 'integer', group: 'operations', is_public: true, description_ar: 'نافذة الفحص بعد التسليم بالساعات', description_en: 'Post-delivery inspection window in hours', default_value: '48', is_editable: true },
    { id: 14, key: 'offer.requires_review', value: '0', type: 'boolean', group: 'operations', is_public: false, description_ar: 'مراجعة المشرف قبل نشر العرض', description_en: 'Moderate offers before publishing', default_value: '0', is_editable: true },
    { id: 15, key: 'marketplace.featured_limit', value: '8', type: 'integer', group: 'operations', is_public: true, description_ar: 'عدد العروض المميزة المعروضة أعلى السوق', description_en: 'Featured offers limit', default_value: '8', is_editable: true },
    { id: 16, key: 'auth.google_enabled', value: '0', type: 'boolean', group: 'auth', is_public: true, description_ar: 'السماح بالدخول عبر جوجل', description_en: 'Google Sign-In enabled', default_value: '0', is_editable: true },
    { id: 17, key: 'auth.google_client_id', value: '', type: 'string', group: 'auth', is_public: true, description_ar: 'معرّف عميل جوجل', description_en: 'Google Client ID', default_value: '', is_editable: true },
    { id: 18, key: 'account.require_phone_number', value: '0', type: 'boolean', group: 'auth', is_public: true, description_ar: 'إلزام إكمال رقم الهاتف قبل التصرف التجاري', description_en: 'Require phone number', default_value: '0', is_editable: true },
    { id: 19, key: 'account.require_national_id', value: '0', type: 'boolean', group: 'auth', is_public: true, description_ar: 'إلزام إكمال الرقم الوطني', description_en: 'Require national ID', default_value: '0', is_editable: true },
    { id: 20, key: 'account.max_organizations_per_account', value: '3', type: 'integer', group: 'auth', is_public: false, description_ar: 'أقصى عدد منشآت لحساب واحد', description_en: 'Max organizations per account', default_value: '3', is_editable: true },
    { id: 21, key: 'legal.require_commercial_registration', value: '0', type: 'boolean', group: 'legal', is_public: false, description_ar: 'إلزام السجل التجاري عند تسجيل منشأة', description_en: 'Require CR number', default_value: '0', is_editable: true },
    { id: 22, key: 'legal.require_vat_number', value: '0', type: 'boolean', group: 'legal', is_public: false, description_ar: 'إلزام الرقم الضريبي عند تسجيل منشأة', description_en: 'Require VAT number', default_value: '0', is_editable: true },
    { id: 23, key: 'marketplace.require_verified_to_trade', value: '0', type: 'boolean', group: 'trust', is_public: true, description_ar: 'منع النشر والطلبات قبل مراجعة وثائق المنشأة', description_en: 'Require verified org to trade', default_value: '0', is_editable: true },
    { id: 24, key: 'community.moderate_before_publishing', value: '0', type: 'boolean', group: 'trust', is_public: true, description_ar: 'مراجعة التعليق قبل إظهاره للعامة', description_en: 'Moderate comments before publish', default_value: '0', is_editable: true },
    { id: 25, key: 'geo.max_radius_km', value: '500', type: 'integer', group: 'matching', is_public: true, description_ar: 'أقصى نصف قطر للبحث القريب', description_en: 'Max nearby radius', default_value: '500', is_editable: true },
  ];

  const currencies = [
    { id: 1, iso_code: 'YER', name_ar: 'ريال يمني', name_en: 'Yemeni Rial', symbol: 'ر.ي', decimal_places: 2, exchange_rate_to_base: '1.000000', rate_source: 'BASE_CURRENCY', is_active: true, is_default: true, created_at: now, updated_at: now },
    { id: 2, iso_code: 'SAR', name_ar: 'ريال سعودي', name_en: 'Saudi Riyal', symbol: 'ر.س', decimal_places: 2, exchange_rate_to_base: '140.000000', rate_source: 'MANUAL_REFERENCE', is_active: true, is_default: false, created_at: now, updated_at: now },
    { id: 3, iso_code: 'USD', name_ar: 'دولار أمريكي', name_en: 'US Dollar', symbol: '$', decimal_places: 2, exchange_rate_to_base: '530.000000', rate_source: 'UNSET_SET_BEFORE_USE', is_active: false, is_default: false, created_at: now, updated_at: now },
  ];

  const featureFlags = [
    { id: 1, key: 'marketplace', name_ar: 'سوق العروض والطلبات', name_en: 'Marketplace', description_ar: 'نشر العروض والتصفح والشراء', is_enabled: true, rules_json: null, created_at: now, updated_at: now },
    { id: 2, key: 'demand_rfq', name_ar: 'طلبات الشراء وعروض الأسعار', name_en: 'Demands & RFQ', description_ar: 'إنشاء الطلبات وردود البائعين', is_enabled: true, rules_json: null, created_at: now, updated_at: now },
    { id: 3, key: 'matching_engine', name_ar: 'محرك المطابقة', name_en: 'Matching Engine', description_ar: 'مطابقة قواعد بين العرض والطلب', is_enabled: true, rules_json: null, created_at: now, updated_at: now },
    { id: 4, key: 'geo_discovery', name_ar: 'الفرص القريبة', name_en: 'Nearby Discovery', description_ar: 'البحث الجغرافي بالعروض القريبة', is_enabled: true, rules_json: null, created_at: now, updated_at: now },
    { id: 5, key: 'community', name_ar: 'الاهتمام والأسئلة على العروض', name_en: 'Offer Community', description_ar: 'إعجابات وتعليقات وبلاغات', is_enabled: true, rules_json: null, created_at: now, updated_at: now },
    { id: 6, key: 'api_keys', name_ar: 'مفاتيح API', name_en: 'API Keys', description_ar: 'مفاتيح تكامل الأنظمة', is_enabled: false, rules_json: null, created_at: now, updated_at: now },
    { id: 7, key: 'webhooks', name_ar: 'إشعارات الويب هوك', name_en: 'Webhooks', description_ar: 'توقيع HMAC للشحنات', is_enabled: false, rules_json: null, created_at: now, updated_at: now },
    { id: 8, key: 'double_entry_ledger', name_ar: 'دفتر الأستاذ المزدوج', name_en: 'Double-Entry Ledger', description_ar: 'قيود محاسبية مزدوجة', is_enabled: true, rules_json: null, created_at: now, updated_at: now },
  ];

  const categories = [
    { id: 1, code: 'DAIRY', slug: 'dairy-beverages', name_ar: 'الألبان والعصائر والمشروبات', name_en: 'Dairy & Beverages', icon: 'Milk', sort_order: 1, is_active: true },
    { id: 2, code: 'DRY_GOODS', slug: 'dry-grains', name_ar: 'الحبوب والبقوليات والمواد الجافة', name_en: 'Dry Goods & Grains', icon: 'Wheat', sort_order: 2, is_active: true },
    { id: 3, code: 'OILS_FATS', slug: 'oils-ghee', name_ar: 'الزيوت والدهون والسمن', name_en: 'Oils & Ghee', icon: 'Droplet', sort_order: 3, is_active: true },
    { id: 4, code: 'CANNED', slug: 'canned-preserved', name_ar: 'المعلبات والمحفوظات الغذائية', name_en: 'Canned & Preserved Foods', icon: 'Package', sort_order: 4, is_active: true },
    { id: 5, code: 'FROZEN', slug: 'frozen-chilled', name_ar: 'المجمدات واللحوم والدواجن', name_en: 'Frozen & Poultry', icon: 'Snowflake', sort_order: 5, is_active: true },
    { id: 6, code: 'SWEETS_SNACKS', slug: 'confectionery-snacks', name_ar: 'الحلويات والمقرمشات والشوكولاتة', name_en: 'Confectionery & Snacks', icon: 'Cookie', sort_order: 6, is_active: true },
    { id: 7, code: 'BAKERY_RAW', slug: 'bakery-raw-materials', name_ar: 'مستلزمات المخابز والمواد الأولية', name_en: 'Bakery & Raw Ingredients', icon: 'Cake', sort_order: 7, is_active: true },
    { id: 8, code: 'CLEANING', slug: 'cleaning', name_ar: 'منتجات التنظيف', name_en: 'Cleaning Products', icon: 'Spray', sort_order: 8, is_active: true },
    { id: 9, code: 'PERSONAL_CARE', slug: 'personal-care', name_ar: 'العناية الشخصية', name_en: 'Personal Care', icon: 'Soap', sort_order: 9, is_active: true },
  ];

  const brands = [
    { id: 1, name_ar: 'خيرات عدن', name_en: 'Aden Harvest', slug: 'aden-harvest', is_active: true },
    { id: 2, name_ar: 'نخبة اليمن الغذائية', name_en: 'Yemen Elite Foods', slug: 'yemen-elite', is_active: true },
    { id: 3, name_ar: 'المراعي العربية', name_en: 'Arabian Pastures', slug: 'arabian-pastures', is_active: true },
    { id: 4, name_ar: 'موانئ حضرموت', name_en: 'Hadramout Ports', slug: 'hadramout-ports', is_active: true },
  ];

  const organizations: OrgRecord[] = [
    {
      id: 1,
      name_ar: 'شركة خليج عدن للتجارة والتموين',
      name_en: 'Gulf of Aden Trading & Supply Co.',
      type: 'seller',
      country_code: 'YE',
      city: 'عدن',
      website: null,
      phone: '+967 2 241880',
      email: 'supply@aden-gulf.example',
      commercial_registration_number: 'CR-ADEN-20481',
      vat_number: 'TAX-YE-88120',
      status: 'verified',
      credit_limit: null,
      rating: 4.8,
      kyc_verified_at: now,
      created_at: now,
    },
    {
      id: 2,
      name_ar: 'مؤسسة السهل الذهبي للاستيراد الغذائي',
      name_en: 'Golden Plain Food Imports',
      type: 'seller',
      country_code: 'YE',
      city: 'المكلا',
      website: null,
      phone: '+967 5 309112',
      email: 'trade@goldenplain.example',
      commercial_registration_number: 'CR-MKL-11904',
      vat_number: 'TAX-YE-44219',
      status: 'verified',
      credit_limit: null,
      rating: 4.6,
      kyc_verified_at: now,
      created_at: now,
    },
    {
      id: 3,
      name_ar: 'مجموعة الميناء للمواد الأساسية',
      name_en: 'Al-Mina Staple Commodities Group',
      type: 'seller',
      country_code: 'YE',
      city: 'الحديدة',
      website: null,
      phone: '+967 3 217740',
      email: 'ops@almina-foods.example',
      commercial_registration_number: 'CR-HOD-30512',
      vat_number: null,
      status: 'verified',
      credit_limit: null,
      rating: null,
      kyc_verified_at: now,
      created_at: now,
    },
  ];

  const warehouses = [
    {
      id: 1,
      organization_id: 1,
      name: 'مستودع المنصورة المركزي — عدن',
      code: 'WH-ADN-01',
      city: 'عدن',
      district: 'المنصورة',
      address_line: 'المنطقة الصناعية، بلوك 4',
      latitude: 12.8465,
      longitude: 45.0085,
      contact_name: 'إدارة المستودع',
      contact_phone: '+967 2 241880',
      is_active: true,
    },
    {
      id: 2,
      organization_id: 2,
      name: 'مستودع فوة المبرّد — المكلا',
      code: 'WH-MKL-02',
      city: 'المكلا',
      district: 'فوة',
      address_line: 'خط الميناء التجاري',
      latitude: 14.5186,
      longitude: 49.0642,
      contact_name: 'إدارة التبريد',
      contact_phone: '+967 5 309112',
      is_active: true,
    },
    {
      id: 3,
      organization_id: 3,
      name: 'مستودع الصليف اللوجستي — الحديدة',
      code: 'WH-HOD-01',
      city: 'الحديدة',
      district: 'الميناء',
      address_line: 'شارع الميناء التجاري',
      latitude: 14.8022,
      longitude: 42.9445,
      contact_name: 'منسق الشحن',
      contact_phone: '+967 3 217740',
      is_active: true,
    },
  ];

  const products = [
    { id: 1, organization_id: null, category_id: 2, brand_id: 1, sku: 'DRY-RICE-25K', name_ar: 'أرز بسمتي هندي درجة أولى 25 كجم', name_en: 'Basmati Rice Grade A 25kg', unit: 'bag', package_size: '25 كجم', temperature_class: 'AMBIENT', shelf_life_days: 540, is_active: true },
    { id: 2, organization_id: null, category_id: 3, brand_id: 2, sku: 'OIL-SUN-18L', name_ar: 'زيت دوار الشمس النقي تنكة 18 لتر', name_en: 'Pure Sunflower Oil 18L Tin', unit: 'tin', package_size: '18 لتر', temperature_class: 'AMBIENT', shelf_life_days: 365, is_active: true },
    { id: 3, organization_id: null, category_id: 1, brand_id: 3, sku: 'DAI-EVAP-48', name_ar: 'حليب مبخر كامل الدسم كرتون 48 علبة', name_en: 'Evaporated Full Cream Milk 48x170g', unit: 'carton', package_size: '48×170 جم', temperature_class: 'CHILLED', shelf_life_days: 270, is_active: true },
    { id: 4, organization_id: null, category_id: 4, brand_id: 4, sku: 'CAN-TUNA-24', name_ar: 'تونة خفيفة في زيت نباتي كرتون 24 علبة', name_en: 'Light Tuna in Vegetable Oil 24x185g', unit: 'carton', package_size: '24×185 جم', temperature_class: 'AMBIENT', shelf_life_days: 730, is_active: true },
    { id: 5, organization_id: null, category_id: 7, brand_id: 1, sku: 'BAK-FLOUR-50K', name_ar: 'دقيق قمح أبيض للمخابز شوال 50 كجم', name_en: 'White Bakery Wheat Flour 50kg', unit: 'bag', package_size: '50 كجم', temperature_class: 'AMBIENT', shelf_life_days: 180, is_active: true },
  ];

  const variants = [
    { id: 1, product_id: 1, sku: 'DRY-RICE-25K-V1', name_ar: 'أرز بسمتي 25 كجم — شوال', name_en: 'Basmati Rice 25kg Bag', weight_kg: 25, packaging_spec: 'شوال 25 كجم', is_active: true },
    { id: 2, product_id: 2, sku: 'OIL-SUN-18L-V1', name_ar: 'زيت دوار الشمس 18 لتر — تنكة', name_en: 'Sunflower Oil 18L Tin', weight_kg: 16.5, packaging_spec: 'تنكة 18 لتر', is_active: true },
    { id: 3, product_id: 3, sku: 'DAI-EVAP-48-V1', name_ar: 'حليب مبخر 48×170 جم — كرتون', name_en: 'Evaporated Milk 48x170g Carton', weight_kg: 8.5, packaging_spec: 'كرتون 48 علبة', is_active: true },
    { id: 4, product_id: 4, sku: 'CAN-TUNA-24-V1', name_ar: 'تونة 24×185 جم — كرتون', name_en: 'Light Tuna 24x185g Carton', weight_kg: 5.2, packaging_spec: 'كرتون 24 علبة', is_active: true },
    { id: 5, product_id: 5, sku: 'BAK-FLOUR-50K-V1', name_ar: 'دقيق مخابز 50 كجم — شوال', name_en: 'Bakery Flour 50kg Bag', weight_kg: 50, packaging_spec: 'شوال 50 كجم', is_active: true },
  ];

  const offers = [
    {
      id: 1,
      seller_organization_id: 1,
      warehouse_id: 1,
      product_variant_id: 1,
      category_id: 2,
      title_ar: 'فائض شحنة أرز بسمتي هندي درجة أولى (25 كجم)',
      title_en: 'Surplus Lot: Grade A Indian Basmati Rice (25kg)',
      description_ar: 'تصفية شحنة ميناء عدن — تخزين جاف مطابق للمواصفات، جاهز للتحميل الفوري من مستودع المنصورة.',
      description_en: 'Port of Aden surplus shipment — dry warehouse storage, ready for immediate pickup.',
      opportunity_reason: 'SURPLUS_STOCK',
      status: 'ACTIVE',
      total_quantity: 800,
      available_quantity: 800,
      reserved_quantity: 0,
      sold_quantity: 0,
      min_order_quantity: 20,
      max_order_quantity: 400,
      unit: 'bag',
      unit_price: '16500.00',
      currency_code: 'YER',
      expiry_date: in120Days,
      storage_condition: 'جاف ومهوّى',
      delivery_terms: 'BOTH',
      inspection_window_hours: 48,
      published_at: now,
      expires_at: in30Days,
      show_seller_identity: true,
      featured_at: now,
      likes_count: 14,
      comments_count: 2,
    },
    {
      id: 2,
      seller_organization_id: 1,
      warehouse_id: 1,
      product_variant_id: 2,
      category_id: 3,
      title_ar: 'عرض تصفية زيت دوار الشمس الصافي — تنكة 18 لتر',
      title_en: 'Clearance: Pure Sunflower Oil 18L Tin',
      description_ar: 'كمية متبقية من عقد توريد فندقي، صلاحية ممتدة وتغليف مصنعي محكم.',
      description_en: 'Remaining lot from hospitality contract, sealed factory tins.',
      opportunity_reason: 'EXCESS_INVENTORY',
      status: 'ACTIVE',
      total_quantity: 350,
      available_quantity: 350,
      reserved_quantity: 0,
      sold_quantity: 0,
      min_order_quantity: 10,
      max_order_quantity: 200,
      unit: 'tin',
      unit_price: '21800.00',
      currency_code: 'YER',
      expiry_date: in90Days,
      storage_condition: 'درجة حرارة الغرفة',
      delivery_terms: 'SELLER_DELIVERY',
      inspection_window_hours: 48,
      published_at: now,
      expires_at: in30Days,
      show_seller_identity: true,
      featured_at: now,
      likes_count: 9,
      comments_count: 1,
    },
    {
      id: 3,
      seller_organization_id: 2,
      warehouse_id: 2,
      product_variant_id: 3,
      category_id: 1,
      title_ar: 'حليب مبخر كامل الدسم (48×170 جم) — تبريد مكيّف',
      title_en: 'Evaporated Full Cream Milk (48x170g) — Climate Controlled',
      description_ar: 'تدوير مخزون موسمي في المكلا بسعر جملة مخفّض لتجار التجزئة والمطاعم.',
      description_en: 'Seasonal stock rotation in Mukalla at wholesale clearance price.',
      opportunity_reason: 'SEASONAL_STOCK',
      status: 'ACTIVE',
      total_quantity: 520,
      available_quantity: 520,
      reserved_quantity: 0,
      sold_quantity: 0,
      min_order_quantity: 15,
      max_order_quantity: null,
      unit: 'carton',
      unit_price: '12400.00',
      currency_code: 'YER',
      expiry_date: in45Days,
      storage_condition: 'مبرد (15°م)',
      delivery_terms: 'BUYER_PICKUP',
      inspection_window_hours: 24,
      published_at: now,
      expires_at: in30Days,
      show_seller_identity: true,
      featured_at: null,
      likes_count: 7,
      comments_count: 0,
    },
    {
      id: 4,
      seller_organization_id: 3,
      warehouse_id: 3,
      product_variant_id: 4,
      category_id: 4,
      title_ar: 'تونة خفيفة في زيت نباتي كرتون 24 علبة — الحديدة',
      title_en: 'Light Tuna in Vegetable Oil (24x185g) — Hodeidah',
      description_ar: 'تغيير تشكيلة العلامات التجارية لدى الموزع — خصم واضح على الكميات الكاملة.',
      description_en: 'Assortment change clearance from Hodeidah port depot.',
      opportunity_reason: 'ASSORTMENT_CHANGE',
      status: 'ACTIVE',
      total_quantity: 640,
      available_quantity: 640,
      reserved_quantity: 0,
      sold_quantity: 0,
      min_order_quantity: 25,
      max_order_quantity: 300,
      unit: 'carton',
      unit_price: '14900.00',
      currency_code: 'YER',
      expiry_date: in120Days,
      storage_condition: 'مستودع جاف',
      delivery_terms: 'BOTH',
      inspection_window_hours: 48,
      published_at: now,
      expires_at: in30Days,
      show_seller_identity: true,
      featured_at: now,
      likes_count: 11,
      comments_count: 1,
    },
    {
      id: 5,
      seller_organization_id: 1,
      warehouse_id: 1,
      product_variant_id: 5,
      category_id: 7,
      title_ar: 'دقيق قمح أبيض للمخابز شوال 50 كجم — فائض توريد',
      title_en: 'White Bakery Wheat Flour 50kg Bag — Surplus',
      description_ar: 'شحنة مخابز طازجة من المطاحن، فحص جودة متاح عند الاستلام.',
      description_en: 'Fresh bakery flour batch, quality check available at handover.',
      opportunity_reason: 'LOW_LOCAL_DEMAND',
      status: 'ACTIVE',
      total_quantity: 420,
      available_quantity: 420,
      reserved_quantity: 0,
      sold_quantity: 0,
      min_order_quantity: 10,
      max_order_quantity: 250,
      unit: 'bag',
      unit_price: '11200.00',
      currency_code: 'YER',
      expiry_date: in90Days,
      storage_condition: 'جاف',
      delivery_terms: 'BOTH',
      inspection_window_hours: 48,
      published_at: now,
      expires_at: in30Days,
      show_seller_identity: true,
      featured_at: null,
      likes_count: 6,
      comments_count: 0,
    },
  ];

  const comments: Array<{
    id: number;
    offer_id: number;
    user_id: number;
    organization_id: number | null;
    parent_id: number | null;
    body: string;
    status: 'pending' | 'published' | 'removed';
    report_count: number;
    created_at: string;
  }> = [
    {
      id: 1,
      offer_id: 1,
      user_id: 0,
      organization_id: 2,
      parent_id: null,
      body: 'هل الشوالات معبأة بتاريخ إنتاج ٢٠٢٦ ومتوفرة للمعاينة في مستودع المنصورة غداً؟',
      status: 'published',
      report_count: 0,
      created_at: now,
    },
    {
      id: 2,
      offer_id: 1,
      user_id: 0,
      organization_id: 1,
      parent_id: 1,
      body: 'نعم، الشحنة متوفرة للمعاينة اليومية من ٨ صباحاً حتى ٤ عصراً مع شهادة المنشأ.',
      status: 'published',
      report_count: 0,
      created_at: now,
    },
  ];

  const ledgerAccounts = [
    { id: 1, account_code: '1100', name_ar: 'حسابات التوثيق والتسوية المرجعية', name_en: 'Settlement Reference Clearing', type: 'ASSET', organization_id: null, currency_code: 'YER', balance: '0.00', is_active: true },
    { id: 2, account_code: '4100', name_ar: 'إيرادات الصفقات الموثّقة', name_en: 'Documented Trade Volume', type: 'REVENUE', organization_id: null, currency_code: 'YER', balance: '0.00', is_active: true },
    { id: 3, account_code: '4200', name_ar: 'عمولات المنصة المستحقة', name_en: 'Accrued Platform Commissions', type: 'REVENUE', organization_id: null, currency_code: 'YER', balance: '0.00', is_active: true },
  ];

  return {
    nextIds: {
      user: 1,
      device: 1,
      org: 4,
      membership: 1,
      doc: 1,
      warehouse: 4,
      product: 6,
      variant: 6,
      productImage: 1,
      offer: 6,
      comment: 3,
      commentReport: 1,
      demand: 1,
      match: 1,
      purchaseRequest: 1,
      reservation: 1,
      deal: 1,
      handover: 1,
      dispute: 1,
      movement: 1,
      ledgerEntry: 1,
      notification: 1,
      supportTicket: 1,
      auditLog: 1,
      apiKey: 1,
      webhook: 1,
      currency: 4,
      customRole: 1,
    },
    users: [] as UserRecord[],
    tokens: [] as TokenRecord[],
    devices: [] as DeviceRecord[],
    organizations,
    memberships: [] as MembershipRecord[],
    customOrgRoles: [] as Array<{ id: number; organization_id: number; key: string; name_ar: string; permissions: string[]; holder_count?: number }>,
    documents: [] as Array<Record<string, any>>,
    settings,
    currencies,
    featureFlags,
    categories,
    brands,
    warehouses,
    products,
    variants,
    productImages: [] as Array<Record<string, any>>,
    offers,
    likes: [] as Array<{ user_id: number; offer_id: number }>,
    comments,
    commentReports: [] as Array<Record<string, any>>,
    demands: [] as Array<Record<string, any>>,
    matches: [] as Array<Record<string, any>>,
    purchaseRequests: [] as Array<Record<string, any>>,
    reservations: [] as Array<Record<string, any>>,
    deals: [] as Array<Record<string, any>>,
    handovers: [] as Array<Record<string, any>>,
    disputes: [] as Array<Record<string, any>>,
    movements: [] as Array<Record<string, any>>,
    ledgerAccounts,
    ledgerEntries: [] as Array<Record<string, any>>,
    notifications: [] as Array<Record<string, any>>,
    supportTickets: [] as Array<Record<string, any>>,
    auditLogs: [] as Array<Record<string, any>>,
    apiKeys: [] as Array<Record<string, any>>,
    webhooks: [] as Array<Record<string, any>>,
    webhookDeliveries: [] as Array<Record<string, any>>,
  };
}

export function createHassalApiRouter(): Router {
  const router = Router();
  const db = createInitialStore();

  const recordAudit = (
    action: string,
    userId: number | null,
    orgId: number | null,
    auditableType?: string,
    auditableId?: number,
    newValues?: Record<string, unknown>
  ) => {
    db.auditLogs.unshift({
      id: db.nextIds.auditLog++,
      organization_id: orgId,
      user_id: userId,
      action,
      auditable_type: auditableType ?? null,
      auditable_id: auditableId ?? null,
      ip_address: '127.0.0.1',
      user_agent: 'HASSAL-Web',
      old_values: null,
      new_values: newValues ?? null,
      created_at: new Date().toISOString(),
    });
  };

  const pushNotification = (userId: number, title: string, body: string, data?: Record<string, unknown>) => {
    db.notifications.unshift({
      id: db.nextIds.notification++,
      user_id: userId,
      title,
      body,
      data: data ?? null,
      read_at: null,
      created_at: new Date().toISOString(),
    });
  };

  const getSettingValue = (key: string, fallback = ''): string => {
    const row = db.settings.find((s) => s.key === key);
    return row ? String(row.value ?? fallback) : fallback;
  };

  const getSettingBool = (key: string, fallback = false): boolean => {
    const val = getSettingValue(key, fallback ? '1' : '0').toLowerCase();
    return val === '1' || val === 'true' || val === 'on' || val === 'yes';
  };

  const getUserMemberships = (userId: number) =>
    db.memberships.filter((m) => m.user_id === userId && m.is_active);

  const getEffectivePermissions = (user: UserRecord, membership: MembershipRecord | null): string[] => {
    const perms = new Set<string>();
    if (user.roles.includes('SuperAdmin')) {
      Object.values(MEMBERSHIP_PERMISSIONS).forEach((list) => list.forEach((p) => perms.add(p)));
      ['offers.moderate', 'offers.feature', 'community.moderate', 'organizations.verify', 'disputes.resolve', 'users.manage', 'roles.manage', 'settings.manage', 'currencies.manage', 'support.manage'].forEach((p) => perms.add(p));
    }
    if (user.roles.includes('Auditor')) {
      PLATFORM_ROLES[1].permissions.forEach((p) => perms.add(p));
    }
    if (membership) {
      const custom = db.customOrgRoles.find((r) => r.organization_id === membership.organization_id && r.key === membership.role);
      const rolePerms = custom ? custom.permissions : (MEMBERSHIP_PERMISSIONS[membership.role] ?? []);
      rolePerms.forEach((p) => perms.add(p));
      membership.grants.forEach((p) => perms.add(p));
      membership.denials.forEach((p) => perms.delete(p));
    }
    return Array.from(perms);
  };

  const buildAccountBlock = (user: UserRecord, membership: MembershipRecord | null) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    national_id: user.national_id,
    status: user.status,
    roles: user.roles,
    permissions: getEffectivePermissions(user, membership),
    preferences: user.preferences,
  });

  const buildProfileCompletion = (user: UserRecord) => {
    const missing: string[] = [];
    if (getSettingBool('account.require_phone_number', false) && !user.phone) missing.push('phone');
    if (getSettingBool('account.require_national_id', false) && !user.national_id) missing.push('national_id');
    const memberships = getUserMemberships(user.id);
    return {
      required: missing.length > 0 || memberships.length === 0,
      missing_fields: missing,
      has_organization: memberships.length > 0,
      has_password: Boolean(user.passwordHash),
    };
  };

  const buildOrgList = (userId: number) =>
    getUserMemberships(userId)
      .map((m) => {
        const org = db.organizations.find((o) => o.id === m.organization_id);
        if (!org) return null;
        return {
          id: org.id,
          name_ar: org.name_ar,
          name_en: org.name_en,
          type: org.type,
          status: org.status,
          role: m.role,
          membership_active: m.is_active,
          joined_at: m.joined_at,
        };
      })
      .filter(Boolean);

  const hydrateOffer = (offer: typeof db.offers[number], viewerOrgId?: number | null) => {
    const variant = db.variants.find((v) => v.id === offer.product_variant_id);
    const product = variant ? db.products.find((p) => p.id === variant.product_id) : undefined;
    const category = db.categories.find((c) => c.id === (offer.category_id ?? product?.category_id));
    const brand = product?.brand_id ? db.brands.find((b) => b.id === product.brand_id) : undefined;
    const warehouse = db.warehouses.find((w) => w.id === offer.warehouse_id);
    const seller = db.organizations.find((o) => o.id === offer.seller_organization_id);
    const images = db.productImages.filter((img) => img.product_id === product?.id);
    const coverImg = images.find((i) => i.is_cover)?.url ?? images[0]?.url ?? null;
    const hideIdentity = offer.show_seller_identity === false && viewerOrgId !== offer.seller_organization_id;

    return {
      ...offer,
      product_id: product?.id ?? null,
      product_name_ar: product?.name_ar ?? offer.title_ar,
      product_name_en: product?.name_en ?? offer.title_en,
      variant_sku: variant?.sku ?? null,
      variant_name_ar: variant?.name_ar ?? null,
      variant_name_en: variant?.name_en ?? null,
      weight_kg: variant?.weight_kg ?? null,
      packaging_spec: variant?.packaging_spec ?? null,
      brand_id: brand?.id ?? null,
      brand_name_ar: brand?.name_ar ?? null,
      brand_name_en: brand?.name_en ?? null,
      product_images: images,
      product_cover_image: coverImg,
      category_name_ar: category?.name_ar ?? null,
      category_name_en: category?.name_en ?? null,
      warehouse_name: hideIdentity ? null : (warehouse?.name ?? null),
      warehouse_city: warehouse?.city ?? null,
      warehouse_district: warehouse?.district ?? null,
      warehouse_address: hideIdentity ? null : (warehouse?.address_line ?? null),
      warehouse_lat: warehouse?.latitude ?? null,
      warehouse_lon: warehouse?.longitude ?? null,
      seller_name_ar: hideIdentity ? null : (seller?.name_ar ?? null),
      seller_name_en: hideIdentity ? null : (seller?.name_en ?? null),
      seller_status: seller?.status ?? null,
      seller_cr: hideIdentity ? null : (seller?.commercial_registration_number ?? null),
      seller_vat: hideIdentity ? null : (seller?.vat_number ?? null),
      seller_rating: seller?.rating ?? null,
    };
  };

  const resolveAuth = (req: Request): {
    user: UserRecord | null;
    tokenRecord: TokenRecord | null;
    org: OrgRecord | null;
    membership: MembershipRecord | null;
    tenantError?: string;
  } => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return { user: null, tokenRecord: null, org: null, membership: null };
    }
    const rawToken = authHeader.slice(7).trim();
    const tokenRecord = db.tokens.find((t) => t.token === rawToken) ?? null;
    if (!tokenRecord) return { user: null, tokenRecord: null, org: null, membership: null };
    const user = db.users.find((u) => u.id === tokenRecord.userId) ?? null;
    if (!user || user.status !== 'active') return { user: null, tokenRecord: null, org: null, membership: null };

    const dev = db.devices.find((d) => d.id === tokenRecord.deviceId);
    if (dev) dev.last_seen_at = new Date().toISOString();

    const headerOrgId = req.headers['x-organization-id'];
    const memberships = getUserMemberships(user.id);
    if (headerOrgId) {
      const targetId = Number(headerOrgId);
      const membership = memberships.find((m) => m.organization_id === targetId) ?? null;
      const org = db.organizations.find((o) => o.id === targetId) ?? null;
      if (!membership && !user.roles.includes('SuperAdmin')) {
        return { user, tokenRecord, org: null, membership: null, tenantError: 'ORGANIZATION_ACCESS_DENIED' };
      }
      return { user, tokenRecord, org, membership };
    }

    const first = memberships[0] ?? null;
    const org = first ? (db.organizations.find((o) => o.id === first.organization_id) ?? null) : null;
    return { user, tokenRecord, org, membership: first };
  };

  const requireAuth = (req: Request, res: Response) => {
    const ctx = resolveAuth(req);
    if (!ctx.user) {
      fail(res, 401, 'UNAUTHENTICATED', 'يرجى تسجيل الدخول للمتابعة');
      return null;
    }
    if (ctx.tenantError) {
      fail(res, 403, 'ORGANIZATION_ACCESS_DENIED', 'لا تملك صلاحية الوصول إلى هذه المنشأة');
      return null;
    }
    return ctx;
  };

  // -------------------------------------------------------------------------
  // Health & Bootstrap
  // -------------------------------------------------------------------------

  router.get('/health', (_req, res) => {
    return ok(res, {
      status: 'healthy',
      platform: 'HASSAL',
      version: '2.0.0-node',
      database: { status: 'connected', driver: 'in-memory', version: process.version },
      environment: 'preview',
    });
  });

  router.get('/bootstrap', (req, res) => {
    const auth = resolveAuth(req);
    const activeCurrencies = db.currencies.filter((c) => c.is_active);
    const flagsMap: Record<string, unknown> = {};
    db.featureFlags.forEach((f) => {
      flagsMap[f.key] = {
        key: f.key,
        name_ar: f.name_ar,
        name_en: f.name_en,
        is_enabled: f.is_enabled,
        rules_json: f.rules_json,
      };
    });
    const publicConfigs: Record<string, unknown> = {};
    db.settings.filter((s) => s.is_public).forEach((s) => {
      publicConfigs[s.key] = s.value;
    });

    const lang = req.headers['accept-language'] === 'en' ? 'en' : 'ar';

    return ok(
      res,
      {
        app_name: getSettingValue('platform.name_en', 'HASSAL'),
        app_version: '',
        api_version: 'v1',
        system_status: 'OPERATIONAL',
        server_time: new Date().toISOString(),
        default_locale: getSettingValue('platform.default_locale', 'ar'),
        supported_locales: ['ar', 'en'],
        active_locale: lang,
        country: getSettingValue('platform.country', 'YE'),
        base_currency: getSettingValue('platform.default_currency', 'YER'),
        currencies: activeCurrencies,
        categories: db.categories,
        opportunity_reasons: OPPORTUNITY_REASONS,
        feature_flags: flagsMap,
        platform_settings: {
          tax: {
            enabled: getSettingBool('tax.enabled', false),
            name: getSettingValue('tax.name', 'ضريبة المبيعات'),
            rate: Number(getSettingValue('tax.rate', '0')),
            inclusive: getSettingBool('tax.inclusive', false),
          },
          commission_rate: Number(getSettingValue('commission.rate', '0')),
          reservation_timeout_minutes: Number(getSettingValue('reservation.timeout', '30')),
          inspection_window_hours: Number(getSettingValue('inspection.window', '48')),
          default_city: getSettingValue('platform.default_city', 'عدن'),
          public_configs: publicConfigs,
        },
        user: auth.user ? buildAccountBlock(auth.user, auth.membership) : null,
        tenant: auth.org
          ? {
              id: auth.org.id,
              name_ar: auth.org.name_ar,
              name_en: auth.org.name_en,
              type: auth.org.type,
              status: auth.org.status,
              commercial_registration_number: auth.org.commercial_registration_number,
              vat_number: auth.org.vat_number,
              rating: auth.org.rating,
              role_in_organization: auth.membership?.role ?? null,
            }
          : null,
      },
      'Application bootstrap data loaded successfully'
    );
  });

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------

  const issueSession = (user: UserRecord, body: Record<string, any>) => {
    const devKey = String(body.device_key || `web_${crypto.randomUUID()}`);
    let device = db.devices.find((d) => d.userId === user.id && d.device_key === devKey);
    if (!device) {
      device = {
        id: db.nextIds.device++,
        userId: user.id,
        device_key: devKey,
        name: String(body.device_name || 'متصفّح الويب'),
        platform: (body.device_platform as 'web') || 'web',
        biometric_unlock: Boolean(body.biometric_unlock),
        last_seen_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      db.devices.push(device);
    }
    const token = `hsl_${crypto.randomBytes(24).toString('hex')}`;
    db.tokens.push({ token, userId: user.id, deviceId: device.id, createdAt: new Date().toISOString() });

    const memberships = getUserMemberships(user.id);
    const firstMembership = memberships[0] ?? null;
    const activeOrg = firstMembership
      ? (db.organizations.find((o) => o.id === firstMembership.organization_id) ?? null)
      : null;

    return {
      user: buildAccountBlock(user, firstMembership),
      active_organization: activeOrg,
      organizations: buildOrgList(user.id),
      token,
      profile_completion: buildProfileCompletion(user),
    };
  };

  router.post('/auth/register', (req, res) => {
    const { name, email, phone, national_id, password, password_confirmation } = req.body ?? {};
    const details: Record<string, string[]> = {};
    if (!name || String(name).trim().length < 2) details.name = ['يرجى إدخال الاسم الكامل'];
    if (!email || !String(email).includes('@')) details.email = ['يرجى إدخال بريد إلكتروني صحيح'];
    if (!password || String(password).length < 6) details.password = ['كلمة المرور يجب أن لا تقل عن 6 أحرف'];
    if (password !== password_confirmation) details.password_confirmation = ['تأكيد كلمة المرور غير مطابق'];
    if (db.users.some((u) => u.email.toLowerCase() === String(email).toLowerCase())) {
      details.email = ['هذا البريد الإلكتروني مسجل مسبقاً'];
    }
    if (Object.keys(details).length > 0) {
      return fail(res, 422, 'VALIDATION_ERROR', 'يرجى التحقق من البيانات المدخلة', details);
    }

    const isFirstUser = db.users.length === 0;
    const user: UserRecord = {
      id: db.nextIds.user++,
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      phone: phone ? String(phone).trim() : null,
      national_id: national_id ? String(national_id).trim() : null,
      passwordHash: hashPassword(String(password)),
      status: 'active',
      roles: isFirstUser ? ['SuperAdmin'] : [],
      preferences: { locale: 'ar', theme: 'light' },
      created_at: new Date().toISOString(),
    };
    db.users.push(user);
    recordAudit('user.registered', user.id, null, 'User', user.id, { email: user.email });
    pushNotification(
      user.id,
      'مرحباً بك في منصة حصّال',
      'تم فتح حسابك بنجاح. يمكنك تصفح العروض أو تسجيل منشأتك التجارية للبدء في البيع والشراء.'
    );

    return ok(res, issueSession(user, req.body ?? {}), 'تم إنشاء الحساب بنجاح', {}, 201);
  });

  router.post('/auth/login', (req, res) => {
    const { login, password } = req.body ?? {};
    const key = String(login || '').trim().toLowerCase();
    const user = db.users.find((u) => u.email.toLowerCase() === key || (u.phone && u.phone === key));
    if (!user || user.passwordHash !== hashPassword(String(password || ''))) {
      return fail(res, 401, 'INVALID_CREDENTIALS', 'بيانات الدخول غير صحيحة');
    }
    if (user.status !== 'active') {
      return fail(res, 403, 'ACCOUNT_INACTIVE', 'هذا الحساب موقوف أو غير نشط');
    }
    return ok(res, issueSession(user, req.body ?? {}), 'تم تسجيل الدخول بنجاح');
  });

  router.post('/auth/forgot-password', (req, res) => {
    return ok(res, { sent: true }, 'إذا كان البريد مسجلاً فسيتم إرسال رابط الاستعادة إليه');
  });

  router.post('/auth/reset-password', (req, res) => {
    return ok(res, { reset: true }, 'تم تحديث كلمة المرور');
  });

  router.post('/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const tok = authHeader.slice(7).trim();
      db.tokens = db.tokens.filter((t) => t.token !== tok);
    }
    return ok(res, { logged_out: true }, 'تم تسجيل الخروج');
  });

  router.get('/auth/me', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    return ok(res, {
      user: buildAccountBlock(ctx.user, ctx.membership),
      current_organization: ctx.org
        ? {
            id: ctx.org.id,
            name_ar: ctx.org.name_ar,
            name_en: ctx.org.name_en,
            type: ctx.org.type,
            status: ctx.org.status,
            cr_number: ctx.org.commercial_registration_number,
            vat_number: ctx.org.vat_number,
            credit_limit: ctx.org.credit_limit,
            rating: ctx.org.rating,
            membership_role: ctx.membership?.role ?? null,
          }
        : null,
      organizations: buildOrgList(ctx.user.id),
      profile_completion: buildProfileCompletion(ctx.user),
    });
  });

  router.post('/auth/switch-organization', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    const orgId = Number(req.body?.organization_id);
    const membership = getUserMemberships(ctx.user.id).find((m) => m.organization_id === orgId);
    const org = db.organizations.find((o) => o.id === orgId);
    if (!membership || !org) {
      return fail(res, 403, 'ORGANIZATION_ACCESS_DENIED', 'ليست لديك عضوية نشطة في هذه المنشأة');
    }
    return ok(res, {
      organization: {
        id: org.id,
        name_ar: org.name_ar,
        name_en: org.name_en,
        type: org.type,
        status: org.status,
        role: membership.role,
      },
    });
  });

  router.patch('/auth/profile', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    const { name, phone, national_id } = req.body ?? {};
    if (name !== undefined && String(name).trim()) ctx.user.name = String(name).trim();
    if (phone !== undefined) ctx.user.phone = phone ? String(phone).trim() : null;
    if (national_id !== undefined) ctx.user.national_id = national_id ? String(national_id).trim() : null;
    return ok(res, {
      id: ctx.user.id,
      name: ctx.user.name,
      email: ctx.user.email,
      phone: ctx.user.phone,
      national_id: ctx.user.national_id,
    }, 'تم حفظ بيانات الحساب');
  });

  router.post('/auth/password', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    const { current_password, password, password_confirmation } = req.body ?? {};
    if (ctx.user.passwordHash !== hashPassword(String(current_password || ''))) {
      return fail(res, 422, 'INVALID_PASSWORD', 'كلمة المرور الحالية غير صحيحة', { current_password: ['كلمة المرور الحالية غير صحيحة'] });
    }
    if (!password || String(password).length < 6 || password !== password_confirmation) {
      return fail(res, 422, 'VALIDATION_ERROR', 'تحقق من كلمة المرور الجديدة وتأكيدها');
    }
    ctx.user.passwordHash = hashPassword(String(password));
    if (ctx.tokenRecord) {
      db.tokens = db.tokens.filter((t) => t.userId !== ctx.user!.id || t.token === ctx.tokenRecord!.token);
    }
    return ok(res, { updated: true }, 'تم تغيير كلمة المرور');
  });

  router.get('/auth/devices', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    const list = db.devices
      .filter((d) => d.userId === ctx.user!.id)
      .map((d) => ({
        id: d.id,
        name: d.name,
        platform: d.platform,
        biometric_unlock: d.biometric_unlock,
        current: ctx.tokenRecord?.deviceId === d.id,
        last_seen_at: d.last_seen_at,
        created_at: d.created_at,
      }));
    return ok(res, list);
  });

  router.post('/auth/devices', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    return ok(res, { synced: true });
  });

  router.patch('/auth/devices/:id', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    const dev = db.devices.find((d) => d.id === Number(req.params.id) && d.userId === ctx.user!.id);
    if (!dev) return fail(res, 404, 'DEVICE_NOT_FOUND', 'الجهاز غير موجود');
    if (req.body?.name) dev.name = String(req.body.name);
    if (req.body?.biometric_unlock !== undefined) dev.biometric_unlock = Boolean(req.body.biometric_unlock);
    return ok(res, { ...dev, current: ctx.tokenRecord?.deviceId === dev.id });
  });

  router.delete('/auth/devices/:id', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    const devId = Number(req.params.id);
    db.devices = db.devices.filter((d) => !(d.id === devId && d.userId === ctx.user!.id));
    db.tokens = db.tokens.filter((t) => !(t.deviceId === devId && t.userId === ctx.user!.id));
    return ok(res, { revoked: true });
  });

  router.get('/auth/preferences', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    return ok(res, ctx.user.preferences);
  });

  router.put('/auth/preferences', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    ctx.user.preferences = { ...ctx.user.preferences, ...(req.body ?? {}) };
    return ok(res, ctx.user.preferences);
  });

  router.get('/auth/preferences/catalog', (_req, res) => {
    return ok(res, [
      { key: 'locale', type: 'string', options: ['ar', 'en'] },
      { key: 'theme', type: 'string', options: ['light', 'dark'] },
    ]);
  });

  // -------------------------------------------------------------------------
  // Public Marketplace & Catalog
  // -------------------------------------------------------------------------

  router.get('/marketplace/categories', (_req, res) => ok(res, db.categories));
  router.get('/marketplace/brands', (_req, res) => ok(res, db.brands));

  router.get('/marketplace/warehouses', (req, res) => {
    const { city, search } = req.query;
    const activeWarehouseIds = new Set(db.offers.filter((o) => o.status === 'ACTIVE').map((o) => o.warehouse_id));
    let list = db.warehouses.filter((w) => activeWarehouseIds.has(w.id));
    if (city) list = list.filter((w) => w.city.includes(String(city)));
    if (search) {
      const q = String(search).toLowerCase();
      list = list.filter((w) => w.name.toLowerCase().includes(q) || w.city.toLowerCase().includes(q));
    }
    return ok(res, list);
  });

  router.get('/marketplace/offers/featured', (req, res) => {
    const auth = resolveAuth(req);
    const limit = Math.max(1, Math.min(30, Number(getSettingValue('marketplace.featured_limit', '8')) || 8));
    const allFeatured = db.offers.filter((o) => o.status === 'ACTIVE' && o.featured_at);
    const list = allFeatured
      .slice(0, limit)
      .map((o) => hydrateOffer(o, auth.org?.id));
    return ok(res, {
      offers: list,
      limit,
      total_featured: allFeatured.length,
    });
  });

  router.get('/marketplace/offers/nearby', (req, res) => {
    const auth = resolveAuth(req);
    const lat = Number(req.query.latitude ?? req.query.lat ?? 12.7855);
    const lon = Number(req.query.longitude ?? req.query.lon ?? 45.0187);
    const radiusKm = Number(req.query.radius_km ?? 100);

    let list = db.offers
      .filter((o) => o.status === 'ACTIVE')
      .map((o) => {
        const hydrated = hydrateOffer(o, auth.org?.id);
        const wLat = Number(hydrated.warehouse_lat);
        const wLon = Number(hydrated.warehouse_lon);
        const dist = Number.isFinite(wLat) && Number.isFinite(wLon) && hydrated.warehouse_lat !== null
          ? haversineKm(lat, lon, wLat, wLon)
          : null;
        return { ...hydrated, distance_km: dist };
      })
      .filter((o) => o.distance_km !== null && o.distance_km <= radiusKm)
      .sort((a, b) => (a.distance_km ?? 9999) - (b.distance_km ?? 9999));

    return ok(res, {
      offers: list,
      search_center: { latitude: lat, longitude: lon },
      radius_km: radiusKm,
      total_found: list.length,
    });
  });

  router.get('/marketplace/offers', (req, res) => {
    const auth = resolveAuth(req);
    const { category_id, opportunity_reason, city, min_price, max_price, max_moq, delivery_terms, search, sort_by, page, per_page } = req.query;
    let list = db.offers
      .filter((o) => o.status === 'ACTIVE')
      .map((o) => hydrateOffer(o, auth.org?.id));

    if (category_id) list = list.filter((o) => Number(o.category_id) === Number(category_id));
    if (opportunity_reason) list = list.filter((o) => o.opportunity_reason === String(opportunity_reason));
    if (city) list = list.filter((o) => (o.warehouse_city || '').includes(String(city)));
    if (min_price) list = list.filter((o) => Number(o.unit_price) >= Number(min_price));
    if (max_price) list = list.filter((o) => Number(o.unit_price) <= Number(max_price));
    if (max_moq) list = list.filter((o) => Number(o.min_order_quantity) <= Number(max_moq));
    if (delivery_terms) list = list.filter((o) => o.delivery_terms === String(delivery_terms));
    if (search) {
      const q = String(search).toLowerCase();
      list = list.filter((o) =>
        (o.title_ar || '').toLowerCase().includes(q) ||
        (o.title_en || '').toLowerCase().includes(q) ||
        (o.product_name_ar || '').toLowerCase().includes(q) ||
        (o.warehouse_city || '').toLowerCase().includes(q)
      );
    }
    if (sort_by === 'cheapest') list.sort((a, b) => Number(a.unit_price) - Number(b.unit_price));
    else if (sort_by === 'priciest') list.sort((a, b) => Number(b.unit_price) - Number(a.unit_price));
    else if (sort_by === 'quantity') list.sort((a, b) => Number(b.available_quantity) - Number(a.available_quantity));
    else if (sort_by === 'nearest_to_expiry' || sort_by === 'expiring') {
      list.sort((a, b) => String(a.expiry_date || '9999').localeCompare(String(b.expiry_date || '9999')));
    } else {
      list.sort((a, b) => b.id - a.id);
    }

    return paginated(res, list, page, per_page || 20);
  });

  router.get('/marketplace/offers/:id', (req, res) => {
    const auth = resolveAuth(req);
    const offer = db.offers.find((o) => o.id === Number(req.params.id));
    if (!offer) return fail(res, 404, 'OFFER_NOT_FOUND', 'العرض غير موجود');
    return ok(res, hydrateOffer(offer, auth.org?.id));
  });

  router.get('/marketplace/offers/:id/comments', (req, res) => {
    const offerId = Number(req.params.id);
    const offer = db.offers.find((o) => o.id === offerId);
    const list = db.comments
      .filter((c) => c.offer_id === offerId && c.status === 'published' && !c.parent_id)
      .map((c) => {
        const org = c.organization_id ? db.organizations.find((o) => o.id === c.organization_id) : null;
        const user = db.users.find((u) => u.id === c.user_id);
        const replies = db.comments
          .filter((r) => r.parent_id === c.id && r.status === 'published')
          .map((r) => {
            const rOrg = r.organization_id ? db.organizations.find((o) => o.id === r.organization_id) : null;
            const rUser = db.users.find((u) => u.id === r.user_id);
            const isSeller = Boolean(offer && r.organization_id === offer.seller_organization_id);
            const hidden = isSeller && offer?.show_seller_identity === false;
            return {
              id: r.id,
              offer_id: r.offer_id,
              body: r.body,
              ...(hidden ? { identity_hidden: true } : {
                author_name: rUser?.name ?? 'فريق المبيعات',
                organization_id: r.organization_id ?? undefined,
                organization_name: rOrg?.name_ar,
              }),
              is_seller_reply: isSeller,
              status: r.status,
              created_at: r.created_at,
            };
          });
        return {
          id: c.id,
          offer_id: c.offer_id,
          body: c.body,
          author_name: user?.name ?? 'مشتري مسجّل',
          organization_id: c.organization_id ?? undefined,
          organization_name: org?.name_ar,
          is_seller_reply: Boolean(offer && c.organization_id === offer.seller_organization_id),
          status: c.status,
          created_at: c.created_at,
          replies,
        };
      });
    return ok(res, list);
  });

  // -------------------------------------------------------------------------
  // Authenticated Seller Offers & Community
  // -------------------------------------------------------------------------

  router.get('/marketplace/my-offers', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    if (!ctx.org) return paginated(res, [], 1, 20);
    let list = db.offers
      .filter((o) => o.seller_organization_id === ctx.org!.id)
      .map((o) => hydrateOffer(o, ctx.org!.id));
    if (req.query.status) list = list.filter((o) => o.status === String(req.query.status));
    return paginated(res, list, req.query.page, req.query.per_page || 20);
  });

  router.get('/marketplace/moderation-queue', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    const list = db.offers
      .filter((o) => o.status === 'PENDING_REVIEW')
      .map((o) => ({
        ...hydrateOffer(o, ctx.org?.id),
        moderation_context: {
          waiting_since: o.published_at ?? new Date().toISOString(),
          waiting_hours: 1,
        },
      }));
    return paginated(res, list, req.query.page, req.query.per_page || 20);
  });

  router.post('/marketplace/offers', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user || !ctx.org) {
      return fail(res, 422, 'ORGANIZATION_REQUIRED', 'يرجى اختيار أو إنشاء منشأة قبل نشر عرض');
    }
    const body = req.body ?? {};
    const totalQty = Number(body.total_quantity || 0);
    const offer = {
      id: db.nextIds.offer++,
      seller_organization_id: ctx.org.id,
      warehouse_id: Number(body.warehouse_id || db.warehouses[0]?.id || 1),
      product_variant_id: Number(body.product_variant_id || 1),
      category_id: body.category_id ? Number(body.category_id) : null,
      title_ar: String(body.title_ar || 'عرض مخزون جديد'),
      title_en: body.title_en ? String(body.title_en) : null,
      description_ar: body.description_ar ? String(body.description_ar) : null,
      description_en: body.description_en ? String(body.description_en) : null,
      opportunity_reason: String(body.opportunity_reason || 'SURPLUS_STOCK'),
      status: 'DRAFT' as const,
      total_quantity: totalQty,
      available_quantity: totalQty,
      reserved_quantity: 0,
      sold_quantity: 0,
      min_order_quantity: Number(body.min_order_quantity || 1),
      max_order_quantity: body.max_order_quantity ? Number(body.max_order_quantity) : null,
      unit: String(body.unit || 'carton'),
      unit_price: String(Number(body.unit_price || 0).toFixed(2)),
      currency_code: String(body.currency_code || 'YER'),
      expiry_date: body.expiry_date || null,
      storage_condition: body.storage_condition || null,
      delivery_terms: String(body.delivery_terms || 'BOTH'),
      inspection_window_hours: Number(body.inspection_window_hours || 48),
      published_at: null as string | null,
      expires_at: new Date(Date.now() + 60 * 86400_000).toISOString(),
      show_seller_identity: body.show_seller_identity !== false,
      featured_at: null as string | null,
      likes_count: 0,
      comments_count: 0,
    };
    db.offers.unshift(offer as any);
    recordAudit('offer.created', ctx.user.id, ctx.org.id, 'Offer', offer.id);
    return ok(res, hydrateOffer(offer as any, ctx.org.id), 'تم إنشاء العرض كمسودة', {}, 201);
  });

  router.put('/marketplace/offers/:id', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user || !ctx.org) return;
    const offer = db.offers.find((o) => o.id === Number(req.params.id) && o.seller_organization_id === ctx.org!.id);
    if (!offer) return fail(res, 404, 'OFFER_NOT_FOUND', 'العرض غير موجود');
    Object.assign(offer, req.body ?? {});
    return ok(res, hydrateOffer(offer, ctx.org.id), 'تم تحديث العرض');
  });

  router.post('/marketplace/offers/:id/submit', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user || !ctx.org) return;
    const offer = db.offers.find((o) => o.id === Number(req.params.id) && o.seller_organization_id === ctx.org!.id);
    if (!offer) return fail(res, 404, 'OFFER_NOT_FOUND', 'العرض غير موجود');
    const requiresReview = getSettingBool('offer.requires_review', false);
    offer.status = requiresReview ? 'PENDING_REVIEW' : 'ACTIVE';
    offer.published_at = new Date().toISOString();
    return ok(res, hydrateOffer(offer, ctx.org.id), requiresReview ? 'تم إرسال العرض للمراجعة' : 'تم نشر العرض في السوق');
  });

  router.put('/marketplace/offers/:id/review', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    const offer = db.offers.find((o) => o.id === Number(req.params.id));
    if (!offer) return fail(res, 404, 'OFFER_NOT_FOUND', 'العرض غير موجود');
    offer.status = req.body?.decision === 'APPROVE' ? 'ACTIVE' : 'DRAFT';
    return ok(res, hydrateOffer(offer, ctx.org?.id), 'تم حفظ قرار المراجعة');
  });

  router.put('/marketplace/offers/:id/feature', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    const offer = db.offers.find((o) => o.id === Number(req.params.id));
    if (!offer) return fail(res, 404, 'OFFER_NOT_FOUND', 'العرض غير موجود');
    offer.featured_at = req.body?.featured ? new Date().toISOString() : null;
    return ok(res, hydrateOffer(offer, ctx.org?.id));
  });

  router.put('/marketplace/offers/:id/status', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    const offer = db.offers.find((o) => o.id === Number(req.params.id));
    if (!offer) return fail(res, 404, 'OFFER_NOT_FOUND', 'العرض غير موجود');
    offer.status = String(req.body?.status || offer.status);
    return ok(res, hydrateOffer(offer, ctx.org?.id), 'تم تحديث حالة العرض');
  });

  router.delete('/marketplace/offers/:id', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    db.offers = db.offers.filter((o) => o.id !== Number(req.params.id));
    return ok(res, { deleted: true }, 'تم حذف العرض');
  });

  router.get('/marketplace/liked-offers', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    const ids = db.likes.filter((l) => l.user_id === ctx.user!.id).map((l) => l.offer_id);
    return ok(res, ids);
  });

  router.post('/marketplace/offers/:id/like', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    const offerId = Number(req.params.id);
    const offer = db.offers.find((o) => o.id === offerId);
    if (!offer) return fail(res, 404, 'OFFER_NOT_FOUND', 'العرض غير موجود');
    if (!db.likes.some((l) => l.user_id === ctx.user!.id && l.offer_id === offerId)) {
      db.likes.push({ user_id: ctx.user.id, offer_id: offerId });
      offer.likes_count = (offer.likes_count || 0) + 1;
    }
    return ok(res, { liked: true, likes_count: offer.likes_count });
  });

  router.delete('/marketplace/offers/:id/like', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    const offerId = Number(req.params.id);
    const offer = db.offers.find((o) => o.id === offerId);
    const before = db.likes.length;
    db.likes = db.likes.filter((l) => !(l.user_id === ctx.user!.id && l.offer_id === offerId));
    if (offer && db.likes.length < before) {
      offer.likes_count = Math.max(0, (offer.likes_count || 1) - 1);
    }
    return ok(res, { liked: false, likes_count: offer?.likes_count ?? 0 });
  });

  router.post('/marketplace/offers/:id/comments', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    const offerId = Number(req.params.id);
    const offer = db.offers.find((o) => o.id === offerId);
    if (!offer) return fail(res, 404, 'OFFER_NOT_FOUND', 'العرض غير موجود');
    const c = {
      id: db.nextIds.comment++,
      offer_id: offerId,
      user_id: ctx.user.id,
      organization_id: ctx.org?.id ?? null,
      parent_id: req.body?.parent_id ? Number(req.body.parent_id) : null,
      body: String(req.body?.body || '').trim(),
      status: getSettingBool('community.moderate_before_publishing', false) ? ('pending' as const) : ('published' as const),
      report_count: 0,
      created_at: new Date().toISOString(),
    };
    db.comments.push(c);
    if (c.status === 'published') offer.comments_count = (offer.comments_count || 0) + 1;
    return ok(res, {
      id: c.id,
      offer_id: c.offer_id,
      body: c.body,
      author_name: ctx.user.name,
      organization_id: c.organization_id ?? undefined,
      organization_name: ctx.org?.name_ar,
      is_seller_reply: ctx.org?.id === offer.seller_organization_id,
      status: c.status,
      created_at: c.created_at,
    }, 'تم نشر التعليق', {}, 201);
  });

  router.delete('/marketplace/comments/:id', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    db.comments = db.comments.filter((c) => c.id !== Number(req.params.id));
    return ok(res, { deleted: true });
  });

  router.post('/marketplace/comments/:id/report', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    const commentId = Number(req.params.id);
    const comment = db.comments.find((c) => c.id === commentId);
    if (!comment) return fail(res, 404, 'COMMENT_NOT_FOUND', 'التعليق غير موجود');
    comment.report_count += 1;
    db.commentReports.push({
      id: db.nextIds.commentReport++,
      offer_comment_id: commentId,
      reason: String(req.body?.reason || 'other'),
      note: req.body?.note || null,
      status: 'open',
      reporter: { name: ctx.user.name },
      organization: ctx.org ? { name_ar: ctx.org.name_ar } : null,
      created_at: new Date().toISOString(),
    });
    return ok(res, { reported: true }, 'تم استلام البلاغ');
  });

  // Community moderation
  router.get('/community/summary', (_req, res) => {
    return ok(res, {
      pending_offers: db.offers.filter((o) => o.status === 'PENDING_REVIEW').length,
      pending_comments: db.comments.filter((c) => c.status === 'pending').length,
      reported_comments: db.comments.filter((c) => c.report_count > 0).length,
      open_reports: db.commentReports.filter((r) => r.status === 'open').length,
      pending_documents: db.documents.filter((d) => d.status === 'pending').length,
      pending_organizations: db.organizations.filter((o) => o.status === 'pending_kyc').length,
    });
  });

  router.get('/community/comments', (req, res) => {
    let list = db.comments.map((c) => ({
      ...c,
      reports: db.commentReports.filter((r) => r.offer_comment_id === c.id),
    }));
    if (req.query.status === 'reported') list = list.filter((c) => c.report_count > 0);
    else if (req.query.status) list = list.filter((c) => c.status === req.query.status);
    return paginated(res, list, req.query.page, req.query.per_page || 20);
  });

  router.put('/community/comments/:id', (req, res) => {
    const comment = db.comments.find((c) => c.id === Number(req.params.id));
    if (!comment) return fail(res, 404, 'COMMENT_NOT_FOUND', 'التعليق غير موجود');
    const action = req.body?.action;
    if (action === 'publish') comment.status = 'published';
    else if (action === 'remove') comment.status = 'removed';
    else comment.status = 'pending';
    return ok(res, comment);
  });

  router.get('/community/reports', (req, res) => {
    let list = db.commentReports;
    if (req.query.status) list = list.filter((r) => r.status === req.query.status);
    return paginated(res, list, req.query.page, 20);
  });

  router.put('/community/reports/:id', (req, res) => {
    const rep = db.commentReports.find((r) => r.id === Number(req.params.id));
    if (!rep) return fail(res, 404, 'REPORT_NOT_FOUND', 'البلاغ غير موجود');
    rep.status = req.body?.decision === 'upheld' ? 'upheld' : 'dismissed';
    rep.reviewed_at = new Date().toISOString();
    return ok(res, rep);
  });

  // -------------------------------------------------------------------------
  // Organizations, Members, Roles & Documents
  // -------------------------------------------------------------------------

  router.get('/organizations/membership-roles', (req, res) => {
    const auth = resolveAuth(req);
    const custom = auth.org
      ? db.customOrgRoles.filter((r) => r.organization_id === auth.org!.id).map((r) => ({
          value: r.key,
          label: r.name_ar,
          is_system: false,
          permission_count: r.permissions.length,
          permissions: r.permissions,
        }))
      : [];
    const system = MEMBERSHIP_ROLES.map((r) => ({
      ...r,
      is_system: true,
      permission_count: (MEMBERSHIP_PERMISSIONS[r.value] ?? []).length,
      permissions: MEMBERSHIP_PERMISSIONS[r.value] ?? [],
    }));
    return ok(res, [...system, ...custom]);
  });

  router.get('/organizations/document-queue', (req, res) => {
    let list = db.documents;
    if (req.query.status) list = list.filter((d) => d.status === req.query.status);
    return paginated(res, list, req.query.page, 20);
  });

  router.get('/organizations/document-summary', (_req, res) => {
    const pending = db.documents.filter((d) => d.status === 'pending').length;
    const accepted = db.documents.filter((d) => d.status === 'accepted').length;
    const rejected = db.documents.filter((d) => d.status === 'rejected').length;
    const orgsPending = new Set(db.documents.filter((d) => d.status === 'pending').map((d) => d.organization_id)).size;
    return ok(res, {
      by_status: { pending, accepted, rejected },
      organizations_with_pending_documents: orgsPending,
    });
  });

  router.get('/organizations', (req, res) => {
    let list = db.organizations.map((o) => ({
      ...o,
      members_count: db.memberships.filter((m) => m.organization_id === o.id && m.is_active).length,
    }));
    if (req.query.status) list = list.filter((o) => o.status === req.query.status);
    if (req.query.type) list = list.filter((o) => o.type === req.query.type);
    if (req.query.search) {
      const q = String(req.query.search).toLowerCase();
      list = list.filter((o) => o.name_ar.toLowerCase().includes(q) || o.name_en.toLowerCase().includes(q));
    }
    return paginated(res, list, req.query.page, req.query.per_page || 20);
  });

  router.post('/organizations', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    const body = req.body ?? {};
    if (!body.name_ar) {
      return fail(res, 422, 'VALIDATION_ERROR', 'يرجى إدخال اسم المنشأة', { name_ar: ['اسم المنشأة بالعربية مطلوب'] });
    }
    const autoVerify = !getSettingBool('marketplace.require_verified_to_trade', false);
    const org: OrgRecord = {
      id: db.nextIds.org++,
      name_ar: String(body.name_ar),
      name_en: String(body.name_en || body.name_ar),
      type: (body.type as OrgRecord['type']) || 'intermediary',
      country_code: String(body.country_code || 'YE'),
      city: body.city ? String(body.city) : 'عدن',
      website: body.website ? String(body.website) : null,
      phone: body.phone ? String(body.phone) : ctx.user.phone,
      email: body.email ? String(body.email) : ctx.user.email,
      commercial_registration_number: body.commercial_registration_number ? String(body.commercial_registration_number) : null,
      vat_number: body.vat_number ? String(body.vat_number) : null,
      status: autoVerify ? 'verified' : 'pending_kyc',
      credit_limit: null,
      rating: null,
      kyc_verified_at: autoVerify ? new Date().toISOString() : null,
      created_at: new Date().toISOString(),
    };
    db.organizations.push(org);
    db.memberships.push({
      id: db.nextIds.membership++,
      organization_id: org.id,
      user_id: ctx.user.id,
      role: 'owner',
      is_active: true,
      joined_at: new Date().toISOString(),
      grants: [],
      denials: [],
    });
    recordAudit('organization.created', ctx.user.id, org.id, 'Organization', org.id);
    return ok(res, org, 'تم تسجيل المنشأة بنجاح', {}, 201);
  });

  router.get('/organizations/:id', (req, res) => {
    const org = db.organizations.find((o) => o.id === Number(req.params.id));
    if (!org) return fail(res, 404, 'ORGANIZATION_NOT_FOUND', 'المنشأة غير موجودة');
    return ok(res, org);
  });

  router.put('/organizations/:id', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    const org = db.organizations.find((o) => o.id === Number(req.params.id));
    if (!org) return fail(res, 404, 'ORGANIZATION_NOT_FOUND', 'المنشأة غير موجودة');
    Object.assign(org, req.body ?? {});
    return ok(res, org, 'تم تحديث بيانات المنشأة');
  });

  router.put('/organizations/:id/verification', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    const org = db.organizations.find((o) => o.id === Number(req.params.id));
    if (!org) return fail(res, 404, 'ORGANIZATION_NOT_FOUND', 'المنشأة غير موجودة');
    org.status = req.body?.status || 'verified';
    if (org.status === 'verified') org.kyc_verified_at = new Date().toISOString();
    return ok(res, org, 'تم تحديث حالة اعتماد المنشأة');
  });

  router.get('/organizations/:id/members', (req, res) => {
    const orgId = Number(req.params.id);
    const list = db.memberships
      .filter((m) => m.organization_id === orgId)
      .map((m) => {
        const u = db.users.find((x) => x.id === m.user_id);
        return {
          ...m,
          user: u ? { id: u.id, name: u.name, email: u.email, phone: u.phone, status: u.status } : null,
        };
      });
    return ok(res, list);
  });

  router.post('/organizations/:id/members', (req, res) => {
    const orgId = Number(req.params.id);
    const { email, role } = req.body ?? {};
    const target = db.users.find((u) => u.email.toLowerCase() === String(email || '').toLowerCase());
    if (!target) return fail(res, 404, 'USER_NOT_FOUND', 'لا يوجد حساب مسجّل بهذا البريد');
    const existing = db.memberships.find((m) => m.organization_id === orgId && m.user_id === target.id);
    if (existing) {
      existing.is_active = true;
      existing.role = String(role || existing.role);
      return ok(res, existing, 'تم تحديث العضوية');
    }
    const m: MembershipRecord = {
      id: db.nextIds.membership++,
      organization_id: orgId,
      user_id: target.id,
      role: String(role || 'staff'),
      is_active: true,
      joined_at: new Date().toISOString(),
      grants: [],
      denials: [],
    };
    db.memberships.push(m);
    return ok(res, m, 'تمت إضافة العضو للمنشأة', {}, 201);
  });

  router.put('/organizations/:id/members/:userId', (req, res) => {
    const m = db.memberships.find(
      (x) => x.organization_id === Number(req.params.id) && x.user_id === Number(req.params.userId)
    );
    if (!m) return fail(res, 404, 'MEMBERSHIP_NOT_FOUND', 'العضوية غير موجودة');
    if (req.body?.role) m.role = String(req.body.role);
    if (req.body?.is_active !== undefined) m.is_active = Boolean(req.body.is_active);
    return ok(res, m, 'تم تحديث دور العضو');
  });

  router.delete('/organizations/:id/members/:userId', (req, res) => {
    const orgId = Number(req.params.id);
    const userId = Number(req.params.userId);
    db.memberships = db.memberships.filter((m) => !(m.organization_id === orgId && m.user_id === userId));
    return ok(res, { removed: true });
  });

  router.get('/organizations/:id/roles', (req, res) => {
    const orgId = Number(req.params.id);
    const businessPerms = Array.from(new Set(Object.values(MEMBERSHIP_PERMISSIONS).flat()));
    const systemRoles = MEMBERSHIP_ROLES.map((r) => ({
      key: r.value,
      name_ar: r.label,
      is_system: true,
      permissions: MEMBERSHIP_PERMISSIONS[r.value] ?? [],
      holder_count: db.memberships.filter((m) => m.organization_id === orgId && m.role === r.value && m.is_active).length,
    }));
    const customRoles = db.customOrgRoles
      .filter((r) => r.organization_id === orgId)
      .map((r) => ({
        ...r,
        is_system: false,
        holder_count: db.memberships.filter((m) => m.organization_id === orgId && m.role === r.key && m.is_active).length,
      }));
    return ok(res, { permissions: businessPerms, roles: [...systemRoles, ...customRoles] });
  });

  router.post('/organizations/:id/roles', (req, res) => {
    const orgId = Number(req.params.id);
    const row = {
      id: db.nextIds.customRole++,
      organization_id: orgId,
      key: String(req.body?.key || `role_${Date.now()}`),
      name_ar: String(req.body?.name_ar || 'دور مخصص'),
      permissions: Array.isArray(req.body?.permissions) ? req.body.permissions : [],
    };
    db.customOrgRoles.push(row);
    return ok(res, row, 'تم إنشاء الدور', {}, 201);
  });

  router.put('/organizations/:id/roles/:key', (req, res) => {
    const orgId = Number(req.params.id);
    const custom = db.customOrgRoles.find((r) => r.organization_id === orgId && r.key === req.params.key);
    if (!custom) return fail(res, 404, 'ROLE_NOT_FOUND', 'الدور المخصص غير موجود');
    if (req.body?.name_ar) custom.name_ar = String(req.body.name_ar);
    if (Array.isArray(req.body?.permissions)) custom.permissions = req.body.permissions;
    return ok(res, custom);
  });

  router.delete('/organizations/:id/roles/:key', (req, res) => {
    const orgId = Number(req.params.id);
    db.customOrgRoles = db.customOrgRoles.filter((r) => !(r.organization_id === orgId && r.key === req.params.key));
    return ok(res, { deleted: true });
  });

  router.get('/organizations/:id/members/:userId/permissions', (req, res) => {
    const orgId = Number(req.params.id);
    const userId = Number(req.params.userId);
    const m = db.memberships.find((x) => x.organization_id === orgId && x.user_id === userId);
    if (!m) return fail(res, 404, 'MEMBERSHIP_NOT_FOUND', 'العضوية غير موجودة');
    const rolePerms = MEMBERSHIP_PERMISSIONS[m.role] ?? [];
    const effective = new Set(rolePerms);
    m.grants.forEach((p) => effective.add(p));
    m.denials.forEach((p) => effective.delete(p));
    return ok(res, {
      user_id: userId,
      organization_id: orgId,
      role: m.role,
      is_active: m.is_active,
      role_permissions: rolePerms,
      grants: m.grants,
      denials: m.denials,
      effective: Array.from(effective),
    });
  });

  router.put('/organizations/:id/members/:userId/permissions', (req, res) => {
    const orgId = Number(req.params.id);
    const userId = Number(req.params.userId);
    const m = db.memberships.find((x) => x.organization_id === orgId && x.user_id === userId);
    if (!m) return fail(res, 404, 'MEMBERSHIP_NOT_FOUND', 'العضوية غير موجودة');
    if (Array.isArray(req.body?.grants)) m.grants = req.body.grants;
    if (Array.isArray(req.body?.denials)) m.denials = req.body.denials;
    return ok(res, m);
  });

  router.put('/organizations/:id/members/permissions/bulk', (req, res) => {
    return ok(res, { applied: [] });
  });

  router.get('/organizations/:orgId/documents', (req, res) => {
    const orgId = Number(req.params.orgId);
    return ok(res, db.documents.filter((d) => d.organization_id === orgId));
  });

  router.post('/organizations/:orgId/documents', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    const orgId = Number(req.params.orgId);
    const doc = {
      id: db.nextIds.doc++,
      organization_id: orgId,
      type: req.body?.type || 'commercial_registration',
      reference_number: req.body?.reference_number || null,
      status: 'pending',
      original_name: 'document.pdf',
      mime_type: 'application/pdf',
      size_bytes: 12400,
      url: null,
      uploaded_at: new Date().toISOString(),
      uploaded_by_name: ctx.user.name,
    };
    db.documents.push(doc);
    return ok(res, doc, 'تم رفع الوثيقة للمراجعة', {}, 201);
  });

  router.delete('/organizations/:orgId/documents/:docId', (req, res) => {
    db.documents = db.documents.filter((d) => d.id !== Number(req.params.docId));
    return ok(res, { deleted: true });
  });

  router.put('/organizations/:orgId/documents/:docId/review', (req, res) => {
    const ctx = requireAuth(req, res);
    const doc = db.documents.find((d) => d.id === Number(req.params.docId));
    if (!doc) return fail(res, 404, 'DOCUMENT_NOT_FOUND', 'الوثيقة غير موجودة');
    doc.status = req.body?.decision === 'accept' ? 'accepted' : 'rejected';
    doc.reviewed_at = new Date().toISOString();
    doc.reviewed_by_name = ctx.user?.name ?? 'Admin';
    doc.review_reason = req.body?.reason ?? null;
    return ok(res, doc);
  });

  // -------------------------------------------------------------------------
  // Warehouses, Inventory Movements & Catalog
  // -------------------------------------------------------------------------

  router.get('/warehouses', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    if (!ctx.org) return ok(res, []);
    return ok(res, db.warehouses.filter((w) => w.organization_id === ctx.org!.id));
  });

  router.post('/warehouses', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user || !ctx.org) {
      return fail(res, 422, 'ORGANIZATION_REQUIRED', 'يلزم وجود منشأة نشطة لإضافة مستودع');
    }
    const b = req.body ?? {};
    const w = {
      id: db.nextIds.warehouse++,
      organization_id: ctx.org.id,
      name: String(b.name || 'مستودع جديد'),
      code: b.code ? String(b.code) : `WH-${ctx.org.id}-${db.nextIds.warehouse}`,
      city: String(b.city || 'عدن'),
      district: b.district ? String(b.district) : null,
      address_line: String(b.address_line || ''),
      latitude: b.latitude !== undefined && b.latitude !== null ? Number(b.latitude) : 12.7855,
      longitude: b.longitude !== undefined && b.longitude !== null ? Number(b.longitude) : 45.0187,
      contact_name: b.contact_name ? String(b.contact_name) : null,
      contact_phone: b.contact_phone ? String(b.contact_phone) : null,
      is_active: true,
    };
    db.warehouses.push(w as any);
    return ok(res, w, 'تم إنشاء المستودع', {}, 201);
  });

  router.put('/warehouses/:id', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user || !ctx.org) return;
    const w = db.warehouses.find((x) => x.id === Number(req.params.id) && x.organization_id === ctx.org!.id);
    if (!w) return fail(res, 404, 'WAREHOUSE_NOT_FOUND', 'المستودع غير موجود');
    Object.assign(w, req.body ?? {});
    return ok(res, w, 'تم تحديث بيانات المستودع');
  });

  router.get('/inventory-movements', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user || !ctx.org) return paginated(res, [], 1, 20);
    let list = db.movements.filter((m) => m.organization_id === ctx.org!.id);
    if (req.query.offer_id) list = list.filter((m) => Number(m.offer_id) === Number(req.query.offer_id));
    if (req.query.type) list = list.filter((m) => m.type === req.query.type);
    return paginated(res, list, req.query.page, req.query.per_page || 20);
  });

  router.post('/inventory-movements/adjust', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user || !ctx.org) return;
    const { offer_id, type, quantity, reason } = req.body ?? {};
    const offer = db.offers.find((o) => o.id === Number(offer_id) && o.seller_organization_id === ctx.org!.id);
    if (!offer) return fail(res, 404, 'OFFER_NOT_FOUND', 'العرض غير موجود');
    const qty = Number(quantity || 0);
    if ((type === 'IN' || type === 'RETURNED') && qty <= 0) {
      return fail(res, 422, 'QUANTITY_MUST_BE_POSITIVE', 'الكمية يجب أن تكون موجبة');
    }
    const prev = Number(offer.available_quantity);
    const next = Math.max(0, prev + qty);
    offer.available_quantity = next;
    offer.total_quantity = Math.max(Number(offer.total_quantity), next + Number(offer.reserved_quantity) + Number(offer.sold_quantity));

    const mv = {
      id: db.nextIds.movement++,
      organization_id: ctx.org.id,
      warehouse_id: offer.warehouse_id,
      product_variant_id: offer.product_variant_id,
      offer_id: offer.id,
      user_id: ctx.user.id,
      type: type || 'ADJUSTED',
      quantity: qty,
      previous_quantity: prev,
      new_quantity: next,
      reason: String(reason || ''),
      created_at: new Date().toISOString(),
      user: { id: ctx.user.id, name: ctx.user.name },
    };
    db.movements.unshift(mv);
    return ok(res, mv, 'تم تسجيل حركة المخزون', {}, 201);
  });

  router.get('/catalog/products', (req, res) => {
    let list = db.products.map((p) => ({
      ...p,
      category_name_ar: db.categories.find((c) => c.id === p.category_id)?.name_ar ?? null,
      brand_name_ar: db.brands.find((b) => b.id === p.brand_id)?.name_ar ?? null,
      variants: db.variants.filter((v) => v.product_id === p.id),
    }));
    if (req.query.category_id) list = list.filter((p) => p.category_id === Number(req.query.category_id));
    if (req.query.search) {
      const q = String(req.query.search).toLowerCase();
      list = list.filter((p) => p.name_ar.toLowerCase().includes(q) || (p.name_en || '').toLowerCase().includes(q));
    }
    return paginated(res, list, req.query.page, 20);
  });

  router.post('/catalog/products', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user || !ctx.org) return;
    const b = req.body ?? {};
    const product = {
      id: db.nextIds.product++,
      organization_id: ctx.org.id,
      category_id: Number(b.category_id || 1),
      brand_id: b.brand_id ? Number(b.brand_id) : null,
      sku: String(b.sku || `SKU-${Date.now()}`),
      name_ar: String(b.name_ar || 'منتج جديد'),
      name_en: b.name_en ? String(b.name_en) : null,
      description_ar: b.description_ar ? String(b.description_ar) : null,
      unit: String(b.unit || 'carton'),
      package_size: b.package_size ? String(b.package_size) : null,
      temperature_class: String(b.temperature_class || 'AMBIENT'),
      shelf_life_days: b.shelf_life_days ? Number(b.shelf_life_days) : 180,
      is_active: true,
    };
    db.products.unshift(product as any);
    const variant = {
      id: db.nextIds.variant++,
      product_id: product.id,
      sku: `${product.sku}-V1`,
      name_ar: product.name_ar,
      name_en: product.name_en || product.name_ar,
      weight_kg: b.weight_kg ? Number(b.weight_kg) : 10,
      packaging_spec: product.package_size || product.unit,
      is_active: true,
    };
    db.variants.push(variant as any);
    return ok(res, { ...product, variants: [variant] }, 'تمت إضافة الصنف للكتالوج', {}, 201);
  });

  router.put('/catalog/products/:id', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user || !ctx.org) return;
    const product = db.products.find((p) => p.id === Number(req.params.id));
    if (!product) return fail(res, 404, 'PRODUCT_NOT_FOUND', 'الصنف غير موجود');
    if (product.organization_id === null) {
      return fail(res, 403, 'PLATFORM_REFERENCE_NOT_EDITABLE', 'أصناف المرجع العام لا يمكن تعديلها');
    }
    if (product.organization_id !== ctx.org.id) {
      return fail(res, 403, 'PRODUCT_NOT_OWNED', 'لا تملك صلاحية تعديل هذا الصنف');
    }
    Object.assign(product, req.body ?? {});
    return ok(res, product, 'تم تحديث الصنف');
  });

  router.get('/catalog/products/:id/variants', (req, res) => {
    const productId = Number(req.params.id);
    return ok(res, db.variants.filter((v) => v.product_id === productId));
  });

  router.get('/catalog/products/:productId/images', (req, res) => {
    return ok(res, db.productImages.filter((i) => i.product_id === Number(req.params.productId)));
  });

  router.post('/catalog/products/:productId/images', (req, res) => {
    const productId = Number(req.params.productId);
    const img = {
      id: db.nextIds.productImage++,
      product_id: productId,
      url: null,
      is_cover: db.productImages.filter((i) => i.product_id === productId).length === 0,
      sort_order: 1,
      original_name: 'image.png',
      uploaded_at: new Date().toISOString(),
    };
    db.productImages.push(img);
    return ok(res, { images: [img], rejected: [] }, 'تمت إضافة الصورة', {}, 201);
  });

  router.put('/catalog/products/:productId/images/:imageId', (req, res) => {
    const img = db.productImages.find((i) => i.id === Number(req.params.imageId));
    if (!img) return fail(res, 404, 'IMAGE_NOT_FOUND', 'الصورة غير موجودة');
    Object.assign(img, req.body ?? {});
    return ok(res, img);
  });

  router.delete('/catalog/products/:productId/images/:imageId', (req, res) => {
    db.productImages = db.productImages.filter((i) => i.id !== Number(req.params.imageId));
    return ok(res, { id: Number(req.params.imageId), deleted: true });
  });

  // -------------------------------------------------------------------------
  // Demands, Quotations, Matches, Purchase Requests, Reservations & Deals
  // -------------------------------------------------------------------------

  router.get('/demands', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    let list = db.demands;
    if (req.query.my_demands && ctx.org) {
      list = list.filter((d) => d.buyer_organization_id === ctx.org!.id);
    }
    return paginated(res, list, req.query.page, 20);
  });

  router.post('/demands', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user || !ctx.org) {
      return fail(res, 422, 'ORGANIZATION_REQUIRED', 'يلزم وجود منشأة نشطة لإنشاء طلب احتياج');
    }
    const b = req.body ?? {};
    const demand = {
      id: db.nextIds.demand++,
      buyer_organization_id: ctx.org.id,
      buyer_user_id: ctx.user.id,
      category_id: Number(b.category_id || 1),
      title_ar: String(b.title_ar || 'طلب احتياج تجاري'),
      title_en: b.title_en || null,
      required_quantity: Number(b.required_quantity || 10),
      unit: String(b.unit || 'carton'),
      target_unit_price: b.target_unit_price ? Number(b.target_unit_price) : null,
      currency_code: String(b.currency_code || 'YER'),
      city: String(b.city || ctx.org.city || 'عدن'),
      delivery_preference: String(b.delivery_preference || 'BOTH'),
      status: 'OPEN',
      buyer_organization: ctx.org,
      created_at: new Date().toISOString(),
    };
    db.demands.unshift(demand);

    // Run rule-based matching against active offers in same category
    const matchingOffers = db.offers.filter(
      (o) => o.status === 'ACTIVE' && o.seller_organization_id !== ctx.org!.id && Number(o.category_id) === demand.category_id
    );
    matchingOffers.forEach((o) => {
      db.matches.push({
        id: db.nextIds.match++,
        demand_id: demand.id,
        offer_id: o.id,
        buyer_organization_id: ctx.org!.id,
        seller_organization_id: o.seller_organization_id,
        requested_quantity: Math.min(demand.required_quantity, Number(o.available_quantity)),
        match_score: 88,
        match_reasons: ['تطابق الفئة الغذائية', 'كمية متاحة في المخزون'],
        estimated_total: (Math.min(demand.required_quantity, Number(o.available_quantity)) * Number(o.unit_price)).toFixed(2),
        status: 'SUGGESTED',
        offer: hydrateOffer(o, ctx.org!.id),
      });
    });

    return ok(res, demand, 'تم تسجيل طلب الاحتياج', {}, 201);
  });

  router.get('/demands/:id/matches', (req, res) => {
    const demandId = Number(req.params.id);
    const list = db.matches
      .filter((m) => m.demand_id === demandId)
      .map((m) => {
        const o = db.offers.find((x) => x.id === m.offer_id);
        return { ...m, offer: o ? hydrateOffer(o) : null };
      });
    return ok(res, list);
  });

  router.post('/demands/:id/quotations', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user || !ctx.org) return;
    return ok(res, { id: Date.now(), demand_id: Number(req.params.id), seller_organization_id: ctx.org.id, ...req.body }, 'تم إرسال عرض السعر', {}, 201);
  });

  router.get('/purchase-requests', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user || !ctx.org) return paginated(res, [], 1, 20);
    const list = db.purchaseRequests.filter(
      (pr) => pr.buyer_organization_id === ctx.org!.id || pr.seller_organization_id === ctx.org!.id
    );
    return paginated(res, list, req.query.page, 20);
  });

  router.get('/purchase-requests/:id', (req, res) => {
    const pr = db.purchaseRequests.find((x) => x.id === Number(req.params.id));
    if (!pr) return fail(res, 404, 'PURCHASE_REQUEST_NOT_FOUND', 'طلب الشراء غير موجود');
    return ok(res, pr);
  });

  const createPR = (ctx: NonNullable<ReturnType<typeof requireAuth>>, offer: typeof db.offers[number], qty: number, body: Record<string, any>) => {
    if (!ctx.org) return null;
    const sellerOrg = db.organizations.find((o) => o.id === offer.seller_organization_id);
    const pr = {
      id: db.nextIds.purchaseRequest++,
      request_number: `PR-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(db.nextIds.purchaseRequest).padStart(4, '0')}`,
      offer_id: offer.id,
      buyer_organization_id: ctx.org.id,
      seller_organization_id: offer.seller_organization_id,
      buyer_user_id: ctx.user!.id,
      requested_quantity: qty,
      proposed_unit_price: body.proposed_unit_price ?? offer.unit_price,
      currency_code: offer.currency_code,
      delivery_preference: body.delivery_preference || 'PICKUP',
      notes: body.notes || null,
      status: 'PENDING_SELLER_REVIEW',
      offer: hydrateOffer(offer, ctx.org.id),
      buyer_organization: ctx.org,
      seller_organization: sellerOrg ?? null,
      created_at: new Date().toISOString(),
    };
    db.purchaseRequests.unshift(pr);
    return pr;
  };

  router.post('/purchase-requests', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user || !ctx.org) {
      return fail(res, 422, 'ORGANIZATION_REQUIRED', 'يلزم اختيار أو إنشاء منشأة قبل إرسال طلب شراء');
    }
    const { offer_id, requested_quantity } = req.body ?? {};
    const offer = db.offers.find((o) => o.id === Number(offer_id));
    if (!offer) return fail(res, 404, 'OFFER_NOT_FOUND', 'العرض غير موجود');
    if (offer.seller_organization_id === ctx.org.id) {
      return fail(res, 422, 'SELF_TRADE_FORBIDDEN', 'لا يمكن للمنشأة الشراء من عرضها الخاص');
    }
    const qty = Number(requested_quantity || offer.min_order_quantity);
    if (qty > Number(offer.available_quantity)) {
      return fail(res, 422, 'INSUFFICIENT_STOCK', 'الكمية المطلوبة تتجاوز المتاح في العرض');
    }
    const pr = createPR(ctx, offer, qty, req.body ?? {});
    return ok(res, pr, 'تم إرسال طلب الشراء للبائع للمراجعة', {}, 201);
  });

  router.post('/purchase-requests/matches/:matchId', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user || !ctx.org) return;
    const match = db.matches.find((m) => m.id === Number(req.params.matchId));
    if (!match) return fail(res, 404, 'MATCH_NOT_FOUND', 'المطابقة غير موجودة');
    const offer = db.offers.find((o) => o.id === match.offer_id);
    if (!offer) return fail(res, 404, 'OFFER_NOT_FOUND', 'العرض غير موجود');
    const qty = Number(req.body?.requested_quantity || match.requested_quantity);
    const pr = createPR(ctx, offer, qty, req.body ?? {});
    match.status = 'REQUESTED';
    return ok(res, pr, 'تم إنشاء طلب الشراء من المطابقة', {}, 201);
  });

  router.post('/purchase-requests/:id/accept', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user || !ctx.org) return;
    const pr = db.purchaseRequests.find((x) => x.id === Number(req.params.id));
    if (!pr) return fail(res, 404, 'PURCHASE_REQUEST_NOT_FOUND', 'طلب الشراء غير موجود');
    const offer = db.offers.find((o) => o.id === pr.offer_id);
    if (offer) {
      const qty = Number(pr.requested_quantity);
      offer.available_quantity = Math.max(0, Number(offer.available_quantity) - qty);
      offer.reserved_quantity = Number(offer.reserved_quantity) + qty;
    }
    const timeoutMins = Number(getSettingValue('reservation.timeout', '30')) || 30;
    const reservation = {
      id: db.nextIds.reservation++,
      reservation_number: `RES-${String(db.nextIds.reservation).padStart(5, '0')}`,
      offer_id: pr.offer_id,
      purchase_request_id: pr.id,
      buyer_organization_id: pr.buyer_organization_id,
      seller_organization_id: pr.seller_organization_id,
      quantity: pr.requested_quantity,
      status: 'ACTIVE',
      expires_at: new Date(Date.now() + timeoutMins * 60_000).toISOString(),
      created_at: new Date().toISOString(),
    };
    db.reservations.unshift(reservation);
    pr.status = 'ACCEPTED';
    pr.reservation = reservation;
    return ok(res, pr, 'تم قبول طلب الشراء وحجز الكمية');
  });

  router.post('/purchase-requests/:id/reject', (req, res) => {
    const pr = db.purchaseRequests.find((x) => x.id === Number(req.params.id));
    if (!pr) return fail(res, 404, 'PURCHASE_REQUEST_NOT_FOUND', 'طلب الشراء غير موجود');
    pr.status = 'REJECTED';
    pr.rejection_reason = req.body?.reason || null;
    return ok(res, pr, 'تم رفض طلب الشراء');
  });

  router.post('/purchase-requests/:id/propose', (req, res) => {
    const pr = db.purchaseRequests.find((x) => x.id === Number(req.params.id));
    if (!pr) return fail(res, 404, 'PURCHASE_REQUEST_NOT_FOUND', 'طلب الشراء غير موجود');
    pr.status = 'COUNTER_PROPOSED';
    pr.proposed_terms = req.body?.proposed_terms ?? null;
    return ok(res, pr, 'تم إرسال العرض المقابل');
  });

  router.post('/purchase-requests/:id/accept-proposal', (req, res) => {
    const pr = db.purchaseRequests.find((x) => x.id === Number(req.params.id));
    if (!pr) return fail(res, 404, 'PURCHASE_REQUEST_NOT_FOUND', 'طلب الشراء غير موجود');
    if (pr.proposed_terms?.quantity) pr.requested_quantity = pr.proposed_terms.quantity;
    if (pr.proposed_terms?.unit_price) pr.proposed_unit_price = pr.proposed_terms.unit_price;
    pr.status = 'PENDING_SELLER_REVIEW';
    return ok(res, pr, 'تم اعتماد الشروط المقترحة');
  });

  router.post('/purchase-requests/:id/cancel', (req, res) => {
    const pr = db.purchaseRequests.find((x) => x.id === Number(req.params.id));
    if (!pr) return fail(res, 404, 'PURCHASE_REQUEST_NOT_FOUND', 'طلب الشراء غير موجود');
    pr.status = 'CANCELLED';
    return ok(res, pr, 'تم إلغاء طلب الشراء');
  });

  router.get('/marketplace/reservations', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user || !ctx.org) return paginated(res, [], 1, 20);
    const list = db.reservations.filter(
      (r) => r.buyer_organization_id === ctx.org!.id || r.seller_organization_id === ctx.org!.id
    );
    return paginated(res, list, req.query.page, 20);
  });

  router.post('/marketplace/reservations/:id/cancel', (req, res) => {
    const r = db.reservations.find((x) => x.id === Number(req.params.id));
    if (!r) return fail(res, 404, 'RESERVATION_NOT_FOUND', 'الحجز غير موجود');
    if (r.status === 'ACTIVE') {
      r.status = 'CANCELLED';
      const offer = db.offers.find((o) => o.id === r.offer_id);
      if (offer) {
        offer.reserved_quantity = Math.max(0, Number(offer.reserved_quantity) - Number(r.quantity));
        offer.available_quantity = Number(offer.available_quantity) + Number(r.quantity);
      }
    }
    return ok(res, r, 'تم تحرير الحجز وإرجاع الكمية للمتاح');
  });

  const hydrateDeal = (deal: Record<string, any>) => {
    const handover = db.handovers.find((h) => h.deal_id === deal.id) ?? null;
    const dispute = db.disputes.find((d) => d.deal_id === deal.id) ?? null;
    const offer = deal.offer_id ? db.offers.find((o) => o.id === deal.offer_id) : null;
    const buyerOrg = db.organizations.find((o) => o.id === deal.buyer_organization_id) ?? null;
    const sellerOrg = db.organizations.find((o) => o.id === deal.seller_organization_id) ?? null;
    return {
      ...deal,
      handover,
      dispute,
      offer: offer ? hydrateOffer(offer) : null,
      buyer_organization: buyerOrg,
      seller_organization: sellerOrg,
    };
  };

  router.get('/deals', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    let list = db.deals;
    if (ctx.org && !ctx.user.roles.includes('SuperAdmin')) {
      list = list.filter((d) => d.buyer_organization_id === ctx.org!.id || d.seller_organization_id === ctx.org!.id);
      if (req.query.perspective === 'buyer') list = list.filter((d) => d.buyer_organization_id === ctx.org!.id);
      if (req.query.perspective === 'seller') list = list.filter((d) => d.seller_organization_id === ctx.org!.id);
    }
    if (req.query.status) list = list.filter((d) => d.status === req.query.status);
    return paginated(res, list.map(hydrateDeal), req.query.page, 20);
  });

  router.post('/deals', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user || !ctx.org) return;
    const { reservation_id, delivery_method, delivery_address } = req.body ?? {};
    const reservation = db.reservations.find((r) => r.id === Number(reservation_id));
    if (!reservation) return fail(res, 404, 'RESERVATION_NOT_FOUND', 'الحجز غير موجود');
    const offer = db.offers.find((o) => o.id === reservation.offer_id);
    const pr = db.purchaseRequests.find((p) => p.id === reservation.purchase_request_id);
    const qty = Number(reservation.quantity);
    const unitPrice = Number(pr?.proposed_unit_price ?? offer?.unit_price ?? 0);
    const baseAmount = qty * unitPrice;
    const taxRate = getSettingBool('tax.enabled', false) ? Number(getSettingValue('tax.rate', '0')) : 0;
    const commRate = Number(getSettingValue('commission.rate', '0'));
    const taxAmt = getSettingBool('tax.inclusive', false) ? 0 : baseAmount * taxRate;
    const commAmt = baseAmount * commRate;

    const dealId = db.nextIds.deal++;
    const deal = {
      id: dealId,
      deal_number: `DEAL-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(dealId).padStart(4, '0')}`,
      offer_id: offer?.id ?? null,
      reservation_id: reservation.id,
      purchase_request_id: reservation.purchase_request_id,
      buyer_organization_id: reservation.buyer_organization_id,
      seller_organization_id: reservation.seller_organization_id,
      buyer_user_id: ctx.user.id,
      warehouse_id: offer?.warehouse_id ?? null,
      quantity: qty,
      unit_price: unitPrice.toFixed(2),
      currency_code: offer?.currency_code ?? 'YER',
      base_amount: baseAmount.toFixed(2),
      tax_rate_snapshot: taxRate.toFixed(4),
      tax_amount: taxAmt.toFixed(2),
      platform_fee_rate_snapshot: commRate.toFixed(4),
      platform_fee_amount: commAmt.toFixed(2),
      buyer_total_amount: (baseAmount + taxAmt).toFixed(2),
      seller_net_amount: (baseAmount - commAmt).toFixed(2),
      status: 'PENDING_SELLER_APPROVAL',
      delivery_method: delivery_method || 'PICKUP',
      delivery_address: delivery_address || null,
      inspection_window_hours: Number(getSettingValue('inspection.window', '48')) || 48,
      created_at: new Date().toISOString(),
      status_histories: [
        {
          id: 1,
          deal_id: dealId,
          from_status: null,
          to_status: 'PENDING_SELLER_APPROVAL',
          changed_by_user_id: ctx.user.id,
          changed_by_user: { id: ctx.user.id, name: ctx.user.name },
          notes: 'تم إنشاء الصفقة من الحجز',
          created_at: new Date().toISOString(),
        },
      ],
    };
    reservation.status = 'CONVERTED';
    db.deals.unshift(deal);
    return ok(res, hydrateDeal(deal), 'تم إنشاء الصفقة', {}, 201);
  });

  router.get('/deals/:id', (req, res) => {
    const deal = db.deals.find((d) => d.id === Number(req.params.id));
    if (!deal) return fail(res, 404, 'DEAL_NOT_FOUND', 'الصفقة غير موجودة');
    return ok(res, hydrateDeal(deal));
  });

  router.post('/deals/:id/transition', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    const deal = db.deals.find((d) => d.id === Number(req.params.id));
    if (!deal) return fail(res, 404, 'DEAL_NOT_FOUND', 'الصفقة غير موجودة');
    const nextStatus = String(req.body?.status || '');
    const handover = db.handovers.find((h) => h.deal_id === deal.id);
    if (nextStatus === 'COMPLETED' && handover && handover.status !== 'USED') {
      return fail(res, 422, 'HANDOVER_VERIFICATION_REQUIRED', 'يلزم التحقق من رمز التسليم قبل إغلاق الصفقة');
    }
    const prev = deal.status;
    deal.status = nextStatus;
    if (nextStatus === 'ACCEPTED' && !handover) {
      deal.accepted_at = new Date().toISOString();
      const code = `HSL-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      db.handovers.push({
        id: db.nextIds.handover++,
        deal_id: deal.id,
        code,
        status: 'ACTIVE',
        issued_by_user_id: ctx.user.id,
        issued_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });
    }
    if (nextStatus === 'DISPATCHED') deal.dispatched_at = new Date().toISOString();
    if (nextStatus === 'DELIVERED') deal.delivered_at = new Date().toISOString();
    if (nextStatus === 'COMPLETED') {
      deal.completed_at = new Date().toISOString();
      const offer = db.offers.find((o) => o.id === deal.offer_id);
      if (offer) {
        offer.reserved_quantity = Math.max(0, Number(offer.reserved_quantity) - Number(deal.quantity));
        offer.sold_quantity = Number(offer.sold_quantity) + Number(deal.quantity);
      }
      db.ledgerEntries.unshift({
        id: db.nextIds.ledgerEntry++,
        entry_number: `JE-${String(db.nextIds.ledgerEntry).padStart(5, '0')}`,
        transaction_reference: deal.deal_number,
        currency_code: deal.currency_code,
        description: `توثيق إتمام الصفقة ${deal.deal_number}`,
        entity_type: 'Deal',
        entity_id: deal.id,
        total_debit: deal.buyer_total_amount,
        total_credit: deal.buyer_total_amount,
        posted_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });
    }
    deal.status_histories.push({
      id: deal.status_histories.length + 1,
      deal_id: deal.id,
      from_status: prev,
      to_status: nextStatus,
      changed_by_user_id: ctx.user.id,
      changed_by_user: { id: ctx.user.id, name: ctx.user.name },
      notes: req.body?.notes ?? null,
      created_at: new Date().toISOString(),
    });
    return ok(res, hydrateDeal(deal), 'تم تحديث حالة الصفقة');
  });

  router.get('/deals/:id/handover', (req, res) => {
    const deal = db.deals.find((d) => d.id === Number(req.params.id));
    if (!deal) return fail(res, 404, 'DEAL_NOT_FOUND', 'الصفقة غير موجودة');
    const handover = db.handovers.find((h) => h.deal_id === deal.id);
    if (!handover) return fail(res, 422, 'HANDOVER_NOT_ISSUED', 'لم يُصدر رمز التسليم بعد — يُصدر عند قبول البائع للصفقة');
    const payload = `HASSAL:${deal.deal_number}:${handover.code}`;
    return ok(res, {
      ...handover,
      deal_number: deal.deal_number,
      qr_payload: payload,
      qr: generateQrSymbol(payload),
      deal_status: deal.status,
      verifiable: handover.status === 'ACTIVE',
    });
  });

  router.get('/deals/:id/handover/label', (req, res) => {
    const deal = db.deals.find((d) => d.id === Number(req.params.id));
    if (!deal) return fail(res, 404, 'DEAL_NOT_FOUND', 'الصفقة غير موجودة');
    const handover = db.handovers.find((h) => h.deal_id === deal.id);
    if (!handover) return fail(res, 422, 'HANDOVER_NOT_ISSUED', 'لم يُصدر رمز التسليم بعد');
    const svg = qrSymbolToSvg(generateQrSymbol(`HASSAL:${deal.deal_number}:${handover.code}`));
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    return res.send(svg);
  });

  router.post('/deals/:id/handover/verify', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    const deal = db.deals.find((d) => d.id === Number(req.params.id));
    if (!deal) return fail(res, 404, 'DEAL_NOT_FOUND', 'الصفقة غير موجودة');
    const handover = db.handovers.find((h) => h.deal_id === deal.id);
    if (!handover) return fail(res, 422, 'HANDOVER_NOT_ISSUED', 'لم يُصدر رمز تسليم لهذه الصفقة');
    if (handover.status === 'USED') return fail(res, 422, 'HANDOVER_ALREADY_USED', 'تم استخدام رمز التسليم مسبقاً');
    const raw = String(req.body?.code || '').trim();
    const expectedPayload = `HASSAL:${deal.deal_number}:${handover.code}`;
    if (raw !== handover.code && raw !== expectedPayload) {
      return fail(res, 422, 'HANDOVER_CODE_MISMATCH', 'رمز التسليم المدخل غير مطابق');
    }
    handover.status = 'USED';
    handover.verified_at = new Date().toISOString();
    handover.verified_by_user_id = ctx.user.id;
    handover.verified_by_organization_id = ctx.org?.id ?? null;
    handover.verification_notes = req.body?.notes ?? null;
    return ok(res, {
      ...handover,
      deal_number: deal.deal_number,
      qr_payload: expectedPayload,
      qr: generateQrSymbol(expectedPayload),
      deal_status: deal.status,
      verifiable: false,
      next_step: 'يمكن الآن إغلاق الصفقة كـ COMPLETED',
    }, 'تم التحقق من رمز التسليم بنجاح');
  });

  // -------------------------------------------------------------------------
  // Disputes, Ledger, Reports, Admin & Settings
  // -------------------------------------------------------------------------

  router.get('/disputes', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    let list = db.disputes;
    if (req.query.status) list = list.filter((d) => d.status === req.query.status);
    return paginated(res, list.map((d) => ({ ...d, deal: db.deals.find((x) => x.id === d.deal_id) ?? null })), req.query.page, 20);
  });

  router.post('/disputes', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user || !ctx.org) return;
    const { deal_id, reason, description, claimed_amount } = req.body ?? {};
    const deal = db.deals.find((d) => d.id === Number(deal_id));
    if (!deal) return fail(res, 404, 'DEAL_NOT_FOUND', 'الصفقة غير موجودة');
    deal.status = 'DISPUTED';
    const d = {
      id: db.nextIds.dispute++,
      dispute_number: `DSP-${String(db.nextIds.dispute).padStart(4, '0')}`,
      deal_id: deal.id,
      initiator_organization_id: ctx.org.id,
      initiator_user_id: ctx.user.id,
      reason: String(reason || 'OTHER'),
      description: description || null,
      claimed_amount: Number(claimed_amount || 0).toFixed(2),
      status: 'OPEN',
      created_at: new Date().toISOString(),
    };
    db.disputes.unshift(d);
    return ok(res, d, 'تم فتح النزاع', {}, 201);
  });

  router.post('/disputes/:id/resolve', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    const d = db.disputes.find((x) => x.id === Number(req.params.id));
    if (!d) return fail(res, 404, 'DISPUTE_NOT_FOUND', 'النزاع غير موجود');
    d.status = req.body?.status || 'RESOLVED_RELEASE';
    d.resolution_notes = req.body?.notes || '';
    d.resolved_by_user_id = ctx.user.id;
    d.resolved_at = new Date().toISOString();
    const deal = db.deals.find((x) => x.id === d.deal_id);
    if (deal) {
      deal.status = d.status === 'RESOLVED_CANCELLATION' ? 'CANCELLED' : 'RESOLVED';
    }
    return ok(res, d, 'تم البت في النزاع');
  });

  router.get('/ledger/accounts', (_req, res) => ok(res, db.ledgerAccounts));
  router.get('/ledger/journal-entries', (req, res) => paginated(res, db.ledgerEntries, req.query.page, 20));
  router.get('/ledger/trial-balance', (_req, res) => {
    return ok(res, {
      accounts: db.ledgerAccounts.map((a) => ({
        account_code: a.account_code,
        name_ar: a.name_ar,
        name_en: a.name_en,
        type: a.type,
        debit: Number(a.balance || 0),
        credit: 0,
      })),
      total_debit: 0,
      total_credit: 0,
      is_balanced: true,
      generated_at: new Date().toISOString(),
    });
  });

  router.get('/reports/sales-summary', (_req, res) => {
    const completed = db.deals.filter((d) => d.status === 'COMPLETED');
    const gmv = completed.reduce((acc, d) => acc + Number(d.buyer_total_amount || 0), 0);
    const comm = completed.reduce((acc, d) => acc + Number(d.platform_fee_amount || 0), 0);
    return ok(res, {
      total_deals_count: db.deals.length,
      completed_deals_count: completed.length,
      counted_statuses: ['COMPLETED'],
      gross_merchandise_value: gmv,
      platform_commission_accrued: comm,
      period_from: null,
      period_to: null,
      period_field: 'created_at',
      currency: getSettingValue('platform.default_currency', 'YER'),
      generated_at: new Date().toISOString(),
    });
  });

  router.get('/reports/export/deals-csv', (_req, res) => {
    const header = 'deal_number,status,quantity,unit_price,currency_code,buyer_total_amount,created_at\n';
    const rows = db.deals
      .map((d) => `${d.deal_number},${d.status},${d.quantity},${d.unit_price},${d.currency_code},${d.buyer_total_amount},${d.created_at}`)
      .join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="hassal-deals.csv"');
    return res.send(header + rows);
  });

  // Notifications
  router.get('/notifications', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    return paginated(res, db.notifications.filter((n) => n.user_id === ctx.user!.id), req.query.page, 20);
  });

  router.get('/notifications/unread-count', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    const count = db.notifications.filter((n) => n.user_id === ctx.user!.id && !n.read_at).length;
    return ok(res, { unread_count: count });
  });

  router.post('/notifications/:id/read', (req, res) => {
    const n = db.notifications.find((x) => x.id === Number(req.params.id));
    if (n) n.read_at = new Date().toISOString();
    return ok(res, n ?? { read: true });
  });

  router.post('/notifications/read-all', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    db.notifications.filter((n) => n.user_id === ctx.user!.id).forEach((n) => {
      n.read_at = new Date().toISOString();
    });
    return ok(res, { read_all: true });
  });

  // Support
  router.post('/support/tickets', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    const id = db.nextIds.supportTicket++;
    const ticket = {
      id,
      reference: `SUP-${String(id).padStart(5, '0')}`,
      user_id: ctx.user.id,
      filed_by: ctx.user.name,
      organization_id: ctx.org?.id ?? null,
      organization_name: ctx.org?.name_ar ?? null,
      category: req.body?.category || 'bug',
      message: String(req.body?.message || ''),
      screen: req.body?.screen || null,
      context: req.body?.context || null,
      status: 'open',
      reply: null,
      answered_at: null,
      answered_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.supportTickets.unshift(ticket);
    return ok(res, ticket, 'تم استلام البلاغ', {}, 201);
  });

  router.get('/support/tickets', (req, res) => {
    const ctx = requireAuth(req, res);
    if (!ctx || !ctx.user) return;
    return paginated(res, db.supportTickets.filter((t) => t.user_id === ctx.user!.id), req.query.page, 20);
  });

  router.get('/support/queue', (req, res) => paginated(res, db.supportTickets, req.query.page, 20));
  router.get('/support/summary', (_req, res) => {
    const by_status = {
      open: db.supportTickets.filter((t) => t.status === 'open').length,
      in_review: db.supportTickets.filter((t) => t.status === 'in_review').length,
      resolved: db.supportTickets.filter((t) => t.status === 'resolved').length,
      dismissed: db.supportTickets.filter((t) => t.status === 'dismissed').length,
    };
    return ok(res, {
      by_status,
      awaiting_attention: by_status.open + by_status.in_review,
      oldest_open_at: null,
      oldest_open_minutes: null,
    });
  });

  router.put('/support/tickets/:id/answer', (req, res) => {
    const ctx = requireAuth(req, res);
    const t = db.supportTickets.find((x) => x.id === Number(req.params.id));
    if (!t) return fail(res, 404, 'TICKET_NOT_FOUND', 'البلاغ غير موجود');
    t.reply = req.body?.reply ?? null;
    t.status = req.body?.status ?? 'resolved';
    t.answered_at = new Date().toISOString();
    t.answered_by = ctx.user?.name ?? 'Admin';
    return ok(res, t);
  });

  // Settings, Flags, Currencies, Users, RBAC, Audit, API Keys, Webhooks
  router.get('/settings', (req, res) => {
    let list = db.settings;
    if (req.query.group) list = list.filter((s) => s.group === req.query.group);
    return ok(res, list);
  });

  router.post('/settings/update', (req, res) => {
    const { key, value } = req.body ?? {};
    const row = db.settings.find((s) => s.key === key);
    if (!row) return fail(res, 404, 'SETTING_NOT_FOUND', 'الإعداد غير موجود');
    row.value = String(value ?? '');
    return ok(res, row, 'تم حفظ الإعداد');
  });

  router.get('/feature-flags', (_req, res) => ok(res, db.featureFlags));
  router.post('/feature-flags/:key/toggle', (req, res) => {
    const flag = db.featureFlags.find((f) => f.key === req.params.key);
    if (!flag) return fail(res, 404, 'FLAG_NOT_FOUND', 'الميزة غير موجودة');
    flag.is_enabled = Boolean(req.body?.is_enabled);
    flag.updated_at = new Date().toISOString();
    return ok(res, flag, 'تم تحديث حالة الميزة');
  });

  router.get('/currencies', (_req, res) => ok(res, db.currencies));
  router.post('/currencies', (req, res) => {
    const b = req.body ?? {};
    const c = {
      id: db.nextIds.currency++,
      iso_code: String(b.iso_code || 'USD').toUpperCase(),
      name_ar: String(b.name_ar || ''),
      name_en: String(b.name_en || ''),
      symbol: String(b.symbol || ''),
      decimal_places: Number(b.decimal_places ?? 2),
      exchange_rate_to_base: String(b.exchange_rate_to_base || '1.000000'),
      rate_source: String(b.rate_source || 'MANUAL'),
      is_active: Boolean(b.is_active ?? false),
      is_default: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.currencies.push(c);
    return ok(res, c, 'تمت إضافة العملة', {}, 201);
  });

  router.put('/currencies/:id', (req, res) => {
    const c = db.currencies.find((x) => x.id === Number(req.params.id));
    if (!c) return fail(res, 404, 'CURRENCY_NOT_FOUND', 'العملة غير موجودة');
    Object.assign(c, req.body ?? {}, { updated_at: new Date().toISOString() });
    return ok(res, c);
  });

  router.post('/currencies/:id/set-default', (req, res) => {
    const id = Number(req.params.id);
    db.currencies.forEach((c) => {
      c.is_default = c.id === id;
      if (c.id === id) c.is_active = true;
    });
    return ok(res, db.currencies.find((c) => c.id === id));
  });

  router.get('/users/roles', (_req, res) => {
    return ok(
      res,
      PLATFORM_ROLES.map((r) => ({
        id: r.id,
        name: r.name,
        permission_count: r.permissions.length,
        permissions: r.permissions,
      }))
    );
  });

  router.get('/users', (req, res) => {
    const list = db.users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      national_id: u.national_id,
      status: u.status,
      roles: u.roles,
      organizations: buildOrgList(u.id),
      created_at: u.created_at,
    }));
    return paginated(res, list, req.query.page, 20);
  });

  router.get('/users/:id', (req, res) => {
    const u = db.users.find((x) => x.id === Number(req.params.id));
    if (!u) return fail(res, 404, 'USER_NOT_FOUND', 'المستخدم غير موجود');
    return ok(res, { ...u, organizations: buildOrgList(u.id) });
  });

  router.put('/users/:id/status', (req, res) => {
    const u = db.users.find((x) => x.id === Number(req.params.id));
    if (!u) return fail(res, 404, 'USER_NOT_FOUND', 'المستخدم غير موجود');
    u.status = req.body?.status || u.status;
    return ok(res, u);
  });

  router.post('/users/:id/roles', (req, res) => {
    const u = db.users.find((x) => x.id === Number(req.params.id));
    if (!u) return fail(res, 404, 'USER_NOT_FOUND', 'المستخدم غير موجود');
    const role = String(req.body?.role || '');
    if (role && !u.roles.includes(role)) u.roles.push(role);
    return ok(res, u);
  });

  router.delete('/users/:id/roles/:roleName', (req, res) => {
    const u = db.users.find((x) => x.id === Number(req.params.id));
    if (!u) return fail(res, 404, 'USER_NOT_FOUND', 'المستخدم غير موجود');
    u.roles = u.roles.filter((r) => r !== req.params.roleName);
    return ok(res, u);
  });

  router.get('/rbac/platform', (_req, res) => {
    return ok(res, {
      permissions: [
        { name: 'offers.moderate', scope: 'platform' },
        { name: 'offers.feature', scope: 'platform' },
        { name: 'organizations.verify', scope: 'platform' },
        { name: 'disputes.resolve', scope: 'platform' },
        { name: 'users.manage', scope: 'platform' },
        { name: 'roles.manage', scope: 'platform' },
        { name: 'settings.manage', scope: 'platform' },
        { name: 'currencies.manage', scope: 'platform' },
        { name: 'audit.view', scope: 'both' },
        { name: 'reports.view', scope: 'both' },
      ],
      roles: PLATFORM_ROLES.map((r) => ({
        name: r.name,
        declared: r.permissions,
        is_immutable: r.name === 'SuperAdmin',
        holder_count: db.users.filter((u) => u.roles.includes(r.name)).length,
        permissions: r.permissions,
      })),
      account_forbidden: [],
    });
  });

  router.get('/audit-logs', (req, res) => {
    const list = db.auditLogs.map((l) => ({
      ...l,
      user: l.user_id ? db.users.find((u) => u.id === l.user_id) ?? null : null,
      organization: l.organization_id ? db.organizations.find((o) => o.id === l.organization_id) ?? null : null,
    }));
    return paginated(res, list, req.query.page, 25);
  });

  router.get('/api-keys', (_req, res) => ok(res, db.apiKeys));
  router.post('/api-keys', (req, res) => {
    if (!db.featureFlags.find((f) => f.key === 'api_keys')?.is_enabled) {
      return fail(res, 503, 'FEATURE_DISABLED', 'ميزة مفاتيح API معطّلة');
    }
    const key = {
      id: db.nextIds.apiKey++,
      organization_id: 1,
      name: String(req.body?.name || 'Integration Key'),
      key_id: `hk_${crypto.randomBytes(6).toString('hex')}`,
      secret: `hs_${crypto.randomBytes(16).toString('hex')}`,
      scopes: req.body?.scopes || ['read'],
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    };
    db.apiKeys.push(key);
    return ok(res, key, 'تم إصدار المفتاح', {}, 201);
  });
  router.delete('/api-keys/:id', (req, res) => {
    db.apiKeys = db.apiKeys.filter((k) => k.id !== Number(req.params.id));
    return ok(res, { revoked: true });
  });

  router.get('/webhooks', (_req, res) => ok(res, db.webhooks));
  router.post('/webhooks', (req, res) => {
    if (!db.featureFlags.find((f) => f.key === 'webhooks')?.is_enabled) {
      return fail(res, 503, 'FEATURE_DISABLED', 'ميزة الويب هوك معطّلة');
    }
    const wh = {
      id: db.nextIds.webhook++,
      organization_id: 1,
      endpoint_url: String(req.body?.endpoint_url || ''),
      events: Array.isArray(req.body?.events) ? req.body.events : ['*'],
      is_active: true,
      failure_count: 0,
      secret: `whsec_${crypto.randomBytes(16).toString('hex')}`,
      created_at: new Date().toISOString(),
    };
    db.webhooks.push(wh);
    return ok(res, wh, 'تم إنشاء الويب هوك', {}, 201);
  });
  router.post('/webhooks/:id/ping', (_req, res) => ok(res, { pinged: true }));
  router.get('/webhooks/:id/deliveries', (req, res) => paginated(res, [], req.query.page, 20));

  return router;
}
