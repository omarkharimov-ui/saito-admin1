'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Plus, Minus, CheckCircle, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import type { Product, ManualItem, ProductVariant } from '../types';

interface ManualOrderModalProps {
  tableNum: number;
  extraTableNums?: number[];
  onClose: () => void;
  onCreated: (newOrderId?: string) => void;
}

export function ManualOrderModal({ tableNum, extraTableNums = [], onClose, onCreated }: ManualOrderModalProps) {
  const { t } = useLanguage();
  const [products, setProducts]           = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [search, setSearch]               = useState('');
  const [items, setItems]                 = useState<ManualItem[]>([]);
  const [note, setNote]                   = useState('');
  const [submitting, setSubmitting]       = useState(false);
  const [variantPicker, setVariantPicker] = useState<{ product: Product; variants: ProductVariant[] } | null>(null);
  const [loadingVariants, setLoadingVariants] = useState(false);

  useEffect(() => {
    supabase
      .from('products')
      .select('id, name, price, image_url, category:categories(name)')
      .eq('is_available', true)
      .order('name')
      .then(({ data }) => {
        setProducts((data || []) as Product[]);
        setLoadingProducts(false);
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
      addItemWithVariant(product, null);
    } else {
      setVariantPicker({ product, variants });
    }
  };

  const addItemWithVariant = (product: Product, variant: ProductVariant | null) => {
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
        product_name: (() => { const az = (i.product as any).name_az || i.product.name; return i.variant ? `${az} (${i.variant.name})` : az; })(),
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

      // If extra tables were merged in, create placeholder child orders for them
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
        ? `${tableNum}+${extraTableNums.join('+')} `
        : String(tableNum);
      toast.success(t('order_created_for_table').replace('{table}', tableLabel));
      onCreated(createdOrderId);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || t('error'));
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  if (typeof document === 'undefined') return null;
  return createPortal(
    <>

      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/35 backdrop-blur-sm z-50"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4 pointer-events-none">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ type: 'spring', stiffness: 340, damping: 32 }}
        onTouchMove={e => e.stopPropagation()}
        style={{ touchAction: 'pan-y' }}
        className="pointer-events-auto w-full md:max-w-xl h-[100dvh] md:h-[600px] bg-[#111] border border-white/8 rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="px-6 pt-6 pb-4 flex items-start justify-between flex-shrink-0">
          <div>
            <p className="text-gold font-black text-3xl tracking-widest leading-none">
              {t('table_label')} {tableNum}{extraTableNums.length > 0 ? `+${extraTableNums.join('+')}` : ''}
            </p>
            <p className="text-white/30 text-xs mt-1">{t('manual_order_create')}</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0">
          {/* Product list */}
          <div className="flex-1 flex flex-col min-h-0 border-b md:border-b-0 md:border-r border-white/5 max-h-[45%] md:max-h-none">
            <div className="px-4 pb-3 flex-shrink-0">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t('search_products')}
                  className="w-full bg-white/5 border border-white/8 rounded-xl pl-8 pr-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/30 transition-colors"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1 min-h-0">
              {loadingProducts ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-white/50" />
                </div>
              ) : filtered.map(product => {
                const inCart = items.filter(i => i.product.id === product.id).reduce((s, i) => s + i.quantity, 0);
                const isLoadingThis = loadingVariants && variantPicker?.product.id === product.id;
                const isExpanded = variantPicker?.product.id === product.id && !loadingVariants;
                return (
                  <React.Fragment key={product.id}>
                    <button
                      onClick={() => handleProductClick(product)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-left group ${
                        isExpanded ? 'bg-white/[0.06]' : 'hover:bg-white/5'
                      }`}
                    >
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} loading="lazy" decoding="async" className="w-9 h-9 rounded-lg object-cover flex-shrink-0 bg-white/5" />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-white/5 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{product.name}</p>
                        <p className="text-gold text-xs">{product.price.toFixed(2)} ₼</p>
                      </div>
                      {isLoadingThis ? (
                        <Loader2 size={13} className="animate-spin text-white/30 flex-shrink-0" />
                      ) : inCart > 0 ? (
                        <span className="text-[10px] font-black bg-gold text-black px-1.5 py-0.5 rounded-full">{inCart}</span>
                      ) : (
                        <Plus size={14} className="text-white/20 group-hover:text-white/60 transition-colors" />
                      )}
                    </button>
                    {isExpanded && (
                      <div className="mx-1 mb-1 rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-hidden">
                        {variantPicker!.variants.map(v => (
                          <button key={v.id} onClick={() => addItemWithVariant(variantPicker!.product, v)}
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.06] transition-colors text-left border-b border-white/[0.05] last:border-0">
                            <div>
                              <p className="text-white text-sm font-medium">{v.name}</p>
                              {v.is_default && <span className="text-[9px] text-white/25 uppercase tracking-wider">{t('combo_default_variant')}</span>}
                            </div>
                            <span className="text-gold text-xs font-bold">{v.price.toFixed(2)} ₼</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Cart */}
          <div className="md:w-60 flex flex-col flex-shrink-0 min-h-0 flex-1 md:flex-none">
            <p className="text-[9px] uppercase tracking-widest text-white/30 px-4 pt-4 pb-2 flex-shrink-0">{t('selected_items')}</p>
            <div className="flex-1 overflow-y-auto px-4 space-y-2 min-h-0">
              {items.length === 0 ? (
                <p className="text-white/15 text-xs text-center pt-8">{t('no_items_yet')}</p>
              ) : items.map(item => {
                const key = `${item.product.id}__${item.variant?.id || 'base'}`;
                const unitPrice = item.variant?.price ?? item.product.price;
                return (
                <div key={key} className="bg-white/[0.03] rounded-xl px-3 py-2">
                  <p className="text-white text-xs font-medium truncate">{item.product.name}</p>
                  {item.variant && <p className="text-[10px] text-gold/60 truncate mb-0.5">{item.variant.name}</p>}
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => changeQty(key, -1)} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center"><Minus size={12} /></button>
                      <span className="text-white text-sm w-5 text-center">{item.quantity}</span>
                      <button onClick={() => changeQty(key, 1)} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center"><Plus size={12} /></button>
                    </div>
                    <span className="text-gold text-xs">{(unitPrice * item.quantity).toFixed(2)} ₼</span>
                  </div>
                </div>
                );
              })}
            </div>
            <div className="p-4 border-t border-white/5 flex-shrink-0 space-y-2">
              <input
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={t('note_placeholder')}
                className="w-full bg-white/5 border border-white/8 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/20 outline-none focus:border-white/30"
              />
              <div className="flex items-center justify-between mb-1">
                <span className="text-white/30 text-[10px] uppercase tracking-widest">{t('total_label')}</span>
                <span className="text-white/70 font-black text-lg">{total.toFixed(2)} ₼</span>
              </div>
              <button
                onClick={handleSubmit}
                disabled={items.length === 0 || submitting}
                className="w-full flex items-center justify-center gap-2 py-3 bg-white/10 text-white text-sm font-bold rounded-xl hover:bg-white/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                {t('create_order')}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
      </div>
    </>,
    document.body
  );
}
