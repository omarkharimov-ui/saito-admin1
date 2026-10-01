// ============================================================================
// 2026-10-01 (11y, owner: "axtarış hər dəfə düzgün və sürətli işləsin,
// gecikmə və ya qəfil işləməmə olmasın"): PERSISTENT GEOCODE CACHE.
//
// Nominatim is the reliability bottleneck: 1 req/s policy, shared-IP 429
// bursts, 300ms–2s per call. A restaurant re-enters the SAME addresses every
// day (regulars). This file-backed cache makes every repeat resolve in ~0ms
// with ZERO external calls — the search can no longer "qəfil işləməmək".
//
// Design:
//   - in-memory Map (hot path) + JSON file (survives restarts)
//   - 30-day TTL (streets do not move), 3000-entry cap (FIFO)
//   - debounced write (800ms) — never blocks the request path
//   - keys are venue-scoped (km/points are relative to the venue)
// ============================================================================

import { promises as fs } from 'fs';
import path from 'path';

const FILE = path.join(process.cwd(), '.cache', 'geocode-cache.json');
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 3000;

export interface GeoCacheEntry {
  lat: number;
  lng: number;
  display: string;
  precision: 'address' | 'area';
  // 11z: the road polyline ([lng,lat]×≤120) for the mini-map route line — a
  // repeat address (regular) must show the route WITHOUT re-calling OSRM.
  routeGeometry?: [number, number][] | null;
  t: number;
}

const MEMO = new Map<string, GeoCacheEntry>();
let loaded = false;
let loadPromise: Promise<void> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function ensureLoaded(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const raw = await fs.readFile(FILE, 'utf8');
      const obj = JSON.parse(raw) as Record<string, GeoCacheEntry>;
      const now = Date.now();
      for (const [k, v] of Object.entries(obj)) {
        if (v && Number.isFinite(v.lat) && Number.isFinite(v.lng) && now - v.t < TTL_MS) {
          MEMO.set(k, v);
        }
      }
    } catch { /* first run / corrupt file — start empty */ }
    loaded = true;
    loadPromise = null;
  })();
  return loadPromise;
}

export async function geoCacheGet(key: string): Promise<GeoCacheEntry | null> {
  await ensureLoaded();
  const e = MEMO.get(key);
  if (!e) return null;
  if (Date.now() - e.t > TTL_MS) {
    MEMO.delete(key);
    return null;
  }
  return e;
}

export async function geoCacheSet(key: string, e: Omit<GeoCacheEntry, 't'>): Promise<void> {
  await ensureLoaded();
  MEMO.set(key, { ...e, t: Date.now() });
  while (MEMO.size > MAX_ENTRIES) {
    const first = MEMO.keys().next().value;
    if (first == null) break;
    MEMO.delete(first);
  }
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdir(path.dirname(FILE), { recursive: true })
      .then(() => fs.writeFile(FILE, JSON.stringify(Object.fromEntries(MEMO))))
      .catch(() => { /* disk errors must never break a request */ });
  }, 800);
}
