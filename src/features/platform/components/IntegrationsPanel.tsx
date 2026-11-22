import React, { useEffect, useState } from 'react';
import { fieldError } from '@/core/api/http';
import type { ApiResult } from '@/core/api/http';
import { serverMessage } from '@/core/api/refusal';
import { createApiKey, createWebhook, getApiKeys, getWebhookDeliveries, getWebhooks, pingWebhook, revokeApiKey } from '@/features/platform/api';
import type { ApiKey, Webhook, WebhookDelivery } from '@/features/platform/types';
import { isFeatureEnabled } from '@/core/config';
import { formatDateTime, getLocale } from '@/core/i18n';
import { BannerView, DecisionButton, ErrorNote, Fact, PanelShell, TextInput, recorded } from '@/shared/ui/panel';
import type { Banner } from '@/shared/ui/panel';

/**
 * What this business has handed to its own systems: API credentials and
 * outbound event subscriptions.
 *
 * Both live on the business's screen rather than the platform's, because the
 * server scopes every row to the organization in context. And both carry their
 * capability flag's answer out loud: `api_keys` ships off on a normal
 * installation because no request path in this codebase accepts a key — a guard
 * never calls `ApiKeyAuthenticationService::authenticate()`. Showing a
 * generated secret without saying that would present a working door where there
 * is a record and nothing more.
 */

/** The events `WebhookDispatcherService` emits today; the server accepts any dotted name. */

const DELIVERED_EVENTS = [
  { name: 'deal.status_changed', label: 'تغيّر حالة صفقة' },
  { name: 'inventory.reserved', label: 'حجز كمية من عرض' },
  { name: 'inventory.released', label: 'إفراج عن كمية محجوزة' },
];

const DELIVERY_STATUS_LABELS: Record<string, string> = {
  PENDING: 'في الانتظار',
  DELIVERED: 'وُصل',
  FAILED: 'فشل',
  BLOCKED: 'مُحجوب: العنوان لا يسمح بالخروج إليه',
};

export const IntegrationsPanel: React.FC<{ can: (permission: string) => boolean }> = ({ can }) => {
  if (!can('api.manage')) {
    return (
      <ErrorNote text="مسارات المفاتيح وخطافات الويب محجوزة بصلاحية api.manage؛ الخادم يرفضها لهذا الحساب." />
    );
  }

  return (
    <div className="space-y-4">
      <ApiKeysPanel />
      <WebhooksPanel />
    </div>
  );
};

/* ─────────────────────────────── api keys ────────────────────────────────── */

const ApiKeysPanel: React.FC = () => {
  const locale = getLocale();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [readError, setReadError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);
  const [issuedSecret, setIssuedSecret] = useState<{ keyId: string; secret: string } | null>(null);

  /**
   * Whether a request path in this server actually authenticates a key. The
   * answer comes from `meta.key_authentication_ready`, which the backend derives
   * by walking its own route table — not from the capability switch, and not
   * from a guess made here. `null` means the server has not answered yet.
   */
  const [authReady, setAuthReady] = useState<boolean | null>(null);

  const [name, setName] = useState('');
  const [scopes, setScopes] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('');

  const readReady = (result: ApiResult<unknown>) => {
    const reported = result.meta?.key_authentication_ready;
    if (typeof reported === 'boolean') setAuthReady(reported);
  };

  const load = async () => {
    setReadError(null);
    const result = await getApiKeys();
    readReady(result);
    if (result.success) setKeys(Array.isArray(result.data) ? result.data : []);
    else setReadError(serverMessage(result, 'رفض الخادم الطلب'));
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    setBusy(true);
    setBanner(null);
    setIssuedSecret(null);

    const result = await createApiKey({
      name,
      // An omitted scope list is `*` on the server, which is a full-access key.
      // The form therefore sends what it was given, blank included, and says so.
      scopes: scopes.trim() ? scopes.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      expires_in_days: expiresInDays.trim() ? Number(expiresInDays) : undefined,
    });

    setBusy(false);

    if (!result.success) {
      setBanner({
        kind: 'error',
        text: fieldError(result, 'name') ?? fieldError(result, 'scopes') ?? serverMessage(result, 'رفض الخادم الطلب'),
      });
      return;
    }

    setName('');
    setScopes('');
    setExpiresInDays('');
    readReady(result);
    if (result.data) setIssuedSecret({ keyId: result.data.key_id, secret: result.data.secret });
    setBanner({
      kind: authReady === false ? 'warn' : 'ok',
      text:
        authReady === false
          ? 'أُصدر المفتاح، لكن لا مسار في هذا الخادم يتحقق به: لن يفتح أي طلب. اُنسخه للسجل، لا للمشارَكة.'
          : 'اُنسخ المفتاح الآن؛ الخادم لا يعرضه مرة أخرى.',
    });
    await load();
  };

  const revoke = async (id: number) => {
    setBusy(true);
    const result = await revokeApiKey(id);
    setBusy(false);
    setBanner(result.success ? { kind: 'ok', text: 'أُلغي المفتاح' } : { kind: 'error', text: serverMessage(result, 'رفض الخادم الطلب') });
    await load();
  };

  const keysCapabilityOff = !isFeatureEnabled('api_keys');

  return (
    <PanelShell
      title="مفاتيح الوصول"
      hint="تُخزَّن كقيمة مجزّأة، ولا تُقرأ بعد الإنشاء. المفتاح لا يُظهر إلا مرة واحدة في الاستجابة التي أنشأته."
    >
      {keysCapabilityOff ? (
        <ErrorNote text="قدرة api_keys معطّلة في هذه التهيئة، ولا مسار في المنصة يتحقق بالمفتاح بعد: ما يُنشأ هنا سجل إداري للمراجعة، لا منفذ وصول يعمل." />
      ) : null}

      <BannerView banner={banner} />
      {readError ? <ErrorNote text={`لم تُقرأ المفاتيح: ${readError}`} /> : null}

      {issuedSecret ? (
        <div className="bg-slate-900 text-slate-100 rounded-lg p-3 space-y-1 font-mono text-[11px] break-all">
          <div className="text-emerald-300">Key ID: {issuedSecret.keyId}</div>
          <div>Secret: {issuedSecret.secret}</div>
        </div>
      ) : null}

      {keys.length === 0 && !readError ? (
        <div className="text-xs text-slate-500">لا مفتاح صادراً لهذه المنشأة.</div>
      ) : (
        <div className="space-y-2">
          {keys.map((key) => (
            <div key={key.id} className="border border-slate-200 rounded-lg p-3 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[16rem]">
                <div className="text-xs font-bold text-slate-900">{key.name}</div>
                <div className="text-[10px] text-slate-500 font-mono">{key.key_id}</div>
              </div>
              <Fact label="الحالة" value={key.status} />
              <Fact label="آخر استخدام" value={key.last_used_at ? formatDateTime(key.last_used_at, locale) : recorded(null)} />
              <Fact label="ينتهي" value={key.expires_at ? formatDateTime(key.expires_at, locale) : 'بلا تاريخ'} />
              <Fact label="النطاقات" value={(key.scopes ?? []).join('، ') || '*'} />
              {key.status === 'ACTIVE' ? (
                <DecisionButton busy={busy} onClick={() => void revoke(key.id)}>
                  إلغاء
                </DecisionButton>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-end border-t border-slate-100 pt-3">
        <TextInput label="اسم المفتاح" value={name} onChange={setName} placeholder="نظام الفواتير الداخلية" />
        <TextInput label="النطاقات (مفصولة بفواصل)" value={scopes} onChange={setScopes} placeholder="اتركه فارغاً فيمنحه الخادم *" />
        <TextInput label="يُبعد بعد (أيام، 1–365)" value={expiresInDays} onChange={setExpiresInDays} placeholder="بدون انتهاء" />
        <DecisionButton tone="primary" busy={busy} onClick={() => void create()}>
          إصدار مفتاح
        </DecisionButton>
      </div>
    </PanelShell>
  );
};

/* ─────────────────────────────── webhooks ────────────────────────────────── */

const WebhooksPanel: React.FC = () => {
  const locale = getLocale();
  const [hooks, setHooks] = useState<Webhook[]>([]);
  const [readError, setReadError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);
  const [endpoint, setEndpoint] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [issuedSecret, setIssuedSecret] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<{ webhookId: number; rows: WebhookDelivery[]; error: string | null } | null>(null);

  const load = async () => {
    setReadError(null);
    const result = await getWebhooks();
    if (result.success) setHooks(Array.isArray(result.data) ? result.data : []);
    else setReadError(serverMessage(result, 'رفض الخادم الطلب'));
  };

  useEffect(() => {
    void load();
  }, []);

  const toggleEvent = (event: string) =>
    setEvents((current) => (current.includes(event) ? current.filter((e) => e !== event) : [...current, event]));

  const create = async () => {
    setBusy(true);
    setBanner(null);
    setIssuedSecret(null);

    const result = await createWebhook({ endpoint_url: endpoint, events });
    setBusy(false);

    if (!result.success) {
      setBanner({
        kind: 'error',
        text: fieldError(result, 'endpoint_url') ?? fieldError(result, 'events') ?? serverMessage(result, 'رفض الخادم الطلب'),
      });
      return;
    }

    setEndpoint('');
    setEvents([]);
    setIssuedSecret(result.data?.secret ?? null);
    setBanner({ kind: 'ok', text: 'سجِّل المفتاح الآن: استجابة الإنشاء هي المرة الوحيدة التي يظهر فيها.' });
    await load();
  };

  const ping = async (id: number) => {
    setBusy(true);
    setBanner(null);
    const result = await pingWebhook(id);
    setBusy(false);
    setBanner(
      result.success
        ? { kind: 'ok', text: `نفّذت المنصة اختباراً للحالة ${String((result.data as WebhookDelivery)?.status ?? 'غير معروفة')}` }
        : { kind: 'error', text: serverMessage(result, 'رفض الخادم الطلب') }
    );
    await load();
  };

  const showDeliveries = async (id: number) => {
    setDeliveries({ webhookId: id, rows: [], error: null });
    const result = await getWebhookDeliveries(id);
    if (result.success) {
      setDeliveries({ webhookId: id, rows: Array.isArray(result.data) ? result.data : [], error: null });
    } else {
      setDeliveries({ webhookId: id, rows: [], error: serverMessage(result, 'رفض الخادم الطلب') });
    }
  };

  return (
    <PanelShell
      title="خطافات الأحداث (Webhooks)"
      hint="تُوقَّع المدفوعات ببصمة HMAC بمولّد سرّي يُنشئه الخادم ويُعرض مرة واحدة. العنوان العام فقط: الخادم يرفض العناوين داخل شبكته."
    >
      {!isFeatureEnabled('webhooks') ? (
        <ErrorNote text="قدرة webhooks معطّلة في هذه التهيئة: المسارات تُقرأ وتُكتب، لكن لا حدث يُرشد إليها حتى تُفعَّل." />
      ) : null}

      <BannerView banner={banner} />
      {readError ? <ErrorNote text={`لم تُقرأ الخطافات: ${readError}`} /> : null}

      {issuedSecret ? (
        <div className="bg-slate-900 text-slate-100 rounded-lg p-3 font-mono text-[11px] break-all">
          signing secret: {issuedSecret}
        </div>
      ) : null}

      {hooks.length === 0 && !readError ? (
        <div className="text-xs text-slate-500">لا خطاف مسجَّل لهذه المنشأة.</div>
      ) : (
        <div className="space-y-2">
          {hooks.map((hook) => (
            <div key={hook.id} className="border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[18rem]">
                  <div className="text-xs font-mono text-slate-800 break-all">{hook.endpoint_url}</div>
                  <div className="text-[10px] text-slate-500">
                    {(hook.events ?? []).join('، ') || 'لا أحداث'}
                  </div>
                </div>
                <Fact label="الحالة" value={hook.is_active ? 'نشط' : 'متوقف'} />
                <Fact label="محاولات فاشلة" value={String(hook.failure_count ?? 0)} />
                <Fact label="مسجَّلة" value={String(hook.deliveries_count ?? 0)} />
                <DecisionButton busy={busy} onClick={() => void ping(hook.id)}>
                  اختبار
                </DecisionButton>
                <DecisionButton busy={busy} onClick={() => void showDeliveries(hook.id)}>
                  سجل التسليم
                </DecisionButton>
              </div>

              {deliveries?.webhookId === hook.id ? (
                deliveries.error ? (
                  <ErrorNote text={deliveries.error} />
                ) : deliveries.rows.length === 0 ? (
                  <div className="text-[11px] text-slate-500">لا محاولة تسليم بعد لهذا الخطاف.</div>
                ) : (
                  <div className="space-y-1 bg-slate-50 border border-slate-200 rounded-lg p-2">
                    {deliveries.rows.map((row) => (
                      <div key={row.id} className="text-[11px] flex flex-wrap items-center gap-2">
                        <span className="font-mono text-slate-700">{row.event_name}</span>
                        <span className="font-bold text-slate-900">
                          {DELIVERY_STATUS_LABELS[row.status] ?? row.status}
                        </span>
                        <span className="text-slate-500">
                          {row.response_status !== null && row.response_status !== undefined ? `رمز ${row.response_status}` : ''}
                        </span>
                        <span className="text-slate-400">{formatDateTime(row.created_at, locale)}</span>
                        {row.last_error ? <span className="text-rose-700 break-all">{row.last_error}</span> : null}
                      </div>
                    ))}
                  </div>
                )
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 border-t border-slate-100 pt-3">
        <TextInput
          label="عنوان الاستقبال (https عام)"
          value={endpoint}
          onChange={setEndpoint}
          placeholder="https://erp.example.com/hassal/events"
          wide
        />
        <div className="flex flex-wrap gap-3 text-[11px] text-slate-700">
          {DELIVERED_EVENTS.map((event) => (
            <label key={event.name} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={events.includes(event.name)}
                onChange={() => toggleEvent(event.name)}
              />
              <span>{event.label}</span>
              <span className="font-mono text-slate-400">{event.name}</span>
            </label>
          ))}
        </div>
        <DecisionButton tone="primary" busy={busy} onClick={() => void create()}>
          تسجيل الخطاف
        </DecisionButton>
        <p className="text-[10px] text-slate-500">
          الخادم يقبل أي اسم حدث ببنية «نقطة.فاصل»، لكن هذه الثلاثة هي ما تُصدره المنصة اليوم: الاشتراك بغيرها لا
          يرفض، ولا يصل إليه شيء.
        </p>
      </div>
    </PanelShell>
  );
};
