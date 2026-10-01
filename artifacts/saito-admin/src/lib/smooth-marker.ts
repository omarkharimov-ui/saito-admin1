// ============================================================================
// 2026-10-02 (12c): SMOOTH MARKER ENGINE — the "Wolt effect" layer.
//
// GPS pings arrive every ~15 s (courier app) via Supabase Realtime. Rendering
// the marker at raw ping positions makes it JUMP (A → B teleport). This
// engine keeps a small ring buffer of timestamped pings and, on every
// animation frame, computes the position the courier "should be at NOW":
//
//   • between two known pings   → linear interpolation (constant-velocity
//     glide, A → · → · → B)
//   • after the last ping       → brief coast at the last velocity (up to
//     COAST_MS), then STOP at the last known point — we never fabricate a
//     route beyond the last real fix
//   • bearing                   → heading of the current segment (for the
//     arrow icon rotation)
//
// Timestamps: always the SERVER clock (courier_location.t = DB NOW()). The
// browser clock drifts; the server clock is consistent across the courier
// phone, the admin screen and the customer's /track page.
// ============================================================================

export interface Ping {
  lat: number;
  lng: number;
  /** ms epoch, SERVER time (courier_location.t) */
  t: number;
}

const COAST_MS = 8_000; // keep gliding ≤ 8 s after the last ping, then hold
const MAX_PINGS = 12;

/** ms epoch in the SERVER's time frame ≈ Date.now() (both are wall clock;
 *  the drift between the customer's phone clock and the DB is << the ping
 *  cadence, so lerp stays smooth even with Date.now()). */
function nowMs(): number {
  return Date.now();
}

/** Great-circle distance in meters (haversine). */
export function distMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Initial bearing (degrees, 0 = north) from A to B. */
export function bearingDeg(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const y = Math.sin(toRad(bLng - aLng)) * Math.cos(toRad(bLat));
  const x =
    Math.cos(toRad(aLat)) * Math.sin(toRad(bLat)) -
    Math.sin(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.cos(toRad(bLng - aLng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export interface SmoothState {
  lat: number;
  lng: number;
  /** degrees 0..360, or null when there is no movement segment */
  bearing: number | null;
  /** true while we are between/coasting past real pings (marker should animate) */
  moving: boolean;
}

export class SmoothTracker {
  private pings: Ping[] = [];

  /** Feed a (possibly stale-ordered) ping. Idempotent per timestamp. */
  feed(lat: number, lng: number, tServerMs: number): void {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(tServerMs)) return;
    const last = this.pings[this.pings.length - 1];
    if (last && tServerMs <= last.t) return; // out-of-order / duplicate
    this.pings.push({ lat, lng, t: tServerMs });
    if (this.pings.length > MAX_PINGS) this.pings.shift();
  }

  get pingCount(): number {
    return this.pings.length;
  }

  /** Last REAL ping (for the "N dəq əvvəl" freshness label). */
  lastPing(): Ping | null {
    return this.pings[this.pings.length - 1] || null;
  }

  /** Where the courier is AT `now` (ms). The heart of the smooth effect. */
  positionAt(now: number = nowMs()): SmoothState {
    const p = this.pings;
    const n = p.length;
    if (n === 0) return { lat: 0, lng: 0, bearing: null, moving: false };
    if (n === 1) {
      // Single fix: show it, but stop coasting after COAST_MS from it.
      const st = now - p[0].t <= COAST_MS;
      return { lat: p[0].lat, lng: p[0].lng, bearing: null, moving: st };
    }
    const last = p[n - 1];
    const prev = p[n - 2];
    const segMs = last.t - prev.t;
    // Where within (or just past) the last segment are we?
    const dt = now - prev.t;
    if (segMs > 0 && dt <= segMs) {
      // interpolation between prev → last
      const f = dt / segMs;
      return {
        lat: prev.lat + (last.lat - prev.lat) * f,
        lng: prev.lng + (last.lng - prev.lng) * f,
        bearing: bearingDeg(prev.lat, prev.lng, last.lat, last.lng),
        moving: true,
      };
    }
    if (segMs > 0 && now - last.t <= COAST_MS) {
      // coast: continue at the segment's velocity, capped by COAST_MS
      const f = Math.min((dt / segMs) - 1, COAST_MS / segMs);
      return {
        lat: last.lat + (last.lat - prev.lat) * f,
        lng: last.lng + (last.lng - prev.lng) * f,
        bearing: bearingDeg(prev.lat, prev.lng, last.lat, last.lng),
        moving: true,
      };
    }
    // stale: hold at the last real fix
    return { lat: last.lat, lng: last.lng, bearing: null, moving: false };
  }
}

/**
 * Drive a callback on requestAnimationFrame (~display rate, throttled to
 * ≤ 30 fps to save battery on phones). Returns a stop function.
 */
export function rafLoop(cb: (state: SmoothState) => void, tracker: SmoothTracker, fps = 30): () => void {
  let raf = 0;
  let last = 0;
  const interval = 1000 / fps;
  const step = (ts: number) => {
    raf = requestAnimationFrame(step);
    if (ts - last < interval) return;
    last = ts;
    cb(tracker.positionAt());
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/**
 * Camera follow for a Leaflet map: pan (no zoom, no animation) to the
 * interpolated position every tick while `enabled()` is true. Manual pan
 * by the user temporarily suspends follow (re-enabled on next map moveend
 * + 4 s).
 */
export function cameraFollow(
  map: { panTo: (ll: { lat: number; lng: number }, o: { animate: boolean }) => void; on: (ev: string, f: () => void) => void; off: (ev: string, f: () => void) => void },
  tracker: SmoothTracker,
  enabled: () => boolean,
): () => void {
  let suspended = false;
  const suspend = () => {
    suspended = true;
  };
  const resumeSoon = () => {
    window.setTimeout(() => {
      suspended = false;
    }, 4000);
  };
  map.on('dragstart', suspend);
  map.on('zoomstart', suspend);
  map.on('moveend', resumeSoon);
  const stop = rafLoop((st) => {
    if (!enabled() || suspended || !st.moving && tracker.pingCount === 0) return;
    map.panTo({ lat: st.lat, lng: st.lng }, { animate: false });
  }, tracker, 15); // follow is coarse — 15 fps is plenty for panning
  return () => {
    stop();
    map.off('dragstart', suspend);
    map.off('zoomstart', suspend);
    map.off('moveend', resumeSoon);
  };
}
