'use client';

import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Upload, Sparkles, Flame, ChevronLeft, Bot, X, Wand2, Plus, Trash2, Ruler, Zap, Tag, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import type { Product, Category } from '@/types';
import { useModalFormDirty } from '@/hooks/useFormDirty';
import { useAiFlags } from '@/hooks/useAiFlags';
import { supabase } from '@/lib/supabase';

// Variant types matching desktop
interface ProductVariantForm {
  id?: string;
  name: string;
  price: string;
  is_default: boolean;
  variant_type: 'olcu' | 'nov';
  translations?: { az?: { name: string }; en?: { name: string }; ru?: { name: string } } | null;
}

interface ProductModifierForm {
  id?: string;
  name: string;
  price: string;
  is_available: boolean;
}

interface ProductFormState {
  name: string;
  category_id: string;
  price: string;
  image_url: string;
  description: string;
  ingredients: string;
  is_in_stock: boolean;
  is_special: boolean;
  is_spicy: boolean;
  variants: ProductVariantForm[];
  modifiers: ProductModifierForm[];
}

interface Props {
  open: boolean;
  editingProduct: Product | null;
  productForm: ProductFormState;
  categories: Category[];
  isLikelyDrink: boolean;
  updating: boolean;
  aiGenerating: boolean;
  onClose: () => void;
  onFormChange: React.Dispatch<React.SetStateAction<any>>;
  onSubmit: (e: React.FormEvent) => void;
  onAiGenerate: () => void;
}

// Variant Selector - Same as desktop
function VariantSelector({
  variants,
  onChange,
}: {
  variants: ProductVariantForm[];
  onChange: (v: ProductVariantForm[]) => void;
}) {
  const [translatingIdx, setTranslatingIdx] = useState<number | null>(null);
  const { t, language } = useLanguage();

  const updateRow = (i: number, patch: Partial<ProductVariantForm>) => {
    onChange(variants.map((v, idx) => idx === i ? { ...v, ...patch } : v));
  };

  const autoTranslateOlcu = async (i: number, name: string) => {
    if (!name.trim()) return;
    setTranslatingIdx(i);
    const langNameMap: Record<string, string> = { az: 'Azerbaijani', en: 'English', ru: 'Russian' };
    const sourceLang = langNameMap[language] ?? 'Azerbaijani';
    try {
      const res = await fetch('/api/translate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { name }, languages: ['Azerbaijani', 'English', 'Russian'], sourceLanguage: sourceLang }),
      });
      if (!res.ok) return;
      const d = await res.json();
      const tr: Record<string, { name: string }> = {};
      if (d.result?.Azerbaijani?.name) tr.az = { name: d.result.Azerbaijani.name };
      if (d.result?.English?.name) tr.en = { name: d.result.English.name };
      if (d.result?.Russian?.name) tr.ru = { name: d.result.Russian.name };
      if (Object.keys(tr).length) updateRow(i, { name: tr.az?.name || name, translations: tr });
    } catch { /* silent */ } finally { setTranslatingIdx(null); }
  };

  const removeRow = (i: number) => {
    const next = variants.filter((_, idx) => idx !== i);
    if (next.length > 0 && !next.some(v => v.is_default)) next[0].is_default = true;
    onChange(next);
  };

  const addOlcu = () => {
    const isFirst = variants.length === 0;
    const newOlcu: ProductVariantForm = { name: '', price: '', is_default: isFirst, variant_type: 'olcu' };
    onChange([...variants, newOlcu]);
  };

  const setDefault = (i: number) => {
    onChange(variants.map((v, idx) => ({ ...v, is_default: idx === i })));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <Ruler size={12} className="text-white/30" />
        <span className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-semibold">{t('variant_type_tab')}</span>
      </div>
      {variants.length === 0 && <p className="text-[11px] text-white/25 italic py-1">{t('variant_no_olcu')}</p>}
      {variants.length > 0 && (
        <div className="flex items-center gap-1.5 px-1 mb-1">
          <span className="text-[9px] uppercase tracking-widest text-white/20">{t('combo_default_variant')}:</span>
        </div>
      )}
      <AnimatePresence>
        {variants.map((v, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.14 }} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDefault(i)}
              title={t('combo_default_variant')}
              className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                v.is_default ? 'border-gold bg-gold/20' : 'border-white/20 hover:border-gold/50'
              }`}
            >
              {v.is_default && <span className="w-2 h-2 rounded-full bg-gold block" />}
            </button>
            <div className="relative flex-1">
              <input type="text" value={v.name}
                onChange={(e) => updateRow(i, { name: e.target.value, translations: null })}
                onBlur={(e) => autoTranslateOlcu(i, e.target.value)}
                placeholder={t('variant_size_placeholder')}
                className="w-full bg-white/[0.07] border border-white/[0.12] rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/35 transition-all" />
              {translatingIdx === i && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  <Loader2 size={10} className="animate-spin text-white/50" />
                </span>
              )}
            </div>
            <input type="number" step="0.01" min="0" value={v.price} onChange={(e) => updateRow(i, { price: e.target.value })} placeholder="₼"
              className="w-20 bg-white/[0.07] border border-white/[0.12] rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/35 transition-all" />
            <button type="button" onClick={() => removeRow(i)}
              className="flex-shrink-0 w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center transition-all"><Trash2 size={12} /></button>
          </motion.div>
        ))}
      </AnimatePresence>
      <button type="button" onClick={addOlcu}
        className="flex items-center gap-2 mt-2 px-4 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.12] text-white/40 hover:text-white/70 text-[11px] font-bold uppercase tracking-widest transition-all">
        <Plus size={13} /> {t('variant_add_olcu')}
      </button>
    </div>
  );
}

// Modifier Selector - Same as desktop
function ModifierSelector({
  modifiers,
  onChange,
}: {
  modifiers: ProductModifierForm[];
  onChange: (m: ProductModifierForm[]) => void;
}) {
  const { t } = useLanguage();

  const updateRow = (i: number, patch: Partial<ProductModifierForm>) => {
    onChange(modifiers.map((m, idx) => idx === i ? { ...m, ...patch } : m));
  };

  const removeRow = (i: number) => onChange(modifiers.filter((_, idx) => idx !== i));

  const addModifier = () => onChange([...modifiers, { name: '', price: '0', is_available: true }]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <Zap size={12} className="text-white/30" />
        <span className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-semibold">{t('modifiers_section')}</span>
      </div>
      {modifiers.length === 0 && <p className="text-[11px] text-white/25 italic py-1">{t('modifiers_empty')}</p>}
      <AnimatePresence>
        {modifiers.map((m, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.14 }} className="flex items-center gap-2">
            <input type="text" value={m.name} onChange={(e) => updateRow(i, { name: e.target.value })} placeholder={t('modifier_name_placeholder')}
              className="flex-1 bg-white/[0.07] border border-white/[0.12] rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/35 transition-all" />
            <input type="number" step="0.01" min="0" value={m.price} onChange={(e) => updateRow(i, { price: e.target.value })} placeholder="₼"
              className="w-20 bg-white/[0.07] border border-white/[0.12] rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/35 transition-all" />
            <button type="button" onClick={() => removeRow(i)}
              className="flex-shrink-0 w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center transition-all"><Trash2 size={12} /></button>
          </motion.div>
        ))}
      </AnimatePresence>
      <button type="button" onClick={addModifier}
        className="flex items-center gap-2 mt-2 px-4 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.12] text-white/40 hover:text-white/70 text-[11px] font-bold uppercase tracking-widest transition-all">
        <Plus size={13} /> {t('modifier_add')}
      </button>
    </div>
  );
}


export default function DashboardProductModal({
  open,
  editingProduct,
  productForm,
  categories,
  isLikelyDrink,
  updating,
  aiGenerating,
  onClose,
  onFormChange,
  onSubmit,
  onAiGenerate,
}: Props) {
  const { t, language } = useLanguage();
  const { flags: aiFlags } = useAiFlags();
  const [nameError, setNameError] = useState(false);
  const [priceError, setPriceError] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [visionLoading, setVisionLoading] = useState(false);
  const [ghost, setGhost] = useState<{ name?: string; description?: string; ingredients?: string } | null>(null);
  const orbRef = useRef<HTMLDivElement>(null);

  const { isDirty } = useModalFormDirty(productForm, open, editingProduct?.id);

  const closeWithReset = () => { onClose(); setNameError(false); setPriceError(false); setGhost(null); setVisionLoading(false); };

  const normalizeProductName = (name: string) =>
    name.trim().replace(/\s+/g, ' ').replace(/^(.)/, (m: string) => m.toUpperCase());

  const resizeToBase64 = (file: File, maxPx = 256): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
      img.src = url;
    });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploadingImage(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const [uploadResult, base64] = await Promise.all([
        supabase.storage.from('product-images').upload(path, file, { upsert: true }),
        resizeToBase64(file),
      ]);
      if (uploadResult.error) throw uploadResult.error;
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path);
      onFormChange((prev: ProductFormState) => ({ ...prev, image_url: publicUrl }));
      setUploadingImage(false);
      if (aiFlags.visionEnabled) {
        setVisionLoading(true);
        try {
          const visionRes = await fetch('/api/vision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageUrl: base64, language }) });
          const visionData = await visionRes.json();
          const rawName = visionData.name || '';
          const hintName = rawName ? (aiFlags.autoCorrectEnabled ? normalizeProductName(rawName) : rawName) : '';
          const hintDesc = visionData.description || '';
          const hintIngr = visionData.ingredients || '';
          if (hintName || hintDesc || hintIngr) {
            setGhost({ ...(hintName ? { name: hintName } : {}), ...(hintDesc ? { description: hintDesc } : {}), ...(hintIngr ? { ingredients: hintIngr } : {}) });
          }
        } catch { /* silent */ } finally { setVisionLoading(false); }
      }
    } catch { /* silent */ } finally { setUploadingImage(false); }
  };

  const applyGhost = () => {
    if (!ghost) return;
    const patch: Partial<ProductFormState> = {};
    if (ghost.name && !productForm.name.trim()) patch.name = ghost.name;
    if (ghost.description) patch.description = ghost.description;
    if (ghost.ingredients) patch.ingredients = ghost.ingredients;
    onFormChange((prev: ProductFormState) => ({ ...prev, ...patch }));
    setGhost(null);
  };

  const getCategoryName = (cat: Category) => {
    return (cat as any)[`name_${language}`] || (typeof cat.name === 'string' ? cat.name : (cat.name as any)?.az || cat.name);
  };

  // Sync price from default variant
  const hasVariants = productForm.variants.length > 0;
  const defaultVariant = productForm.variants.find(v => v.is_default);
  const displayPrice = hasVariants && defaultVariant?.price ? defaultVariant.price : productForm.price;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="fixed inset-0 z-[110] md:hidden bg-[#0a0a0a]"
        >
          {/* Header */}
          <div className="sticky top-0 z-10 px-5 pt-14 pb-4 bg-gradient-to-b from-[#0a0a0a] to-transparent">
            <button onClick={closeWithReset} className="absolute top-12 left-5 w-10 h-10 flex items-center justify-center rounded-full bg-white/[0.05] text-white/60 hover:text-white hover:bg-white/[0.1] transition-all">
              <ChevronLeft size={22} />
            </button>
            <div className="text-center">
              <p className="text-[10px] text-white/40 uppercase tracking-[0.4em] mb-1">{t('premium_collection')}</p>
              <h1 className="text-2xl font-serif text-white tracking-tight">{editingProduct ? t('edit_product') : t('new_product')}</h1>
            </div>
          </div>

          {/* Form */}
          <form id="dashboard-product-form" noValidate onSubmit={onSubmit} className="px-5 pb-32 space-y-6 overflow-y-auto h-[calc(100vh-140px)]">
            
            {/* Name Input - Same as desktop */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-widest text-white/40">{t('product_name_label')}</label>
              <div className="relative">
                <input
                  type="text"
                  value={productForm.name}
                  onChange={(e) => { onFormChange((p: ProductFormState) => ({ ...p, name: e.target.value })); if (nameError) setNameError(false); }}
                  onBlur={(e) => { const c = normalizeProductName(e.target.value); if (c !== e.target.value) onFormChange((p: ProductFormState) => ({ ...p, name: c })); }}
                  placeholder={ghost?.name ? '' : t('product_name_label')}
                  className={`w-full bg-white/[0.07] border rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none transition-all ${nameError ? 'border-red-500/70 focus:border-red-400' : 'border-white/[0.12] focus:border-white/35'}`}
                />
                <AnimatePresence>
                  {ghost?.name && !productForm.name && (
                    <motion.div initial="hidden" animate="visible" exit={{ opacity: 0 }} variants={{ visible: { transition: { staggerChildren: 0.04 } } }} className="absolute inset-0 flex items-center px-4 pointer-events-none overflow-hidden gap-[0.28em]">
                      {ghost.name.split(' ').map((word, i) => (
                        <motion.span key={i} variants={{ hidden: { opacity: 0, x: -6 }, visible: { opacity: 1, x: 0 } }} transition={{ duration: 0.22 }} className="text-sm text-white/30 italic shrink-0">{word}</motion.span>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {nameError && <p className="text-[10px] text-red-400 mt-1">{t('product_name_required')}</p>}
            </div>

            {/* Price */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-widest text-white/40">
                {t('price_label')}
                {hasVariants && <span className="ml-1.5 text-gold/60 normal-case tracking-normal">({t('price_from_variant')})</span>}
              </label>
              <input
                type="number" step="0.01" min="0.01"
                value={displayPrice}
                readOnly={hasVariants}
                onChange={(e) => { if (hasVariants) return; onFormChange((p: ProductFormState) => ({ ...p, price: e.target.value })); if (priceError) setPriceError(false); }}
                className={`w-full border rounded-xl px-4 py-3 text-sm placeholder:text-white/30 outline-none transition-all ${
                  hasVariants ? 'bg-white/[0.03] border-white/[0.06] text-gold/80 cursor-default' : priceError ? 'bg-white/[0.07] border-red-500/70 focus:border-red-400 text-white' : 'bg-white/[0.07] border-white/[0.12] focus:border-white/35 text-white'
                }`}
              />
              {priceError && <p className="text-[10px] text-red-400 mt-1">{t('price_required')}</p>}
            </div>

            {/* Category */}
            <div className="space-y-3">
              <p className="text-[9px] uppercase tracking-[0.3em] text-white/20 font-bold flex items-center gap-2">
                <span className="w-4 h-px bg-white/10" />{t('product_category')}<span className="flex-1 h-px bg-white/5" />
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
                {categories.map(cat => (
                  <button key={cat.id} type="button" onClick={() => onFormChange((p: ProductFormState) => ({ ...p, category_id: cat.id }))}
                    className={`shrink-0 px-3.5 py-1.5 rounded-xl text-[11px] font-bold tracking-wider uppercase border transition-all ${productForm.category_id === cat.id ? 'bg-white/10 text-white border-white/30' : 'bg-white/[0.05] text-white/40 border-white/[0.12]'}`}>
                    <Tag size={11} className="inline mr-1.5 -mt-0.5" />
                    {getCategoryName(cat)}
                  </button>
                ))}
              </div>
            </div>

            {/* AI Hint + Image + Description + Ingredients */}
            <div className="space-y-3">
              <p className="text-[9px] uppercase tracking-[0.3em] text-white/20 font-bold flex items-center gap-2">
                <span className="w-4 h-px bg-white/10" />{t('sales_params_section')}<span className="flex-1 h-px bg-white/5" />
              </p>
              
              {/* AI Hint Card */}
              <AnimatePresence>
                {(uploadingImage || visionLoading || (ghost && Object.keys(ghost).length > 0)) && (
                  <motion.div initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} className="mb-3">
                    {(uploadingImage || visionLoading) ? (
                      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.07]">
                        <div className="shrink-0 flex items-end gap-[3px] pb-0.5">
                          {[0, 0.15, 0.3].map((delay, i) => (
                            <motion.span key={i} animate={{ y: [0, -4, 0], opacity: [0.25, 0.6, 0.25] }} transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut', delay }} className="block rounded-full bg-white/40" style={{ width: i === 1 ? 5 : 4, height: i === 1 ? 5 : 4 }} />
                          ))}
                        </div>
                        <div>
                          <p className="text-[11px] font-medium text-white/50 leading-tight">{t('vision_analyzing')}</p>
                          <p className="text-[9px] text-white/20 uppercase tracking-[0.2em] mt-0.5">{t('vision_reading')}</p>
                        </div>
                      </div>
                    ) : (
                      <motion.div ref={orbRef} animate={{ y: [0, -2, 0], boxShadow: ['0 0 0px rgba(212,175,55,0)', '0 0 18px rgba(212,175,55,0.18)', '0 0 0px rgba(212,175,55,0)'] }} transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }} className="group relative flex items-center gap-3 px-4 py-3 rounded-2xl border border-white/10 overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}>
                        <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.2), 0 0 24px rgba(255,255,255,0.05)' }} />
                        <motion.div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent -skew-x-12 pointer-events-none" animate={{ x: ['-120%', '220%'] }} transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 2, ease: 'easeInOut' }} />
                        <motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }} className="shrink-0"><Bot size={15} className="text-white/60" /></motion.div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] text-white/60 uppercase tracking-[0.22em] font-bold leading-tight">{t('ai_hint_ready_title')}</p>
                          <p className="text-[11px] text-white/55 mt-0.5 leading-tight">{t('ai_hint_ready_desc')}</p>
                        </div>
                        <motion.button type="button" whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }} onClick={applyGhost} className="shrink-0 relative overflow-hidden flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/20 text-[var(--foreground)] text-[9px] font-bold uppercase tracking-wider transition-opacity duration-200">
                          <motion.span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 pointer-events-none" animate={{ x: ['-130%', '230%'] }} transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 1.2, ease: 'easeInOut' }} />
                          <Wand2 size={9} /> {t('ai_hint_apply')}
                        </motion.button>
                        <button type="button" onClick={() => setGhost(null)} className="shrink-0 w-7 h-7 flex items-center justify-center rounded-xl text-white/20 hover:text-white/55 hover:bg-white/[0.05] transition-all"><X size={13} /></button>
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Image + Description + Ingredients Grid */}
              <div className="grid grid-cols-[auto_1fr] gap-3">
                {/* Image Upload */}
                <div className="relative group">
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="product-image-upload" />
                  <label htmlFor="product-image-upload" className="w-24 h-24 rounded-xl bg-white/[0.02] border-2 border-dashed border-white/10 flex items-center justify-center hover:border-white/30 hover:bg-white/[0.05] transition-all cursor-pointer overflow-hidden relative">
                    {uploadingImage ? (
                      <svg width="32" height="32" viewBox="0 0 32 32" className="animate-spin">
                        <circle cx="16" cy="16" r="12" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2.5"/>
                        <circle cx="16" cy="16" r="12" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="28 50" style={{filter:'drop-shadow(0 0 6px rgba(255,255,255,0.3))'}}/></svg>
                    ) : productForm.image_url ? (
                      <>
                        <img src={productForm.image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))' }} />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-center justify-center">
                          <Upload size={18} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-1.5">
                        <Upload size={20} className="text-gold/40" />
                        <span className="text-[8px] uppercase font-bold tracking-widest text-white/20">{t('select_file')}</span>
                      </div>
                    )}
                  </label>
                </div>

                {/* Description + Ingredients */}
                <div className="space-y-2.5">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] uppercase tracking-widest text-white/40">{t('product_description_label')}</label>
                      <button
                        type="button"
                        onClick={onAiGenerate}
                        disabled={aiGenerating || !productForm.name.trim()}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gold/10 border border-gold/30 text-gold text-[9px] font-bold uppercase tracking-wider disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:bg-gold/20 active:scale-95"
                      >
                        {aiGenerating ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <Sparkles size={11} />
                        )}
                        {aiGenerating ? 'Yazır...' : 'AI ilə'}
                      </button>
                    </div>
                    <div className="relative">
                      <textarea
                        value={productForm.description}
                        onChange={(e) => { if (e.target.value.length <= 150) onFormChange((p: ProductFormState) => ({ ...p, description: e.target.value })); }}
                        onBlur={async (e) => {
                          const val = e.target.value.trim(); if (!val) return;
                          try {
                            const res = await fetch('/api/correct-name', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: val, language }) });
                            if (res.ok) { const d = await res.json(); if (d.corrected && d.corrected !== val) onFormChange((p: ProductFormState) => ({ ...p, description: d.corrected })); }
                          } catch { /* silent */ }
                        }}
                        placeholder={ghost?.description ? '' : t('description_placeholder')}
                        className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-2 pb-5 text-sm text-white placeholder:text-white/15 focus:border-white/30 outline-none h-[72px] resize-y min-h-[52px] max-h-[160px]"
                      />
                      <AnimatePresence>
                        {ghost?.description && !productForm.description && (
                          <motion.div initial="hidden" animate="visible" exit={{ opacity: 0, y: 4 }} variants={{ visible: { transition: { staggerChildren: 0.03 } } }} className="absolute inset-0 px-3.5 py-2 pb-5 pointer-events-none flex flex-wrap content-start gap-x-[0.28em]">
                            {ghost.description.split(' ').map((word, i) => (
                              <motion.span key={i} variants={{ hidden: { opacity: 0, x: -5 }, visible: { opacity: 1, x: 0 } }} transition={{ duration: 0.2 }} className="text-sm text-white/30 italic leading-snug">{word}</motion.span>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <span className={`absolute bottom-2 right-3 text-[9px] font-mono ${productForm.description.length > 130 ? 'text-white' : productForm.description.length > 100 ? 'text-white/30' : 'text-white/15'}`}>
                        {productForm.description.length}/150
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-widest text-white/40">{t('ingredients_label')}</label>
                    <div className="relative">
                      <textarea
                        value={productForm.ingredients}
                        onChange={(e) => onFormChange((p: ProductFormState) => ({ ...p, ingredients: e.target.value }))}
                        onBlur={async (e) => {
                          const val = e.target.value.trim(); if (!val) return;
                          try {
                            const res = await fetch('/api/correct-name', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: val, language }) });
                            if (res.ok) { const d = await res.json(); if (d.corrected && d.corrected !== val) onFormChange((p: ProductFormState) => ({ ...p, ingredients: d.corrected })); }
                          } catch { /* silent */ }
                        }}
                        placeholder={ghost?.ingredients ? '' : 'Somon, avokado, krem pendir, kəndir toxumu...'}
                        className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white placeholder:text-white/15 focus:border-white/30 outline-none h-[38px] resize-none"
                      />
                      <AnimatePresence>
                        {ghost?.ingredients && !productForm.ingredients && (
                          <motion.div initial="hidden" animate="visible" exit={{ opacity: 0, y: 4 }} variants={{ visible: { transition: { staggerChildren: 0.025 } } }} className="absolute inset-0 px-3.5 py-2 pointer-events-none flex flex-wrap content-start gap-x-[0.28em]">
                            {ghost.ingredients.split(' ').map((word, i) => (
                              <motion.span key={i} variants={{ hidden: { opacity: 0, x: -5 }, visible: { opacity: 1, x: 0 } }} transition={{ duration: 0.2 }} className="text-sm text-white/30 italic">{word}</motion.span>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Flags */}
            <div className="flex flex-wrap items-center gap-2 pb-1">
              <label className={`shrink-0 flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-[11px] font-bold tracking-wider uppercase border cursor-pointer select-none ${productForm.is_in_stock ? 'bg-green-500/15 text-green-400 border-green-500/40 shadow-[0_0_15px_rgba(34,197,94,0.15)]' : 'bg-white/[0.05] text-white/40 border-white/[0.12]'}`}>
                <input type="checkbox" checked={productForm.is_in_stock} onChange={(e) => onFormChange((p: ProductFormState) => ({ ...p, is_in_stock: e.target.checked }))} className="hidden" />
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-transform ${productForm.is_in_stock ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)]' : 'bg-white/20'}`} />
                {t('in_stock_label')}
              </label>
              <AnimatePresence initial={false}>
                {!isLikelyDrink && (
                  <motion.label key="chefs-special" initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }} className={`shrink-0 flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-[11px] font-bold tracking-wider uppercase border cursor-pointer ${productForm.is_special ? 'bg-gold/15 text-gold border-gold/40 shadow-[0_0_12px_rgba(212,175,55,0.12)]' : 'bg-white/[0.05] text-white/40 border-white/[0.12]'}`}>
                    <input type="checkbox" checked={productForm.is_special} onChange={(e) => onFormChange((p: ProductFormState) => ({ ...p, is_special: e.target.checked }))} className="hidden" />
                    <Sparkles size={11} className={productForm.is_special ? 'text-gold' : 'text-white/25'} />
                    {t('chefs_special')}
                  </motion.label>
                )}
                {!isLikelyDrink && (
                  <motion.label key="spicy" initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }} className={`shrink-0 flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-[11px] font-bold tracking-wider uppercase border cursor-pointer ${productForm.is_spicy ? 'bg-red-500/15 text-red-400 border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.15)]' : 'bg-white/[0.05] text-white/40 border-white/[0.12]'}`}>
                    <input type="checkbox" checked={productForm.is_spicy} onChange={(e) => onFormChange((p: ProductFormState) => ({ ...p, is_spicy: e.target.checked }))} className="hidden" />
                    <Flame size={11} className={productForm.is_spicy ? 'text-red-400' : 'text-white/25'} />
                    {t('spicy_label')}
                  </motion.label>
                )}
              </AnimatePresence>
            </div>

            {/* Variants */}
            <div className="space-y-3">
              <p className="text-[9px] uppercase tracking-[0.3em] text-white/20 font-bold flex items-center gap-2">
                <span className="w-4 h-px bg-white/10" />{t('variants_section')}<span className="flex-1 h-px bg-white/5" />
              </p>
              <VariantSelector variants={productForm.variants} onChange={(v) => {
                const defaultV = v.find(x => x.is_default);
                const syncedPrice = defaultV?.price && !isNaN(parseFloat(defaultV.price)) ? defaultV.price : productForm.price;
                onFormChange((p: ProductFormState) => ({ ...p, variants: v, price: syncedPrice }));
              }} />
            </div>

            {/* Modifiers */}
            <div className="space-y-3">
              <p className="text-[9px] uppercase tracking-[0.3em] text-white/20 font-bold flex items-center gap-2">
                <span className="w-4 h-px bg-white/10" />{t('modifiers_section')}<span className="flex-1 h-px bg-white/5" />
              </p>
              <ModifierSelector modifiers={productForm.modifiers} onChange={(m) => onFormChange((p: ProductFormState) => ({ ...p, modifiers: m }))} />
            </div>
          </form>

          {/* Fixed Bottom Save Button */}
          <div className="fixed bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a] to-transparent">
            <div className="flex items-center gap-3">
              <button type="button" onClick={closeWithReset} className="px-6 py-3.5 rounded-xl bg-white/[0.05] text-white/40 border border-white/[0.12] hover:bg-white/10 hover:text-white text-[10px] font-bold tracking-wide uppercase whitespace-nowrap transition-all">
                {t('cancel') || 'LƏĞV ET'}
              </button>
              <button type="submit" form="dashboard-product-form" disabled={updating || uploadingImage || !isDirty}
                className={`flex-1 py-3.5 rounded-xl bg-gradient-to-r from-gold via-[#E7C85A] to-gold text-black font-bold tracking-[0.25em] text-[11px] uppercase hover:brightness-110 transition-all shadow-lg shadow-gold/10 flex items-center justify-center gap-3 disabled:opacity-50 ${!isDirty && !updating ? 'opacity-35 pointer-events-none' : ''}`}>
                {updating ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
                {editingProduct ? t('save_changes') : t('add_product_btn')}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

