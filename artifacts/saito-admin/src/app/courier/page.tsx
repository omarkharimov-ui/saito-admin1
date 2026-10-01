'use client';

// ============================================================================
// 2026-10-02 (12a, owner: "kurye tracking — hətta kurye üçün də bir app yaz"):
// THE COURIER'S OWN APP (mobile browser, always-dark, big touch targets).
//
// Flow: 4-digit PIN (the courier's OWN staff PIN — role 'courier') → active
// orders assigned to ME → big status buttons:
//   [Paketet götürdüm] → picked_up → [Yola düşdüm] → in_transit →
//   [Təslim etdim] → delivered (delivered_at stamped by the DB).
// While an order is active the phone pings GPS every ~15 s → the admin's
// "Kurye xəritəsi" sees the courier LIVE. "Navigasiya" opens Google Maps
// turn-by-turn to the customer point (keyless — the phone does the routing).
//
// Security: httpOnly courier_token cookie (stateless, lib/courier-auth),
// PIN login brute-force-guarded, order actions server-side checked
// (courier_transition: only YOUR orders, validate_transition enforced).
// ============================================================================
import { useEffect, useRef, useState } from 'react';

interface MyOrder {
  id: string;
  order_number: string | null;
  created_at: string;
  delivery_status: string;
  delivered_at: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  delivery_km: number | null;
  delivery_fee: number | null;
  total_amount: number | null;
  customer_lat: number | null;
  customer_lng: number | null;
  items_count?: number;
}
interface CourierMe { name: string; phone: string | null }

const NEXT_ACTION: Record<string, { action: 'picked_up' | 'in_transit' | 'delivered'; label: string; cls: string }> = {
  ready: { action: 'picked_up', label: 'Paketet götürdüm', cls: 'bg-cyan-500 active:bg-cyan-600' },
  waiting_courier: { action: 'picked_up', label: 'Paketet götürdüm', cls: 'bg-cyan-500 active:bg-cyan-600' },
  picked_up: { action: 'in_transit', label: 'Yola düşdüm', cls: 'bg-blue-500 active:bg-blue-600' },
  in_transit: { action: 'delivered', label: 'Təslim etdim', cls: 'bg-emerald-500 active:bg-emerald-600' },
};

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} sn`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} dəq`;
  return `${Math.floor(m / 60)} s ${m % 60} dəq`;
}

export default function CourierPage() {
  const [authed, setAuthed] = useState<null | boolean>(null); // null = checking
  const [me, setMe] = useState<CourierMe | null>(null);
  const [pin, setPin] = useState('');
  const [pinErr, setPinErr] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [lastPing, setLastPing] = useState<string | null>(null);
  const [gpsErr, setGpsErr] = useState(false);
  const [toast, setToast] = useState('');
  const pingAtRef = useRef(0);
  const watchRef = useRef<number | null>(null);

  const flash = (t: string) => { setToast(t); window.setTimeout(() => setToast(''), 2600); };

  // ── session check ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/courier/orders', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d?.orders) { setAuthed(true); setMe({ name: d.me?.name || 'Kurye', phone: d.me?.phone || null }); setOrders(d.orders); }
        else setAuthed(false);
      })
      .catch(() => setAuthed(false));
  }, []);

  // ── PIN login ─────────────────────────────────────────────────────────────
  const press = (d: string) => {
    setPinErr('');
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) {
      setPinBusy(true);
      fetch('/api/courier/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: next }),
      })
        .then(async r => {
          const j = await r.json().catch(() => ({}));
          if (r.ok) {
            setMe({ name: j.courier?.name || 'Kurye', phone: j.courier?.phone || null });
            setPin(''); setPinBusy(false); setAuthed(true);
            const o = await fetch('/api/courier/orders', { cache: 'no-store' }).then(r2 => r2.json());
            if (o?.orders) setOrders(o.orders);
          } else {
            setPinErr(j.error || 'Səhv PIN'); setPin(''); setPinBusy(false);
          }
        })
        .catch(() => { setPinErr('Bağlantı yoxdur'); setPin(''); setPinBusy(false); });
    }
  };

  // ── refresh orders (pull-to-reload via the button + after actions) ───────
  const refresh = () =>
    fetch('/api/courier/orders', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(d => {
      if (d?.orders) setOrders(d.orders);
    }).catch(() => {});
  useEffect(() => {
    if (!authed) return;
    const t = window.setInterval(refresh, 20_000);
    return () => window.clearInterval(t);
  }, [authed]);

  // ── LIVE GPS while an order is on the road ────────────────────────────────
  const active = orders.filter(o => ['ready', 'waiting_courier', 'picked_up', 'in_transit'].includes(o.delivery_status));
  useEffect(() => {
    if (!authed || !('geolocation' in navigator)) return;
    if (active.length === 0) {
      if (watchRef.current != null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }
      setLastPing(null);
      return;
    }
    setGpsErr(false);
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - pingAtRef.current < 15_000) return; // ~15 s cadence
        pingAtRef.current = now;
        setLastPing(new Date().toISOString());
        fetch('/api/courier/ping', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude, order_id: active[0]?.id || null }),
        }).catch(() => {});
      },
      () => setGpsErr(true),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
    );
    return () => { if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; };
  }, [authed, active.length, active[0]?.id]);

  // ── status action ─────────────────────────────────────────────────────────
  const doAction = (o: MyOrder, action: 'picked_up' | 'in_transit' | 'delivered') =>
    fetch(`/api/courier/orders/${o.id}/status`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
    })
      .then(async r => {
        const j = await r.json().catch(() => ({}));
        if (r.ok) flash(action === 'delivered' ? 'Sifariş təhvil verildi ✓' : 'Status yeniləndi ✓');
        else flash(j.error || 'Status dəyişmədi');
        refresh();
      })
      .catch(() => flash('Bağlantı yoxdur'));

  const logout = () => fetch('/api/courier/login', { method: 'DELETE' }).then(() => { setAuthed(false); setMe(null); setOrders([]); });

  // ── PIN screen ────────────────────────────────────────────────────────────
  if (authed === null) {
    return <div className="min-h-dvh bg-zinc-950 flex items-center justify-center text-white/40 text-sm">Yoxlanılır…</div>;
  }
  if (authed === false || !me) {
    return (
      <div className="min-h-dvh bg-zinc-950 text-white flex flex-col items-center justify-center p-6 select-none">
        <div className="text-2xl font-black tracking-tight mb-1">SAITO <span className="text-emerald-400">KURYE</span></div>
        <p className="text-white/40 text-xs mb-8">Daxil olmaq üçün PİN-ini yaz</p>
        <div className="flex gap-4 mb-8" aria-label="PIN">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={`w-5 h-5 rounded-full border-2 transition-colors ${i < pin.length ? 'bg-emerald-400 border-emerald-400' : 'border-white/25'}`} />
          ))}
        </div>
        {pinErr && <p className="text-red-400 text-xs font-bold mb-4">{pinErr}</p>}
        {pinBusy && <p className="text-white/40 text-xs mb-4">Yoxlanılır…</p>}
        <div className="grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((d, i) =>
            d === '' ? <div key={i} /> : (
              <button key={i}
                onClick={() => (d === '⌫' ? setPin(p => p.slice(0, -1)) : press(d))}
                className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 text-3xl font-black active:bg-white/15 transition-colors"
              >{d}</button>
            ))}
        </div>
      </div>
    );
  }

  // ── orders screen ─────────────────────────────────────────────────────────
  const deliveredToday = orders.filter(o => o.delivery_status === 'delivered');
  return (
    <div className="min-h-dvh bg-zinc-950 text-white pb-24">
      <header className="sticky top-0 z-20 bg-zinc-950/95 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-base font-black tracking-tight">SAITO <span className="text-emerald-400">KURYE</span></div>
          <div className="text-[11px] text-white/40">{me.name} · {active.length} aktiv</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refresh()} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[11px] font-bold text-white/70">Yenile</button>
          <button onClick={logout} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[11px] font-bold text-red-300">Çıxış</button>
        </div>
      </header>

      {/* live GPS indicator */}
      <div className={`mx-4 mt-3 px-3 py-2 rounded-xl text-[11px] font-bold border ${gpsErr ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : active.length ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300' : 'bg-white/5 border-white/10 text-white/40'}`}>
        {gpsErr ? '⚠ GPS işləmir — location icazəsini yoxla' : active.length ? `● Canlı GPS: ${timeAgo(lastPing)} əvvəl` : 'GPS gözləyir (sifariş olduqda başlayır)'}
      </div>

      <main className="px-4 mt-3 space-y-3">
        {active.length === 0 && (
          <div className="text-center py-16 text-white/30 text-sm">Aktiv sifariş yoxdur — menzildən yeni çatdırılma gözlə</div>
        )}
        {active.map(o => {
          const na = NEXT_ACTION[o.delivery_status];
          return (
            <div key={o.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-black text-sm">Çatdırılma {String(o.order_number || '').replace('ORD-00000', '')} · {o.items_count || 0} məhsul</div>
                <div className="text-[11px] text-white/40 font-bold">{timeAgo(o.created_at)}</div>
              </div>
              {o.customer_name && <div className="text-sm font-bold">{o.customer_name}{o.customer_phone && <> · <a href={`tel:${o.customer_phone}`} className="text-blue-300">{o.customer_phone}</a></>}</div>}
              {o.delivery_address && <div className="text-[13px] text-white/70 leading-snug">{o.delivery_address}</div>}
              <div className="flex gap-4 text-[11px] font-bold text-white/50">
                <span>ᴀ {o.total_amount != null ? `${Number(o.total_amount).toFixed(2)} ₼` : '—'}</span>
                {o.delivery_km != null && <span>KM {Number(o.delivery_km).toFixed(1)}</span>}
                {o.delivery_fee != null && <span>haqq {Number(o.delivery_fee).toFixed(2)} ₼</span>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={o.customer_lat != null && o.customer_lng != null
                    ? `https://www.google.com/maps/dir/?api=1&destination=${o.customer_lat},${o.customer_lng}`
                    : '#'}
                  target="_blank" rel="noopener noreferrer"
                  className={`col-span-2 text-center py-3.5 rounded-xl font-black text-sm border ${o.customer_lat != null ? 'bg-blue-500/15 border-blue-500/40 text-blue-300 active:bg-blue-500/25' : 'bg-white/5 border-white/10 text-white/30 pointer-events-none'}`}
                >
                  🧭 Navigasiya (Google Maps)
                </a>
                {na && (
                  <button
                    onClick={() => doAction(o, na.action)}
                    className={`col-span-2 py-4 rounded-xl font-black text-base text-white ${na.cls} transition-colors shadow-lg`}
                  >
                    {na.label}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {deliveredToday.length > 0 && (
          <div className="pt-2">
            <div className="text-[11px] font-black uppercase tracking-widest text-white/30 mb-2">Təhvil verildi</div>
            <div className="space-y-2">
              {deliveredToday.map(o => (
                <div key={o.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/15">
                  <div className="text-[13px] font-bold text-emerald-300/90">✓ {String(o.order_number || '').replace('ORD-00000', '')}</div>
                  <div className="text-[11px] text-white/40">{o.delivered_at ? timeAgo(o.delivered_at) : '—'}{o.customer_name ? ` · ${o.customer_name}` : ''}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl bg-white text-zinc-900 text-[13px] font-black shadow-2xl z-50">{toast}</div>}
    </div>
  );
}
