'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import {
  Search, Plus, Minus, Send, X, Loader2, ShoppingBag, ArrowLeft, CheckCircle,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const fmt = (n: number) => n.toFixed(2);

interface Product {
  id: string; name: string; name_az?: string; name_en?: string; name_ru?: string;
  price: number; image_url: string | null; is_available?: boolean;
  category?: { name: string }[] | { name: string } | null;
}
interface ProductVariant { id: string; name: string; price: number; is_default: boolean; }
interface CartItem { product: Product; variant: ProductVariant | null; quantity: number; }

function PCard({ p, cart, onAdd, language }: { p: Product; cart: number; onAdd: () => void; language: string }) {
  const name = language === 'en' ? (p as any).name_en || p.name : language === 'ru' ? (p as any).name_ru || p.name : (p as any).name_az || p.name;
  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const [imgErr, setImgErr] = useState(false);
  const showImg = !!p.image_url && !imgErr;
  return (
    <motion.button layout initial={false} whileHover={{ y: -3 }} whileTap={{ scale: 0.95 }}
      onClick={onAdd}
      className="relative rounded-2xl p-4 text-left border border-white/[0.08] bg-[#141414] hover:bg-white/[0.06] transition-colors"
    >
      <div className="aspect-square rounded-xl bg-white/[0.03] mb-3 flex items-center justify-center overflow-hidden">
        {showImg
          ? <img src={p.image_url!} alt={name} className="w-full h-full object-cover" onError={() => setImgErr(true)} />
          : <span className="text-3xl font-black text-white/20">{initials}</span>
        }
      </div>
      <p className="text-sm font-semibold text-white/85 truncate leading-tight">{name}</p>
      <p className="text-sm font-black text-gold mt-0.5">₼{fmt(p.price)}</p>
      {cart > 0 && (
        <span className="absolute top-3 right-3 w-7 h-7 rounded-full bg-gold text-black text-xs font-black flex items-center justify-center shadow-lg">
          {cart}
        </span>
      )}
    </motion.button>
  );
}

function CartItemRow({ item, onQty, language }: {
  item: CartItem; onQty: (delta: number) => void; language: string;
}) {
  const name = language === 'en' ? (item.product as any).name_en || item.product.name
    : language === 'ru' ? (item.product as any).name_ru || item.product.name
    : (item.product as any).name_az || item.product.name;
  const unitPrice = item.variant?.price ?? item.product.price;
  return (
    <div className="flex items-center gap-3 bg-white/[0.03] rounded-xl px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white/80 truncate">{name}</p>
        {item.variant && <p className="text-xs text-gold/60 truncate">{item.variant.name}</p>}
        <p className="text-xs text-gold font-bold mt-0.5">₼{fmt(unitPrice * item.quantity)}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button onClick={() => onQty(-1)} className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/[0.12] transition-all">
          <Minus size={13} />
        </button>
        <span className="w-6 text-center text-sm font-bold text-white">{item.quantity}</span>
        <button onClick={() => onQty(1)} className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/[0.12] transition-all">
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}

export default function ManualOrderPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, language } = useLanguage();
  const tableNum = Number(params.tableId);
  const extraRaw = searchParams.get('extra');
  const extraTableNums: number[] = extraRaw ? extraRaw.split(',').map(Number).filter(n => !isNaN(n)) : [];

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<CartItem[]>([]);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [variantPicker, setVariantPicker] = useState<{ product: Product; variants: ProductVariant[] } | null>(null);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!tableNum || isNaN(tableNum)) { router.replace('/orders'); return; }
    supabase
      .from('products')
      .select('id, name, name_az, name_en, name_ru, price, image_url, is_available, category:categories(name)')
      .order('name_az')
      .then(({ data }) => {
        setProducts((data || []) as Product[]);
        setLoading(false);
      });
  }, [tableNum, router]);

  const getPName = useCallback((p: Product) => {
    if (language === 'en') return (p as any).name_en || p.name;
    if (language === 'ru') return (p as any).name_ru || p.name;
    return (p as any).name_az || p.name;
  }, [language]);

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
    setItems(prev => {
      const next = prev.map(i => `${i.product.id}__${i.variant?.id || 'base'}` === key ? { ...i, quantity: i.quantity + delta } : i);
      return next.filter(i => i.quantity > 0);
    });
  };

  const total = useMemo(() =>
    items.reduce((s, i) => s + (i.variant?.price ?? i.product.price) * i.quantity, 0),
    [items]
  );
  const cartCount = items.reduce((s, i) => s + i.quantity, 0);

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

      setSuccess(true);
      setTimeout(() => { router.push('/orders'); }, 1500);
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
  }, [products, search, getPName]);

  if (loading) return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[#0b0b0b]">
      <Loader2 size={28} className="animate-spin text-white/20" />
    </div>
  );

  if (success) return (
    <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-[#0b0b0b] text-center px-6">
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        className="w-24 h-24 rounded-full bg-emerald-500/15 flex items-center justify-center mb-6">
        <CheckCircle size={48} className="text-emerald-400" />
      </motion.div>
      <h2 className="text-2xl font-bold text-white mb-1">{t('order_created_for_table').replace('{table}', String(tableNum))}</h2>
      <p className="text-white/40 text-sm">{t('table')} {tableNum}</p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-[#0b0b0b] overflow-hidden select-none">
      {/* ─── HEADER ─── */}
      <header className="flex-shrink-0 border-b border-white/[0.06] bg-[#0f0f0f]">
        <div className="flex items-center gap-4 px-5 py-3">
          <button onClick={() => router.back()}
            className="flex items-center gap-1.5 text-white/40 hover:text-white/80 transition-colors text-sm font-semibold">
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-baseline gap-2 flex-shrink-0">
            <h1 className="text-lg font-bold text-white">{t('table')} {tableNum}</h1>
            {extraTableNums.length > 0 && (
              <span className="text-sm text-white/30">+{extraTableNums.join('+')}</span>
            )}
          </div>
          <div className="flex-1">
            <div className="relative max-w-lg ml-auto">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={t('search_products')}
                className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl pl-10 pr-9 py-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/[0.15] transition-colors"
              />
              {search && (
                <button onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50">
                  <X size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ─── MAIN CONTENT ─── */}
      <div className="flex-1 flex min-h-0">
        {/* ─── PRODUCT GRID ─── */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-white/15">
              <Search size={48} className="mb-4 opacity-30" />
              <p className="text-base">{t('not_found')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
              {filtered.map(p => {
                const inCart = items.filter(i => i.product.id === p.id).reduce((s, i) => s + i.quantity, 0);
                return <PCard key={p.id} p={p} cart={inCart} onAdd={() => handleProductClick(p)} language={language} />;
              })}
            </div>
          )}
        </div>

        {/* ─── CART SIDEBAR ─── */}
        <aside className="w-[30%] min-w-[300px] max-w-[400px] flex flex-col border-l border-white/[0.06] bg-[#0f0f0f] flex-shrink-0">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
            <div>
              <h2 className="text-base font-bold text-white">{t('cart')}</h2>
              <p className="text-xs text-white/30">{t('table')} {tableNum}</p>
            </div>
            <button onClick={() => setItems([])}
              className="text-xs text-white/20 hover:text-white/50 transition-colors font-semibold tracking-wider uppercase">
              {t('clear')}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-white/15">
                <ShoppingBag size={40} className="mb-3 opacity-30" />
                <p className="text-sm font-medium">{t('cart_empty')}</p>
              </div>
            ) : (
              items.map(item => {
                const key = `${item.product.id}__${item.variant?.id || 'base'}`;
                return <CartItemRow key={key} item={item} onQty={(d) => changeQty(key, d)} language={language} />;
              })
            )}
          </div>

          <div className="px-5 py-4 border-t border-white/[0.06] space-y-3">
            <input value={note} onChange={e => setNote(e.target.value)}
              placeholder={t('note_placeholder')}
              className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-3.5 py-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/[0.15] transition-colors"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/30 uppercase tracking-widest font-semibold">{t('total_label')}</span>
              <span className="text-2xl font-black text-white tracking-tight">₼{fmt(total)}</span>
            </div>
            <button onClick={handleSubmit}
              disabled={items.length === 0 || submitting}
              className="w-full py-4 rounded-xl text-sm font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 transition-all hover:bg-amber-500/25"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {t('send_to_kitchen')}
            </button>
          </div>
        </aside>
      </div>

      {/* ─── VARIANT PICKER ─── */}
      <AnimatePresence>
      {variantPicker && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 300, damping: 27 }}
            className="bg-[#111] border border-white/[0.08] rounded-3xl w-full max-w-sm max-h-[80vh] overflow-y-auto p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white">{getPName(variantPicker.product)}</h3>
              <button onClick={() => setVariantPicker(null)} className="text-white/20 hover:text-white/60 transition-colors p-1">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-1.5">
              {loadingVariants ? (
                <div className="flex justify-center py-8"><Loader2 size={22} className="animate-spin text-white/30" /></div>
              ) : (
                variantPicker.variants.map(v => (
                  <button key={v.id} onClick={() => addItem(variantPicker.product, v)}
                    className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl hover:bg-white/[0.06] transition-colors border border-white/[0.06]">
                      <div className="text-left">
                        <p className="text-white text-sm font-medium">{v.name}</p>
                        {v.is_default && <span className="text-[10px] text-white/25 uppercase tracking-wider">{t('combo_default_variant')}</span>}
                      </div>
                      <span className="text-gold text-sm font-bold flex-shrink-0 ml-3">₼{fmt(v.price)}</span>
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
