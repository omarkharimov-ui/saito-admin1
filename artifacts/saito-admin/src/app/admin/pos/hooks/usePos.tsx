'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import type { PosProduct, PosTable, PosCart, PosModifierSelection } from '../types/shared';

export function usePos() {
  const { t } = useLanguage();
  const [floors, setFloors] = useState<any[]>([]);
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [combos, setCombos] = useState<any[]>([]);
  const [variantsByProduct, setVariantsByProduct] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [selectedTable, setSelectedTable] = useState<PosTable | null>(null);
  const [lastUndo, setLastUndo] = useState<any>(null);
  const [activeView, setActiveView] = useState<'floor' | 'order' | 'billing'>('floor');
  const [cart, setCart] = useState<PosCart | null>(null);
  const cartInteractionCount = useRef(0);

  const retryWithBackoff = async (fn: () => Promise<Response>, retries = 3, delay = 1000): Promise<Response> => {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fn();
        if (res.ok) return res;
      } catch (e) {
        if (i === retries - 1) throw e;
      }
      await new Promise(r => setTimeout(r, delay * Math.pow(2, i)));
    }
    return Promise.reject(new Error('Max retries exceeded'));
  };

  const fetchData = useCallback(async () => {
    try {
      const [tablesRes, productsRes] = await Promise.all([
        retryWithBackoff(() => fetch('/api/pos/tables')).catch(() => ({ ok: false } as Response)),
        retryWithBackoff(() => fetch('/api/pos/products')).catch(() => ({ ok: false } as Response)),
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
        const variantData = data.variants || [];
        const vmap: Record<string, any[]> = {};
        for (const v of variantData) {
          if (!v.product_id) continue;
          (vmap[v.product_id] ||= []).push(v);
        }
        setVariantsByProduct(vmap);
      }
    } catch (e) {
      console.error('POS fetch error:', e);
      toast.error('Məlumatlar yüklənərkən xəta baş verdi', { id: 'action-toast' });
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
    return () => { 
      removeRealtimeChannel(channel); 
    };
  }, [fetchData]);

  const selectTable = async (table: PosTable) => {
    const sameTable =
      selectedTable?.table_number === table.table_number &&
      cart?.table_number === table.table_number;

    if (sameTable && activeView === 'order') return;

    if (table.status === 'reserved') {
      toast.error('Bu masa rezerv edilib. Öncə rezervasiyanı aktivləşdirməlisiniz.', { id: 'action-toast' });
      return;
    }

    if (table.status === 'waiting') {
      toast.error('Bu masada qonaq gözlənilir. Məsələni yönləndirin.', { id: 'action-toast' });
      return;
    }

    cartInteractionCount.current = 0;

    setSelectedTable(table);
    setActiveView('order');

    if (!sameTable || !cart || cart.items.length === 0) {
      setCart({
        table_id: table.id,
        table_number: table.table_number,
        guest_count: cart?.guest_count || table.guest_count || 1,
        items: [],
        notes: '',
        order_type: 'dine_in'
      });
    }

    try {
      const res = await fetch('/api/orders');
      if (res.ok) {
        const data = await res.json();
        const orders = data.orders || [];
        const orderItems = data.orderItems || [];

        const primary = orders.find(
          (o: any) =>
            o.table_number === table.table_number &&
            !['paid', 'cancelled', 'closed'].includes(o.status)
        );

        if (primary) {
          const groupOrders = [
            primary,
            ...orders.filter(
              (o: any) =>
                o.merged_into === primary.id &&
                !['paid', 'cancelled', 'closed'].includes(o.status)
            ),
          ];
          const groupIds = new Set(groupOrders.map((o: any) => o.id));

          const serverItems = orderItems
            .filter((item: any) => groupIds.has(item.order_id))
            .map((item: any) => ({
              product_id: item.product_id,
              product_name: item.product_name,
              unit_price: item.unit_price,
              quantity: item.quantity,
              total_price: item.total_price,
              modifiers: item.modifiers ? JSON.parse(item.modifiers) : [],
              special_notes: item.special_notes || '',
              sentQuantity: item.quantity,
            }));

          const serverTotal = Number(primary.total_amount || 0);
          const itemSum = serverItems.reduce((s: number, i: any) => s + (i.total_price || 0), 0);

          setCart(prev => {
            if (!prev) return null;
            const merged = serverItems.map((i: any) => ({ ...i }));
            for (const u of prev.items) {
              if ((u.sentQuantity ?? 0) === 0) {
                const found = merged.find(
                  (m: any) => m.product_id === u.product_id && (m.variant_id ?? null) === (u.variant_id ?? null)
                );
                if (found) {
                  found.quantity += u.quantity;
                  found.total_price = found.unit_price * found.quantity;
                } else {
                  merged.push(u);
                }
              }
            }
            return {
              table_id: table.id,
              table_number: table.table_number,
              guest_count: primary.guest_count || table.guest_count || 1,
              items: merged,
              notes: primary.customer_note || '',
              order_type: primary.order_type || 'dine_in',
              serverTotal: serverTotal !== itemSum ? serverTotal : undefined,
            };
          });
        }
      }
    } catch (e) {
      console.error('Failed to load existing order items:', e);
    }
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
    } else {
      const err = await res.json().catch(() => ({ error: 'Dismiss failed' }));
      toast.error(err.error || 'Masa boşaldılmadı');
    }
  };

  const performUndo = async () => {
    if (!lastUndo) return;
    try {
      const res = await fetch('/api/orders/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: lastUndo.action, data: lastUndo.data }),
      });
      if (res.ok) {
        toast.success('Geri alındı');
        await fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Geri alınmadı');
      }
    } finally {
      setLastUndo(null);
    }
  };

  const addToCart = (
    p: PosProduct,
    opts?: { variantId?: string | null; notes?: string; modifiers?: PosModifierSelection[] }
  ) => {
    cartInteractionCount.current += 1;
    setCart(prev => {
      let base = prev;
      if (!base) {
        if (!selectedTable) return null;
        base = {
          table_id: selectedTable.id,
          table_number: selectedTable.table_number,
          guest_count: selectedTable.guest_count || 1,
          items: [],
          notes: '',
          order_type: 'dine_in' as const
        };
      }
      const items = base.items.map(i => ({ ...i }));
      const variant = opts?.variantId
        ? (variantsByProduct[p.id] || []).find(v => v.id === opts.variantId)
        : undefined;
      const variantId = opts?.variantId ?? null;
      const basePrice = variant ? Number(variant.discount_price ?? variant.price) : (p.price ?? 0);
      const effective = (p as any).effective_price;
      const unitPrice = effective?.effective_price ?? basePrice;
      const existing = items.find(
        i => i.product_id === p.id && (i.variant_id ?? null) === variantId
      );
      if (existing) {
        existing.quantity += 1;
        existing.total_price = existing.unit_price * existing.quantity;
      } else {
        items.push({
          product_id: p.id,
          product_name: p.name,
          unit_price: unitPrice,
          quantity: 1,
          total_price: unitPrice,
          modifiers: opts?.modifiers ?? [],
          variant_id: variantId,
          notes: opts?.notes ?? ''
        });
      }
      return { ...base, items };
    });
  };

  const addComboToCart = (combo: any, opts?: { notes?: string }) => {
    cartInteractionCount.current += 1;
    setCart(prev => {
      if (!prev) return null;
      const items = prev.items.map(i => ({ ...i }));
      const existing = items.find(i => i.product_id === combo.id && i.is_combo);
      if (existing) {
        existing.quantity += 1;
        existing.total_price = existing.unit_price * existing.quantity;
      } else {
        items.push({
          product_id: combo.id,
          product_name: combo.name,
          unit_price: combo.price,
          quantity: 1,
          total_price: combo.price,
          modifiers: [],
          is_combo: true,
          notes: opts?.notes ?? ''
        });
      }
      return { ...prev, items };
    });
  };

  const updateCartItemQty = (idx: number, delta: number) => {
    cartInteractionCount.current += 1;
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
      // Only send the delta that hasn't been persisted yet. Items already on the
      // server keep their sentQuantity, so re-sending a reopened table won't
      // double-count, and quantity edits are correctly reconciled.
      const unsent = cart.items
        .filter(i => (i.quantity || 0) > (i.sentQuantity || 0))
        .map(i => ({
          product_id: i.product_id,
          product_name: i.product_name,
          unit_price: i.unit_price,
          quantity: (i.quantity || 0) - (i.sentQuantity || 0),
          modifiers: i.modifiers || [],
          special_notes: i.special_notes || i.notes || '',
          variant_id: i.variant_id || null,
          is_combo: i.is_combo || false
        }));

      if (unsent.length === 0) {
        toast.success('Sifariş göndərildi');
        setCart(null);
        setActiveView('floor');
        fetchData().catch(() => {});
        return;
      }

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_number: cart.table_number,
          items: unsent,
          status: 'confirmed',
          guest_count: cart.guest_count,
          customer_note: cart.notes,
          order_type: cart.order_type,
          customer_id: cart.customer_id || null,
          discount_amount: cart.discount_amount || 0,
          discount_type: cart.discount_type || null,
          created_by: (() => {
            try {
              const session = localStorage.getItem('saito_staff_session');
              return session ? JSON.parse(session).id : null;
            } catch { return null; }
          })()
        }),
      });
      if (res.ok) {
        toast.success('Sifariş göndərildi');
        setCart(prev => {
          if (!prev) return null;
          return {
            ...prev,
            items: prev.items.map(i => ({ ...i, sentQuantity: i.quantity }))
          };
        });
        setActiveView('floor');
        fetchData().catch(() => {});
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

  const clearCart = () => {
    cartInteractionCount.current += 1;
    setCart(prev => {
      if (!prev) return null;
      const keptItems = prev.items.filter(item => (item.sentQuantity ?? 0) > 0);
      return { ...prev, items: keptItems };
    });
  };

  const updateGuestCount = async (delta: number) => {
    if (!cart) return;
    const newCount = Math.max(1, (cart.guest_count || 1) + delta);
    setCart(prev => prev ? { ...prev, guest_count: newCount } : null);
    try {
      await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          id: cart.table_id,
          data: { guest_count: newCount }
        }),
      });
    } catch (e) {
      console.error('Failed to update guest count:', e);
      toast.error('Qonaq sayı yenilənərkən xəta', { id: 'action-toast' });
    }
  };

  const updateCartCustomer = (customerId: string | null, customerName: string | null) => {
    setCart(prev => prev ? {
      ...prev,
      customer_id: customerId,
      customer_name: customerName,
      customer_phone: null,
    } : null);
  };

  const updateCartDiscount = (discountAmount: number, discountType: 'percentage' | 'fixed') => {
    setCart(prev => prev ? {
      ...prev,
      discount_amount: discountAmount,
      discount_type: discountType,
    } : null);
  };

  return {
    floors, products, categories, combos, variantsByProduct, loading, placingOrder, selectedTable, cart, activeView, lastUndo,
    fetchData, selectTable, mergeTables, transferTable, dismissTable, performUndo,
    setActiveView, setCart, setSelectedTable, addToCart, addComboToCart, updateCartItemQty, placeOrder, clearCart, updateGuestCount,
    updateCartCustomer, updateCartDiscount
  };

  return {
    floors, products, categories, combos, variantsByProduct, loading, placingOrder, selectedTable, cart, activeView, lastUndo,
    fetchData, selectTable, mergeTables, transferTable, dismissTable, performUndo,
    setActiveView, setCart, setSelectedTable, addToCart, addComboToCart, updateCartItemQty, placeOrder, clearCart, updateGuestCount
  };
}
