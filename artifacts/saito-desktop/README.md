# Saito Desktop (Electron kiosk) — Faza 1

2026-09-26 · Owner qərarı: **NATIVE APP** (iOS/Android + Mac/Windows — web app deyil).
Bu shell = 4 platformanın 2-şi (macOS/Windows). iOS/Android = Capacitor
(`artifacts/saito-admin/capacitor.config.ts`, `com.saito.pos`).

## Arxitektura

Next.js core (SSR + API routes) **server-də** qalır; Electron onu `SAITO_URL`
ile yükləyir — 1 codebase, 4 platform. Device identity eyni `saito_device_id`
(localStorage — Electron-da persistent; native-də Keychain/KeyStore).

## İşletmə

```bash
# workspace root-dan (electron binary-si ilk install-da endirilir)
pnpm --filter @workspace/saito-desktop dev     # 1280x800, devtools, Escape=çıxış
SAITO_URL=https://<prod-domain> pnpm --filter @workspace/saito-desktop start
SAITO_URL=https://<prod-domain> pnpm --filter @workspace/saito-desktop kiosk
```

- `--dev` (dev skripti): 1280x800, devtools, **Escape = çıxış**
- `--kiosk` (prod): fullscreen, menyu/resize YOX, navigasiya lock (yalnız
  `SAITO_URL` origin), external link-lər OS browser-da, **watchdog**:
  renderer crash/hang → auto-reload (kiosk boş ekran qalmır)

## Kiosk provisioning (kod deyil — quraşdırma)

- **macOS**: Screen Saver off + Energy Saver "Prevent sleep" + optional
  `caffeinate`; auto-boot → Startup Items.
- **Windows**: power plan "Never sleep" + `Startup` shortcut (kiosk arg).
- (Android Lock Task / iOS Guided Access = mobil tərəfdə, Capacitor NOTES-da.)

## Faza 2 (deferred — distribution qərarından sonra)

- electron-updater (auto-update) + code signing (Apple Developer / Windows cert)
- App store/distribution kanalı qərarı
- `window.open` print path (EscPosAdapters) — desktop-da hazır işləyir;
  iOS native print = LAN print-agent path (Faza 1-də prod print = agent).
