'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import type {
  PosProduct,
  PosTable,
  PosCart,
  PosCartItem,
  PosModifier,
  PosModifierSelection,
  PaymentInfo,
  FloorConfig,
  TableStatus,
} from '../types/shared';

const POS_CACHE_KEY = 'saito_pos_cache';
const POS_CART_KEY = 'saito_pos_cart';
const POS_DATA_KEY = 'saito_pos_data';

function loadCache<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch { return fallback; }
}

function saveCache(key: string, data: unknown) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
}

export function usePos() {
  const { t, language } = useLanguage();
  const [, forceUpdate] = useState(0);
  const languageRef = useRef(language);
  languageRef.current = language;

  /* ── State ── */
  const cached = typeof window !== 'undefined' ? loadCache<{ tables: PosTable[]; floors: FloorConfig[]; products: PosProduct[]; categories: { id: string; name: string }[] } | null>(POS_DATA_KEY, null) : null;
  const [tables, setTables] = useState<PosTable[]>(cached?.tables || []);
  const [floors, setFloors] = useState<FloorConfig[]>(cached?.floors || []);
  const [products, setProducts] = useState<PosProduct[]>(cached?.products || []);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>(cached?.categories || []);
  const [loading, setLoading] = useState(!cached);
  const [selectedTable, setSelectedTable] = useState<PosTable | null>(null);
  const [cart, setCart] = useState<PosCart | null>(null);
  const cartRef = useRef<PosCart | null>(null);
  const [activeView, setActiveView] = useState<'floor' | 'order' | 'billing'>('floor');
  const [orderHistory, setOrderHistory] = useState<any[]>([]);
  const orderFingerprintRef = useRef<Record<number, string>>({});

  // Keep cartRef in sync
  cartRef.current = cart;

  /* ── Data Fetching ── */
  const fetchData = useCallback(async () => {
    try {
      const [tablesRes, productsRes] = await Promise.all([
        fetch('/api/pos/tables'),
        fetch('/api/pos/products'),
      ]);

      let newTables: PosTable[] = [];
      let newFloors: FloorConfig[] = [];
      let newProducts: PosProduct[] = [];
      let newCategories: { id: string; name: string }[] = [];

      if (tablesRes.ok) {
        const data = await tablesRes.json();
        newTables = data.tables || [];
        newFloors = data.floors || [];
        setTables(newTables);
        setFloors(newFloors);
      }
      if (productsRes.ok) {
        const data = await productsRes.json();
        newProducts = data.products || [];
        newCategories = data.categories || [];
        setProducts(newProducts);
        setCategories(newCategories);
      }

      saveCache(POS_DATA_KEY, { tables: newTables, floors: newFloors, products: newProducts, categories: newCategories });
    } catch (e) {
      console.error('POS fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Realtime ── */
  useEffect(() => {
    const channel = createRealtimeChannel(`pos-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_floors' }, () => fetchData())
      .subscribe();
    return () => { removeRealtimeChannel(channel); };
  }, [fetchData]);

  /* ── Polling fallback ── */
  useEffect(() => {
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  /* ── Cart persistence ── */
  useEffect(() => {
    const saved = loadCache<PosCart | null>(POS_CART_KEY, null);
    if (saved) setCart(saved);
  }, []);

  useEffect(() => {
    const currentTable = cart?.table_number;
    saveCache(POS_CART_KEY, cart);
    const all = loadCache<Record<number, PosCart>>(POS_CART_KEY + '_all', {});
    if (cart && typeof currentTable === 'number') {
      all[currentTable] = cart;
    } else if (typeof currentTable === 'number') {
      delete all[currentTable];
    }
    saveCache(POS_CART_KEY + '_all', all);
  }, [cart]);

  /* ── Table Selection ── */
  const selectTable = useCallback((table: PosTable) => {
    setSelectedTable(table);
    setActiveView('order');
    const existing = loadCache<Record<number, PosCart>>(POS_CART_KEY + '_all', {});
    const saved = existing[table.table_number];
    
    // If we have a saved cart with items, use it regardless of table status
    // This allows "draft" carts to persist before the first order is placed
    if (saved && (saved.items.length > 0 || table.status !== 'empty')) {
      setCart(saved);
    } else {
      setCart({
        table_id: table.id,
        table_number: table.table_number,
        guest_count: 1,
        items: [],
        notes: '',
        order_type: 'dine_in',
      });
    }
  }, []);

  const backToFloor = useCallback(() => {
    // We keep the cart state but just switch the view.
    // The selectTable function will handle loading existing carts from state or cache.
    setSelectedTable(null);
    setActiveView('floor');
    // Do NOT setCart(null) here if we want to preserve the draft in memory
    // However, if we want to ensure it reloads correctly on next table select:
    setCart(null); 
  }, []);

  /* ── Cart Operations ── */
  const addToCart = useCallback((product: PosProduct, modifiers?: PosModifierSelection[], notes?: string, variantId?: string) => {
    const currentCart = cartRef.current;
    if (!currentCart) return;
    const langs = languageRef.current;
    const key = `${product.id}__${variantId || 'base'}__${modifiers?.map(m => m.id).sort().join(',') || ''}`;
    const existing = currentCart.items.find(i => {
      const existingModifiers = (i.modifiers ?? []).map(m => m.id).sort().join(',');
      const ek = `${i.product_id}__${i.variant_id || 'base'}__${existingModifiers}`;
      return ek === key;
    });

    if (existing) {
      setCart(prev => prev ? {
        ...prev,
        items: prev.items.map(i =>
          i === existing ? { ...i, quantity: i.quantity + 1, total_price: i.unit_price * (i.quantity + 1) } : i
        ),
      } : null);
    } else {
      const unitPrice = modifiers?.reduce((s, m) => s + m.price, product.price) ?? product.price;
      const localizedName = langs === 'az' ? product.name_az : langs === 'en' ? product.name_en : product.name_ru;
      const newItem: PosCartItem = {
        product_id: product.id,
        product_name: localizedName || product.name,
        product_image: product.image_url ?? null,
        unit_price: unitPrice,
        total_price: unitPrice,
        quantity: 1,
        modifiers: modifiers || [],
        special_notes: notes || '',
        variant_id: variantId,
      };
      setCart(prev => prev ? { ...prev, items: [...prev.items, newItem] } : null);
    }
    forceUpdate(n => n + 1);
  }, []);

  const updateCartItemQty = useCallback((index: number, delta: number) => {
    setCart(prev => {
      if (!prev) return null;
      const items = [...prev.items];
      const newQty = items[index].quantity + delta;
      if (newQty <= 0) {
        items.splice(index, 1);
      } else {
        items[index] = { ...items[index], quantity: newQty, total_price: items[index].unit_price * newQty };
      }
      return { ...prev, items };
    });
  }, []);

  const removeCartItem = useCallback((index: number) => {
    setCart(prev => prev ? { ...prev, items: prev.items.filter((_, i) => i !== index) } : null);
  }, []);

  const clearCart = useCallback(() => {
    const currentTable = selectedTable?.table_number ?? cartRef.current?.table_number;
    
    // Clear all state immediately
    setCart(null);
    cartRef.current = null;
    
    if (typeof currentTable === 'number') {
      const all = loadCache<Record<number, PosCart>>(POS_CART_KEY + '_all', {});
      delete all[currentTable];
      saveCache(POS_CART_KEY + '_all', all);
      delete orderFingerprintRef.current[currentTable];
    }
    
    saveCache(POS_CART_KEY, null);
    
    // Reset table status locally if needed
    if (selectedTable) {
      setSelectedTable({
        ...selectedTable,
        guest_count: 0,
        total_amount: 0,
        status: 'empty' as const,
      });
    }
    
    toast.success('Səbət təmizləndi');
  }, [selectedTable]);

  const saveCart = useCallback(() => {
    const currentCart = cartRef.current;
    if (!currentCart) return;
    const all = loadCache<Record<number, PosCart>>(POS_CART_KEY + '_all', {});
    all[currentCart.table_number] = currentCart;
    saveCache(POS_CART_KEY + '_all', all);
    toast.success('Səbət yadda saxlandı');
    backToFloor();
  }, [backToFloor]);

  /* ── Order Operations ── */
  const cartFingerprint = (items: PosCartItem[]) => items
    .map(item => `${item.product_id}:${item.variant_id || 'base'}:${item.quantity}:${item.unit_price}:${item.special_notes || ''}:${(item.modifiers ?? []).map(m => m.id).sort().join(',')}`)
    .join('|');

  const placeOrder = useCallback(async () => {
    const currentCart = cartRef.current;
    if (!currentCart || currentCart.items.length === 0) return;

    const fingerprint = cartFingerprint(currentCart.items);
    const lastFingerprint = orderFingerprintRef.current[currentCart.table_number];
    const resendOnlyIfChanged = currentCart.items.every(item => (item.sentQuantity || 0) >= item.quantity);
    const hasChangedSinceLastSend = lastFingerprint !== fingerprint || currentCart.items.some(item => {
      const sent = item.sentQuantity || 0;
      return item.quantity !== sent || (item.special_notes || '') !== '';
    });
    if (!hasChangedSinceLastSend && resendOnlyIfChanged) {
      toast('Mətbəxə artıq göndərilib', { icon: 'ℹ️' });
      return;
    }

    try {
      const orderItems = currentCart.items.map(item => ({
        product_id: item.product_id,
        variant_id: item.variant_id || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.unit_price * item.quantity,
        modifiers: JSON.stringify(item.modifiers),
        special_notes: item.special_notes,
      }));

      const totalAmount = orderItems.reduce((s, i) => s + i.total_price, 0);

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_number: currentCart.table_number,
          total_amount: totalAmount,
          status: 'confirmed',
          order_type: currentCart.order_type,
          guest_count: currentCart.guest_count,
          customer_note: currentCart.notes || null,
          items: orderItems,
          source: 'pos',
        }),
      });

      if (!res.ok) throw new Error((await res.json()).error || 'Failed to place order');

      toast.success(`Masa ${currentCart.table_number} — sifariş göndərildi`);

      orderFingerprintRef.current[currentCart.table_number] = fingerprint;

      // Mark all items as sent — keep cart on screen for further edits
      setCart(prev => prev ? {
        ...prev,
        items: prev.items.map(item => ({ ...item, sentQuantity: item.quantity })),
      } : null);

      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi');
      throw e;
    }
  }, [fetchData]);

  const clearDrafts = useCallback(() => {
    const currentCart = cartRef.current;
    if (!currentCart || currentCart.items.length === 0) return;

    const hasDraft = currentCart.items.some(item =>
      !item.sentQuantity || item.quantity !== item.sentQuantity
    );

    if (!hasDraft) {
      toast('Sifariş artıq mətbəxə göndərilib', { icon: 'ℹ️' });
      return;
    }

    setCart(prev => {
      if (!prev) return null;
      const items = prev.items
        .map(item => {
          if (!item.sentQuantity) return null; // new item → remove
          if (item.quantity !== item.sentQuantity) {
            // reset to sent quantity (handles both increase and decrease)
            return { ...item, quantity: item.sentQuantity, total_price: item.unit_price * item.sentQuantity };
          }
          return item; // sent item, unchanged
        })
        .filter(Boolean) as PosCartItem[];
      return { ...prev, items };
    });
  }, []);

  /* ── Billing ── */
  const closeBill = useCallback(async (orderId: string, payment: PaymentInfo) => {
    try {
      const res = await fetch(`/api/orders/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          payment_method: payment.method,
          cash_amount: payment.cash_amount,
          card_amount: payment.card_amount,
          tip_amount: payment.tip,
        }),
      });

      if (!res.ok) throw new Error((await res.json()).error || 'Payment failed');

      // Stock deduction is handled server-side in /api/orders/pay — do NOT call again here

      const recipeRes = await fetch(`/api/orders/${orderId}/recipes`);
      if (recipeRes.ok) {
        const recipeData = await recipeRes.json();
        if (recipeData.message) {
          console.info(recipeData.message);
        }
      }

      // Wipe localStorage cart for this table so stale data doesn't reload
      const tableNum = cartRef.current?.table_number;
      if (tableNum) {
        try {
          const raw = localStorage.getItem('saito_pos_cart_all');
          if (raw) {
            const all = JSON.parse(raw);
            delete all[tableNum];
            localStorage.setItem('saito_pos_cart_all', JSON.stringify(all));
          }
        } catch {} // eslint-disable-line no-empty
      }

      // Nullify ref so backToFloor doesn't re-save the paid cart
      cartRef.current = null;

      toast.success('Hesap bağlandı');
      backToFloor();
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Ödəniş xətası');
    }
  }, [backToFloor, fetchData, t]);

  /* ── Undo stack ── */
  const undoStackRef = useRef<{ action: string; data: any; message: string }[]>([]);

  const showUndo = useCallback((undoAction: string, undoData: any, message: string) => {
    undoStackRef.current.push({ action: undoAction, data: undoData, message });
    const timeout = setTimeout(() => {
      undoStackRef.current = undoStackRef.current.filter(u => u.data !== undoData);
    }, 10000);
    toast(
      (t: any) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>{message}</span>
          <button
            onClick={async () => {
              toast.dismiss(t.id);
              clearTimeout(timeout);
              undoStackRef.current = undoStackRef.current.filter(u => u.data !== undoData);
              try {
                const res = await fetch('/api/orders/undo', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: undoAction, data: undoData }),
                });
                if (!res.ok) throw new Error((await res.json()).error);
                toast.success('Geri alındı');
                fetchData();
              } catch (e: any) {
                toast.error(e.message || 'Geri alma xətası');
              }
            }}
            style={{
              padding: '4px 12px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.1)',
              color: 'white',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Geri al
          </button>
        </div>
      ),
      { duration: 10000 }
    );
  }, [fetchData]);

  /* ── Transfer Table ── */
  const transferTable = useCallback(async (fromTable: number, toTable: number) => {
    // 1. Move the cart in localStorage first
    try {
      const raw = localStorage.getItem(POS_CART_KEY + '_all');
      if (raw) {
        const all = JSON.parse(raw);
        if (all[fromTable]) {
          // Transfer the cart object to the new key
          all[toTable] = { ...all[fromTable], table_number: toTable };
          delete all[fromTable];
          localStorage.setItem(POS_CART_KEY + '_all', JSON.stringify(all));
        }
      }
    } catch (e) {
      console.error('Local cart transfer failed:', e);
    }

    // 2. Call the API to move the database order
    const res = await fetch('/api/orders/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_table: fromTable, to_table: toTable }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    if (data.undo) showUndo('transfer', data.undo, `Masa ${fromTable} → Masa ${toTable}`);

    // 3. Clear fingerprints and sync states
    delete orderFingerprintRef.current[fromTable];
    
    // If the currently selected table was the source, switch to target or clear
    if (selectedTable?.table_number === fromTable) {
      const targetTable = tables.find(t => t.table_number === toTable);
      if (targetTable) {
        setSelectedTable(targetTable);
        // Cart state will be updated by the next select/fetch
      } else {
        backToFloor();
      }
    }

    await new Promise(r => setTimeout(r, 400));
    fetchData();
    return data;
  }, [fetchData, showUndo, tables, selectedTable, backToFloor]);

  /* ── Merge Tables ── */
  const mergeTables = useCallback(async (tableNumbers: number[]) => {
    if (tableNumbers.length < 2) return;
    try {
      const res = await fetch('/api/orders/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_numbers: tableNumbers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.undo) {
        showUndo('merge', data.undo, `Masalar ${tableNumbers.join(' + ')} birləşdirildi`);
      } else {
        toast.success(`Masalar ${tableNumbers.join(' + ')} birləşdirildi`);
      }
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    }
  }, [fetchData, showUndo]);

  return {
    language, tables, floors, products, categories, loading,
    selectedTable, cart, activeView, orderHistory,
    selectTable, backToFloor,
    addToCart, updateCartItemQty, removeCartItem, clearCart, clearDrafts, saveCart,
    placeOrder, closeBill, transferTable, mergeTables,
    setActiveView, setCart, setSelectedTable, setTables,
    fetchData,
  };
}
