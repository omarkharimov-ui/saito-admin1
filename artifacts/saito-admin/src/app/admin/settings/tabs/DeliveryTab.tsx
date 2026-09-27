'use client';

/**
 * Settings → Çatdırılma (2026-09-23, owner): Wolt-like delivery management.
 * 2026-09-24 (Phase 1): + Ümumi kart (master switch, sifariş qəbulu,
 *   delivery_mode, qlobal fallback-lər) və zona kartlarında km aralığı
 *   (min_km/max_km), zona minimum sifarişi, ETA aralığı, prioritet.
 *
 * The delivery address (courier pickup point) and the zones (fee, free
 * threshold, ETA, km range) are managed here; the POS zone picker + fee
 * engine read the same table live (is_active-filtered). Distance-based zone
 * resolution (new calculate_delivery_fee overload) uses min_km ≤ d < max_km,
 * priority ASC — lower priority number wins.
 */
import { useState, useEffect, useCallback } from 'react';
import { MapPin, Plus, Trash2, Save, Loader2, Route, Settings2, CloudRain, Clock, Zap } from '@/components/ui/saito-icons';
import { useTheme } from '@/lib/theme/ThemeContext';
import { apiFetch } from '@/lib/api-fetch';
import toast from 'react-hot-toast';

interface Zone {
  id?: string;
  name: string;
  fee: number;
  free_delivery_threshold: number;
  estimated_minutes: number;
  is_active: boolean;
  min_km: number;
  max_km: number | null;      // null = limitsiz
  min_order: number | null;   // null = qlobal fallback
  priority: number;           // kiçik = üstün
  est_minutes_min: number | null;
  est_minutes_max: number | null;
}

interface General {
  delivery_fee: number;
  free_delivery_threshold: number;
  min_order_amount: number;
  delivery_enabled: boolean;
  delivery_accepting_orders: boolean;
  /** 2026-09-26 (owner, Task 50): Wolt-style SURGE factor (0.5..10). */
  delivery_fee_multiplier: number;
  // 2026-09-26 (owner, Task 55): SMART SURGE — Wolt-class dynamic pricing.
  // Weather surge (Open-Meteo precipitation) + peak-hour windows (venue TZ).
  delivery_weather_surge_enabled: boolean;
  delivery_weather_surge_multiplier: number;
  delivery_peak_surge_enabled: boolean;
  delivery_peak_surge_multiplier: number;
  delivery_peak_start_hour: number;
  delivery_peak_end_hour: number;
  delivery_peak2_start_hour: number;
  delivery_peak2_end_hour: number;
}

const DEFAULT_GENERAL: General = {
  delivery_fee: 2,
  free_delivery_threshold: 50,
  min_order_amount: 15,
  delivery_enabled: true,
  delivery_accepting_orders: true,
  delivery_fee_multiplier: 1,
  delivery_weather_surge_enabled: true,
  delivery_weather_surge_multiplier: 1.5,
  delivery_peak_surge_enabled: false,
  delivery_peak_surge_multiplier: 1.25,
  delivery_peak_start_hour: 12,
  delivery_peak_end_hour: 14,
  delivery_peak2_start_hour: 18,
  delivery_peak2_end_hour: 22,
};

interface DeliveryData {
  location: { id: string; name: string; address: string | null; phone: string | null; delivery_mode?: string } | null;
  zones: Zone[];
  general?: General;
}

const toInput = (v: number | null | undefined): string =>
  v === null || v === undefined ? '' : String(v);
const fromInput = (v: string): number | null =>
  v.trim() === '' ? null : Number(v);
// Task 55: peak-window hour options — start 00:00–23:00, end 01:00–24:00
// (end is exclusive; 24 = yarım gecə).
const HOURS_START = Array.from({ length: 24 }, (_, i) => i);
const HOURS_END = Array.from({ length: 24 }, (_, i) => i + 1);
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

function fillZone(z: any): Zone {
  return {
    id: z.id,
    name: z.name ?? '',
    fee: Number(z.fee) || 0,
    free_delivery_threshold: Number(z.free_delivery_threshold) || 0,
    estimated_minutes: Number(z.estimated_minutes) || 30,
    is_active: z.is_active !== false,
    min_km: z.min_km === null || z.min_km === undefined ? 0 : Number(z.min_km),
    max_km: z.max_km === null || z.max_km === undefined ? null : Number(z.max_km),
    min_order: z.min_order === null || z.min_order === undefined ? null : Number(z.min_order),
    priority: z.priority === null || z.priority === undefined ? 100 : Number(z.priority),
    est_minutes_min: z.est_minutes_min === null || z.est_minutes_min === undefined ? null : Number(z.est_minutes_min),
    est_minutes_max: z.est_minutes_max === null || z.est_minutes_max === undefined ? null : Number(z.est_minutes_max),
  };
}

export default function DeliveryTab() {
  const { lightMode } = useTheme();
  const [data, setData] = useState<DeliveryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [zones, setZones] = useState<Zone[]>([]);
  const [general, setGeneral] = useState<General>(DEFAULT_GENERAL);
  const [deliveryMode, setDeliveryMode] = useState<string>('own');
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/settings/delivery');
      if (res.ok) {
        const d: DeliveryData = await res.json();
        setData(d);
        setAddress(d.location?.address || '');
        setPhone(d.location?.phone || '');
        setZones((d.zones || []).map(fillZone));
        setGeneral({ ...DEFAULT_GENERAL, ...(d.general || {}) });
        setDeliveryMode(d.location?.delivery_mode || 'own');
        setDirty(false);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const patchZone = (i: number, patch: Partial<Zone>) => {
    setZones(prev => prev.map((z, idx) => (idx === i ? { ...z, ...patch } : z)));
    setDirty(true);
  };
  const addZone = () => {
    setZones(prev => [...prev, {
      name: '', fee: 2, free_delivery_threshold: 50, estimated_minutes: 30, is_active: true,
      min_km: 0, max_km: null, min_order: null, priority: 100,
      est_minutes_min: null, est_minutes_max: null,
    }]);
    setDirty(true);
  };
  const removeZone = (i: number) => {
    setZones(prev => prev.filter((_, idx) => idx !== i));
    setDirty(true);
  };

  const save = async () => {
    const named = zones.every(z => z.name.trim());
    if (!named) { toast.error('Hər zona ad tələb edir'); return; }
    setSaving(true);
    try {
      const res = await apiFetch('/api/settings/delivery', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          phone,
          delivery_mode: deliveryMode,
          general,
          zones: zones.map(z => ({
            id: z.id || undefined,
            name: z.name.trim(),
            fee: Number(z.fee) || 0,
            free_delivery_threshold: Number(z.free_delivery_threshold) || 0,
            // keep the legacy single-ETA column in sync for back-compat
            // (old RPC + POS chips read estimated_minutes)
            estimated_minutes: z.est_minutes_max ?? z.est_minutes_min ?? z.estimated_minutes ?? 30,
            is_active: z.is_active !== false,
            min_km: Number(z.min_km) || 0,
            max_km: z.max_km,
            min_order: z.min_order,
            priority: Number(z.priority) || 100,
            est_minutes_min: z.est_minutes_min,
            est_minutes_max: z.est_minutes_max,
          })),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success('Çatdırılma ayarları saxlanıldı');
        setDirty(false);
        await load();
      } else {
        toast.error(d.error || 'Xəta');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Xəta');
    }
    setSaving(false);
  };

  const card = `p-5 rounded-2xl border space-y-4 ${lightMode ? 'bg-white border-zinc-200' : 'bg-white/[0.03] border-white/[0.08]'}`;
  const label = `block text-[10px] font-black uppercase tracking-widest mb-1.5 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`;
  const input = `w-full rounded-xl px-3 py-2.5 text-sm font-bold outline-none border transition-colors ${lightMode ? 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white focus:border-white/40'}`;
  const toggleBtn = (on: boolean) =>
    `w-10 h-[22px] rounded-full p-[3px] transition-colors flex-shrink-0 ${
      on
        ? 'bg-emerald-500'
        : (lightMode ? 'bg-zinc-300' : 'bg-white/15')
    }`;
  const toggleKnob = (on: boolean) =>
    `block w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[18px]' : ''}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={22} className="animate-spin opacity-40" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {/* General */}
      <div className={card}>
        <div className="flex items-center gap-2">
          <Settings2 size={16} className={lightMode ? 'text-zinc-400' : 'text-white/40'} />
          <h3 className={`text-sm font-black ${lightMode ? 'text-zinc-900' : 'text-white'}`}>Ümumi</h3>
        </div>
        <p className={`text-xs ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>
          Zonalarda boş qoyulan dəyərlər (min sifariş, haqq limiti) bu qlobal fallback-lərdən istifadə olunur.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => { setGeneral(g => ({ ...g, delivery_enabled: !g.delivery_enabled })); setDirty(true); }}
            className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
              lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/[0.03] border-white/[0.08]'
            }`}
          >
            <span className={toggleBtn(general.delivery_enabled)}>
              <span className={toggleKnob(general.delivery_enabled)} />
            </span>
            <span>
              <span className={`block text-xs font-black ${lightMode ? 'text-zinc-900' : 'text-white'}`}>Çatdırılma fəaliyyətdədir</span>
              <span className={`block text-[11px] ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>
                Söndürüldükdə POS-da zona siyahısı gizlənir
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => { setGeneral(g => ({ ...g, delivery_accepting_orders: !g.delivery_accepting_orders })); setDirty(true); }}
            className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
              lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/[0.03] border-white/[0.08]'
            }`}
          >
            <span className={toggleBtn(general.delivery_accepting_orders)}>
              <span className={toggleKnob(general.delivery_accepting_orders)} />
            </span>
            <span>
              <span className={`block text-xs font-black ${lightMode ? 'text-zinc-900' : 'text-white'}`}>Yeni sifarişləri qəbul et</span>
              <span className={`block text-[11px] ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>
                Təkrar yandırana qədər çatdırılma sifarişi qəbul edilmir
              </span>
            </span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={label}>Çatdırılmanı kim yerinə yetirir?</label>
            <select
              className={input}
              value={deliveryMode}
              onChange={e => { setDeliveryMode(e.target.value); setDirty(true); }}
            >
              <option value="own">Öz kuryerimiz</option>
              <option value="third_party">Xarici çatdırılma</option>
              <option value="both">Hər ikisi</option>
            </select>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label className={label}>Haqq (₼)</label>
              <input
                className={input}
                type="number" step="0.5" min="0"
                value={toInput(general.delivery_fee)}
                onChange={e => { setGeneral(g => ({ ...g, delivery_fee: fromInput(e.target.value) ?? 0 })); setDirty(true); }}
              />
            </div>
            <div>
              <label className={label}>Pulsuz limiti (₼)</label>
              <input
                className={input}
                type="number" step="5" min="0"
                value={toInput(general.free_delivery_threshold)}
                onChange={e => { setGeneral(g => ({ ...g, free_delivery_threshold: fromInput(e.target.value) ?? 0 })); setDirty(true); }}
              />
            </div>
            <div>
              <label className={label}>Min sifariş (₼)</label>
              <input
                className={input}
                type="number" step="1" min="0"
                value={toInput(general.min_order_amount)}
                onChange={e => { setGeneral(g => ({ ...g, min_order_amount: fromInput(e.target.value) ?? 0 })); setDirty(true); }}
              />
            </div>
            {/* 2026-09-26 (owner, Task 50): Wolt-style surge/dynamic factor.
                1.0 = normal; 1.5 = yağış/talebat → haqq ×1.5. Feels dynamic
                without any external pricing engine. */}
            <div>
              <label className={label}>Surge × (0.5–10)</label>
              <input
                className={input}
                type="number" step="0.1" min="0.5" max="10"
                value={toInput(general.delivery_fee_multiplier)}
                onChange={e => {
                  const v = fromInput(e.target.value);
                  const clamped = v === null ? 1 : Math.min(10, Math.max(0.5, v));
                  setGeneral(g => ({ ...g, delivery_fee_multiplier: clamped })); setDirty(true);
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2026-09-26 (owner, Task 55): SMART SURGE — Wolt-class dynamic
          pricing. Weather (Open-Meteo rain at the venue) + peak windows
          (venue timezone). The engine applies MAX(weather, peak) — never
          stacked; everything operator-configured, nothing hardcoded. */}
      <div className={card}>
        <div className="flex items-center gap-2">
          <Zap size={16} className={lightMode ? 'text-amber-500' : 'text-amber-400'} />
          <h3 className={`text-sm font-black ${lightMode ? 'text-zinc-900' : 'text-white'}`}>Smart Sürx (Wolt)</h3>
          <span className={`ml-auto text-[10px] font-black uppercase tracking-widest ${
            general.delivery_weather_surge_enabled || general.delivery_peak_surge_enabled
              ? 'text-emerald-500' : (lightMode ? 'text-zinc-400' : 'text-white/30')
          }`}>
            {general.delivery_weather_surge_enabled || general.delivery_peak_surge_enabled ? 'Fəal' : 'Söndürülüb'}
          </span>
        </div>
        <p className={`text-xs ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>
          Haqq dinamik dəyişir: yağış yağanda və ya seçdiyin pik saatlarda sürx avtomatik işləyir
          və POS-da qızılı parlayıcı hint kimi görünür. Hər ikisi eyni anda işləsə, yalnız
          YÜKSEK sürx tətbiq olunur — üst-üstə yığılma yoxdur (Wolt mexanizmi).
        </p>

        {/* Weather surge */}
        <div className={`rounded-2xl border p-4 space-y-3 ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/[0.02] border-white/[0.08]'}`}>
          <button
            type="button"
            onClick={() => { setGeneral(g => ({ ...g, delivery_weather_surge_enabled: !g.delivery_weather_surge_enabled })); setDirty(true); }}
            className={`flex items-center gap-3 w-full rounded-xl border px-3.5 py-3 text-left transition-colors ${
              lightMode ? 'bg-white border-zinc-200' : 'bg-white/[0.03] border-white/[0.08]'
            }`}
          >
            <span className={toggleBtn(general.delivery_weather_surge_enabled)}>
              <span className={toggleKnob(general.delivery_weather_surge_enabled)} />
            </span>
            <CloudRain size={16} className={general.delivery_weather_surge_enabled ? 'text-sky-500' : (lightMode ? 'text-zinc-400' : 'text-white/30')} />
            <span className="flex-1">
              <span className={`block text-xs font-black ${lightMode ? 'text-zinc-900' : 'text-white'}`}>Hava sürxi (yağış)</span>
              <span className={`block text-[11px] ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>
                Restoranın yerinə yağış düşəndə (live hava datası) haqq avtomatik artır
              </span>
            </span>
          </button>
          {general.delivery_weather_surge_enabled && (
            <div className="w-32">
              <label className={label}>Sürx × (1–3)</label>
              <input
                className={input}
                type="number" step="0.05" min="1" max="3"
                value={toInput(general.delivery_weather_surge_multiplier)}
                onChange={e => {
                  const v = fromInput(e.target.value);
                  setGeneral(g => ({ ...g, delivery_weather_surge_multiplier: v === null ? 1 : Math.min(3, Math.max(1, v)) }));
                  setDirty(true);
                }}
              />
            </div>
          )}
        </div>

        {/* Peak-hour surge */}
        <div className={`rounded-2xl border p-4 space-y-3 ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/[0.02] border-white/[0.08]'}`}>
          <button
            type="button"
            onClick={() => { setGeneral(g => ({ ...g, delivery_peak_surge_enabled: !g.delivery_peak_surge_enabled })); setDirty(true); }}
            className={`flex items-center gap-3 w-full rounded-xl border px-3.5 py-3 text-left transition-colors ${
              lightMode ? 'bg-white border-zinc-200' : 'bg-white/[0.03] border-white/[0.08]'
            }`}
          >
            <span className={toggleBtn(general.delivery_peak_surge_enabled)}>
              <span className={toggleKnob(general.delivery_peak_surge_enabled)} />
            </span>
            <Clock size={16} className={general.delivery_peak_surge_enabled ? 'text-amber-500' : (lightMode ? 'text-zinc-400' : 'text-white/30')} />
            <span className="flex-1">
              <span className={`block text-xs font-black ${lightMode ? 'text-zinc-900' : 'text-white'}`}>Pik saat sürxi</span>
              <span className={`block text-[11px] ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>
                Dəyişən saat pəncirələrində (məs. yemək vaxtı) haqq avtomatik artır
              </span>
            </span>
          </button>
          {general.delivery_peak_surge_enabled && (
            <div className="space-y-3">
              <div className="w-32">
                <label className={label}>Sürx × (1–3)</label>
                <input
                  className={input}
                  type="number" step="0.05" min="1" max="3"
                  value={toInput(general.delivery_peak_surge_multiplier)}
                  onChange={e => {
                    const v = fromInput(e.target.value);
                    setGeneral(g => ({ ...g, delivery_peak_surge_multiplier: v === null ? 1 : Math.min(3, Math.max(1, v)) }));
                    setDirty(true);
                  }}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={label}>Pik pəncərəsi 1</label>
                  <div className="flex items-center gap-2">
                    <select
                      className={input}
                      value={general.delivery_peak_start_hour}
                      onChange={e => { setGeneral(g => ({ ...g, delivery_peak_start_hour: Number(e.target.value) })); setDirty(true); }}
                    >
                      {HOURS_START.map(h => <option key={h} value={h}>{hh(h)}</option>)}
                    </select>
                    <span className={`text-xs font-black ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>–</span>
                    <select
                      className={input}
                      value={general.delivery_peak_end_hour}
                      onChange={e => { setGeneral(g => ({ ...g, delivery_peak_end_hour: Number(e.target.value) })); setDirty(true); }}
                    >
                      {HOURS_END.map(h => <option key={h} value={h}>{hh(h)}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className={label}>Pik pəncərəsi 2</label>
                  <div className="flex items-center gap-2">
                    <select
                      className={input}
                      value={general.delivery_peak2_start_hour}
                      onChange={e => { setGeneral(g => ({ ...g, delivery_peak2_start_hour: Number(e.target.value) })); setDirty(true); }}
                    >
                      {HOURS_START.map(h => <option key={h} value={h}>{hh(h)}</option>)}
                    </select>
                    <span className={`text-xs font-black ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>–</span>
                    <select
                      className={input}
                      value={general.delivery_peak2_end_hour}
                      onChange={e => { setGeneral(g => ({ ...g, delivery_peak2_end_hour: Number(e.target.value) })); setDirty(true); }}
                    >
                      {HOURS_END.map(h => <option key={h} value={h}>{hh(h)}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Courier pickup point */}
      <div className={card}>
        <div className="flex items-center gap-2">
          <MapPin size={16} className={lightMode ? 'text-zinc-400' : 'text-white/40'} />
          <h3 className={`text-sm font-black ${lightMode ? 'text-zinc-900' : 'text-white'}`}>Çatdırılma ünvanı</h3>
        </div>
        <p className={`text-xs ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>
          Kuryer bu ünvan sifarişi götürür — POS-dakı çatdırılma sifarişlərinə yazılır.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={label}>Ünvan</label>
            <input className={input} value={address} onChange={e => { setAddress(e.target.value); setDirty(true); }} placeholder="Nizami Cəfərov 12, Bakı" />
          </div>
          <div>
            <label className={label}>Telefon</label>
            <input className={input} value={phone} onChange={e => { setPhone(e.target.value); setDirty(true); }} placeholder="+994 50 000 00 00" />
          </div>
        </div>
      </div>

      {/* Zones */}
      <div className={card}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Route size={16} className={lightMode ? 'text-zinc-400' : 'text-white/40'} />
            <h3 className={`text-sm font-black ${lightMode ? 'text-zinc-900' : 'text-white'}`}>Çatdırılma zonaları</h3>
          </div>
          <button
            onClick={addZone}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black bg-emerald-500 text-white hover:bg-emerald-400 transition-all active:scale-[0.97]"
          >
            <Plus size={13} /> Zona
          </button>
        </div>
        <p className={`text-xs ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>
          POS-da müştəri zonu seçəndə haqq avtomatik hesablanır; "Pulsuz limiti" keçəndə haqq avtomatik 0 olur.
          Km aralığı məsafəyə görə avtomatik zona seçimi üçün işləyir — prioritet kiçik olan zona qalib gəlir.
        </p>

        <div className="space-y-3">
          {zones.length === 0 && (
            <p className={`text-xs text-center py-6 ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
              Zona yoxdur — "Zona" ilə əlavə edin
            </p>
          )}
          {zones.map((z, i) => (
            <div key={z.id || `new-${i}`} className={`rounded-2xl border p-4 ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/[0.02] border-white/[0.08]'}`}>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className={label}>Zona adı</label>
                  <input className={input} value={z.name} onChange={e => patchZone(i, { name: e.target.value })} placeholder="Bakı Mərkəz" />
                </div>
                <div>
                  <label className={label}>Haqq (₼)</label>
                  <input className={input} type="number" step="0.5" min="0" value={toInput(z.fee)} onChange={e => patchZone(i, { fee: fromInput(e.target.value) ?? 0 })} />
                </div>
                <div>
                  <label className={label}>Pulsuz limiti (₼)</label>
                  <input className={input} type="number" step="5" min="0" value={toInput(z.free_delivery_threshold)} onChange={e => patchZone(i, { free_delivery_threshold: fromInput(e.target.value) ?? 0 })} />
                </div>
                <div>
                  <label className={label}>Min sifariş (₼)</label>
                  <input className={input} type="number" step="1" min="0" placeholder="boş = qlobal" value={toInput(z.min_order)} onChange={e => patchZone(i, { min_order: fromInput(e.target.value) })} />
                </div>

                <div>
                  <label className={label}>Min km</label>
                  <input className={input} type="number" step="0.1" min="0" value={toInput(z.min_km)} onChange={e => patchZone(i, { min_km: fromInput(e.target.value) ?? 0 })} />
                </div>
                <div>
                  <label className={label}>Max km</label>
                  <input className={input} type="number" step="0.1" min="0" placeholder="boş = limitsiz" value={toInput(z.max_km)} onChange={e => patchZone(i, { max_km: fromInput(e.target.value) })} />
                </div>
                <div>
                  <label className={label}>ETA min (dəq)</label>
                  <input className={input} type="number" step="5" min="0" placeholder="boş = yoxdur" value={toInput(z.est_minutes_min)} onChange={e => patchZone(i, { est_minutes_min: fromInput(e.target.value) })} />
                </div>
                <div>
                  <label className={label}>ETA max (dəq)</label>
                  <input className={input} type="number" step="5" min="0" placeholder="boş = yoxdur" value={toInput(z.est_minutes_max)} onChange={e => patchZone(i, { est_minutes_max: fromInput(e.target.value) })} />
                </div>
                <div>
                  <label className={label}>Prioritet</label>
                  <input className={input} type="number" step="1" min="0" placeholder="100" value={toInput(z.priority)} onChange={e => patchZone(i, { priority: fromInput(e.target.value) ?? 100 })} />
                </div>
              </div>
              <div className="flex items-center justify-between mt-3">
                <button
                  onClick={() => patchZone(i, { is_active: !z.is_active })}
                  className={`flex items-center gap-2 text-[11px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full border transition-all ${
                    z.is_active
                      ? (lightMode ? 'bg-emerald-50 border-emerald-300 text-emerald-600' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400')
                      : (lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-400' : 'bg-white/5 border-white/10 text-white/30')
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${z.is_active ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                  {z.is_active ? 'Aktiv' : 'Passiv'}
                </button>
                <button
                  onClick={() => removeZone(i)}
                  className="p-2 rounded-xl text-red-400 hover:bg-red-500/10 transition-all"
                  title="Zonani sil"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-emerald-500 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-400 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Saxla
        </button>
      </div>
    </div>
  );
}
