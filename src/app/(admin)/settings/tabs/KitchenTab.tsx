'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Save, Loader2, Timer, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useLanguage, interpolateTemplate } from '@/lib/i18n/LanguageContext';
import { labelCls } from './_shared';

const KitchenTab = ({ initialData }: { initialData?: Record<string, any> | null }) => {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false); // Instant load
  const [saving, setSaving] = useState(false);
  const [delayMin, setDelayMin] = useState(30);
  const [acceptMin, setAcceptMin] = useState(10);

  useEffect(() => {
    if (initialData) {
      if (initialData.order_delay_minutes) setDelayMin(initialData.order_delay_minutes);
      if (initialData.kitchen_accept_timeout_minutes) setAcceptMin(initialData.kitchen_accept_timeout_minutes);
      setLoading(false);
      return;
    }
    supabase.from('settings').select('order_delay_minutes, kitchen_accept_timeout_minutes').single().then(({ data }) => {
      if (data?.order_delay_minutes) setDelayMin(data.order_delay_minutes);
      if (data?.kitchen_accept_timeout_minutes) setAcceptMin(data.kitchen_accept_timeout_minutes);
      setLoading(false);
    });
  }, [initialData]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('settings').update({ order_delay_minutes: delayMin, kitchen_accept_timeout_minutes: acceptMin }).eq('id', '1');
    if (error) toast.error(error.message, { id: 'action-toast' });
    else toast.success(t('kitchen_saved'), { id: 'action-toast', duration: 3000 });
    setSaving(false);
  };

  // Loading spinner removed - instant render

  return (
    <div className="space-y-6">
      <div className="bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl"><Timer size={18} /></div>
          <div>
            <p className="text-sm font-bold text-white">Mətbəx vaxt nəzarəti</p>
            <p className="text-[11px] text-[var(--theme-text-secondary)] mt-0.5">Qəbul və hazırlıq üçün iki ayrı, aydın limit.</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface-muted)]/60 p-4 space-y-4">
            <div>
              <label className={labelCls}><AlertTriangle size={11} /> Qəbul vaxtı</label>
              <p className="text-[11px] text-[var(--theme-text-secondary)] mt-1">Sifariş mətbəxdə neçə dəqiqəyə qəbul edilməlidir.</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setAcceptMin(v => Math.max(5, v - 5))} className="w-10 h-10 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-[var(--theme-text-secondary)] flex items-center justify-center transition-all font-bold text-lg">−</button>
              <div className="flex-1 text-center">
                <span className="text-4xl font-black text-white">{acceptMin}</span>
                <span className="text-[var(--theme-text-secondary)] text-sm ml-2">dəq</span>
              </div>
              <button onClick={() => setAcceptMin(v => Math.min(120, v + 5))} className="w-10 h-10 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-[var(--theme-text-secondary)] flex items-center justify-center transition-all font-bold text-lg">+</button>
            </div>
            <input type="range" min={5} max={120} step={5} value={acceptMin} onChange={e => setAcceptMin(Number(e.target.value))} className="w-full accent-amber-400" />
            <div className="flex justify-between text-[10px] text-[var(--theme-text-muted)]"><span>5 dəq</span><span>60 dəq</span><span>120 dəq</span></div>
          </div>

          <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface-muted)]/60 p-4 space-y-4">
            <div>
              <label className={labelCls}><Timer size={11} /> Hazırlıq limiti</label>
              <p className="text-[11px] text-[var(--theme-text-secondary)] mt-1">Qəbul edilən sifariş neçə dəqiqəyə gecikmiş sayılır.</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setDelayMin(v => Math.max(5, v - 5))} className="w-10 h-10 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-[var(--theme-text-secondary)] flex items-center justify-center transition-all font-bold text-lg">−</button>
              <div className="flex-1 text-center">
                <span className="text-4xl font-black text-white">{delayMin}</span>
                <span className="text-[var(--theme-text-secondary)] text-sm ml-2">dəq</span>
              </div>
              <button onClick={() => setDelayMin(v => Math.min(120, v + 5))} className="w-10 h-10 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-[var(--theme-text-secondary)] flex items-center justify-center transition-all font-bold text-lg">+</button>
            </div>
            <input type="range" min={5} max={120} step={5} value={delayMin} onChange={e => setDelayMin(Number(e.target.value))} className="w-full accent-red-500" />
            <div className="flex justify-between text-[10px] text-[var(--theme-text-muted)]"><span>5 dəq</span><span>60 dəq</span><span>120 dəq</span></div>
          </div>
        </div>

        <div className="rounded-2xl border border-red-500/15 bg-red-500/5 p-4 text-[11px] text-red-400/80 space-y-1">
          <p>{interpolateTemplate(t('kitchen_delay_status'), { n: String(delayMin) })}</p>
          <p>Qəbul vaxtı: {acceptMin} dəq · Hazırlıq limiti: {delayMin} dəq</p>
        </div>
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
