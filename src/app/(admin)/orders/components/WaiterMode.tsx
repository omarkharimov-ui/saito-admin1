'use client';

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { deductStockForOrder } from '@/lib/stockAutomation';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import {
  Search, ShoppingBag, Plus, Minus, Send, CreditCard, X, Loader2, CheckCircle2,
  Printer, ImageOff, Utensils, Banknote, Users, ArrowLeft, Package,
} from 'lucide-react';

interface Product { id: string; name: string; name_az?: string; name_en?: string; name_ru?: string; price: number; image_url: string | null; is_ready_product?: boolean; direct_ingredient_id?: string | null; category_id?: string | null; }
interface RecipeIng { menu_item_id: string; ingredient_id: string; quantity_required: number; quantity_brutto: number | null; }
interface Ingredient { id: string; current_stock: number; }
interface OrderItem { id: string; product_name: string; quantity: number; unit_price: number; total_price: number; }
interface OrderData { id: string; table_number: number; total_amount: number; status: string; kitchen_status: string | null; created_at: string; order_items?: OrderItem[]; }
interface Category { id: string; name: string; }
interface CartItem { product: Product; qty: number; }

const fmt = (n: number) => n.toFixed(2);

function PCard({ p, stock, cart, onAdd, animating }: { p: Product; stock: boolean; cart: number; onAdd: () => void; animating?: boolean }) {
  const [imgState, setImgState] = useState<'loading' | 'ok' | 'err'>('loading');
  const [justAdded, setJustAdded] = useState(false);
  const { t, language } = useLanguage();
  const name = language === 'en' ? (p as any).name_en || p.name : language === 'ru' ? (p as any).name_ru || p.name : (p as any).name_az || p.name;
  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const showImg = !!p.image_url && p.image_url.trim().length > 0 && imgState !== 'err';

  const handleClick = () => {
    if (!stock) return;
    setJustAdded(true);
    onAdd();
    setTimeout(() => setJustAdded(false), 150);
  };

  return (
    <motion.button
      layout
      initial={false}
      whileHover={stock ? { y: -2, transition: { duration: 0.15 } } : undefined}
      whileTap={stock ? { scale: 0.96, transition: { duration: 0.08 } } : undefined}
      animate={justAdded ? { scale: [1, 1.08, 1], transition: { duration: 0.15 } } : undefined}
      onClick={handleClick}
      className={`relative rounded-xl p-2.5 text-left border transition-shadow duration-150 ${stock ? 'bg-white/[0.04] border-white/[0.08] hover:border-white/[0.15] hover:shadow-[0_4px_20px_rgba(212,175,55,0.08)]' : 'opacity-30 border-white/[0.03]'}`}
    >
      <div className="aspect-square rounded-lg bg-white/[0.03] mb-2 flex items-center justify-center overflow-hidden">
        {showImg
          ? <img src={p.image_url!} alt={name} className="w-full h-full object-cover" onLoad={() => setImgState('ok')} onError={() => setImgState('err')} />
          : <span className="text-2xl font-black text-white/20">{initials}</span>
        }
      </div>
      <p className="text-xs font-semibold text-white/85 truncate leading-tight">{name}</p>
      <p className="text-xs font-black text-gold mt-0.5">₼{fmt(p.price)}</p>
      {!stock && <div className="absolute inset-0 bg-black/50 rounded-xl flex items-center justify-center"><span className="text-[10px] font-bold text-white/70 bg-black/70 px-2 py-1 rounded">{t('out_of_stock')}</span></div>}
      {cart > 0 && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-1.5 right-1.5 min-w-[22px] h-[22px] px-1 rounded-full bg-gold text-black text-[10px] font-black flex items-center justify-center shadow-lg"
        >
          {cart}
        </motion.span>
      )}
      {animating && (
        <motion.div
          initial={{ scale: 1, opacity: 0.8 }}
          animate={{ scale: 0.3, opacity: 0, y: -100, x: 100 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="absolute inset-0 rounded-xl bg-gold/30 pointer-events-none"
        />
      )}
    </motion.button>
  );
}

function CheckoutPanel({ order, onClose, onConfirm, busy }: {
  order: OrderData; onClose: () => void; onConfirm: (p: { method: string; discountType: string; discountValue: number; splitCount: number; tipAmount: number }) => void; busy: boolean;
}) {
  const { t } = useLanguage();
  const [method, setMethod] = useState<'cash' | 'card'>('card');
  const [discountType, setDiscountType] = useState<'none' | 'percent' | 'amount'>('none');
  const [discountVal, setDiscountVal] = useState(0);
  const [tipVal, setTipVal] = useState(0);
  const [split, setSplit] = useState(1);
  const baseTotal = order.total_amount || 0;
  const discountAmount = discountType === 'percent' ? baseTotal * (Math.min(discountVal, 100) / 100) : discountType === 'amount' ? Math.min(discountVal, baseTotal) : 0;
  const finalTotal = baseTotal - discountAmount + tipVal;
  const perPerson = split > 1 ? finalTotal / split : finalTotal;
  const items = order.order_items || [];
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 27 }}
        className="bg-[#111] border border-white/[0.08] rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-6 pb-3">
          <h2 className="text-lg font-bold text-white">{t('table')} {order.table_number}</h2>
          <button onClick={onClose} className="text-white/20 hover:text-white/60"><X size={18} /></button>
        </div>
        <div className="px-6 space-y-1.5 mb-4">
          {items.slice(0, 8).map(i => (
            <div key={i.id} className="flex items-center justify-between text-sm">
              <span className="text-white/60">{i.quantity}x {i.product_name}</span>
              <span className="text-white/80 font-semibold">₼{fmt(i.total_price || 0)}</span>
            </div>
          ))}
          {items.length > 8 && <p className="text-xs text-white/20">+{items.length - 8} {t('more')}</p>}
          <div className="border-t border-white/[0.06] pt-2 flex items-center justify-between text-base font-bold text-white">
            <span>{t('subtotal_label')}</span>
            <span>₼{fmt(baseTotal)}</span>
          </div>
        </div>
        <div className="px-6 mb-4">
          <label className="text-xs text-white/30 uppercase tracking-widest mb-2 block">{t('discount_label')}</label>
          <div className="flex gap-1.5 mb-2">
            {(['none', 'percent', 'amount'] as const).map(k => (
              <button key={k} onClick={() => { setDiscountType(k); setDiscountVal(0); }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${discountType === k ? 'bg-white text-black' : 'bg-white/[0.04] text-white/40'}`}
              >{k === 'none' ? t('discount_none') : k === 'percent' ? '%' : '₼'}</button>
            ))}
          </div>
          {discountType !== 'none' && (
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 text-xs">{discountType === 'percent' ? '%' : '₼'}</span>
              <input type="number" min={0} max={discountType === 'percent' ? 100 : baseTotal} value={discountVal} onChange={e => setDiscountVal(Number(e.target.value))}
                className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl pl-8 pr-3 py-2 text-sm text-white outline-none" />
            </div>
          )}
          {discountAmount > 0 && <p className="text-xs text-emerald-400 mt-1">- ₼{fmt(discountAmount)}</p>}
        </div>
        <div className="px-6 mb-4">
          <label className="text-xs text-white/30 uppercase tracking-widest mb-2 block">{t('tip')}</label>
          <div className="flex items-center gap-2">
            <button onClick={() => setTipVal(Math.max(0, tipVal - 1))}
              className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-white/40 font-bold hover:bg-white/10">−</button>
            <span className="flex-1 text-center text-lg font-bold text-white tabular-nums">{tipVal} ₼</span>
            <button onClick={() => setTipVal(tipVal + 1)}
              className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-white/40 font-bold hover:bg-white/10">+</button>
          </div>
        </div>
        <div className="px-6 mb-4">
          <label className="text-xs text-white/30 uppercase tracking-widest mb-2 block">{t('split_label')}</label>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => setSplit(n)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${split === n ? 'bg-white text-black' : 'bg-white/[0.04] text-white/40'}`}
              >{n}</button>
            ))}
          </div>
        </div>
        <div className="px-6 mb-4">
          <label className="text-xs text-white/30 uppercase tracking-widest mb-2 block">{t('payment_method_label')}</label>
          <div className="flex gap-2">
            <button onClick={() => setMethod('cash')}
              className={`flex-1 py-4 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 ${method === 'cash' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/[0.04] text-white/40 border border-white/[0.06]'}`}>
              <Banknote size={18} /> {t('cash')}
            </button>
            <button onClick={() => setMethod('card')}
              className={`flex-1 py-4 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 ${method === 'card' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/[0.04] text-white/40 border border-white/[0.06]'}`}>
              <CreditCard size={18} /> {t('card')}
            </button>
          </div>
        </div>
        <div className="px-6 pb-6 pt-2 border-t border-white/[0.06] space-y-3">
          <div className="space-y-1">
            {split > 1 && <div className="flex items-center justify-between text-sm text-white/40"><span>{t('per_person')}</span><span className="font-bold text-white">₼{fmt(perPerson)}</span></div>}
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/30 uppercase tracking-widest">{t('final_total')}</span>
              {discountAmount > 0 && <span className="text-xs text-white/30 line-through mr-2">₼{fmt(baseTotal)}</span>}
              <span className="text-2xl font-black text-white">{tipVal > 0 || discountAmount > 0 || split > 1 ? `₼${fmt(finalTotal)}` : `₼${fmt(baseTotal)}`}</span>
            </div>
          </div>
          <button onClick={() => onConfirm({ method, discountType, discountValue: discountVal, splitCount: split, tipAmount: tipVal })}
            disabled={busy}
            className="w-full py-4 rounded-2xl text-base font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 active:scale-[0.98] disabled:opacity-30 flex items-center justify-center gap-2"
          >{busy ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />} {t('confirm_payment')}</button>
        </div>
      </motion.div>
    </div>
  );
}

function ReceiptScreen({ paid, onNew }: { paid: OrderData & { payment_method?: string; discount_type?: string; discount_value?: number; paid_amount?: number; split_count?: number }; onNew: () => void }) {
  const { t } = useLanguage();
  const items = paid.order_items || [];
  return (
    <div className="h-dvh flex items-center justify-center bg-[#0a0a0a] p-6">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="bg-[#111] border border-white/[0.06] rounded-3xl p-8 max-w-sm w-full text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 20, delay: 0.15 }}
          className="w-20 h-20 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-5">
          <CheckCircle2 size={40} className="text-emerald-400" />
        </motion.div>
        <h2 className="text-2xl font-bold text-white mb-1">{t('paid')}</h2>
        <p className="text-white/40 text-sm mb-1">{t('table')} {paid.table_number}</p>
        <p className="text-white/40 text-sm mb-6 flex items-center justify-center gap-1">
          {paid.payment_method === 'cash' ? <Banknote size={14} /> : <CreditCard size={14} />}
          {paid.payment_method === 'cash' ? t('cash') : t('card')}
          {paid.split_count && paid.split_count > 1 && <span className="flex items-center gap-1 ml-2"><Users size={14} />{paid.split_count} {t('person')}</span>}
        </p>
        <div className="text-left bg-white/[0.02] rounded-2xl p-4 mb-6 space-y-1">
          {items.slice(0, 5).map(i => (
            <div key={i.id} className="flex items-center justify-between text-sm">
              <span className="text-white/50">{i.quantity}x {i.product_name}</span>
              <span className="text-white/70 font-semibold">₼{fmt(i.total_price || 0)}</span>
            </div>
          ))}
          {items.length > 5 && <p className="text-[10px] text-white/20">+{items.length - 5}</p>}
          <div className="border-t border-white/[0.06] pt-2 flex items-center justify-between text-base font-bold text-white">
            <span>{t('total')}</span>
            <span>₼{fmt(paid.total_amount || 0)}</span>
          </div>
        </div>
        <button onClick={() => window.print()}
          className="w-full py-4 rounded-2xl bg-white/10 text-white text-base font-bold hover:bg-white/20 mb-3 flex items-center justify-center gap-2">
          <Printer size={18} /> {t('print')}
        </button>
        <button onClick={onNew}
          className="w-full py-4 rounded-2xl bg-white/[0.04] text-white/50 text-base hover:text-white">{t('new_order')}</button>
      </motion.div>
    </div>
  );
}

export default function WaiterMode({ onClose }: { onClose: () => void }) {
  const { t, language } = useLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<RecipeIng[]>([]);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tableCount, setTableCount] = useState(30);
  const [loading, setLoading] = useState(true);
  const [selTable, setSelTable] = useState<number | null>(null);
  const [cat, setCat] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway' | 'delivery'>('dine_in');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [paid, setPaid] = useState<OrderData & { payment_method?: string; discount_type?: string; discount_value?: number; paid_amount?: number; split_count?: number; tip_amount?: number } | null>(null);
  const [checkoutOrder, setCheckoutOrder] = useState<OrderData | null>(null);
  const initialCatRef = useRef(false);

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
      if (!initialCatRef.current && cr.data?.length) { setCat(cr.data[0].id); initialCatRef.current = true; }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const d = () => { if (timer) clearTimeout(timer); timer = setTimeout(fetchAll, 1000); };
    const ch = createRealtimeChannel('waiter')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, d)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, d)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients' }, d)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, d)
      .subscribe();
    const pi = setInterval(fetchAll, 10000);
    return () => { if (timer) clearTimeout(timer); removeRealtimeChannel(ch); clearInterval(pi); };
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
      const items = cart.map(i => ({ product_id: i.product.id, product_name: getPName(i.product), quantity: i.qty, unit_price: i.product.price, total_price: i.product.price * i.qty, course: 'main' }));
      if (activeOrder) {
        await supabase.from('order_items').insert(items.map(i => ({ ...i, order_id: activeOrder.id })));
        await supabase.from('orders').update({ total_amount: (activeOrder.total_amount || 0) + total, status: 'confirmed', kitchen_status: 'pending', order_type: orderType }).eq('id', activeOrder.id);
      } else {
        const { data: o, error } = await supabase.from('orders').insert({ table_number: selTable, total_amount: total, status: 'confirmed', kitchen_status: 'pending', order_type: orderType }).select().single();
        if (error) throw error;
        await supabase.from('order_items').insert(items.map(i => ({ ...i, order_id: o.id })));
      }
      setCart([]); setShowCart(false); fetchAll();
    } catch (e) { console.error(e); } finally { setBusy(false); }
  }, [selTable, cart, total, activeOrder, fetchAll, getPName]);

  const confirmPayment = useCallback(async (p: { method: string; discountType: string; discountValue: number; splitCount: number; tipAmount: number }) => {
    if (!checkoutOrder) return;
    setPayBusy(true);
    try {
      const base = checkoutOrder.total_amount || 0;
      const discountAmount = p.discountType === 'percent' ? base * (Math.min(p.discountValue, 100) / 100) : p.discountType === 'amount' ? Math.min(p.discountValue, base) : 0;
      const paidAmount = base - discountAmount;
      await supabase.from('orders').update({
        status: 'paid', payment_method: p.method, discount_type: p.discountType, discount_value: p.discountValue, paid_amount: paidAmount, split_count: p.splitCount, tip_amount: p.tipAmount,
      }).eq('id', checkoutOrder.id);
      try { await deductStockForOrder(checkoutOrder.id); } catch (e) { console.error(e); }
      setPaid({ ...checkoutOrder, payment_method: p.method, discount_type: p.discountType, discount_value: p.discountValue, paid_amount: paidAmount, split_count: p.splitCount, tip_amount: p.tipAmount });
      setCheckoutOrder(null);
      fetchAll();
    } catch (e) { console.error(e); } finally { setPayBusy(false); }
  }, [checkoutOrder, fetchAll]);

  const list = useMemo(() => {
    let l = products;
    if (cat) l = l.filter(p => p.category_id === cat);
    if (search) { const q = search.toLowerCase(); l = l.filter(p => getPName(p).toLowerCase().includes(q)); }
    return l;
  }, [products, cat, search, getPName]);

  if (loading) return (
    <div className="fixed inset-0 z-[200] bg-[#0a0a0a] flex items-center justify-center">
      <Loader2 size={24} className="animate-spin text-white/20" />
    </div>
  );

  if (paid) return (
    <div className="fixed inset-0 z-[200] bg-[#0a0a0a]">
      <ReceiptScreen paid={paid} onNew={() => { setPaid(null); setSelTable(null); setCart([]); }} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#0a0a0a] overflow-hidden select-none">

      {/* ─── HEADER ─── */}
      <div className="flex-shrink-0 border-b border-white/[0.06] bg-[#0c0c0c]">
        <div className="flex items-center gap-2 px-3 pt-2 pb-1">
          <button onClick={onClose} className="flex items-center gap-1.5 text-white/40 hover:text-white/80 text-sm font-semibold">
            <ArrowLeft size={15} /> {t('orders')}
          </button>
          <div className="flex-1" />
          <button onClick={() => setShowCart(!showCart)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/[0.06] text-sm font-semibold text-white/70">
            <ShoppingBag size={15} /> ₼{fmt(total)}
            {cart.length > 0 && <span className="w-5 h-5 rounded-full bg-gold text-black text-[10px] font-black flex items-center justify-center">{cart.reduce((s, i) => s + i.qty, 0)}</span>}
          </button>
        </div>
        <div className="flex gap-2 px-3 pb-2 overflow-x-auto">
          {Array.from({ length: tableCount }, (_, i) => i + 1).map(n => {
            const o = orders.find(x => x.table_number === n && x.status !== 'paid');
            const s = selTable === n;
            const r = o?.kitchen_status === 'ready';
            return (
              <button key={n} onClick={() => { setSelTable(s ? null : n); setShowCart(false); }}
                className={`relative flex-shrink-0 w-14 h-14 rounded-xl text-sm font-bold transition-all ${
                  s ? 'bg-white text-black shadow-md' :
                  o ? (r ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/12 text-rose-400 border border-rose-500/20') :
                  'bg-white/[0.04] text-white/30'
                }`}
              >{n}{o && <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${r ? 'bg-emerald-400' : 'bg-rose-400'}`} />}</button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 px-3 pb-2">
          <span className="text-sm text-white/30 font-semibold">{products.length} {t('items')}</span>
          <span className="text-white/[0.06]">|</span>
          <span className="text-sm text-white/30 font-semibold">{orders.filter(o => o.status !== 'paid').length} {t('active_count')}</span>
          {activeOrder && <><span className="text-white/[0.06]">|</span><span className="text-sm text-amber-400 font-semibold">{t('table')} {selTable} • ₼{fmt(activeOrder.total_amount || 0)}</span></>}
        </div>
      </div>

      {/* ─── SEARCH + CATEGORIES ─── */}
      <div className="flex-shrink-0 px-3 pt-3 pb-2 space-y-2">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('search_placeholder')} className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl pl-10 pr-3 py-3 text-sm text-white placeholder:text-white/20 outline-none" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20"><X size={16} /></button>}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {categories.map(c => (
            <button key={c.id} onClick={() => setCat(cat === c.id ? null : c.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold tracking-wider ${cat === c.id ? 'bg-white text-black' : 'bg-white/[0.04] text-white/40'}`}
            >{c.name}</button>
          ))}
        </div>
      </div>

      {/* ─── MAIN CONTENT ─── */}
      <div className="flex-1 flex min-h-0">
        <div className={`flex-1 overflow-y-auto px-3 pb-4 ${showCart ? 'hidden lg:block' : ''}`}>
          {!selTable ? (
            <div className="flex flex-col items-center justify-center h-full text-white/15">
              <Utensils size={48} className="mb-3 opacity-30" />
              <p className="text-base font-medium tracking-wide">{t('select_table')}</p>
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-white/15">
              <Search size={48} className="mb-3 opacity-30" />
              <p className="text-base font-medium tracking-wide">{t('not_found')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {list.map(p => <PCard key={p.id} p={p} stock={avail[p.id] !== false} cart={cart.find(i => i.product.id === p.id)?.qty || 0} onAdd={() => addItem(p)} />)}
            </div>
          )}
        </div>

        {/* ─── CART ─── */}
        <AnimatePresence>
        {showCart && (
          <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 320, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
            className="hidden lg:flex flex-col border-l border-white/[0.06] bg-[#0c0c0c] flex-shrink-0 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <span className="text-base font-bold text-white">{selTable ? `${t('table')} ${selTable}` : t('cart')}</span>
              <div className="flex items-center gap-3">
                <button onClick={() => setCart([])} className="text-xs text-white/20 hover:text-white/50">{t('clear')}</button>
                <button onClick={() => setShowCart(false)} className="text-white/20 hover:text-white/60"><X size={16} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-white/15 text-sm">{t('cart_empty')}</div>
              ) : cart.map(i => (
                <div key={i.product.id} className="flex items-center gap-3 bg-white/[0.03] rounded-xl px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white/80 truncate">{getPName(i.product)}</p>
                    <p className="text-xs text-gold font-bold">₼{fmt(i.product.price * i.qty)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => chgQty(i.product.id, -1)} className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40"><Minus size={13} /></button>
                    <span className="w-6 text-center text-base font-bold text-white">{i.qty}</span>
                    <button onClick={() => chgQty(i.product.id, 1)} className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40"><Plus size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-white/[0.06] space-y-2">
              <div className="flex items-center gap-1.5 p-1 bg-white/[0.04] border border-white/[0.08] rounded-xl">
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
              <div className="flex items-center justify-between"><span className="text-xs text-white/30 uppercase tracking-widest">{t('total')}</span><span className="text-xl font-black text-white">₼{fmt(total)}</span></div>
              <button onClick={sendOrder} disabled={!selTable || cart.length === 0 || busy}
                className="w-full py-4 rounded-xl text-sm font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 active:scale-[0.98] disabled:opacity-30 flex items-center justify-center gap-2"
              >{busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {t('send_to_kitchen')}</button>
            </div>
          </motion.div>
        )}
        </AnimatePresence>
      </div>

      {/* ─── MOBILE CART ─── */}
      <AnimatePresence>
      {showCart && cart.length > 0 && (
        <motion.div initial={{ y: 200 }} animate={{ y: 0 }} exit={{ y: 200 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="lg:hidden flex-shrink-0 border-t border-white/[0.06] bg-[#0c0c0c] px-4 py-3 space-y-2 max-h-60 overflow-y-auto">
          {cart.map(i => (
            <div key={i.product.id} className="flex items-center gap-3 bg-white/[0.03] rounded-xl px-3 py-2.5">
              <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-white/80 truncate">{getPName(i.product)}</p><p className="text-xs text-gold font-bold">₼{fmt(i.product.price * i.qty)}</p></div>
              <button onClick={() => chgQty(i.product.id, -1)} className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40"><Minus size={11} /></button>
              <span className="w-5 text-center text-sm font-bold text-white">{i.qty}</span>
              <button onClick={() => chgQty(i.product.id, 1)} className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40"><Plus size={11} /></button>
            </div>
          ))}
          <div className="flex items-center gap-1.5 p-1 bg-white/[0.04] border border-white/[0.08] rounded-xl">
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
          <div className="flex items-center gap-3 pt-1">
            <div className="flex-1"><span className="text-xs text-white/30">{t('total')}</span><p className="text-xl font-black text-white">₼{fmt(total)}</p></div>
            <button onClick={sendOrder} disabled={busy} className="flex-1 py-3.5 rounded-xl text-sm font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 active:scale-[0.97] disabled:opacity-30 flex items-center justify-center gap-2"
            >{busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {t('send')}</button>
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* ─── TABLE ORDERS ─── */}
      {selTable && (
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="flex-shrink-0 border-t border-white/[0.06] bg-[#0c0c0c]">
          <div className="flex gap-2 overflow-x-auto px-3 py-2">
            {orders.filter(o => o.table_number === selTable && o.status !== 'paid').map(o => {
              const items = o.order_items || [];
              const ready = o.kitchen_status === 'ready';
              return (
                <div key={o.id} className={`flex-shrink-0 w-80 rounded-xl border p-4 ${ready ? 'border-emerald-500/30 bg-emerald-500/[0.04]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-bold ${ready ? 'text-emerald-400' : 'text-amber-400'}`}>{ready ? t('ready') : t('waiting')}</span>
                    <span className="text-sm font-black text-white/70">₼{fmt(o.total_amount || 0)}</span>
                  </div>
                  <div className="space-y-1 mb-3 max-h-24 overflow-y-auto">
                    {items.slice(0, 5).map((i: any) => <div key={i.id} className="text-xs text-white/60">{i.quantity}x {i.product_name}</div>)}
                    {items.length > 5 && <p className="text-[10px] text-white/20">+{items.length - 5}</p>}
                  </div>
                  {ready && <button onClick={() => setCheckoutOrder(o)}
                    className="w-full py-3 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 active:scale-[0.97] flex items-center justify-center gap-1"
                  ><CreditCard size={12} /> {t('pay')} • ₼{fmt(o.total_amount || 0)}</button>}
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* ─── CHECKOUT OVERLAY ─── */}
      <AnimatePresence>
      {checkoutOrder && (
        <CheckoutPanel order={checkoutOrder} onClose={() => setCheckoutOrder(null)} onConfirm={confirmPayment} busy={payBusy} />
      )}
      </AnimatePresence>
    </div>
  );
}
