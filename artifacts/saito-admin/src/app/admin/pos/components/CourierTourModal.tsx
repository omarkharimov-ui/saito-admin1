'use client';

// ============================================================================
// 2026-10-01 (11w-E, owner: "daha da yaxşı — kurye turları"): COURIER TOUR.
// Active delivery orders → tick the ones on one trip → OSRM all-pairs matrix
// (FREE, keyless) → nearest-neighbor stop order + per-leg km/minutes + totals.
// What competitors sell as a separate dispatch product — here: a button.
// ============================================================================

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Route, X, Navigation, MapPin } from '@/components/ui/saito-icons';

interface CourierTourModalProps {
  orders: any[];
  lightMode: boolean;
  onClose: () => void;
}

const SPRING = { type: 'spring', stiffness: 500, damping: 26 } as const;

function orderNo(o: any): string {
  return (String(o.order_number || '').replace(/[^0-9]/g, '')) || String(o.id).slice(-4).toUpperCase();
}

export default function CourierTourModal({ orders, lightMode, onClose }: CourierTourModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [computing, setComputing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ stops: { id: string; name: string; leg_km: number; leg_min: number; cum_km: number; cum_min: number }[]; total_km: number; total_min: number } | null>(null);
  const [missed, setMissed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const candidates = (orders || []).filter((o: any) => String(o.delivery_address || '').trim().length >= 6);

  const toggle = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const compute = async () => {
    const chosen = candidates.filter((o: any) => selected.has(o.id));
    if (!chosen.length || computing) return;
    setComputing(true);
    setError(null);
    setResult(null);
    setMissed(0);
    try {
      // 1) geocode every picked address (Nominatim 15s cache — repeats are
      //    free; sequential = their 1 req/s policy respected server-side).
      const pts: { id: string; name: string; lat: number; lng: number }[] = [];
      let miss = 0;
      for (let i = 0; i < chosen.length; i++) {
        setProgress({ done: i, total: chosen.length });
        try {
          const r = await fetch(`/api/geocode?address=${encodeURIComponent(chosen[i].delivery_address.trim())}`, { cache: 'no-store' });
          const d = r.ok ? await r.json() : null;
          if (d && Number.isFinite(d.customer_lat) && Number.isFinite(d.customer_lng)) {
            pts.push({ id: chosen[i].id, name: `Ç${orderNo(chosen[i])} · ${chosen[i].delivery_address}`, lat: d.customer_lat, lng: d.customer_lng });
          } else miss++;
        } catch { miss++; }
      }
      setMissed(miss);
      if (!pts.length) {
        setError('Heç bir ünvan xəritədə tapılmadı');
        return;
      }
      setProgress({ done: chosen.length, total: chosen.length });
      // 2) ONE OSRM matrix call → NN stop order + legs + totals.
      const res = await fetch('/api/courier-tour', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: pts }),
      });
      const d = res.ok ? await res.json() : null;
      if (!res.ok || !d?.stops?.length) {
        setError('Marşrut hesablanmadı (OSRM) — 10 saniyəyə yenidən cəhd et');
        return;
      }
      setResult(d);
    } catch {
      setError('Marşrut hesablanmadı — bağlantını yoxla');
    } finally {
      setComputing(false);
      setProgress(null);
    }
  };

  const cardCls = `fixed inset-0 z-[200] flex items-center justify-center p-4`;
  const panelCls = `w-full max-w-[520px] max-h-[85vh] flex flex-col rounded-3xl border shadow-2xl ${
    lightMode ? 'bg-white border-zinc-200' : 'bg-zinc-950 border-white/10'
  }`;
  const dim = lightMode ? 'text-zinc-500' : 'text-white/45';
  const strong = lightMode ? 'text-zinc-900' : 'text-white';

  return (
    <div className={cardCls}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 12 }}
        transition={SPRING}
        className={`relative ${panelCls}`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${lightMode ? 'border-zinc-100' : 'border-white/[0.06]'}`}>
          <div className={`flex items-center gap-2 text-sm font-black ${strong}`}>
            <Route size={16} className="text-blue-500" />
            Kurye turu
            <span className={`text-[10px] font-bold ${dim}`}>OSM · free</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`h-8 w-8 rounded-xl flex items-center justify-center border ${lightMode ? 'border-zinc-200 text-zinc-500 hover:bg-zinc-50' : 'border-white/10 text-white/50 hover:bg-white/[0.05]'}`}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {candidates.length === 0 ? (
            <p className={`text-xs font-semibold ${dim}`}>Ünvanlı aktiv çatdırılma sifəsi yoxdur — tur qurmaq üçün sifariş göndər.</p>
          ) : (
            <>
              <p className={`text-[10px] font-black uppercase tracking-[0.14em] ${dim}`}>
                Tura daxiletmək üçün sifariş seç ({selected.size}/{candidates.length})
              </p>
              <div className="space-y-2">
                {candidates.map((o: any) => {
                  const on = selected.has(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => toggle(o.id)}
                      className={`w-full flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-all active:scale-[0.99] ${
                        on
                          ? (lightMode ? 'bg-blue-50 border-blue-300' : 'bg-blue-500/10 border-blue-400/40')
                          : (lightMode ? 'bg-white border-zinc-200 hover:border-zinc-300' : 'bg-white/[0.02] border-white/[0.08] hover:border-white/20')
                      }`}
                    >
                      <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                        on ? (lightMode ? 'bg-blue-500 border-blue-500 text-white' : 'bg-blue-400 border-blue-400 text-zinc-950') : (lightMode ? 'border-zinc-300' : 'border-white/25')
                      }`}>
                        {on && <span className="text-[10px] font-black">✓</span>}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className={`block text-xs font-black ${strong}`}>Ç{orderNo(o)}</span>
                        <span className={`block text-[11px] font-semibold truncate ${dim}`}>{o.delivery_address}</span>
                      </span>
                      {o.delivery_zone && (
                        <span className={`text-[10px] font-bold flex-shrink-0 ${dim}`}>{o.delivery_zone}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Progress */}
          {computing && progress && (
            <p className={`text-[11px] font-bold ${dim}`}>
              Ünvanlar xəritədən təsdiq olunur… {progress.done}/{progress.total}
            </p>
          )}
          {computing && !progress && (
            <p className={`text-[11px] font-bold ${dim}`}>Marşrut OSRM-də hesablanır…</p>
          )}
          {error && (
            <p className="text-[11px] font-bold text-red-500">{error}</p>
          )}
          {result && missed > 0 && !error && (
            <p className="text-[11px] font-bold text-amber-500">{missed} ünvan xəritədə tapılmadı — tura daxil olmadı</p>
          )}

          {/* Result */}
          {result && !error && (
            <div className="space-y-2">
              <div className={`rounded-2xl border px-4 py-3 flex items-center justify-between ${
                lightMode ? 'bg-blue-50 border-blue-200' : 'bg-blue-500/10 border-blue-400/25'
              }`}>
                <span className={`text-[10px] font-black uppercase tracking-[0.14em] ${lightMode ? 'text-blue-600' : 'text-blue-300'}`}>
                  Cəm tur
                </span>
                <span className={`text-sm font-black tabular-nums ${lightMode ? 'text-blue-700' : 'text-blue-200'}`}>
                  {result.total_km} km · ~{result.total_min} dəq · {result.stops.length} ünvan
                </span>
              </div>
              {result.stops.map((s, i) => (
                <div key={s.id + i} className={`flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 ${lightMode ? 'bg-white border-zinc-200' : 'bg-white/[0.02] border-white/[0.08]'}`}>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0 ${
                    lightMode ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-950'
                  }`}>
                    {i + 1}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={`block text-xs font-black truncate ${strong}`}>{s.name}</span>
                    <span className={`block text-[10px] font-bold ${dim}`}>
                      <Navigation size={10} className="inline mr-1" />
                      {s.leg_km} km · ~{s.leg_min} dəq
                    </span>
                  </span>
                  <span className={`text-[10px] font-black tabular-nums flex-shrink-0 ${dim}`}>cəm {s.cum_min} dəq</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`px-5 py-4 border-t ${lightMode ? 'border-zinc-100' : 'border-white/[0.06]'}`}>
          <button
            type="button"
            disabled={computing || selected.size === 0}
            onClick={compute}
            className={`w-full h-12 rounded-2xl flex items-center justify-center gap-2 text-sm font-black uppercase tracking-wider transition-all active:scale-[0.98] disabled:opacity-40 ${
              lightMode ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-blue-500 text-white hover:bg-blue-400'
            }`}
          >
            <MapPin size={15} />
            {result ? 'Yenidən hesabla' : `Marşrut hesabla (${selected.size})`}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
