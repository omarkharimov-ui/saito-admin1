'use client';

// ============================================================================
// 2026-10-02 (12a, owner: "kurye tracking"): ADMIN LIVE DISPATCH MAP.
// One Leaflet map: venue (blue) + every active order's customer point (red)
// + every courier's LAST GPS ping (green, name + freshness label). Polls
// /api/courier/live every 30 s (3 small service-role reads — keyless).
//
// Map rules are the 11y ones (Apple-style, OSM tiles + CSS filter, tile
// layer created ONCE, constant wrapper class, late invalidateSize).
// ============================================================================
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

interface LiveData {
  venue: { lat: number; lng: number } | null;
  couriers: { id: string; name: string; phone: string | null; kind: string; last_lat: number | null; last_lng: number | null; last_at: string | null; last_order_id: string | null }[];
  orders: { id: string; order_number: string | null; delivery_status: string; courier_name: string | null; customer_lat: number | null; customer_lng: number | null; customer_name: string | null }[];
}

function ageLabel(iso: string | null): string {
  if (!iso) return 'GPS yoxdur';
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} sn əvvəl`;
  return `${Math.floor(s / 60)} dəq əvvəl`;
}

const STAGE: Record<string, string> = {
  ready: 'hazırdır', waiting_courier: 'kurye gözləyir', picked_up: 'göterildi', in_transit: 'yolda',
};

export default function CourierLiveMapModal({ lightMode, onClose }: { lightMode: boolean; onClose: () => void }) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [data, setData] = useState<LiveData | null>(null);
  const [err, setErr] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  // init — ONCE (11y rules: constant wrapper class, tile layer never swapped)
  useEffect(() => {
    const div = divRef.current;
    if (!div || mapRef.current) return;
    const map = L.map(div, { attributionControl: false, zoomControl: true });
    map.setView([40.4, 49.86], 11);
    tileRef.current = L.tileLayer(OSM_TILES, { maxZoom: 19 }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const t = window.setTimeout(() => map.invalidateSize(), 500); // sheet anim
    return () => { window.clearTimeout(t); tileRef.current = null; layerRef.current = null; map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // poll
  useEffect(() => {
    let stop = false;
    const load = () =>
      fetch('/api/courier/live', { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (!stop && d) { setData(d); setUpdatedAt(new Date()); setErr(''); } })
        .catch(() => { if (!stop) setErr('Yüklənir…'); });
    load();
    const t = window.setInterval(load, 30_000);
    return () => { stop = true; window.clearInterval(t); };
  }, []);

  // draw
  useEffect(() => {
    const map = mapRef.current; const layer = layerRef.current;
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
    for (const c of data.couriers) {
      if (c.last_lat == null || c.last_lng == null) continue;
      const marker = L.marker([c.last_lat, c.last_lng], {
        icon: L.divIcon({
          className: 'saito-courier-dot',
          iconSize: [14, 14], iconAnchor: [7, 7],
          html: '<div style="width:14px;height:14px;border-radius:999px;background:#22c55e;border:3px solid white;box-shadow:0 0 0 2px rgba(34,197,94,.5)"></div>',
        }),
      });
      marker.bindTooltip(`${c.name} · ${ageLabel(c.last_at)}`, { permanent: true, direction: 'top', className: 'saito-courier-tip' });
      marker.addTo(layer);
      pts.push([c.last_lat, c.last_lng]);
    }
    if (pts.length >= 2) {
      map.fitBounds(L.latLngBounds(pts).pad(0.25), { animate: true, maxZoom: 14 });
    } else if (pts.length === 1) {
      map.setView(pts[0], 13, { animate: true });
    }
  }, [data]);

  const online = (data?.couriers || []).filter(c => c.last_lat != null);

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
            <div className={`text-sm font-black ${lightMode ? 'text-zinc-900' : 'text-white'}`}>Kurye xəritəsi — CANLI</div>
            <div className={`text-[10px] font-bold ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
              {updatedAt ? `yenilənib ${updatedAt.toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'yüklənir…'} · 30s-də bir
            </div>
          </div>
          <button onClick={onClose} className={`px-3 py-1.5 rounded-lg text-xs font-black ${lightMode ? 'bg-zinc-100 text-zinc-600' : 'bg-white/10 text-white/70'}`}>Bağla ✕</button>
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
            {(data?.couriers || []).map(c => (
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
            {(data?.orders || []).map(o => (
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
