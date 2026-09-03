'use client';

import React, { useState, useEffect } from 'react';
import { Save, Loader2, Wifi, MapPin, Plus, X, AlertTriangle } from 'lucide-react';
import { toast } from '@/lib/toast';
import { labelCls, inputCls, saveButtonCls } from './_shared';

interface GeoConfig {
  ssids: string[];
  geofence: { enabled: boolean; lat: string; lng: string; radius_m: number };
}

const LocationTab = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ssids, setSsids] = useState<string[]>([]);
  const [ssidInput, setSsidInput] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [radius, setRadius] = useState(200);

  useEffect(() => {
    let mounted = true;
    fetch('/api/staff/geo-config')
      .then((r) => r.ok ? r.json() : {} as GeoConfig)
      .then((data: GeoConfig) => {
        if (!mounted) return;
        setSsids(data.ssids || []);
        setEnabled(data.geofence?.enabled ?? false);
        setLat(data.geofence?.lat != null ? String(data.geofence.lat) : '');
        setLng(data.geofence?.lng != null ? String(data.geofence.lng) : '');
        setRadius(data.geofence?.radius_m ?? 200);
        setLoading(false);
      })
      .catch(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const addSsid = () => {
    const v = ssidInput.trim();
    if (!v) return;
    if (ssids.some((s) => s.toLowerCase() === v.toLowerCase())) {
      setSsidInput('');
      return;
    }
    setSsids((prev) => [...prev, v]);
    setSsidInput('');
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/geo', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ssids,
          geofence: {
            enabled,
            lat: lat ? Number(lat) : null,
            lng: lng ? Number(lng) : null,
            radius_m: radius,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) toast.error(data.error || 'Xəta', { id: 'action-toast' });
      else toast.success('Yerləşmə ayarları saxlandı', { id: 'action-toast', duration: 3000 });
    } catch {
      toast.error('Xəta baş verdi', { id: 'action-toast' });
    } finally {
      setSaving(false);
    }
  };

  const useCurrentLocation = () => {
    if (!('geolocation' in navigator)) {
      toast.error('Brauzer lokasiyanı dəstəkləmir', { id: 'action-toast' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setEnabled(true);
        toast.success('Cari lokasiya alındı', { id: 'action-toast', duration: 2500 });
      },
      () => toast.error('Lokasiya alına bilmədi', { id: 'action-toast' }),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-gold animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] rounded-3xl p-6 space-y-6">
        {/* WiFi */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-2xl"><Wifi size={20} /></div>
            <div>
              <p className="text-sm font-bold text-white">Restoran Wi-Fi SSID-ləri</p>
              <p className="text-[11px] text-[var(--theme-text-secondary)] mt-0.5">
                Staff bu şəbəkəyə qoşulanda işə giriş edə bilər
              </p>
            </div>
          </div>

          <div className="flex gap-2 mb-3">
            <input
              className={inputCls}
              placeholder="Məs: Saito_Guest"
              value={ssidInput}
              onChange={(e) => setSsidInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSsid(); } }}
            />
            <button onClick={addSsid} className="shrink-0 w-12 rounded-2xl bg-[var(--theme-surface-muted)] border border-[var(--theme-border)] flex items-center justify-center hover:border-emerald-400/40 transition-all">
              <Plus size={18} />
            </button>
          </div>

          {ssids.length === 0 ? (
            <p className="text-[11px] text-[var(--theme-text-muted)]">Hələ SSID əlavə olunmayıb</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {ssids.map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-300 text-xs font-semibold border border-emerald-500/20">
                  {s}
                  <button onClick={() => setSsids((prev) => prev.filter((x) => x !== s))} className="text-emerald-400/60 hover:text-emerald-300">
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Geofence */}
        <div className="pt-5 border-t border-[var(--theme-border)]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-2xl"><MapPin size={20} /></div>
              <div>
                <p className="text-sm font-bold text-white">GPS Geofence</p>
                <p className="text-[11px] text-[var(--theme-text-secondary)] mt-0.5">
                  Staff bu əraziyə daxil olanda işə giriş edə bilər
                </p>
              </div>
            </div>
            <button
              onClick={() => setEnabled((v) => !v)}
              className={`w-12 h-7 rounded-full transition-colors relative ${enabled ? 'bg-emerald-500' : 'bg-white/10'}`}
            >
              <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all ${enabled ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>

          <div className={enabled ? '' : 'opacity-40 pointer-events-none'}>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className={labelCls}>Enlik (Lat)</label>
                <input className={inputCls} placeholder="40.409264" value={lat} onChange={(e) => setLat(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Uzunluq (Lng)</label>
                <input className={inputCls} placeholder="49.867092" value={lng} onChange={(e) => setLng(e.target.value)} />
              </div>
            </div>
            <div className="mb-4">
              <label className={labelCls}>Radius (metr)</label>
              <input
                type="range" min={50} max={1000} step={50} value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
              <div className="text-right text-[11px] text-[var(--theme-text-secondary)] font-bold">{radius}m</div>
            </div>
            <button
              onClick={useCurrentLocation}
              className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1.5"
            >
              <MapPin size={13} /> Cari lokasiyamdan istifadə et
            </button>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/15">
          <p className="text-[11px] text-amber-400/80 flex items-center gap-1.5">
            <AlertTriangle size={13} />
            Hər iki yoxlama sönük olarsa, staff-dan PIN ilə əl ilə işə giriş istənilir.
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className={`${saveButtonCls} bg-gold text-black`}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Yerləşməni Saxla
        </button>
      </div>
    </div>
  );
};

export default LocationTab;
