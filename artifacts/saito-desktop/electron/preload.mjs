// 2026-09-26 — Faza 1: minimal preload (sandbox:true — contextBridge only).
// Renderer (Next.js core) desktop-da olduğunu + shell version-unu görə bilir:
//   window.SAITO_DESKTOP = { version: '0.1.0' }
// Device meta (Faza 0/1): UA parse Electron-də "Chrome"-u deyir; native
// info Capacitor-only (Electron = desktop — meta os "Windows/Mac OS X").
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('SAITO_DESKTOP', {
  get version() {
    return ipcRenderer.invoke('saito-desktop:version');
  },
  isDesktop: true,
});
