'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Upload, Trash2, ChevronDown, ChevronLeft } from 'lucide-react';
import { SaveSuccessButton, ElasticSwitch } from '@/components/premium/PremiumComponents';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { createPortal } from 'react-dom';
import type { Combo, ComboItem, Product, ProductVariant } from '@/types';
import { useTheme } from '@/lib/theme/ThemeContext';

interface ComboFormItem {
  product_id: string;
  variant_id: string | null;
  quantity: number;
  product?: Product;
  variant?: ProductVariant | null;
}

interface ComboForm {
  name: string;
  name_az: string;
  name_ru: string;
  name_en: string;
  description: string;
  description_az: string;
  description_ru: string;
  description_en: string;
  price: string;
  image_url: string;
  is_in_stock: boolean;
  is_active: boolean;
  items: ComboFormItem[];
}

interface ComboModalProps {
  open: boolean;
  editingCombo: Combo | null;
  products: Product[];
  onClose: () => void;
  onSaved: () => void;
}

const EMPTY_FORM: ComboForm = {
  name: '', name_az: '', name_ru: '', name_en: '',
  description: '', description_az: '', description_ru: '', description_en: '',
  price: '', image_url: '', is_in_stock: true, is_active: true, items: [],
};

type PickerState = { productId: string; variants: ProductVariant[]; selectedVariantId: string | null } | null;

export default function ComboModal({ open, editingCombo, products, onClose, onSaved }: ComboModalProps) {
  const { t, language } = useLanguage();
  const { lightMode } = useTheme();
  const [form, setForm] = useState<ComboForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [variantPicker, setVariantPicker] = useState<PickerState>(null);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (editingCombo) {
      setForm({
        name: editingCombo.name,
        name_az: editingCombo.name_az || '',
        name_ru: editingCombo.name_ru || '',
        name_en: editingCombo.name_en || '',
        description: editingCombo.description || '',
        description_az: editingCombo.description_az || '',
        description_ru: editingCombo.description_ru || '',
        description_en: editingCombo.description_en || '',
        price: editingCombo.price.toString(),
        image_url: editingCombo.image_url || '',
        is_in_stock: editingCombo.is_in_stock,
        is_active: editingCombo.is_active,
        items: (editingCombo.items || []).map(it => ({
          product_id: it.product_id,
          variant_id: it.variant_id || null,
          quantity: it.quantity,
          product: products.find(p => p.id === it.product_id),
          variant: it.variant || null,
        })),
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setShowProductPicker(false);
    setProductSearch('');
    setVariantPicker(null);
  }, [open, editingCombo, products]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `combos/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path);
      setForm(prev => ({ ...prev, image_url: publicUrl }));
    } catch { toast.error(t('error_saving'), { id: 'action-toast' }); }
    finally { setUploadingImage(false); }
  };

  const loadVariantsForProduct = async (product: Product) => {
    setLoadingVariants(true);
    try {
      const { data } = await supabase
        .from('product_variants')
        .select('*')
        .eq('product_id', product.id)
        .order('is_default', { ascending: false });
      const variants = (data || []) as ProductVariant[];
      if (variants.length === 0) {
        addProductWithVariant(product, null, null);
      } else {
        setVariantPicker({ productId: product.id, variants, selectedVariantId: variants[0]?.id || null });
      }
    } catch {
      addProductWithVariant(product, null, null);
    } finally {
      setLoadingVariants(false);
    }
  };

  const addProductWithVariant = (product: Product, variantId: string | null, variant: ProductVariant | null) => {
    const key = `${product.id}__${variantId || 'base'}`;
    const existing = form.items.find(it => `${it.product_id}__${it.variant_id || 'base'}` === key);
    if (existing) {
      setForm(prev => ({ ...prev, items: prev.items.map(it =>
        `${it.product_id}__${it.variant_id || 'base'}` === key ? { ...it, quantity: it.quantity + 1 } : it
      ) }));
    } else {
      setForm(prev => ({ ...prev, items: [...prev.items, { product_id: product.id, variant_id: variantId, quantity: 1, product, variant }] }));
    }
    setShowProductPicker(false);
    setProductSearch('');
    setVariantPicker(null);
  };

  const removeItem = (product_id: string, variant_id: string | null) => {
    const key = `${product_id}__${variant_id || 'base'}`;
    setForm(prev => ({ ...prev, items: prev.items.filter(it => `${it.product_id}__${it.variant_id || 'base'}` !== key) }));
  };

  const updateQty = (product_id: string, variant_id: string | null, qty: number) => {
    const key = `${product_id}__${variant_id || 'base'}`;
    if (qty < 1) { removeItem(product_id, variant_id); return; }
    setForm(prev => ({ ...prev, items: prev.items.map(it =>
      `${it.product_id}__${it.variant_id || 'base'}` === key ? { ...it, quantity: qty } : it
    ) }));
  };

  const separateTotal = form.items.reduce((sum, it) => {
    const price = it.variant?.price ?? it.product?.price ?? 0;
    return sum + price * it.quantity;
  }, 0);
  const comboPrice = parseFloat(form.price) || 0;
  const saving_amount = separateTotal - comboPrice;

  const handleSave = async (): Promise<boolean> => {
    const currentName = language === 'az' ? form.name_az : language === 'ru' ? form.name_ru : form.name_en;
    const currentDesc = language === 'az' ? form.description_az : language === 'ru' ? form.description_ru : form.description_en;
    
    if (!currentName.trim()) {
      toast.error(t('combo_name') + ' ' + t('required'), { id: 'action-toast' });
      return false;
    }
    if (!form.price || isNaN(parseFloat(form.price)) || parseFloat(form.price) <= 0) {
      toast.error(t('combo_price') + ' ' + t('required'), { id: 'action-toast' });
      return false;
    }

    setSaving(true);
    try {
      const flat: Record<string, any> = {
        name: currentName.trim(),
        name_az: form.name_az.trim(),
        name_ru: form.name_ru.trim(),
        name_en: form.name_en.trim(),
        description: currentDesc.trim() || null,
        description_az: form.description_az.trim() || '',
        description_ru: form.description_ru.trim() || '',
        description_en: form.description_en.trim() || '',
        price: parseFloat(form.price),
        image_url: form.image_url || null,
        is_in_stock: form.is_in_stock,
        is_active: form.is_active,
      };

      const response = await fetch('/api/combos', {
        method: editingCombo ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingCombo?.id, combo: flat, items: form.items }),
      });

      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || 'API error');

      toast.success(editingCombo ? t('combo_updated') : t('combo_created'), { id: 'action-toast' });
      onSaved();
      onClose();
      return true;
    } catch (err: any) {
      toast.error(t('error_saving') + ': ' + (err?.message || ''), { id: 'action-toast' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveFromButton = async () => {
    const ok = await handleSave();
    if (!ok) throw new Error('save_failed');
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  const formContent = (
    <div className="space-y-8 px-6 md:px-10 py-8 bg-[var(--theme-surface)]">
               {/* Şəkil + Ad + Qiymət */}
               <div className="flex gap-4">
                 {/* Şəkil */}
                 <div className="flex-shrink-0">
                   <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                   <button onClick={() => fileRef.current?.click()}
                     className="w-24 h-24 rounded-xl border-2 border-dashed border-[var(--theme-border)] hover:border-[var(--theme-border-strong)] bg-[var(--theme-bg)] flex flex-col items-center justify-center gap-1 transition-all group overflow-hidden">
                     {uploadingImage ? (
                       <Loader2 size={20} className="animate-spin text-[var(--theme-text-muted)]" />
                     ) : form.image_url ? (
                       <img src={form.image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                     ) : (
                       <>
                         <Upload size={18} className="text-[var(--theme-text-muted)] opacity-40 group-hover:opacity-60 transition-opacity" />
                         <span className="text-[9px] text-[var(--theme-text-muted)] uppercase tracking-widest">{t('combo_image' as any)}</span>
                       </>
                     )}
                   </button>
                 </div>

                 {/* Ad + Qiymət */}
                 <div className="flex-1 space-y-4">
                   <div>
                     <label className="block text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-muted)] font-black mb-2">{t('combo_name' as any)}</label>
                     <input
                       type="text" 
                       value={language === 'az' ? form.name_az : language === 'ru' ? form.name_ru : form.name_en}
                       onChange={e => {
                         const val = e.target.value;
                         if (language === 'az') setForm(prev => ({ ...prev, name_az: val }));
                         else if (language === 'ru') setForm(prev => ({ ...prev, name_ru: val }));
                         else setForm(prev => ({ ...prev, name_en: val }));
                       }}
                       placeholder={language === 'az' ? 'Məs: Ailə Paketi' : language === 'ru' ? 'Название...' : 'Name...'}
                       className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] rounded-xl px-4 py-4 text-base font-bold text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none focus:border-gold/40 transition-all shadow-inner"
                     />
                   </div>
                   <div>
                     <label className="block text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-muted)] font-black mb-2">{t('combo_price' as any)}</label>
                     <input
                       type="number" step="0.01" min="0" value={form.price}
                       onChange={e => setForm(prev => ({ ...prev, price: e.target.value }))}
                       placeholder="0.00"
                       className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] rounded-xl px-4 py-4 text-xl font-black text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none focus:border-gold/40 transition-all shadow-inner"
                     />
                   </div>
                 </div>
               </div>

               {/* Açıqlama */}
               <div>
                 <label className="block text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-muted)] font-black mb-2">{t('combo_description' as any)}</label>
                 <textarea
                   value={language === 'az' ? form.description_az : language === 'ru' ? form.description_ru : form.description_en}
                   onChange={e => {
                     const val = e.target.value;
                     if (language === 'az') setForm(prev => ({ ...prev, description_az: val }));
                     else if (language === 'ru') setForm(prev => ({ ...prev, description_ru: val }));
                     else setForm(prev => ({ ...prev, description_en: val }));
                   }}
                   placeholder={language === 'az' ? 'Kombo haqqında qısa məlumat...' : language === 'ru' ? 'Описание...' : 'Description...'}
                   rows={3}
                   className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] rounded-xl px-4 py-4 text-base font-bold text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none focus:border-gold/40 transition-all resize-none shadow-inner"
                 />
               </div>

               {/* Stok + Aktiv toggle */}
               <div className="flex flex-wrap gap-4">
                 <div className="flex-1 flex items-center justify-between px-6 py-4 rounded-2xl bg-[var(--theme-bg)] border border-[var(--theme-border)] shadow-sm">
                   <span className="text-[11px] font-black uppercase tracking-wider text-[var(--theme-text-secondary)]">
                     {form.is_in_stock ? t('combo_in_stock' as any) : t('combo_out_of_stock' as any)}
                   </span>
                   <ElasticSwitch checked={form.is_in_stock} onChange={(v) => setForm(prev => ({ ...prev, is_in_stock: v }))} disabled={saving} />
                 </div>
                 <div className="flex-1 flex items-center justify-between px-6 py-4 rounded-2xl bg-[var(--theme-bg)] border border-[var(--theme-border)] shadow-sm">
                   <span className="text-[11px] font-black uppercase tracking-wider text-[var(--theme-text-secondary)]">
                     {form.is_active ? t('combo_active' as any) : t('combo_inactive' as any)}
                   </span>
                   <ElasticSwitch checked={form.is_active} onChange={(v) => setForm(prev => ({ ...prev, is_active: v }))} disabled={saving} />
                 </div>
               </div>

               {/* Məhsullar */}
               <div>
                 <div className="flex items-center justify-between mb-4">
                   <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-muted)] font-black">{t('combo_items' as any)}</label>
                 </div>

                 <div className="space-y-3 mb-4">
                   {form.items.length === 0 ? (
                     <div className="py-8 text-center text-[13px] text-[var(--theme-text-muted)] border-2 border-dashed border-[var(--theme-border)] rounded-2xl bg-[var(--theme-bg)]/50">
                       {t('combo_no_items' as any)}
                     </div>
                   ) : (
                     <>{form.items.map(item => {
                       const prod = item.product || products.find(p => p.id === item.product_id);
                       const itemKey = `${item.product_id}__${item.variant_id || 'base'}`;
                       const unitPrice = item.variant?.price ?? prod?.price ?? 0;
                       return (
                         <div key={itemKey} className="flex items-center gap-4 bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-2xl px-4 py-3 hover:border-gold/30 transition-all shadow-sm group">
                           <div className="w-12 h-12 rounded-xl overflow-hidden border border-[var(--theme-border)] flex-shrink-0 bg-[var(--theme-surface-soft)]">
                             {prod?.image_url && <img src={prod.image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />}
                           </div>
                           <div className="flex-1 min-w-0">
                             <p className="text-sm text-[var(--theme-text)] font-black truncate">{prod?.name || item.product_id}</p>
                             {item.variant && (
                               <span className="inline-block text-[10px] font-black text-gold bg-gold/10 border border-gold/20 rounded-lg px-2 py-0.5 mt-1 uppercase tracking-widest">{item.variant.name}</span>
                             )}
                             <p className="text-[11px] text-[var(--theme-text-muted)] font-bold mt-1 tracking-tight">₼{unitPrice.toFixed(2)} × {item.quantity} = <span className="text-[var(--theme-text)] font-black">₼{(unitPrice * item.quantity).toFixed(2)}</span></p>
                           </div>
                           <div className="flex items-center gap-1 bg-[var(--theme-surface-soft)] rounded-xl p-1 shadow-inner">
                             <button onClick={() => updateQty(item.product_id, item.variant_id || null, item.quantity - 1)}
                               className="w-8 h-8 rounded-lg hover:bg-[var(--theme-bg)] text-[var(--theme-text)] flex items-center justify-center text-lg font-black transition-all">−</button>
                             <span className="w-8 text-center text-sm text-[var(--theme-text)] font-black tabular-nums">{item.quantity}</span>
                             <button onClick={() => updateQty(item.product_id, item.variant_id || null, item.quantity + 1)}
                               className="w-8 h-8 rounded-lg hover:bg-[var(--theme-bg)] text-[var(--theme-text)] flex items-center justify-center text-lg font-black transition-all">+</button>
                           </div>
                           <button onClick={() => removeItem(item.product_id, item.variant_id || null)}
                             className="w-10 h-10 rounded-xl bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-500 flex items-center justify-center transition-all">
                             <Trash2 size={16} />
                           </button>
                         </div>
                       );
                     })}</>
                   )}
                 </div>

                 <div className="relative">
                   <button
                     onClick={() => { setShowProductPicker(v => !v); setVariantPicker(null); setProductSearch(''); }}
                     className="flex items-center gap-2 px-4 py-4 rounded-2xl bg-[var(--theme-surface-soft)] hover:bg-[var(--theme-bg)] border border-dashed border-[var(--theme-border-strong)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] text-[12px] font-black tracking-widest uppercase transition-all w-full justify-center shadow-sm"
                   >
                     {t('combo_add_product' as any)}
                   </button>
                 </div>
               </div>
    </div>
  );

  return createPortal(
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="combo-mobile"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 300 }}
            className="fixed inset-0 z-[120] flex flex-col bg-[var(--theme-bg)] md:hidden"
            style={{ overflowY: 'auto' }}
          >
            <div className="sticky top-0 z-10 flex items-center gap-3 px-6 py-5 border-b border-[var(--theme-border)] bg-[var(--theme-surface)] shadow-sm">
              <button onClick={onClose} className="w-12 h-12 flex items-center justify-center rounded-2xl bg-[var(--theme-bg)] border border-[var(--theme-border)] text-[var(--theme-text)] shadow-sm">
                <ChevronLeft size={24} />
              </button>
              <div className="flex-1 text-center">
                <h2 className="text-xl font-serif font-black text-[var(--theme-text)] uppercase tracking-tight">{editingCombo ? t('combo_edit' as any) : t('combo_new' as any)}</h2>
                <p className="text-[10px] uppercase tracking-[0.4em] text-gold font-black mt-1">COMBO</p>
              </div>
              <div className="w-12" />
            </div>

            <div className="flex-1 pb-40">
              {formContent}
            </div>

            <div className="fixed bottom-0 inset-x-0 px-6 pb-10 pt-6 bg-gradient-to-t from-[var(--theme-bg)] via-[var(--theme-bg)] to-transparent z-10">
              <div className="flex gap-4">
                <button onClick={onClose} className="flex-1 py-5 rounded-[24px] bg-[var(--theme-surface)] border border-[var(--theme-border)] text-[var(--theme-text-muted)] font-black uppercase tracking-widest text-[11px] shadow-sm">
                  {t('cancel' as any)}
                </button>
                <SaveSuccessButton
                  onClick={handleSaveFromButton}
                  disabled={saving}
                  className={`flex-1 py-5 rounded-[24px] font-black text-[11px] uppercase tracking-widest shadow-xl transition-all ${lightMode ? 'bg-gray-900 !text-white hover:bg-black' : 'bg-gold !text-black hover:brightness-110'}`}
                >
                  {t('combo_save' as any)}
                </SaveSuccessButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {open && (
        <div className="fixed inset-0 z-[120] hidden md:flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-md" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-[40px] shadow-[0_32px_80px_rgba(0,0,0,0.15)]"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between px-10 py-8 bg-[var(--theme-surface)]/90 backdrop-blur-md border-b border-[var(--theme-border)]">
              <div>
                <h2 className="text-3xl font-serif font-black text-[var(--theme-text)] uppercase tracking-tight">{editingCombo ? t('combo_edit' as any) : t('combo_new' as any)}</h2>
                <p className="text-[11px] uppercase tracking-[0.4em] text-gold font-black mt-2">COMBO PRESET</p>
              </div>
              <button onClick={onClose} className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[var(--theme-bg)] border border-[var(--theme-border)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-all shadow-sm">
                <X size={20} />
              </button>
            </div>
            {formContent}
            <div className="sticky bottom-0 px-10 py-8 bg-[var(--theme-surface)]/90 backdrop-blur-md border-t border-[var(--theme-border)] flex gap-4">
              <button onClick={onClose} className="flex-1 py-5 rounded-[24px] bg-[var(--theme-bg)] border border-[var(--theme-border)] text-[var(--theme-text-muted)] font-black uppercase tracking-widest text-[11px] hover:bg-[var(--theme-surface-soft)] transition-all">
                {t('cancel' as any)}
              </button>
              <SaveSuccessButton
                onClick={handleSaveFromButton}
                disabled={saving}
                className={`flex-1 py-5 rounded-[24px] font-black text-[11px] uppercase tracking-widest shadow-xl transition-all ${lightMode ? 'bg-gray-900 !text-white hover:bg-black' : 'bg-gold !text-black hover:brightness-110'}`}
              >
                {t('combo_save' as any)}
              </SaveSuccessButton>
            </div>
          </motion.div>
        </div>
      )}
    </>,
    document.body
  );
}
