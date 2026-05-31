'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, Plus, Minus, CheckCircle, Loader2, ShoppingBag, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import type { Product, ManualItem, ProductVariant } from '../types';

const fmt = (n: number) => n.toFixed(2);

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
    <motion.button layout initial={false} whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }}
      onClick={onAdd}
      className="relative rounded-2xl p-3 text-left border border-white/[0.08] bg-white/[0.04]"
    >
      <div className="aspect-square rounded-xl bg-white/[0.03] mb-2 flex items-center justify-center overflow-hidden">
        {showImg
          ? <img src={p.image_url!} alt={name} className="w-full h-full object-cover" onError={() => setImgErr(true)} />
          : <span className="text-2xl font-black text-white/20">{initials}</span>
        }
      </div>
      <p className="text-xs font-semibold text-white/85 truncate">{name}</p>
      <p className="text-xs font-black text-gold">₼{fmt(p.price)}</p>
      {cart > 0 && <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-gold text-black text-[10px] font-black flex items-center justify-center">{cart}</span>}
    </motion.button>
  );
}

export function ManualOrderModal({ tableNum, extraTableNums = [], onClose, onCreated }: ManualOrderModalProps) {
  const { t, language } = useLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<ManualItem[]>([]);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [variantPicker, setVariantPicker] = useState<{ product: Product; variants: ProductVariant[] } | null>(null);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [showCart, setShowCart] = useState(false);

  useEffect(() => {
    supabase
      .from('products')
      .select('id, name, name_az, name_en, name_ru, price, image_url, is_available, category:categories(name)')
      .order('name_az')
      .then(({ data }) => {
        setProducts((data || []) as Product[]);
        setLoading(false);
      });
  }, []);

  const handleProductClick = async (product: Product) => {
    setLoadingVariants(true);
    const { data } = await supabase
      .from('product_variants')
      .select('id, name, price, is_default')
      .eq('product_id', product.id)
      .order('is_default', { ascending: false });
    setLoadingVariants(false);
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
          total_amount: (existing.total_amount || 0) + total,
          status: 'confirmed',
          kitchen_status: 'pending',
          ...(note.trim() ? { customer_note: note.trim() } : {}),
        }).eq('id', existing.id);
        createdOrderId = existing.id;
      } else {
        const { data: order, error } = await supabase
          .from('orders')
          .insert({ table_number: tableNum, total_amount: total, status: 'confirmed', customer_note: note.trim() || null, items: [] })
          .select().single();
        if (error) throw error;
        await supabase.from('order_items').insert(newItems.map(i => ({ ...i, order_id: order.id })));
        createdOrderId = order.id;
      }

      if (createdOrderId && extraTableNums.length > 0) {
        for (const extraNum of extraTableNums) {
          await supabase.from('orders').insert({
            table_number: extraNum,
            total_amount: 0,
            status: 'paid',
            merged_into: createdOrderId,
            kitchen_status: 'pending',
            is_rush: false,
          });
        }
      }
      const tableLabel = extraTableNums.length > 0
        ? `${tableNum}+${extraTableNums.join('+')}`
        : String(tableNum);
      toast.success(t('order_created_for_table').replace('{table}', tableLabel), { id: 'action-toast' });
      onCreated(createdOrderId);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || t('error'), { id: 'action-toast' });
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search) return products;
    const q = search.toLowerCase();
    return products.filter(p => getPName(p).toLowerCase().includes(q));
  }, [products, search, language]);

  if (loading) return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#0a0a0a]">
      <Loader2 size={24} className="animate-spin text-white/20" />
    </div>
  );

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#0a0a0a] overflow-hidden select-none">

      {/* ─── HEADER ─── */}
      <div className="flex-shrink-0 border-b border-white/[0.06] bg-[#0c0c0c] px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="text-white/40 hover:text-white/80">
            <X size={20} />
          </button>
          <div className="flex-1">
            <p className="text-lg font-bold text-white">{t('table')} {tableNum}{extraTableNums.length > 0 ? `+${extraTableNums.join('+')}` : ''}</p>
            <p className="text-xs text-white/30">{t('manual_order_create')}</p>
          </div>
          <button onClick={() => setShowCart(!showCart)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] text-xs font-semibold text-white/70">
            <ShoppingBag size={13} /> ₼{fmt(total)}
            {cartCount > 0 && <span className="w-4 h-4 rounded-full bg-gold text-black text-[8px] font-black flex items-center justify-center">{cartCount}</span>}
          </button>
        </div>
      </div>

      {/* ─── SEARCH ─── */}
      <div className="flex-shrink-0 px-3 pt-2 pb-1">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('search_products')}
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder:text-white/20 outline-none" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/20"><X size={14} /></button>}
        </div>
      </div>

      {/* ─── MAIN CONTENT ─── */}
      <div className="flex-1 flex min-h-0">
        <div className={`flex-1 overflow-y-auto px-3 pb-4 ${showCart ? 'hidden lg:block' : ''}`}>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-white/15">
              <Search size={40} className="mb-3 opacity-30" />
              <p className="text-sm">{t('not_found')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
              {filtered.map(p => {
                const inCart = items.filter(i => i.product.id === p.id).reduce((s, i) => s + i.quantity, 0);
                return <PCard key={p.id} p={p} cart={inCart} onAdd={() => handleProductClick(p)} language={language} />;
              })}
            </div>
          )}
        </div>

        {/* ─── CART ─── */}
        <AnimatePresence>
        {showCart && (
          <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 320, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
            className="hidden lg:flex flex-col border-l border-white/[0.06] bg-[#0c0c0c] flex-shrink-0 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <span className="text-sm font-bold text-white">{t('selected_items')}</span>
              <button onClick={() => setItems([])} className="text-[10px] text-white/20 hover:text-white/50 mr-3">{t('clear')}</button>
              <button onClick={() => setShowCart(false)} className="text-white/20 hover:text-white/60"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-white/15 text-xs">{t('no_items_yet')}</div>
              ) : items.map(item => {
                const key = `${item.product.id}__${item.variant?.id || 'base'}`;
                const unitPrice = item.variant?.price ?? item.product.price;
                return (
                  <div key={key} className="flex items-center gap-3 bg-white/[0.03] rounded-xl px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white/80 truncate">{getPName(item.product)}</p>
                      {item.variant && <p className="text-[10px] text-gold/60 truncate">{item.variant.name}</p>}
                      <p className="text-[10px] text-gold font-bold">₼{fmt(unitPrice * item.quantity)}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => changeQty(key, -1)} className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40"><Minus size={11} /></button>
                      <span className="w-5 text-center text-sm font-bold text-white">{item.quantity}</span>
                      <button onClick={() => changeQty(key, 1)} className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40"><Plus size={11} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-4 border-t border-white/[0.06] space-y-2">
              <input value={note} onChange={e => setNote(e.target.value)} placeholder={t('note_placeholder')}
                className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/20 outline-none" />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/30 uppercase tracking-widest">{t('total_label')}</span>
                <span className="text-lg font-black text-white">₼{fmt(total)}</span>
              </div>
              <button onClick={handleSubmit} disabled={items.length === 0 || submitting}
                className="w-full py-3 rounded-xl text-sm font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 active:scale-[0.98] disabled:opacity-30 flex items-center justify-center gap-2"
              >{submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} {t('create_order')}</button>
            </div>
          </motion.div>
        )}
        </AnimatePresence>
      </div>

      {/* ─── MOBILE CART ─── */}
      <AnimatePresence>
      {showCart && items.length > 0 && (
        <motion.div initial={{ y: 200 }} animate={{ y: 0 }} exit={{ y: 200 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="lg:hidden flex-shrink-0 border-t border-white/[0.06] bg-[#0c0c0c] px-4 py-3 space-y-2 max-h-60 overflow-y-auto">
          {items.map(item => {
            const key = `${item.product.id}__${item.variant?.id || 'base'}`;
            const unitPrice = item.variant?.price ?? item.product.price;
            return (
              <div key={key} className="flex items-center gap-2 bg-white/[0.03] rounded-xl px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white/80 truncate">{getPName(item.product)}</p>
                  <p className="text-[10px] text-gold font-bold">₼{fmt(unitPrice * item.quantity)}</p>
                </div>
                <button onClick={() => changeQty(key, -1)} className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40"><Minus size={10} /></button>
                <span className="w-4 text-center text-xs font-bold text-white">{item.quantity}</span>
                <button onClick={() => changeQty(key, 1)} className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40"><Plus size={10} /></button>
              </div>
            );
          })}
          <div className="flex items-center gap-3 pt-1">
            <div className="flex-1"><span className="text-[10px] text-white/30">{t('total_label')}</span><p className="text-lg font-black text-white">₼{fmt(total)}</p></div>
            <button onClick={handleSubmit} disabled={submitting}
              className="flex-1 py-3 rounded-xl text-sm font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 active:scale-[0.97] disabled:opacity-30 flex items-center justify-center gap-2"
            >{submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} {t('create_order')}</button>
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* ─── VARIANT PICKER ─── */}
      <AnimatePresence>
      {variantPicker && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 27 }}
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
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-white/[0.06] transition-colors border border-white/[0.06]">
                    <div>
                      <p className="text-white text-sm font-medium">{v.name}</p>
                      {v.is_default && <span className="text-[9px] text-white/25 uppercase tracking-wider">{t('combo_default_variant')}</span>}
                    </div>
                    <span className="text-gold text-xs font-bold">₼{fmt(v.price)}</span>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </div>
      )}
      </AnimatePresence>
    </div>
  );
}
