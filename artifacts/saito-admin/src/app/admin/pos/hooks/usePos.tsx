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
  const [placingOrder, setPlacingOrder] = useState(false);
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
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fetchData, 500);
    };
    const channel = createRealtimeChannel('pos-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_floors' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, debouncedFetch)
      .subscribe();
    return () => { 
      if (debounceTimer) clearTimeout(debounceTimer);
      removeRealtimeChannel(channel); 
    };
  }, [fetchData]);

  const selectTable = async (table: PosTable) => {
    setSelectedTable(table);
    setActiveView('order');
    
    // Load existing order items if table has an active order
    const tableOrders = floors
      .flatMap((f: any) => f.tables || [])
      .filter((t: any) => t.table_number === table.table_number);
    
    const existingItems = tableOrders.flatMap((t: any) => t.order_ids || []);
    
    if (existingItems.length > 0) {
      try {
        const res = await fetch('/api/orders');
        if (res.ok) {
          const data = await res.json();
          const orders = data.orders || [];
          const orderItems = data.orderItems || [];
          
          const activeOrder = orders.find((o: any) => 
            o.table_number === table.table_number && 
            !['paid', 'cancelled'].includes(o.status)
          );
          
          if (activeOrder) {
            const items = orderItems
              .filter((item: any) => item.order_id === activeOrder.id)
              .map((item: any) => ({
                product_id: item.product_id,
                product_name: item.product_name,
                unit_price: item.unit_price,
                quantity: item.quantity,
                total_price: item.total_price,
                modifiers: item.modifiers ? JSON.parse(item.modifiers) : [],
                special_notes: item.special_notes || ''
              }));
            
            setCart({
              table_id: table.id,
              table_number: table.table_number,
              guest_count: table.guest_count || activeOrder.guest_count || 1,
              items,
              notes: activeOrder.customer_note || '',
              order_type: activeOrder.order_type || 'dine_in'
            });
            return;
          }
        }
      } catch (e) {
        console.error('Failed to load existing order items:', e);
      }
    }
    
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
      const items = prev.items.map(i => ({ ...i }));
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
      const items = prev.items.map(i => ({ ...i }));
      if (!items[idx]) return prev;
      items[idx].quantity += delta;
      if (items[idx].quantity <= 0) items.splice(idx, 1);
      else items[idx].total_price = items[idx].unit_price * items[idx].quantity;
      return { ...prev, items };
    });
  };

  const placeOrder = async () => {
    if (!cart || placingOrder) return;
    setPlacingOrder(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_number: cart.table_number, items: cart.items, status: 'confirmed' }),
      });
      if (res.ok) {
        toast.success('Sifariş göndərildi');
        fetchData();
        setActiveView('floor');
      } else {
        const err = await res.json();
        if (res.status === 409) {
          toast.error('Sifariş eyni anda başqa terminaldan dəyişdirildi. Yenidən cəhd edin.', { id: 'action-toast' });
        } else {
          toast.error(err.error || 'Sifariş göndərilmədi', { id: 'action-toast' });
        }
      }
    } finally {
      setPlacingOrder(false);
    }
  };

  const clearCart = () => setCart(prev => prev ? { ...prev, items: [] } : null);

  return {
    floors, products, categories, combos, loading, placingOrder, selectedTable, cart, activeView, lastUndo,
    fetchData, selectTable, mergeTables, transferTable, dismissTable, performUndo,
    setActiveView, setCart, setSelectedTable, addToCart, addComboToCart, updateCartItemQty, placeOrder, clearCart
  };
}
