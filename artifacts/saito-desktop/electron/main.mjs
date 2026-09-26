// ============================================================================
// 2026-09-26 — Faza 1: Saito POS desktop kiosk (Electron, macOS/Windows).
//
// Arxitektura (owner qərarı: NATIVE APP — web app DEYİL):
//   Next.js core (SSR + API routes) = SAITO_URL (server); bu Electron shell
//   onu kiosk window-da yükləyir. 1 codebase, 4 platform:
//     iOS/Android → Capacitor (artifacts/saito-admin/capacitor.config.ts)
//     Mac/Windows → bu shell (artifacts/saito-desktop)
//
// Kiosk davranışı (prod, `--kiosk`):
//   - fullscreen + bərabər sərhəd + menyu/devtools/zoom YOX
//   - external navigasiya blok (yalnız SAITO_URL origin)
//   - watchdog: renderer unresponsive/gone → auto-reload
//   - exit shortcut YOX (fiziki kiosk; dev-də Escape)
//
// Dev (`--dev`): 1280x800 window, devtools, Escape = çıxış, SAITO_URL
// default http://localhost:3000.
//
// Qeyd: auto-update (electron-updater) + code signing = Faza 2
// (distribution qərarı gözləyir) — Faza 1 = wrap + kiosk + watchdog.
// ============================================================================

import { app, BrowserWindow, Menu, shell, ipcMain } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEV = process.argv.includes('--dev');
const KIOSK = process.argv.includes('--kiosk');
const SAITO_URL = process.env.SAITO_URL || 'http://localhost:3000';

let win = null;

function allowOrigin(url) {
  try {
    const u = new URL(url);
    const target = new URL(SAITO_URL);
    return u.origin === target.origin;
  } catch {
    return false;
  }
}

function createWindow() {
  const isMac = process.platform === 'darwin';
  win = new BrowserWindow({
    width: DEV ? 1280 : 1600,
    height: DEV ? 800 : 900,
    fullscreen: KIOSK,
    frame: !KIOSK,
    autoHideMenuBar: true,
    backgroundColor: '#0a0a0b', // POS dark tema — flash qarşısı
    title: 'Saito POS',
    webPreferences: {
      preload: join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (KIOSK) {
    // Full kiosk: menyu yox, resize yox, fullscreen qalx
    win.setMenuBarVisibility(false);
    win.setResizable(false);
  }
  Menu.setApplicationMenu(null);
  if (DEV) win.webContents.openDevTools({ mode: 'detach' });

  // ── Navigasiya lock: yalnız SAITO_URL origin ──────────────────────────────
  win.webContents.on('will-navigate', (e, url) => {
    if (!allowOrigin(url)) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    // POS core-da window.open = print iframe path (PrintService) — allow same
    // origin; external link-lər OS browser-da açılır (kiosk qırılmaz).
    if (allowOrigin(url)) return { action: 'allow' };
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    // POS: camera/mic/geolocation lazımdır? Yox — bütün permission-lər deny
    // (kiosk = minimum attack surface). Print = iframe (permission yox).
    callback(false);
  });

  // ── Watchdog: renderer qırsa → auto-reload (kiosk heç vaxt "boş ekran") ──
  win.webContents.on('render-process-gone', (_e, details) => {
    if (details.reason === 'clean') return;
    try { win?.reload(); } catch { /* window gone */ }
  });
  let unresponsiveTimer = null;
  win.webContents.on('unresponsive', () => {
    // 10s grace — belki GC/compile; sonra reload
    if (!unresponsiveTimer) {
      unresponsiveTimer = setTimeout(() => {
        unresponsiveTimer = null;
        try { win?.reload(); } catch { /* ignore */ }
      }, 10_000);
    }
  });
  win.webContents.on('responsive', () => {
    if (unresponsiveTimer) { clearTimeout(unresponsiveTimer); unresponsiveTimer = null; }
  });

  // ── Dev exit: Escape (prod/kiosk-da YOX — fiziki kiosk) ───────────────────
  if (DEV) {
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape') {
        event.preventDefault();
        win?.close();
      }
    });
  }

  win.loadURL(SAITO_URL);
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  ipcMain.handle('saito-desktop:version', () => app.getVersion());
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// macOS: bütün window-lar bağlananda app qalır (std); digər platformalarda
// kiosk = tək window, closed → quit.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
