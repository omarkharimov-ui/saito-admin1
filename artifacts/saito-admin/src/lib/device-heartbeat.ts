'use client';

// 2026-09-25 (owner, decision): Device health — every terminal page calls
// this once and the app pings POST /api/devices/heartbeat every 30s.
// Server marks the device ONLINE while last_seen_at ≤ 45s (Settings →
// Cihazlar + dashboard terminal card).
import { useEffect } from 'react';
import { apiFetch } from '@/lib/api-fetch';

export function useDeviceHeartbeat(deviceName: string, deviceType: 'pos' | 'kds' | 'bds' | 'expo' | 'admin' | 'other') {
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const beat = async () => {
      if (stopped) return;
      try {
        await apiFetch('/api/devices/heartbeat', {
          method: 'POST',
          body: JSON.stringify({ deviceName, deviceType }),
        });
      } catch {
        /* heartbeat is best-effort — never surface errors to the operator */
      }
    };

    const start = () => {
      if (timer) return;
      beat();
      timer = setInterval(beat, 30_000);
    };
    const stop = () => {
      if (timer) { clearInterval(timer); timer = null; }
    };
    const onVis = () => {
      if (document.hidden) stop();
      else start();
    };

    start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stopped = true;
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [deviceName, deviceType]);
}
