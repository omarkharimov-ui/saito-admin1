'use client';

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, Plus, Minus, Loader2, ShoppingBag, Send, CreditCard,
  Printer, CheckCircle2, Utensils, ImageOff,
} from 'lucide-react';
import { deductStockForOrder } from '@/lib/stockAutomation';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { useLanguage, LanguageProvider } from '@/lib/i18n/LanguageContext';
import { ThemeProvider } from '@/lib/theme/ThemeContext';

interface Category {
  id: string; name: string;
  name_az?: string; name_en?: string; name_ru?: string;
}

interface Product {
  id: string; name: string;
  name_az?: string; name_en?: string; name_ru?: string;
  price: number; image_url: string | null;
  is_available?: boolean; is_ready_product?: boolean;
  direct_ingredient_id?: string | null; category_id?: string | null;
}

interface RecipeIngredient {
  menu_item_id: string; ingredient_id: string;
  quantity_required: number; quantity_brutto: number | null;
}

interface Ingredient {
  id: string; name: string; unit: string; current_stock: number;
}

interface CartItem { product: Product; quantity: number; }

interface OrderItem {
  id: string; product_id: string | null; product_name: string;
  quantity: number; unit_price: number; total_price: number;
}

interface OrderData {
  id: string; table_number: number; total_amount: number;
  status: string; kitchen_status: string | null;
  created_at: string; order_items?: OrderItem[];
}

const fmt = (n: number) => n.toFixed(2);

function ProductCard({ product, inStock, inCart, onAdd }: { product: Product; inStock: boolean; inCart: number; onAdd: () => void }) {
  const [imgErr, setImgErr] = useState(false);
  const { t } = useLanguage();
  const lang = useLanguage().language;
  const name = lang === 'en' ? (product as any).name_en || product.name : lang === 'ru' ? (product as any).name_ru || product.name : (product as any).name_az || product.name;
  useEffect(() => { setImgErr(false); }, [product.image_url]);
  return (
    <button onClick={() => inStock && onAdd()}
      className={`relative rounded-2xl p-4 text-left transition-all border-2 ${
        inStock ? 'bg-white/[0.04] border-white/[0.08] active:bg-white/[0.1]' : 'opacity-40 border-white/[0.03] bg-white/[0.02]'
      }`}
    >
      <div className="aspect-square rounded-xl bg-white/[0.03] mb-3 overflow-hidden flex items-center justify-center">
        {product.image_url && !imgErr ? (
          <img src={product.image_url} alt={name} className="w-full h-full object-cover" onError={() => setImgErr(true)} />
        ) : (
          <ImageOff size={24} className="text-white/[0.08]" />
        )}
      </div>
      <p className="text-sm font-semibold text-white/90 truncate leading-tight">{name}</p>
      <p className="text-sm font-black text-gold mt-0.5">₼{fmt(product.price)}</p>
      {!inStock && (
        <div className="absolute inset-0 rounded-2xl bg-black/50 flex items-center justify-center">
          <span className="text-xs font-bold text-white/70 bg-black/70 px-3 py-1.5 rounded-xl">{t('out_of_stock_label')}</span>
        </div>
      )}
      {inCart > 0 && (
        <span className="absolute top-3 right-3 w-7 h-7 rounded-full bg-gold text-black text-xs font-black flex items-center justify-center shadow-lg">
          {inCart}
        </span>
      )}
    </button>
  );
}

function POSPageInner() {
  const { t, language } = useLanguage();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<RecipeIngredient[]>([]);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [tableCount, setTableCount] = useState(30);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [payingOrder, setPayingOrder] = useState<string | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<OrderData | null>(null);

  const getProductName = useCallback((p: Product) => {
    if (language === 'en') return (p as any).name_en || p.name;
    if (language === 'ru') return (p as any).name_ru || p.name;
    return (p as any).name_az || p.name;
  }, [language]);

  const fetchData = useCallback(async () => {
    try {
      const [catR, prodR, ingR, recR, ordR, setR] = await Promise.all([
        supabase.from('categories').select('*').order('sort_order'),
        supabase.from('products').select('*, category:categories(name)').order('name_az'),
        supabase.from('ingredients').select('id, name, unit, current_stock'),
        supabase.from('recipes').select('menu_item_id, ingredient_id, quantity_required, quantity_brutto'),
        supabase.from('orders').select('*, order_items(*)').in('status', ['new', 'confirmed']).order('created_at', { ascending: false }),
        supabase.from('settings').select('qr_table_count').limit(1),
      ]);
      setCategories((catR.data || []) as Category[]);
      setProducts((prodR.data || []) as Product[]);
      setIngredients((ingR.data || []) as Ingredient[]);
      setRecipes((recR.data || []) as RecipeIngredient[]);
      setOrders((ordR.data || []) as OrderData[]);
      const tc = Number((setR.data as any)?.[0]?.qr_table_count);
      if (tc >= 1 && tc <= 200) setTableCount(tc);
      if (!activeCategory && catR.data?.length) setActiveCategory(catR.data[0].id);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const df = () => { if (timer) clearTimeout(timer); timer = setTimeout(fetchData, 1000); };
    const ch = createRealtimeChannel('pos3')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, df)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, df)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients' }, df)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, df)
      .subscribe();
    const poll = setInterval(fetchData, 10000);
    return () => { if (timer) clearTimeout(timer); removeRealtimeChannel(ch); clearInterval(poll); };
  }, [fetchData]);

  const stockMap = useMemo(() => {
    const m: Record<string, number> = {};
    ingredients.forEach(i => { m[i.id] = i.current_stock; });
    return m;
  }, [ingredients]);

  const productAvail = useMemo(() => {
    const a: Record<string, boolean> = {};
    const recMap: Record<string, RecipeIngredient[]> = {};
    recipes.forEach(r => { if (!recMap[r.menu_item_id]) recMap[r.menu_item_id] = []; recMap[r.menu_item_id].push(r); });
    products.forEach(p => {
      if (p.is_ready_product && p.direct_ingredient_id) {
        a[p.id] = (stockMap[p.direct_ingredient_id] ?? 0) > 0;
      } else {
        const pr = recMap[p.id] || [];
        a[p.id] = pr.length === 0 || pr.every(r => (stockMap[r.ingredient_id] ?? 0) > 0);
      }
    });
    return a;
  }, [products, recipes, stockMap]);

  const activeOrderForTable = useMemo(() =>
    selectedTable ? orders.find(o => o.table_number === selectedTable && (o.status === 'new' || o.status === 'confirmed')) || null : null,
    [orders, selectedTable]
  );

  const addToCart = useCallback((p: Product) => {
    setCart(prev => { const i = prev.findIndex(x => x.product.id === p.id); if (i >= 0) { const n = [...prev]; n[i] = { ...n[i], quantity: n[i].quantity + 1 }; return n; } return [...prev, { product: p, quantity: 1 }]; });
  }, []);

  const changeQty = useCallback((id: string, d: number) => {
    setCart(prev => prev.map(i => i.product.id === id ? { ...i, quantity: Math.max(0, i.quantity + d) } : i).filter(i => i.quantity > 0));
  }, []);

  const cartTotal = useMemo(() => cart.reduce((s, i) => s + i.product.price * i.quantity, 0), [cart]);

  const handleSend = useCallback(async () => {
    if (!selectedTable || cart.length === 0) return;
    setSubmitting(true);
    try {
      const items = cart.map(i => ({ product_id: i.product.id, product_name: getProductName(i.product), quantity: i.quantity, unit_price: i.product.price, total_price: i.product.price * i.quantity }));
      if (activeOrderForTable) {
        await supabase.from('order_items').insert(items.map(i => ({ ...i, order_id: activeOrderForTable.id })));
        await supabase.from('orders').update({ total_amount: (activeOrderForTable.total_amount || 0) + cartTotal, status: 'confirmed', kitchen_status: 'pending' }).eq('id', activeOrderForTable.id);
      } else {
        const { data: o, error } = await supabase.from('orders').insert({ table_number: selectedTable, total_amount: cartTotal, status: 'confirmed', kitchen_status: 'pending' }).select().single();
        if (error) throw error;
        await supabase.from('order_items').insert(items.map(i => ({ ...i, order_id: o.id })));
      }
      setCart([]); setShowCart(false); fetchData();
    } catch (e: any) { console.error(e); }
    finally { setSubmitting(false); }
  }, [selectedTable, cart, cartTotal, activeOrderForTable, fetchData, getProductName]);

  const handlePay = useCallback(async (orderId: string) => {
    setPayingOrder(orderId);
    try {
      await supabase.from('orders').update({ status: 'paid' }).eq('id', orderId);
      try { await deductStockForOrder(orderId); } catch (e) { console.error(e); }
      setReceiptOrder(orders.find(o => o.id === orderId) || null);
      fetchData();
    } catch (e: any) { console.error(e); }
    finally { setPayingOrder(null); }
  }, [orders, fetchData]);

  const getCatName = useCallback((cat: Category) => {
    if (language === 'en') return (cat as any).name_en || cat.name;
    if (language === 'ru') return (cat as any).name_ru || cat.name;
    return (cat as any).name_az || cat.name;
  }, [language]);

  const filteredProducts = useMemo(() => {
    let list = products;
    if (activeCategory) list = list.filter(p => p.category_id === activeCategory);
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter(p => getProductName(p).toLowerCase().includes(q)); }
    return list;
  }, [products, activeCategory, search, getProductName]);

  if (loading) return (
    <div className="h-dvh flex items-center justify-center bg-[#0a0a0a]">
      <Loader2 size={28} className="animate-spin text-white/20" />
    </div>
  );

  if (receiptOrder) return (
    <div className="h-dvh flex items-center justify-center bg-[#0a0a0a] p-6">
      <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} className="bg-[#111] border border-white/[0.06] rounded-3xl p-8 max-w-sm w-full text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-5"><CheckCircle2 size={40} className="text-emerald-400" /></div>
        <h2 className="text-2xl font-bold text-white mb-2">{t('pay')} Uğurlu</h2>
        <p className="text-white/40 text-base mb-8">{t('table')} {receiptOrder.table_number} • ₼{fmt(receiptOrder.total_amount)}</p>
        <div className="space-y-3">
          <button onClick={() => window.print()} className="w-full py-4 rounded-2xl bg-white/10 text-white text-base font-bold hover:bg-white/20 transition-all flex items-center justify-center gap-2"><Printer size={18} /> {t('print')}</button>
          <button onClick={() => { setReceiptOrder(null); setSelectedTable(null); }} className="w-full py-4 rounded-2xl bg-white/[0.04] text-white/50 text-base hover:text-white transition-all">{t('new_order')}</button>
        </div>
      </motion.div>
    </div>
  );

  return (
    <div className="h-dvh flex flex-col bg-[#0a0a0a] overflow-hidden select-none">

      {/* ══════════════════════════ TABLE STRIP ══════════════════════════ */}
      <header className="flex-shrink-0 border-b border-white/[0.06] bg-[#0c0c0c]">
        <div className="flex gap-2 px-3 pt-3 pb-2 overflow-x-auto scrollbar-none">
          {Array.from({ length: tableCount }, (_, i) => i + 1).map(num => {
            const order = orders.find(o => o.table_number === num && (o.status === 'new' || o.status === 'confirmed'));
            const sel = selectedTable === num;
            const ready = order?.kitchen_status === 'ready';
            return (
              <button key={num} onClick={() => { setSelectedTable(sel ? null : num); setCart([]); setShowCart(false); }}
                className={`relative flex-shrink-0 w-14 h-14 rounded-2xl text-sm font-bold transition-all ${
                  sel ? 'bg-white text-black shadow-xl scale-105' :
                  order ? (ready ? 'bg-emerald-500/20 text-emerald-400 border-2 border-emerald-500/40' : 'bg-amber-500/15 text-amber-400 border-2 border-amber-500/30') :
                  'bg-white/[0.04] text-white/30 border-2 border-transparent'
                }`}
              >
                {num}
                {order && <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-[#0c0c0c] ${ready ? 'bg-emerald-400' : 'bg-amber-400'}`} />}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 px-3 pb-3">
          <div className="flex-1 flex items-center gap-3 text-xs text-white/30">
            <span>{products.length} {t('items')}</span>
            <span className="text-white/[0.06]">|</span>
            <span>{orders.filter(o => o.status === 'confirmed' || o.status === 'new').length} {t('orders')}</span>
            {selectedTable && activeOrderForTable && (
              <>
                <span className="text-white/[0.06]">|</span>
                <span className="text-amber-400 font-semibold">{t('table')} {selectedTable} • ₼{fmt(activeOrderForTable.total_amount || 0)}</span>
              </>
            )}
          </div>
          <button onClick={() => setShowCart(!showCart)}
            className="relative flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.06] text-white/80 text-sm font-semibold hover:bg-white/[0.1] transition-all">
            <ShoppingBag size={16} /> ₼{fmt(cartTotal)}
            {cart.length > 0 && <span className="w-5 h-5 rounded-full bg-gold text-black text-[9px] font-black flex items-center justify-center">{cart.reduce((s, i) => s + i.quantity, 0)}</span>}
          </button>
        </div>
      </header>

      {/* ══════════════════════════ SEARCH + CATEGORY ══════════════════════════ */}
      <div className="flex-shrink-0 px-3 pt-3 pb-2 space-y-2">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`${t('search')}...`}
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-2xl pl-10 pr-4 py-3 text-base text-white placeholder:text-white/20 outline-none focus:border-white/20 transition-colors"
          />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/40"><X size={16} /></button>}
        </div>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
          {categories.map(cat => (
            <button key={cat.id} onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold tracking-wider transition-all ${
                activeCategory === cat.id ? 'bg-white text-black' : 'bg-white/[0.04] text-white/40'
              }`}
            >{getCatName(cat)}</button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════ PRODUCT GRID ══════════════════════════ */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          {!selectedTable && !showCart && (
            <div className="flex flex-col items-center justify-center h-full text-white/15">
              <Utensils size={48} className="mb-4 opacity-30" />
              <p className="text-base">Yuxarıdan masa seçin</p>
            </div>
          )}
          {selectedTable && filteredProducts.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-white/15">
              <ShoppingBag size={48} className="mb-4 opacity-30" />
              <p className="text-base">{t('search')}</p>
            </div>
          )}
          {selectedTable && filteredProducts.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredProducts.map(product => {
                const inStock = productAvail[product.id] !== false;
                const inCart = cart.find(i => i.product.id === product.id)?.quantity || 0;
                return (
                  <ProductCard key={product.id} product={product} inStock={inStock} inCart={inCart} onAdd={() => addToCart(product)} />
                );
              })}
            </div>
          )}
        </div>

        {/* ─── Cart sidebar (desktop) ─── */}
        <AnimatePresence>
          {showCart && (
            <motion.aside initial={{ width: 0, opacity: 0 }} animate={{ width: 380, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              className="hidden lg:flex flex-col border-l border-white/[0.06] bg-[#0c0c0c] overflow-hidden flex-shrink-0">
              <div className="flex-shrink-0 px-6 py-5 border-b border-white/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <ShoppingBag size={18} className="text-white/30" />
                  <span className="text-base font-bold text-white">{selectedTable ? `${t('table')} ${selectedTable}` : 'Səbət'}</span>
                </div>
                <div className="flex items-center gap-3">
                  {cart.length > 0 && <button onClick={() => setCart([])} className="text-xs text-white/20 hover:text-white/50">{t('clear')}</button>}
                  <button onClick={() => setShowCart(false)} className="text-white/20 hover:text-white/60"><X size={18} /></button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-white/15">
                    <ShoppingBag size={32} className="mb-3 opacity-30" />
                    <p className="text-sm">Səbət boşdur</p>
                  </div>
                ) : cart.map(item => (
                  <div key={item.product.id} className="flex items-center gap-4 bg-white/[0.03] rounded-2xl px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white/90 truncate">{getProductName(item.product)}</p>
                      <p className="text-xs text-gold font-bold">₼{fmt(item.product.price * item.quantity)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => changeQty(item.product.id, -1)}
                        className="w-9 h-9 rounded-xl bg-white/[0.08] flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.15] transition-all active:scale-90"><Minus size={14} /></button>
                      <span className="w-6 text-center text-base font-bold text-white tabular-nums">{item.quantity}</span>
                      <button onClick={() => changeQty(item.product.id, 1)}
                        className="w-9 h-9 rounded-xl bg-white/[0.08] flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.15] transition-all active:scale-90"><Plus size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex-shrink-0 px-6 py-5 border-t border-white/[0.06] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-widest text-white/30">{t('total')}</span>
                  <span className="text-2xl font-black text-white tabular-nums">₼{fmt(cartTotal)}</span>
                </div>
                <button onClick={handleSend} disabled={!selectedTable || cart.length === 0 || submitting}
                  className="w-full py-4 rounded-2xl text-base font-bold tracking-wide flex items-center justify-center gap-3 transition-all disabled:opacity-30 active:scale-[0.98] bg-amber-500/20 text-amber-400 border-2 border-amber-500/30"
                >{submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />} Mətbəxə Göndər</button>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* ─── Mobile cart bottom ─── */}
      <AnimatePresence>
        {showCart && selectedTable && cart.length > 0 && (
          <motion.div initial={{ y: 300 }} animate={{ y: 0 }} exit={{ y: 300 }}
            className="lg:hidden flex-shrink-0 border-t border-white/[0.06] bg-[#0c0c0c] px-4 py-3 space-y-2 max-h-64 overflow-y-auto">
            {cart.map(item => (
              <div key={item.product.id} className="flex items-center gap-3 bg-white/[0.03] rounded-xl px-3 py-2.5">
                <div className="flex-1 min-w-0"><p className="text-xs font-semibold text-white/80 truncate">{getProductName(item.product)}</p><p className="text-[10px] text-gold font-bold">₼{fmt(item.product.price * item.quantity)}</p></div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => changeQty(item.product.id, -1)} className="w-7 h-7 rounded-lg bg-white/[0.08] flex items-center justify-center text-white/40"><Minus size={11} /></button>
                  <span className="w-5 text-center text-xs font-bold text-white">{item.quantity}</span>
                  <button onClick={() => changeQty(item.product.id, 1)} className="w-7 h-7 rounded-lg bg-white/[0.08] flex items-center justify-center text-white/40"><Plus size={11} /></button>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-3 pt-1">
              <div className="flex-1"><span className="text-[10px] text-white/30">{t('total')}</span><p className="text-lg font-black text-white">₼{fmt(cartTotal)}</p></div>
              <button onClick={handleSend} disabled={!selectedTable || cart.length === 0 || submitting}
                className="flex-1 py-3.5 rounded-xl text-sm font-bold bg-amber-500/20 text-amber-400 border-2 border-amber-500/30 active:scale-[0.97] disabled:opacity-30 flex items-center justify-center gap-2"
              >{submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Göndər</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Orders for selected table ─── */}
      {selectedTable && (
        <div className="flex-shrink-0 border-t border-white/[0.06] bg-[#0c0c0c]">
          <div className="flex gap-3 overflow-x-auto px-3 py-2 scrollbar-none">
            {orders.filter(o => o.table_number === selectedTable && o.status !== 'paid').map(order => {
              const items = order.order_items || [];
              const ready = order.kitchen_status === 'ready';
              const count = items.reduce((s, i: any) => s + i.quantity, 0);
              const isPaying = payingOrder === order.id;
              return (
                <div key={order.id} className={`flex-shrink-0 w-80 rounded-2xl border-2 p-4 ${
                  ready ? 'border-emerald-500/40 bg-emerald-500/[0.04]' : 'border-white/[0.06] bg-white/[0.02]'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-bold ${ready ? 'text-emerald-400' : order.kitchen_status === 'preparing' ? 'text-blue-400' : 'text-amber-400'}`}>
                      {ready ? 'Hazırdır' : order.kitchen_status === 'preparing' ? 'Hazırlanır' : 'Gözləyir'}
                    </span>
                    <span className="text-sm font-black text-white/80">₼{fmt(order.total_amount || 0)}</span>
                  </div>
                  <div className="space-y-1 mb-3 max-h-24 overflow-y-auto">
                    {items.slice(0, 5).map((item: any) => (
                      <div key={item.id} className="flex items-center justify-between text-xs">
                        <span className="text-white/60 truncate">{item.quantity}x {item.product_name}</span>
                      </div>
                    ))}
                    {items.length > 5 && <p className="text-[10px] text-white/20">+{items.length - 5} daha</p>}
                  </div>
                  <div className="text-[10px] text-white/25 mb-2">{count} {t('items')}</div>
                  {ready && (
                    <button onClick={() => handlePay(order.id)} disabled={isPaying}
                      className="w-full py-3 rounded-xl text-sm font-bold tracking-wide bg-emerald-500/20 text-emerald-400 border-2 border-emerald-500/30 active:scale-[0.97] disabled:opacity-40 flex items-center justify-center gap-2"
                    >{isPaying ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={16} />} {t('pay')} • ₼{fmt(order.total_amount || 0)}</button>
                  )}
                </div>
              );
            })}
            {selectedTable && orders.filter(o => o.table_number === selectedTable && o.status !== 'paid').length === 0 && (
              <div className="flex items-center justify-center h-full w-full text-white/15 text-sm py-6">
                <ShoppingBag size={20} className="mr-2 opacity-30" /> Məhsul seçin
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

export default function POSPage() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <POSPageInner />
      </LanguageProvider>
    </ThemeProvider>
  );
}
