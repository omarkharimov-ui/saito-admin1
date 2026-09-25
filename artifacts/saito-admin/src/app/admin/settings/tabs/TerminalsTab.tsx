'use client';

// 2026-09-25 (owner, decision): Device health — terminal statusları
// (POS / KDS / BDS / Expo / Admin). Hər terminal 30s heartbeat atır;
// online = last_seen ≤ 45s. Bu tab 30s-də bir yenilənir.
import { useCallback, useEffect, useState } from 'react';
import { Monitor, Laptop, Coffee, BellRing, Shield, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';
import { useTheme } from '@/lib/theme/ThemeContext';

type Device = { name: string; type: string; last_seen_at: string | null; online: boolean; seconds_ago: number | null };

const TYPE_META: Record<string, { icon: any; label: string }> = {
  pos: { icon: Laptop, label: 'POS terminal' },
  kds: { icon: Coffee, label: 'KDS (mətbəx)' },
  bds: { icon: Coffee, label: 'BDS (bar)' },
  expo: { icon: BellRing, label: 'Expo display' },
  admin: { icon: Shield, label: 'Admin' },
  other: { icon: Monitor, label: 'Digər' },
};

function timeAgo(s: number | null, lightMode: boolean): string {
  if (s === null) return '—';
  if (s < 5) return 'indi';
  if (s < 60) return `${s} sn əvvəl`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} dəq əvvəl`;
  const h = Math.floor(m / 60);
  return `${h} saat əvvəl`;
}

export default function TerminalsTab() {
  const { lightMode } = useTheme();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await apiFetch('/api/devices');
      if (res.ok) {
        const j = await res.json();
        setDevices(j.devices || []);
      }
    } catch { /* network hata — növbəti poll */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(() => load(true), 30_000);
    return () => clearInterval(iv);
  }, [load]);

  const online = devices.filter((d) => d.online).length;
  const muted = lightMode ? 'text-zinc-500' : 'text-white/50';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-black tracking-tight">Cihazlar (Device Health)</h3>
          <p className={`text-xs mt-1 ${muted}`}>
            {devices.length > 0
              ? `${online} / ${devices.length} terminal online`
              : 'Hələ heartbeat qeydə alınmayıb — terminal açılanda burada görünər.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          className={`flex items-center gap-1.5 px-3 h-9 rounded-xl border text-xs font-bold transition-colors ${
            lightMode ? 'border-zinc-200 hover:bg-zinc-50 text-zinc-600' : 'border-white/10 hover:bg-white/5 text-white/70'
          }`}
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Yenilə
        </button>
      </div>

      {loading ? (
        <div className={`h-24 rounded-2xl border flex items-center justify-center ${lightMode ? 'border-zinc-200' : 'border-white/10'}`}>
          <span className={`text-xs ${muted}`}>Yüklənir…</span>
        </div>
      ) : devices.length === 0 ? (
        <div className={`rounded-2xl border p-8 text-center ${lightMode ? 'border-zinc-200 bg-zinc-50' : 'border-white/10 bg-white/[0.03]'}`}>
          <Monitor size={28} className={`mx-auto mb-3 ${muted}`} />
          <p className={`text-sm font-bold ${lightMode ? 'text-zinc-700' : 'text-white/80'}`}>Cihaz tapılmadı</p>
          <p className={`text-xs mt-1 ${muted}`}>POS, KDS, BDS, Expo və ya Admin ekranı açılan ilk anda heartbeat qeydə alınacaq.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {devices.map((d) => {
            const meta = TYPE_META[d.type] || TYPE_META.other;
            const Icon = meta.icon;
            return (
              <div
                key={`${d.type}-${d.name}`}
                className={`rounded-2xl border p-4 flex items-center gap-3 ${
                  lightMode ? 'border-zinc-200 bg-white' : 'border-white/10 bg-white/[0.03]'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  d.online
                    ? (lightMode ? 'bg-emerald-50 text-emerald-600' : 'bg-emerald-500/15 text-emerald-400')
                    : (lightMode ? 'bg-zinc-100 text-zinc-400' : 'bg-white/5 text-white/35')
                }`}>
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-black truncate ${lightMode ? 'text-zinc-800' : 'text-white/85'}`}>{d.name}</span>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${d.online ? 'bg-emerald-500' : 'bg-zinc-500/60'}`} />
                  </div>
                  <div className={`text-[11px] font-semibold truncate ${muted}`}>
                    {meta.label} · {d.online ? 'ONLINE' : 'OFFLINE'} · {timeAgo(d.seconds_ago, lightMode)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
