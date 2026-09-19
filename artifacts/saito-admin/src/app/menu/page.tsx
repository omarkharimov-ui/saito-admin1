'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { motion, AnimatePresence } from 'framer-motion';

// SAITO UI VISUAL DIRECTION (2026-09-19, ratified): calm, content-first,
// quiet. The sticky bar is ONE quiet line — food → total → action — never a
// conventional cart widget (no badges, icons, gradients, heavy borders).
// Backend contracts are FROZEN (W-A2): /api/orders/qr (create, returns
// checkToken+checkCode once), /api/orders/qr/add (404/409/400),
// /api/orders/qr/relink (code rotation), /api/orders/qr/status (table poll).

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

interface Check {
  token: string;
  code: string;
  orderId: string;
  total: number;
}

interface TableOrder {
  id: string;
  status: string;
  total: number;
  item_count?: number;
  customer_linked?: boolean;
}

const ACTIVE_STATUSES = ['confirmed', 'in_kitchen', 'ready'];
const STATUS_AZ: Record<string, string> = {
  confirmed: 'Qəbul edildi',
  in_kitchen: 'Hazırlanır',
  ready: 'Hazırdır',
  paid: 'Ödənilib',
  closed: 'Bağlanıb',
};

const checkKey = (t: number) => `saito_check_${t}`;

export default function MenuPage({ searchParams }: { searchParams: Promise<{ table?: string }> }) {
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  // W-A2: the live check for THIS table (token = add credential, code = re-attach).
  const [check, setCheck] = useState<Check | null>(null);
  const [tableOrder, setTableOrder] = useState<TableOrder | null>(null);
  // Phone is REQUIRED at check creation (CRM/loyalty identity). Device memory:
  // a returning customer on the same phone never re-enters it (silent reuse).
  const [phone, setPhone] = useState('');
  const [savedPhone, setSavedPhone] = useState('');
  const [busy, setBusy] = useState<'' | 'create' | 'add' | 'relink'>('');

  // One-time raw-code moment (after create / after relink) — the server never
  // re-serves the code, so it is shown exactly once per mint.
  const [codePanel, setCodePanel] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false); // "Kod" (from localStorage)
  const [relinkOpen, setRelinkOpen] = useState(false);
  const [relinkCode, setRelinkCode] = useState('');
  const [relinkError, setRelinkError] = useState('');

  const fetched = useRef(false);

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

  const fetchStatus = useCallback(async (t: number) => {
    try {
      const r = await fetch(`/api/orders/qr/status?table=${t}`, { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      setTableOrder(d?.has_order && d.order ? d.order : null);
    } catch { /* transient; next poll retries */ }
  }, []);

  useEffect(() => {
    searchParams.then(async (params) => {
      const t = params.table ? Number(params.table) : null;
      if (t) {
        setTableNumber(t);
        try {
          const raw = localStorage.getItem(checkKey(t));
          if (raw) {
            const c: Check = JSON.parse(raw);
            if (c?.token) setCheck(c);
          }
          const sp = localStorage.getItem('saito_phone');
          if (sp) setSavedPhone(sp);
        } catch { /* corrupt local state -> fresh start */ }
      }
      if (!fetched.current) { fetched.current = true; fetchProducts(); }
    });
  }, [searchParams]);

  // Poll the table (15s) — drives the continue bar, detects foreign checks
  // (S4), and notices when our check gets paid/closed.
  useEffect(() => {
    if (!tableNumber) return;
    fetchStatus(tableNumber);
    const iv = setInterval(() => fetchStatus(tableNumber), 15_000);
    return () => clearInterval(iv);
  }, [tableNumber, fetchStatus]);

  // Reconcile check vs table order (token rotation, paid/closed, foreign order).
  useEffect(() => {
    if (!tableNumber || !tableOrder) return;
    const active = ACTIVE_STATUSES.includes(tableOrder.status);
    if (!check) return; // nothing to reconcile
    if (check.orderId === tableOrder.id && !active) {
      // Our check was paid/closed — drop the credential, quiet note.
      setCheck(null);
      localStorage.removeItem(checkKey(tableNumber));
    } else if (check.orderId !== tableOrder.id) {
      // A different check owns this table now (or ours was superseded).
      setCheck(null);
      localStorage.removeItem(checkKey(tableNumber));
    }
  }, [tableOrder, check, tableNumber]);

  const persistCheck = (c: Check | null) => {
    setCheck(c);
    if (!c || !tableNumber) { if (tableNumber) localStorage.removeItem(checkKey(tableNumber)); return; }
    localStorage.setItem(checkKey(tableNumber), JSON.stringify(c));
  };

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const decFromCart = (productId: string) => {
    setCart(prev => prev.flatMap(item => {
      if (item.id !== productId) return [item];
      const q = item.quantity - 1;
      return q <= 0 ? [] : [{ ...item, quantity: q }];
    }));
  };

  const cartTotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  const itemsPayload = () => cart.map(item => ({
    product_id: item.id,
    quantity: item.quantity,
    unit_price: item.price, // ignored server-side (D13) — sent for contract parity
  }));

  // ── CREATE (first check on the table) ────────────────────────────────────
  const phoneClean = (s: string) => s.replace(/[\s-]/g, '');
  const phoneValid = (s: string) => /^\+?[0-9]{8,15}$/.test(phoneClean(s));
  const effectivePhone = phone.trim() || savedPhone;
  const needsPhoneInput = !phoneValid(savedPhone); // first check on this device

  const createCheck = async () => {
    if (!tableNumber || cart.length === 0 || busy || !phoneValid(effectivePhone)) return;
    setBusy('create');
    try {
      const res = await fetch('/api/orders/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_number: tableNumber,
          items: itemsPayload(),
          order_type: 'qr_order',
          customer_phone: phoneClean(effectivePhone),
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.checkToken) {
        persistCheck({ token: data.checkToken, code: String(data.checkCode), orderId: data.orderId, total: Number(data.total) });
        localStorage.setItem('saito_phone', phoneClean(effectivePhone));
        setSavedPhone(phoneClean(effectivePhone));
        setCart([]);
        setPhone('');
        setCodePanel(String(data.checkCode)); // one-time raw code moment
        if (data?.customer) toast.success('Sifariş qəbul edildi — bonus xallarınız yığılır!');
        else toast.success('Sifarişiniz qəbul edildi!');
      } else {
        toast.error(data?.error || 'Xəta baş verdi');
      }
    } catch {
      toast.error('Xəta baş verdi');
    } finally {
      setBusy('');
    }
  };

  // ── ADD to the live check ────────────────────────────────────────────────
  const addToCheck = async () => {
    if (!tableNumber || !check || cart.length === 0 || busy) return;
    setBusy('add');
    try {
      const res = await fetch('/api/orders/qr/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_number: tableNumber,
          check_token: check.token,
          items: itemsPayload(),
          idempotency_key: crypto.randomUUID(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        persistCheck({ ...check, total: Number(data.total) });
        setCart([]);
        toast.success('Check-ə əlavə edildi');
      } else if (res.status === 404) {
        // Token rotated/consumed — re-attach by code.
        persistCheck(null);
        setRelinkOpen(true);
        toast.error('Check yenilənib — kodu daxil edin');
      } else if (res.status === 409) {
        persistCheck(null);
        toast.success('Hesab alınıb — sağ olun!');
      } else {
        toast.error(data?.error || 'Əlavə olunmadı');
      }
    } catch {
      toast.error('Xəta baş verdi');
    } finally {
      setBusy('');
    }
  };

  // ── RELINK (lost token → 6-digit code, server rotates) ───────────────────
  const doRelink = async () => {
    if (!tableNumber || relinkCode.length !== 6 || busy) return;
    setBusy('relink');
    setRelinkError('');
    try {
      const res = await fetch('/api/orders/qr/relink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_number: tableNumber, check_code: relinkCode }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        persistCheck({ token: data.checkToken, code: String(data.checkCode), orderId: data.orderId, total: Number(data.total) });
        setRelinkOpen(false);
        setRelinkCode('');
        setCodePanel(String(data.checkCode)); // rotated code — show once
      } else if (res.status === 404) {
        setRelinkError('Kod səhvdir');
      } else if (res.status === 409) {
        setRelinkOpen(false);
        toast.success('Hesab alınıb — sağ olun!');
      } else {
        setRelinkError(data?.error || 'Xəta baş verdi');
      }
    } catch {
      setRelinkError('Xəta baş verdi');
    } finally {
      setBusy('');
    }
  };

  const activeTableOrder = tableOrder && ACTIVE_STATUSES.includes(tableOrder.status) ? tableOrder : null;
  const bar: '' | 'create' | 'add' | 'continue' | 'foreign' =
    check && check.orderId === tableOrder?.id && activeTableOrder
      ? (cart.length > 0 ? 'add' : 'continue')
      : (!check && activeTableOrder ? 'foreign' : (cart.length > 0 ? 'create' : ''));

  const grouped = products.reduce((acc: any, p: any) => {
    const catName = p.category?.name_az || p.category?.name_en || p.category?.name_ru || 'Digər';
    if (!acc[catName]) acc[catName] = [];
    acc[catName].push(p);
    return acc;
  }, {});

  const money = (n: number) => `₼${Number(n).toFixed(2)}`;

  return (
    <div className="min-h-screen bg-gray-50 pb-40">
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-3xl font-bold text-center mb-1">Menyu</h1>
        {tableNumber && <p className="text-center text-gray-400 text-sm mb-6">Masa {tableNumber}</p>}

        {loading ? (
          <div className="text-center text-gray-400 text-sm py-16">Yüklənir…</div>
        ) : (
          Object.entries(grouped).map(([cat, items]: any) => (
            <div key={cat} className="mb-8">
              <h2 className="text-lg font-semibold mb-3">{cat}</h2>
              <div className="space-y-3">
                {items.map((product: Product) => {
                  const inCart = cart.find(i => i.id === product.id)?.quantity || 0;
                  return (
                    <div key={product.id} className="bg-white rounded-2xl p-4 flex items-center gap-4">
                      {product.image_url && (
                        <img src={product.image_url} alt="" className="w-14 h-14 rounded-xl object-cover" />
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-[15px] leading-snug">{product.name_az || product.name_en || product.name_ru}</h3>
                        <p className="text-gray-500 text-sm mt-0.5">{money(product.price)}</p>
                      </div>
                      {inCart === 0 ? (
                        <button
                          onClick={() => addToCart(product)}
                          aria-label="Əlavə et"
                          className="w-9 h-9 rounded-full border border-gray-300 text-gray-700 flex items-center justify-center text-lg font-light hover:border-gray-500 transition-colors active:scale-95"
                        >+</button>
                      ) : (
                        <div className="flex items-center gap-3">
                          <button onClick={() => decFromCart(product.id)} aria-label="Azalt"
                            className="w-8 h-8 rounded-full border border-gray-300 text-gray-600 flex items-center justify-center text-base hover:border-gray-500 transition-colors active:scale-95">−</button>
                          <span className="w-5 text-center text-sm font-semibold">{inCart}</span>
                          <button onClick={() => addToCart(product)} aria-label="Artır"
                            className="w-8 h-8 rounded-full border border-gray-300 text-gray-700 flex items-center justify-center text-base hover:border-gray-500 transition-colors active:scale-95">+</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Quiet sticky bar — one line: context · total → action */}
      <AnimatePresence>
        {bar !== '' && !codePanel && !showCode && !relinkOpen && (
          <motion.div
            key={bar}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.18 }}
            className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200"
          >
            {/* phone — required at creation; hidden on devices that already
                know the customer (silent reuse of the saved number) */}
            {bar === 'create' && needsPhoneInput && (
              <div className="max-w-2xl mx-auto px-6 pt-3">
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="Telefon nömrəniz"
                  className="w-full bg-transparent outline-none text-sm text-gray-800 placeholder:text-gray-400 pb-2 border-b border-gray-100 focus:border-gray-300 transition-colors"
                />
                {phone.trim() !== '' && !phoneValid(phone) && (
                  <p className="text-[11px] text-red-500 mt-1">Düzgün nömrə daxil edin</p>
                )}
              </div>
            )}
            <div className="max-w-2xl mx-auto px-6 py-3.5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                {bar === 'create' && <span className="text-sm text-gray-800">{cartCount} mövqe · <span className="font-semibold">{money(cartTotal)}</span></span>}
                {bar === 'add' && <span className="text-sm text-gray-800">{cartCount} mövqe · <span className="font-semibold">{money(cartTotal)}</span></span>}
                {bar === 'continue' && check && (
                  <div>
                    <span className="text-sm text-gray-800">Açıq check · <span className="font-semibold">{money(tableOrder!.total)}</span></span>
                    {tableOrder!.status && (
                      <div className="text-[11px] text-gray-400 mt-0.5">{STATUS_AZ[tableOrder!.status] || 'Sifariş göndərildi'}{tableOrder!.customer_linked ? ' · bonus aktiv' : ''}</div>
                    )}
                  </div>
                )}
                {bar === 'foreign' && tableOrder && (
                  <div>
                    <span className="text-sm text-gray-800">Bu cədvəldə açıq check var · <span className="font-semibold">{money(tableOrder.total)}</span></span>
                  </div>
                )}
              </div>
              {bar === 'create' && (
                <button onClick={createCheck} disabled={busy !== '' || !phoneValid(effectivePhone)}
                  className="text-sm font-semibold text-gray-900 hover:text-black disabled:opacity-40 transition-colors whitespace-nowrap">
                  {busy === 'create' ? 'Göndərilir…' : 'Check aç →'}
                </button>
              )}
              {bar === 'add' && (
                <button onClick={addToCheck} disabled={busy !== ''}
                  className="text-sm font-semibold text-gray-900 hover:text-black disabled:opacity-40 transition-colors whitespace-nowrap">
                  {busy === 'add' ? 'Əlavə olunur…' : 'Check-ə əlavə et →'}
                </button>
              )}
              {bar === 'continue' && (
                <div className="flex items-center gap-4">
                  <button onClick={() => setShowCode(true)} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Kod</button>
                  <a href="#" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className="text-sm font-semibold text-gray-900 hover:text-black transition-colors whitespace-nowrap">Davam et →</a>
                </div>
              )}
              {bar === 'foreign' && (
                <button onClick={() => setRelinkOpen(true)}
                  className="text-sm font-semibold text-gray-900 hover:text-black transition-colors whitespace-nowrap">
                  Kodu daxil et →
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* One-time code moment (after create / after relink) */}
      <AnimatePresence>
        {codePanel && (
          <motion.div key="code" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/20 flex items-end sm:items-center justify-center">
            <motion.div initial={{ y: 16 }} animate={{ y: 0 }} exit={{ y: 16, opacity: 0 }} transition={{ duration: 0.18 }}
              className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-8 text-center">
              <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-gray-400">Check kodunuz</p>
              <p className="text-4xl font-semibold tracking-[0.3em] text-gray-900 mt-4">{codePanel}</p>
              <p className="text-xs text-gray-500 mt-4 leading-relaxed">Saxlayın — cihaz dəyişsə belə bu kodla check-inə qayıtsınız.</p>
              <button onClick={() => setCodePanel(null)}
                className="mt-6 text-sm font-semibold text-gray-900 hover:text-black transition-colors">Bağla</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Saved code (client-side; the server never re-serves it) */}
      <AnimatePresence>
        {showCode && check && (
          <motion.div key="showcode" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/20 flex items-end sm:items-center justify-center">
            <motion.div initial={{ y: 16 }} animate={{ y: 0 }} exit={{ y: 16, opacity: 0 }} transition={{ duration: 0.18 }}
              className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-8 text-center">
              <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-gray-400">Check kodunuz</p>
              <p className="text-4xl font-semibold tracking-[0.3em] text-gray-900 mt-4">{check.code}</p>
              <button onClick={() => setShowCode(false)}
                className="mt-6 text-sm font-semibold text-gray-900 hover:text-black transition-colors">Bağla</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Relink — code entry (6 digits) */}
      <AnimatePresence>
        {relinkOpen && (
          <motion.div key="relink" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/20 flex items-end sm:items-center justify-center">
            <motion.div initial={{ y: 16 }} animate={{ y: 0 }} exit={{ y: 16, opacity: 0 }} transition={{ duration: 0.18 }}
              className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-8">
              <p className="text-sm font-medium text-gray-900">Check kodunu daxil edin</p>
              <p className="text-xs text-gray-500 mt-1">Order açılan anda göstərilən 6 rəqəmli kod.</p>
              <input
                value={relinkCode}
                onChange={e => { setRelinkCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setRelinkError(''); }}
                inputMode="numeric"
                autoFocus
                placeholder="••••••"
                className="mt-5 w-full text-center text-2xl font-semibold tracking-[0.4em] outline-none border-b border-gray-200 focus:border-gray-400 pb-2 placeholder:tracking-[0.2em] placeholder:text-gray-300"
              />
              {relinkError && <p className="text-xs text-red-500 mt-3">{relinkError}</p>}
              <div className="mt-6 flex items-center justify-between">
                <button onClick={() => { setRelinkOpen(false); setRelinkCode(''); setRelinkError(''); }}
                  className="text-sm text-gray-400 hover:text-gray-600 transition-colors">İmtina</button>
                <button onClick={doRelink} disabled={relinkCode.length !== 6 || busy !== ''}
                  className="text-sm font-semibold text-gray-900 hover:text-black disabled:opacity-40 transition-colors">
                  {busy === 'relink' ? 'Qoşulur…' : 'Qoşul →'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
