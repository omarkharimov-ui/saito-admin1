'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { deductStockForOrder } from '@/lib/stockAutomation';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { LanguageProvider, useLanguage } from '@/lib/i18n/LanguageContext';
import { ThemeProvider, useTheme } from '@/lib/theme/ThemeContext';
import {
  Search, ShoppingBag, Plus, Minus, Send, CreditCard, X, Loader2, CheckCircle2,
  Printer, ImageOff, Utensils, Banknote, Percent, Users, GitMerge, Sun, Moon,
  Maximize, Minimize,
} from 'lucide-react';

/* ─── Types ─── */
interface Product { id: string; name: string; name_az?: string; name_en?: string; name_ru?: string; price: number; image_url: string | null; is_ready_product?: boolean; direct_ingredient_id?: string | null; category_id?: string | null; }
interface RecipeIng { menu_item_id: string; ingredient_id: string; quantity_required: number; quantity_brutto: number | null; }
interface Ingredient { id: string; current_stock: number; }
interface OrderItem { id: string; product_name: string; quantity: number; unit_price: number; total_price: number; }
interface OrderData { id: string; table_number: number; total_amount: number; status: string; kitchen_status: string | null; created_at: string; order_items?: OrderItem[]; }
interface Category { id: string; name: string; }
interface CartItem { product: Product; qty: number; }

const fmt = (n: number) => n.toFixed(2);

/* ─── Product card ─── */
function PCard({ p, stock, cart, onAdd }: { p: Product; stock: boolean; cart: number; onAdd: () => void }) {
  const [imgState, setImgState] = useState<'loading' | 'ok' | 'err'>('loading');
  const { t, language } = useLanguage();
  const name = language === 'en' ? (p as any).name_en || p.name : language === 'ru' ? (p as any).name_ru || p.name : (p as any).name_az || p.name;
  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const hasUrl = !!p.image_url && p.image_url.trim().length > 0;
  const showImg = hasUrl && imgState !== 'err';
  return (
    <motion.button layout initial={false} whileHover={stock ? { y: -2 } : undefined} whileTap={stock ? { scale: 0.96 } : undefined}
      onClick={stock ? onAdd : undefined}
      className={`relative rounded-2xl p-4 text-left border ${stock ? 'bg-[var(--pos-bg-card)] border-[var(--pos-border-strong)]' : 'opacity-30 border-[var(--pos-border)]'}`}
    >
      <div className="aspect-square rounded-xl bg-white/[0.02] mb-3 flex items-center justify-center overflow-hidden">
        {showImg
          ? <img src={p.image_url!} alt={name} className="w-full h-full object-cover" onLoad={() => setImgState('ok')} onError={() => setImgState('err')} />
          : <span className="text-3xl font-black text-[var(--pos-text-muted)]">{initials}</span>
        }
      </div>
      <p className="text-sm font-semibold text-[var(--pos-text)] truncate">{name}</p>
      <p className="text-sm font-black text-[var(--pos-price)]">₼{fmt(p.price)}</p>
      {!stock && <div className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center"><span className="text-xs font-bold text-[var(--pos-text)]/70 bg-black/70 px-3 py-1.5 rounded-lg">{t('out_of_stock')}</span></div>}
      {cart > 0 && <span className="absolute top-2 right-2 w-7 h-7 rounded-full bg-gold text-black text-xs font-black flex items-center justify-center">{cart}</span>}
    </motion.button>
  );
}

/* ─── Checkout panel ─── */
function CheckoutPanel({ order, onClose, onConfirm, busy }: {
  order: OrderData; onClose: () => void; onConfirm: (p: { method: string; discountType: string; discountValue: number; splitCount: number }) => void; busy: boolean;
}) {
  const { t } = useLanguage();
  const [method, setMethod] = useState<'cash' | 'card'>('card');
  const [discountType, setDiscountType] = useState<'none' | 'percent' | 'amount'>('none');
  const [discountVal, setDiscountVal] = useState(0);
  const [split, setSplit] = useState(1);

  const baseTotal = order.total_amount || 0;
  const discountAmount = discountType === 'percent' ? baseTotal * (Math.min(discountVal, 100) / 100) : discountType === 'amount' ? Math.min(discountVal, baseTotal) : 0;
  const finalTotal = baseTotal - discountAmount;
  const perPerson = split > 1 ? finalTotal / split : finalTotal;

  const items = order.order_items || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 27 }}
        className="bg-[var(--pos-bg-secondary)] border border-[var(--pos-border)] rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-6 pb-3">
          <h2 className="text-lg font-bold text-[var(--pos-text)]">{t('table')} {order.table_number}</h2>
          <button onClick={onClose} className="text-[var(--pos-text-muted)] hover:text-[var(--pos-text)]"><X size={18} /></button>
        </div>

        {/* Items summary */}
        <div className="px-6 space-y-1.5 mb-4">
          {items.slice(0, 8).map(i => (
            <div key={i.id} className="flex items-center justify-between text-sm">
              <span className="text-[var(--pos-text-secondary)]">{i.quantity}x {i.product_name}</span>
              <span className="text-[var(--pos-text)] font-semibold">₼{fmt(i.total_price || 0)}</span>
            </div>
          ))}
          {items.length > 8 && <p className="text-xs text-[var(--pos-text-muted)]">+{items.length - 8} {t('more')}</p>}
          <div className="border-t border-[var(--pos-border)] pt-2 flex items-center justify-between text-base font-bold text-[var(--pos-text)]">
            <span>{t('subtotal_label')}</span>
            <span>₼{fmt(baseTotal)}</span>
          </div>
        </div>

        {/* Discount */}
        <div className="px-6 mb-4">
          <label className="text-xs text-[var(--pos-text-secondary)] uppercase tracking-widest mb-2 block">{t('discount_label')}</label>
          <div className="flex gap-1.5 mb-2">
            {(['none', 'percent', 'amount'] as const).map(k => (
              <button key={k} onClick={() => { setDiscountType(k); setDiscountVal(0); }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${discountType === k ? 'bg-[var(--pos-text)] text-[var(--pos-bg)]' : 'bg-[var(--pos-bg-card)] text-[var(--pos-text-secondary)]'}`}
              >{k === 'none' ? t('discount_none') : k === 'percent' ? '%' : '₼'}</button>
            ))}
          </div>
          {discountType !== 'none' && (
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pos-text-muted)] text-xs">{discountType === 'percent' ? '%' : '₼'}</span>
              <input type="number" min={0} max={discountType === 'percent' ? 100 : baseTotal} value={discountVal} onChange={e => setDiscountVal(Number(e.target.value))}
                className="w-full bg-[var(--pos-bg-card)] border border-[var(--pos-border)] rounded-xl pl-8 pr-3 py-2 text-sm text-[var(--pos-text)] outline-none" />
            </div>
          )}
          {discountAmount > 0 && <p className="text-xs text-emerald-400 mt-1">- ₼{fmt(discountAmount)}</p>}
        </div>

        {/* Split */}
        <div className="px-6 mb-4">
          <label className="text-xs text-[var(--pos-text-secondary)] uppercase tracking-widest mb-2 block">{t('split_label')}</label>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => setSplit(n)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${split === n ? 'bg-[var(--pos-text)] text-[var(--pos-bg)]' : 'bg-[var(--pos-bg-card)] text-[var(--pos-text-secondary)]'}`}
              >{n}</button>
            ))}
          </div>
        </div>

        {/* Payment method */}
        <div className="px-6 mb-4">
          <label className="text-xs text-[var(--pos-text-secondary)] uppercase tracking-widest mb-2 block">{t('payment_method_label')}</label>
          <div className="flex gap-2">
            <button onClick={() => setMethod('cash')}
              className={`flex-1 py-4 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 ${method === 'cash' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-[var(--pos-bg-card)] text-[var(--pos-text-secondary)] border border-[var(--pos-border)]'}`}>
              <Banknote size={18} /> {t('cash')}
            </button>
            <button onClick={() => setMethod('card')}
              className={`flex-1 py-4 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 ${method === 'card' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-[var(--pos-bg-card)] text-[var(--pos-text-secondary)] border border-[var(--pos-border)]'}`}>
              <CreditCard size={18} /> {t('card')}
            </button>
          </div>
        </div>

        {/* Total & confirm */}
        <div className="px-6 pb-6 pt-2 border-t border-[var(--pos-border)] space-y-3">
          <div className="space-y-1">
            {split > 1 && <div className="flex items-center justify-between text-sm text-[var(--pos-text-secondary)]"><span>{t('per_person')}</span><span className="font-bold text-[var(--pos-text)]">₼{fmt(perPerson)}</span></div>}
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--pos-text-secondary)] uppercase tracking-widest">{t('final_total')}</span>
              {discountAmount > 0 && <span className="text-xs text-[var(--pos-text-secondary)] line-through mr-2">₼{fmt(baseTotal)}</span>}
              <span className="text-2xl font-black text-[var(--pos-text)]">
                {discountAmount > 0 || split > 1 ? `₼${fmt(finalTotal)}` : `₼${fmt(baseTotal)}`}
              </span>
            </div>
          </div>
          <button onClick={() => onConfirm({ method, discountType, discountValue: discountVal, splitCount: split })}
            disabled={busy}
            className="w-full py-4 rounded-2xl text-base font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 active:scale-[0.98] disabled:opacity-30 flex items-center justify-center gap-2"
          >{busy ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />} {t('confirm_payment')}</button>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Receipt screen ─── */
function ReceiptScreen({ paid, onNew }: { paid: OrderData & { payment_method?: string; discount_type?: string; discount_value?: number; paid_amount?: number; split_count?: number }; onNew: () => void }) {
  const { t } = useLanguage();
  const items = paid.order_items || [];
  return (
    <div className="h-dvh flex items-center justify-center bg-[var(--pos-bg)] p-6">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="bg-[var(--pos-bg-secondary)] border border-[var(--pos-border)] rounded-3xl p-8 max-w-sm w-full text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 20, delay: 0.15 }}
          className="w-20 h-20 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-5">
          <CheckCircle2 size={40} className="text-emerald-400" />
        </motion.div>
        <h2 className="text-2xl font-bold text-[var(--pos-text)] mb-1">{t('paid')}</h2>
        <p className="text-[var(--pos-text-secondary)] text-sm mb-1">{t('table')} {paid.table_number}</p>
        <p className="text-[var(--pos-text-secondary)] text-sm mb-6 flex items-center justify-center gap-1">
          {paid.payment_method === 'cash' ? <Banknote size={14} /> : <CreditCard size={14} />}
          {paid.payment_method === 'cash' ? t('cash') : t('card')}
          {paid.split_count && paid.split_count > 1 && <span className="flex items-center gap-1 ml-2"><Users size={14} />{paid.split_count} {t('person')}</span>}
        </p>

        <div className="text-left bg-[var(--pos-bg-card)] rounded-2xl p-4 mb-6 space-y-1">
          {items.slice(0, 5).map(i => (
            <div key={i.id} className="flex items-center justify-between text-sm">
              <span className="text-[var(--pos-text-secondary)]">{i.quantity}x {i.product_name}</span>
              <span className="text-[var(--pos-text)] font-semibold">₼{fmt(i.total_price || 0)}</span>
            </div>
          ))}
          {items.length > 5 && <p className="text-[10px] text-[var(--pos-text-muted)]">+{items.length - 5}</p>}
          <div className="border-t border-[var(--pos-border)] pt-2 flex items-center justify-between text-base font-bold text-[var(--pos-text)]">
            <span>{t('total')}</span>
            <span>₼{fmt(paid.total_amount || 0)}</span>
          </div>
        </div>

        <button onClick={() => window.print()}
          className="w-full py-4 rounded-2xl bg-[var(--pos-bg-card)] text-[var(--pos-text)] text-base font-bold hover:bg-[var(--pos-bg-secondary)] mb-3 flex items-center justify-center gap-2">
          <Printer size={18} /> {t('print')}
        </button>
        <button onClick={onNew}
          className="w-full py-4 rounded-2xl bg-[var(--pos-bg-card)] text-[var(--pos-text-secondary)] text-base hover:text-[var(--pos-text)]">{t('new_order')}</button>
      </motion.div>
    </div>
  );
}

/* ─── Main ─── */
function POS() {
  const { t, language } = useLanguage();
  const { lightMode, setLightMode } = useTheme();
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<RecipeIng[]>([]);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tableCount, setTableCount] = useState(30);
  const [loading, setLoading] = useState(true);
  const [selTable, setSelTable] = useState<number | null>(null);
  const [cat, setCat] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [paid, setPaid] = useState<OrderData & { payment_method?: string; discount_type?: string; discount_value?: number; paid_amount?: number; split_count?: number } | null>(null);
  const [checkoutOrder, setCheckoutOrder] = useState<OrderData | null>(null);
  const [showMerge, setShowMerge] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  }, []);

  const getPName = useCallback((p: Product) => {
    if (language === 'en') return (p as any).name_en || p.name;
    if (language === 'ru') return (p as any).name_ru || p.name;
    return (p as any).name_az || p.name;
  }, [language]);

  const fetchAll = useCallback(async () => {
    try {
      const [pr, ir, rr, or, cr, sr] = await Promise.all([
        supabase.from('products').select('*').order('name_az'),
        supabase.from('ingredients').select('id, current_stock'),
        supabase.from('recipes').select('menu_item_id, ingredient_id, quantity_required, quantity_brutto'),
        supabase.from('orders').select('*, order_items(*)').in('status', ['new', 'confirmed']).order('created_at', { ascending: false }),
        supabase.from('categories').select('*').order('sort_order'),
        supabase.from('settings').select('qr_table_count').limit(1),
      ]);
      setProducts((pr.data || []) as Product[]);
      setIngredients((ir.data || []) as Ingredient[]);
      setRecipes((rr.data || []) as RecipeIng[]);
      setOrders((or.data || []) as OrderData[]);
      setCategories((cr.data || []) as Category[]);
      const tc = Number((sr.data as any)?.[0]?.qr_table_count);
      if (tc >= 1) setTableCount(tc);
      if (!cat && cr.data?.length) setCat(cr.data[0].id);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 12000); fetchAll(); return () => clearTimeout(t); }, []);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const d = () => { if (t) clearTimeout(t); t = setTimeout(fetchAll, 1000); };
    const ch = createRealtimeChannel('posx')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, d)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, d)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients' }, d)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, d)
      .subscribe();
    const pi = setInterval(fetchAll, 10000);
    return () => { if (t) clearTimeout(t); removeRealtimeChannel(ch); clearInterval(pi); };
  }, [fetchAll]);

  const stockMap = useMemo(() => {
    const m: Record<string, number> = {};
    ingredients.forEach(i => { m[i.id] = i.current_stock; });
    return m;
  }, [ingredients]);

  const avail = useMemo(() => {
    const a: Record<string, boolean> = {};
    const rm: Record<string, RecipeIng[]> = {};
    recipes.forEach(r => { if (!rm[r.menu_item_id]) rm[r.menu_item_id] = []; rm[r.menu_item_id].push(r); });
    products.forEach(p => {
      if (p.is_ready_product && p.direct_ingredient_id) { a[p.id] = (stockMap[p.direct_ingredient_id] ?? 0) > 0; return; }
      const rr = rm[p.id] || [];
      a[p.id] = rr.length === 0 || rr.every(r => (stockMap[r.ingredient_id] ?? 0) > 0);
    });
    return a;
  }, [products, recipes, stockMap]);

  const activeOrder = useMemo(() =>
    selTable ? orders.find(o => o.table_number === selTable && o.status !== 'paid') || null : null, [orders, selTable]
  );

  const addItem = useCallback((p: Product) => {
    setCart(prev => { const i = prev.findIndex(x => x.product.id === p.id); if (i >= 0) { const n = [...prev]; n[i] = { ...n[i], qty: n[i].qty + 1 }; return n; } return [...prev, { product: p, qty: 1 }]; });
  }, []);

  const chgQty = useCallback((id: string, d: number) => {
    setCart(prev => prev.map(i => i.product.id === id ? { ...i, qty: Math.max(0, i.qty + d) } : i).filter(i => i.qty > 0));
  }, []);

  const total = useMemo(() => cart.reduce((s, i) => s + i.product.price * i.qty, 0), [cart]);

  const sendOrder = useCallback(async () => {
    if (!selTable || cart.length === 0) return;
    setBusy(true);
    try {
      const items = cart.map(i => ({ product_id: i.product.id, product_name: getPName(i.product), quantity: i.qty, unit_price: i.product.price, total_price: i.product.price * i.qty }));
      if (activeOrder) {
        await supabase.from('order_items').insert(items.map(i => ({ ...i, order_id: activeOrder.id })));
        await supabase.from('orders').update({ total_amount: (activeOrder.total_amount || 0) + total, status: 'confirmed', kitchen_status: 'pending' }).eq('id', activeOrder.id);
      } else {
        const { data: o, error } = await supabase.from('orders').insert({ table_number: selTable, total_amount: total, status: 'confirmed', kitchen_status: 'pending' }).select().single();
        if (error) throw error;
        await supabase.from('order_items').insert(items.map(i => ({ ...i, order_id: o.id })));
      }
      setCart([]); setShowCart(false); fetchAll();
    } catch (e) { console.error(e); } finally { setBusy(false); }
  }, [selTable, cart, total, activeOrder, fetchAll, getPName]);

  const openCheckout = useCallback((o: OrderData) => {
    setCheckoutOrder(o);
  }, []);

  const confirmPayment = useCallback(async (p: { method: string; discountType: string; discountValue: number; splitCount: number }) => {
    if (!checkoutOrder) return;
    setPayBusy(true);
    try {
      const base = checkoutOrder.total_amount || 0;
      const discountAmount = p.discountType === 'percent' ? base * (Math.min(p.discountValue, 100) / 100) : p.discountType === 'amount' ? Math.min(p.discountValue, base) : 0;
      const paidAmount = base - discountAmount;

      await supabase.from('orders').update({
        status: 'paid',
        payment_method: p.method,
        discount_type: p.discountType,
        discount_value: p.discountValue,
        paid_amount: paidAmount,
        split_count: p.splitCount,
      }).eq('id', checkoutOrder.id);

      try { await deductStockForOrder(checkoutOrder.id); } catch (e) { console.error(e); }

      setPaid({ ...checkoutOrder, payment_method: p.method, discount_type: p.discountType, discount_value: p.discountValue, paid_amount: paidAmount, split_count: p.splitCount });
      setCheckoutOrder(null);
      fetchAll();
    } catch (e) { console.error(e); } finally { setPayBusy(false); }
  }, [checkoutOrder, fetchAll]);

  const handleDismissTable = useCallback(async () => {
    if (!activeOrder) return;
    await supabase.from('orders').update({ is_served: true }).eq('id', activeOrder.id);
    setSelTable(null);
    setCart([]);
    fetchAll();
  }, [activeOrder, fetchAll]);

  const handleMerge = useCallback(async (sourceOrderId: string) => {
    if (!activeOrder) return;
    setBusy(true);
    try {
      const { data: srcItems } = await supabase.from('order_items').select('*').eq('order_id', sourceOrderId);
      if (srcItems && srcItems.length > 0) {
        const newItems = srcItems.map((i: any) => ({
          order_id: activeOrder.id,
          product_id: i.product_id,
          variant_id: i.variant_id,
          product_name: i.product_name,
          quantity: i.quantity,
          unit_price: i.unit_price,
          total_price: i.total_price,
        }));
        await supabase.from('order_items').insert(newItems);
        const addedTotal = srcItems.reduce((s: number, i: any) => s + (i.total_price || 0), 0);
        await supabase.from('orders').update({ total_amount: (activeOrder.total_amount || 0) + addedTotal }).eq('id', activeOrder.id);
      }
      await supabase.from('orders').update({ merged_into: activeOrder.id, status: 'paid' }).eq('id', sourceOrderId);
      setShowMerge(false);
      fetchAll();
    } catch (e) { console.error(e); } finally { setBusy(false); }
  }, [activeOrder, fetchAll]);

  const mergeCandidates = useMemo(() =>
    orders.filter(o => o.id !== activeOrder?.id && o.status !== 'paid'),
    [orders, activeOrder]
  );

  const handleNewOrder = useCallback(() => {
    setPaid(null);
    setSelTable(null);
    setCart([]);
  }, []);

  const list = useMemo(() => {
    let l = products;
    if (cat) l = l.filter(p => p.category_id === cat);
    if (search) { const q = search.toLowerCase(); l = l.filter(p => getPName(p).toLowerCase().includes(q)); }
    return l;
  }, [products, cat, search, getPName]);

  if (loading) return <div className="pos-root h-dvh flex items-center justify-center bg-[var(--pos-bg)]"><Loader2 size={24} className="animate-spin text-[var(--pos-text-muted)]" /></div>;

  if (paid) return <ReceiptScreen paid={paid} onNew={handleNewOrder} />;

  return (
    <div className="pos-root h-dvh flex flex-col bg-[var(--pos-bg)] text-[var(--pos-text)] overflow-hidden select-none" data-light={lightMode ? "true" : undefined}>

      {/* ─── TABLE STRIP ─── */}
      <div className="flex-shrink-0 border-b border-[var(--pos-border)] bg-[var(--pos-bg-secondary)]">
        <div className="flex gap-2 px-3 pt-3 pb-2 overflow-x-auto">
          {Array.from({ length: tableCount }, (_, i) => i + 1).map(n => {
            const o = orders.find(x => x.table_number === n && x.status !== 'paid');
            const s = selTable === n;
            const r = o?.kitchen_status === 'ready';
            return (
              <button key={n} onClick={() => { setSelTable(s ? null : n); setShowCart(false); }}
                className={`relative flex-shrink-0 w-14 h-14 rounded-xl text-sm font-bold transition-all ${
                  s ? 'bg-[var(--pos-text)] text-[var(--pos-bg)] shadow-md' :
                  o ? (r ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-[var(--pos-table-busy-bg)] text-[var(--pos-table-busy-text)] border border-[var(--pos-table-busy-border)]') :
                  'bg-[var(--pos-table-empty-bg)] text-[var(--pos-table-empty-text)] border border-[var(--pos-border)]'
                }`}
              >{n}{o && <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${r ? 'bg-emerald-400' : 'bg-rose-400'}`} />}</button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 px-3 pb-3">
          <span className="text-sm text-[var(--pos-text-secondary)] font-semibold">{products.length} {t('items')}</span>
          <span className="text-[var(--pos-border)] px-1 text-lg font-thin">|</span>
          <span className="text-sm text-[var(--pos-text-secondary)] font-semibold">{orders.filter(o => o.status !== 'paid').length} {t('active_count')}</span>
          {activeOrder && <><span className="text-[var(--pos-border)] px-1 text-lg font-thin">|</span><span className="text-sm text-[var(--pos-table-busy-text)] font-semibold">{t('table')} {selTable} • ₼{fmt(activeOrder.total_amount || 0)}</span></>}
          <div className="flex-1" />
          <button onClick={toggleFullscreen}
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--pos-bg-card)] text-[var(--pos-btn-text)] hover:text-[var(--pos-text)] transition-all">
            {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
          <button onClick={() => setLightMode(!lightMode)}
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--pos-bg-card)] text-[var(--pos-btn-text)] hover:text-[var(--pos-text)] transition-all">
            {lightMode ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <button onClick={() => setShowCart(!showCart)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--pos-bg-card)] text-sm font-semibold text-[var(--pos-btn-text)]">
            <ShoppingBag size={15} /> ₼{fmt(total)}
            {cart.length > 0 && <span className="w-5 h-5 rounded-full bg-gold text-black text-[10px] font-black flex items-center justify-center">{cart.reduce((s, i) => s + i.qty, 0)}</span>}
          </button>
        </div>
      </div>

      {/* ─── SEARCH + CATEGORIES ─── */}
      <div className="flex-shrink-0 px-3 pt-3 pb-2 space-y-2">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pos-icon)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('search_placeholder')} className="w-full bg-[var(--pos-search-bg)] border border-[var(--pos-search-border)] rounded-xl pl-10 pr-3 py-3 text-sm text-[var(--pos-text)] placeholder:text-[var(--pos-text-muted)] placeholder:font-medium outline-none shadow-sm" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--pos-icon)]"><X size={16} /></button>}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {categories.map(c => (
            <button key={c.id} onClick={() => setCat(cat === c.id ? null : c.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold tracking-wider ${cat === c.id ? 'bg-[var(--pos-text)] text-[var(--pos-bg)]' : 'bg-[var(--pos-bg-card)] text-[var(--pos-text-secondary)]'}`}
            >{c.name}</button>
          ))}
        </div>
      </div>

      {/* ─── MAIN CONTENT ─── */}
      <div className="flex-1 flex min-h-0">
        {/* ─── PRODUCT GRID ─── */}
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          {!selTable ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--pos-text-muted)]">
              <Utensils size={48} className="mb-3 opacity-60" />
              <p className="text-base font-medium tracking-wide">{t('select_table')}</p>
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--pos-text-muted)]">
              <Search size={48} className="mb-3 opacity-60" />
              <p className="text-base font-medium tracking-wide">{t('not_found')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {list.map(p => <PCard key={p.id} p={p} stock={avail[p.id] !== false} cart={cart.find(i => i.product.id === p.id)?.qty || 0} onAdd={() => addItem(p)} />)}
            </div>
          )}
        </div>

        {/* ─── CART SIDEBAR (always visible on lg+) ─── */}
        <div className="hidden lg:flex flex-col w-[30%] min-w-[300px] max-w-[400px] border-l border-[var(--pos-sidebar-border)] bg-[var(--pos-bg-secondary)] flex-shrink-0">
          {/* Cart header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--pos-border)]">
            <div>
              <h2 className="text-base font-bold text-[var(--pos-text)]">
                {selTable ? `${t('table')} ${selTable}` : t('cart')}
              </h2>
              {activeOrder && (
                <p className="text-xs text-[var(--pos-text-secondary)] mt-0.5">
                  {activeOrder.kitchen_status === 'ready' ? `✅ ${t('ready')}` : `⏳ ${t('waiting')}`}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {activeOrder && (
                <>
                  <button onClick={() => setShowMerge(true)}
                    className="text-xs text-[var(--pos-btn-text)] font-medium hover:text-gold transition-colors tracking-wider uppercase">
                    {t('merge')}
                  </button>
                  <button onClick={handleDismissTable}
                    className="text-xs text-[var(--pos-btn-text)] font-medium hover:text-red-400 transition-colors tracking-wider uppercase">
                    {t('dismiss_table')}
                  </button>
                </>
              )}
              <button onClick={() => setCart([])}
                className="text-xs text-[var(--pos-btn-text)] font-medium hover:text-[var(--pos-text)] transition-colors tracking-wider uppercase">
                {t('clear')}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {/* ─── Existing order items ─── */}
            {activeOrder && activeOrder.order_items && activeOrder.order_items.length > 0 && (
              <div className="border-b border-[var(--pos-border)]">
                <div className="px-5 pt-3 pb-1">
                  <span className="text-xs text-[var(--pos-text-secondary)] uppercase tracking-widest font-medium">{t('existing_order')}</span>
                </div>
                <div className="px-5 py-1 space-y-0.5">
                  {activeOrder.order_items.map(i => (
                    <div key={i.id} className="flex items-center justify-between text-sm">
                      <span className="text-[var(--pos-text-secondary)]">{i.quantity}x {i.product_name}</span>
                      <span className="text-[var(--pos-text-secondary)] font-medium">₼{fmt(i.total_price || 0)}</span>
                    </div>
                  ))}
                </div>
                <div className="px-5 py-2 flex items-center justify-between border-t border-[var(--pos-border)] mt-1">
                  <span className="text-xs text-[var(--pos-text-secondary)]">{t('subtotal_label')}</span>
                  <span className="text-sm font-bold text-[var(--pos-price)]">₼{fmt(activeOrder.total_amount || 0)}</span>
                </div>
              </div>
            )}

            {/* ─── New cart items ─── */}
            <div className="px-5 py-3 space-y-2">
              {cart.length === 0 && (!activeOrder || !activeOrder.order_items?.length) ? (
                <div className="flex flex-col items-center justify-center py-12 text-[var(--pos-text-muted)]">
                  <ShoppingBag size={32} className="mb-2 opacity-60" />
                  <p className="text-sm font-medium">{t('cart_empty')}</p>
                </div>
              ) : cart.length > 0 && (
                <>
                  {activeOrder && activeOrder.order_items && activeOrder.order_items.length > 0 && (
                    <div className="pb-1">
                      <span className="text-xs text-amber-400/60 uppercase tracking-widest font-semibold">{t('new_items')}</span>
                    </div>
                  )}
                  {cart.map(i => (
                    <div key={i.product.id} className="flex items-center gap-3 bg-[var(--pos-bg-card)] rounded-xl px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[var(--pos-text)] truncate">{getPName(i.product)}</p>
                        <p className="text-xs text-[var(--pos-price)] font-bold">₼{fmt(i.product.price * i.qty)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => chgQty(i.product.id, -1)} className="w-8 h-8 rounded-full bg-[var(--pos-bg-card)] flex items-center justify-center text-[var(--pos-text-secondary)]"><Minus size={13} /></button>
                        <span className="w-6 text-center text-base font-bold text-[var(--pos-text)]">{i.qty}</span>
                        <button onClick={() => chgQty(i.product.id, 1)} className="w-8 h-8 rounded-full bg-[var(--pos-bg-card)] flex items-center justify-center text-[var(--pos-text-secondary)]"><Plus size={13} /></button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* ─── Bottom: note + total + send ─── */}
          <div className="px-5 py-4 border-t border-[var(--pos-border)] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--pos-text-secondary)] uppercase tracking-widest font-medium">{t('total_label')}</span>
              <div className="text-right">
                {activeOrder && total > 0 && (
                  <span className="text-[10px] text-[var(--pos-text-muted)] line-through block">₼{fmt(activeOrder.total_amount || 0)}</span>
                )}
                <span className="text-xl font-black text-[var(--pos-text)]">₼{fmt((activeOrder?.total_amount || 0) + total)}</span>
              </div>
            </div>
            <button onClick={sendOrder} disabled={!selTable || cart.length === 0 || busy}
              className="w-full py-4 rounded-xl text-sm font-bold bg-[var(--pos-send-bg)] text-[var(--pos-send-text)] border border-transparent active:scale-[0.98] disabled:opacity-30 flex items-center justify-center gap-2 hover:bg-[var(--pos-send-hover)] transition-all"
            >{busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {t('send_to_kitchen')}</button>
          </div>
        </div>
      </div>

      {/* ─── MOBILE CART ─── */}
      <AnimatePresence>
      {showCart && cart.length > 0 && (
        <motion.div initial={{ y: 200 }} animate={{ y: 0 }} exit={{ y: 200 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="lg:hidden flex-shrink-0 border-t border-[var(--pos-border)] bg-[var(--pos-bg-secondary)] px-4 py-3 space-y-2 max-h-60 overflow-y-auto">
          {cart.map(i => (
            <div key={i.product.id} className="flex items-center gap-3 bg-[var(--pos-bg-card)] rounded-xl px-3 py-2.5">
              <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-[var(--pos-text)] truncate">{getPName(i.product)}</p><p className="text-xs text-[var(--pos-price)] font-bold">₼{fmt(i.product.price * i.qty)}</p></div>
              <button onClick={() => chgQty(i.product.id, -1)} className="w-7 h-7 rounded-full bg-[var(--pos-bg-card)] flex items-center justify-center text-[var(--pos-text-secondary)]"><Minus size={11} /></button>
              <span className="w-5 text-center text-sm font-bold text-[var(--pos-text)]">{i.qty}</span>
              <button onClick={() => chgQty(i.product.id, 1)} className="w-7 h-7 rounded-full bg-[var(--pos-bg-card)] flex items-center justify-center text-[var(--pos-text-secondary)]"><Plus size={11} /></button>
            </div>
          ))}
          <div className="flex items-center gap-3 pt-1">
            <div className="flex-1"><span className="text-xs text-[var(--pos-text-secondary)]">{t('total')}</span><p className="text-xl font-black text-[var(--pos-text)]">₼{fmt(total)}</p></div>
            <button onClick={sendOrder} disabled={busy} className="flex-1 py-3.5 rounded-xl text-sm font-bold bg-[var(--pos-send-bg)] text-[var(--pos-send-text)] border border-transparent active:scale-[0.97] disabled:opacity-30 flex items-center justify-center gap-2 hover:bg-[var(--pos-send-hover)] transition-all"
            >{busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {t('send')}</button>
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* ─── MERGE OVERLAY ─── */}
      <AnimatePresence>
      {showMerge && activeOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }}
            className="bg-[var(--pos-bg-secondary)] border border-[var(--pos-border)] rounded-3xl w-full max-w-sm max-h-[80vh] overflow-y-auto p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-[var(--pos-text)]">{t('merge')}</h3>
              <button onClick={() => setShowMerge(false)} className="text-[var(--pos-text-muted)] hover:text-[var(--pos-text)] p-1"><X size={18} /></button>
            </div>
            {mergeCandidates.length === 0 ? (
              <p className="text-[var(--pos-text-secondary)] text-sm text-center py-6">{t('no_active_orders')}</p>
            ) : (
              <div className="space-y-1.5">
                {mergeCandidates.map(o => (
                  <button key={o.id} onClick={() => handleMerge(o.id)}
                    disabled={busy}
                    className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl hover:bg-[var(--pos-bg-card)] transition-colors border border-[var(--pos-border)] disabled:opacity-30">
                    <div className="text-left">
                      <p className="text-[var(--pos-text)] text-base font-medium">{t('table')} {o.table_number}</p>
                      <p className="text-xs text-[var(--pos-text-secondary)]">₼{fmt(o.total_amount || 0)} • {o.order_items?.length || 0} {t('items')}</p>
                    </div>
                    <GitMerge size={18} className="text-gold flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      )}
      </AnimatePresence>

      {/* ─── CHECKOUT OVERLAY ─── */}
      <AnimatePresence>
      {checkoutOrder && (
        <CheckoutPanel order={checkoutOrder} onClose={() => setCheckoutOrder(null)} onConfirm={confirmPayment} busy={payBusy} />
      )}
      </AnimatePresence>

    </div>
  );
}

export default function POSPage() {
  return <ThemeProvider><LanguageProvider><POS /></LanguageProvider></ThemeProvider>;
}
