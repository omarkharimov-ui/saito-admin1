'use client';


import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Save, Loader2, Store, MapPin, Phone, Clock, Camera, QrCode, Download, Plus, Minus, X, ExternalLink, Lock, Users, Trash2, User, Briefcase, Moon, BrainCircuit, Target, Timer, TrendingUp, AlertTriangle, Settings2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { motion, AnimatePresence } from 'framer-motion';
import GoldSelect from '@/components/GoldSelect';
import { GsLoader } from './_shared';
import QRCodeLib from 'qrcode';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

type Tab = 'general' | 'staff' | 'qr' | 'account' | 'analytics' | 'kitchen';

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'general',   label: 'Ümumi',        icon: <Store size={13} /> },
  { key: 'staff',     label: 'İşçilər',      icon: <Users size={13} /> },
  { key: 'qr',        label: 'QR Kodlar',    icon: <QrCode size={13} /> },
  { key: 'account',   label: 'Hesab',        icon: <Lock size={13} /> },
  { key: 'analytics', label: 'AI Analitika', icon: <BrainCircuit size={13} /> },
  { key: 'kitchen',   label: 'Mətbəx',       icon: <Timer size={13} /> },
];

const inputCls = 'w-full bg-black/60 border border-white/10 focus:border-gold px-4 py-3 text-sm outline-none rounded-xl transition-all text-white placeholder:text-white/20 appearance-none shadow-premium';
const labelCls = 'text-[10px] uppercase tracking-[0.2em] text-gold/60 flex items-center gap-2 mb-2 font-bold';

const DAYS = ['Bazar ertəsi', 'Çərşənbə axşamı', 'Çərşənbə', 'Cümə axşamı', 'Cümə', 'Şənbə', 'Bazar'];
const JS_DAY_TO_IDX = [6, 0, 1, 2, 3, 4, 5];
type DayHours = { open: string; close: string; closed: boolean };
type HoursConfig = { days: DayHours[]; peakStart: string; peakEnd: string };
const defaultHours = (): HoursConfig => ({
  days: DAYS.map(() => ({ open: '10:00', close: '23:00', closed: false })),
  peakStart: '18:00',
  peakEnd: '21:00',
});
const timeCls = 'bg-transparent border-b border-white/15 focus:border-gold px-2 py-1.5 text-sm text-white outline-none transition-all w-[90px] tabular-nums';

const HoursTab = () => {
  const [config, setConfig] = useState<HoursConfig>(defaultHours());
  const [saving, setSaving] = useState(false);
  const todayIdx = JS_DAY_TO_IDX[new Date().getDay()];

  useEffect(() => {
    supabase.from('settings').select('working_hours').single().then(({ data }) => {
      if (data?.working_hours) {
        try { setConfig(JSON.parse(data.working_hours)); } catch {}
      }
    });
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('settings').upsert([{ id: '1', working_hours: JSON.stringify(config) }]);
    if (error) toast.error(error.message, { style: { background: '#1f0d0d', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)', fontWeight: 600 } });
    else toast.success('İş saatları yeniləndi', { duration: 3000, style: { background: '#0d0b00', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.28)', fontWeight: 600 } });
    setSaving(false);
  };

  const updateDay = (i: number, field: keyof DayHours, value: string | boolean) =>
    setConfig(prev => { const days = [...prev.days]; days[i] = { ...days[i], [field]: value }; return { ...prev, days }; });

  return (
    <div className="max-w-xl space-y-6">
      {/* Daily hours */}
      <div className="rounded-2xl border border-white/8 overflow-hidden">
        {DAYS.map((day, i) => {
          const isToday = i === todayIdx;
          const d = config.days[i];
          return (
            <div
              key={day}
              className={`flex items-center px-5 py-3.5 gap-5 border-b border-white/5 last:border-0 transition-colors ${
                isToday ? 'bg-gold/[0.06]' : 'hover:bg-white/[0.02]'
              }`}
            >
              {/* Day label */}
              <div className="w-[140px] flex-shrink-0 flex items-center gap-2">
                <span className={`text-sm font-medium ${ isToday ? 'text-gold' : 'text-white/50'}`}>{day}</span>
                {isToday && <span className="text-[9px] font-black uppercase tracking-widest text-gold/60 bg-gold/10 px-1.5 py-0.5 rounded">Bu gün</span>}
              </div>

              {/* Toggle */}
              <button
                type="button"
                onClick={() => updateDay(i, 'closed', !d.closed)}
                className={`relative w-9 h-[20px] rounded-full transition-all flex-shrink-0 ${ d.closed ? 'bg-white/8' : 'bg-gold'}`}
              >
                <span className={`absolute top-[3px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all ${ d.closed ? 'left-[3px]' : 'left-[19px]'}`} />
              </button>

              {d.closed ? (
                <span className="text-xs text-white/20 italic">Bağlı</span>
              ) : (
                <div className="flex items-center gap-2">
                  <input type="time" value={d.open} onChange={e => updateDay(i, 'open', e.target.value)} className={timeCls} />
                  <span className="text-white/20 text-xs select-none">–</span>
                  <input type="time" value={d.close} onChange={e => updateDay(i, 'close', e.target.value)} className={timeCls} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Peak hours */}
      <div className="rounded-2xl border border-white/8 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/5 flex items-center gap-2">
          <Moon size={14} className="text-orange-400" />
          <span className="text-xs font-bold text-white/70 uppercase tracking-widest">Pik Saat Aralığı</span>
          <span className="text-[10px] text-white/25 ml-1">— statistikada istifadə olunur</span>
        </div>
        <div className="px-5 py-4 flex items-center gap-3">
          <input type="time" value={config.peakStart} onChange={e => setConfig(c => ({ ...c, peakStart: e.target.value }))} className={timeCls} />
          <span className="text-white/20 text-xs">–</span>
          <input type="time" value={config.peakEnd} onChange={e => setConfig(c => ({ ...c, peakEnd: e.target.value }))} className={timeCls} />
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-gold text-black px-7 py-2.5 rounded-xl font-bold text-sm hover:bg-white transition-all disabled:opacity-40 shadow-lg shadow-gold/10">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Yadda Saxla
        </button>
      </div>
    </div>
  );
};

/* ─── Account Tab ─── */

export default HoursTab;
