'use client';

import { useState, useEffect, useCallback } from 'react';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import type { PosProduct, PosTable, PosCart } from '../types/shared';

export function usePos() {
  const { t } = useLanguage();
  const [floors, setFloors] = useState<any[]>([]);
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [combos, setCombos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<PosTable | null>(null);
  const [lastUndo, setLastUndo] = useState<any>(null);
  const [activeView, setActiveView] = useState<'floor' | 'order' | 'billing'>('floor');
  const [cart, setCart] = useState<PosCart | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [tablesRes, productsRes] = await Promise.all([
        fetch('/api/pos/tables').catch(() => ({ ok: false })),
        fetch('/api/pos/products').catch(() => ({ ok: false })),
      ]);

      if (tablesRes && 'ok' in tablesRes && tablesRes.ok) {
        const data = await (tablesRes as Response).json();
        setFloors(data.floors || []);
      }
      
      if (productsRes && 'ok' in productsRes && productsRes.ok) {
        const data = await (productsRes as Response).json();
        setProducts(data.products || []);
        setCategories(data.categories || []);
        setCombos(data.combos || []);
      }
    } catch (e) {
      console.error('POS fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const channel = createRealtimeChannel('pos-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_floors' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchData)
      .subscribe();
    return () => { removeRealtimeChannel(channel); };
  }, [fetchData]);

  const selectTable = (table: PosTable) => {
    setSelectedTable(table);
    setActiveView('order');
    setCart({
      table_id: table.id,
      table_number: table.table_number,
      guest_count: table.guest_count || 1,
      items: [],
      notes: '',
      order_type: 'dine_in'
    });
  };

  const mergeTables = async (tableNumbers: number[]) => {
    const res = await fetch('/api/orders/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table_numbers: tableNumbers }),
    });
    if (res.ok) {
      const data = await res.json();
      setLastUndo({ action: 'merge', data: data.data?.undo, message: 'Masalar birləşdirildi' });
      fetchData();
    } else {
      const err = await res.json();
      toast.error(err.error);
    }
  };

  const transferTable = async (from: number, to: number) => {
    const res = await fetch('/api/orders/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_table: from, to_table: to }),
    });
    if (res.ok) {
      const data = await res.json();
      setLastUndo({ action: 'transfer', data: data.data?.undo, message: `Masa ${from} → ${to}` });
      fetchData();
    } else {
      const err = await res.json();
      toast.error(err.error);
    }
  };

  const dismissTable = async (num: number) => {
    const res = await fetch('/api/orders/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table_number: num }),
    });
    if (res.ok) {
      toast.success('Masa boşaldıldı');
      fetchData();
    }
  };

  const performUndo = async () => {
    if (!lastUndo) return;
    const res = await fetch('/api/orders/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: lastUndo.action, data: lastUndo.data }),
    });
    if (res.ok) {
      toast.success('Geri alındı');
      setLastUndo(null);
      fetchData();
    }
  };

  const addToCart = (p: PosProduct) => {
    setCart(prev => {
      if (!prev) return null;
      const items = [...prev.items];
      const existing = items.find(i => i.product_id === p.id);
      if (existing) {
        existing.quantity += 1;
        existing.total_price = existing.unit_price * existing.quantity;
      } else {
        items.push({ product_id: p.id, product_name: p.name, unit_price: p.price, quantity: 1, total_price: p.price, modifiers: [] });
      }
      return { ...prev, items };
    });
  };

  const addComboToCart = (combo: any) => {
    setCart(prev => {
      if (!prev) return null;
      const items = [...prev.items];
      items.push({ product_id: combo.id, product_name: combo.name, unit_price: combo.price, quantity: 1, total_price: combo.price, modifiers: [], is_combo: true });
      return { ...prev, items };
    });
  };

  const updateCartItemQty = (idx: number, delta: number) => {
    setCart(prev => {
      if (!prev) return null;
      const items = [...prev.items];
      if (!items[idx]) return prev;
      items[idx].quantity += delta;
      if (items[idx].quantity <= 0) items.splice(idx, 1);
      else items[idx].total_price = items[idx].unit_price * items[idx].quantity;
      return { ...prev, items };
    });
  };

  const placeOrder = async () => {
    if (!cart) return;
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table_number: cart.table_number, items: cart.items, status: 'confirmed' }),
    });
    if (res.ok) {
      toast.success('Sifariş göndərildi');
      fetchData();
      setActiveView('floor');
    }
  };

  const clearCart = () => setCart(prev => prev ? { ...prev, items: [] } : null);

  return {
    floors, products, categories, combos, loading, selectedTable, cart, activeView, lastUndo,
    fetchData, selectTable, mergeTables, transferTable, dismissTable, performUndo,
    setActiveView, setCart, setSelectedTable, addToCart, addComboToCart, updateCartItemQty, placeOrder, clearCart
  };
}
