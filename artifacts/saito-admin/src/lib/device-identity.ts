'use client';

// 2026-09-25 — Device identity PHASE 0 (native app istiqaməti).
//
// Stabil per-browser-profile `device_id`: bir dəfə random yaradılır, saxlanılır,
// heç vaxt dəyişmir. Wrap fazada YALNIZ storage dəyişir (localStorage →
// Keychain/ANDROID_ID plugin) — ID-nin özü eyni qalır, DB-dəki qeydiyyat
// canlı qalır (unpair / binding / first_seen heç yerə itmir).
//
// Meta: hər heartbeat-də canlı toplanır — OS/browser (UA parse), ekran ölçüsü,
// battery (navigator.getBattery — Chrome/Electron dəstəyi; "tableti
// zaryadkadan çıxıblar?" sualı), app version.
//
// NOTE (wrap faza): macOS/Windows desktop-da Electron `navigator.getBattery()`
// də işləyir; native model/OS info wrap zamanı buraya qoşulacaq (eyni meta
// forması).

const DEVICE_ID_KEY = 'saito_device_id';

export interface DeviceBattery {
  level: number; // 0..1
  charging: boolean;
}

export interface DeviceMeta {
  os?: string;
  browser?: string;
  screen?: string;
  battery?: DeviceBattery | null;
  app_version?: string;
  /** 2026-09-26 (Faza 1): native platform name (ios/android) — web-də yox. */
  platform?: string;
}

let cachedId: string | null = null;

function genUuid(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fall through */ }
  return `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Stable device id — SSR-safe (serverdə boş string qaytarır). */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  if (cachedId) return cachedId;
  try {
    let id = window.localStorage.getItem(DEVICE_ID_KEY);
    if (!id || !/^[a-z0-9_-]{8,64}$/i.test(id)) {
      id = genUuid();
      window.localStorage.setItem(DEVICE_ID_KEY, id);
    }
    cachedId = id;
    return id;
  } catch {
    // localStorage blocked (private mode etc.) — session-only fallback;
    // cihaz "yeni" görünər ama sistem qırılmır.
    const id = genUuid();
    cachedId = id;
    return id;
  }
}

// ── UA parse (keçid library yoxdur — sadə, kifayət qədər dəqiq) ──────────────

export function parseUserAgent(ua: string): { os: string; browser: string } {
  let os = 'Bilinmir';
  if (/iPhone/i.test(ua)) os = 'iOS (iPhone)';
  else if (/iPad/i.test(ua) || (/Android/i.test(ua) && /MaxTouchPoints=/i.test(ua) && /; \d+/.test(ua.slice(0, 40)))) os = 'iOS (iPad)';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Windows NT 10/i.test(ua)) os = 'Windows 10/11';
  else if (/Windows NT/i.test(ua)) os = 'Windows';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Bilinmir';
  const chromeM = ua.match(/Chrome\/(\d+)/);
  const ffM = ua.match(/Firefox\/(\d+)/);
  const safariM = ua.match(/Version\/(\d+).*Safari/);
  if (/Edg\//.test(ua)) browser = `Edge ${ua.match(/Edg\/(\d+)/)?.[1] || ''}`.trim();
  else if (chromeM) browser = `Chrome ${chromeM[1]}`;
  else if (ffM) browser = `Firefox ${ffM[1]}`;
  else if (safariM && /Safari/.test(ua)) browser = `Safari ${safariM[1]}`;
  return { os, browser };
}

/**
 * Canlı meta toplayır. Battery üçün QISA cache: oxunandan 30s sonra təzə
 * oxu (beat interval = 30s — təbii yenilənmə ritmi).
 */
let lastBatteryAt = 0;
let lastBattery: DeviceBattery | null = null;

export async function collectDeviceMeta(): Promise<DeviceMeta> {
  const meta: DeviceMeta = {};
  try {
    const { os, browser } = parseUserAgent(navigator.userAgent);
    meta.os = os;
    meta.browser = browser;
  } catch { /* SSR / unusual */ }
  // 2026-09-26 (Faza 1): native platformda real model/OS (Capacitor Device) —
  // UA parse webview UA-sı üçün kifayət deyil (Faza 0 jurnal: "native
  // model/OS info wrap zamanı buraya qoşulacaq"). Web-də null → heç nə.
  try {
    const { getNativeDeviceInfo } = await import('@/lib/native-bridge');
    const nativeInfo = await getNativeDeviceInfo();
    if (nativeInfo) {
      if (nativeInfo.os) meta.os = nativeInfo.model ? `${nativeInfo.os} · ${nativeInfo.model}` : nativeInfo.os;
      meta.platform = nativeInfo.platform;
    }
  } catch { /* native-bridge optional — UA fallback qalır */ }
  try {
    if (typeof window !== 'undefined' && window.screen) {
      meta.screen = `${window.screen.width}x${window.screen.height}`;
    }
  } catch { /* ignore */ }
  try {
    const nav = navigator as any;
    if (Date.now() - lastBatteryAt > 30_000 || lastBattery === null) {
      if (typeof nav.getBattery === 'function') {
        const b = await nav.getBattery();
        lastBattery = { level: Math.round((b?.level ?? 0) * 100) / 100, charging: !!b?.charging };
        lastBatteryAt = Date.now();
      } else {
        lastBattery = null;
        lastBatteryAt = Date.now();
      }
    }
    meta.battery = lastBattery;
  } catch { meta.battery = null; }
  meta.app_version = APP_VERSION;
  return meta;
}

// App version — build sabiti. Wrap fazada bundle version ilə əvəz olunacaq.
export const APP_VERSION = '0.1.0';
