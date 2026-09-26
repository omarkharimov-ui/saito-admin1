import type { CapacitorConfig } from '@capacitor/cli';

// ============================================================================
// 2026-09-26 — Faza 1: Saito POS native wrap (owner qərarı: NATIVE APP,
// iOS/Android + Mac/Windows — web app DEYİL).
//
// Arxitektura: Next.js core (SSR + API routes) SERVER-də qalır; native shell
// (Capacitor / Electron) onu `server.url` ilə yükləyir. 1 codebase, 4 platform:
//   iOS / Android → Capacitor (bu konfiq)
//   macOS / Windows → Electron (artifacts/saito-desktop)
//
// SAITO_SERVER_URL:
//   - dev  (bu maşında):  http://localhost:3000
//   - prod (restoran):    https://<saito domain> — build zamanı env ilə verilir
//
// `webDir` server-url mode-da istifadə olunmur, amma schema tələb edir.
//
// Device identity: `saito_device_id` Faza 0-dan bəri localStorage-da; Faza 1
// wrap-da @capacitor/preferences ilə Keychain (iOS) / KeyStore (Android)-a
// re-home olunur — EYNİ ID (src/lib/native-bridge.ts).
// ============================================================================

const SERVER_URL = process.env.SAITO_SERVER_URL || 'http://localhost:3000';

const config: CapacitorConfig = {
  appId: 'com.saito.pos',
  appName: 'Saito POS',
  webDir: 'dist',
  server: {
    url: SERVER_URL,
    androidScheme: 'https',
    // dev localhost (cleartext) üçün; prod https olduğunda təhlükəsiz
    cleartext: true,
  },
  ios: {
    // POS = kiosk: status bar content-inset hesabına UI altına sıxılmasın
    contentInset: 'always',
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    StatusBar: {
      // POS default dark tema → light status-bar text
      style: 'LIGHT',
    },
  },
};

export default config;
