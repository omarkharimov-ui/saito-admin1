'use client';

import { useState, useCallback, useEffect } from 'react';

export interface GeoConfig {
  ssids: string[];
  geofence: { enabled: boolean; lat: number | null; lng: number | null; radius_m: number };
}

export type VerifyResult = { verified: boolean; method: 'wifi' | 'geo' | 'manual' | 'disabled'; detail?: string };

export function useGeoVerification(geoConfig: GeoConfig | null) {
  const [wifiVerified, setWifiVerified] = useState(false);
  const [geoVerified, setGeoVerified] = useState(false);
  const [checking, setChecking] = useState(false);

  // --- Wi-Fi detection (SSID) via Network Information API where available ---
  const checkWifi = useCallback(() => {
    if (!geoConfig || geoConfig.ssids.length === 0) return false;
    const nav = navigator as any;
    const conn = nav?.connection;
    const ssid = conn?.ssid;
    if (ssid) {
      const ok = javaOrArray(geoConfig.ssids).some((s: string) => ssid.toLowerCase().includes(s.toLowerCase()));
      setWifiVerified(ok);
      return ok;
    }
    return false;
  }, [geoConfig]);

  const javaOrArray = (v: any): any[] => (Array.isArray(v) ? v : []);

  // --- GPS geofence check ---
  const checkGeo = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      const cfg = geoConfig?.geofence;
      if (!cfg?.enabled || !cfg.lat || !cfg.lng) return resolve(false);
      if (!('geolocation' in navigator)) return resolve(false);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const d = haversine(cfg.lat!, cfg.lng!, pos.coords.latitude, pos.coords.longitude);
          const ok = d <= (cfg.radius_m || 200);
          setGeoVerified(ok);
          resolve(ok);
        },
        () => resolve(false),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
      );
    });
  }, [geoConfig]);

  const verify = useCallback(async (): Promise<VerifyResult> => {
    setChecking(true);
    try {
      // 1) If no config (restaurant hasn't set anything), allow manual
      if (!geoConfig || (javaOrArray(geoConfig.ssids).length === 0 && !geoConfig.geofence?.enabled)) {
        return { verified: true, method: 'disabled', detail: 'No geo config set' };
      }
      // 2) Wi-Fi match
      const wifi = checkWifi();
      if (wifi) return { verified: true, method: 'wifi', detail: 'Connected to restaurant Wi-Fi' };
      // 3) GPS geofence
      const geo = await checkGeo();
      if (geo) return { verified: true, method: 'geo', detail: 'Inside restaurant geofence' };
      return { verified: false, method: 'manual', detail: 'Not in location' };
    } finally {
      setChecking(false);
    }
  }, [geoConfig, checkWifi, checkGeo]);

  useEffect(() => {
    if (geoConfig) checkWifi();
  }, [geoConfig, checkWifi]);

  return { wifiVerified, geoVerified, checking, verify };
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
