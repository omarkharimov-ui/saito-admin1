'use client';

// ============================================================================
// 2026-10-01 (11w-B, 11x): MINI-MAP — Leaflet + OpenStreetMap tiles
// (FREE, no API key).
//
// 11x (owner: "mini xerite uzerinden ayarlaya bilsinde, surusdurub ora
// qoysun" + "transition biraz daha qalın"):
//   - TAP/DCLICK on the map → the customer pin JUMPS there (animated) and
//     the parent gets the new point (→ reverse geocode → address + OSRM km
//     + auto zone — the MAP is now an input, not just a display).
//   - The red pin itself is DRAGGABLE (pini tut, sürüşdür, burax).
//   - Smooth: animated setView/fitBounds + a CSS transform transition on
//     the pin marker (Leaflet positions markers via CSS transform, so the
//     pin glides instead of teleporting).
//   - No customer point yet (address typed but not in OSM) → the map still
//     renders, centered on the venue, with a "tıkla" hint — the operator
//     places the point by hand.
// ============================================================================

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Pt { lat: number; lng: number }

interface PosMiniMapProps {
  venue: Pt;
  /** null = no resolved point yet — show venue + "place it" mode. */
  customer: Pt | null;
  /** Active zone max_km — the delivery radius ring (null = no ring). */
  radiusKm: number | null;
  lightMode: boolean;
  /** Map click / pin drag end → the operator set the point by hand. */
  onPickPoint?: (p: Pt) => void;
  // 11x: MAP-AS-SEARCH — no point yet, but the typed address names a city
  // ("bravo SUMQAYIT 9cu mikrorayon") → the map zooms to that city so the
  // operator sees the district's street labels on the OSM tiles and clicks
  // the exact spot. (The tiles carry the data; the search index doesn't.)
  focus?: { name: string; lat: number; lng: number } | null;
}

const PIN_ICON = L.divIcon({
  className: 'saito-pin', // our CSS class (transition + no default styles)
  iconSize: [30, 38],
  iconAnchor: [15, 36],
  html: `<div class="saito-pin-inner">
           <svg width="30" height="38" viewBox="0 0 30 38">
             <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 23 15 23s15-12.5 15-23C30 6.7 23.3 0 15 0z" fill="#dc2626" stroke="#fff" stroke-width="2"/>
             <circle cx="15" cy="14.5" r="5.5" fill="#fff"/>
           </svg>
         </div>`,
});

const VENUE_ICON = L.divIcon({
  className: 'saito-pin',
  iconSize: [22, 28],
  iconAnchor: [11, 26],
  html: `<div class="saito-pin-inner">
           <svg width="22" height="28" viewBox="0 0 30 38">
             <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 23 15 23s15-12.5 15-23C30 6.7 23.3 0 15 0z" fill="#2563eb" stroke="#fff" stroke-width="2.5"/>
             <circle cx="15" cy="14.5" r="5.5" fill="#fff"/>
           </svg>
         </div>`,
});

export default function PosMiniMap({ venue, customer, radiusKm, lightMode, onPickPoint, focus }: PosMiniMapProps) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const ringRef = useRef<L.Circle | null>(null);
  const venueMarkerRef = useRef<L.Marker | null>(null);
  const pinRef = useRef<L.Marker | null>(null);
  const pickRef = useRef<((p: Pt) => void) | undefined>(onPickPoint);
  pickRef.current = onPickPoint; // always-fresh callback (map handlers persist)

  // Create the map ONCE per mount (Leaflet refuses to re-init a container).
  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = L.map(divRef.current, {
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: true,
      dragging: true,
    });
    map.setView([venue.lat, venue.lng], 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
    venueMarkerRef.current = L.marker([venue.lat, venue.lng], { icon: VENUE_ICON, interactive: false }).addTo(map);
    // Tap = place the customer point (works on touch + mouse; dragend on the
    // map itself must NOT place — that's panning, not pointing).
    map.on('click', (e: L.LeafletMouseEvent) => pickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    mapRef.current = map;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(divRef.current);
    return () => {
      ro.disconnect();
      // Drop layer refs FIRST: HMR can tear this map down mid-frame — an
      // effect running against a removed map's SVG renderer throws
      // "reading 'baseVal'" (11x E2E one-off crash).
      ringRef.current = null;
      venueMarkerRef.current = null;
      pinRef.current = null;
      try { map.remove(); } catch { /* already gone */ }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Zone ring + venue position (rare changes — separate effect, no re-fit).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      if (ringRef.current) { map.removeLayer(ringRef.current); ringRef.current = null; }
    } catch { /* map torn down (HMR) — nothing to clean */ }
    if (radiusKm != null && radiusKm > 0) {
      ringRef.current = L.circle([venue.lat, venue.lng], {
        radius: radiusKm * 1000,
        color: '#2563eb',
        weight: 1.5,
        fillColor: '#3b82f6',
        fillOpacity: 0.07,
        interactive: false,
      }).addTo(map);
    }
    venueMarkerRef.current?.setLatLng([venue.lat, venue.lng]);
  }, [venue.lat, venue.lng, radiusKm]);

  // Customer pin: create once, then GLIDE it (CSS transition on transform).
  // Re-fit the frame ONLY when the point first appears or lands outside the
  // current view — a manual drag that stays in view must NOT yank the frame
  // (that was the "transition" complaint: re-centering on every dragend).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!customer) { pinRef.current?.remove(); pinRef.current = null; return; }
    const isNew = !pinRef.current;
    if (!pinRef.current) {
      const m = L.marker([customer.lat, customer.lng], { icon: PIN_ICON, draggable: true, autoPan: true }).addTo(map);
      m.on('dragend', () => {
        const ll = m.getLatLng();
        pickRef.current?.({ lat: ll.lat, lng: ll.lng });
      });
      pinRef.current = m;
    } else {
      // CSS transition animates this setLatLng (see saito-pin CSS below).
      pinRef.current.setLatLng([customer.lat, customer.lng]);
    }
    const b: [number, number] = [customer.lat, customer.lng];
    const a: [number, number] = [venue.lat, venue.lng];
    const within = map.getBounds().pad(-0.1).contains(b);
    // 11x E2E fix: a degenerate frame (world/country zoom, zoom<9 — happens
    // after a glitch or heavy manual zoom-out) must always snap back to
    // delivery scale; also re-fit when the point pair is far vs the frame.
    const bds = map.getBounds();
    const span = Math.max(bds.getNorth() - bds.getSouth(), 0.0001);
    const pairDist = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
    if (isNew || map.getZoom() < 9 || !within || pairDist > span * 0.75) {
      // Smooth, "qalın" animated frame (owner asked for a heavier transition,
      // no instant jump). Close venue+point → just zoom to the pair.
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.0005) {
        map.setView(a, Math.max(map.getZoom(), 14), { animate: true, duration: 0.45 });
      } else {
        map.fitBounds(L.latLngBounds(a, b).pad(0.25), { animate: true, duration: 0.45, maxZoom: 16 });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.lat, customer?.lng]);

  // 11x: city FOCUS — no point yet, but the typed address names a city →
  // smooth-zoom to it (district level, street labels readable). With a point
  // the pin effect owns the frame.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || customer || !focus) return;
    map.setView([focus.lat, focus.lng], 13, { animate: true, duration: 0.5 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.lat, focus?.lng]);

  return (
    <div className="mt-2">
      {/* Pin glide: Leaflet moves .leaflet-marker-icon via transform — give
          it a transition and the pin slides to the new point instead of
          teleporting (11x "transition daha qalın"). */}
      <style>{`
        .saito-pin { background: transparent !important; border: none !important; }
        .saito-pin-inner { transition: transform 0.35s cubic-bezier(.22,.9,.35,1.1); transform-origin: bottom center; }
        .leaflet-marker-icon.saito-pin { transition: transform 0.4s cubic-bezier(.25,.8,.35,1) !important; }
        .saito-map-hint { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
          pointer-events: none; z-index: 500; }
      `}</style>
      <div className="relative">
        <div
          ref={divRef}
          className={`h-[170px] w-full rounded-2xl overflow-hidden border ${lightMode ? 'border-zinc-200' : 'border-white/10'}`}
        />
        {!customer && (
          <div className="saito-map-hint">
            <span className={`rounded-full px-3 py-1.5 text-[10px] font-black backdrop-blur-md ${lightMode ? 'bg-white/90 text-zinc-800' : 'bg-black/70 text-white'}`}>
              {focus ? `${focus.name} · xəritəyə tıkla — nöqtəni özün qoy` : 'Xəritəyə tıkla — nöqtəni özün qoy'}
            </span>
          </div>
        )}
      </div>
      {/* OSM tile usage policy requires visible attribution */}
      <p className={`mt-1 text-[9px] ${lightMode ? 'text-zinc-400' : 'text-white/25'}`}>
        © OpenStreetMap · mavi = məkan · qırmızı = müştəri (tıkla / sürüşdür)
      </p>
    </div>
  );
}
