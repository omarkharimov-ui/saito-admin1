'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Tag, X, Upload, Loader2, Sparkles, Wand2, Flame, Plus, Trash2, Ruler, Bot, Zap, ChevronLeft, PackagePlus, ScrollText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { supabase } from '@/lib/supabase';
import { Product, Category } from '@/types';
import type { ProductVariantForm, ProductModifierForm } from '../page';
import { useModalFormDirty } from '@/hooks/useFormDirty';
import { useAiFlags } from '@/hooks/useAiFlags';
import { SaveSuccessButton } from '@/components/premium/PremiumComponents';

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
    const newOlcu: ProductVariantForm = { name: '', price: '', is_default: isFirst, variant_type: 'olcu' as const };
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
            {/* Default radio */}
            <button
              type="button"
              onClick={() => setDefault(i)}
              title={t('combo_default_variant')}
              className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                v.is_default
                  ? 'border-gold bg-gold/20'
                  : 'border-white/20 hover:border-gold/50'
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
        className="flex items-center gap-2 mt-2 px-4 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.12] text-[var(--theme-text-muted)] hover:text-white/70 text-[11px] font-bold uppercase tracking-widest transition-all">
        <Plus size={13} /> {t('variant_add_olcu')}
      </button>
    </div>
  );
}


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

  const removeRow = (i: number) => {
    onChange(modifiers.filter((_, idx) => idx !== i));
  };

  const addModifier = () => {
    onChange([...modifiers, { name: '', price: '0', is_available: true }]);
  };

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
            <input
              type="text"
              value={m.name}
              onChange={(e) => updateRow(i, { name: e.target.value })}
              placeholder={t('modifier_name_placeholder')}
              className="flex-1 bg-white/[0.07] border border-white/[0.12] rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/35 transition-all"
            />
            <input
              type="number" step="0.01" min="0"
              value={m.price}
              onChange={(e) => updateRow(i, { price: e.target.value })}
              placeholder="₼"
              className="w-20 bg-white/[0.07] border border-white/[0.12] rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/35 transition-all"
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="flex-shrink-0 w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center transition-all"
            >
              <Trash2 size={12} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
      <button
        type="button"
        onClick={addModifier}
        className="flex items-center gap-2 mt-2 px-4 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.12] text-[var(--theme-text-muted)] hover:text-white/70 text-[11px] font-bold uppercase tracking-widest transition-all"
      >
        <Plus size={13} /> {t('modifier_add')}
      </button>
    </div>
  );
}

interface ProductForm {
  name: string;
  category_id: string;
  price: string;
  image_url: string;
  description: string;
  ingredients: string;
  is_in_stock: boolean;
  is_special: boolean;
  is_spicy: boolean;
  is_ready_product: boolean;
  direct_ingredient_id: string;
  name_en: string;
  name_ru: string;
  description_en: string;
  description_ru: string;
  ingredients_en: string;
  ingredients_ru: string;
  variants: ProductVariantForm[];
  modifiers: ProductModifierForm[];
}

interface ProductModalProps {
  open: boolean;
  editingProduct: Product | null;
  productForm: ProductForm;
  categories: Category[];
  isDrinkCategory: boolean;
  isNonSpicyCategory: boolean;
  updating: boolean;
  nameError: boolean;
  priceError: boolean;
  onClose: () => void;
  onFormChange: (form: ProductForm) => void;
  onNameErrorChange: (v: boolean) => void;
  onPriceErrorChange: (v: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
  getCategoryName: (cat: Category) => string;
  normalizeProductName: (name: string) => string;
}

export function ProductModal({
  open, editingProduct, productForm, categories,
  isDrinkCategory, isNonSpicyCategory, updating,
  nameError, priceError,
  onClose, onFormChange, onNameErrorChange, onPriceErrorChange,
  onSubmit, getCategoryName, normalizeProductName,
}: ProductModalProps) {
  const { t, language } = useLanguage();
  const router = useRouter();
  
  // Use global hook for dirty checking - exclude category for new products
  // so initial category selection doesn't trigger dirty state
  const isNewProduct = !editingProduct;
  const { isDirty } = useModalFormDirty(
    productForm,
    open,
    editingProduct?.id,
    isNewProduct ? ['category_id'] : []
  );

  const [uploadingImage, setUploadingImage] = useState(false);
  const [visionLoadingMain, setVisionLoadingMain] = useState(false);
  const [ghostMain, setGhostMain] = useState<{ name?: string; description?: string; ingredients?: string } | null>(null);
  const [aiAutoFillLoading, setAiAutoFillLoading] = useState(false);
  const orbMainRef = useRef<HTMLDivElement>(null);
  const productFormRef = useRef<ProductForm>(productForm);
  const { flags: aiFlags } = useAiFlags();
  productFormRef.current = productForm;

  // AI Auto-Fill: name daxil ediləndə description + ingredients + category təklif et
  const handleAiAutoFill = async () => {
    const name = productFormRef.current.name.trim();
    if (!name) return;
    setAiAutoFillLoading(true);
    try {
      const res = await fetch('/api/sensei', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName: name, language: 'az' }),
      });
      if (!res.ok) throw new Error('AI xətası');
      const data = await res.json();
      const current = productFormRef.current;
      const patch: Partial<ProductForm> = {};
      if (data.description && !current.description) patch.description = data.description;
      if (data.ingredients && !current.ingredients) patch.ingredients = data.ingredients;
      if (Object.keys(patch).length > 0) onFormChange({ ...current, ...patch });
      if (data.description || data.ingredients) {
        setGhostMain({
          name: undefined,
          description: data.description || undefined,
          ingredients: data.ingredients || undefined,
        });
      }
    } catch (e) {
      console.error('[ProductModal] AI Auto-Fill error:', e);
    } finally {
      setAiAutoFillLoading(false);
    }
  };

  // Hazır məhsul üçün ingredient dropdown
  const [ingredients, setIngredients] = useState<{ id: string; name: string; unit: string }[]>([]);
  useEffect(() => {
    if (!open) return;
    supabase.from('ingredients').select('id, name, unit').order('name').then(({ data }) => {
      setIngredients((data || []) as any[]);
    });
  }, [open]);

  // Recipe / cost info for recipe-based products
  const [recipeInfo, setRecipeInfo] = useState<{ count: number; totalCost: number } | null>(null);
  const [recipeLoading, setRecipeLoading] = useState(false);
  useEffect(() => {
    if (!open || !editingProduct || productForm.is_ready_product) {
      setRecipeInfo(null);
      return;
    }
    setRecipeLoading(true);
    supabase
      .from('recipes')
      .select('ingredient_id, quantity_brutto')
      .eq('menu_item_id', editingProduct.id)
      .eq('is_ai_suggested', false)
      .then(async ({ data }) => {
        if (!data || data.length === 0) {
          setRecipeInfo(null);
          setRecipeLoading(false);
          return;
        }
        const { data: ingData } = await supabase
          .from('ingredients')
          .select('id, average_cost_per_unit');
        const costMap = new Map((ingData || []).map(i => [i.id, i.average_cost_per_unit || 0]));
        const totalCost = data.reduce((sum, r) => sum + (costMap.get(r.ingredient_id) || 0) * (r.quantity_brutto || 0), 0);
        setRecipeInfo({ count: data.length, totalCost });
        setRecipeLoading(false);
      });
  }, [open, editingProduct, productForm.is_ready_product]);

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

  const handleMainImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      onFormChange({ ...productFormRef.current, image_url: publicUrl });
      if (aiFlags.visionEnabled) {
        setUploadingImage(false);
        setVisionLoadingMain(true);
        try {
          const visionRes = await fetch('/api/vision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageUrl: base64, language }) });
          const visionData = await visionRes.json();
          const rawName = visionData.name || '';
          const hintName = rawName ? (aiFlags.autoCorrectEnabled ? normalizeProductName(rawName) : rawName) : '';
          const hintDesc = visionData.description || '';
          const hintIngr = visionData.ingredients || '';
          if (hintName || hintDesc || hintIngr) {
            const newGhost = { ...(hintName ? { name: hintName } : {}), ...(hintDesc ? { description: hintDesc } : {}), ...(hintIngr ? { ingredients: hintIngr } : {}) };
            setGhostMain(newGhost);
          }
        } catch (e) { 
          console.error('[ProductModal] Vision error:', e);
        } finally { setVisionLoadingMain(false); }
      }
    } catch { /* silent */ } finally { setUploadingImage(false); }
  };

  const applyGhostMain = () => {
    if (!ghostMain) return;
    const current = productFormRef.current;
    const patch: Partial<ProductForm> = {};
    if (ghostMain.name && !current.name.trim()) {
      patch.name = ghostMain.name;
      if (language === 'en') patch.name_en = ghostMain.name;
      else if (language === 'ru') patch.name_ru = ghostMain.name;
    }
    if (ghostMain.description && !current.description?.trim()) {
      patch.description = ghostMain.description;
      if (language === 'en') patch.description_en = ghostMain.description;
      else if (language === 'ru') patch.description_ru = ghostMain.description;
    }
    if (ghostMain.ingredients && !current.ingredients?.trim()) {
      patch.ingredients = ghostMain.ingredients;
      if (language === 'en') patch.ingredients_en = ghostMain.ingredients;
      else if (language === 'ru') patch.ingredients_ru = ghostMain.ingredients;
    }
    if (Object.keys(patch).length > 0) onFormChange({ ...current, ...patch });
    setGhostMain(null);
  };

  const dismissGhostMain = () => {
    setGhostMain(null);
  };

  const closeWithReset = () => { onClose(); onNameErrorChange(false); onPriceErrorChange(false); setGhostMain(null); setVisionLoadingMain(false); };

  const triggerSave = (formId: string) => {
    if (updating || uploadingImage || !isDirty) return;
    const form = document.getElementById(formId) as HTMLFormElement | null;
    form?.requestSubmit();
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* ── DESKTOP modal (md+) ── */}
          <div className="fixed inset-0 z-[110] hidden md:flex items-center justify-center p-4 xl:p-10">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} onClick={closeWithReset} className="absolute inset-0 bg-black/35 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 20 }} transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="relative w-full max-w-[860px] bg-card/98 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/60 flex flex-col max-h-[92vh] overflow-hidden"
            >
              <button onClick={closeWithReset} className="absolute top-5 right-5 z-10 w-10 h-10 rounded-full bg-white/8 hover:bg-white/15 text-white/50 hover:text-white flex items-center justify-center transition-all"><X size={18} /></button>
              <div className="flex flex-col flex-1 min-h-0">
                <div className="px-8 lg:px-12 pt-7 pb-0 shrink-0">
                  <h2 className="text-3xl font-serif font-bold mb-1 tracking-tight text-white">{editingProduct ? t('edit_product') : t('new_product')}</h2>
                  <p className="text-[10px] text-gold uppercase tracking-[0.4em] mb-5">{t('premium_collection')}</p>
                </div>
                <form id="product-modal-form" noValidate onSubmit={onSubmit} className="flex-1 overflow-y-auto px-8 lg:px-12 pb-4 space-y-5 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gold/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gold/40">
              {/* Group 1: Əsas Məlumatlar */}
              <div>
                <p className="text-[9px] uppercase tracking-[0.3em] text-white/20 font-bold mb-3 flex items-center gap-2">
                  <span className="w-4 h-px bg-[var(--theme-border)]" />
                  {t('basic_info_section')}
                  <span className="flex-1 h-px bg-[var(--theme-border)]" />
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-muted)]">{t('product_name_label')}</label>
                    <div className="relative flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={productForm.name}
                          onChange={(e) => { onFormChange({ ...productForm, name: e.target.value }); if (nameError) onNameErrorChange(false); }}
                          onBlur={(e) => {
                            const corrected = normalizeProductName(e.target.value);
                            if (corrected !== e.target.value) onFormChange({ ...productForm, name: corrected });
                          }}
                          placeholder={ghostMain?.name ? '' : t('product_name_label')}
                          className={`w-full bg-white/[0.07] border rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none transition-transform duration-300 ${nameError ? 'border-red-500/70 focus:border-red-400' : 'border-white/[0.12] focus:border-white/35'}`}
                        />
                        <AnimatePresence>
                          {ghostMain?.name && !productForm.name && (
                            <motion.div
                              initial="hidden" animate="visible"
                              exit={{ opacity: 0, y: 4, transition: { duration: 0.2 } }}
                              variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
                              className="absolute inset-0 flex items-center px-4 pointer-events-none overflow-hidden gap-[0.28em]"
                            >
                              {ghostMain.name.split(' ').map((word, i) => (
                                <motion.span key={i} variants={{ hidden: { opacity: 0, x: -6 }, visible: { opacity: 1, x: 0 } }} transition={{ duration: 0.22 }} className="text-sm text-white/30 italic shrink-0">
                                  {word}
                                </motion.span>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                      <button
                        type="button"
                        onClick={handleAiAutoFill}
                        disabled={aiAutoFillLoading || !productForm.name.trim()}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/25 text-purple-300 text-[10px] font-bold tracking-wider uppercase hover:brightness-110 transition-all disabled:opacity-30"
                      >
                        {aiAutoFillLoading ? (
                          <Loader2 size={12} className="animate-spin text-purple-300" />
                        ) : (
                          <Sparkles size={12} className="text-purple-300" />
                        )}
                        AI Doldur
                      </button>
                    </div>
                    {nameError && <p className="text-[10px] text-red-400 mt-1">{t('product_name_required')}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-muted)]">
                      {t('price_label')}
                      {productForm.variants.length > 0 && (
                        <span className="ml-1.5 text-gold/60 normal-case tracking-normal">{t('price_from_variant')}</span>
                      )}
                    </label>
                    <input
                      type="number" step="0.01" min="0.01"
                      value={productForm.price}
                      readOnly={productForm.variants.length > 0}
                      onChange={(e) => { if (productForm.variants.length > 0) return; onFormChange({ ...productForm, price: e.target.value }); if (priceError) onPriceErrorChange(false); }}
                      className={`w-full border rounded-xl px-4 py-2.5 text-sm placeholder:text-white/30 outline-none transition-all duration-300 ${
                        productForm.variants.length > 0
                          ? 'bg-white/[0.03] border-white/[0.06] text-gold/80 cursor-default'
                          : priceError
                            ? 'bg-white/[0.07] border-red-500/70 focus:border-red-400 text-white'
                            : 'bg-white/[0.07] border-white/[0.12] focus:border-white/35 text-white'
                      }`}
                    />
                    {priceError && <p className="text-[10px] text-red-400 mt-1">{t('price_required')}</p>}
                  </div>
                </div>
              </div>

              {/* Group 2: Kateqoriya */}
              <div>
                <p className="text-[9px] uppercase tracking-[0.3em] text-white/20 font-bold mb-3 flex items-center gap-2">
                  <span className="w-4 h-px bg-[var(--theme-border)]" />
                  {t('product_category')}
                  <span className="flex-1 h-px bg-[var(--theme-border)]" />
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
                  {categories.map(cat => (
                    <button key={cat.id} type="button" onClick={() => onFormChange({ ...productForm, category_id: cat.id })}
                      className={`shrink-0 px-3.5 py-1.5 rounded-xl text-[11px] font-bold tracking-wider uppercase border transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 ${productForm.category_id === cat.id ? 'bg-[var(--theme-surface-soft)] text-[var(--theme-text)] border-[var(--theme-border-strong)]' : 'bg-[var(--theme-surface-muted)] text-[var(--theme-text-secondary)] border-[var(--theme-border)] hover:bg-[var(--theme-surface-soft)] hover:text-[var(--theme-text)] hover:border-[var(--theme-border-strong)]'}`}>
                      <Tag size={11} className="inline mr-1.5 -mt-0.5" />
                      {getCategoryName(cat)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Group 3: Şəkil + Mətn */}
              <div>
                <p className="text-[9px] uppercase tracking-[0.3em] text-white/20 font-bold mb-3 flex items-center gap-2">
                  <span className="w-4 h-px bg-[var(--theme-divider)]" />
                  {t('sales_params_section')}
                  <span className="flex-1 h-px bg-[var(--theme-divider-soft)]" />
                </p>
                {/* ── AI hint card (loading + result) — above grid ── */}
                <AnimatePresence>
                  {(uploadingImage || visionLoadingMain || !!ghostMain) && (
                    <motion.div initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }} className="mb-3">
                      {(uploadingImage || visionLoadingMain) ? (
                        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.07]">
                          <div className="shrink-0 flex items-end gap-[3px] pb-0.5">
                            {[0, 0.15, 0.3].map((delay, i) => (
                              <motion.span key={i} animate={{ y: [0, -4, 0], opacity: [0.25, 0.6, 0.25] }} transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut', delay }} className="block rounded-full bg-[var(--theme-text-muted)]" style={{ width: i === 1 ? 5 : 4, height: i === 1 ? 5 : 4 }} />
                            ))}
                          </div>
                          <div>
                            <p className="text-[11px] font-medium text-white/50 leading-tight">{t('vision_analyzing')}</p>
                            <p className="text-[9px] text-white/20 uppercase tracking-[0.2em] mt-0.5">{t('vision_reading')}</p>
                          </div>
                        </div>
                      ) : (
                        <motion.div ref={orbMainRef} animate={{ y: [0, -2, 0], boxShadow: ['0 0 0px rgba(212,175,55,0)', '0 0 18px rgba(212,175,55,0.18)', '0 0 0px rgba(212,175,55,0)'] }} transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }} className="group relative flex items-center gap-3 px-4 py-3 rounded-2xl border border-white/10 overflow-hidden cursor-default" style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}>
                          <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.2), 0 0 24px rgba(255,255,255,0.05)' }} />
                          <motion.div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent -skew-x-12 pointer-events-none" animate={{ x: ['-120%', '220%'] }} transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 2, ease: 'easeInOut' }} />
                          <motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }} className="shrink-0"><Bot size={15} className="text-white/60" /></motion.div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[9px] text-white/60 uppercase tracking-[0.22em] font-bold leading-tight">{t('ai_hint_ready_title')}</p>
                            <p className="text-[11px] text-white/55 mt-0.5 leading-tight">{t('ai_hint_ready_desc')}</p>
                          </div>
                          <motion.button type="button" whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }} onClick={applyGhostMain} className="shrink-0 relative overflow-hidden flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/20 text-white/70 text-[9px] font-bold uppercase tracking-wider transition-opacity duration-200">
                            <motion.span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 pointer-events-none" animate={{ x: ['-130%', '230%'] }} transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 1.2, ease: 'easeInOut' }} />
                            <Wand2 size={9} /> {t('ai_hint_apply')}
                          </motion.button>
                          <button type="button" onClick={dismissGhostMain} className="shrink-0 w-7 h-7 flex items-center justify-center rounded-xl text-white/20 hover:text-white/55 hover:bg-white/[0.05] transition-all"><X size={13} /></button>
                        </motion.div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-3">
                  {/* Image upload */}
                  <div className="relative group">
                    <input type="file" accept="image/*" onChange={handleMainImageUpload} className="hidden" id="product-image-upload" />
                    <label htmlFor="product-image-upload" className="w-24 h-24 rounded-xl bg-white/[0.02] border-2 border-dashed border-white/10 flex items-center justify-center hover:border-white/30 hover:bg-white/[0.05] hover:shadow-[0_0_20px_rgba(255,255,255,0.05)] transition-transform duration-300 cursor-pointer overflow-hidden relative">
                      {uploadingImage ? (
                        <svg width="32" height="32" viewBox="0 0 32 32" className="animate-spin">
                          <circle cx="16" cy="16" r="12" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2.5"/>
                          <circle cx="16" cy="16" r="12" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="28 50" style={{filter:'drop-shadow(0 0 6px rgba(255,255,255,0.3))'}}/>
                        </svg>
                      ) : productForm.image_url ? (
                        <>
                          <img src={productForm.image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))' }} />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-transform duration-300 flex items-center justify-center">
                            <Upload size={18} className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
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
                      <label className="text-[10px] uppercase tracking-widest text-white/40">{t('product_description_label')}</label>
                      <div className="relative">
                        <textarea value={productForm.description}
                          onChange={(e) => { if (e.target.value.length <= 150) onFormChange({ ...productForm, description: e.target.value }); }}
                          onBlur={async (e) => {
                            const val = e.target.value.trim();
                            if (!val) return;
                            try {
                              const res = await fetch('/api/correct-name', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: val, language }) });
                              if (res.ok) { const d = await res.json(); if (d.corrected && d.corrected !== val) onFormChange({ ...productForm, description: d.corrected }); }
                            } catch { /* silent */ }
                          }}
                          placeholder={ghostMain?.description ? '' : t('description_placeholder')}
                          className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-2 pb-5 text-sm text-white placeholder:text-white/15 focus:border-white/30 outline-none transition-transform duration-300 h-[72px] resize-y min-h-[52px] max-h-[160px]"
                        />
                        <AnimatePresence>
                          {ghostMain?.description && !productForm.description && (
                            <motion.div initial="hidden" animate="visible" exit={{ opacity: 0, y: 4, transition: { duration: 0.2 } }} variants={{ visible: { transition: { staggerChildren: 0.03 } } }} className="absolute inset-0 px-3.5 py-2 pb-5 pointer-events-none overflow-hidden flex flex-wrap content-start gap-x-[0.28em] gap-y-0">
                              {ghostMain.description.split(' ').map((word, i) => (
                                <motion.span key={i} variants={{ hidden: { opacity: 0, x: -5 }, visible: { opacity: 1, x: 0 } }} transition={{ duration: 0.2 }} className="text-sm text-white/30 italic leading-snug shrink-0">{word}</motion.span>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                        <span className={`absolute bottom-2 right-3 text-[9px] font-mono transition-opacity duration-300 ${productForm.description.length > 130 ? 'text-white' : productForm.description.length > 100 ? 'text-white/30' : 'text-white/15'}`}>
                          {productForm.description.length}/150
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-widest text-white/40">{t('ingredients_label')} {t('ingredients_hint')}</label>
                      <div className="relative">
                        <textarea value={productForm.ingredients}
                          onChange={(e) => onFormChange({ ...productForm, ingredients: e.target.value })}
                          onBlur={async (e) => {
                            const val = e.target.value.trim();
                            if (!val) return;
                            try {
                              const res = await fetch('/api/correct-name', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: val, language }) });
                              if (res.ok) { const d = await res.json(); if (d.corrected && d.corrected !== val) onFormChange({ ...productForm, ingredients: d.corrected }); }
                            } catch { /* silent */ }
                          }}
                          placeholder={ghostMain?.ingredients ? '' : 'Somon, avokado, krem pendir, kəndir toxumu...'}
                          className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white placeholder:text-white/15 focus:border-white/30 outline-none transition-transform duration-300 h-[38px] resize-none" />
                        <AnimatePresence>
                          {ghostMain?.ingredients && !productForm.ingredients && (
                            <motion.div initial="hidden" animate="visible" exit={{ opacity: 0, y: 4, transition: { duration: 0.2 } }} variants={{ visible: { transition: { staggerChildren: 0.025 } } }} className="absolute inset-0 px-3.5 py-2 pointer-events-none overflow-hidden flex flex-wrap content-start gap-x-[0.28em] gap-y-0">
                              {ghostMain.ingredients.split(' ').map((word, i) => (
                                <motion.span key={i} variants={{ hidden: { opacity: 0, x: -5 }, visible: { opacity: 1, x: 0 } }} transition={{ duration: 0.2 }} className="text-sm text-white/30 italic leading-snug shrink-0">{word}</motion.span>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Group 4: Product Type & Flags */}
              <div className="space-y-3 pb-1">
                {/* Product type selector - prominent cards */}
                <div>
                  <p className="text-[9px] uppercase tracking-[0.3em] text-white/20 font-bold mb-2.5">MƏHSUL TİPİ</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onFormChange({ ...productForm, is_ready_product: false, direct_ingredient_id: '' })}
                      className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                        !productForm.is_ready_product
                          ? 'border-gold/50 bg-gold/[0.06] shadow-[0_0_20px_rgba(212,175,55,0.08)]'
                          : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${!productForm.is_ready_product ? 'bg-gold/20' : 'bg-white/[0.05]'}`}>
                        <ScrollText size={20} className={!productForm.is_ready_product ? 'text-gold' : 'text-white/30'} />
                      </div>
                      <div className="text-center">
                        <p className={`text-xs font-bold tracking-wider uppercase ${!productForm.is_ready_product ? 'text-gold' : 'text-white/50'}`}>Reseptli</p>
                        <p className="text-[9px] text-white/30 mt-0.5">Lahmacun, roll, döner</p>
                      </div>
                      {!productForm.is_ready_product && (
                        <div className="absolute top-2 right-2 w-3 h-3 rounded-full bg-gold shadow-[0_0_8px_rgba(212,175,55,0.6)]" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onFormChange({ ...productForm, is_ready_product: true })}
                      className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                        productForm.is_ready_product
                          ? 'border-blue-500/50 bg-blue-500/[0.06] shadow-[0_0_20px_rgba(96,165,250,0.08)]'
                          : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${productForm.is_ready_product ? 'bg-blue-500/20' : 'bg-white/[0.05]'}`}>
                        <PackagePlus size={20} className={productForm.is_ready_product ? 'text-blue-400' : 'text-white/30'} />
                      </div>
                      <div className="text-center">
                        <p className={`text-xs font-bold tracking-wider uppercase ${productForm.is_ready_product ? 'text-blue-400' : 'text-white/50'}`}>Birbaşa Stok</p>
                        <p className="text-[9px] text-white/30 mt-0.5">cola, su, qablaşdırılmış</p>
                      </div>
                      {productForm.is_ready_product && (
                        <div className="absolute top-2 right-2 w-3 h-3 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)]" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className={`shrink-0 flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-[11px] font-bold tracking-wider uppercase border transition-transform duration-200 cursor-pointer select-none hover:-translate-y-0.5 active:translate-y-0 ${productForm.is_in_stock ? 'bg-green-500/15 text-green-400 border-green-500/40 shadow-[0_0_15px_rgba(34,197,94,0.15)]' : 'bg-white/[0.05] text-white/40 border-white/[0.12] hover:bg-green-500/[0.06] hover:text-green-400/60 hover:border-green-500/20'}`}>
                    <input type="checkbox" checked={productForm.is_in_stock} onChange={(e) => onFormChange({ ...productForm, is_in_stock: e.target.checked })} className="hidden" />
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-transform duration-200 ${productForm.is_in_stock ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)]' : 'bg-white/20'}`} />
                    {t('in_stock_label')}
                  </label>
                  <AnimatePresence initial={false}>
                    {!isDrinkCategory && (
                      <motion.label
                        key="chefs-special"
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.22, ease: 'easeInOut' }}
                        style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}
                        className={`shrink-0 flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-[11px] font-bold tracking-wider uppercase border cursor-pointer select-none hover:-translate-y-0.5 active:translate-y-0 ${productForm.is_special ? 'bg-gold/15 text-gold border-gold/40 shadow-[0_0_12px_rgba(212,175,55,0.12)]' : 'bg-white/[0.05] text-white/40 border-white/[0.12] hover:bg-gold/[0.06] hover:text-gold/70 hover:border-gold/25'}`}>
                        <input type="checkbox" checked={productForm.is_special} onChange={(e) => onFormChange({ ...productForm, is_special: e.target.checked })} className="hidden" />
                        <Sparkles size={11} className={productForm.is_special ? 'text-gold' : 'text-white/25'} />
                        {t('chefs_special')}
                      </motion.label>
                    )}
                    {!isNonSpicyCategory && (
                      <motion.label
                        key="spicy"
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.22, ease: 'easeInOut' }}
                        style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}
                        className={`shrink-0 flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-[11px] font-bold tracking-wider uppercase border cursor-pointer select-none hover:-translate-y-0.5 active:translate-y-0 ${productForm.is_spicy ? 'bg-red-500/15 text-red-400 border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.15)]' : 'bg-white/[0.05] text-white/40 border-white/[0.12] hover:bg-red-500/[0.06] hover:text-red-400/60 hover:border-red-500/20'}`}>
                        <input type="checkbox" checked={productForm.is_spicy} onChange={(e) => onFormChange({ ...productForm, is_spicy: e.target.checked })} className="hidden" />
                        <Flame size={11} className={productForm.is_spicy ? 'text-red-400' : 'text-white/25'} />
                        {t('spicy_label')}
                      </motion.label>
                    )}
                  </AnimatePresence>
                </div>

                {/* Hazır məhsul ingredient dropdown */}
                <AnimatePresence>
                  {productForm.is_ready_product && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="flex items-center gap-2 pl-1">
                        <span className="text-[10px] text-white/30 uppercase tracking-wider">Anbar:</span>
                        <select
                          value={productForm.direct_ingredient_id}
                          onChange={(e) => onFormChange({ ...productForm, direct_ingredient_id: e.target.value })}
                          className="flex-1 max-w-xs bg-white/[0.05] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-white/25"
                        >
                          <option value="" className="bg-[var(--theme-surface)] text-[var(--theme-text-muted)]">Xəmmal seçin...</option>
                          {ingredients.map(i => (
                            <option key={i.id} value={i.id} className="bg-[#1a1a1a]">{i.name} ({i.unit})</option>
                          ))}
                        </select>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Recipe Info Card — only for recipe-based products */}
              {!productForm.is_ready_product && (editingProduct || recipeInfo) && (
                <div>
                  <p className="text-[9px] uppercase tracking-[0.3em] text-white/20 font-bold mb-3 flex items-center gap-2">
                    <span className="w-4 h-px bg-[var(--theme-border)]" />
                    RESEPT & MAYA DƏYƏRİ
                    <span className="flex-1 h-px bg-[var(--theme-border)]" />
                  </p>
                  <div className="rounded-xl p-4 space-y-2" style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.12)' }}>
                    {recipeLoading ? (
                      <div className="flex items-center gap-2 text-xs text-white/30">
                        <Loader2 size={12} className="animate-spin" />
                        Resept məlumatları yüklənir...
                      </div>
                    ) : recipeInfo ? (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-white/60">Respekt bağlıdır · {recipeInfo.count} inqrediyent</span>
                          <span className="text-sm font-bold text-white tabular-nums">₼{recipeInfo.totalCost.toFixed(2)}</span>
                        </div>
                        {editingProduct && editingProduct.price > 0 && (
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-white/40">Satış qiyməti</span>
                            <span className="text-white/70 tabular-nums">₼{editingProduct.price.toFixed(2)}</span>
                          </div>
                        )}
                        {editingProduct && editingProduct.price > 0 && recipeInfo.totalCost > 0 && (() => {
                          const profit = editingProduct.price - recipeInfo.totalCost;
                          const marginPct = (profit / editingProduct.price) * 100;
                          return (
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-white/40">Marja</span>
                              <span className={`tabular-nums font-semibold ${marginPct >= 30 ? 'text-emerald-400' : marginPct >= 15 ? 'text-gold' : marginPct > 0 ? 'text-amber-400' : 'text-red-400'}`}>
                                {marginPct >= 0 ? '+' : ''}{marginPct.toFixed(1)}% · {profit >= 0 ? '+' : ''}₼{profit.toFixed(2)}
                              </span>
                            </div>
                          );
                        })()}
                        {editingProduct && recipeInfo.totalCost > 0 && (() => {
                          const minPrice = recipeInfo.totalCost * 2.5;
                          const maxPrice = recipeInfo.totalCost * 3.5;
                          const priceOk = editingProduct.price >= minPrice && editingProduct.price <= maxPrice;
                          return (
                            <div className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-lg ${
                              priceOk ? 'text-emerald-400/70 bg-emerald-500/10' : 'text-amber-400 bg-amber-500/10'
                            }`}>
                              {priceOk ? '✓ Qiymət tövsiyə olunan aralıqdadır' : '⚠ Qiymət tövsiyə olunan aralıqdan kənardır'}
                              <span className="text-[9px] text-white/30 font-normal ml-auto">
                                ₼{minPrice.toFixed(0)} – ₼{maxPrice.toFixed(0)}
                              </span>
                            </div>
                          );
                        })()}
                        <button
                          type="button"
                          onClick={() => { onClose(); router.push(`/admin/recipes?productId=${editingProduct?.id}`); }}
                          className="text-[10px] text-gold/60 hover:text-gold underline underline-offset-2 transition-colors"
                        >
                          Resepti düzəliş et →
                        </button>
                      </>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white/30">Resept bağlı deyil</span>
                        <button
                          type="button"
                          onClick={() => { onClose(); router.push(`/admin/recipes?productId=${editingProduct?.id}`); }}
                          className="text-[10px] text-gold/60 hover:text-gold underline underline-offset-2 transition-colors"
                        >
                          Resept yarat →
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Group 5: Variants — Multi-Layered Selector */}
              <div>
                <p className="text-[9px] uppercase tracking-[0.3em] text-white/20 font-bold mb-3 flex items-center gap-2">
                  <span className="w-4 h-px bg-[var(--theme-divider)]" />
                  {t('variants_section')}
                  <span className="flex-1 h-px bg-[var(--theme-divider-soft)]" />
                </p>
                <VariantSelector
                  variants={productForm.variants}
                  onChange={(v) => {
                    const defaultV = v.find(x => x.is_default);
                    const syncedPrice = defaultV?.price && !isNaN(parseFloat(defaultV.price))
                      ? defaultV.price
                      : productForm.price;
                    onFormChange({ ...productForm, variants: v, price: syncedPrice });
                  }}
                />
              </div>

              {/* Group 6: Modifiers */}
              <div>
                <p className="text-[9px] uppercase tracking-[0.3em] text-white/20 font-bold mb-3 flex items-center gap-2">
                  <span className="w-4 h-px bg-white/10" />
                  {t('modifiers_section')}
                  <span className="flex-1 h-px bg-white/5" />
                </p>
                <ModifierSelector
                  modifiers={productForm.modifiers}
                  onChange={(m) => onFormChange({ ...productForm, modifiers: m })}
                />
              </div>
                </form>
                <div className="px-8 lg:px-12 py-4 bg-card/80 backdrop-blur-xl border-t border-white/5 rounded-b-2xl flex items-center gap-4 shrink-0">

                  <button type="button" onClick={closeWithReset} className="px-8 py-3.5 rounded-xl bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)] border border-[var(--theme-border)] hover:bg-[var(--theme-surface)] hover:text-[var(--theme-text)] text-[10px] font-bold tracking-wide uppercase whitespace-nowrap transition-all">
                    {t('cancel') || 'LƏĞV ET'}
                  </button>
                  <SaveSuccessButton
                    disabled={updating || uploadingImage || !isDirty}
                    onClick={() => triggerSave('product-modal-form')}
                    className={`flex-1 py-3 rounded-xl !bg-gradient-to-r !from-gold !via-[#E7C85A] !to-gold !text-black font-bold tracking-[0.25em] text-[11px] uppercase hover:brightness-110 transition-all shadow-lg shadow-gold/10 ${!isDirty && !updating ? 'opacity-35 pointer-events-none' : ''}`}
                  >
                    {editingProduct ? t('save_changes') : t('add_product_btn')}
                  </SaveSuccessButton>
                </div>
              </div>
            </motion.div>
          </div>

          {/* ── MOBILE modal (< md) ── */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-0 z-[110] md:hidden bg-[#0a0a0a] flex flex-col"
          >
            {/* Mobile Header */}
            <div className="sticky top-0 z-10 px-5 pt-14 pb-4 bg-gradient-to-b from-[#0a0a0a] via-[#0a0a0a]/95 to-transparent shrink-0">
              <button onClick={closeWithReset} className="absolute top-12 left-5 w-10 h-10 flex items-center justify-center rounded-full bg-white/[0.05] text-white/60 hover:text-white hover:bg-white/[0.1] transition-all">
                <ChevronLeft size={22} />
              </button>
              <div className="text-center">
                <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-[0.4em] mb-1">{t('premium_collection')}</p>
                <h1 className="text-2xl font-serif text-white tracking-tight">{editingProduct ? t('edit_product') : t('new_product')}</h1>
              </div>
            </div>

            {/* Mobile Form */}
            <form id="product-modal-form-mobile" noValidate onSubmit={onSubmit}
              className="flex-1 overflow-y-auto px-5 pb-8 space-y-6">

              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-widest text-white/40">{t('product_name_label')}</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input type="text" value={productForm.name}
                      onChange={(e) => { onFormChange({ ...productForm, name: e.target.value }); if (nameError) onNameErrorChange(false); }}
                      onBlur={(e) => { const c = normalizeProductName(e.target.value); if (c !== e.target.value) onFormChange({ ...productForm, name: c }); }}
                      placeholder={ghostMain?.name ? `AI: ${ghostMain.name}` : t('product_name_label')}
                      className={`w-full bg-white/[0.07] border rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none transition-all ${nameError ? 'border-red-500/70 focus:border-red-400' : 'border-white/[0.12] focus:border-white/35'}`}
                    />
                    <AnimatePresence>
                      {ghostMain?.name && !productForm.name && (
                        <motion.div initial="hidden" animate="visible" exit={{ opacity: 0 }} variants={{ visible: { transition: { staggerChildren: 0.04 } } }} className="absolute inset-0 flex items-center px-4 pointer-events-none overflow-hidden gap-[0.28em]">
                          {ghostMain.name.split(' ').map((word, i) => (
                            <motion.span key={i} variants={{ hidden: { opacity: 0, x: -6 }, visible: { opacity: 1, x: 0 } }} transition={{ duration: 0.22 }} className="text-sm text-white/30 italic shrink-0">{word}</motion.span>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <button
                    type="button"
                    onClick={handleAiAutoFill}
                    disabled={aiAutoFillLoading || !productForm.name.trim()}
                    className="shrink-0 flex items-center gap-1.5 px-3 rounded-xl bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/25 text-purple-300 text-[10px] font-bold tracking-wider uppercase hover:brightness-110 transition-all disabled:opacity-30"
                  >
                    {aiAutoFillLoading ? (
                      <Loader2 size={12} className="animate-spin text-purple-300" />
                    ) : (
                      <Sparkles size={12} className="text-purple-300" />
                    )}
                    AI
                  </button>
                </div>
                {nameError && <p className="text-[10px] text-red-400 mt-1">{t('product_name_required')}</p>}
              </div>

              {/* Price */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-widest text-white/40">
                  {t('price_label')}
                  {productForm.variants.length > 0 && <span className="ml-1.5 text-gold/60 normal-case tracking-normal">({t('price_from_variant')})</span>}
                </label>
                <input type="number" step="0.01" min="0.01"
                  value={productForm.price}
                  readOnly={productForm.variants.length > 0}
                  onChange={(e) => { if (productForm.variants.length > 0) return; onFormChange({ ...productForm, price: e.target.value }); if (priceError) onPriceErrorChange(false); }}
                  className={`w-full border rounded-xl px-4 py-3 text-sm placeholder:text-white/30 outline-none transition-all ${productForm.variants.length > 0 ? 'bg-white/[0.03] border-white/[0.06] text-gold/80 cursor-default' : priceError ? 'bg-white/[0.07] border-red-500/70 focus:border-red-400 text-white' : 'bg-white/[0.07] border-white/[0.12] focus:border-white/35 text-white'}`}
                />
                {priceError && <p className="text-[10px] text-red-400 mt-1">{t('price_required')}</p>}
              </div>

              {/* Category */}
              <div className="space-y-2">
                <p className="text-[9px] uppercase tracking-[0.3em] text-[var(--theme-text-muted)] font-bold flex items-center gap-2">
                  <span className="w-4 h-px bg-white/10" />{t('product_category')}<span className="flex-1 h-px bg-white/5" />
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
                  {categories.map(cat => (
                    <button key={cat.id} type="button" onClick={() => onFormChange({ ...productForm, category_id: cat.id })}
                      className={`shrink-0 px-3.5 py-1.5 rounded-xl text-[11px] font-bold tracking-wider uppercase border transition-all ${productForm.category_id === cat.id ? 'bg-white/10 text-white border-white/30' : 'bg-white/[0.05] text-white/40 border-white/[0.12]'}`}>
                      <Tag size={11} className="inline mr-1.5 -mt-0.5" />
                      {getCategoryName(cat)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sales Params */}
              <div className="space-y-3">
                <p className="text-[9px] uppercase tracking-[0.3em] text-white/40 font-bold flex items-center gap-2">
                  <span className="w-4 h-px bg-white/10" />{t('sales_params_section')}<span className="flex-1 h-px bg-white/5" />
                </p>
                {/* AI hint */}
                <AnimatePresence>
                  {(uploadingImage || visionLoadingMain || !!ghostMain) && (
                    <motion.div initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} className="mb-3">
                      {(uploadingImage || visionLoadingMain) ? (
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
                        <motion.div ref={orbMainRef} animate={{ y: [0, -2, 0], boxShadow: ['0 0 0px rgba(212,175,55,0)', '0 0 18px rgba(212,175,55,0.18)', '0 0 0px rgba(212,175,55,0)'] }} transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }} className="group relative flex items-center gap-3 px-4 py-3 rounded-2xl border border-white/10 overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}>
                          <motion.div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent -skew-x-12 pointer-events-none" animate={{ x: ['-120%', '220%'] }} transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 2, ease: 'easeInOut' }} />
                          <motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }} className="shrink-0"><Bot size={15} className="text-white/60" /></motion.div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[9px] text-white/60 uppercase tracking-[0.22em] font-bold leading-tight">{t('ai_hint_ready_title')}</p>
                            <p className="text-[11px] text-white/55 mt-0.5 leading-tight">{t('ai_hint_ready_desc')}</p>
                          </div>
                          <motion.button type="button" whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }} onClick={applyGhostMain} className="shrink-0 relative overflow-hidden flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/20 text-white/70 text-[9px] font-bold uppercase tracking-wider">
                            <motion.span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 pointer-events-none" animate={{ x: ['-130%', '230%'] }} transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 1.2, ease: 'easeInOut' }} />
                            <Wand2 size={9} /> {t('ai_hint_apply')}
                          </motion.button>
                          <button type="button" onClick={dismissGhostMain} className="shrink-0 w-7 h-7 flex items-center justify-center rounded-xl text-white/20 hover:text-white/55 hover:bg-white/[0.05] transition-all"><X size={13} /></button>
                        </motion.div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
                {/* Image + Desc + Ingr */}
                <div className="grid grid-cols-[auto_1fr] gap-3">
                  <div className="relative group">
                    <input type="file" accept="image/*" onChange={handleMainImageUpload} className="hidden" id="product-image-upload-mobile" />
                    <label htmlFor="product-image-upload-mobile" className="w-24 h-24 rounded-xl bg-white/[0.02] border-2 border-dashed border-white/10 flex items-center justify-center hover:border-white/30 hover:bg-white/[0.05] transition-all cursor-pointer overflow-hidden relative">
                      {uploadingImage ? (
                        <svg width="32" height="32" viewBox="0 0 32 32" className="animate-spin">
                          <circle cx="16" cy="16" r="12" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2.5"/>
                          <circle cx="16" cy="16" r="12" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="28 50" style={{filter:'drop-shadow(0 0 6px rgba(255,255,255,0.3))'}}/>
                        </svg>
                      ) : productForm.image_url ? (
                        <>
                          <img src={productForm.image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
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
                  <div className="space-y-2.5">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-widest text-white/40">{t('product_description_label')}</label>
                      <textarea value={productForm.description}
                        onChange={(e) => { if (e.target.value.length <= 150) onFormChange({ ...productForm, description: e.target.value }); }}
                        placeholder={ghostMain?.description ? '' : t('description_placeholder')}
                        className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-2 pb-5 text-sm text-white placeholder:text-white/15 focus:border-white/30 outline-none transition-all h-[72px] resize-y min-h-[52px] max-h-[160px]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-widest text-white/40">{t('ingredients_label')} {t('ingredients_hint')}</label>
                      <textarea value={productForm.ingredients}
                        onChange={(e) => onFormChange({ ...productForm, ingredients: e.target.value })}
                        placeholder={ghostMain?.ingredients ? '' : 'Somon, avokado, krem pendir...'}
                        className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white placeholder:text-white/15 focus:border-white/30 outline-none transition-all h-[38px] resize-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Product Type - Mobile */}
              <div>
                <p className="text-[9px] uppercase tracking-[0.3em] text-white/40 font-bold mb-2">MƏHSUL TİPİ</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onFormChange({ ...productForm, is_ready_product: false, direct_ingredient_id: '' })}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                      !productForm.is_ready_product
                        ? 'border-gold/50 bg-gold/[0.06]'
                        : 'border-white/10 bg-white/[0.02]'
                    }`}
                  >
                    <ScrollText size={18} className={!productForm.is_ready_product ? 'text-gold' : 'text-white/30'} />
                    <p className={`text-[10px] font-bold tracking-wider uppercase ${!productForm.is_ready_product ? 'text-gold' : 'text-white/50'}`}>Reseptli</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => onFormChange({ ...productForm, is_ready_product: true })}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                      productForm.is_ready_product
                        ? 'border-blue-500/50 bg-blue-500/[0.06]'
                        : 'border-white/10 bg-white/[0.02]'
                    }`}
                  >
                    <PackagePlus size={18} className={productForm.is_ready_product ? 'text-blue-400' : 'text-white/30'} />
                    <p className={`text-[10px] font-bold tracking-wider uppercase ${productForm.is_ready_product ? 'text-blue-400' : 'text-white/50'}`}>Birbaşa Stok</p>
                  </button>
                </div>
              </div>
              {/* Flags */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <label className={`shrink-0 flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-[11px] font-bold tracking-wider uppercase border cursor-pointer select-none ${productForm.is_in_stock ? 'bg-green-500/15 text-green-400 border-green-500/40' : 'bg-white/[0.05] text-white/40 border-white/[0.12]'}`}>
                    <input type="checkbox" checked={productForm.is_in_stock} onChange={(e) => onFormChange({ ...productForm, is_in_stock: e.target.checked })} className="hidden" />
                    <span className={`w-1.5 h-1.5 rounded-full ${productForm.is_in_stock ? 'bg-green-400' : 'bg-white/20'}`} />
                    {t('in_stock_label')}
                  </label>
                  {!isDrinkCategory && (
                    <label className={`shrink-0 flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-[11px] font-bold tracking-wider uppercase border cursor-pointer select-none ${productForm.is_special ? 'bg-gold/15 text-gold border-gold/40' : 'bg-white/[0.05] text-white/40 border-white/[0.12]'}`}>
                      <input type="checkbox" checked={productForm.is_special} onChange={(e) => onFormChange({ ...productForm, is_special: e.target.checked })} className="hidden" />
                      <Sparkles size={11} className={productForm.is_special ? 'text-gold' : 'text-white/25'} />
                      {t('chefs_special')}
                    </label>
                  )}
                  {!isNonSpicyCategory && (
                    <label className={`shrink-0 flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-[11px] font-bold tracking-wider uppercase border cursor-pointer select-none ${productForm.is_spicy ? 'bg-red-500/15 text-red-400 border-red-500/40' : 'bg-white/[0.05] text-white/40 border-white/[0.12]'}`}>
                      <input type="checkbox" checked={productForm.is_spicy} onChange={(e) => onFormChange({ ...productForm, is_spicy: e.target.checked })} className="hidden" />
                      <Flame size={11} className={productForm.is_spicy ? 'text-red-400' : 'text-white/25'} />
                      {t('spicy_label')}
                    </label>
                  )}
                </div>

                {/* Hazır məhsul ingredient dropdown — mobile */}
                {productForm.is_ready_product && (
                  <div className="flex items-center gap-2 pl-1">
                    <span className="text-[10px] text-white/30 uppercase tracking-wider">Anbar:</span>
                    <select
                      value={productForm.direct_ingredient_id}
                      onChange={(e) => onFormChange({ ...productForm, direct_ingredient_id: e.target.value })}
                      className="flex-1 max-w-xs bg-white/[0.05] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-white/25"
                    >
                      <option value="" className="bg-[#1a1a1a] text-white/40">Xəmmal seçin...</option>
                      {ingredients.map(i => (
                        <option key={i.id} value={i.id} className="bg-[#1a1a1a]">{i.name} ({i.unit})</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Recipe Info Card — Mobile */}
              {!productForm.is_ready_product && (editingProduct || recipeInfo) && (
                <div className="rounded-xl p-4 space-y-2" style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.12)' }}>
                  {recipeLoading ? (
                    <div className="flex items-center gap-2 text-xs text-white/30">
                      <Loader2 size={12} className="animate-spin" />
                      Resept məlumatları yüklənir...
                    </div>
                  ) : recipeInfo ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white/60">Respekt bağlıdır · {recipeInfo.count} inqrediyent</span>
                        <span className="text-sm font-bold text-white tabular-nums">₼{recipeInfo.totalCost.toFixed(2)}</span>
                      </div>
                      {editingProduct && editingProduct.price > 0 && (
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-white/40">Satış qiyməti</span>
                          <span className="text-white/70 tabular-nums">₼{editingProduct.price.toFixed(2)}</span>
                        </div>
                      )}
                      {editingProduct && editingProduct.price > 0 && recipeInfo.totalCost > 0 && (() => {
                        const profit = editingProduct.price - recipeInfo.totalCost;
                        const marginPct = (profit / editingProduct.price) * 100;
                        return (
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-white/40">Marja</span>
                            <span className={`tabular-nums font-semibold ${marginPct >= 30 ? 'text-emerald-400' : marginPct >= 15 ? 'text-gold' : marginPct > 0 ? 'text-amber-400' : 'text-red-400'}`}>
                              {marginPct >= 0 ? '+' : ''}{marginPct.toFixed(1)}% · {profit >= 0 ? '+' : ''}₼{profit.toFixed(2)}
                            </span>
                          </div>
                        );
                      })()}
                      <button
                        type="button"
                        onClick={() => { onClose(); router.push(`/admin/recipes?productId=${editingProduct?.id}`); }}
                        className="text-[10px] text-gold/60 hover:text-gold underline underline-offset-2 transition-colors"
                      >
                        Resepti düzəliş et →
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/30">Resept bağlı deyil</span>
                      <button
                        type="button"
                        onClick={() => { onClose(); router.push(`/admin/recipes?productId=${editingProduct?.id}`); }}
                        className="text-[10px] text-gold/60 hover:text-gold underline underline-offset-2 transition-colors"
                      >
                        Resept yarat →
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Variants */}
              <div className="space-y-2">
                <p className="text-[9px] uppercase tracking-[0.3em] text-white/40 font-bold flex items-center gap-2">
                  <span className="w-4 h-px bg-white/10" />{t('variants_section')}<span className="flex-1 h-px bg-white/5" />
                </p>
                <VariantSelector
                  variants={productForm.variants}
                  onChange={(v) => {
                    const defaultV = v.find(x => x.is_default);
                    const syncedPrice = defaultV?.price && !isNaN(parseFloat(defaultV.price)) ? defaultV.price : productForm.price;
                    onFormChange({ ...productForm, variants: v, price: syncedPrice });
                  }}
                />
              </div>

              {/* Modifiers */}
              <div className="space-y-2">
                <p className="text-[9px] uppercase tracking-[0.3em] text-white/40 font-bold flex items-center gap-2">
                  <span className="w-4 h-px bg-white/10" />{t('modifiers_section')}<span className="flex-1 h-px bg-white/5" />
                </p>
                <ModifierSelector
                  modifiers={productForm.modifiers}
                  onChange={(m) => onFormChange({ ...productForm, modifiers: m })}
                />
              </div>

              {/* Mobile Footer - scrolls naturally with form, z-index above hamburger */}
              <div className="z-[70] px-0 py-6 flex items-center gap-3">
                <button type="button" onClick={closeWithReset} className="px-6 py-3.5 rounded-xl bg-white/[0.07] text-white/75 border border-white/[0.16] hover:bg-white/[0.10] text-[10px] font-bold tracking-wide uppercase whitespace-nowrap transition-all">
                  {t('cancel') || 'LƏĞV ET'}
                </button>
                <SaveSuccessButton
                  disabled={updating || uploadingImage || !isDirty}
                  onClick={() => triggerSave('product-modal-form-mobile')}
                  className={`flex-1 py-3.5 rounded-xl !bg-gradient-to-r !from-gold !via-[#E7C85A] !to-gold !text-black font-bold tracking-[0.25em] text-[11px] uppercase hover:brightness-110 transition-all shadow-lg shadow-gold/20 ${!isDirty && !updating ? 'opacity-35 pointer-events-none' : ''}`}
                >
                  {editingProduct ? t('save_changes') : t('add_product_btn')}
                </SaveSuccessButton>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
