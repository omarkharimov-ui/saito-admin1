'use client';

// 2026-09-25 (owner, decision): EXPO VIEW — tablet / 2-ci ekran üçün "canlı
// display" ekranı: "sifariş hazırdır / masa boşaldı / hesab göndərildi".
// NEW backend YOX — mövcud realtime kanaldan (orders + table_floors) oxuyur.
// Slick dark theme, böyük hərflər (məsafədən oxunmaq üçün).
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BellRing, Armchair, Receipt, Bike, ShoppingBag, Check } from '@/components/ui/saito-icons';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { useDeviceHeartbeat } from '@/lib/device-heartbeat';
import { useTheme } from '@/lib/theme/ThemeContext';

const EXPIRY_MS = 90_000; // 3 dəq

type ReadyItem = { key: string; orderNo: string; label: string; kind: 'takeaway' | 'delivery' };
type FlashItem = { key: string; kind: 'table' | 'bill'; text: string; sub?: string; at: number };

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), intervalMs); return () => clearInterval(t); }, [intervalMs]);
  return now;
}

function fmtClock(d: Date) {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function ExpoPage() {
  useDeviceHeartbeat('Expo Display', 'expo');
  const { lightMode: isLightMode } = useTheme();
  const now = useNow(1000);
  const [ready, setReady] = useState<ReadyItem[]>([]);
  const [flashes, setFlashes] = useState<FlashItem[]>([]);
  const [conn, setConn] = useState<'loading' | 'live' | 'offline'>('loading');
  const lastTickRef = useRef(0);

  // 13d: service-role board feed. The old implementation polled `orders` and
  // `table_floors` directly from the browser — both RLS-gated (app.current_role
  // not set for user sessions) → the physical display showed EMPTY lists while
  // the "CANLI" lamp was green (empty ≠ error in Promise.allSettled).
  const loadBoard = async () => {
    const res = await fetch('/api/expo/board', { cache: 'no-store' });
    if (!res.ok) throw new Error(`Expo board HTTP ${res.status}`);
    const d = await res.json();
    setReady((d.ready || []) as ReadyItem[]);
    setFlashes((d.flashes || []) as FlashItem[]);
  };

  const refresh = async () => {
    const [r] = await Promise.allSettled([loadBoard()]);
    setConn(r.status === 'fulfilled' ? 'live' : 'offline');
  };

  useEffect(() => {
    let active = true;
    refresh();
    const channel = createRealtimeChannel('expo-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => { if (active) refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_floors' }, () => { if (active) refresh(); })
      .subscribe();
    const poll = setInterval(() => { if (active) refresh(); }, 5000);
    return () => { active = false; clearInterval(poll); removeRealtimeChannel(channel); };
  }, []);

  // Flash expiration (3 dəq sonra yox olur)
  useEffect(() => {
    const t = setInterval(() => {
      lastTickRef.current = Date.now();
      setFlashes((cur) => cur.filter((f) => Date.now() - f.at < EXPIRY_MS));
    }, 5000);
    return () => clearInterval(t);
  }, []);

  const isLight = isLightMode;
  const bg = isLight ? 'bg-zinc-50' : 'bg-[#0B0B0D]';
  const panel = isLight ? 'bg-white border-zinc-200' : 'bg-[#141419] border-white/10';
  const text = isLight ? 'text-zinc-900' : 'text-white';
  const sub = isLight ? 'text-zinc-500' : 'text-white/40';

  return (
    <div className={`h-full w-full ${bg} ${text} flex flex-col overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 md:px-10 py-4 md:py-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isLight ? 'bg-zinc-900' : 'bg-white/10'}`}>
            <BellRing size={18} className={text} />
          </div>
          <div>
            <div className={`text-base md:text-lg font-black tracking-tight leading-none`}>EXPO</div>
            <div className={`text-[10px] font-bold uppercase tracking-[0.2em] ${sub}`}>Canlı Display</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${conn === 'live' ? 'bg-emerald-500' : conn === 'offline' ? 'bg-rose-500' : 'bg-amber-500 animate-pulse'}`} />
            <span className={`text-[11px] font-black uppercase tracking-widest ${sub}`}>
              {conn === 'live' ? 'CANLI' : conn === 'offline' ? 'OFFLINE' : 'BAĞLANIYIR'}
            </span>
          </div>
          <div className={`text-2xl md:text-3xl font-black tabular-nums tracking-tight ${text}`}>{fmtClock(now)}</div>
        </div>
      </div>

      {/* 3 zones */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 p-4 md:p-6 overflow-hidden">
        {/* Sifariş hazırdır */}
        <section className={`${panel} rounded-3xl border flex flex-col overflow-hidden`}>
          <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isLight ? 'bg-emerald-50 text-emerald-600' : 'bg-emerald-500/15 text-emerald-400'}`}>
              <Check size={20} strokeWidth={3} />
            </div>
            <div className="text-sm md:text-base font-black uppercase tracking-wider">Sifariş Hazırdır</div>
            <span className={`ml-auto text-2xl font-black tabular-nums ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>{ready.length}</span>
          </div>
          <div className="flex-1 p-3 space-y-3 overflow-y-auto">
            <AnimatePresence mode="popLayout">
              {ready.map((r) => (
                <motion.div
                  key={r.key}
                  layout
                  initial={{ opacity: 0, y: 16, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 26 }}
                  className={`rounded-2xl p-4 border flex items-center gap-3 ${r.kind === 'delivery' ? (isLight ? 'bg-blue-50 border-blue-200' : 'bg-blue-500/10 border-blue-500/25') : (isLight ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-500/10 border-emerald-500/25')}`}
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${r.kind === 'delivery' ? (isLight ? 'bg-blue-100 text-blue-600' : 'bg-blue-500/20 text-blue-400') : (isLight ? 'bg-emerald-100 text-emerald-600' : 'bg-emerald-500/20 text-emerald-400')}`}>
                    {r.kind === 'delivery' ? <Bike size={22} /> : <ShoppingBag size={22} />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-2xl md:text-3xl font-black tabular-nums tracking-tight leading-none">#{r.orderNo}</div>
                    <div className={`text-xs md:text-sm font-bold uppercase tracking-wide mt-1 ${r.kind === 'delivery' ? (isLight ? 'text-blue-600' : 'text-blue-400') : (isLight ? 'text-emerald-600' : 'text-emerald-400')}`}>{r.label}</div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {ready.length === 0 && <div className={`h-full flex items-center justify-center text-5xl font-black ${sub}`}>—</div>}
          </div>
        </section>

        {/* Masa boşaldı */}
        <section className={`${panel} rounded-3xl border flex flex-col overflow-hidden`}>
          <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isLight ? 'bg-zinc-100 text-zinc-600' : 'bg-white/10 text-white/70'}`}>
              <Armchair size={20} />
            </div>
            <div className="text-sm md:text-base font-black uppercase tracking-wider">Masa Boşaldı</div>
            <span className={`ml-auto text-2xl font-black tabular-nums ${sub}`}>{flashes.filter(f => f.kind === 'table').length}</span>
          </div>
          <div className="flex-1 p-3 space-y-3 overflow-y-auto">
            <AnimatePresence mode="popLayout">
              {flashes.filter(f => f.kind === 'table').map((f) => (
                <motion.div
                  key={f.key}
                  layout
                  initial={{ opacity: 0, y: 16, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 26 }}
                  className={`rounded-2xl p-4 border flex items-center gap-3 ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-white/[0.04] border-white/10'}`}
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${isLight ? 'bg-zinc-100 text-zinc-600' : 'bg-white/10 text-white/70'}`}>
                    <Armchair size={22} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-2xl md:text-3xl font-black tracking-tight leading-none">{f.text}</div>
                    <div className={`text-xs md:text-sm font-bold uppercase tracking-wide mt-1 ${sub}`}>{f.sub}</div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {flashes.filter(f => f.kind === 'table').length === 0 && <div className={`h-full flex items-center justify-center text-5xl font-black ${sub}`}>—</div>}
          </div>
        </section>

        {/* Hesab göndərildi */}
        <section className={`${panel} rounded-3xl border flex flex-col overflow-hidden`}>
          <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isLight ? 'bg-amber-50 text-amber-600' : 'bg-amber-500/15 text-amber-400'}`}>
              <Receipt size={20} />
            </div>
            <div className="text-sm md:text-base font-black uppercase tracking-wider">Hesab Göndərildi</div>
            <span className={`ml-auto text-2xl font-black tabular-nums ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>{flashes.filter(f => f.kind === 'bill').length}</span>
          </div>
          <div className="flex-1 p-3 space-y-3 overflow-y-auto">
            <AnimatePresence mode="popLayout">
              {flashes.filter(f => f.kind === 'bill').map((f) => (
                <motion.div
                  key={f.key}
                  layout
                  initial={{ opacity: 0, y: 16, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 26 }}
                  className={`rounded-2xl p-4 border flex items-center gap-3 ${isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-500/10 border-amber-500/25'}`}
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${isLight ? 'bg-amber-100 text-amber-600' : 'bg-amber-500/20 text-amber-400'}`}>
                    <Receipt size={22} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-2xl md:text-3xl font-black tracking-tight leading-none">{f.text}</div>
                    <div className="text-xs md:text-sm font-bold uppercase tracking-wide mt-1 text-amber-500">{f.sub}</div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {flashes.filter(f => f.kind === 'bill').length === 0 && <div className={`h-full flex items-center justify-center text-5xl font-black ${sub}`}>—</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
