'use client';

// 2026-09-25 — Device health + identity PHASE 0 (native app istiqaməti).
//
// Hər stansiya səhifəsi (POS/KDS/BDS/Expo/Admin) çağırır:
//   useDeviceHeartbeat('POS Terminal', 'pos');
//
// Hər 30s: POST /api/devices { deviceName, deviceType, deviceId, meta }
//   - deviceId: stabil UUID (localStorage; wrap fazada Keychain/KeyStore —
//     ID dəyişmir, yalnız storage)
//   - meta: OS/browser, ekran ölçüsü, battery (level+charging), app version
//
// UNPAIR: server blocked=true etdikdə heartbeat 403 {code:'DEVICE_BLOCKED'}
//   qaytarır → module-level portal lockout (bütün UI üstündə) + beat dayanır.
//   (Toast-ların etdiyi kimi — səhifələrə toxunulmuyor.)
//
// REMOTE COMMAND: Supabase Realtime `device_commands` (filter: öz device_id)
//   - 'reload' → window.location.reload() (Admin "Yenilə" düyməsi)

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { apiFetch } from '@/lib/api-fetch';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { getDeviceId, collectDeviceMeta } from '@/lib/device-identity';
import { ensureNativeDeviceId, keepAwakeOn, keepAwakeOff } from '@/lib/native-bridge';
import { MonitorOff, Lock } from '@/components/ui/saito-icons';

const HEARTBEAT_INTERVAL_MS = 30_000;

export const DEVICE_TYPES = ['pos', 'kds', 'bds', 'expo', 'admin', 'other'] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

async function beat(deviceName: string, deviceType: DeviceType): Promise<boolean> {
  try {
    const deviceId = getDeviceId();
    const meta = await collectDeviceMeta();
    let res: Response;
    try {
      res = await apiFetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceName, deviceType, deviceId, meta }),
      });
    } catch {
      return false; // network error — bloklama deyil, növbəti beat
    }
    if (res.status === 403) {
      try {
        const j = await res.json();
        if (j?.code === 'DEVICE_BLOCKED') return true;
      } catch { /* different 403 (CSRF) — ignore */ }
    }
    return false;
  } catch {
    return false;
  }
}

// ── Module-level lockout overlay (toast pattern: imperative root) ──────────
let overlayEl: HTMLDivElement | null = null;
let overlayRoot: Root | null = null;

function BlockedDeviceScreen({ deviceId, name }: { deviceId: string; name: string }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 999999,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 16, background: 'rgba(0,0,0,0.94)', color: '#fff',
        textAlign: 'center', padding: 32,
      }}
    >
      <div style={{ width: 72, height: 72, borderRadius: 24, background: 'rgba(244,63,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Lock size={36} style={{ color: '#fb7185' }} />
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em' }}>Bu cihaz bloklanıb</div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', maxWidth: 420, lineHeight: 1.6 }}>
        Cihaz administrator tərəfindən unpair olunub. Davam etmək üçün adminə müraciət edin
        (Settings → Cihazlar → "Bərpa et").
      </div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>
        {name} · {deviceId}
      </div>
      <div style={{ position: 'absolute', bottom: 24, opacity: 0.3 }}>
        <MonitorOff size={18} />
      </div>
    </div>
  );
}

function showLockout(deviceId: string, name: string) {
  if (typeof document === 'undefined') return;
  try {
    if (!overlayEl) {
      overlayEl = document.createElement('div');
      overlayEl.id = 'saito-device-lockout-root';
      document.body.appendChild(overlayEl);
      overlayRoot = createRoot(overlayEl);
    }
    const root = overlayRoot;
    if (root) root.render(<BlockedDeviceScreen deviceId={deviceId} name={name} />);
  } catch { /* overlay optional */ }
}

function hideLockout() {
  try {
    if (overlayRoot) overlayRoot.render(null);
  } catch { /* noop */ }
}

export function useDeviceHeartbeat(deviceName: string, deviceType: DeviceType = 'other'): { blocked: boolean } {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let stopped = false;
    let blockedSeen = false;

    // 2026-09-26 (Faza 1): native wrap — device_id Keychain/KeyStore-a sync
    // (eyni ID, localStorage-dan migrasiya) + keep-awake (shift boyunca ekran
    // yuxuya getməsin). Web-də hər ikisi no-op / best-effort.
    void ensureNativeDeviceId();
    void keepAwakeOn();

    const runBeat = async () => {
      if (stopped) return;
      const b = await beat(deviceName, deviceType);
      if (b && !stopped && !blockedSeen) {
        blockedSeen = true;
        setBlocked(true);
        showLockout(getDeviceId(), deviceName);
      }
    };

    runBeat();
    const iv = window.setInterval(() => {
      if (blockedSeen) { window.clearInterval(iv); return; }
      runBeat();
    }, HEARTBEAT_INTERVAL_MS);

    // ── Remote command listener ('reload' — Admin "Yenilə") ───────────────
    let channel: ReturnType<typeof createRealtimeChannel> | null = null;
    try {
      const deviceId = getDeviceId();
      if (deviceId) {
        channel = createRealtimeChannel('device_cmd');
        channel.on(
          'postgres_changes' as any,
          { event: 'INSERT', schema: 'public', table: 'device_commands', filter: `device_id=eq.${deviceId}` },
          (payload: any) => {
            if (payload?.new?.command === 'reload') window.location.reload();
          },
        );
        channel.subscribe();
      }
    } catch { /* realtime optional — heartbeat əsas kanal */ }

    return () => {
      stopped = true;
      window.clearInterval(iv);
      if (channel) { try { removeRealtimeChannel(channel); } catch { /* already removed */ } }
      hideLockout();
    };
    // name/type sabitdir (hər səhifə öz labelı ilə çağırır)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceName, deviceType]);

  return { blocked };
}
