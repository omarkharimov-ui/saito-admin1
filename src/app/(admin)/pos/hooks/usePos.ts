'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { toast } from 'react-hot-toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { deductStockForOrder } from '@/lib/stockAutomation';
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
    saveCache(POS_CART_KEY, cart);
  }, [cart]);

  /* ── Table Selection ── */
  const selectTable = useCallback((table: PosTable) => {
    setSelectedTable(table);
    setActiveView('order');
    const existing = loadCache<Record<number, PosCart>>(POS_CART_KEY + '_all', {});
    const saved = existing[table.table_number];
    if (saved) {
      setCart(saved);
    } else {
      setCart({
        table_id: table.id,
        table_number: table.table_number,
        guest_count: table.guest_count || 1,
        items: [],
        notes: '',
        order_type: 'dine_in',
      });
    }
  }, []);

  const backToFloor = useCallback(() => {
    setSelectedTable(null);
    setActiveView('floor');
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
    setCart(null);
  }, []);

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
  const placeOrder = useCallback(async () => {
    const currentCart = cartRef.current;
    if (!currentCart || currentCart.items.length === 0) return;

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

      const all = loadCache<Record<number, PosCart>>(POS_CART_KEY + '_all', {});
      delete all[currentCart.table_number];
      saveCache(POS_CART_KEY + '_all', all);

      clearCart();
      backToFloor();
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi');
    }
  }, [clearCart, backToFloor, fetchData]);

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

      await deductStockForOrder(orderId);

      const recipeRes = await fetch(`/api/orders/${orderId}/recipes`);
      if (recipeRes.ok) {
        const recipeData = await recipeRes.json();
        if (recipeData.message) {
          console.info(recipeData.message);
        }
      }

      toast.success('Hesap bağlandı');
      backToFloor();
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Ödəniş xətası');
    }
  }, [backToFloor, fetchData, t]);

  /* ── Transfer Table ── */
  const transferTable = useCallback(async (fromTable: number, toTable: number) => {
    try {
      const res = await fetch('/api/orders/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_table: fromTable, to_table: toTable }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(`Masa ${fromTable} → Masa ${toTable} köçürüldü`);
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    }
  }, [fetchData]);

  /* ── Merge Tables ── */
  const mergeTables = useCallback(async (tableNumbers: number[]) => {
    if (tableNumbers.length < 2) return;
    try {
      const res = await fetch('/api/orders/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_numbers: tableNumbers }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(`Masalar ${tableNumbers.join(' + ')} birləşdirildi`);
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    }
  }, [fetchData]);

  return {
    language, tables, floors, products, categories, loading,
    selectedTable, cart, activeView, orderHistory,
    selectTable, backToFloor,
    addToCart, updateCartItemQty, removeCartItem, clearCart, saveCart,
    placeOrder, closeBill, transferTable, mergeTables,
    setActiveView, setCart, setSelectedTable,
    fetchData,
  };
}
