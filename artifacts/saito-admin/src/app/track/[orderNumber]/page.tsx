'use client';

// ============================================================================
// 2026-10-02 (12c): CUSTOMER-FACING LIVE TRACKING — "Sifarişi izlə" (Wolt
// effect, $0 stack).
//
// The customer holds ONLY the order number (shown at checkout + SMS). The
// page shows:
//   • the ROAD route (OSRM geometry) venue → customer,
//   • a SMOOTH courier marker (Supabase Realtime pings + client-side
//     interpolation between pings — src/lib/smooth-marker.ts; bearing
//     needle rotates with movement),
//   • status timeline + ETA + items,
//   • "Təhvil verildi" celebration when done.
// Light theme (matches /menu), mobile-first. No login.
// ============================================================================
import { useEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
// WITHOUT this import Leaflet's pane CSS never loads on the /track route
// (no other component imports it there) → .leaflet-map-pane stays
// position:static, the whole map paints ~4000px below the viewport and the
// customer sees a gray box (caught by the 12c E2E: DOM had the route +
// dots, the pixels did not).
import 'leaflet/dist/leaflet.css';
import { createClient } from '@supabase/supabase-js';
import { SmoothTracker, rafLoop } from '@/lib/smooth-marker';

const STEPS = [
  { key: 'Qəbul edildi', statuses: ['pending', 'confirmed'] },
  { key: 'Hazırlanır', statuses: ['preparing', 'in_kitchen'] },
  { key: 'Hazırdır', statuses: ['ready', 'waiting_courier'] },
  { key: 'Yolda', statuses: ['picked_up', 'in_transit'] },
  { key: 'Təhvil verildi', statuses: ['delivered'] },
];

function stepIndex(status: string): number {
  for (let i = 0; i < STEPS.length; i++) if (STEPS[i].statuses.includes(status)) return i;
  return 0;
}

const COURIER_ICON = L.divIcon({
  className: 'saito-track-courier',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  html: `<div style="position:relative;width:22px;height:22px">
    <div style="position:absolute;inset:2px;border-radius:999px;background:#22c55e;border:3px solid #fff;box-shadow:0 0 0 3px rgba(34,197,94,.4),0 2px 6px rgba(0,0,0,.3)"></div>
    <div class="sm-needle" style="position:absolute;inset:0;transform:rotate(0deg)">
      <div style="position:absolute;left:50%;top:3px;transform:translateX(-50%);width:0;height:0;border-left:4.5px solid transparent;border-right:4.5px solid transparent;border-bottom:8px solid rgba(255,255,255,.95)"></div>
    </div>
  </div>`,
});

export default function TrackPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const [raw, setRaw] = useState('');
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseRef = useRef<L.LayerGroup | null>(null); // route + venue + customer (static per data)
  const courierMkRef = useRef<L.Marker | null>(null);
  const trackerRef = useRef(new SmoothTracker());
  const courierIdRef = useRef<string | null>(null);

  // resolve the (async) route param
  useEffect(() => {
    void (async () => {
      const p = await params;
      setRaw((p.orderNumber || '').replace(/^#/, ''));
    })();
  }, [params]);

  // data poll (5 s) — status / items / route
  useEffect(() => {
    if (!raw) return;
    let stop = false;
    const load = () =>
      fetch(`/api/track/${encodeURIComponent(raw)}`, { cache: 'no-store' })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (stop || !d) return;
          // keep the interpolation buffer fed even without realtime (fallback)
          if (d.courier?.id && d.courier_last) {
            trackerRef.current.feed(d.courier_last.lat, d.courier_last.lng, new Date(d.courier_last.t || Date.now()).getTime());
          }
          setData(d);
          setErr('');
        })
        .catch(() => { if (!stop && !data) setErr('Yüklənir…'); });
    load();
    const iv = window.setInterval(load, 5000);
    return () => { stop = true; window.clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  // map init (11y rule: tile layer ONCE; the wrapper class list is CONSTANT)
  useEffect(() => {
    if (!divRef.current) return;
    const map = L.map(divRef.current, { zoomControl: false, attributionControl: false });
    mapRef.current = map;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
    baseRef.current = L.layerGroup().addTo(map);
    const t = window.setTimeout(() => map.invalidateSize(), 450);
    return () => {
      window.clearTimeout(t);
      mapRef.current = null;
      baseRef.current = null;
      map.remove();
    };
  }, []);

  // draw route + venue + customer on data change
  useEffect(() => {
    const map = mapRef.current; const layer = baseRef.current;
    if (!map || !layer || !data) return;
    layer.clearLayers();
    const pts: L.LatLngTuple[] = [];
    if (data.route?.geometry?.length) {
      L.polyline(data.route.geometry.map((c: [number, number]) => [c[1], c[0]] as L.LatLngTuple), {
        color: '#16a34a', weight: 4, opacity: 0.9, lineCap: 'round', lineJoin: 'round',
      }).addTo(layer);
    }
    if (data.venue) {
      L.circleMarker([data.venue.lat, data.venue.lng], { radius: 8, color: '#1d4ed8', weight: 3, fillColor: '#3b82f6', fillOpacity: 1 })
        .bindTooltip('SAİTO', { permanent: true, direction: 'bottom', className: 'saito-track-tip' }).addTo(layer);
      pts.push([data.venue.lat, data.venue.lng]);
    }
    if (data.customer) {
      L.circleMarker([data.customer.lat, data.customer.lng], { radius: 8, color: '#b91c1c', weight: 3, fillColor: '#ef4444', fillOpacity: 1 })
        .bindTooltip('Siz', { permanent: true, direction: 'top', className: 'saito-track-tip' }).addTo(layer);
      pts.push([data.customer.lat, data.customer.lng]);
    }
    if (pts.length >= 2) map.fitBounds(L.latLngBounds(pts).pad(0.22), { maxZoom: 14, animate: true });
    else if (pts.length === 1) map.setView(pts[0], 14, { animate: true });
  }, [data]);

  // REALTIME courier position + SMOOTH glide (the Wolt effect). The marker
  // is created lazily on the FIRST known position (seed = data.courier_last
  // from the 5 s poll; realtime events then keep it gliding).
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !data?.courier) return;
    const map: L.Map = m;
    const cid = data.courier.id as string;
    if (courierIdRef.current !== cid) {
      // a different courier took over — reset interpolation state
      courierIdRef.current = cid;
      trackerRef.current = new SmoothTracker();
      courierMkRef.current?.remove();
      courierMkRef.current = null;
    }
    if (courierMkRef.current) return; // marker already live for this courier

    let stopped = false;
    let chan: ReturnType<ReturnType<typeof createClient>['channel']> | null = null;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (url && anon) {
      try {
        const sb = createClient(url, anon, { auth: { persistSession: false } });
        chan = sb.channel(`track_${cid.slice(0, 8)}_${Math.random().toString(36).slice(2, 6)}`)
          .on('postgres_changes',
            { event: '*', schema: 'public', table: 'courier_location' },
            (payload) => {
              const n: any = payload.new || {};
              if (n.courier_id !== cid || n.lat == null || n.lng == null) return;
              trackerRef.current.feed(n.lat, n.lng, new Date(n.t || Date.now()).getTime());
              ensureMarker();
            })
          .subscribe();
      } catch { /* realtime optional — the 5 s poll re-feeds positions */ }
    }

    function ensureMarker() {
      if (stopped || courierMkRef.current) return;
      const p = trackerRef.current.lastPing();
      if (!p) return;
      const mk = L.marker([p.lat, p.lng], { icon: COURIER_ICON, zIndexOffset: 600 }).addTo(map);
      mk.bindTooltip(data.courier?.name || 'Kurye', { permanent: true, direction: 'bottom', className: 'saito-track-tip' });
      courierMkRef.current = mk;
      rafLoop((st) => {
        if (!courierMkRef.current) return;
        courierMkRef.current.setLatLng([st.lat, st.lng]);
        const needle = courierMkRef.current.getElement()?.querySelector<HTMLElement>('.sm-needle');
        if (needle && st.bearing != null) needle.style.transform = `rotate(${st.bearing}deg)`;
      }, trackerRef.current, 30);
    }

    // seed immediately from the current poll answer
    if (data.courier_last) {
      trackerRef.current.feed(data.courier_last.lat, data.courier_last.lng, new Date(data.courier_last.t || Date.now()).getTime());
      ensureMarker();
    }

    return () => {
      stopped = true;
      try { if (chan) void chan.unsubscribe(); } catch { /* noop */ }
      courierMkRef.current?.remove();
      courierMkRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.courier?.id, data?.courier?.name, data?.courier_last?.t]);

  const si = data ? stepIndex(data.delivery_status) : 0;
  const delivered = data?.delivery_status === 'delivered';
  const cancelled = data?.delivery_status === 'cancelled';

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900 flex flex-col">
      <style>{`.saito-track-tip { background:#111 !important; color:#fff !important; border:none !important; font-size:10px !important; font-weight:800; padding:2px 7px !important; border-radius:999px !important; } .saito-track-tip::before { display:none !important; }`}</style>
      {/* header */}
      <div className="px-5 pt-5 pb-3 bg-white border-b border-zinc-100">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400">SAİTO · Sifariş izləmə</div>
            <div className="text-lg font-black mt-0.5">#{data?.order_number || raw || '…'}</div>
          </div>
          <div className={`text-sm font-black px-3 py-1.5 rounded-full ${delivered ? 'bg-emerald-100 text-emerald-700' : cancelled ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-700'}`}>
            {data ? data.status_label : '…'}
          </div>
        </div>
      </div>

      {/* map */}
      <div className="relative h-[300px] sm:h-[340px] [background:#e8e6e1]">
        <div ref={divRef} className="absolute inset-0" />
        <div className="absolute bottom-1.5 left-1.5 z-[500] text-[9px] text-black/45 bg-white/70 rounded px-1.5 py-0.5">© OpenStreetMap contributors</div>
        {err && !data && (
          <div className="absolute inset-0 z-[600] flex items-center justify-center bg-white/60 text-sm font-bold text-zinc-500">{err}</div>
        )}
      </div>

      {/* body */}
      <div className="flex-1 px-5 py-4 space-y-4">
        {/* ETA strip */}
        {data && !delivered && !cancelled && (
          <div className="flex items-center justify-between rounded-2xl bg-white border border-zinc-100 px-4 py-3 shadow-sm">
            <div className="text-xs font-bold text-zinc-500">
              {data.route ? `Yol: ${data.route.km} km` : 'Yol hesablanır…'}
            </div>
            <div className="text-sm font-black text-blue-600">
              {delivered ? '' : data.eta_minutes != null ? `≈ ${data.eta_minutes} dəq` : data.route ? `≈ ${data.route.minutes} dəq` : '—'}
            </div>
          </div>
        )}

        {/* timeline */}
        <div className="rounded-2xl bg-white border border-zinc-100 p-4 shadow-sm">
          <div className="space-y-0">
            {STEPS.map((s, i) => {
              const done = i < si || (i === si && !delivered);
              const active = i === si && !cancelled;
              return (
                <div key={s.key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black border-2 ${
                      i < si || delivered ? 'bg-emerald-500 border-emerald-500 text-white'
                      : active ? 'bg-white border-blue-500 text-blue-600'
                      : 'bg-white border-zinc-200 text-zinc-300'
                    }`}>
                      {i < si || delivered ? '✓' : i + 1}
                    </div>
                    {i < STEPS.length - 1 && <div className={`w-0.5 h-5 ${i < si || delivered ? 'bg-emerald-400' : 'bg-zinc-200'}`} />}
                  </div>
                  <div className={`pt-1 text-sm font-bold ${i < si || delivered ? 'text-emerald-700' : active ? 'text-blue-700' : 'text-zinc-400'}`}>
                    {s.key}
                    {i === si && !delivered && !cancelled && s.statuses.includes('in_transit') && data.courier && (
                      <span className="block text-[11px] font-semibold text-zinc-500">{data.courier.name} sifarişinizlə yola düşdü</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* items */}
        {data && data.items?.length > 0 && (
          <div className="rounded-2xl bg-white border border-zinc-100 p-4 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 mb-2">Sifarişiniz</div>
            {data.items.map((it: any, i: number) => (
              <div key={i} className="flex justify-between text-sm py-0.5">
                <span className="font-semibold text-zinc-700">{it.name}</span>
                <span className="text-zinc-400 font-bold">×{it.qty}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-black pt-2 mt-2 border-t border-zinc-100">
              <span>Cəmi</span>
              <span>₼{Number(data.total).toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* delivered */}
        {delivered && (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500 text-white flex items-center justify-center text-2xl font-black">✓</div>
            <div className="text-base font-black text-emerald-800 mt-3">Sifarişiniz təhvil verildi</div>
            <div className="text-xs font-semibold text-emerald-600 mt-1">Afiyet olsun! SAİTO-yə etibarınız üçün təşəkkür edirik.</div>
          </div>
        )}
        {cancelled && (
          <div className="rounded-2xl bg-red-50 border border-red-200 p-5 text-center">
            <div className="text-base font-black text-red-700">Sifariş ləğv edilib</div>
            <div className="text-xs font-semibold text-red-500 mt-1">Suallarınız üçün bizi zəngləyin.</div>
          </div>
        )}
      </div>
    </div>
  );
}
