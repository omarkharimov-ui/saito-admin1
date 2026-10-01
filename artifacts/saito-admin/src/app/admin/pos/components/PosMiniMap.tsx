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
  // 11z (owner: "aradaki route görünsün — Saito-dan oraya məsafənin mapini
  // göstərməlidir, birbaşa yeri yox"): the ACTUAL road polyline venue→customer
  // ([lng,lat]×N from /api/geocode's OSRM geometry). The map draws the route
  // itself (green line) + a KM pill at its midpoint — the operator sees the
  // journey, not just two dots. null → a dashed straight line (OSRM down).
  route?: [number, number][] | null;
  km?: number | null;
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

// 11y (owner: "Xəritə Apple Maps üslubunda olsun") — Apple-style basemap,
// 100% keyless. CARTO light/dark was the first choice but CARTO now serves
// "API KEY REQUIRED" WATERMARK tiles to keyless clients (E2E catch) — a
// key would break the "pulsuz, heç nə çıxmasın" rule. Instead: standard
// OSM tiles + a CSS filter that mutes them to the Apple-Maps look:
// light = desaturated pale map, dark = inverted cool-dark. Tile usage is
// standard OSM (attribution kept in the footer line).
// NO `{r}` retina variant: tile.openstreetmap.org has no @2x tiles — with
// detectRetina Leaflet would request …/12/2048/1334@2x.png → 404 → blank
// map (E2E round-2 catch). 256px source, CSS filter does the styling.
const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export default function PosMiniMap({ venue, customer, radiusKm, lightMode, onPickPoint, focus, route, km }: PosMiniMapProps) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const ringRef = useRef<L.Circle | null>(null);
  const venueMarkerRef = useRef<L.Marker | null>(null);
  const pinRef = useRef<L.Marker | null>(null);
  // 11z: the route line (venue→customer) + its KM pill.
  const routeRef = useRef<L.Polyline | null>(null);
  const routeLabelRef = useRef<L.Marker | null>(null);
  const pickRef = useRef<((p: Pt) => void) | undefined>(onPickPoint);
  pickRef.current = onPickPoint; // always-fresh callback (map handlers persist)
  // 11y (owner: "xəritəyə toxunduqda avtomatik uzaqlaşma olmasın"): a MANUAL
  // tap/drag must NOT move the frame — the pin glides to the finger, the view
  // stays exactly where the operator put it.
  const manualPickRef = useRef(false);

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
    // 11y r3: the tile layer is created ONCE here (no theme swap!) — the
    // round-2 runtime removeLayer/addTileLayer collapsed the map pane to
    // 0×0 in light mode. Theming = a CSS class on the container div below
    // (filter on .leaflet-tile), zero Leaflet operations on theme change.
    tileRef.current = L.tileLayer(OSM_TILES, { maxZoom: 19 }).addTo(map);
    venueMarkerRef.current = L.marker([venue.lat, venue.lng], { icon: VENUE_ICON, interactive: false }).addTo(map);
    // Tap = place the customer point (works on touch + mouse; dragend on the
    // map itself must NOT place — that's panning, not pointing).
    map.on('click', (e: L.LeafletMouseEvent) => {
      manualPickRef.current = true;
      pickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    mapRef.current = map;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(divRef.current);
    // The panel can (re)mount mid framer-motion sheet animation — the
    // container may be 0-sized at L.map() time; the RO heals size CHANGES,
    // but if the map inits at 0 and the container settles without a RO
    // event it stays blank. One late invalidateSize as insurance.
    const heal = window.setTimeout(() => { try { map.invalidateSize(); } catch { /* gone */ } }, 500);
    return () => {
      window.clearTimeout(heal);
      ro.disconnect();
      // Drop layer refs FIRST: HMR can tear this map down mid-frame — an
      // effect running against a removed map's SVG renderer throws
      // "reading 'baseVal'" (11x E2E one-off crash).
      tileRef.current = null;
      ringRef.current = null;
      venueMarkerRef.current = null;
      pinRef.current = null;
      routeRef.current = null;
      routeLabelRef.current = null;
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
  // Re-fit the frame ONLY for EXTERNAL changes (a suggest pick, a new
  // address) — a MANUAL tap/drag never moves the view (11y: "xəritəyə
  // toxunduqda avtomatik uzaqlaşma olmasın").
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!customer) { pinRef.current?.remove(); pinRef.current = null; return; }
    const manual = manualPickRef.current;
    manualPickRef.current = false;
    const isNew = !pinRef.current;
    if (!pinRef.current) {
      const m = L.marker([customer.lat, customer.lng], { icon: PIN_ICON, draggable: true, autoPan: true }).addTo(map);
      m.on('dragend', () => {
        manualPickRef.current = true;
        const ll = m.getLatLng();
        pickRef.current?.({ lat: ll.lat, lng: ll.lng });
      });
      pinRef.current = m;
    } else {
      // CSS transition animates this setLatLng (see saito-pin CSS below).
      pinRef.current.setLatLng([customer.lat, customer.lng]);
    }
    if (manual) return; // operator's hand on the map — the view stays put
    const b: [number, number] = [customer.lat, customer.lng];
    const a: [number, number] = [venue.lat, venue.lng];
    const within = map.getBounds().pad(-0.1).contains(b);
    // 11x E2E fix: a degenerate frame (world/country zoom, zoom<9) must
    // always snap back to delivery scale; also re-fit when the point pair is
    // far vs the frame.
    const bds = map.getBounds();
    const span = Math.max(bds.getNorth() - bds.getSouth(), 0.0001);
    const pairDist = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
    if (isNew || map.getZoom() < 9 || !within || pairDist > span * 0.75) {
      // Smooth, "qalın" animated frame (owner asked for a heavier transition,
      // no instant jump). Close venue+point → just zoom to the pair.
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.0005) {
        map.setView(a, Math.max(map.getZoom(), 14), { animate: true, duration: 0.45 });
      } else {
        // 11z: maxZoom 14 (was 16) — owner: "dibinə girməsin". The frame is a
        // ROUTE OVERVIEW: both endpoints + the line in view, not a street-level
        // dive (the operator zooms by hand when they need to place a pin).
        map.fitBounds(L.latLngBounds(a, b).pad(0.3), { animate: true, duration: 0.45, maxZoom: 14 });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.lat, customer?.lng]);

  // 11z: ROUTE LINE — the actual road venue→customer (OSRM geometry) or a
  // dashed straight fallback (OSRM down / no geometry). Green, Apple-Maps-
  // style; a KM pill sits at the line's midpoint so the map itself carries
  // the distance (owner: "Saito-dan oraya məsafəni map göstərməlidir").
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (routeLabelRef.current) { try { map.removeLayer(routeLabelRef.current); } catch { /* HMR */ } routeLabelRef.current = null; }
    if (routeRef.current) { try { map.removeLayer(routeRef.current); } catch { /* HMR */ } routeRef.current = null; }
    if (!customer) return;
    const pts: [number, number][] = (route && route.length >= 2)
      ? route.map(([lng, lat]) => [lat, lng] as [number, number])
      : [[venue.lat, venue.lng], [customer.lat, customer.lng]];
    routeRef.current = L.polyline(pts, {
      color: '#22c55e',
      weight: 4,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
      dashArray: route && route.length >= 2 ? undefined : '6 8',
      interactive: false,
    }).addTo(map);
    if (km != null && Number.isFinite(km)) {
      const mid = pts[Math.floor(pts.length / 2)];
      routeLabelRef.current = L.marker(mid, {
        icon: L.divIcon({
          className: 'saito-route-km',
          iconSize: [64, 20],
          iconAnchor: [32, 10],
          html: `<div class="saito-route-km-pill">${km} km</div>`,
        }),
        interactive: false,
      }).addTo(map);
    }
  }, [route, customer?.lat, customer?.lng, km, venue.lat, venue.lng]);

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
    // 11y (owner: "açılış zamanı xəritə dropdown-u örtməsin"): the map lives
    // in its OWN stacking context (relative z-0) — Leaflet's internal panes
    // carry z-index 200–700, which used to paint OVER the suggest dropdown
    // (z-50) in the shared context. Now the dropdown always floats above.
    // 11y r3: the theme (Apple-style tile filter) + border live on THIS
    // wrapper — NOT on the Leaflet div below. The Leaflet div's className
    // must be a CONSTANT across renders: React only rewrites a className
    // when its computed value changes, and a rewrite would WIPE the
    // `leaflet-container` class Leaflet adds at mount (round-3 bug: theme
    // re-render dropped it → Tailwind img{max-width:100%} shrank every tile
    // to width 0 → blank map). Constant template = React leaves the
    // attribute alone after first paint, Leaflet's classes survive.
    <div className={`relative z-0 mt-2 rounded-2xl border ${lightMode ? 'saito-map-light border-zinc-200' : 'saito-map-dark border-white/10'}`}>
      {/* Pin glide: Leaflet moves .leaflet-marker-icon via transform — give
          it a transition and the pin slides to the new point instead of
          teleporting (11x "transition daha qalın"). */}
      <style>{`
        .saito-pin { background: transparent !important; border: none !important; }
        .saito-pin-inner { transition: transform 0.35s cubic-bezier(.22,.9,.35,1.1); transform-origin: bottom center; }
        .leaflet-marker-icon.saito-pin { transition: transform 0.4s cubic-bezier(.25,.8,.35,1) !important; }
        .saito-map-hint { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
          pointer-events: none; z-index: 500; }
        /* 11z: the route's KM pill (Leaflet divIcon marker). */
        .saito-route-km { background: transparent !important; border: none !important; }
        .saito-route-km-pill {
          background: rgba(255,255,255,0.95); color: #111827; border: 1px solid rgba(0,0,0,0.12);
          border-radius: 999px; padding: 1px 8px; font-size: 10px; font-weight: 800;
          text-align: center; white-space: nowrap; box-shadow: 0 1px 4px rgba(0,0,0,0.25);
        }
        /* 11y (owner: "Xəritə Apple Maps üslubunda olsun") — Apple-Maps look
           via CSS filter on the OSM tiles: light = desaturated pale map,
           dark = inverted cool-dark. 100% keyless (CARTO now watermarks
           keyless clients). The class lives on the CONTAINER div (React
           state) — theme change = pure class swap, no Leaflet ops. */
        .saito-map-light .leaflet-tile { filter: saturate(0.55) contrast(0.98) brightness(1.02); }
        .saito-map-dark  .leaflet-tile { filter: invert(1) hue-rotate(180deg) saturate(0.35) contrast(0.9) brightness(0.85); }
        /* belt-and-braces: even if leaflet-container ever drops off again,
           tiles must never collapse to 0 width (Tailwind preflight
           img max-width:100% + a 0-width tile container = blank map). */
        .saito-leaflet .leaflet-tile { max-width: none !important; }
       `}</style>
      <div className="relative">
        {/* CONSTANT className (no lightMode!) — see the comment above. */}
        <div
          ref={divRef}
          className="saito-leaflet leaflet-container h-[170px] w-full rounded-2xl overflow-hidden"
        />
        {!customer && (
          <div className="saito-map-hint">
            <span className={`rounded-full px-3 py-1.5 text-[10px] font-black backdrop-blur-md ${lightMode ? 'bg-white/90 text-zinc-800' : 'bg-black/70 text-white'}`}>
              {focus ? `${focus.name} · xəritəyə tıkla — nöqtəni özün qoy` : 'Xəritəyə tıkla — nöqtəni özün qoy'}
            </span>
          </div>
        )}
      </div>
      {/* tile usage policy requires visible attribution (OSM) */}
      <p className={`mt-1 text-[9px] ${lightMode ? 'text-zinc-400' : 'text-white/25'}`}>
        © OpenStreetMap contributors · mavi = məkan · qırmızı = müştəri (tıkla / sürüşdür)
      </p>
    </div>
  );
}
