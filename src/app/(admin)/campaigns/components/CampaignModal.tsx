'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Zap, Loader2, Search, CheckCircle2, CalendarOff, Percent, Gift, Sparkles, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Campaign, Product } from '@/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import GoldSelect from '@/components/GoldSelect';
import GoldCalendar from '@/components/GoldCalendar';

interface FormState {
  title: string;
  title_en?: string;
  title_ru?: string;
  type: Campaign['type'];
  target_type: 'category' | 'product';
  target_id: string;
  discount_value: string;
  start_time: string;
  end_time: string;
  end_date: string;
  status?: 'active' | 'inactive';
}

interface Props {
  open: boolean;
  campaign: Campaign | null;
  form: FormState;
  isSubmitting: boolean;
  productSearch: string;
  filteredProducts: Product[];
  products: Product[];
  onClose: () => void;
  onFormChange: React.Dispatch<React.SetStateAction<any>>;
  onProductSearch: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

const CAMPAIGN_TYPES = (t: Function) => [
  { id: 'PERCENTAGE' as const, label: t('percentage_discount'), icon: Percent },
  { id: 'BOGO' as const, label: t('campaign_type_bogo'), icon: Gift },
  { id: 'BUY2GET1' as const, label: t('campaign_type_buy2'), icon: Gift },
  { id: 'HAPPY_HOUR' as const, label: t('campaign_type_happy_hour'), icon: Zap },
  { id: 'FREE_DELIVERY' as const, label: t('campaign_type_free_delivery'), icon: Sparkles },
];

const CampaignModal = ({
  open, campaign, form, isSubmitting, productSearch,
  filteredProducts, products, onClose, onFormChange, onProductSearch, onSubmit,
}: Props) => {
  const { t, language } = useLanguage();
  const campaignTypes = CAMPAIGN_TYPES(t);
  const titleLang = 'az';
  const [translating, setTranslating] = useState(false);

  const titleValue = form.title;
  const setTitleValue = (val: string) => onFormChange({ ...form, title: val });

  const handleAiTranslate = async () => {
    if (!form.title.trim()) return;
    setTranslating(true);
    try {
      const res = await fetch('/api/translate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { name: form.title }, languages: ['English', 'Russian'] }),
      });
      const d = await res.json();
      onFormChange({
        ...form,
        title_en: d.result?.English?.name || form.title_en || '',
        title_ru: d.result?.Russian?.name || form.title_ru || '',
      });
    } catch { /* silent */ } finally { setTranslating(false); }
  };

  const formBody = (
    <form noValidate onSubmit={onSubmit} className="space-y-8 px-6 md:px-9 py-8">
      <div className="space-y-7">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] uppercase tracking-widest text-white/50 font-semibold">{t('campaign_name')}</label>
            {translating && (
              <div className="flex items-center gap-1.5">
                <Loader2 size={10} className="animate-spin text-white/50" />
                <span className="text-[9px] text-white/30 uppercase tracking-widest">EN · RU</span>
              </div>
            )}
          </div>
          <input type="text" value={titleValue} onChange={(e) => setTitleValue(e.target.value)}
            onBlur={() => { if (form.title.trim()) handleAiTranslate(); }}
            className="w-full bg-white/[0.05] border border-white/[0.09] hover:border-white/[0.14] focus:border-white/20 rounded-2xl px-5 py-5 text-[16px] text-white placeholder:text-white/25 outline-none transition-all"
            placeholder={language === 'en' ? 'e.g: Roll Week Discount' : language === 'ru' ? 'напр: Скидка Недели Роллов' : 'Məs: Roll Həftəsi Endirimi'} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-white/50 font-semibold">{t('campaign_type')}</label>
            <GoldSelect
              value={form.type}
              options={campaignTypes.map((ct: {id: string, label: string, icon: React.ComponentType<{size: number, strokeWidth: number}>}) => ({ value: ct.id, label: ct.label, icon: <ct.icon size={13} strokeWidth={1.5} /> }))}
              onChange={(val) => onFormChange({...form, type: val as Campaign['type']})}
            />
          </div>
          {(form.type === 'PERCENTAGE' || form.type === 'HAPPY_HOUR') && (
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-white/50 font-semibold">{t('discount_percent_label')}</label>
              <input type="number" min="1" max="100" value={form.discount_value} onChange={(e) => onFormChange({...form, discount_value: e.target.value})}
                className="w-full bg-white/[0.05] border border-white/[0.09] hover:border-white/[0.14] focus:border-white/20 rounded-2xl px-5 py-5 text-[16px] text-white placeholder:text-white/25 outline-none transition-all"
                placeholder={language === 'en' ? 'e.g: 20' : language === 'ru' ? 'напр: 20' : 'Məs: 20'} />
            </div>
          )}
        </div>

        {form.type === 'HAPPY_HOUR' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-white/50 font-semibold">{t('start_time_label')}</label>
              <input type="time" value={form.start_time} onChange={(e) => onFormChange({...form, start_time: e.target.value})}
                className="w-full bg-white/[0.05] border border-white/[0.09] hover:border-white/[0.14] focus:border-white/20 rounded-2xl px-5 py-5 text-[16px] text-white outline-none transition-all" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-white/50 font-semibold">{t('end_time_label')}</label>
              <input type="time" value={form.end_time} onChange={(e) => onFormChange({...form, end_time: e.target.value})}
                className="w-full bg-white/[0.05] border border-white/[0.09] hover:border-white/[0.14] focus:border-white/20 rounded-2xl px-5 py-5 text-[16px] text-white outline-none transition-all" />
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
            <input type="text" placeholder={t('search_products')} value={productSearch} onChange={(e) => onProductSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-5 bg-white/[0.05] border border-white/[0.09] hover:border-white/[0.14] focus:border-white/20 rounded-2xl text-[15px] text-white placeholder:text-white/30 outline-none transition-all" />
          </div>
          <div className="max-h-[320px] overflow-y-auto pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filteredProducts.map(p => (
                <button key={p.id} type="button" onClick={() => onFormChange({...form, target_id: p.id, target_type: 'product'})}
                  className={`flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${
                    form.target_id === p.id
                      ? 'bg-white/[0.1] border-white/20'
                      : 'bg-white/[0.04] border-white/[0.08] hover:border-white/[0.18] hover:bg-white/[0.07]'
                  }`}>
                  <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-white/[0.06] border border-white/[0.06]">
                    {p.image_url
                      ? <img src={p.image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-white/20 text-[10px] font-black">{p.name.slice(0,2).toUpperCase()}</div>
                    }
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className={`text-[13px] font-semibold truncate ${form.target_id === p.id ? 'text-white' : 'text-white/80'}`}>{(language === 'en' && (p as any).translations?.en?.name) || (language === 'ru' && (p as any).translations?.ru?.name) || p.name}</p>
                    <p className="text-[12px] text-white/40 mt-0.5 font-medium">₼{p.price}</p>
                  </div>
                  {form.target_id === p.id && <CheckCircle2 size={15} className="text-white flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        {form.type === 'PERCENTAGE' && form.target_type === 'product' && form.target_id && (
          <div className="p-3.5 bg-white/[0.05] border border-white/20 rounded-xl flex justify-between items-center">
            <span className="text-[10px] uppercase text-white/40 font-bold tracking-widest">{t('new_price')}</span>
            <span className="text-xl font-bold text-white">₼{(() => {
              const p = products.find(prod => prod.id === form.target_id);
              const disc = parseFloat(form.discount_value) || 0;
              return p ? (p.price * (1 - disc / 100)).toFixed(2) : '0.00';
            })()}</span>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-white/50 font-semibold flex items-center gap-2">
            <CalendarOff size={11} />{t('end_date_optional')}
          </label>
          <GoldCalendar value={form.end_date} min={new Date().toISOString().split('T')[0]} onChange={(val) => onFormChange({...form, end_date: val})} />
          {form.end_date && <p className="text-[10px] text-white/50">{t('campaign_auto_deactivate')}</p>}
        </div>
      </div>
    </form>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      {/* ── MOBILE: slide-in from right ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="campaign-mobile"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 300 }}
            className="fixed inset-0 z-[120] flex flex-col bg-[#0a0a0a] md:hidden"
            style={{ overflowY: 'auto' }}
          >
            {/* Mobile Header */}
            <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-4 border-b border-white/[0.06] bg-[#0a0a0a]">
              <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/[0.05] text-white/50 hover:text-white transition-all">
                <ChevronLeft size={22} />
              </button>
              <div className="flex-1 text-center">
                <h2 className="text-[17px] font-serif font-bold text-white">{campaign ? t('edit_campaign') : t('new_campaign')}</h2>
                <p className="text-[9px] uppercase tracking-[0.3em] text-gold/60 mt-0.5">{t('premium_marketing')}</p>
              </div>
              <div className="w-10" />
            </div>

            {/* Mobile Body */}
            <div className="flex-1 pb-36">
              {formBody}
            </div>

            {/* Mobile Footer */}
            <div className="fixed bottom-0 inset-x-0 px-5 pb-8 pt-4 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/95 to-transparent z-10">
              <button
                type="button" onClick={onSubmit as any} disabled={isSubmitting}
                className="w-full py-4 rounded-2xl font-bold tracking-[0.15em] uppercase transition-all flex items-center justify-center gap-3 disabled:opacity-40"
                style={{ background: 'transparent', border: '1px solid #D4AF37', color: '#D4AF37' }}
              >
                {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : campaign ? <Save size={20} /> : <Zap size={20} />}
                {campaign ? t('edit_campaign').toUpperCase() : t('new_campaign').toUpperCase()}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── DESKTOP: centered modal ── */}
      {open && (
        <div className="fixed inset-0 z-[120] hidden md:flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            style={{
              background: 'linear-gradient(#111111,#0f0f0f) padding-box, linear-gradient(135deg,rgba(255,255,255,0.1) 0%,rgba(255,255,255,0.06) 50%,rgba(255,255,255,0.08) 100%) border-box',
              border: '1px solid transparent',
            }}
            className="relative w-full max-w-2xl rounded-2xl shadow-[0_32px_80px_rgba(0,0,0,0.7)] overflow-y-auto max-h-[92vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between px-9 py-6 bg-[#111111] border-b border-white/[0.06]">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-white mb-1">{campaign ? t('edit_campaign') : t('new_campaign')}</h2>
                <p className="text-[10px] text-white/50 uppercase tracking-[0.35em]">{t('premium_marketing')}</p>
              </div>
              <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.1] transition-all">
                <X size={18} />
              </button>
            </div>
            {formBody}
            <div className="sticky bottom-0 px-9 py-5 bg-[#111111] border-t border-white/[0.06]">
              <button type="button" onClick={onSubmit as any} disabled={isSubmitting}
                className="w-full py-4 rounded-xl font-bold tracking-[0.15em] uppercase transition-all flex items-center justify-center gap-3 disabled:opacity-40"
                style={{ background: 'transparent', border: '1px solid #D4AF37', color: '#D4AF37' }}>
                {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : campaign ? <Save size={20} /> : <Zap size={20} />}
                {campaign ? t('edit_campaign').toUpperCase() : t('new_campaign').toUpperCase()}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </>,
    document.body
  );
};

export default CampaignModal;
