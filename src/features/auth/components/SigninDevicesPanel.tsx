import React, { useCallback, useEffect, useState } from 'react';
import { Fingerprint, MonitorSmartphone, RefreshCw, Smartphone, Trash2 } from 'lucide-react';
import { getDevices, revokeDevice, updateDevice } from '@/features/auth/api';
import type { SigninDevice } from '@/features/auth/types';
import type { Locale } from '@/core/i18n';
import { BannerView, DecisionButton, ErrorNote, PanelShell } from '@/shared/ui/panel';
import type { Banner } from '@/shared/ui/panel';

/**
 * Every device this account is signed in from, and the door that ends one.
 *
 * The list is read from the server rather than inferred from this tab. A
 * browser knows its own session and nothing else; a security panel that printed
 * only that would look like a clean account to a person whose phone is still
 * signed in somewhere across the room.
 *
 * `biometric_unlock` is shown and never edited from here. It is a device's own
 * word about its own lock — a phone with a fingerprint switch, or a browser that
 * has no such thing — and a control on a second device that could flip it would
 * be a panel that lets you rewrite what another device claims. Renaming and
 * revoking are the two actions that belong to whoever holds the account.
 *
 * Revoking the row marked `current` ends the session being read, so the panel
 * says so before the tap and hands the decision back to the caller afterwards.
 */

export const SigninDevicesPanel: React.FC<{
  locale: Locale;
  /** Called after the person revokes the device they are reading from. */
  onSelfRevoked: () => void;
  onNotify?: (message: string) => void;
}> = ({ locale, onSelfRevoked, onNotify }) => {
  const ar = locale === 'ar';
  const [devices, setDevices] = useState<SigninDevice[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const response = await getDevices();
    setLoading(false);
    if (!response.success) {
      setDevices(null);
      setBanner({ kind: 'error', text: response.message ?? (ar ? 'تعذّر قراءة قائمة الأجهزة' : 'Could not read the device list') });
      return;
    }
    // `data` is the list itself, not a paginated page: one account cannot hold
    // enough devices to need a second one.
    setDevices(Array.isArray(response.data) ? response.data : []);
    setBanner(null);
  }, [ar]);

  useEffect(() => {
    void load();
  }, [load]);

  const rename = async (device: SigninDevice) => {
    const name = draftName.trim();
    if (!name) {
      setBanner({ kind: 'error', text: ar ? 'لا يُحفظ جهاز بلا اسم.' : 'A device cannot be saved nameless.' });
      return;
    }
    setBusyId(device.id);
    const response = await updateDevice(device.id, { name });
    setBusyId(null);
    if (!response.success) {
      setBanner({ kind: 'error', text: response.message ?? (ar ? 'تعذّر إعادة التسمية' : 'Could not rename') });
      return;
    }
    setEditingId(null);
    setBanner({ kind: 'ok', text: ar ? 'تم تحديث اسم الجهاز.' : 'Device renamed.' });
    if (onNotify) onNotify(ar ? 'تم تحديث اسم الجهاز' : 'Device renamed');
    void load();
  };

  const revoke = async (device: SigninDevice) => {
    const message = device.current
      ? ar
        ? 'هذا جهازك الحالي. إلغاءه يسجّل خروجك من هذه النافذة الآن. متابعة؟'
        : 'This is the device you are reading from. Revoking it signs this window out now. Continue?'
      : ar
        ? `تسجيل الخروج من «${device.name}»؟ لن يعمل عليه فتح التطبيق حتى يُدخل الحساب من جديد.`
        : `Sign «${device.name}» out? It will not open the app again until the account is entered there.`;
    if (!window.confirm(message)) return;

    setBusyId(device.id);
    const response = await revokeDevice(device.id);
    setBusyId(null);
    if (!response.success) {
      setBanner({ kind: 'error', text: response.message ?? (ar ? 'تعذّر إلغاء الجهاز' : 'Could not revoke the device') });
      return;
    }
    if (device.current) {
      // Nothing left to list: the token that would answer is gone.
      onSelfRevoked();
      return;
    }
    setBanner({ kind: 'ok', text: ar ? 'تم تسجيل الخروج من الجهاز.' : 'Device signed out.' });
    if (onNotify) onNotify(ar ? 'تم إلغاء الجهاز' : 'Device revoked');
    void load();
  };

  return (
    <PanelShell
      title={ar ? 'الأجهزة التي تدخل بحسابك' : 'Devices signed in to this account'}
      hint={ar
        ? 'كل سطر هنا جهاز يحمل جلسة مفتوحة على حسابك، وهذه القائمة هي ما يراه تطبيق الهاتف نفسه. «يفتح بالبصمة» تعني أن صاحب ذلك الهاتف أوقف كلمة المرور على جهازه بلمسة إصبع؛ لا تُرسل أي بيانات حيوية إلى المنصة، فالمنصة لا تطلبها ولا تقبلها.'
        : 'Each row is a device holding a live session for this account — the same list the mobile app reads. "Unlocks by fingerprint" means that handset gates its own stored token with a biometric; no biometric is ever sent to or accepted by the platform.'}
    >
      <BannerView banner={banner} />

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-slate-400 dark:text-slate-500">
          {loading
            ? (ar ? 'جارٍ القراءة…' : 'Reading…')
            : (ar ? `${devices?.length ?? 0} جهاز` : `${devices?.length ?? 0} device(s)`)}
        </span>
        <DecisionButton onClick={() => { void load(); }} busy={loading}>
          <RefreshCw className="w-3.5 h-3.5" />
          <span>{ar ? 'تحديث' : 'Refresh'}</span>
        </DecisionButton>
      </div>

      {!loading && !devices ? (
        <ErrorNote text={ar ? 'لم تُقرأ القائمة: قد يكون الاتصال بالبوابة متقطعاً.' : 'The list could not be read; the gateway may be unreachable.'} />
      ) : null}

      {!loading && devices && devices.length === 0 ? (
        <div className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          {ar
            ? 'لا جهاز مسجَّل لهذه الجلسة: الأسماء تظهر هنا عند تسجيل الدخول من نسخة تحمل معرّف جهاز (تطبيق الهاتف، أو هذا المتصفّح بعد هذه النسخة).'
            : 'No device is recorded for this session. Rows appear when a client that carries a device id signs in — the mobile app, or this browser on builds that send one.'}
        </div>
      ) : null}

      <ul className="space-y-2">
        {(devices ?? []).map((device) => (
          <li
            key={device.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-hassal-line dark:bg-hassal-raised"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 dark:bg-hassal-night dark:text-slate-300">
              {device.platform === 'web'
                ? <MonitorSmartphone className="h-4 w-4" />
                : <Smartphone className="h-4 w-4" />}
            </span>

            <span className="min-w-0 flex-1">
              {editingId === device.id ? (
                <span className="flex flex-wrap items-center gap-2">
                  <input
                    value={draftName}
                    autoFocus
                    onChange={(event) => setDraftName(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') void rename(device); }}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-hassal-line dark:bg-hassal-night dark:text-slate-100 sm:w-56"
                  />
                  <DecisionButton tone="primary" busy={busyId === device.id} onClick={() => { void rename(device); }}>
                    {ar ? 'حفظ' : 'Save'}
                  </DecisionButton>
                  <DecisionButton onClick={() => setEditingId(null)}>
                    {ar ? 'إلغاء' : 'Cancel'}
                  </DecisionButton>
                </span>
              ) : (
                <span className="block min-w-0">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">{device.name}</span>
                    {device.current ? (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
                        {ar ? 'هذا الجهاز' : 'this device'}
                      </span>
                    ) : null}
                    {device.biometric_unlock ? (
                      <span
                        className="flex items-center gap-1 rounded bg-slate-200/70 px-1.5 py-0.5 text-[9px] font-bold text-slate-700 dark:bg-hassal-night dark:text-slate-300"
                        title={ar ? 'يقفل هذا الهاتف جلسته بلمسة إصبع على الجهاز نفسه' : 'This handset gates its own stored token with a biometric'}
                      >
                        <Fingerprint className="h-3 w-3" />
                        {ar ? 'يفتح بالبصمة' : 'unlocks by fingerprint'}
                      </span>
                    ) : null}
                  </span>
                  <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                    {platformLabel(device.platform, ar)}
                    {' · '}
                    {lastSeen(device, ar)}
                  </span>
                </span>
              )}
            </span>

            {editingId !== device.id ? (
              <span className="flex shrink-0 items-center gap-1.5">
                <DecisionButton
                  onClick={() => { setEditingId(device.id); setDraftName(device.name); setBanner(null); }}
                >
                  {ar ? 'إعادة تسمية' : 'Rename'}
                </DecisionButton>
                <button
                  onClick={() => { void revoke(device); }}
                  disabled={busyId === device.id}
                  title={device.current
                    ? (ar ? 'تسجيل الخروج من هذا الجهاز' : 'Sign this device out')
                    : (ar ? 'إلغاء الجهاز وتسجيل خروجه' : 'Revoke and sign out')}
                  className="cursor-pointer rounded-lg border border-rose-200 bg-white px-2.5 py-2 text-rose-700 hover:bg-rose-50 disabled:opacity-40 dark:border-rose-800 dark:bg-hassal-raised dark:text-rose-300 dark:hover:bg-rose-950/40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </PanelShell>
  );
};

function platformLabel(platform: SigninDevice['platform'], ar: boolean): string {
  if (platform === 'android') return ar ? 'أندرويد' : 'Android';
  if (platform === 'ios') return 'iOS';
  return ar ? 'متصفّح' : 'Web';
}

/**
 * The last moment this device's token was seen, or the day it first appeared.
 *
 * A device that has never been used since it was recorded is worth saying so:
 * the row is real, and the person may have signed in once from a borrowed phone
 * and never touched it again.
 */
function lastSeen(device: SigninDevice, ar: boolean): string {
  const raw = device.last_seen_at ?? device.created_at;
  if (!raw) return ar ? 'لم يُستخدم بعد' : 'never used';
  const when = new Date(raw);
  if (Number.isNaN(when.getTime())) return ar ? 'وقت غير مسجَّل' : 'unrecorded time';
  const text = when.toLocaleString(ar ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' });
  return ar ? `آخر استخدام: ${text}` : `last used ${text}`;
}
