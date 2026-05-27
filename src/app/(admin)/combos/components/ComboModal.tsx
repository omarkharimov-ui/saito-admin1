'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Loader2, Upload, Trash2, ChevronDown, ChevronLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { createPortal } from 'react-dom';
import type { Combo, ComboItem, Product, ProductVariant } from '@/types';

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
        // Variant yoxdur - birbaşa əlavə et
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

  // Ayrıca alınsaydı cəmi - variant qiyməti prioritet
  const separateTotal = form.items.reduce((sum, it) => {
    const price = it.variant?.price ?? it.product?.price ?? 0;
    return sum + price * it.quantity;
  }, 0);
  const comboPrice = parseFloat(form.price) || 0;
  const saving_amount = separateTotal - comboPrice;

  const handleSave = async () => {
    // Cari dil üzrə name və description yoxlama
    const currentName = language === 'az' ? form.name_az : language === 'ru' ? form.name_ru : form.name_en;
    const currentDesc = language === 'az' ? form.description_az : language === 'ru' ? form.description_ru : form.description_en;
    
    if (!currentName.trim()) { toast.error(t('combo_name') + ' ' + t('required'), { id: 'action-toast' }); return; }
    if (!form.price || isNaN(parseFloat(form.price)) || parseFloat(form.price) <= 0) {
      toast.error(t('combo_price') + ' ' + t('required'), { id: 'action-toast' }); return;
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

      // AI translate combo name & description to all 3 languages
      // YENİ combo: həmişə tərcümə et | EDIT: yalnız boş olanları tərcümə et
      const isNewCombo = !editingCombo;
      const fields: Record<string, string> = { name: currentName.trim() };
      if (currentDesc.trim()) fields.description = currentDesc.trim();
      
      let attempt = 0;
      let success = false;
      while (attempt < 3 && !success) {
        attempt++;
        try {
          const res = await fetch('/api/translate-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields, languages: ['Azerbaijani', 'English', 'Russian'], sourceLanguage: 'auto-detect' }),
          });
          if (res.ok) {
            const d = await res.json();
            // YENİ combo: həmişə yaz | EDIT: yalnız boşdursa yaz
            if (d.result?.Azerbaijani?.name) {
              if (isNewCombo || !form.name_az.trim()) flat.name_az = d.result.Azerbaijani.name;
            }
            if (d.result?.Azerbaijani?.description) {
              if (isNewCombo || !form.description_az.trim()) flat.description_az = d.result.Azerbaijani.description;
            }
            if (d.result?.English?.name) {
              if (isNewCombo || !form.name_en.trim()) flat.name_en = d.result.English.name;
            }
            if (d.result?.English?.description) {
              if (isNewCombo || !form.description_en.trim()) flat.description_en = d.result.English.description;
            }
            if (d.result?.Russian?.name) {
              if (isNewCombo || !form.name_ru.trim()) flat.name_ru = d.result.Russian.name;
            }
            if (d.result?.Russian?.description) {
              if (isNewCombo || !form.description_ru.trim()) flat.description_ru = d.result.Russian.description;
            }
            success = true;
          }
        } catch { /* retry */ }
      }
      
      // Fallback: boş qalanları cari dildən doldur
      if (!flat.name_az) flat.name_az = currentName.trim();
      if (!flat.name_en) flat.name_en = currentName.trim();
      if (!flat.name_ru) flat.name_ru = currentName.trim();
      if (!flat.description_az) flat.description_az = currentDesc.trim() || '';
      if (!flat.description_en) flat.description_en = currentDesc.trim() || '';
      if (!flat.description_ru) flat.description_ru = currentDesc.trim() || '';

      // Use API route to bypass RLS
      const response = await fetch('/api/combos', {
        method: editingCombo ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingCombo?.id,
          combo: flat,
          items: form.items,
        }),
      });

      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'API error');
      }

      toast.success(editingCombo ? t('combo_updated') : t('combo_created'), { id: 'action-toast' });
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(t('error_saving') + ': ' + (err?.message || ''), { id: 'action-toast' });
    } finally { setSaving(false); }
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  const formContent = (
    <div className="space-y-7 px-5 md:px-8 py-6">
              {/* Şəkil + Ad + Qiymət */}
              <div className="flex gap-4">
                {/* Şəkil */}
                <div className="flex-shrink-0">
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  <button onClick={() => fileRef.current?.click()}
                    className="w-24 h-24 rounded-xl border-2 border-dashed border-white/[0.12] hover:border-white/25 bg-white/[0.03] flex flex-col items-center justify-center gap-1 transition-all group overflow-hidden">
                    {uploadingImage ? (
                      <Loader2 size={20} className="animate-spin text-white/30" />
                    ) : form.image_url ? (
                      <img src={form.image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                    ) : (
                      <>
                        <Upload size={18} className="text-white/20 group-hover:text-white/40 transition-colors" />
                        <span className="text-[9px] text-white/20 group-hover:text-white/40">{t('combo_image')}</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Ad + Qiymət - İnterfeys dilinə görə */}
                <div className="flex-1 space-y-4">
                  <div>
                    <label className="block text-[10px] uppercase tracking-[0.2em] text-white/30 mb-1.5">{t('combo_name')}</label>
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
                      className="w-full bg-white/[0.05] border border-white/[0.10] rounded-xl px-4 py-3.5 text-base text-white placeholder:text-white/20 outline-none focus:border-white/30 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-[0.2em] text-white/30 mb-1.5">{t('combo_price')}</label>
                    <input
                      type="number" step="0.01" min="0" value={form.price}
                      onChange={e => setForm(prev => ({ ...prev, price: e.target.value }))}
                      placeholder="0.00"
                      className="w-full bg-white/[0.05] border border-white/[0.10] rounded-xl px-4 py-3.5 text-base text-white placeholder:text-white/20 outline-none focus:border-white/30 transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Açıqlama - İnterfeys dilinə görə */}
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] text-white/30 mb-1.5">{t('combo_description')}</label>
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
                  className="w-full bg-white/[0.05] border border-white/[0.10] rounded-xl px-4 py-3.5 text-base text-white placeholder:text-white/20 outline-none focus:border-white/30 transition-all resize-none"
                />
              </div>

              {/* Stok + Aktiv toggle */}
              <div className="flex gap-3">
                <button onClick={() => setForm(prev => ({ ...prev, is_in_stock: !prev.is_in_stock }))}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider border transition-all ${form.is_in_stock ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-white/[0.04] border-white/[0.08] text-white/30'}`}>
                  <span className={`w-2 h-2 rounded-full ${form.is_in_stock ? 'bg-green-400' : 'bg-white/20'}`} />
                  {form.is_in_stock ? t('combo_in_stock') : t('combo_out_of_stock')}
                </button>
                <button onClick={() => setForm(prev => ({ ...prev, is_active: !prev.is_active }))}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider border transition-all ${form.is_active ? 'bg-gold/10 border-gold/30 text-gold' : 'bg-white/[0.04] border-white/[0.08] text-white/30'}`}>
                  <span className={`w-2 h-2 rounded-full ${form.is_active ? 'bg-gold' : 'bg-white/20'}`} />
                  {form.is_active ? t('combo_active') : t('combo_inactive')}
                </button>
              </div>

              {/* Məhsullar */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-white/30">{t('combo_items')}</label>
                </div>

                {/* Item siyahısı */}
                <div className="space-y-2 mb-3">
                  {form.items.length === 0 ? (
                    <div className="py-4 text-center text-[13px] text-white/25 border border-dashed border-white/[0.08] rounded-xl">
                      {t('combo_no_items')}
                    </div>
                  ) : (
                    <>{form.items.map(item => {
                      const prod = item.product || products.find(p => p.id === item.product_id);
                      const itemKey = `${item.product_id}__${item.variant_id || 'base'}`;
                      const unitPrice = item.variant?.price ?? prod?.price ?? 0;
                      return (
                        <div key={itemKey} className="flex items-center gap-3 bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2.5 hover:border-white/[0.12] transition-colors">
                          {/* Şəkil */}
                          <div className="w-10 h-10 rounded-lg overflow-hidden border border-white/[0.08] flex-shrink-0 bg-white/[0.03]">
                            {prod?.image_url && <img src={prod.image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />}
                          </div>
                          {/* Ad + Variant + Qiymət */}
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] text-white font-semibold truncate">{prod?.name || item.product_id}</p>
                            {item.variant && (
                              <span className="inline-block text-[10px] text-gold/70 bg-gold/10 border border-gold/20 rounded-md px-1.5 py-0.5 mt-0.5">{item.variant.name}</span>
                            )}
                            <p className="text-[11px] text-white/35 mt-0.5">₼{unitPrice.toFixed(2)} × {item.quantity} = <span className="text-white/50 font-semibold">₼{(unitPrice * item.quantity).toFixed(2)}</span></p>
                          </div>
                          {/* Say kontrolları */}
                          <div className="flex items-center gap-1 bg-white/[0.04] rounded-lg p-0.5">
                            <button onClick={() => updateQty(item.product_id, item.variant_id || null, item.quantity - 1)}
                              className="w-7 h-7 rounded-md hover:bg-white/[0.10] text-white/50 hover:text-white flex items-center justify-center text-base font-bold transition-all">−</button>
                            <span className="w-7 text-center text-sm text-white font-bold tabular-nums">{item.quantity}</span>
                            <button onClick={() => updateQty(item.product_id, item.variant_id || null, item.quantity + 1)}
                              className="w-7 h-7 rounded-md hover:bg-white/[0.10] text-white/50 hover:text-white flex items-center justify-center text-base font-bold transition-all">+</button>
                          </div>
                          {/* Sil */}
                          <button onClick={() => removeItem(item.product_id, item.variant_id || null)}
                            className="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400/60 hover:text-red-400 flex items-center justify-center transition-all">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      );
                    })}</>
                  )}
                </div>

                {/* Məhsul əlavə et */}
                <div className="relative">
                  <button
                    onClick={() => { setShowProductPicker(v => !v); setVariantPicker(null); setProductSearch(''); }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] border border-dashed border-white/[0.10] hover:border-white/[0.20] text-white/40 hover:text-white text-[12px] font-semibold transition-all w-full justify-center"
                  >
                    {t('combo_add_product')}
                  </button>

                  <AnimatePresence>
                    {showProductPicker && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                        className="absolute bottom-full mb-2 left-0 right-0 bg-[#141414] border border-white/[0.10] rounded-xl shadow-2xl z-20 overflow-hidden"
                        onClick={e => e.stopPropagation()}
                      >
                        {!variantPicker ? (
                          <>
                            <div className="p-2 border-b border-white/[0.06]">
                              <input
                                autoFocus
                                type="text" value={productSearch}
                                onChange={e => setProductSearch(e.target.value)}
                                placeholder={t('search')}
                                className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/20"
                              />
                            </div>
                            <div className="max-h-48 overflow-y-auto py-1">
                              {loadingVariants ? (
                                <div className="flex items-center justify-center py-4"><Loader2 size={16} className="animate-spin text-white/20" /></div>
                              ) : filteredProducts.length === 0 ? (
                                <p className="px-3 py-3 text-sm text-white/25 text-center">{t('error_not_found')}</p>
                              ) : filteredProducts.map(p => (
                                <button key={p.id} onClick={() => loadVariantsForProduct(p)}
                                  className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-white/[0.05] transition-colors text-left">
                                  <div className="w-8 h-8 rounded-lg overflow-hidden border border-white/[0.07] flex-shrink-0 bg-white/[0.03]">
                                    {p.image_url && <img src={p.image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-white truncate">{p.name}</p>
                                    <p className="text-[11px] text-white/35">₼{p.price?.toFixed(2)}</p>
                                  </div>
                                  <ChevronDown size={13} className="text-white/20 -rotate-90" />
                                </button>
                              ))}
                            </div>
                          </>
                        ) : (
                          /* Variant seçim panel */
                          <>
                            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.06]">
                              <button onClick={() => setVariantPicker(null)} className="text-white/30 hover:text-white transition-colors">
                                <ChevronDown size={14} className="rotate-90" />
                              </button>
                              <span className="text-[11px] text-white/40 font-semibold uppercase tracking-wider">{t('combo_select_variant')}</span>
                            </div>
                            <div className="py-1">
                              {variantPicker.variants.map(v => {
                                const prod = products.find(p => p.id === variantPicker.productId);
                                return (
                                  <button key={v.id}
                                    onClick={() => prod && addProductWithVariant(prod, v.id, v)}
                                    className="flex items-center justify-between w-full px-4 py-2.5 hover:bg-white/[0.05] transition-colors text-left">
                                    <div>
                                      <p className="text-sm text-white font-medium">{v.name}</p>
                                      <p className="text-[11px] text-gold/70">₼{v.price?.toFixed(2)}</p>
                                    </div>
                                    {v.is_default && (
                                      <span className="text-[9px] uppercase tracking-widest text-white/25 border border-white/[0.08] rounded-md px-1.5 py-0.5">{t('combo_default_variant')}</span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Qənaət göstəricisi - premium 3 sətir */}
                {separateTotal > 0 && comboPrice > 0 && (
                  <div className="mt-3 rounded-xl border border-white/[0.07] overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05]">
                      <span className="text-[11px] text-white/35 uppercase tracking-wider">{t('combo_normal_price')}</span>
                      <span className="text-[13px] text-white/40 line-through tabular-nums">₼{separateTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05]">
                      <span className="text-[11px] text-white/35 uppercase tracking-wider">{t('combo_price')}</span>
                      <span className="text-[14px] font-bold text-gold tabular-nums">₼{comboPrice.toFixed(2)}</span>
                    </div>
                    {saving_amount > 0 && (
                      <div className="flex items-center justify-between px-4 py-2.5 bg-green-500/[0.06]">
                        <span className="text-[11px] text-green-400/80 uppercase tracking-wider font-semibold">{t('combo_saving')}</span>
                        <span className="text-[13px] font-bold text-green-400 tabular-nums">−₼{saving_amount.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
    </div>
  );

  return createPortal(
    <>
      {/* ── MOBILE: slide-in/out from right — AnimatePresence direct child ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="combo-mobile"
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
                <h2 className="text-[17px] font-serif font-bold text-white">{editingCombo ? t('combo_edit') : t('combo_new')}</h2>
                <p className="text-[9px] uppercase tracking-[0.3em] text-gold/60 mt-0.5">COMBO</p>
              </div>
              <div className="w-10" />
            </div>

            {/* Mobile Body */}
            <div className="flex-1 pb-32">
              {formContent}
            </div>

            {/* Mobile Footer */}
            <div className="fixed bottom-0 inset-x-0 px-5 pb-8 pt-4 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/95 to-transparent z-10">
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 py-3.5 rounded-2xl bg-white/[0.05] border border-white/[0.08] text-white/50 text-[12px] font-bold uppercase tracking-widest transition-all">
                  {t('cancel')}
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-gold via-[#E7C85A] to-gold text-black font-bold text-[12px] uppercase tracking-widest hover:brightness-110 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {t('combo_save')}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── DESKTOP: centered modal (no exit animation needed, hidden on mobile) ── */}
      {open && (
        <div className="fixed inset-0 z-[120] hidden md:flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-[#0e0e0e] border border-white/[0.08] rounded-2xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between px-8 py-6 bg-[#0e0e0e] border-b border-white/[0.06]">
              <div>
                <h2 className="text-2xl font-serif font-bold text-white">{editingCombo ? t('combo_edit') : t('combo_new')}</h2>
                <p className="text-[11px] uppercase tracking-[0.2em] text-gold/70 mt-0.5">COMBO</p>
              </div>
              <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/[0.08] hover:bg-white/[0.06] text-white/40 hover:text-white transition-all">
                <X size={16} />
              </button>
            </div>
            {formContent}
            <div className="sticky bottom-0 px-8 py-5 bg-[#0e0e0e] border-t border-white/[0.06] flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] text-white/50 hover:text-white text-[12px] font-bold uppercase tracking-widest transition-all">
                {t('cancel')}
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-gold via-[#E7C85A] to-gold text-black font-bold text-[12px] uppercase tracking-widest hover:brightness-110 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {t('combo_save')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </>,
    document.body
  );
}
