'use client';

// 2026-09-26 — Faza 1: native wrap bridge (owner qərarı: NATIVE APP).
//
// Web (Chrome kiosk/dev) və native (Capacitor iOS/Android, Electron desktop)
// ortaq codebase-də işləyir. Bu modul = platform fərqinin YEGANƏ nöqtəsi:
//
//   1. device_id storage — Faza 0: localStorage (`saito_device_id`).
//      Faza 1: native platformda @capacitor/preferences ilə Keychain (iOS) /
//      KeyStore (Android). **EYNİ ID** — localStorage-dakı ID ilk native
//      açılışda migrate olunur (web→native keçid cihazı "yeni" etməz,
//      device_heartbeats-da qeydiyyat/unpair/first_seen canlı qalır).
//
//   2. Device info — native platformda `Device.getInfo()` (model, OS versiyası)
//      heartbeat meta-sında görünür (Faza 0 jurnal: "native model/OS info wrap
//      zamanı buraya qoşulacaq").
//
//   3. Keep-awake — native: CapGo KeepAwake (iOS/Android screen sleep lock);
//      web/Electron/Android-Chrome: Web Wake Lock API fallback.
//
// SSR-safe: bütün funksiyalar server-də no-op / boş qaytarır.

import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { KeepAwake } from '@capgo/capacitor-keep-awake';

const DEVICE_ID_KEY = 'saito_device_id';
const ID_RE = /^[a-z0-9_-]{8,64}$/i;

/** SSR-safe native platform check (web browser/Electron = false). */
export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Native platformda device_id-i Preferences (Keychain/KeyStore) ilə
 * sync-ləşdirir. localStorage = web fallback kimi saxlanılır (synchronous
 * getDeviceId() çağrıları üçün) — native-da iki yerdə eyni ID olur.
 *
 * Prioritet: Preferences (native SSOT) → localStorage (migrasiya mənbəyi) →
 * yeni UUID (sən demə device heç yerdə qeydiyyatda deyil).
 *
 * Bir dəfə/beat çağırmaq təhlükəsizdir (idempotent).
 */
let nativeIdEnsured = false;
export async function ensureNativeDeviceId(): Promise<void> {
  if (typeof window === 'undefined' || nativeIdEnsured) return;
  if (!isNative()) return;
  nativeIdEnsured = true; // bir race window-ı bağla — idempotent anyway
  try {
    const { value: stored } = await Preferences.get({ key: DEVICE_ID_KEY });
    const lsId = (() => { try { return window.localStorage.getItem(DEVICE_ID_KEY); } catch { return null; } })();

    let id = stored && ID_RE.test(stored) ? stored : null;
    if (!id && lsId && ID_RE.test(lsId)) {
      id = lsId; // web→native migrasiya: eyni ID native storage-a keçir
    }
    if (!id) {
      try { id = crypto.randomUUID(); } catch { id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`; }
    }

    // Hər iki storage-ı eyni ID-ə birləşdir (Preferences = native SSOT).
    await Preferences.set({ key: DEVICE_ID_KEY, value: id });
    try { window.localStorage.setItem(DEVICE_ID_KEY, id); } catch { /* webview private mode */ }
  } catch {
    // Storage problemi cihazı "yeni" etmir — heartbeat localStorage ID ilə davam edir.
  }
}

/** Native device info (model/OS) — heartbeat meta-sı üçün. Web-də boş. */
export async function getNativeDeviceInfo(): Promise<{ os?: string; platform?: string; model?: string } | null> {
  try {
    if (!isNative()) return null;
    const info = await Device.getInfo();
    if (!info) return null;
    const os = info.osVersion ? `${info.operatingSystem} ${info.osVersion}` : String(info.operatingSystem);
    return { os, platform: info.platform, model: info.model || undefined };
  } catch {
    return null;
  }
}

// ── Keep-awake (shift müddətində ekrana yuxuya getməsin) ────────────────────

/**
 * POS terminalı shift boyunca açıq qalmalıdır. Native: CapGo KeepAwake
 * (iOS screen sleep lock + Android FLAG_KEEP_SCREEN_ON); web/Electron/
 * Android-Chrome: Web Wake Lock API. Hər iki yol SSR-safe + best-effort
 * (mərhum wake lock = terminal istifadədən kənarda, kritik deyil).
 */
let awakeAcquired = false;

async function webWakeLock(): Promise<void> {
  try {
    const nav = navigator as any;
    if (typeof nav.wakeLock?.request !== 'function') return;
    const sentinel = await nav.wakeLock.request('screen');
    sentinel.addEventListener?.('release', () => {
      // Uygulanmayan re-acquire: visibilitychange-də caller yenidən çağırır.
    });
  } catch { /* not supported / rejected — ignore */ }
}

export async function keepAwakeOn(): Promise<void> {
  if (typeof window === 'undefined' || awakeAcquired) return;
  try {
    if (isNative()) {
      await KeepAwake.keepAwake();
      awakeAcquired = true;
      return;
    }
  } catch { /* plugin yox/error — web fallback */ }
  await webWakeLock();
  awakeAcquired = true;
}

export async function keepAwakeOff(): Promise<void> {
  if (!awakeAcquired) return;
  try {
    if (isNative()) await KeepAwake.allowSleep();
  } catch { /* ignore */ }
  awakeAcquired = false;
}
