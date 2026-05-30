'use client';

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, Plus, Minus, ChevronRight, ChevronLeft,
  Loader2, CheckCircle2, AlertTriangle, Utensils, ShoppingBag,
  Send, CreditCard, Printer, Clock, Wifi, WifiOff,
} from 'lucide-react';
import { deductStockForOrder } from '@/lib/stockAutomation';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';

/* ─── Types ─── */
interface Category {
  id: string;
  name: string;
  name_az?: string;
  name_en?: string;
  name_ru?: string;
  sort_order?: number;
}

interface Product {
  id: string;
  name: string;
  name_az?: string;
  name_en?: string;
  name_ru?: string;
  price: number;
  image_url: string | null;
  is_available?: boolean;
  is_ready_product?: boolean;
  direct_ingredient_id?: string | null;
  category_id?: string | null;
  category?: { name: string } | null;
}

interface RecipeIngredient {
  menu_item_id: string;
  ingredient_id: string;
  quantity_required: number;
  quantity_brutto: number | null;
}

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
}

interface CartItem {
  product: Product;
  quantity: number;
}

interface OrderData {
  id: string;
  table_number: number;
  total_amount: number;
  status: string;
  kitchen_status: string | null;
  created_at: string;
  order_items?: any[];
}

/* ─── Helpers ─── */
const fmt = (n: number) => n.toFixed(2);

/* ─── Main POS Component ─── */
export default function POSPage() {
  /* ─── Data state ─── */
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<RecipeIngredient[]>([]);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [tableCount, setTableCount] = useState(30);
  const [loading, setLoading] = useState(true);

  /* ─── UI state ─── */
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [view, setView] = useState<'menu' | 'orders'>('menu');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [payingOrder, setPayingOrder] = useState<string | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<OrderData | null>(null);

  const tableCountRef = useRef(tableCount);

  /* ─── Fetch all data ─── */
  const fetchData = useCallback(async () => {
    try {
      const [catRes, prodRes, ingRes, recRes, ordRes, settingsRes] = await Promise.all([
        supabase.from('categories').select('*').order('sort_order', { ascending: true }),
        supabase.from('products').select('*, category:categories(name)').order('name_az'),
        supabase.from('ingredients').select('id, name, unit, current_stock'),
        supabase.from('recipes').select('menu_item_id, ingredient_id, quantity_required, quantity_brutto'),
        supabase.from('orders').select('*, order_items(*)').in('status', ['new', 'confirmed']).order('created_at', { ascending: false }),
        supabase.from('settings').select('qr_table_count').limit(1),
      ]);

      setCategories((catRes.data || []) as Category[]);
      setProducts((prodRes.data || []) as Product[]);
      setIngredients((ingRes.data || []) as Ingredient[]);
      setRecipes((recRes.data || []) as RecipeIngredient[]);
      setOrders((ordRes.data || []) as OrderData[]);

      const tc = Number((settingsRes.data as any)?.[0]?.qr_table_count);
      if (tc >= 1 && tc <= 200) {
        setTableCount(tc);
        tableCountRef.current = tc;
      }

      if (!activeCategory && catRes.data && catRes.data.length > 0) {
        setActiveCategory(catRes.data[0].id);
      }
    } catch (e) {
      console.error('[POS] fetchData error:', e);
    } finally {
      setLoading(false);
    }
  }, [activeCategory]);

  useEffect(() => { fetchData(); }, []);

  /* ─── Realtime ─── */
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fetchData, 1000);
    };

    const channel = createRealtimeChannel('pos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, debouncedFetch)
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      removeRealtimeChannel(channel);
    };
  }, [fetchData]);

  /* ─── Polling fallback ─── */
  useEffect(() => {
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  /* ─── Online/offline ─── */
  useEffect(() => {
    const up = () => setIsOnline(true);
    const down = () => setIsOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    setIsOnline(navigator.onLine);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  /* ─── Stock availability map ─── */
  const stockMap = useMemo(() => {
    const map: Record<string, number> = {};
    ingredients.forEach(ing => { map[ing.id] = ing.current_stock; });
    return map;
  }, [ingredients]);

  const productAvailability = useMemo(() => {
    const avail: Record<string, { inStock: boolean; missingIngredient?: string }> = {};
    const recipeMap: Record<string, RecipeIngredient[]> = {};
    recipes.forEach(r => {
      if (!recipeMap[r.menu_item_id]) recipeMap[r.menu_item_id] = [];
      recipeMap[r.menu_item_id].push(r);
    });

    products.forEach(p => {
      if (p.is_ready_product && p.direct_ingredient_id) {
        const stock = stockMap[p.direct_ingredient_id] ?? 0;
        avail[p.id] = { inStock: stock > 0 };
      } else {
        const productRecipes = recipeMap[p.id] || [];
        if (productRecipes.length === 0) {
          avail[p.id] = { inStock: true };
        } else {
          let inStock = true;
          let missingIngredient: string | undefined;
          for (const rec of productRecipes) {
            const stock = stockMap[rec.ingredient_id] ?? 0;
            if (stock <= 0) {
              inStock = false;
              const ing = ingredients.find(i => i.id === rec.ingredient_id);
              missingIngredient = ing?.name || rec.ingredient_id.slice(0, 8);
              break;
            }
          }
          avail[p.id] = { inStock, missingIngredient };
        }
      }
    });
    return avail;
  }, [products, recipes, stockMap, ingredients]);

  /* ─── Order helpers ─── */
  const activeOrderForTable = useMemo(() => {
    if (!selectedTable) return null;
    return orders.find(o =>
      o.table_number === selectedTable &&
      (o.status === 'new' || o.status === 'confirmed')
    ) || null;
  }, [orders, selectedTable]);

  /* ─── Add to cart ─── */
  const addToCart = useCallback((product: Product) => {
    setCart(prev => {
      const idx = prev.findIndex(i => i.product.id === product.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { product, quantity: 1 }];
    });
  }, []);

  const changeCartQty = useCallback((productId: string, delta: number) => {
    setCart(prev =>
      prev.map(i =>
        i.product.id === productId
          ? { ...i, quantity: Math.max(0, i.quantity + delta) }
          : i
      ).filter(i => i.quantity > 0)
    );
  }, []);

  const cartTotal = useMemo(() =>
    cart.reduce((s, i) => s + i.product.price * i.quantity, 0),
    [cart]
  );

  /* ─── Send order to kitchen ─── */
  const handleSendToKitchen = useCallback(async () => {
    if (!selectedTable || cart.length === 0) return;
    setSubmitting(true);
    try {
      const items = cart.map(i => ({
        product_id: i.product.id,
        product_name: i.product.name,
        quantity: i.quantity,
        unit_price: i.product.price,
        total_price: i.product.price * i.quantity,
      }));

      if (activeOrderForTable) {
        await supabase.from('order_items').insert(
          items.map(i => ({ ...i, order_id: activeOrderForTable.id }))
        );
        const newTotal = (activeOrderForTable.total_amount || 0) + cartTotal;
        await supabase.from('orders').update({
          total_amount: newTotal,
          status: 'confirmed',
          kitchen_status: 'pending',
        }).eq('id', activeOrderForTable.id);
      } else {
        const { data: order, error } = await supabase.from('orders').insert({
          table_number: selectedTable,
          total_amount: cartTotal,
          status: 'confirmed',
          kitchen_status: 'pending',
        }).select().single();
        if (error) throw error;
        await supabase.from('order_items').insert(
          items.map(i => ({ ...i, order_id: order.id }))
        );
      }

      setCart([]);
      fetchData();
    } catch (e: any) {
      console.error('[POS] sendToKitchen error:', e);
    } finally {
      setSubmitting(false);
    }
  }, [selectedTable, cart, cartTotal, activeOrderForTable, fetchData]);

  /* ─── Pay order ─── */
  const handlePayOrder = useCallback(async (orderId: string) => {
    setPayingOrder(orderId);
    try {
      await supabase.from('orders').update({ status: 'paid' }).eq('id', orderId);
      try {
        await deductStockForOrder(orderId);
      } catch (stockErr) {
        console.error('[POS] Stock deduction failed:', stockErr);
      }
      setReceiptOrder(orders.find(o => o.id === orderId) || null);
      fetchData();
    } catch (e: any) {
      console.error('[POS] pay error:', e);
    } finally {
      setPayingOrder(null);
    }
  }, [orders, fetchData]);

  /* ─── Filtered products ─── */
  const filteredProducts = useMemo(() => {
    let list = products;
    if (activeCategory) {
      list = list.filter(p => p.category_id === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [products, activeCategory, search]);

  /* ─── Loading ─── */
  if (loading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-[#0a0a0a]">
        <div className="text-center">
          <Loader2 size={32} className="animate-spin text-white/20 mx-auto" />
          <p className="text-white/15 text-sm mt-4">POS yüklənir...</p>
        </div>
      </div>
    );
  }

  /* ─── Receipt overlay ─── */
  if (receiptOrder) {
    return (
      <div className="h-dvh flex items-center justify-center bg-[#0a0a0a] p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-[#111] border border-white/[0.06] rounded-3xl p-8 max-w-sm w-full text-center"
        >
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} className="text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-1">Ödəniş Uğurlu</h2>
          <p className="text-white/40 text-sm mb-6">
            Masa {receiptOrder.table_number} • ₼{fmt(receiptOrder.total_amount)}
          </p>
          <div className="space-y-2">
            <button
              onClick={() => window.print()}
              className="w-full py-3 rounded-xl bg-white/10 text-white text-sm font-bold hover:bg-white/20 transition-all flex items-center justify-center gap-2"
            >
              <Printer size={14} /> Qəbz Çap Et
            </button>
            <button
              onClick={() => { setReceiptOrder(null); setSelectedTable(null); }}
              className="w-full py-3 rounded-xl bg-white/[0.04] text-white/50 text-sm hover:text-white transition-all"
            >
              Yeni Sifariş
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col bg-[#0a0a0a] overflow-hidden">
      {/* ════════════════════════════════════════════════════════
          TOP BAR — Table Strip + Online/Offline + Search
      ════════════════════════════════════════════════════════ */}
      <header className="flex-shrink-0 border-b border-white/[0.05] bg-[#0c0c0c]">
        {/* Online/Offline badge */}
        <div className="flex items-center justify-between px-4 py-1.5">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-red-400'}`} />
            <span className={`text-[10px] font-semibold ${isOnline ? 'text-emerald-400/60' : 'text-red-400/60'}`}>
              {isOnline ? 'Online' : 'Offline'}
            </span>
            <span className="text-white/[0.06] mx-1">|</span>
            <span className="text-[10px] text-white/20">
              {orders.filter(o => o.status === 'confirmed' || o.status === 'new').length} aktiv
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView(view === 'menu' ? 'orders' : 'menu')}
              className="text-[10px] px-3 py-1 rounded-lg bg-white/[0.04] text-white/40 hover:text-white transition-all"
            >
              {view === 'menu' ? 'Sifarişlər' : 'Menyu'}
            </button>
          </div>
        </div>

        {/* Table strip */}
        <div className="flex gap-1.5 px-4 pb-3 overflow-x-auto scrollbar-none">
          {Array.from({ length: tableCount }, (_, i) => i + 1).map(num => {
            const orderForTable = orders.find(o =>
              o.table_number === num &&
              (o.status === 'new' || o.status === 'confirmed')
            );
            const isSelected = selectedTable === num;
            const hasOrder = !!orderForTable;
            const isReady = orderForTable?.kitchen_status === 'ready';

            return (
              <button
                key={num}
                onClick={() => {
                  setSelectedTable(isSelected ? null : num);
                  setCart([]);
                }}
                className={`
                  relative flex-shrink-0 w-12 h-12 rounded-2xl text-xs font-bold
                  transition-all duration-200 active:scale-95
                  ${isSelected
                    ? 'bg-white text-black shadow-lg'
                    : hasOrder
                      ? isReady
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                      : 'bg-white/[0.04] text-white/30 hover:bg-white/[0.08] hover:text-white/60 border border-transparent'
                  }
                `}
              >
                {num}
                {hasOrder && (
                  <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${isReady ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* ════════════════════════════════════════════════════════
          MAIN CONTENT — 3 Column Layout
      ════════════════════════════════════════════════════════ */}
      <main className="flex-1 flex overflow-hidden min-h-0">
        {view === 'menu' ? (
          <>
            {/* ─── LEFT: Category Sidebar ─── */}
            <aside className="hidden lg:flex flex-col w-20 border-r border-white/[0.05] bg-[#0c0c0c] py-3 flex-shrink-0 overflow-y-auto">
              {categories.map(cat => {
                const isActive = activeCategory === cat.id;
                const count = products.filter(p => p.category_id === cat.id).length;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(isActive ? null : cat.id)}
                    className={`
                      flex flex-col items-center gap-1 px-1 py-3 mx-2 rounded-xl
                      text-[10px] font-semibold tracking-wider
                      transition-all duration-200
                      ${isActive
                        ? 'bg-white text-black'
                        : 'text-white/30 hover:text-white/60 hover:bg-white/[0.04]'
                      }
                    `}
                  >
                    <span className="text-xs">{cat.name.slice(0, 5)}</span>
                    <span className={`text-[8px] ${isActive ? 'text-black/40' : 'text-white/15'}`}>{count}</span>
                  </button>
                );
              })}
            </aside>

            {/* ─── CENTER: Product Grid ─── */}
            <div className="flex-1 flex flex-col min-h-0">
              {/* Search bar (mobile visible) */}
              <div className="flex-shrink-0 px-3 pt-3 pb-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Məhsul axtar..."
                    className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/20 transition-colors"
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/40">
                      <X size={14} />
                    </button>
                  )}
                </div>
                {/* Mobile category pills */}
                <div className="flex lg:hidden gap-1.5 mt-2 overflow-x-auto scrollbar-none pb-1">
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wider transition-all ${
                        activeCategory === cat.id
                          ? 'bg-white text-black'
                          : 'bg-white/[0.04] text-white/40'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Product grid */}
              <div className="flex-1 overflow-y-auto px-3 pb-4">
                {filteredProducts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-white/15">
                    <ShoppingBag size={36} className="mb-3 opacity-30" />
                    <p className="text-sm">Məhsul tapılmadı</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                    {filteredProducts.map(product => {
                      const avail = productAvailability[product.id] || { inStock: true };
                      const inCart = cart.find(i => i.product.id === product.id)?.quantity || 0;
                      const isOut = !avail.inStock;
                      return (
                        <motion.button
                          key={product.id}
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          onClick={() => !isOut && addToCart(product)}
                          disabled={isOut}
                          className={`
                            relative rounded-2xl p-3 text-left transition-all duration-200
                            ${isOut
                              ? 'opacity-30 cursor-not-allowed bg-white/[0.02]'
                              : 'bg-white/[0.04] hover:bg-white/[0.08] hover:-translate-y-0.5 active:scale-[0.97] cursor-pointer'
                            }
                            border border-white/[0.06]
                          `}
                        >
                          {/* Product image */}
                          <div className="aspect-square rounded-xl bg-white/[0.03] mb-2 overflow-hidden">
                            {product.image_url ? (
                              <img
                                src={product.image_url}
                                alt={product.name}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <ShoppingBag size={20} className="text-white/[0.08]" />
                              </div>
                            )}
                          </div>

                          {/* Name */}
                          <p className="text-xs font-semibold text-white/80 truncate leading-tight">
                            {product.name}
                          </p>

                          {/* Price */}
                          <p className="text-xs font-black text-gold mt-0.5">
                            ₼{fmt(product.price)}
                          </p>

                          {/* Out of stock badge */}
                          {isOut && (
                            <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center">
                              <span className="text-[10px] font-bold text-white/60 bg-black/60 px-2 py-1 rounded-lg">
                                Bitib
                              </span>
                            </div>
                          )}

                          {/* In cart badge */}
                          {inCart > 0 && !isOut && (
                            <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gold text-black text-[9px] font-black flex items-center justify-center">
                              {inCart}
                            </span>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ─── RIGHT: Cart Panel ─── */}
            <aside className="hidden lg:flex flex-col w-80 border-l border-white/[0.05] bg-[#0c0c0c] flex-shrink-0">
              {/* Cart header */}
              <div className="flex-shrink-0 px-5 py-4 border-b border-white/[0.05]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShoppingBag size={14} className="text-white/30" />
                    <span className="text-sm font-bold text-white">
                      {selectedTable ? `Masa ${selectedTable}` : 'Masa seçilməyib'}
                    </span>
                  </div>
                  {cart.length > 0 && (
                    <button
                      onClick={() => setCart([])}
                      className="text-[10px] text-white/20 hover:text-white/50 transition-colors"
                    >
                      Təmizlə
                    </button>
                  )}
                </div>
              </div>

              {/* Cart items */}
              <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-white/15">
                    <ShoppingBag size={28} className="mb-2 opacity-30" />
                    <p className="text-xs">Səbət boşdur</p>
                    <p className="text-[10px] text-white/10 mt-1">Məhsul seçin</p>
                  </div>
                ) : (
                  cart.map(item => (
                    <div
                      key={item.product.id}
                      className="flex items-center gap-3 bg-white/[0.03] rounded-xl px-3 py-2.5"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white/80 truncate">
                          {item.product.name}
                        </p>
                        <p className="text-[10px] text-gold font-bold">
                          ₼{fmt(item.product.price * item.quantity)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => changeCartQty(item.product.id, -1)}
                          className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.12] transition-all"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="w-5 text-center text-sm font-bold text-white tabular-nums">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => changeCartQty(item.product.id, 1)}
                          className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.12] transition-all"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Cart footer */}
              <div className="flex-shrink-0 px-5 py-4 border-t border-white/[0.05] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-widest text-white/30">Cəmi</span>
                  <span className="text-lg font-black text-white tabular-nums">
                    ₼{fmt(cartTotal)}
                  </span>
                </div>
                <button
                  onClick={handleSendToKitchen}
                  disabled={!selectedTable || cart.length === 0 || submitting}
                  className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all
                    disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98]
                    bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30"
                >
                  {submitting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                  Mətbəxə Göndər
                </button>
              </div>
            </aside>

            {/* ─── Mobile bottom cart bar ─── */}
            {selectedTable && cart.length > 0 && (
              <div className="lg:hidden flex-shrink-0 border-t border-white/[0.05] bg-[#0c0c0c] px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-white/50">Cəmi</span>
                  <span className="text-lg font-black text-white">₼{fmt(cartTotal)}</span>
                </div>
                <button
                  onClick={handleSendToKitchen}
                  disabled={submitting}
                  className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 active:scale-[0.98] disabled:opacity-30 transition-all"
                >
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Mətbəxə Göndər
                </button>
              </div>
            )}

            {/* ─── Mobile: no table selected ─── */}
            {!selectedTable && (
              <div className="lg:hidden flex items-center justify-center flex-1 text-white/15">
                <div className="text-center">
                  <Utensils size={32} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Masa seçin</p>
                </div>
              </div>
            )}
          </>
        ) : (
          /* ════════════════════════════════════════════════════
             VIEW: ORDERS — Active orders list
          ════════════════════════════════════════════════════ */
          <div className="flex-1 overflow-y-auto p-4">
            <h2 className="text-lg font-bold text-white/80 mb-4">Aktiv Sifarişlər</h2>
            {orders.length === 0 ? (
              <div className="text-center py-16 text-white/15">
                <Clock size={36} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Aktiv sifariş yoxdur</p>
              </div>
            ) : (
              <div className="space-y-3 max-w-2xl mx-auto">
                {orders.map(order => {
                  const items = order.order_items || [];
                  const totalItems = items.reduce((s: number, i: any) => s + i.quantity, 0);
                  const isKitchenReady = order.kitchen_status === 'ready';
                  const isExpanded = expandedOrder === order.id;
                  const isPaying = payingOrder === order.id;

                  return (
                    <div
                      key={order.id}
                      className={`rounded-2xl border transition-all ${
                        isKitchenReady
                          ? 'border-emerald-500/30 bg-emerald-500/[0.03]'
                          : 'border-white/[0.06] bg-white/[0.02]'
                      }`}
                    >
                      <button
                        onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                        className="w-full flex items-center gap-4 px-5 py-4 text-left"
                      >
                        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center">
                          <span className="text-sm font-black text-white/60">
                            {order.table_number}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white">
                            Masa {order.table_number}
                            {isKitchenReady && (
                              <span className="ml-2 text-[10px] text-emerald-400 font-semibold">Hazırdır</span>
                            )}
                          </p>
                          <p className="text-[11px] text-white/30">
                            {totalItems} məhsul • ₼{fmt(order.total_amount || 0)}
                          </p>
                        </div>
                        <ChevronRight
                          size={16}
                          className={`text-white/20 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        />
                      </button>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="px-5 pb-4 pt-0 border-t border-white/[0.05] space-y-2">
                              {items.map((item: any) => (
                                <div key={item.id || item.product_id} className="flex items-center justify-between text-sm">
                                  <span className="text-white/70">
                                    {item.quantity}x {item.product_name}
                                  </span>
                                  <span className="text-white/40 text-xs">
                                    ₼{fmt(item.total_price || 0)}
                                  </span>
                                </div>
                              ))}
                              {isKitchenReady && (
                                <button
                                  onClick={() => handlePayOrder(order.id)}
                                  disabled={isPaying}
                                  className="w-full mt-3 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2
                                    bg-emerald-500/20 text-emerald-400 border border-emerald-500/30
                                    hover:bg-emerald-500/30 transition-all active:scale-[0.98] disabled:opacity-40"
                                >
                                  {isPaying ? (
                                    <Loader2 size={14} className="animate-spin" />
                                  ) : (
                                    <CreditCard size={14} />
                                  )}
                                  Ödəniş • ₼{fmt(order.total_amount || 0)}
                                </button>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ════════════════════════════════════════════════════════
          BOTTOM STATUS BAR
      ════════════════════════════════════════════════════════ */}
      <footer className="flex-shrink-0 border-t border-white/[0.05] bg-[#0c0c0c] px-4 py-2">
        <div className="flex items-center justify-between text-[10px] text-white/25">
          <div className="flex items-center gap-4">
            <span>Yeni: {orders.filter(o => o.kitchen_status === 'pending').length}</span>
            <span>Hazırlanır: {orders.filter(o => o.kitchen_status === 'preparing').length}</span>
            <span>Hazırdır: {orders.filter(o => o.kitchen_status === 'ready').length}</span>
          </div>
          <div className="flex items-center gap-2">
            {!isOnline && <WifiOff size={12} className="text-red-400/60" />}
            <span>{products.length} məhsul</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
