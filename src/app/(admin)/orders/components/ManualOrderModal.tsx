'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, Plus, Minus, Send, Loader2, ChevronLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import type { Product, ManualItem, ProductVariant } from '../types';

const fmt = (n: number) => n.toFixed(2);

interface Category { id: string; name: string; }

interface ManualOrderModalProps {
  tableNum: number;
  extraTableNums?: number[];
  onClose: () => void;
  onCreated: (newOrderId?: string) => void;
}

function PCard({ p, cart, onAdd, language }: { p: Product; cart: number; onAdd: () => void; language: string }) {
  const name = language === 'en' ? (p as any).name_en || p.name : language === 'ru' ? (p as any).name_ru || p.name : (p as any).name_az || p.name;
  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const [imgErr, setImgErr] = useState(false);
  const showImg = !!p.image_url && !imgErr;
  return (
    <motion.button layout initial={false} whileHover={{ y: -3 }} whileTap={{ scale: 0.95 }}
      onClick={onAdd}
      className="relative rounded-2xl p-5 text-left border border-white/[0.08] bg-[#141414] hover:bg-white/[0.06] transition-colors"
    >
      <div className="aspect-square rounded-xl bg-white/[0.03] mb-3 flex items-center justify-center overflow-hidden">
        {showImg
          ? <img src={p.image_url!} alt={name} className="w-full h-full object-cover" onError={() => setImgErr(true)} />
          : <span className="text-3xl font-black text-white/20">{initials}</span>
        }
      </div>
      <p className="text-base font-semibold text-white/85 truncate leading-tight">{name}</p>
      <p className="text-base font-black text-gold mt-1">₼{fmt(p.price)}</p>
      {cart > 0 && (
        <span className="absolute top-3 right-3 w-8 h-8 rounded-full bg-gold text-black text-sm font-black flex items-center justify-center shadow-lg">
          {cart}
        </span>
      )}
    </motion.button>
  );
}

export function ManualOrderModal({ tableNum, extraTableNums = [], onClose, onCreated }: ManualOrderModalProps) {
  const { t, language } = useLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [items, setItems] = useState<ManualItem[]>([]);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [variantPicker, setVariantPicker] = useState<{ product: Product; variants: ProductVariant[] } | null>(null);
  const [loadingVariants, setLoadingVariants] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from('products').select('id, name, name_az, name_en, name_ru, price, image_url, is_available, category_id, category:categories(name)').order('name_az'),
      supabase.from('categories').select('*').order('sort_order'),
    ]).then(([pr, cr]) => {
      setProducts((pr.data || []) as Product[]);
      setCategories((cr.data || []) as Category[]);
      if (cr.data?.length) setCat(cr.data[0].id);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    let l = products;
    if (cat) l = l.filter(p => p.category_id === cat);
    if (search) { const q = search.toLowerCase(); l = l.filter(p => getPName(p).toLowerCase().includes(q)); }
    return l;
  }, [products, cat, search]);

  const handleProductClick = async (product: Product) => {
    const { data } = await supabase
      .from('product_variants')
      .select('id, name, price, is_default')
      .eq('product_id', product.id)
      .order('is_default', { ascending: false });
    const variants = (data || []) as ProductVariant[];
    if (variants.length === 0) {
      addItem(product, null);
    } else {
      setVariantPicker({ product, variants });
    }
  };

  const addItem = (product: Product, variant: ProductVariant | null) => {
    const key = `${product.id}__${variant?.id || 'base'}`;
    setItems(prev => {
      const ex = prev.find(i => `${i.product.id}__${i.variant?.id || 'base'}` === key);
      if (ex) return prev.map(i => `${i.product.id}__${i.variant?.id || 'base'}` === key ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product, variant, quantity: 1 }];
    });
    setVariantPicker(null);
  };

  const changeQty = (key: string, delta: number) => {
    setItems(prev =>
      prev.map(i => `${i.product.id}__${i.variant?.id || 'base'}` === key ? { ...i, quantity: i.quantity + delta } : i)
          .filter(i => i.quantity > 0)
    );
  };

  const total = items.reduce((s, i) => s + (i.variant?.price ?? i.product.price) * i.quantity, 0);
  const cartCount = items.reduce((s, i) => s + i.quantity, 0);

  const getPName = (p: Product) => {
    if (language === 'en') return (p as any).name_en || p.name;
    if (language === 'ru') return (p as any).name_ru || p.name;
    return (p as any).name_az || p.name;
  };

  const handleSubmit = async () => {
    if (items.length === 0) return;
    setSubmitting(true);
    try {
      const { data: activeOrders } = await supabase
        .from('orders')
        .select('id, total_amount')
        .eq('table_number', tableNum)
        .in('status', ['new', 'confirmed'])
        .order('created_at', { ascending: false })
        .limit(1);
      const newItems = items.map(i => ({
        product_id: i.product.id,
        variant_id: i.variant?.id || null,
        product_name: (() => { const az = getPName(i.product); return i.variant ? `${az} (${i.variant.name})` : az; })(),
        quantity: i.quantity,
        unit_price: i.variant?.price ?? i.product.price,
        total_price: (i.variant?.price ?? i.product.price) * i.quantity,
      }));
      let createdOrderId: string | undefined;
      if (activeOrders && activeOrders.length > 0) {
        const existing = activeOrders[0];
        await supabase.from('order_items').insert(newItems.map(i => ({ ...i, order_id: existing.id })));
        await supabase.from('orders').update({
          total_amount: (existing.total_amount || 0) + total, status: 'confirmed', kitchen_status: 'pending',
          ...(note.trim() ? { customer_note: note.trim() } : {}),
        }).eq('id', existing.id);
        createdOrderId = existing.id;
      } else {
        const { data: order, error } = await supabase
          .from('orders')
          .insert({ table_number: tableNum, total_amount: total, status: 'confirmed', customer_note: note.trim() || null })
          .select().single();
        if (error) throw error;
        await supabase.from('order_items').insert(newItems.map(i => ({ ...i, order_id: order.id })));
        createdOrderId = order.id;
      }
      if (createdOrderId && extraTableNums.length > 0) {
        for (const extraNum of extraTableNums) {
          await supabase.from('orders').insert({
            table_number: extraNum, total_amount: 0, status: 'paid', merged_into: createdOrderId, kitchen_status: 'pending', is_rush: false,
          });
        }
      }
      const tableLabel = extraTableNums.length > 0 ? `${tableNum}+${extraTableNums.join('+')}` : String(tableNum);
      toast.success(t('order_created_for_table').replace('{table}', tableLabel), { id: 'action-toast' });
      onCreated(createdOrderId);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || t('error'), { id: 'action-toast' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-12 bg-[#0a0a0a] rounded-2xl border border-white/[0.06]">
      <Loader2 size={20} className="animate-spin text-white/20" />
    </div>
  );

  return (
    <>
      <div className="bg-[#0a0a0a] rounded-2xl border border-white/[0.06] overflow-hidden select-none">

        {/* ─── HEADER ─── */}
        <div className="border-b border-white/[0.06] bg-[#0c0c0c] px-6 py-4">
          <div className="flex items-center gap-4">
            <button onClick={onClose} className="text-white/40 hover:text-white/80 p-1">
              <ChevronLeft size={22} />
            </button>
            <p className="text-xl font-bold text-white">{t('table')} {tableNum}{extraTableNums.length > 0 ? `+${extraTableNums.join('+')}` : ''}</p>
            {cartCount > 0 && (
              <span className="ml-auto text-sm text-white/30">{cartCount} {t('items')}</span>
            )}
          </div>
        </div>

        {/* ─── SEARCH ─── */}
        <div className="px-4 pt-4 pb-3 border-b border-white/[0.06]">
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('search_products')}
              className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl pl-11 pr-4 py-4 text-base text-white placeholder:text-white/20 outline-none" />
            {search && <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20"><X size={18} /></button>}
          </div>
        </div>

        {/* ─── MAIN SPLIT ─── */}
        <div className="flex flex-col lg:flex-row min-h-[500px]">
          {/* ─── PRODUCT GRID (left ~70%) ─── */}
          <div className="flex-1 overflow-y-auto px-5 py-5">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-white/15">
                <Search size={48} className="mb-3 opacity-30" />
                <p className="text-base">{t('not_found')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-4">
                {filtered.map(p => {
                  const inCart = items.filter(i => i.product.id === p.id).reduce((s, i) => s + i.quantity, 0);
                  return <PCard key={p.id} p={p} cart={inCart} onAdd={() => handleProductClick(p)} language={language} />;
                })}
              </div>
            )}
          </div>

          {/* ─── CART SIDEBAR (right ~30%, always visible) ─── */}
          <div className="lg:w-[30%] lg:min-w-[320px] lg:max-w-[400px] border-t lg:border-t-0 lg:border-l border-white/[0.06] bg-[#0c0c0c] flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
              <span className="text-lg font-bold text-white">{t('cart')}{cartCount > 0 && <> · {cartCount}</>}</span>
              {items.length > 0 && (
                <button onClick={() => setItems([])} className="text-sm text-white/20 hover:text-white/50 font-semibold tracking-wider uppercase">
                  {t('clear')}
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 max-h-[30vh]">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-white/15 py-8">
                  <p className="text-base font-medium">{t('no_items_yet')}</p>
                </div>
              ) : items.map(item => {
                const key = `${item.product.id}__${item.variant?.id || 'base'}`;
                const unitPrice = item.variant?.price ?? item.product.price;
                return (
                  <div key={key} className="flex items-center gap-4 bg-[#141414] rounded-xl px-5 py-4 border border-white/[0.06]">
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-semibold text-white/80 truncate">{getPName(item.product)}</p>
                      {item.variant && <p className="text-sm text-gold/60 truncate">{item.variant.name}</p>}
                      <p className="text-sm text-gold font-bold mt-1">₼{fmt(unitPrice * item.quantity)}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <button onClick={() => changeQty(key, -1)}
                        className="w-12 h-12 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/[0.12] transition-all">
                        <Minus size={16} />
                      </button>
                      <span className="w-8 text-center text-lg font-bold text-white">{item.quantity}</span>
                      <button onClick={() => changeQty(key, 1)}
                        className="w-12 h-12 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/[0.12] transition-all">
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-6 py-5 border-t border-white/[0.06] space-y-4">
              <input value={note} onChange={e => setNote(e.target.value)} placeholder={t('note_placeholder')}
                className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3.5 text-base text-white placeholder:text-white/20 outline-none" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/30 uppercase tracking-widest font-semibold">{t('total_label')}</span>
                <span className="text-2xl font-black text-white">₼{fmt(total)}</span>
              </div>
              <button onClick={handleSubmit} disabled={items.length === 0 || submitting}
                className="w-full py-5 rounded-xl text-base font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 active:scale-[0.98] disabled:opacity-30 flex items-center justify-center gap-3 hover:bg-amber-500/25 transition-all"
              >{submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />} {t('create_order')}</button>
            </div>
          </div>
        </div>

        {/* ─── CATEGORY STRIP (bottom of modal) ─── */}
        {categories.length > 0 && (
          <div className="border-t border-white/[0.06] bg-[#0c0c0c] px-4 py-3">
            <div className="flex gap-2 overflow-x-auto">
              {categories.map(c => (
                <button key={c.id} onClick={() => setCat(cat === c.id ? null : c.id)}
                  className={`flex-shrink-0 px-6 py-3 rounded-xl text-sm font-bold tracking-wider whitespace-nowrap ${cat === c.id ? 'bg-white text-black' : 'bg-white/[0.04] text-white/40'}`}
                >{c.name}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── VARIANT PICKER ─── */}
      {variantPicker && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-[#111] border border-white/[0.08] rounded-3xl w-full max-w-sm max-h-[80vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white">{getPName(variantPicker.product)}</h3>
              <button onClick={() => setVariantPicker(null)} className="text-white/20 hover:text-white/60"><X size={18} /></button>
            </div>
            <div className="space-y-1">
              {loadingVariants ? (
                <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-white/30" /></div>
              ) : (
                variantPicker.variants.map(v => (
                  <button key={v.id} onClick={() => addItem(variantPicker.product, v)}
                    className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl hover:bg-white/[0.06] transition-colors border border-white/[0.06]">
                    <div>
                      <p className="text-white text-sm font-medium">{v.name}</p>
                      {v.is_default && <span className="text-[10px] text-white/25 uppercase tracking-wider">{t('combo_default_variant')}</span>}
                    </div>
                    <span className="text-gold text-sm font-bold">₼{fmt(v.price)}</span>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}
