'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Search, Plus, Minus, Send, Loader2, Trash2, Utensils, ShoppingBag, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { Product, ManualItem, ProductVariant } from '../types';

const fmt = (n: number) => n.toFixed(2);

interface Category { id: string; name: string; }

interface ManualOrderModalProps {
  tableNum: number;
  extraTableNums?: number[];
  onClose: () => void;
  onCreated: (newOrderId?: string) => void;
}

const cardVariants = {
  hover: { y: -2, transition: { duration: 0.15 } },
  tap: { scale: 0.94, transition: { duration: 0.08 } },
};

function PCard({ p, cart, onAdd, language }: { p: Product; cart: number; onAdd: () => void; language: string }) {
  const { lightMode } = useTheme();
  const name = language === 'en' ? (p as any).name_en || p.name : language === 'ru' ? (p as any).name_ru || p.name : (p as any).name_az || p.name;
  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const [imgErr, setImgErr] = useState(false);
  const showImg = !!p.image_url && !imgErr;
  return (
    <motion.button layout="position" initial={false} variants={cardVariants}
      whileHover="hover" whileTap="tap"
      onClick={onAdd}
      className={`relative rounded-xl text-left border transition-all flex flex-col overflow-hidden aspect-square hover:bg-white/[0.06] ${lightMode ? 'bg-gray-50 border-gray-200' : 'bg-[#141414] border-white/[0.07]'}`}
    >
      <div className={`flex-1 min-h-0 w-full overflow-hidden flex items-center justify-center ${lightMode ? 'bg-gray-50' : 'bg-white/[0.03]'}`}>
        {showImg
          ? <img src={p.image_url!} alt={name} className="w-full h-full object-cover" onError={() => setImgErr(true)} />
          : <span className={`text-xl font-black ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>{initials}</span>
        }
      </div>
      <div className="px-3 pb-3 pt-2.5 flex flex-col gap-0.5">
        <p className={`text-sm font-semibold truncate leading-tight ${lightMode ? 'text-gray-800' : 'text-white/85'}`}>{name}</p>
        <p className="text-sm font-black text-gold">₼{fmt(p.price)}</p>
      </div>
      {cart > 0 && (
        <motion.span key={cart} initial={{ scale: 1.4 }} animate={{ scale: 1 }}
          className="absolute bottom-2 right-2 w-6 h-6 rounded-full bg-gold text-black text-[11px] font-black flex items-center justify-center shadow-lg">
          {cart}
        </motion.span>
      )}
    </motion.button>
  );
}

export function ManualOrderModal({ tableNum, extraTableNums = [], onClose, onCreated }: ManualOrderModalProps) {
  const { t, language } = useLanguage();
  const { lightMode } = useTheme();
  const searchRef = useRef<HTMLInputElement>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [items, setItems] = useState<ManualItem[]>([]);
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway' | 'delivery'>('dine_in');
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
    setTimeout(() => searchRef.current?.focus(), 100);
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
      return [...prev, { product, variant, quantity: 1, note: '' }];
    });
    setVariantPicker(null);
  };

  const removeItem = (key: string) => {
    setItems(prev => prev.filter(i => `${i.product.id}__${i.variant?.id || 'base'}` !== key));
  };

  const changeQty = (key: string, delta: number) => {
    setItems(prev =>
      prev.map(i => `${i.product.id}__${i.variant?.id || 'base'}` === key ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i)
          .filter(i => i.quantity > 0)
    );
  };

  const setItemNote = (key: string, note: string) => {
    setItems(prev =>
      prev.map(i => `${i.product.id}__${i.variant?.id || 'base'}` === key ? { ...i, note } : i)
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
        course: 'main',
        note: i.note?.trim() || null,
      }));
      let createdOrderId: string | undefined;
      if (activeOrders && activeOrders.length > 0) {
        const existing = activeOrders[0];
        await supabase.from('order_items').insert(newItems.map(i => ({ ...i, order_id: existing.id })));
        await supabase.from('orders').update({
          total_amount: (existing.total_amount || 0) + total, status: 'confirmed', kitchen_status: 'pending',
          order_type: orderType,
          ...(note.trim() ? { customer_note: note.trim() } : {}),
        }).eq('id', existing.id);
        createdOrderId = existing.id;
      } else {
        const { data: order, error } = await supabase
          .from('orders')
          .insert({ table_number: tableNum, total_amount: total, status: 'confirmed', order_type: orderType, customer_note: note.trim() || null })
          .select().single();
        if (error) throw error;
        await supabase.from('order_items').insert(newItems.map(i => ({ ...i, order_id: order.id })));
        createdOrderId = order.id;
      }
      if (createdOrderId && extraTableNums.length > 0) {
        for (const extraNum of extraTableNums) {
          await supabase.from('orders').insert({
            table_number: extraNum, total_amount: 0, status: 'paid', merged_into: createdOrderId, kitchen_status: 'pending', is_rush: false, order_type: orderType,
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
    <div className={`flex items-center justify-center py-12 rounded-2xl border ${lightMode ? 'bg-white border-gray-200' : 'bg-[#0a0a0a] border-white/[0.06]'}`}>
      <Loader2 size={20} className={`animate-spin ${lightMode ? 'text-gray-300' : 'text-white/20'}`} />
    </div>
  );

  return (
    <>
      <div style={{ background: lightMode ? '#ffffff' : 'linear-gradient(180deg,#141414 0%,#0d0d0d 100%)' }}
        className={`rounded-2xl border select-none ${lightMode ? 'border-gray-200' : 'border-white/[0.06]'}`}>

        {/* ─── HEADER ─── */}
        <div className={`border-b px-5 py-3.5 ${lightMode ? 'border-gray-200 bg-white' : 'border-white/[0.06] bg-[#0c0c0c]'}`}>
          <div className="flex items-center justify-between">
            <p className="font-black text-lg tracking-widest leading-none"
              style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D67B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {t('table')} {tableNum}{extraTableNums.length > 0 ? `+${extraTableNums.join('+')}` : ''}</p>
            <div className="flex items-center gap-2">
              {cartCount > 0 && (
                <span className={`text-sm ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>{cartCount} {t('items')}</span>
              )}
              <button onClick={onClose} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${lightMode ? 'bg-gray-100 hover:bg-gray-200 text-gray-400 hover:text-gray-900' : 'bg-white/5 hover:bg-white/10 text-white/40 hover:text-white'}`}>
                <X size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* ─── BODY: Products (left) + Cart (right) ─── */}
        <div className="flex-1 flex overflow-hidden">

          {/* ═══ LEFT: Products ═══ */}
          <section className="flex-1 h-full flex flex-col overflow-hidden p-5">
            {/* Title */}
            <div className="flex-shrink-0 mb-4">
              <h2 className="text-xl text-amber-400 font-bold">{t('new_order')} · {t('table')} {tableNum}{extraTableNums.length > 0 ? `+${extraTableNums.join('+')}` : ''}</h2>
            </div>
            {/* Search */}
            <div className="relative mb-3 flex-shrink-0">
              <Search size={16} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${lightMode ? 'text-gray-300' : 'text-white/20'}`} />
              <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} placeholder={t('search_products')}
                onKeyDown={e => { if (e.key === 'Escape') { searchRef.current?.blur(); } }}
                className={`w-full border rounded-xl pl-10 pr-9 py-3 text-sm outline-none focus:border-white/20 transition-all ${lightMode ? 'bg-gray-50/80 border-gray-200 text-gray-900 placeholder:text-gray-400' : 'bg-white/[0.04] border-white/[0.06] text-white placeholder:text-white/20'}`} />
              {search && <button onClick={() => { setSearch(''); searchRef.current?.focus(); }} className={`absolute right-3 top-1/2 -translate-y-1/2 hover:text-white/50 ${lightMode ? 'text-gray-300' : 'text-white/20'}`}><X size={16} /></button>}
            </div>
            {/* Categories */}
            <div className="flex-shrink-0 mb-2">
              <div className="flex gap-1.5 overflow-x-auto">
                {categories.map(c => (
                  <button key={c.id} onClick={() => setCat(cat === c.id ? null : c.id)}
                    className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-xs font-bold tracking-wider whitespace-nowrap transition-all ${
                      cat === c.id ? 'bg-white text-black shadow-lg' : 'bg-white/[0.06] text-white/50 hover:text-white/80'
                    }`}
                  >{c.name}</button>
                ))}
              </div>
            </div>
            {/* Product grid */}
            <div className="flex-1 overflow-y-auto pr-2">
              {filtered.length === 0 ? (
              <div className={`flex flex-col items-center justify-center h-full ${lightMode ? 'text-gray-200' : 'text-white/15'}`}>
                <Search size={40} className="mb-3 opacity-30" />
                <p className="text-base">{t('not_found')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                {filtered.map(p => {
                  const inCart = items.filter(i => i.product.id === p.id).reduce((s, i) => s + i.quantity, 0);
                  return <PCard key={p.id} p={p} cart={inCart} onAdd={() => handleProductClick(p)} language={language} />;
                })}
              </div>
            )}
          </div>
          </section>

          {/* ═══ RIGHT: Cart ═══ */}
          <section className={`w-[380px] h-full border-l bg-neutral-950/50 flex flex-col flex-shrink-0 ${lightMode ? 'border-gray-200' : 'border-white/[0.06]'}`}>
            <div className={`flex items-center justify-between px-5 py-4 border-b ${lightMode ? 'border-gray-200' : 'border-white/[0.06]'}`}>
              <span className={`text-base font-bold ${lightMode ? 'text-gray-900' : 'text-white'}`}>{t('cart')}{cartCount > 0 && <> · {cartCount}</>}</span>
              {items.length > 0 && (
                <button onClick={() => setItems([])} className={`text-xs hover:text-white/50 font-semibold tracking-wider uppercase ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>
                  {t('clear')}
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              <AnimatePresence initial={false}>
              {items.length === 0 ? (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`flex flex-col items-center justify-center h-full py-8 ${lightMode ? 'text-gray-200' : 'text-white/15'}`}>
                  <p className="text-sm font-medium">{t('no_items_yet')}</p>
                </motion.div>
              ) : items.map(item => {
                const key = `${item.product.id}__${item.variant?.id || 'base'}`;
                const unitPrice = item.variant?.price ?? item.product.price;
                return (
                  <motion.div key={key} layout="position"
                    initial={{ opacity: 0, scale: 0.95, height: 0 }} animate={{ opacity: 1, scale: 1, height: 'auto' }}
                    exit={{ opacity: 0, scale: 0.95, height: 0 }} transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <div className={`flex items-start gap-3 rounded-xl px-4 py-3 border ${lightMode ? 'bg-gray-50 border-gray-200' : 'bg-[#141414] border-white/[0.06]'}`}>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate ${lightMode ? 'text-gray-700' : 'text-white/80'}`}>{getPName(item.product)}</p>
                        {item.variant && <p className="text-xs text-gold/60 truncate">{item.variant.name}</p>}
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-xs text-gold font-bold">₼{fmt(unitPrice * item.quantity)}</span>
                        </div>
                        {item.note !== undefined && (
                          <input value={item.note || ''} onChange={e => setItemNote(key, e.target.value)}
                            placeholder={t('note_placeholder')}
                            className={`mt-1.5 w-full border rounded-lg px-2.5 py-1.5 text-[11px] placeholder:text-white/15 outline-none focus:border-white/20 transition-all ${lightMode ? 'bg-gray-50/80 border-gray-200 text-gray-500' : 'bg-white/[0.04] border-white/[0.06] text-white/60'}`} />
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 pt-0.5">
                        <div className={`flex items-center border rounded-lg overflow-hidden ${lightMode ? 'bg-gray-50/80 border-gray-200' : 'bg-white/[0.04] border-white/[0.07]'}`}>
                          <button onClick={() => changeQty(key, -1)}
                            className={`w-12 h-12 flex items-center justify-center active:scale-90 transition-all ${lightMode ? 'text-gray-400 hover:text-gray-900' : 'text-white/40 hover:text-white'}`}>
                            <Minus size={16} />
                          </button>
                          <span className={`text-[13px] w-7 text-center font-black tabular-nums ${lightMode ? 'text-gray-900' : 'text-white'}`}>{item.quantity}</span>
                          <button onClick={() => changeQty(key, 1)}
                            className="w-12 h-12 flex items-center justify-center text-gold active:scale-90 transition-all">
                            <Plus size={16} />
                          </button>
                        </div>
                        <button onClick={() => removeItem(key)}
                          className={`w-12 h-12 rounded-full flex items-center justify-center hover:text-red-400 hover:bg-red-500/10 active:scale-90 transition-all flex-shrink-0 ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              </AnimatePresence>
            </div>

            <div className={`px-5 py-4 border-t space-y-3 ${lightMode ? 'border-gray-200' : 'border-white/[0.06]'}`}>
              {/* Order type toggle */}
              <div className={`flex items-center gap-1.5 p-1 border rounded-xl ${lightMode ? 'bg-gray-50/80 border-gray-200' : 'bg-white/[0.04] border-white/[0.08]'}`}>
                <button onClick={() => setOrderType('dine_in')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-bold tracking-widest uppercase transition-all duration-200 ${orderType === 'dine_in' ? 'bg-white/10 text-white shadow-sm' : 'text-white/30 hover:text-white/50'}`}>
                  <Utensils size={13} /> {t('dine_in')}
                </button>
                <button onClick={() => setOrderType('takeaway')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-bold tracking-widest uppercase transition-all duration-200 ${orderType === 'takeaway' ? 'bg-white/10 text-white shadow-sm' : 'text-white/30 hover:text-white/50'}`}>
                  <ShoppingBag size={13} /> {t('takeaway')}
                </button>
                <button onClick={() => setOrderType('delivery')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-bold tracking-widest uppercase transition-all duration-200 ${orderType === 'delivery' ? 'bg-white/10 text-white shadow-sm' : 'text-white/30 hover:text-white/50'}`}>
                  <Package size={13} /> {t('delivery')}
                </button>
              </div>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder={t('note_placeholder')}
                className={`w-full border rounded-xl px-4 py-3 text-sm outline-none ${lightMode ? 'bg-gray-50/80 border-gray-200 text-gray-900 placeholder:text-gray-400' : 'bg-white/[0.04] border-white/[0.06] text-white placeholder:text-white/20'}`} />
              <div className="flex items-center justify-between">
                <span className={`text-xs uppercase tracking-widest font-semibold ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>{t('total_label')}</span>
                <span className="text-xl font-black tracking-tight tabular-nums"
                  style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D67B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>₼{fmt(total)}</span>
              </div>
              <button onClick={handleSubmit} disabled={items.length === 0 || submitting}
                style={items.length > 0 && !submitting ? { background: 'linear-gradient(135deg,#D4AF37 0%,#F5D67B 50%,#D4AF37 100%)', backgroundSize: '200% 200%', boxShadow: '0 4px 20px rgba(212,175,55,0.3)' } : { background: lightMode ? '#f3f4f6' : 'rgba(255,255,255,0.04)' }}
                className="w-full py-4 rounded-xl text-sm font-bold active:scale-[0.98] disabled:opacity-25 flex items-center justify-center gap-2.5 transition-all"
              >{submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} <span className={items.length > 0 && !submitting ? 'text-black' : 'text-white/40'}>{t('create_order')}</span></button>
            </div>
          </section>
        </div>

      </div>

      {/* ─── VARIANT PICKER ─── */}
      {variantPicker && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
            className={`bg-[#111] border rounded-3xl w-full max-w-sm max-h-[80vh] overflow-y-auto p-6 ${lightMode ? 'border-gray-200' : 'border-white/[0.08]'}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-base font-bold ${lightMode ? 'text-gray-900' : 'text-white'}`}>{getPName(variantPicker.product)}</h3>
              <button onClick={() => setVariantPicker(null)} className={lightMode ? 'text-gray-300 hover:text-gray-600' : 'text-white/20 hover:text-white/60'}><X size={18} /></button>
            </div>
            <div className="space-y-1">
              {loadingVariants ? (
                <div className="flex justify-center py-6"><Loader2 size={20} className={`animate-spin ${lightMode ? 'text-gray-400' : 'text-white/30'}`} /></div>
              ) : (
                variantPicker.variants.map(v => (
                  <button key={v.id} onClick={() => addItem(variantPicker.product, v)}
                    className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl hover:bg-white/[0.06] transition-colors border ${lightMode ? 'border-gray-200' : 'border-white/[0.06]'}`}>
                    <div>
                      <p className={`text-sm font-medium ${lightMode ? 'text-gray-900' : 'text-white'}`}>{v.name}</p>
                      {v.is_default && <span className={`text-[10px] uppercase tracking-wider ${lightMode ? 'text-gray-300' : 'text-white/25'}`}>{t('combo_default_variant')}</span>}
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
