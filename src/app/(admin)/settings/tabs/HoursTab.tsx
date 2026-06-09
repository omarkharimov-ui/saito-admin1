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

const inputCls = 'w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] px-4 py-3 text-sm outline-none rounded-xl transition-all text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] appearance-none shadow-premium';
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
const timeCls = 'bg-transparent border-b border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] px-2 py-1.5 text-sm text-[var(--theme-text)] outline-none transition-all w-[90px] tabular-nums';

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
    if (error) toast.error(error.message, { id: 'action-toast' });
    else toast.success('İş saatları yeniləndi', { id: 'action-toast', duration: 3000 });
    setSaving(false);
  };

  const updateDay = (i: number, field: keyof DayHours, value: string | boolean) =>
    setConfig(prev => { const days = [...prev.days]; days[i] = { ...days[i], [field]: value }; return { ...prev, days }; });

  return (
    <div className="max-w-xl space-y-6">
      {/* Daily hours */}
      <div className="rounded-2xl border border-[var(--theme-border)] overflow-hidden bg-[var(--theme-surface-muted)]">
        {DAYS.map((day, i) => {
          const isToday = i === todayIdx;
          const d = config.days[i];
          return (
            <div
              key={day}
              className={`flex flex-wrap items-center px-4 py-3 gap-x-3 gap-y-2 border-b border-[var(--theme-border)] last:border-0 transition-colors ${
                isToday ? 'bg-gold/[0.06]' : 'hover:bg-[var(--theme-surface)]'
              }`}
            >
              {/* Day label + toggle */}
              <div className="flex items-center gap-2.5 min-w-[130px] flex-1">
                <button
                  type="button"
                  onClick={() => updateDay(i, 'closed', !d.closed)}
                  className={`relative w-9 h-[20px] rounded-full transition-all flex-shrink-0 ${ d.closed ? 'bg-[var(--theme-border)]' : 'bg-gold'}`}
                >
                  <span className={`absolute top-[3px] w-[14px] h-[14px] rounded-full bg-[var(--theme-surface)] shadow transition-all ${ d.closed ? 'left-[3px]' : 'left-[19px]'}`} />
                </button>
                <span className={`text-sm font-medium ${ isToday ? 'text-gold' : d.closed ? 'text-[var(--theme-text-muted)]' : 'text-[var(--theme-text-secondary)]'}`}>{day}</span>
                {isToday && <span className="text-[9px] font-black uppercase tracking-widest text-gold/60 bg-gold/10 px-1.5 py-0.5 rounded">Bu gün</span>
              </div>

              {d.closed ? (
                <span className="text-xs text-[var(--theme-text-muted)] italic">Bağlı</span>
              ) : (
                <div className="flex items-center gap-2">
                  <input type="time" value={d.open} onChange={e => updateDay(i, 'open', e.target.value)} className={timeCls} />
                  <span className="text-[var(--theme-text-muted)] text-xs select-none">–</span>
                  <input type="time" value={d.close} onChange={e => updateDay(i, 'close', e.target.value)} className={timeCls} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Peak hours */}
      <div className="rounded-2xl border border-[var(--theme-border)] overflow-hidden bg-[var(--theme-surface-muted)]">
        <div className="px-5 py-3 border-b border-[var(--theme-border)] flex items-center gap-2">
          <Moon size={14} className="text-orange-400" />
          <span className="text-xs font-bold text-[var(--theme-text-secondary)] uppercase tracking-widest">Pik Saat Aralığı</span>
          <span className="text-[10px] text-[var(--theme-text-muted)] ml-1">— statistikada istifadə olunur</span>
        </div>
        <div className="px-5 py-4 flex items-center gap-3">
          <input type="time" value={config.peakStart} onChange={e => setConfig(c => ({ ...c, peakStart: e.target.value }))} className={timeCls} />
          <span className="text-[var(--theme-text-muted)] text-xs">–</span>
          <input type="time" value={config.peakEnd} onChange={e => setConfig(c => ({ ...c, peakEnd: e.target.value }))} className={timeCls} />
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-gold text-black px-7 py-2.5 rounded-xl font-bold text-sm hover:brightness-110 transition-all disabled:opacity-40 shadow-lg shadow-gold/10">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Yadda Saxla
        </button>
      </div>
    </div>
  );
};

/* ─── Account Tab ─── */

export default HoursTab;
