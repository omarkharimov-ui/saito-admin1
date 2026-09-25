'use client';

// 2026-09-25 (owner, decision): Device health + identity PHASE 0.
// Terminal statusları (POS / KDS / BDS / Expo / Admin) + cihaz kimliyi:
// stabil device_id, OS/browser, ekran, battery (level+charging), app version,
// first_seen (YENİ badge), UNPAIR (blok) + REMOTE RELOAD ("Yenilə" düyməsi).
// Hər terminal 30s heartbeat atır; online = last_seen ≤ 45s. Tab 30s poll.
import { useCallback, useEffect, useState } from 'react';
import { Monitor, Laptop, Coffee, BellRing, Shield, RefreshCw, RotateCw, Unplug, CheckCheck, Loader2, BatteryCharging, BatteryLow } from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from '@/lib/toast';
import { useTheme } from '@/lib/theme/ThemeContext';
import { getDeviceId } from '@/lib/device-identity';

type Meta = {
  os?: string;
  browser?: string;
  screen?: string;
  battery?: { level: number; charging: boolean } | null;
  app_version?: string;
};

type Device = {
  name: string;
  type: string;
  device_id: string | null;
  first_seen_at: string | null;
  is_new: boolean;
  blocked: boolean;
  blocked_at: string | null;
  meta: Meta | null;
  last_seen_at: string | null;
  online: boolean;
  seconds_ago: number | null;
};

const TYPE_META: Record<string, { icon: any; label: string }> = {
  pos: { icon: Laptop, label: 'POS terminal' },
  kds: { icon: Coffee, label: 'KDS (mətbəx)' },
  bds: { icon: Coffee, label: 'BDS (bar)' },
  expo: { icon: BellRing, label: 'Expo display' },
  admin: { icon: Shield, label: 'Admin' },
  other: { icon: Monitor, label: 'Digər' },
};

function timeAgo(s: number | null): string {
  if (s === null) return '—';
  if (s < 5) return 'indi';
  if (s < 60) return `${s} sn əvvəl`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} dəq əvvəl`;
  const h = Math.floor(m / 60);
  return `${h} saat əvvəl`;
}

const TerminalsTab = () => {
  const { lightMode } = useTheme();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const sendCommand = async (d: Device) => {
    if (!d.device_id) return;
    setBusyId(d.device_id);
    try {
      const res = await apiFetch('/api/devices/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: d.device_id, command: 'reload' }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) toast.success(`"${d.name}" — yeniləmə siqnalı göndərildi`);
      else toast.error(j.error || 'Komanda göndərilə bilmədi');
    } catch {
      toast.error('Komanda göndərilə bilmədi');
    } finally { setBusyId(null); }
  };

  const toggleUnpair = async (d: Device) => {
    if (!d.device_id) return;
    const block = !d.blocked;
    const ok = block
      ? window.confirm(`"${d.name}" cihazı UNPAIR olunsun? Cihaz dərhal bloklanacaq və lockout ekranı görəcək (Bərpa etməyincə işləməyəcək).`)
      : true;
    if (!ok) return;
    setBusyId(d.device_id);
    try {
      const res = await apiFetch('/api/devices/unpair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: d.device_id, blocked: block }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(block ? `"${d.name}" bloklandı (unpair)` : `"${d.name}" bərpa olundu`);
        load(true);
      } else {
        toast.error(j.error || 'Əməliyyat uğursuz oldu');
      }
    } catch {
      toast.error('Əməliyyat uğursuz oldu');
    } finally { setBusyId(null); }
  };

  const online = devices.filter((d) => d.online && !d.blocked).length;
  const muted = lightMode ? 'text-zinc-500' : 'text-white/50';
  const border = lightMode ? 'border-zinc-200' : 'border-white/10';
  const cardBg = lightMode ? 'bg-white' : 'bg-white/[0.03]';
  const subtleBtn = `flex items-center gap-1.5 px-2.5 h-8 rounded-lg border text-[11px] font-bold transition-colors disabled:opacity-40 ${
    lightMode ? 'border-zinc-200 hover:bg-zinc-50 text-zinc-600' : 'border-white/10 hover:bg-white/5 text-white/60'
  }`;

  const metaLine = (d: Device): string => {
    const m = d.meta;
    if (!m) return '';
    const parts: string[] = [];
    if (m.os) parts.push(m.os);
    if (m.browser) parts.push(m.browser);
    if (m.screen) parts.push(m.screen);
    if (m.battery) {
      const pct = Math.round(m.battery.level * 100);
      parts.push(m.battery.charging ? `${pct}% ⚡` : `${pct}%`);
    }
    if (m.app_version) parts.push(`v${m.app_version}`);
    return parts.join(' · ');
  };

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
          className={`flex items-center gap-1.5 px-3 h-9 rounded-xl border text-xs font-bold transition-colors ${border} ${
            lightMode ? 'hover:bg-zinc-50 text-zinc-600' : 'hover:bg-white/5 text-white/70'
          }`}
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Yenilə
        </button>
      </div>

      {loading ? (
        <div className={`h-24 rounded-2xl border flex items-center justify-center ${border}`}>
          <span className={`text-xs ${muted}`}>Yüklənir…</span>
        </div>
      ) : devices.length === 0 ? (
        <div className={`rounded-2xl border p-8 text-center ${border} ${cardBg}`}>
          <Monitor size={28} className={`mx-auto mb-3 ${muted}`} />
          <p className={`text-sm font-bold ${lightMode ? 'text-zinc-700' : 'text-white/80'}`}>Cihaz tapılmadı</p>
          <p className={`text-xs mt-1 ${muted}`}>POS, KDS, BDS, Expo və ya Admin ekranı açılan ilk anda heartbeat qeydə olunar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {devices.map((d) => {
            const meta = TYPE_META[d.type] || TYPE_META.other;
            const Icon = meta.icon;
            const key = d.device_id || `${d.type}-${d.name}`;
            const busy = busyId === key;
            const line = metaLine(d);
            // Öz cihazını özün unpair edib geri aça bilməz (security):
            // bloklanan kartın Bərpa et düyməsi YALNIZ başqa cihazdan işləyir.
            const isSelf = !!d.device_id && d.device_id === getDeviceId();
            return (
              <div
                key={key}
                className={`rounded-2xl border p-4 flex flex-col gap-2.5 ${
                  d.blocked
                    ? (lightMode ? 'border-rose-300 bg-rose-50/60' : 'border-rose-500/40 bg-rose-500/[0.06]')
                    : `${border} ${cardBg}`
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    d.blocked
                      ? (lightMode ? 'bg-rose-100 text-rose-600' : 'bg-rose-500/15 text-rose-400')
                      : d.online
                        ? (lightMode ? 'bg-emerald-50 text-emerald-600' : 'bg-emerald-500/15 text-emerald-400')
                        : (lightMode ? 'bg-zinc-100 text-zinc-400' : 'bg-white/5 text-white/35')
                  }`}>
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-black truncate ${lightMode ? 'text-zinc-800' : 'text-white/85'}`}>{d.name}</span>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${d.blocked ? 'bg-rose-500' : d.online ? 'bg-emerald-500' : 'bg-zinc-500/60'}`} />
                      {d.is_new && !d.blocked && (
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${lightMode ? 'bg-sky-100 text-sky-600' : 'bg-sky-500/15 text-sky-400'}`}>YENİ</span>
                      )}
                      {d.blocked && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-rose-500/15 text-rose-500">BLOKLANIB</span>
                      )}
                    </div>
                    <div className={`text-[11px] font-semibold truncate ${muted}`}>
                      {meta.label} · {d.blocked ? 'UNPAIRED' : d.online ? 'ONLINE' : 'OFFLINE'} · {timeAgo(d.seconds_ago)}
                    </div>
                  </div>
                </div>

                {(line || d.device_id) && (
                  <div className={`text-[10px] leading-relaxed ${muted} font-medium`}>
                    {line && <div className="truncate" title={line}>{line}</div>}
                    {d.device_id && <div className="font-mono opacity-70 truncate" title={d.device_id}>{d.device_id}</div>}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy || !d.online || d.blocked || !d.device_id}
                    onClick={() => sendCommand(d)}
                    title="Cihaza uzaqdan reload siqnalı"
                    className={subtleBtn}
                  >
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <RotateCw size={12} />}
                    Yenilə
                  </button>
                  <button
                    type="button"
                    disabled={busy || !d.device_id || (d.blocked && isSelf)}
                    title={d.blocked && isSelf ? 'Bu cihazı başqa (admin) cihazdan bərpa etmək olar' : 'Cihazı unpair et / bərpa et'}
                    onClick={() => toggleUnpair(d)}
                    className={
                      d.blocked
                        ? `flex items-center gap-1.5 px-2.5 h-8 rounded-lg border text-[11px] font-bold transition-colors disabled:opacity-40 ${
                            lightMode ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                          }`
                        : `flex items-center gap-1.5 px-2.5 h-8 rounded-lg border text-[11px] font-bold transition-colors disabled:opacity-40 ${
                            lightMode ? 'border-rose-200 text-rose-600 hover:bg-rose-50' : 'border-rose-500/25 text-rose-400/90 hover:bg-rose-500/10'
                          }`
                    }
                  >
                    {busy ? <Loader2 size={12} className="animate-spin" /> : d.blocked ? <CheckCheck size={12} /> : <Unplug size={12} />}
                    {d.blocked ? 'Bərpa et' : 'Unpair'}
                  </button>
                  {d.meta?.battery && (
                    <span className={`ml-auto ${muted}`}>
                      {d.meta.battery.charging
                        ? <BatteryCharging size={14} className={d.meta.battery.level < 0.2 ? 'text-rose-500' : ''} />
                        : <BatteryLow size={14} className={d.meta.battery.level < 0.2 ? 'text-rose-500' : ''} />}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TerminalsTab;
