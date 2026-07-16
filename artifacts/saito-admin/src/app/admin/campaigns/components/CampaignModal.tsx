'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Zap, Loader2, Search, CheckCircle2, CalendarOff, Percent, Gift, Sparkles, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Campaign, Product } from '@/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import GoldSelect from '@/components/GoldSelect';
import GoldCalendar from '@/components/GoldCalendar';

export interface FormState {
  title: string;
  title_en?: string;
  title_ru?: string;
  type: Campaign['type'];
  target_type: Campaign['target_type'];
  target_id: string;
  discount_value: string;
  buy_quantity?: number;
  get_quantity?: number;
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
    <form noValidate onSubmit={onSubmit} className="space-y-6 px-4 md:px-6 py-6 w-full overflow-hidden">
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">{t('campaign_name')}</label>
            {translating && (
              <div className="flex items-center gap-1.5">
                <Loader2 size={10} className="animate-spin text-[var(--theme-text-secondary)]" />
                <span className="text-[9px] text-[var(--theme-text-muted)] uppercase tracking-widest">EN · RU</span>
              </div>
            )}
          </div>
          <input type="text" value={titleValue} onChange={(e) => setTitleValue(e.target.value)}
            onBlur={() => { if (form.title.trim()) handleAiTranslate(); }}
            className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] hover:border-[var(--theme-border-strong)] focus:border-[var(--theme-border-strong)] rounded-xl px-4 py-3 text-[14px] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none transition-all"
            placeholder={language === 'en' ? 'e.g: Roll Week Discount' : language === 'ru' ? 'напр: Скидка Недели Роллов' : 'Məs: Roll Həftəsi Endirimi'} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">{t('campaign_type')}</label>
            <GoldSelect
              value={form.type}
              options={campaignTypes.map((ct: {id: string, label: string, icon: React.ComponentType<{size: number, strokeWidth: number}>}) => ({ value: ct.id, label: ct.label, icon: <ct.icon size={13} strokeWidth={1.5} /> }))}
              onChange={(val) => onFormChange({...form, type: val as Campaign['type']})}
            />
          </div>
          {(form.type === 'PERCENTAGE' || form.type === 'HAPPY_HOUR') && (
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">{t('discount_percent_label')}</label>
              <input type="number" min="1" max="100" value={form.discount_value} onChange={(e) => onFormChange({...form, discount_value: e.target.value})}
                className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] hover:border-[var(--theme-border-strong)] focus:border-[var(--theme-border-strong)] rounded-xl px-4 py-3 text-[14px] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none transition-all"
                placeholder={language === 'en' ? 'e.g: 20' : language === 'ru' ? 'напр: 20' : 'Məs: 20'} />
            </div>
          )}
          {form.type === 'FIXED_AMOUNT' && (
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">{t('discount_amount_label') || 'Endirim məbləği (₼)'}</label>
              <input type="number" min="0" step="0.01" value={form.discount_value} onChange={(e) => onFormChange({...form, discount_value: e.target.value})}
                className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] hover:border-[var(--theme-border-strong)] focus:border-[var(--theme-border-strong)] rounded-xl px-4 py-3 text-[14px] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none transition-all"
                placeholder="Məs: 5.00" />
            </div>
          )}
          {(form.type === 'BOGO' || form.type === 'BUY2GET1') && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">Al</label>
                <input type="number" min="1" value={form.buy_quantity || (form.type === 'BOGO' ? 1 : 2)} onChange={(e) => onFormChange({...form, buy_quantity: parseInt(e.target.value) || 1})}
                  className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] hover:border-[var(--theme-border-strong)] focus:border-[var(--theme-border-strong)] rounded-xl px-4 py-3 text-[14px] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none transition-all" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">Ödə</label>
                <input type="number" min="1" value={form.get_quantity || 1} onChange={(e) => onFormChange({...form, get_quantity: parseInt(e.target.value) || 1})}
                  className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] hover:border-[var(--theme-border-strong)] focus:border-[var(--theme-border-strong)] rounded-xl px-4 py-3 text-[14px] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none transition-all" />
              </div>
            </div>
          )}
        </div>

        {form.type === 'HAPPY_HOUR' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">{t('start_time_label')}</label>
              <input type="time" value={form.start_time} onChange={(e) => onFormChange({...form, start_time: e.target.value})}
                className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] rounded-xl px-3 py-2.5 text-[13px] text-[var(--theme-text)] outline-none transition-all" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold">{t('end_time_label')}</label>
              <input type="time" value={form.end_time} onChange={(e) => onFormChange({...form, end_time: e.target.value})}
                className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] rounded-xl px-3 py-2.5 text-[13px] text-[var(--theme-text)] outline-none transition-all" />
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)]" />
            <input type="text" placeholder={t('search_products')} value={productSearch} onChange={(e) => onProductSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-3 bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] hover:border-[var(--theme-border-strong)] focus:border-[var(--theme-border-strong)] rounded-xl text-[13px] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none transition-all" />
          </div>
          <div className="max-h-[280px] overflow-y-auto pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
            {filteredProducts.length === 0 ? (
              <p className="text-center py-8 text-[11px] text-[var(--theme-text-muted)]">{t('no_products') || 'Məhsul tapılmadı'}</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filteredProducts.map(p => (
                  <button key={p.id} type="button" onClick={() => onFormChange({...form, target_id: p.id, target_type: 'product'})}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                      form.target_id === p.id
                        ? 'bg-[var(--theme-accent-soft)] border-[var(--theme-accent-border)]'
                        : 'bg-[var(--theme-surface-soft)] border-[var(--theme-border)] hover:border-[var(--theme-border-strong)] hover:bg-[var(--theme-panel)]'
                    }`}>
                    <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
                      {p.image_url
                        ? <img src={p.image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-[var(--theme-text-muted)] text-[9px] font-black">{p.name.slice(0,2).toUpperCase()}</div>
                      }
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className={`text-[12px] font-semibold truncate ${form.target_id === p.id ? 'text-[var(--theme-text)]' : 'text-[var(--theme-text-secondary)]'}`}>{(language === 'en' && (p as any).translations?.en?.name) || (language === 'ru' && (p as any).translations?.ru?.name) || p.name}</p>
                      <p className="text-[11px] text-[var(--theme-text-muted)] mt-0.5">₼{p.price}</p>
                    </div>
                    {form.target_id === p.id && <CheckCircle2 size={14} className="text-white flex-shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {form.type === 'PERCENTAGE' && form.target_type === 'product' && form.target_id && (
          <div className="p-3 bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] rounded-xl flex justify-between items-center">
            <span className="text-[10px] uppercase text-[var(--theme-text-muted)] font-bold tracking-widest">{t('new_price')}</span>
            <span className="text-lg font-bold text-white">₼{(() => {
              const p = products.find(prod => prod.id === form.target_id);
              const disc = parseFloat(form.discount_value) || 0;
              return p ? (p.price * (1 - disc / 100)).toFixed(2) : '0.00';
            })()}</span>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-secondary)] font-semibold flex items-center gap-2">
            <CalendarOff size={11} />{t('end_date_optional')}
          </label>
          <GoldCalendar value={form.end_date} min={new Date().toISOString().split('T')[0]} onChange={(val) => onFormChange({...form, end_date: val})} />
          {form.end_date && <p className="text-[10px] text-[var(--theme-text-muted)]">{t('campaign_auto_deactivate')}</p>}
        </div>
      </div>
    </form>
  );

  if (typeof document === 'undefined') return null;
  const layoutId = campaign ? `campaign-${campaign.id}` : `campaign-new`;

  return createPortal(
    <>
      {/* ── MOBILE: slide-in from right ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="campaign-mobile"
            layoutId={layoutId}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 300 }}
            className="fixed inset-0 z-[120] flex flex-col bg-card md:hidden"
            style={{ overflowY: 'auto' }}
          >
            {/* Mobile Header */}
            <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.08] bg-card">
              <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-lg bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-all">
                <ChevronLeft size={20} />
              </button>
              <div className="flex-1 text-center">
                <h2 className="text-[15px] font-serif font-bold text-white">{campaign ? t('edit_campaign') : t('new_campaign')}</h2>
                <p className="text-[8px] uppercase tracking-[0.2em] text-gold/60 mt-0.5">{t('premium_marketing')}</p>
              </div>
              <div className="w-9" />
            </div>

            {/* Mobile Body */}
            <div className="flex-1 pb-28">
              {formBody}
            </div>

            {/* Mobile Footer */}
            <div className="fixed bottom-0 inset-x-0 px-4 pb-7 pt-3 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/95 to-transparent z-10">
              <button
                type="button" onClick={onSubmit as any} disabled={isSubmitting}
                className="w-full py-3.5 rounded-xl font-bold tracking-[0.1em] uppercase transition-all flex items-center justify-center gap-2 disabled:opacity-40 bg-[var(--theme-accent)] text-black border border-[var(--theme-accent-border)]"
              >
                {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : campaign ? <Save size={18} /> : <Zap size={18} />}
                {campaign ? t('edit_campaign').toUpperCase() : t('new_campaign').toUpperCase()}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── DESKTOP: centered modal ── */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[120] hidden md:flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={onClose}
            />
            <motion.div
              layoutId={layoutId}
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16, transition: { duration: 0.12, ease: 'easeOut' } }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="relative w-full max-w-xl rounded-2xl bg-card border border-white/[0.08] shadow-2xl overflow-y-auto max-h-[90vh]"
              onClick={e => e.stopPropagation()}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-card border-b border-white/[0.06]">
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-white">{campaign ? t('edit_campaign') : t('new_campaign')}</h2>
                  <p className="text-[9px] text-[var(--theme-text-muted)] uppercase tracking-[0.3em]">{t('premium_marketing')}</p>
                </div>
                <button onClick={onClose} className="w-8 h-8 rounded-lg bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] flex items-center justify-center text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-panel)] transition-all">
                  <X size={16} />
                </button>
              </div>
              {formBody}
              <div className="sticky bottom-0 px-5 py-3.5 bg-card border-t border-white/[0.06]">
                <button type="button" onClick={onSubmit as any} disabled={isSubmitting}
                  className="w-full py-3 rounded-xl font-bold tracking-[0.1em] uppercase transition-all flex items-center justify-center gap-2 disabled:opacity-40 bg-[var(--theme-accent)] text-black border border-[var(--theme-accent-border)]"
                >
                  {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : campaign ? <Save size={18} /> : <Zap size={18} />}
                  {campaign ? t('edit_campaign').toUpperCase() : t('new_campaign').toUpperCase()}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>,
    document.body
  );
};

export default CampaignModal;
