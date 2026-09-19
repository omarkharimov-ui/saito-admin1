'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus, ShoppingCart, X, Send } from 'lucide-react';

interface Product {
  id: string;
  name_az: string;
  name_en: string;
  name_ru: string;
  price: number;
  image_url?: string;
  category?: any;
}

interface CartItem extends Product {
  quantity: number;
}

export default function MenuPage({ searchParams }: { searchParams: Promise<{ table?: string }> }) {
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  // 1.5 — QR VAT toggle (R3: sərbəst). Display estimate only; final total = server SSOT.
  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatPct, setVatPct] = useState(18);
  const [applyVat, setApplyVat] = useState(false);

  const fetchVatConfig = async () => {
    try {
      const res = await fetch('/api/public/vat-config');
      if (res.ok) {
        const data = await res.json();
        setVatEnabled(!!data.vat_enabled);
        setVatPct(Number(data.vat_percentage) || 18);
      }
    } catch { /* estimate falls back to 18 */ }
  };

  useEffect(() => {
    searchParams.then(params => {
      if (params.table) setTableNumber(Number(params.table));
    });
    fetchProducts();
    fetchVatConfig();
  }, [searchParams]);

  const fetchProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('id, name_az, name_en, name_ru, price, image_url, category:category_id(name_az, name_en, name_ru)')
      .eq('is_available', true)
      .eq('is_in_stock', true)
      .order('name_az', { ascending: true });
    if (data) setProducts(data);
    setLoading(false);
  };

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.id !== productId));
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === productId) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const [sending, setSending] = useState(false);
  // W-A1: optional guest phone (loyalty/CRM) + post-order status card with polling.
  const [phone, setPhone] = useState('');
  const [lastOrder, setLastOrder] = useState<{ id: string; total: number } | null>(null);
  const [statusInfo, setStatusInfo] = useState<any>(null);

  useEffect(() => {
    if (!lastOrder || !tableNumber) return;
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch(`/api/orders/qr/status?table=${tableNumber}`, { cache: 'no-store' });
        if (!r.ok) return;
        const d = await r.json();
        if (!alive) return;
        if (d?.has_order && d.order?.id === lastOrder.id) setStatusInfo(d.order);
      } catch { /* transient; next poll retries */ }
    };
    poll();
    const iv = setInterval(poll, 15_000);
    return () => { alive = false; clearInterval(iv); };
  }, [lastOrder, tableNumber]);

  const sendToKitchen = async () => {
    if (!tableNumber || cart.length === 0 || sending) return;
    setSending(true);
    try {
      const items = cart.map(item => ({
        product_id: item.id,
        product_name: item.name_az || item.name_en || item.name_ru,
        quantity: item.quantity,
        unit_price: item.price,
        total_price: item.price * item.quantity,
      }));

      const phoneTrim = phone.trim();
      const res = await fetch('/api/orders/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_number: tableNumber,
          items,
          order_type: 'qr_order',
          apply_vat: applyVat && vatEnabled,
          ...(phoneTrim ? { customer_phone: phoneTrim } : {}),
        }),
      });
      const data = await res.json().catch(() => null);

      if (res.ok) {
        toast.success(data?.customer ? 'Sifariş qəbul edildi — bonus xallarınız yığılır!' : 'Sifarişiniz qəbul edildi!');
        setCart([]);
        setPhone('');
        setStatusInfo(null);
        setLastOrder({ id: data.orderId, total: data.total });
      } else {
        toast.error(data?.error || 'Xəta baş verdi');
      }
    } catch {
      toast.error('Xəta baş verdi');
    } finally {
      setSending(false);
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const vatOn = applyVat && vatEnabled;
  const vatEstimate = vatOn ? (cartTotal * vatPct) / 100 : 0;
  const cartTotalWithVat = cartTotal + vatEstimate;

  const grouped = products.reduce((acc: any, p: any) => {
    const catName = p.category?.name_az || p.category?.name_en || p.category?.name_ru || 'Digər';
    if (!acc[catName]) acc[catName] = [];
    acc[catName].push(p);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-3xl font-bold text-center mb-2">Menyu</h1>
        {tableNumber && <p className="text-center text-gray-500 mb-6">Masa {tableNumber}</p>}

        {Object.entries(grouped).map(([cat, items]: any) => (
          <div key={cat} className="mb-8">
            <h2 className="text-xl font-semibold mb-4 pb-2 border-b">{cat}</h2>
            <div className="grid gap-4">
              {items.map((product: Product) => (
                <div key={product.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-4">
                  {product.image_url && (
                    <img src={product.image_url} alt="" className="w-16 h-16 rounded-xl object-cover" />
                  )}
                  <div className="flex-1">
                    <h3 className="font-semibold">{product.name_az || product.name_en || product.name_ru}</h3>
                    <p className="text-gold font-bold">₼{Number(product.price).toFixed(2)}</p>
                  </div>
                  <button
                    onClick={() => addToCart(product)}
                    className="w-10 h-10 rounded-full bg-gold text-black flex items-center justify-center font-bold text-xl hover:bg-yellow-500 transition-all active:scale-90"
                  >
                    +
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* W-A1: post-order status card (polls every 15s) */}
      {lastOrder && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md">
          <div className="bg-black text-white rounded-2xl px-5 py-4 shadow-2xl">
            <div className="flex items-center justify-between mb-2">
              <span className="font-black text-sm tracking-wide">
                {statusInfo
                  ? ({ confirmed: 'Qəbul edildi ✓', in_kitchen: 'Hazırlanır…', ready: 'Hazırdır', paid: 'Ödənilib', closed: 'Bağlanıb' } as Record<string, string>)[statusInfo.status] || 'Sifariş göndərildi'
                  : 'Sifariş göndərildi…'}
              </span>
              <button onClick={() => { setLastOrder(null); setStatusInfo(null); }} className="text-white/50 hover:text-white text-xs">✕</button>
            </div>
            {statusInfo && (
              <div className="flex items-center justify-between text-xs text-white/70">
                <span>
                  #{String(lastOrder.id).slice(0, 8)} · {statusInfo.item_count ?? '—'} mövqe
                  {statusInfo.customer_linked ? ' · bonus xallar aktiv' : ''}
                </span>
                <span className="font-bold text-white">₼{Number(statusInfo.total).toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* W-A1: optional guest phone (shown while the cart is open) */}
      {cart.length > 0 && !lastOrder && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md">
          <div className="bg-white rounded-2xl px-4 py-3 shadow-xl border border-gray-200">
            <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Telefon (ixtiyari — bonus xallar üçün)</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+994 50 123 45 67"
              className="mt-1 w-full bg-transparent outline-none text-sm font-medium text-gray-900"
            />
          </div>
        </div>
      )}

      {/* Cart FAB */}
      <AnimatePresence>
        {!lastOrder && cart.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="bg-black text-white rounded-full px-6 py-4 shadow-2xl flex items-center gap-4">
              <div className="relative">
                <ShoppingCart size={24} />
                <span className="absolute -top-2 -right-2 bg-gold text-black text-xs font-black rounded-full w-5 h-5 flex items-center justify-center">
                  {cartCount}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <div className="font-bold">{vatOn ? `₼${cartTotalWithVat.toFixed(2)}` : `₼${cartTotal.toFixed(2)}`}</div>
                {vatOn && <div className="text-[10px] text-white/60">ƏDV {vatPct}% daxil: ₼{vatEstimate.toFixed(2)}</div>}
              </div>
              {vatEnabled && (
                <button
                  onClick={() => setApplyVat(v => !v)}
                  className={`px-3 py-2 rounded-full text-[10px] font-black uppercase tracking-wide transition-all ${vatOn ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white/60'}`}
                >
                  ƏDV {vatOn ? 'ON' : 'OFF'}
                </button>
              )}
              <button
                onClick={sendToKitchen}
                disabled={sending}
                className="bg-black text-white px-4 py-2 rounded-full font-black text-xs hover:bg-gray-800 transition-all active:scale-90 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? (
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <Send size={14} />
                )}
                {sending ? 'Göndərilir...' : 'Göndər'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}