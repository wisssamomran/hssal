import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react';
import { BannerView, DecisionButton, PanelShell, recorded } from '@/shared/ui/panel';
import type { Banner } from '@/shared/ui/panel';
import { serverMessage } from '@/core/api/refusal';
import { getFeatureFlags, toggleFeatureFlag } from '@/features/platform/api';
import type { FeatureFlag } from '@/features/platform/types';
import { featureFlagProblem, featureFlagState } from './settings';

/**
 * The capabilities this install can switch on and off.
 *
 * The list is `/feature-flags` read whole, and nothing here adds to it: a name the
 * server's catalog does not define is refused on the way in, because `isEnabled()`
 * fails closed on an unknown key and a switch that gates no path would sit on this
 * screen looking like a control.
 *
 * What turning one off actually does is the part an operator has to believe before
 * pressing it: the routes answer 503 for every account, including a seller's own
 * interfaces. Hiding a button on a client is not the same act, and the hint says so
 * rather than letting the switch look like a display setting.
 *
 * After a toggle the panel re-reads the list instead of trusting the click: the
 * server is what says whether the row is on now, and an optimistic flag here would
 * be a claim about a write that has not been answered.
 */
export const CapabilitiesPanel: React.FC<{ onNotify?: (m: string) => void }> = ({ onNotify }) => {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getFeatureFlags();
    if (result.success) setFlags(result.data ?? []);
    else setBanner({ kind: 'error', text: serverMessage(result, 'تعذّر قراءة القدرات') });
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (flag: FeatureFlag) => {
    setBusyKey(flag.key);
    setBanner(null);
    const result = await toggleFeatureFlag(flag.key, !flag.is_enabled);
    setBusyKey(null);

    if (!result.success) {
      setBanner({ kind: 'error', text: featureFlagProblem(result) });
      return;
    }

    await load();
    onNotify?.(featureFlagState(flag, result.data?.is_enabled));
  };

  return (
    <PanelShell
      title="القدرات التي يفتحها الخادم"
      hint="إيقاف قدرة يجعل مساراتها ترد 503 FEATURE_DISABLED لكل حساب، بما في ذلك واجهات البائعين؛ إخفاء الزر وحده ليس منعًا. القائمة كلها من /feature-flags، ولا تُضاف قدرة من هذه الشاشة."
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-[11px] text-slate-500">
          {/* Counted here from the list /feature-flags returned whole: how many of
              the flags the server listed are on — not a published metric. */}
          {loading ? '…' : `${flags.filter((flag) => flag.is_enabled).length} من ${flags.length} قدرة مُفعّلة حاليًا`}
        </p>
        <DecisionButton onClick={() => void load()} busy={loading}>
          <RefreshCw className="w-3.5 h-3.5" />
          إعادة القراءة
        </DecisionButton>
      </div>

      <BannerView banner={banner} />

      <div className="space-y-2">
        {flags.map((flag) => (
          <div key={flag.key} className="min-w-0 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 p-3">
            {flag.is_enabled ? (
              <ToggleRight className="w-5 h-5 shrink-0 text-emerald-600" />
            ) : (
              <ToggleLeft className="w-5 h-5 shrink-0 text-slate-400" />
            )}
            <div className="min-w-0 flex-1 basis-[10rem]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-900">{flag.name_ar}</span>
                <code className="break-all text-[10px] text-slate-500">{flag.key}</code>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                    flag.is_enabled
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 bg-slate-100 text-slate-600'
                  }`}
                >
                  {flag.is_enabled ? 'مُفعّلة' : 'موقوفة'}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500 pt-0.5">
                {recorded(flag.description_ar || flag.description_en)}
              </p>
            </div>
            <button
              onClick={() => void toggle(flag)}
              disabled={busyKey === flag.key}
              className={`w-full shrink-0 rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-40 cursor-pointer sm:w-auto ${
                flag.is_enabled
                  ? 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50'
                  : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {flag.is_enabled ? 'إيقاف القدرة' : 'تفعيل القدرة'}
            </button>
          </div>
        ))}
      </div>
    </PanelShell>
  );
};
