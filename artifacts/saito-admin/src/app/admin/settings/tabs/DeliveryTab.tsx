'use client';

/**
 * Settings → Çatdırılma (2026-09-23, owner): Wolt-like delivery management.
 *
 * The delivery address (courier pickup point) and the zones (fee, free
 * threshold, ETA) used to be a single hardcoded row in delivery_zones with no
 * UI. Now both are managed here; the POS zone picker + fee engine read the
 * same table live (is_active-filtered).
 */
import { useState, useEffect, useCallback } from 'react';
import { MapPin, Bike, Plus, Trash2, Save, Loader2, Route } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { apiFetch } from '@/lib/api-fetch';
import toast from 'react-hot-toast';

interface Zone {
  id?: string;
  name: string;
  fee: number;
  free_delivery_threshold: number;
  estimated_minutes: number;
  is_active: boolean;
}

interface DeliveryData {
  location: { id: string; name: string; address: string | null; phone: string | null } | null;
  zones: Zone[];
}

export default function DeliveryTab() {
  const { lightMode } = useTheme();
  const { t } = useLanguage();
  const [data, setData] = useState<DeliveryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [zones, setZones] = useState<Zone[]>([]);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/settings/delivery');
      if (res.ok) {
        const d: DeliveryData = await res.json();
        setData(d);
        setAddress(d.location?.address || '');
        setPhone(d.location?.phone || '');
        setZones((d.zones || []).slice());
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
    setZones(prev => [...prev, { name: '', fee: 2, free_delivery_threshold: 50, estimated_minutes: 30, is_active: true }]);
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
          zones: zones.map(z => ({
            id: z.id || undefined,
            name: z.name.trim(),
            fee: Number(z.fee) || 0,
            free_delivery_threshold: Number(z.free_delivery_threshold) || 0,
            estimated_minutes: Number(z.estimated_minutes) || 30,
            is_active: z.is_active !== false,
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={22} className="animate-spin opacity-40" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
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
        </p>

        <div className="space-y-3">
          {zones.length === 0 && (
            <p className={`text-xs text-center py-6 ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
              Zona yoxdur — "Zona" ilə əlavə edin
            </p>
          )}
          {zones.map((z, i) => (
            <div key={z.id || `new-${i}`} className={`rounded-2xl border p-4 ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/[0.02] border-white/[0.08]'}`}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className={label}>Zona adı</label>
                  <input className={input} value={z.name} onChange={e => patchZone(i, { name: e.target.value })} placeholder="Bakı Mərkəz" />
                </div>
                <div>
                  <label className={label}>Haqq (₼)</label>
                  <input className={input} type="number" step="0.5" min="0" value={z.fee} onChange={e => patchZone(i, { fee: Number(e.target.value) })} />
                </div>
                <div>
                  <label className={label}>Pulsuz limiti (₼)</label>
                  <input className={input} type="number" step="5" min="0" value={z.free_delivery_threshold} onChange={e => patchZone(i, { free_delivery_threshold: Number(e.target.value) })} />
                </div>
                <div>
                  <label className={label}>Müddət (dəq)</label>
                  <input className={input} type="number" step="5" min="0" value={z.estimated_minutes} onChange={e => patchZone(i, { estimated_minutes: Number(e.target.value) })} />
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
