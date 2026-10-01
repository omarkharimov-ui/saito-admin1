// ============================================================================
// 2026-10-01 (11w, owner: "daha da yaxşı — free API"): SHARED OSRM HELPERS.
// OSRM (router.project-osrm.org) = FREE, NO API KEY, no account. Used by:
//   - /api/delivery-eta   (11v) — single venue→customer driving time
//   - /api/geocode        (11w-C) — fee-distance = REAL road km (not haversine)
//   - /api/courier-tour   (11w-E) — all-pairs matrix for multi-stop tour
// Public demo fair-use: a single POS generates a handful of calls/day.
// For heavy prod use: self-host OSRM (docker one-liner) — swap the base URL.
// ============================================================================

const OSRM = 'https://router.project-osrm.org';

/** Single driving route (venue → customer). null when OSRM has no route. */
export async function osrmRoute(
  vLng: number, vLat: number, cLng: number, cLat: number, timeoutMs = 6000,
): Promise<{ km: number; minutes: number; geometry: [number, number][] | null } | null> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // 11z (owner: "aradaki route görünsün, Saito-dan oraya məsafəni map
    // göstərməlidir"): overview=simplified + geometries=geojson → the actual
    // road polyline for the POS mini-map. CAUTION: the OSRM v1 default
    // geometry encoding is polyline5 (a STRING, not GeoJSON) — without
    // geometries=geojson the map would receive a string and draw nothing
    // (caught by the first curl test: routed=true, 0 points). Thinned
    // server-side to ≤ 120 points (a 200 km route can be 1000+ points).
    const res = await fetch(
      `${OSRM}/route/v1/driving/${vLng},${vLat};${cLng},${cLat}?overview=simplified&geometries=geojson&alternatives=false`,
      { signal: ctrl.signal, headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const d: any = await res.json();
    const r0 = d?.routes?.[0];
    if (r0 && r0.distance > 0 && r0.duration > 0) {
      const coords: [number, number][] = Array.isArray(r0.geometry?.coordinates) ? r0.geometry.coordinates : [];
      let geometry: [number, number][] | null = null;
      if (coords.length >= 2) {
        geometry = coords.length <= 120
          ? coords
          : coords.filter((_, i) => i % Math.ceil(coords.length / 120) === 0 || i === coords.length - 1);
      }
      return {
        km: Math.round((r0.distance / 1000) * 10) / 10,
        minutes: Math.max(1, Math.ceil(r0.duration / 60)),
        geometry,
      };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(to);
  }
}

export interface TourMatrix {
  /** meters — dist[i][j] from point i to point j (i=0 is the venue). */
  dist: number[][];
  /** seconds — same layout. */
  dur: number[][];
}

/**
 * All-pairs driving table (ONE OSRM call) for points[0]=venue + stops.
 * Max 13 points (demo limit is far above; 12 stops is the practical cap).
 */
export async function osrmTable(points: { lat: number; lng: number }[], timeoutMs = 9000): Promise<TourMatrix | null> {
  if (points.length < 2) return null;
  const coords = points.map(p => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // annotations=distance,duration — the bare /table returns ONLY durations;
    // without this the matrix has no distances (11w E2E catch).
    const res = await fetch(`${OSRM}/table/v1/driving/${coords}?annotations=distance,duration`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const d: any = await res.json();
    if (d?.code !== 'Ok' || !Array.isArray(d.distances) || !Array.isArray(d.durations)) return null;
    return { dist: d.distances, dur: d.durations };
  } catch {
    return null;
  } finally {
    clearTimeout(to);
  }
}

/**
 * Nearest-neighbor stop order from the venue (index 0). Deterministic,
 * O(n²) — perfect for ≤12 stops (TSP-optimal needs a solver; NN is what
 * drivers actually follow).
 */
export function nearestNeighborOrder(dist: number[][]): number[] {
  const n = dist.length;
  const used = new Set<number>([0]);
  const order: number[] = [0];
  let cur = 0;
  for (let k = 1; k < n; k++) {
    let best = -1;
    let bestD = Infinity;
    for (let j = 1; j < n; j++) {
      if (used.has(j)) continue;
      const d = dist[cur]?.[j];
      if (d == null || !Number.isFinite(d)) continue;
      if (d < bestD) { bestD = d; best = j; }
    }
    if (best === -1) break;
    used.add(best);
    order.push(best);
    cur = best;
  }
  return order;
}
