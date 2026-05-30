'use client';

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, Plus, Minus, Loader2, ShoppingBag, Send, CreditCard,
  Printer, CheckCircle2, Utensils, Clock, ChevronRight,
} from 'lucide-react';
import { deductStockForOrder } from '@/lib/stockAutomation';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';

/* ─── Types ─── */
interface Category {
  id: string; name: string;
  name_az?: string; name_en?: string; name_ru?: string;
  sort_order?: number;
}

interface Product {
  id: string; name: string;
  name_az?: string; name_en?: string; name_ru?: string;
  price: number; image_url: string | null;
  is_available?: boolean; is_ready_product?: boolean;
  direct_ingredient_id?: string | null; category_id?: string | null;
  category?: { name: string } | null;
}

interface RecipeIngredient {
  menu_item_id: string; ingredient_id: string;
  quantity_required: number; quantity_brutto: number | null;
}

interface Ingredient {
  id: string; name: string; unit: string; current_stock: number;
}

interface CartItem {
  product: Product; quantity: number;
}

interface OrderData {
  id: string; table_number: number; total_amount: number;
  status: string; kitchen_status: string | null;
  created_at: string; order_items?: any[];
}

const fmt = (n: number) => n.toFixed(2);

export default function POSPage() {
  /* ─── Data ─── */
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<RecipeIngredient[]>([]);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [tableCount, setTableCount] = useState(30);
  const [loading, setLoading] = useState(true);

  /* ─── UI ─── */
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [payingOrder, setPayingOrder] = useState<string | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<OrderData | null>(null);

  /* ─── Fetch ─── */
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
      if (tc >= 1 && tc <= 200) { setTableCount(tc); }
      if (!activeCategory && catR.data?.length) setActiveCategory(catR.data[0].id);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const df = () => { if (timer) clearTimeout(timer); timer = setTimeout(fetchData, 1000); };
    const ch = createRealtimeChannel('pos2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, df)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, df)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients' }, df)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, df)
      .subscribe();
    const poll = setInterval(fetchData, 10000);
    return () => { if (timer) clearTimeout(timer); removeRealtimeChannel(ch); clearInterval(poll); };
  }, [fetchData]);

  /* ─── Stock availability ─── */
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
      const items = cart.map(i => ({ product_id: i.product.id, product_name: i.product.name, quantity: i.quantity, unit_price: i.product.price, total_price: i.product.price * i.quantity }));
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
  }, [selectedTable, cart, cartTotal, activeOrderForTable, fetchData]);

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

  const filteredProducts = useMemo(() => {
    let list = products;
    if (activeCategory) list = list.filter(p => p.category_id === activeCategory);
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter(p => p.name.toLowerCase().includes(q)); }
    return list;
  }, [products, activeCategory, search]);

  /* ─── Loading ─── */
  if (loading) return (
    <div className="h-dvh flex items-center justify-center bg-[#0a0a0a]">
      <Loader2 size={28} className="animate-spin text-white/20" />
    </div>
  );

  /* ─── Receipt ─── */
  if (receiptOrder) return (
    <div className="h-dvh flex items-center justify-center bg-[#0a0a0a] p-6">
      <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} className="bg-[#111] border border-white/[0.06] rounded-3xl p-8 max-w-sm w-full text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4"><CheckCircle2 size={32} className="text-emerald-400" /></div>
        <h2 className="text-xl font-bold text-white mb-1">Ödəniş Uğurlu</h2>
        <p className="text-white/40 text-sm mb-6">Masa {receiptOrder.table_number} • ₼{fmt(receiptOrder.total_amount)}</p>
        <div className="space-y-2">
          <button onClick={() => window.print()} className="w-full py-3 rounded-xl bg-white/10 text-white text-sm font-bold hover:bg-white/20 transition-all flex items-center justify-center gap-2"><Printer size={14} /> Qəbz Çap Et</button>
          <button onClick={() => { setReceiptOrder(null); setSelectedTable(null); }} className="w-full py-3 rounded-xl bg-white/[0.04] text-white/50 text-sm hover:text-white transition-all">Yeni Sifariş</button>
        </div>
      </motion.div>
    </div>
  );

  return (
    <div className="h-dvh flex flex-col bg-[#0a0a0a] overflow-hidden">

      {/* ════════════════════════════════════════
          HEADER — Table + Status pills
      ════════════════════════════════════════ */}
      <header className="flex-shrink-0 border-b border-white/[0.06] bg-[#0c0c0c]">
        {/* Table strip */}
        <div className="flex gap-1.5 px-3 pt-3 pb-2 overflow-x-auto scrollbar-none">
          {Array.from({ length: tableCount }, (_, i) => i + 1).map(num => {
            const order = orders.find(o => o.table_number === num && (o.status === 'new' || o.status === 'confirmed'));
            const sel = selectedTable === num;
            const ready = order?.kitchen_status === 'ready';
            return (
              <button key={num} onClick={() => { setSelectedTable(sel ? null : num); setCart([]); setShowCart(false); }}
                className={`relative flex-shrink-0 w-11 h-11 rounded-xl text-xs font-bold transition-all active:scale-90 ${
                  sel ? 'bg-white text-black shadow-lg' :
                  order ? (ready ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/15 text-amber-400 border border-amber-500/20') :
                  'bg-white/[0.04] text-white/30 hover:bg-white/[0.08] border border-transparent'
                }`}
              >
                {num}
                {order && <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${ready ? 'bg-emerald-400' : 'bg-amber-400'}`} />}
              </button>
            );
          })}
        </div>

        {/* Active order summary + cart button */}
        <div className="flex items-center gap-2 px-3 pb-3">
          <div className="flex-1 flex items-center gap-3 text-[11px] text-white/30">
            <span>{products.length} məhsul</span>
            <span className="text-white/[0.06]">|</span>
            <span>{orders.filter(o => o.status === 'confirmed' || o.status === 'new').length} sifariş</span>
            {selectedTable && activeOrderForTable && (
              <>
                <span className="text-white/[0.06]">|</span>
                <span className="text-amber-400 font-semibold">Masa {selectedTable} • ₼{fmt(activeOrderForTable.total_amount || 0)}</span>
              </>
            )}
          </div>
          {/* Cart button */}
          <button onClick={() => setShowCart(!showCart)}
            className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] text-white/70 text-xs font-semibold hover:bg-white/[0.1] transition-all">
            <ShoppingBag size={13} />
            ₼{fmt(cartTotal)}
            {cart.length > 0 && <span className="w-4 h-4 rounded-full bg-gold text-black text-[8px] font-black flex items-center justify-center">{cart.reduce((s, i) => s + i.quantity, 0)}</span>}
          </button>
        </div>
      </header>

      {/* ════════════════════════════════════════
          CATEGORY TABS + SEARCH
      ════════════════════════════════════════ */}
      <div className="flex-shrink-0 px-3 pt-3 pb-2 space-y-2">
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Məhsul axtar..." autoFocus
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/20 transition-colors"
          />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/40"><X size={14} /></button>}
        </div>
        {/* Category pills */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
          {categories.map(cat => (
            <button key={cat.id} onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-lg text-[10px] font-bold tracking-wider transition-all ${
                activeCategory === cat.id ? 'bg-white text-black' : 'bg-white/[0.04] text-white/40 hover:bg-white/[0.08]'
              }`}
            >{cat.name}</button>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════════════
          MAIN: Product Grid + Cart
      ════════════════════════════════════════ */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Product grid */}
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          {!selectedTable && !showCart && (
            <div className="flex flex-col items-center justify-center h-full text-white/15">
              <Utensils size={36} className="mb-3 opacity-30" />
              <p className="text-sm">Yuxarıdan masa seçin</p>
            </div>
          )}
          {selectedTable && filteredProducts.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-white/15">
              <ShoppingBag size={36} className="mb-3 opacity-30" />
              <p className="text-sm">Məhsul tapılmadı</p>
            </div>
          )}
          {selectedTable && filteredProducts.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
              {filteredProducts.map(product => {
                const inStock = productAvail[product.id] !== false;
                const inCart = cart.find(i => i.product.id === product.id)?.quantity || 0;
                return (
                  <motion.button key={product.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    onClick={() => inStock && addToCart(product)} disabled={!inStock}
                    className={`relative rounded-2xl p-3 text-left transition-all duration-200 border ${
                      inStock
                        ? 'bg-white/[0.04] hover:bg-white/[0.08] hover:-translate-y-0.5 active:scale-[0.97] cursor-pointer border-white/[0.06]'
                        : 'opacity-30 cursor-not-allowed bg-white/[0.02] border-white/[0.03]'
                    }`}
                  >
                    <div className="aspect-square rounded-xl bg-white/[0.03] mb-2 overflow-hidden">
                      {product.image_url ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" loading="lazy" /> 
                      : <div className="w-full h-full flex items-center justify-center"><ShoppingBag size={18} className="text-white/[0.08]" /></div>}
                    </div>
                    <p className="text-[11px] font-semibold text-white/80 truncate leading-tight">{product.name}</p>
                    <p className="text-[11px] font-black text-gold mt-0.5">₼{fmt(product.price)}</p>
                    {!inStock && <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center"><span className="text-[9px] font-bold text-white/60 bg-black/60 px-2 py-1 rounded-lg">Bitib</span></div>}
                    {inCart > 0 && <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gold text-black text-[9px] font-black flex items-center justify-center">{inCart}</span>}
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>

        {/* ─── Cart sidebar (desktop) ─── */}
        <AnimatePresence>
          {showCart && (
            <motion.aside initial={{ width: 0, opacity: 0 }} animate={{ width: 340, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              className="hidden lg:flex flex-col border-l border-white/[0.06] bg-[#0c0c0c] overflow-hidden flex-shrink-0">
              <div className="flex-shrink-0 px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-2"><ShoppingBag size={14} className="text-white/30" /><span className="text-sm font-bold text-white">{selectedTable ? `Masa ${selectedTable}` : 'Səbət'}</span></div>
                <div className="flex items-center gap-2">
                  {cart.length > 0 && <button onClick={() => setCart([])} className="text-[10px] text-white/20 hover:text-white/50">Təmizlə</button>}
                  <button onClick={() => setShowCart(false)} className="text-white/20 hover:text-white/60"><X size={16} /></button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-white/15">
                    <ShoppingBag size={24} className="mb-2 opacity-30" />
                    <p className="text-xs">Səbət boşdur</p>
                  </div>
                ) : cart.map(item => (
                  <div key={item.product.id} className="flex items-center gap-3 bg-white/[0.03] rounded-xl px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white/80 truncate">{item.product.name}</p>
                      <p className="text-[10px] text-gold font-bold">₼{fmt(item.product.price * item.quantity)}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => changeQty(item.product.id, -1)} className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.12]"><Minus size={12} /></button>
                      <span className="w-5 text-center text-sm font-bold text-white tabular-nums">{item.quantity}</span>
                      <button onClick={() => changeQty(item.product.id, 1)} className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.12]"><Plus size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex-shrink-0 px-5 py-4 border-t border-white/[0.06] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-widest text-white/30">Cəmi</span>
                  <span className="text-lg font-black text-white tabular-nums">₼{fmt(cartTotal)}</span>
                </div>
                <button onClick={handleSend} disabled={!selectedTable || cart.length === 0 || submitting}
                  className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-30 active:scale-[0.98] bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30"
                >{submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Mətbəxə Göndər</button>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* ─── Mobile cart bottom sheet ─── */}
      <AnimatePresence>
        {showCart && selectedTable && cart.length > 0 && (
          <motion.div initial={{ y: 300 }} animate={{ y: 0 }} exit={{ y: 300 }} className="lg:hidden flex-shrink-0 border-t border-white/[0.06] bg-[#0c0c0c] px-4 py-3 space-y-2">
            {cart.map(item => (
              <div key={item.product.id} className="flex items-center gap-2 bg-white/[0.03] rounded-xl px-3 py-2">
                <div className="flex-1 min-w-0"><p className="text-xs font-semibold text-white/80 truncate">{item.product.name}</p><p className="text-[10px] text-gold font-bold">₼{fmt(item.product.price * item.quantity)}</p></div>
                <div className="flex items-center gap-1">
                  <button onClick={() => changeQty(item.product.id, -1)} className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40"><Minus size={10} /></button>
                  <span className="w-4 text-center text-xs font-bold text-white">{item.quantity}</span>
                  <button onClick={() => changeQty(item.product.id, 1)} className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40"><Plus size={10} /></button>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-3 pt-1">
              <div className="flex-1"><span className="text-[10px] text-white/30">Cəmi</span><p className="text-lg font-black text-white">₼{fmt(cartTotal)}</p></div>
              <button onClick={handleSend} disabled={!selectedTable || cart.length === 0 || submitting}
                className="flex-1 py-3 rounded-xl text-sm font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 active:scale-[0.98] disabled:opacity-30 flex items-center justify-center gap-2"
              >{submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Göndər</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Active orders section ─── */}
      {selectedTable && (
        <div className="flex-shrink-0 border-t border-white/[0.06] bg-[#0c0c0c]">
          {/* Orders for this table */}
          <div className="flex gap-2 overflow-x-auto px-3 py-2 scrollbar-none">
            {orders.filter(o => o.table_number === selectedTable && o.status !== 'paid').map(order => {
              const items = order.order_items || [];
              const ready = order.kitchen_status === 'ready';
              return (
                <div key={order.id} className={`flex-shrink-0 w-72 rounded-xl border p-3 ${
                  ready ? 'border-emerald-500/30 bg-emerald-500/[0.04]' : 'border-white/[0.06] bg-white/[0.02]'
                }`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold text-white/50">
                      {ready ? '✅ Hazırdır' : order.kitchen_status === 'preparing' ? '👨‍🍳 Hazırlanır' : '⏳ Gözləyir'}
                    </span>
                    <span className="text-xs font-black text-white/70">₼{fmt(order.total_amount || 0)}</span>
                  </div>
                  <div className="space-y-0.5 mb-2">
                    {items.slice(0, 4).map((item: any) => (
                      <div key={item.id} className="flex items-center justify-between text-[11px]">
                        <span className="text-white/60 truncate">{item.quantity}x {item.product_name}</span>
                      </div>
                    ))}
                    {items.length > 4 && <p className="text-[9px] text-white/20">+{items.length - 4} daha</p>}
                  </div>
                  {ready && (
                    <button onClick={() => handlePay(order.id)} disabled={payingOrder === order.id}
                      className="w-full py-2 rounded-lg text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 active:scale-[0.97] disabled:opacity-40 flex items-center justify-center gap-1"
                    >{payingOrder === order.id ? <Loader2 size={10} className="animate-spin" /> : <CreditCard size={10} />} Ödəniş</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
