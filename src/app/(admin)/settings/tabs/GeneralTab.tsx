'use client';

import React, { useState, useEffect } from 'react';
import { useFormDirtyCompare } from '@/hooks/useFormDirty';
import { supabase } from '@/lib/supabase';
import { Save, Loader2, Store, MapPin, Phone, Clock, Camera, ChevronRight, Mail } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { inputCls, labelCls, saveButtonCls } from './_shared';

function parseHours(raw: string): { open: string; close: string } {
  const match = raw?.match(/^(\d{2}:\d{2})[–\-](\d{2}:\d{2})$/);
  if (match) return { open: match[1], close: match[2] };
  return { open: '10:00', close: '22:00' };
}

const GeneralTab = ({ initialData }: { initialData?: Record<string, any> | null }) => {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false); // Instant load - no spinner
  const [updating, setUpdating] = useState(false);
  const [settings, setSettings] = useState({ id: '1', restaurant_name: 'Saito Sushi', address: '', phone: '', contact_email: '', opening_hours: '10:00-22:00', instagram_url: '', morning_greeting_enabled: true as boolean | string });
  const [openTime, setOpenTime] = useState('10:00');
  const [closeTime, setCloseTime] = useState('22:00');
  const { isDirty } = useFormDirtyCompare(settings, [!loading]);

  useEffect(() => {
    if (initialData) {
      const merged = { ...settings, ...Object.fromEntries(Object.entries(initialData).filter(([k]) => k !== 'footer_text').map(([k, v]) => [k, v ?? ''])) };
      setSettings(merged);
      const parsed = parseHours(merged.opening_hours);
      setOpenTime(parsed.open);
      setCloseTime(parsed.close);
      return;
    }
    supabase.from('settings').select('*').single().then(({ data }) => {
      if (data) {
        const merged = { ...settings, ...Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'footer_text').map(([k, v]) => [k, v ?? ''])) };
        setSettings(merged);
        const parsed = parseHours(merged.opening_hours);
        setOpenTime(parsed.open);
        setCloseTime(parsed.close);
      }
      setLoading(false);
    });
  }, [initialData]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTimeChange = (field: 'open' | 'close', val: string) => {
    const next = { open: openTime, close: closeTime, [field]: val };
    setOpenTime(next.open);
    setCloseTime(next.close);
    setSettings(s => ({ ...s, opening_hours: `${next.open}-${next.close}` }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdating(true);
    const { error } = await supabase.from('settings').upsert([{ ...settings, id: '1' }]);
    if (error) toast.error(error.message, { id: 'action-toast' });
    else toast.success(t('settings_updated'), { id: 'action-toast', duration: 3000 });
    setUpdating(false);
  };

  // Loading spinner removed - instant render

  return (
    <div className="space-y-6 max-w-2xl">
      <form noValidate onSubmit={save} className="space-y-6 rounded-3xl border border-[#e5e7eb] bg-[linear-gradient(180deg,#ffffff_0%,#f8f8fa_100%)] p-6 shadow-[0_8px_40px_rgba(0,0,0,0.04)]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div><label className={labelCls}><Store size={11} /> {t('gen_restaurant_name')}</label><input className={inputCls} value={settings.restaurant_name} onChange={e => setSettings({ ...settings, restaurant_name: e.target.value })} /></div>
          <div><label className={labelCls}><MapPin size={11} /> {t('gen_address')}</label><input className={inputCls} value={settings.address} onChange={e => setSettings({ ...settings, address: e.target.value })} /></div>
          <div><label className={labelCls}><Phone size={11} /> {t('gen_phone')}</label><input className={inputCls} value={settings.phone} onChange={e => setSettings({ ...settings, phone: e.target.value })} /></div>
          <div><label className={labelCls}><Mail size={11} /> {t('gen_email')}</label><input className={inputCls} type="email" placeholder="info@saitosushi.com" value={settings.contact_email} onChange={e => setSettings({ ...settings, contact_email: e.target.value })} /></div>
          <div>
            <label className={labelCls}><Clock size={11} /> {t('gen_work_hours')}</label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <p className="text-[9px] uppercase tracking-[0.18em] text-[#6b7280] mb-1.5">{t('gen_open_time')}</p>
                <input
                  type="time"
                  value={openTime}
                  onChange={e => handleTimeChange('open', e.target.value)}
                  className={inputCls + ' [color-scheme:dark] text-center'}
                />
              </div>
              <ChevronRight size={14} className="text-[#d1d5db] mt-5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-[9px] uppercase tracking-[0.18em] text-[#6b7280] mb-1.5">{t('gen_close_time')}</p>
                <input
                  type="time"
                  value={closeTime}
                  onChange={e => handleTimeChange('close', e.target.value)}
                  className={inputCls + ' [color-scheme:dark] text-center'}
                />
              </div>
            </div>
            <p className="text-[10px] text-[#6b7280] mt-1.5">{t('gen_work_hours_hint')} <span className="text-[#007aff] font-mono">{openTime} – {closeTime}</span></p>
          </div>
          <div><label className={labelCls}><Camera size={11} /> {t('gen_instagram')}</label><input className={inputCls} placeholder="https://instagram.com/…" value={settings.instagram_url} onChange={e => setSettings({ ...settings, instagram_url: e.target.value })} /></div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={updating || !isDirty}
            className={`${saveButtonCls} ${!isDirty && !updating ? 'opacity-40 pointer-events-none' : ''}`} style={{ background: '#111111', color: '#ffffff', border: '1px solid rgba(17,17,17,0.9)' }}>
            {updating ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {t('gen_save')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default GeneralTab;
