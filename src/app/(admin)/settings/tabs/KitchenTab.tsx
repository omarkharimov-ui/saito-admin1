'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Save, Loader2, Timer, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useLanguage, interpolateTemplate } from '@/lib/i18n/LanguageContext';
import { labelCls } from './_shared';
import { useTheme } from '@/lib/theme/ThemeContext';

const KitchenTab = ({ initialData }: { initialData?: Record<string, any> | null }) => {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  const [loading, setLoading] = useState(false); // Instant load
  const [saving, setSaving] = useState(false);
  const [delayMin, setDelayMin] = useState(30);

  useEffect(() => {
    if (initialData) {
      if (initialData.order_delay_minutes) setDelayMin(initialData.order_delay_minutes);
      setLoading(false);
      return;
    }
    supabase.from('settings').select('order_delay_minutes').single().then(({ data }) => {
      if (data?.order_delay_minutes) setDelayMin(data.order_delay_minutes);
      setLoading(false);
    });
  }, [initialData]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('settings').update({ order_delay_minutes: delayMin }).eq('id', '1');
    if (error) toast.error(error.message, { id: 'action-toast' });
    else toast.success(t('kitchen_saved'), { id: 'action-toast', duration: 3000 });
    setSaving(false);
  };

  // Loading spinner removed - instant render

  return (
    <div className="space-y-6">
      <div className={`border rounded-2xl p-6 space-y-6 ${lightMode ? 'bg-gray-50 border-gray-200' : 'bg-white/[0.03] border-white/[0.07]'}`}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-500/10 text-red-400 rounded-xl"><AlertTriangle size={18} /></div>
          <div>
            <p className={`text-sm font-bold ${lightMode ? 'text-gray-900' : 'text-white'}`}>{t('kitchen_delay_title')}</p>
            <p className={`text-[11px] mt-0.5 ${lightMode ? 'text-gray-500' : 'text-white/55'}`}>{t('kitchen_delay_desc')}</p>
          </div>
        </div>

        <div>
          <label className={labelCls}><Timer size={11} /> {t('kitchen_delay_label')}</label>
          <div className="flex items-center gap-4">
            <button onClick={() => setDelayMin(v => Math.max(5, v - 5))} className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all font-bold text-lg ${lightMode ? 'bg-gray-100 border-gray-200 hover:bg-gray-200 text-gray-500 hover:text-gray-900' : 'bg-white/5 border-white/10 hover:bg-white/10 text-white/60 hover:text-white'}`}>−</button>
            <div className="flex-1 text-center">
              <span className={`text-4xl font-black ${lightMode ? 'text-gray-900' : 'text-white'}`}>{delayMin}</span>
              <span className={`text-sm ml-2 ${lightMode ? 'text-gray-500' : 'text-white/55'}`}>{t('kitchen_min')}</span>
            </div>
            <button onClick={() => setDelayMin(v => Math.min(120, v + 5))} className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all font-bold text-lg ${lightMode ? 'bg-gray-100 border-gray-200 hover:bg-gray-200 text-gray-500 hover:text-gray-900' : 'bg-white/5 border-white/10 hover:bg-white/10 text-white/60 hover:text-white'}`}>+</button>
          </div>
          <input type="range" min={5} max={120} step={5} value={delayMin} onChange={e => setDelayMin(Number(e.target.value))}
            className="w-full mt-4 accent-red-500" />
          <div className={`flex justify-between text-[10px] mt-1 ${lightMode ? 'text-gray-400' : 'text-white/45'}`}>
            <span>5 {t('kitchen_min')}</span><span>60 {t('kitchen_min')}</span><span>120 {t('kitchen_min')}</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/15">
          <p className="text-[11px] text-red-400/80">
            {interpolateTemplate(t('kitchen_delay_status'), { n: String(delayMin) })}
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-gold text-black px-8 py-3 rounded-xl font-bold text-sm hover:bg-white transition-all disabled:opacity-40">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {t('kitchen_save')}
        </button>
      </div>
    </div>
  );
};

export default KitchenTab;
