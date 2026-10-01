'use client';

// ============================================================================
// 2026-10-02 (12c): ADMIN LIVE DISPATCH MAP — THE "WOLT EFFECT" LAYER.
//
// 12a version: polled /api/courier/live every 30 s and RECREATED the courier
// marker at each answer → the dot JUMPED between pings.
// 12c version:
//   • Supabase Realtime (postgres_changes on courier_location, anon) pushes
//     every ping the instant the courier's phone sends it;
//   • a SmoothTracker per courier (src/lib/smooth-marker.ts) interpolates
//     the marker BETWEEN pings (requestAnimationFrame glide + coast);
//   • the dot carries a BEARING needle (rotates with movement direction);
//   • CAMERA FOLLOW: the map pans (no animation) behind the freshest
//     courier while "Kamera" is on; manual pan/zoom suspends follow 4 s.
//   • the 30 s poll stays as a FALLBACK (WS drops, roster/venue/orders).
// ============================================================================
import { useEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import { createClient } from '@supabase/supabase-js';
import { useTheme } from '@/lib/theme/ThemeContext';
import { SmoothTracker, rafLoop } from '@/lib/smooth-marker';

const STAGE: Record<string, string> = {
  ready: 'gözləyir', waiting_courier: 'gözləyir', picked_up: 'aldı', in_transit: 'yolda',
};

function ageLabel(at: string | null): string {
  if (!at) return 'GPS gözləyir';
  const s = Math.max(0, Math.floor((Date.now() - new Date(at).getTime()) / 1000));
  if (s < 60) return `${s} sn əvvəl`;
  if (s < 3600) return `${Math.floor(s / 60)} dəq əvvəl`;
  return `${Math.floor(s / 3600)} saat əvvəl`;
}

// Wolt-style courier dot: green disc + white bearing needle (rotates).
const COURIER_ICON = L.divIcon({
  className: 'saito-smooth-courier',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  html: `<div style="position:relative;width:22px;height:22px">
    <div style="position:absolute;inset:2px;border-radius:999px;background:#22c55e;border:3px solid #fff;box-shadow:0 0 0 3px rgba(34,197,94,.4),0 2px 6px rgba(0,0,0,.35)"></div>
    <div class="sm-needle" style="position:absolute;inset:0;transform:rotate(0deg)">
      <div style="position:absolute;left:50%;top:3px;transform:translateX(-50%);width:0;height:0;border-left:4.5px solid transparent;border-right:4.5px solid transparent;border-bottom:8px solid rgba(255,255,255,.95)"></div>
    </div>
  </div>`,
});

interface CourierLiveMapModalProps {
  lightMode: boolean;
  onClose: () => void;
}

export default function CourierLiveMapModal({ lightMode, onClose }: CourierLiveMapModalProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const staticRef = useRef<L.LayerGroup | null>(null); // venue + order dots (redraw on data)
  const courierMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const trackersRef = useRef<Map<string, SmoothTracker>>(new Map());
  const followRef = useRef(true);
  const [follow, setFollow] = useState(true);
  const [data, setData] = useState<any>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [rt, setRt] = useState<'connecting' | 'live' | 'poll'>('connecting');
  const [err, setErr] = useState('');
  const [, bump] = useState(0); // age-label re-render tick

  // init map + tile layer ONCE (11y: tile layer never re-added)
  useEffect(() => {
    if (!divRef.current) return;
    const map = L.map(divRef.current, { zoomControl: true, attributionControl: false, doubleClickZoom: true });
    mapRef.current = map;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    staticRef.current = L.layerGroup().addTo(map);
    const t = window.setTimeout(() => map.invalidateSize(), 450);
    return () => {
      window.clearTimeout(t);
      mapRef.current = null;
      staticRef.current = null;
      courierMarkersRef.current.clear();
      trackersRef.current.clear();
      map.remove();
    };
  }, []);

  // FALLBACK poll (30 s) — venue / orders / roster + re-seed trackers
  useEffect(() => {
    let stop = false;
    const load = () =>
      fetch('/api/courier/live', { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
          if (stop || !d) return;
          setData(d);
          setUpdatedAt(new Date());
          setErr('');
          // seed/refresh trackers from the poll answer
          for (const c of d.couriers || []) {
            if (c.last_lat == null) continue;
            let tr = trackersRef.current.get(c.id);
            if (!tr) {
              tr = new SmoothTracker();
              trackersRef.current.set(c.id, tr);
            }
            tr.feed(c.last_lat, c.last_lng, new Date(c.last_at).getTime());
          }
        })
        .catch(() => { if (!stop) setErr('Yüklənir…'); });
    load();
    const iv = window.setInterval(load, 30_000);
    return () => { stop = true; window.clearInterval(iv); };
  }, []);

  // REALTIME push — every courier ping, the instant it lands in the DB
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!url || !anon) { setRt('poll'); return; }
    let chan: ReturnType<ReturnType<typeof createClient>['channel']> | null = null;
    try {
      const sb = createClient(url, anon, { auth: { persistSession: false } });
      chan = sb.channel(`courier_live_admin_${Math.random().toString(36).slice(2, 8)}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'courier_location' },
          (payload) => {
            const n: any = payload.new || {};
            if (n.courier_id == null || n.lat == null || n.lng == null) return;
            let tr = trackersRef.current.get(n.courier_id);
            if (!tr) {
              tr = new SmoothTracker();
              trackersRef.current.set(n.courier_id, tr);
            }
            tr.feed(n.lat, n.lng, new Date(n.t || Date.now()).getTime());
            bump(x => x + 1); // refresh the "N sn əvvəl" labels
          })
        .subscribe((status) => {
          setRt(status === 'SUBSCRIBED' ? 'live' : 'poll');
        });
    } catch {
      setRt('poll');
    }
    return () => { try { if (chan) { void chan.unsubscribe(); } } catch { /* noop */ } };
  }, []);

  // DRAW static layer (venue + orders) on data change
  useEffect(() => {
    const map = mapRef.current; const layer = staticRef.current;
    if (!map || !layer || !data) return;
    layer.clearLayers();
    const pts: L.LatLngTuple[] = [];
    if (data.venue) {
      L.circleMarker([data.venue.lat, data.venue.lng], { radius: 9, color: '#2563eb', weight: 3, fillColor: '#3b82f6', fillOpacity: 1 })
        .bindTooltip('SAITO (menzil)', { permanent: false, direction: 'top' })
        .addTo(layer);
      pts.push([data.venue.lat, data.venue.lng]);
    }
    for (const o of data.orders) {
      if (o.customer_lat == null || o.customer_lng == null) continue;
      L.circleMarker([o.customer_lat, o.customer_lng], { radius: 7, color: '#dc2626', weight: 2, fillColor: '#ef4444', fillOpacity: 0.95 })
        .bindTooltip(`${String(o.order_number || '').replace('ORD-00000', '')} · ${STAGE[o.delivery_status] || o.delivery_status}${o.courier_name ? ` · ${o.courier_name}` : ''}`, { permanent: false, direction: 'top' })
        .addTo(layer);
      pts.push([o.customer_lat, o.customer_lng]);
    }
    if (pts.length >= 2) {
      map.fitBounds(L.latLngBounds(pts).pad(0.25), { animate: true, maxZoom: 14 });
    } else if (pts.length === 1) {
      map.setView(pts[0], 13, { animate: true });
    }
  }, [data]);

  // COURIER markers: ensured on every data tick (create-once per courier)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;
    for (const [id, tr] of trackersRef.current) {
      const lp = tr.lastPing();
      if (!lp) continue;
      let mk = courierMarkersRef.current.get(id);
      if (!mk) {
        mk = L.marker([lp.lat, lp.lng], { icon: COURIER_ICON, zIndexOffset: 500 });
        mk.bindTooltip(`${(data.couriers || []).find((c: any) => c.id === id)?.name || 'kurye'} · ${ageLabel(new Date(lp.t).toISOString())}`, { permanent: true, direction: 'top', className: 'saito-courier-tip' });
        mk.addTo(map);
        courierMarkersRef.current.set(id, mk);
      }
    }
  }, [data]);

  // THE WOLT EFFECT: one RAF loop for the whole modal lifetime — glide each
  // marker between pings, rotate the bearing needle, pan the camera behind
  // the freshest moving courier (follow toggle). Manual pan/zoom suspends
  // the follow for 4 s (cameraFollow handles the map events).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // manual pan/zoom suspends the camera follow for 4 s (Wolt behavior)
    let followSuspended = false;
    const suspend = () => { followSuspended = true; };
    const resumeSoon = () => window.setTimeout(() => { followSuspended = false; }, 4000);
    map.on('dragstart', suspend);
    map.on('zoomstart', suspend);
    map.on('moveend', resumeSoon);
    const stopLoop = rafLoop(() => {
      let freshest: { tr: SmoothTracker; t: number } | null = null;
      for (const [id, tr] of trackersRef.current) {
        const mk = courierMarkersRef.current.get(id);
        if (!mk) continue;
        const st = tr.positionAt();
        mk.setLatLng([st.lat, st.lng]);
        const needle = mk.getElement()?.querySelector<HTMLElement>('.sm-needle');
        if (needle && st.bearing != null) needle.style.transform = `rotate(${st.bearing}deg)`;
        const lp = tr.lastPing();
        if (lp && (!freshest || lp.t > freshest.t)) freshest = { tr, t: lp.t };
      }
      if (followRef.current && !followSuspended && freshest) {
        const st = freshest.tr.positionAt();
        if (st.moving) map.panTo([st.lat, st.lng], { animate: false });
      }
    }, new SmoothTracker(), 30);
    return () => {
      stopLoop();
      map.off('dragstart', suspend);
      map.off('zoomstart', suspend);
      map.off('moveend', resumeSoon);
      for (const mk of courierMarkersRef.current.values()) mk.remove();
      courierMarkersRef.current.clear();
    };
  }, []);

  // follow toggle
  useEffect(() => { followRef.current = follow; }, [follow]);

  // age labels tick every 10 s
  useEffect(() => {
    const t = window.setInterval(() => bump(x => x + 1), 10_000);
    return () => window.clearInterval(t);
  }, []);

  const online = (data?.couriers || []).filter((c: any) => c.last_lat != null);

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <style>{`
        .saito-courier-tip { background: #111 !important; color: #fff !important; border: none !important; font-size: 10px !important; font-weight: 800; padding: 2px 6px !important; border-radius: 6px !important; box-shadow: 0 2px 8px rgba(0,0,0,.4) !important; }
        .saito-courier-tip::before { display: none !important; }
      `}</style>
      <div
        className={`w-full max-w-3xl rounded-2xl overflow-hidden border shadow-2xl ${lightMode ? 'bg-white border-zinc-200' : 'bg-zinc-950 border-white/10'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between px-4 py-3 border-b ${lightMode ? 'border-zinc-200' : 'border-white/10'}`}>
          <div>
            <div className={`text-sm font-black ${lightMode ? 'text-zinc-900' : 'text-white'}`}>
              Kurye xəritəsi — CANLI
              <span className={`ml-2 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md ${rt === 'live' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-amber-500/15 text-amber-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${rt === 'live' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                {rt === 'live' ? 'realtime' : 'poll 30s'}
              </span>
            </div>
            <div className={`text-[10px] font-bold ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
              {updatedAt ? `sinxron ${updatedAt.toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'yüklənir…'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFollow(f => !f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-black ${follow ? 'bg-emerald-500/15 text-emerald-500' : lightMode ? 'bg-zinc-100 text-zinc-500' : 'bg-white/10 text-white/60'}`}
            >
              📍 Kamera: {follow ? 'Kurye' : 'Sərbəst'}
            </button>
            <button onClick={onClose} className={`px-3 py-1.5 rounded-lg text-xs font-black ${lightMode ? 'bg-zinc-100 text-zinc-600' : 'bg-white/10 text-white/70'}`}>Bağla ✕</button>
          </div>
        </div>
        <div className="grid md:grid-cols-[1fr_220px]">
          {/* 11y rule: the CLASS LIST OF THIS WRAPPER IS A CONSTANT — never theme-reactive */}
          <div className="relative h-[300px] md:h-[380px] [background:#e8e6e1]">
            <div ref={divRef} className={`absolute inset-0 ${lightMode ? '' : 'invert hue-rotate-180 saturate-[.35] brightness-[.85]'}`} />
            <div className="absolute bottom-1 left-1 z-[500] text-[9px] text-black/45 bg-white/70 rounded px-1.5 py-0.5">© OpenStreetMap contributors</div>
            {err && <div className="absolute inset-0 z-[600] flex items-center justify-center bg-black/30 text-white text-xs font-bold">{err}</div>}
          </div>
          <div className={`p-3 space-y-2 overflow-y-auto max-h-[380px] ${lightMode ? 'bg-zinc-50' : 'bg-white/[0.02]'}`}>
            <div className={`text-[10px] font-black uppercase tracking-widest ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>
              Kuryələr · {online.length}/{data?.couriers.length || 0} onlayn
            </div>
            {(data?.couriers || []).map((c: any) => (
              <div key={c.id} className={`rounded-xl border p-2.5 ${c.last_lat != null ? (lightMode ? 'border-emerald-200 bg-emerald-50' : 'border-emerald-500/25 bg-emerald-500/10') : (lightMode ? 'border-zinc-200 bg-white' : 'border-white/10 bg-white/[0.03]')}`}>
                <div className={`text-xs font-black ${lightMode ? 'text-zinc-900' : 'text-white'}`}>
                  {c.name} <span className={`inline-block w-2 h-2 rounded-full ${c.last_lat != null ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                </div>
                <div className={`text-[10px] font-bold ${lightMode ? 'text-zinc-500' : 'text-white/45'}`}>{ageLabel(c.last_at)}</div>
              </div>
            ))}
            <div className={`pt-1 text-[10px] font-black uppercase tracking-widest ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>
              Aktiv çatdırılmalar · {data?.orders.length || 0}
            </div>
            {(data?.orders || []).map((o: any) => (
              <div key={o.id} className={`rounded-xl border p-2.5 ${lightMode ? 'border-zinc-200 bg-white' : 'border-white/10 bg-white/[0.03]'}`}>
                <div className={`text-xs font-black ${lightMode ? 'text-zinc-900' : 'text-white'}`}>
                  #{String(o.order_number || '').replace('ORD-00000', '')} · <span className="text-blue-500">{STAGE[o.delivery_status] || o.delivery_status}</span>
                </div>
                <div className={`text-[10px] font-bold ${lightMode ? 'text-zinc-500' : 'text-white/45'}`}>
                  {o.courier_name || 'kurye yoxdur'}{o.customer_name ? ` → ${o.customer_name}` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
