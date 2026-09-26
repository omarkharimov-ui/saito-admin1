# Saito Native Wrap — Faza 1 NOTES (2026-09-26)

Owner qərarı: **NATIVE APP** — iOS/Android (Capacitor) + Mac/Windows (Electron,
`artifacts/saito-desktop`). Next.js core = motor; server-də qalır, native
shell `server.url` ilə yükləyir (SSR + API routes webview-da işləyir).

## Build / run

```bash
# from artifacts/saito-admin
pnpm cap sync                 # plugin-ləri native project-lərə yaz
pnpm cap run android          # dev (Android Studio/adb bağlı cihaz)
pnpm cap run ios              # dev (Xcode)
# prod URL build: SAITO_SERVER_URL=https://<domain> pnpm cap sync
```

## Faza 1-də qurulan

| Item | Implementation |
|---|---|
| device_id → Keychain/KeyStore | `src/lib/native-bridge.ts` — `ensureNativeDeviceId()`: native-də `@capacitor/preferences` (iOS Keychain / Android KeyStore) **SSOT**, localStorage web fallback. Web→native keçiddə EYNİ ID migrate olunur (device_heartbeats qeydiyyatı canlı qalır). |
| Native model/OS meta | `collectDeviceMeta()` → `Device.getInfo()` (osName/osVersion/platform) — heartbeat `meta.os` + yeni `meta.platform`. |
| Keep-awake (wake lock) | `native-bridge.ts` — native: `@capgo/capacitor-keep-awake` (iOS sleep lock + Android FLAG_KEEP_SCREEN_ON); web/Electron/Android-Chrome: Web Wake Lock API. `useDeviceHeartbeat` mount-da `keepAwakeOn()`, unmount-da `off()` → bütün stansiya səhifələri (POS/KDS/BDS/Expo/Admin) shift boyunca ekranda qalır. |
| Status bar | `@capacitor/status-bar` (config: LIGHT style — POS dark tema). |
| iOS kiosk (provisioning) | **Guided Access**: Settings → Accessibility → Guided Access ON → app açılanda Home 3× (və ya Side Button 3×) → kiosk lock. Code deyil. |
| Android kiosk (provisioning) | **Lock Task** (Device Owner / MDM): `adb shell dpm set-active-admin` + `dpm set-lock-task-package com.saito.pos` (kiosk device üçün); sadə tablet üçün Settings → Digital Wellbeing → Focus mode (app-ə yalnız Saito). Code deyil. |

## Bilinən Faza 2-lər (deferred)

- `prompt()`×2 (POS target-table / merge prompt, `admin/pos/page.tsx`) → native modal. (4 platformada JS prompt işləyir — blocker deyil.)
- iOS print `window.open` path (EscPosAdapters) → prod print = LAN print-agent (v1); iOS native print Faza 2.
- Auto-update (mobile: App Store/Play; desktop: electron-updater) + code signing.
- Offline-first (Q8) — wrap-dan ASILİ DƏYİL (server-url mode); növbəti böyük wave.

## Faza 0 → Faza 1 əlaqə

Faza 0 (`20260925020000`, `device-identity.ts`, `device-heartbeat.tsx`)
qeydiyyat/unpair/remote-reload infrastrukturunu qurub; Faza 1 ona toxunmadan
yalnız **storage re-home + native meta + keep-awake** əlavə etdi — ID,
heartbeat, unpair davranışı dəyişməz.
