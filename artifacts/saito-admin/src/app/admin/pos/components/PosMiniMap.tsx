'use client';

// ============================================================================
// 2026-10-01 (11w-B, owner: "daha da yaxşı — onlardan daha yaxşı olsun"):
// MINI-MAP — Leaflet + OpenStreetMap tiles (FREE, no API key, no account).
// Shows: the venue (blue), the picked customer point (red) and the active
// zone's delivery radius (blue circle). The operator SEES that "20 Yanvar,
// Xırdalan" is 30 km away — a wrong-district pick becomes visually obvious
// (competitors show exactly this in Toast/Square; we add the zone ring).
//
// Raw Leaflet (no react-leaflet): one map instance per mount, markers in a
// LayerGroup swapped on point change. circleMarker = no icon-asset issues
// with the bundler.
// ============================================================================

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Pt { lat: number; lng: number }

interface PosMiniMapProps {
  venue: Pt;
  customer: Pt;
  /** Active zone max_km — the delivery radius ring (null = no ring). */
  radiusKm: number | null;
  lightMode: boolean;
}

export default function PosMiniMap({ venue, customer, radiusKm, lightMode }: PosMiniMapProps) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  // Create the map ONCE per mount (Leaflet refuses to re-init a container).
  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = L.map(divRef.current, {
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: true,
      dragging: true,
    });
    map.setView([venue.lat, venue.lng], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // The POS panel can re-measure after layout animations — invalidateSize
    // keeps tiles glued to the container.
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(divRef.current);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap markers / ring on every point or radius change.
  useEffect(() => {
    const map = mapRef.current;
    const lg = layerRef.current;
    if (!map || !lg) return;
    lg.clearLayers();
    if (radiusKm != null && radiusKm > 0) {
      L.circle([venue.lat, venue.lng], {
        radius: radiusKm * 1000,
        color: '#2563eb',
        weight: 1.5,
        fillColor: '#3b82f6',
        fillOpacity: 0.07,
      }).addTo(lg);
    }
    L.circleMarker([venue.lat, venue.lng], {
      radius: 6, color: '#2563eb', fillColor: '#2563eb', fillOpacity: 1, weight: 2,
    }).addTo(lg);
    L.circleMarker([customer.lat, customer.lng], {
      radius: 7, color: '#dc2626', fillColor: '#dc2626', fillOpacity: 1, weight: 2,
    }).addTo(lg);
    const a = [venue.lat, venue.lng] as [number, number];
    const b = [customer.lat, customer.lng] as [number, number];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.0005) {
      map.setView(a, 15, { animate: false });
    } else {
      map.fitBounds(L.latLngBounds(a, b).pad(0.2), { animate: false });
    }
  }, [venue.lat, venue.lng, customer.lat, customer.lng, radiusKm]);

  return (
    <div className="mt-2">
      <div
        ref={divRef}
        className={`h-[150px] w-full rounded-2xl overflow-hidden border ${lightMode ? 'border-zinc-200' : 'border-white/10'}`}
      />
      {/* OSM tile usage policy requires visible attribution */}
      <p className={`mt-1 text-[9px] ${lightMode ? 'text-zinc-400' : 'text-white/25'}`}>
        © OpenStreetMap · mavi = məkan · qırmızı = müştəri
      </p>
    </div>
  );
}
