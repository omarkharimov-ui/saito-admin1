'use client';

// 2026-09-25 (owner, decision): dashboard compact card — terminal statusları
// (POS / KDS / BDS / Expo / Admin), heartbeat ilə. 60s poll; details →
// Settings → Terminallar.
import { useEffect, useState } from 'react';
import { Monitor, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-fetch';
import { useTheme } from '@/lib/theme/ThemeContext';

type Device = { name: string; type: string; online: boolean; seconds_ago: number | null };

const ORDER = ['pos', 'kds', 'bds', 'expo', 'admin'];

function ago(s: number | null): string {
  if (s === null) return '—';
  if (s < 5) return 'indi';
  if (s < 60) return `${s} sn`;
  if (s < 3600) return `${Math.floor(s / 60)} dəq`;
  return `${Math.floor(s / 3600)} saat`;
}

export default function TerminalStatus() {
  const { lightMode: isLightMode } = useTheme();
  const [devices, setDevices] = useState<Device[] | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await apiFetch('/api/devices');
        if (res.ok) {
          const j = await res.json();
          const list: Device[] = (j.devices || [])
            .sort((a: Device, b: Device) => (ORDER.indexOf(a.type) - ORDER.indexOf(b.type)));
          if (active) setDevices(list);
        }
      } catch { /* silent */ }
    };
    load();
    const iv = setInterval(load, 60_000);
    return () => { active = false; clearInterval(iv); };
  }, []);

  const online = devices?.filter((d) => d.online).length ?? 0;
  const muted = isLightMode ? 'text-zinc-500' : 'text-white/45';
  const border = isLightMode ? 'border-zinc-200' : 'border-white/[0.06]';

  return (
    <div className={`relative overflow-hidden rounded-[28px] border px-6 py-5 ${border} ${isLightMode ? 'bg-white shadow-sm' : 'bg-[#1c1c1e]'}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${isLightMode ? 'bg-zinc-100 text-zinc-600 border-zinc-200' : 'bg-white/[0.06] text-white/70 border-white/10'}`}>
          <Monitor size={19} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-black tracking-tight">Terminal Statusları</h3>
          <p className={`text-[11px] font-semibold ${muted}`}>
            {devices === null ? 'Yüklənir…' : devices.length === 0 ? 'Hələ aktiv terminal yoxdur' : `${online} / ${devices.length} online`}
          </p>
        </div>
        <Link
          href="/admin/settings?tab=terminals"
          className="flex-shrink-0 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl border transition-colors"
          style={isLightMode ? { color: '#52525b', borderColor: '#e4e4e7' } : { color: 'rgba(255,255,255,0.55)', borderColor: 'rgba(255,255,255,0.12)' }}
        >
          Ayarlar <ArrowUpRight size={12} />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {devices && devices.length > 0 ? devices.map((d) => (
          <div key={`${d.type}-${d.name}`} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border ${border} ${isLightMode ? 'bg-zinc-50' : 'bg-white/[0.03]'}`}>
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${d.online ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-zinc-500/70'}`} />
            <div className="min-w-0">
              <div className="text-[11px] font-black uppercase tracking-wide truncate" style={{ color: isLightMode ? '#27272a' : 'rgba(255,255,255,0.85)' }}>
                {d.type}
              </div>
              <div className={`text-[10px] font-semibold tabular-nums truncate ${muted}`}>{d.online ? 'online' : ago(d.seconds_ago)}</div>
            </div>
          </div>
        )) : (
          <div className={`col-span-full flex items-center justify-center py-4 text-[11px] font-semibold ${muted}`}>
            {devices === null ? 'Yüklənir…' : 'POS / KDS / BDS / Expo açılan ilk anda göstərilir'}
          </div>
        )}
      </div>
    </div>
  );
}
