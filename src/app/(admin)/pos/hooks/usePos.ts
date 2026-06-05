'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { toast } from 'react-hot-toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { deductStockForOrder } from '@/lib/stockAutomation';
import type { Product } from '../../orders/types';
import type {
  PosTable, PosCart, PosCartItem, Modifier, ModifierSelection,
  PaymentInfo, FloorConfig, TableStatus,
} from '../types';

const POS_CACHE_KEY = 'saito_pos_cache';
const POS_CART_KEY = 'saito_pos_cart';

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
  const cartKey = useRef(0);
  const [, forceUpdate] = useState(0);

  /* ── State ── */
  const [tables, setTables] = useState<PosTable[]>([]);
  const [floors, setFloors] = useState<FloorConfig[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<PosTable | null>(null);
  const [cart, setCart] = useState<PosCart | null>(null);
  const [activeView, setActiveView] = useState<'floor' | 'order' | 'billing' | 'kds'>('floor');
  const [orderHistory, setOrderHistory] = useState<any[]>([]);

  /* ── Data Fetching ── */
  const fetchData = useCallback(async () => {
    try {
      const [tablesRes, productsRes] = await Promise.all([
        fetch('/api/pos/tables'),
        fetch('/api/pos/products'),
      ]);

      if (tablesRes.ok) {
        const data = await tablesRes.json();
        setTables(data.tables || []);
        setFloors(data.floors || []);
      }
      if (productsRes.ok) {
        const data = await productsRes.json();
        setProducts(data.products || []);
        setCategories(data.categories || []);
      }
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
  const addToCart = useCallback((product: Product, modifiers?: ModifierSelection[], notes?: string, variantId?: string) => {
    if (!cart) return;
    const key = `${product.id}__${variantId || 'base'}__${modifiers?.map(m => m.modifier_id).sort().join(',') || ''}`;
    const existing = cart.items.find(i => {
      const ek = `${i.product_id}__${i.variant_id || 'base'}__${i.modifiers.map(m => m.modifier_id).sort().join(',')}`;
      return ek === key;
    });

    if (existing) {
      setCart(prev => prev ? {
        ...prev,
        items: prev.items.map(i =>
          i === existing ? { ...i, quantity: i.quantity + 1 } : i
        ),
      } : null);
    } else {
      const unitPrice = modifiers?.reduce((s, m) => s + m.price_adjust, product.price) ?? product.price;
      const newItem: PosCartItem = {
        product_id: product.id,
        product_name: (product as any)[`name_${language}`] || product.name,
        product_image: product.image_url,
        unit_price: unitPrice,
        quantity: 1,
        modifiers: modifiers || [],
        special_notes: notes || '',
        variant_id: variantId,
      };
      setCart(prev => prev ? { ...prev, items: [...prev.items, newItem] } : null);
    }
    cartKey.current++;
    forceUpdate(n => n + 1);
  }, [cart]);

  const updateCartItemQty = useCallback((index: number, delta: number) => {
    if (!cart) return;
    setCart(prev => {
      if (!prev) return null;
      const items = [...prev.items];
      const newQty = items[index].quantity + delta;
      if (newQty <= 0) {
        items.splice(index, 1);
      } else {
        items[index] = { ...items[index], quantity: newQty };
      }
      return { ...prev, items };
    });
  }, [cart]);

  const removeCartItem = useCallback((index: number) => {
    if (!cart) return;
    setCart(prev => prev ? { ...prev, items: prev.items.filter((_, i) => i !== index) } : null);
  }, [cart]);

  const clearCart = useCallback(() => {
    setCart(null);
  }, []);

  const saveCart = useCallback(() => {
    if (!cart) return;
    const all = loadCache<Record<number, PosCart>>(POS_CART_KEY + '_all', {});
    all[cart.table_number] = cart;
    saveCache(POS_CART_KEY + '_all', all);
    toast.success('Səbət yadda saxlandı');
    backToFloor();
  }, [cart, backToFloor, t]);

  /* ── Order Operations ── */
  const placeOrder = useCallback(async () => {
    if (!cart || cart.items.length === 0) return;

    try {
      const orderItems = cart.items.map(item => ({
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
          table_number: cart.table_number,
          total_amount: totalAmount,
          status: 'confirmed',
          order_type: cart.order_type,
          guest_count: cart.guest_count,
          customer_note: cart.notes || null,
          items: orderItems,
          source: 'pos',
        }),
      });

      if (!res.ok) throw new Error((await res.json()).error || 'Failed to place order');

      toast.success(`Masa ${cart.table_number} — sifariş göndərildi`);

      const all = loadCache<Record<number, PosCart>>(POS_CART_KEY + '_all', {});
      delete all[cart.table_number];
      saveCache(POS_CART_KEY + '_all', all);

      clearCart();
      backToFloor();
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi');
    }
  }, [cart, clearCart, backToFloor, fetchData, t]);

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
