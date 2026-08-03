'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Save, Loader2, Timer, AlertTriangle, Printer } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useLanguage, interpolateTemplate } from '@/lib/i18n/LanguageContext';
import { labelCls } from './_shared';

const KitchenTab = ({ initialData }: { initialData?: Record<string, any> | null }) => {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [delayMin, setDelayMin] = useState(30);
  const [noShowTimeout, setNoShowTimeout] = useState(15);

  useEffect(() => {
    if (initialData) {
      if (initialData.order_delay_minutes) setDelayMin(initialData.order_delay_minutes);
      if (initialData.no_show_timeout_minutes) setNoShowTimeout(initialData.no_show_timeout_minutes);
      setLoading(false);
      return;
    }
    Promise.all([
      supabase.from('settings').select('order_delay_minutes').single(),
      supabase.from('app_settings').select('value').eq('key', 'no_show_timeout_minutes').single(),
    ]).then(([{ data: settingsData }, { data: noShowData }]) => {
      if (settingsData?.order_delay_minutes) setDelayMin(settingsData.order_delay_minutes);
      if (noShowData?.value) setNoShowTimeout(Number(noShowData.value));
      setLoading(false);
    });
  }, [initialData]);

  const save = async () => {
    setSaving(true);
    await Promise.all([
      supabase.from('settings').upsert({ id: '1', order_delay_minutes: delayMin }),
      supabase.from('app_settings').upsert({ key: 'no_show_timeout_minutes', value: String(noShowTimeout), updated_at: new Date().toISOString() }),
    ]);
    toast.success(t('kitchen_saved'), { id: 'action-toast', duration: 3000 });
    setSaving(false);
  };

  // Loading spinner removed - instant render

  return (
    <div className="space-y-6">
      <div className="bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] rounded-3xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-red-500/10 text-red-400 rounded-2xl"><AlertTriangle size={20} /></div>
          <div>
            <p className="text-sm font-bold text-white">{t('kitchen_delay_title')}</p>
            <p className="text-[11px] text-[var(--theme-text-secondary)] mt-0.5">{t('kitchen_delay_desc')}</p>
          </div>
        </div>

        <div>
          <label className={labelCls}><Timer size={11} /> {t('kitchen_delay_label')}</label>
          <div className="flex items-center gap-4">
            <button onClick={() => setDelayMin(v => Math.max(5, v - 5))} className="w-10 h-10 rounded-xl bg-[var(--theme-surface-muted)] border border-[var(--theme-border)] hover:bg-[var(--theme-surface-hover)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] flex items-center justify-center transition-all font-bold text-lg">−</button>
            <div className="flex-1 text-center">
              <span className="text-4xl font-black text-white">{delayMin}</span>
              <span className="text-[var(--theme-text-secondary)] text-sm ml-2">{t('kitchen_min')}</span>
            </div>
            <button onClick={() => setDelayMin(v => Math.min(120, v + 5))} className="w-10 h-10 rounded-xl bg-[var(--theme-surface-muted)] border border-[var(--theme-border)] hover:bg-[var(--theme-surface-hover)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] flex items-center justify-center transition-all font-bold text-lg">+</button>
          </div>
          <input type="range" min={5} max={120} step={5} value={delayMin} onChange={e => setDelayMin(Number(e.target.value))}
            className="w-full mt-4 accent-red-500" />
          <div className="flex justify-between text-[10px] text-[var(--theme-text-muted)] mt-1">
            <span>5 {t('kitchen_min')}</span><span>60 {t('kitchen_min')}</span><span>120 {t('kitchen_min')}</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/15">
          <p className="text-[11px] text-red-400/80">
            {interpolateTemplate(t('kitchen_delay_status'), { n: String(delayMin) })}
          </p>
        </div>
      </div>

      <div className="bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] rounded-3xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-2xl"><Timer size={20} /></div>
          <div>
            <p className="text-sm font-bold text-white">No-Show Timeout</p>
            <p className="text-[11px] text-[var(--theme-text-secondary)] mt-0.5">Rezervasiya vaxtından sonra qonaq gəlməzsə avtomatik no-show olur</p>
          </div>
        </div>

        <div>
          <label className={labelCls}><Timer size={11} /> No-Show müddəti</label>
          <div className="flex items-center gap-4">
            <button onClick={() => setNoShowTimeout(v => Math.max(5, v - 5))} className="w-10 h-10 rounded-xl bg-[var(--theme-surface-muted)] border border-[var(--theme-border)] hover:bg-[var(--theme-surface-hover)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] flex items-center justify-center transition-all font-bold text-lg">−</button>
            <div className="flex-1 text-center">
              <span className="text-4xl font-black text-white">{noShowTimeout}</span>
              <span className="text-[var(--theme-text-secondary)] text-sm ml-2">dəqiqə</span>
            </div>
            <button onClick={() => setNoShowTimeout(v => Math.min(60, v + 5))} className="w-10 h-10 rounded-xl bg-[var(--theme-surface-muted)] border border-[var(--theme-border)] hover:bg-[var(--theme-surface-hover)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] flex items-center justify-center transition-all font-bold text-lg">+</button>
          </div>
          <input type="range" min={5} max={60} step={5} value={noShowTimeout} onChange={e => setNoShowTimeout(Number(e.target.value))}
            className="w-full mt-4 accent-amber-500" />
          <div className="flex justify-between text-[10px] text-[var(--theme-text-muted)] mt-1">
            <span>5 dəq</span><span>30 dəq</span><span>60 dəq</span>
          </div>
        </div>
      </div>

      <div className="bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] rounded-3xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-2xl"><Printer size={20} /></div>
          <div>
            <p className="text-sm font-bold text-white">Printer Routing</p>
            <p className="text-[11px] text-[var(--theme-text-secondary)] mt-0.5">Məhsulları printerlərə yönləndir</p>
          </div>
        </div>
        <p className="text-xs text-white/40">Məhsul detalları səhifəsindən hər məhsul üçün printer route təyin edin.</p>
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-gold text-black px-8 py-3 rounded-xl font-bold text-sm hover:brightness-110 transition-all disabled:opacity-40">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {t('kitchen_save')}
        </button>
      </div>
    </div>
  );
};

export default KitchenTab;
