'use client';

import { useState, useEffect, useCallback } from 'react';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { toast } from '@/lib/toast';
import { apiFetch } from '@/lib/api-fetch';
import type { PosProduct, PosTable, PosCart, PosModifierSelection } from '../types/shared';

export function usePos() {
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

  // Light refresh: floor + open orders only. Used for every reactive operation
  // (place order, merge, transfer, mark-ready) and on realtime events. Kept
  // cheap so the UI reflects changes immediately instead of waiting on the
  // heavy product catalog reload.
  const fetchFloor = useCallback(async () => {
    try {
      const tablesRes = await retryWithBackoff(() => fetch('/api/pos/tables'));
      if (tablesRes.ok) {
        const data = await tablesRes.json();
        setFloors(data.floors || []);
      } else {
        console.error('POS tables fetch failed:', tablesRes.status);
        toast.error('Masa məlumatları yenilənə bilmədi', { id: 'pos-tables-stale' });
      }
    } catch (e) {
      console.error('POS floor fetch error:', e);
    }
  }, []);

  // Heavy refresh: product catalog (products, categories, combos, variants,
  // recipes, campaigns). Catalog rarely changes mid-shift, so it is loaded once
  // on mount and only re-run when explicitly requested.
  const fetchCatalog = useCallback(async () => {
    try {
      const productsRes = await retryWithBackoff(() => fetch('/api/pos/products'));
      if ((productsRes as Response).ok) {
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
      } else {
        console.error('POS products fetch failed:', (productsRes as Response)?.status);
      }
    } catch (e) {
      console.error('POS catalog fetch error:', e);
    }
  }, []);

  // Combined initial load (catalog + floor).
  const fetchData = useCallback(async () => {
    try {
      await Promise.all([fetchFloor(), fetchCatalog()]);
    } catch (e) {
      console.error('POS fetch error:', e);
      toast.error('Məlumatlar yüklənərkən xəta baş verdi', { id: 'action-toast' });
    } finally {
      setLoading(false);
    }
  }, [fetchFloor, fetchCatalog]);

  useEffect(() => {
    fetchData();
    const channel = createRealtimeChannel('pos-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_floors' }, fetchFloor)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchFloor)
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



    const switchingToDifferentTable = selectedTable?.table_number !== table.table_number;

    setSelectedTable(table);
    setActiveView('order');

    // Only reset the cart when switching to a DIFFERENT table. Re-selecting the
    // same table (e.g. after going back to the floor and returning) must keep
    // the existing cart — including items that have not been sent to the
    // kitchen yet — otherwise they silently disappear.
    if (switchingToDifferentTable || !cart) {
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
              is_combo: !!item.is_combo_parent,
              combo_id: item.combo_group_id || null,
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
      fetchFloor();
      return { action: 'merge' as const, data: data.data?.undo, message: 'Masalar birləşdirildi' };
    } else {
      const err = await res.json();
      toast.error(err.error);
      return null;
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
      setLastUndo({ action: 'transfer', data: data.undo, message: `Masa ${from} → ${to}` });
      fetchFloor();
    } else {
      const err = await res.json();
      toast.error(err.error);
    }
  };

  // Optimistically reflect a table as empty across all floors in local state
  // so the floor view updates instantly (no wait for fetch/realtime).
  const markTableEmptyLocal = useCallback((nums: number[]) => {
    const set = new Set(nums);
    setFloors(prev => prev.map((f: any) => ({
      ...f,
      tables: (f.tables || []).map((t: any) =>
        set.has(t.table_number)
          ? { ...t, status: 'empty', total_amount: 0, order_count: 0, guest_count: null, merged_into_table: null, has_pending: false, oldest_pending_at: null, last_activity_at: null }
          : t
      ),
      merged_groups: (f.merged_groups || []).filter((g: any) => !set.has(g.parent?.table_number)),
    })));
  }, []);

  const dismissTable = async (num: number) => {
    const res = await fetch('/api/orders/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table_number: num }),
    });
    if (res.ok) {
      toast.success('Masa boşaldıldı');
      markTableEmptyLocal([num]);
      fetchFloor();
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
        await fetchFloor();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Geri alınmadı');
      }
    } finally {
      setLastUndo(null);
    }
  };

  const getAutoCampaign = (c: PosCart | null): { id: string; discount: number; type: string } | null => {
    if (!c || c.items.length === 0) return null;
    const itemsWithCampaign = c.items.filter(i => i.campaign_id);
    if (itemsWithCampaign.length === 0) return null;
    const totalsByCampaign = new Map<string, number>();
    for (const item of itemsWithCampaign) {
      const disc = (item.campaign_discount_amount || 0) * item.quantity;
      totalsByCampaign.set(item.campaign_id!, (totalsByCampaign.get(item.campaign_id!) || 0) + disc);
    }
    let bestId = '';
    let bestDisc = 0;
    for (const [id, disc] of totalsByCampaign) {
      if (disc > bestDisc) { bestDisc = disc; bestId = id; }
    }
    if (!bestId || bestDisc <= 0) return null;
    const originalTotal = c.items
      .filter(i => i.campaign_id === bestId)
      .reduce((s, i) => s + (i.original_unit_price ?? i.unit_price) * i.quantity, 0);
    const pct = originalTotal > 0 ? (bestDisc / originalTotal) * 100 : 0;
    return { id: bestId, discount: Math.round(pct * 10) / 10, type: pct > 0 ? 'percentage' : 'fixed' };
  };

  const addToCart = (
    p: PosProduct,
    opts?: { variantId?: string | null; notes?: string; modifiers?: PosModifierSelection[] }
  ) => {

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
      const unitPrice = typeof effective === 'number' ? effective : effective?.effective_price ?? basePrice;
      const campaignId = typeof effective === 'object' && effective?.campaign_id ? effective.campaign_id : null;
      const campaignDiscount = typeof effective === 'object' && effective?.discount_amount ? effective.discount_amount : 0;
      const campaignDiscountType = typeof effective === 'object' && effective?.discount_type ? effective.discount_type : null;
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
          original_unit_price: basePrice,
          quantity: 1,
          total_price: unitPrice,
          modifiers: opts?.modifiers ?? [],
          variant_id: variantId,
          notes: opts?.notes ?? '',
          campaign_id: campaignId,
          campaign_discount_amount: campaignDiscount,
          campaign_discount_type: campaignDiscountType,
        });
      }
      return { ...base, items };
    });
  };

  const addComboToCart = (combo: any, opts?: { notes?: string }) => {

    setCart(prev => {
      if (!prev) return null;
      const items = prev.items.map(i => ({ ...i }));
      const existing = items.find(i => i.product_id === combo.id && i.is_combo);
      if (existing) {
        existing.quantity += 1;
        existing.total_price = existing.unit_price * existing.quantity;
      } else {
        const baseComboPrice = Number(combo.price) || 0;
        const effectiveComboPrice = (combo as any).effective_price != null ? Number((combo as any).effective_price) : baseComboPrice;
        items.push({
          product_id: combo.id,
          product_name: combo.name,
          unit_price: effectiveComboPrice,
          original_unit_price: baseComboPrice,
          quantity: 1,
          total_price: effectiveComboPrice,
          modifiers: [],
          is_combo: true,
          combo_id: combo.id,
          notes: opts?.notes ?? ''
        });
      }
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

  const placeOrder = async (campaign?: { id?: string; type?: string }) => {
    if (!cart || placingOrder) return;
    setPlacingOrder(true);
    try {
      const unsent = cart.items
        .map(i => ({
          item: i,
          delta: Math.max(0, (i.quantity || 0) - (i.sentQuantity || 0)),
        }))
        .filter(x => x.delta > 0)
        .map(x => ({
          product_id: x.item.product_id,
          product_name: x.item.product_name,
          unit_price: x.item.unit_price,
          quantity: x.delta,
          modifiers: x.item.modifiers || [],
          special_notes: x.item.special_notes || x.item.notes || '',
          variant_id: x.item.variant_id || null,
          is_combo: x.item.is_combo || false,
          combo_id: x.item.combo_id || null,
        }));

      if (unsent.length === 0) {
        // Nothing new to send — do not clear the cart or claim a send. Just
        // return to the floor so the operator keeps their in-progress items.
        if (cart.items.length > 0) {
          toast('Yeni məhsul yoxdur', { id: 'action-toast' });
        }
        setActiveView('floor');
        return;
      }

      // Reuse the table's existing active order (e.g. a reservation draft) instead
      // of creating a 2nd active order, which would violate idx_orders_active_table.
      let activeOrderId: string | null = null;
      try {
        const ordersRes = await fetch('/api/orders');
        if (ordersRes.ok) {
          const data = await ordersRes.json();
          const active = (data.orders || []).find(
            (o: any) => o.table_number === cart.table_number && !['paid', 'cancelled', 'closed'].includes(o.status)
          );
          activeOrderId = active?.id || null;
        }
      } catch { /* fall through to create */ }

      const itemBasedDiscount = cart.items.reduce((s, i) => s + Math.max(0, ((i.original_unit_price ?? i.unit_price) - i.unit_price) * i.quantity), 0);
      // Determine the real discount type from the per-item campaign deltas so we
      // do not hardcode 'fixed' when the applied campaign was percentage-based.
      // A campaign_id is present only when getAutoCampaign selected one; in that
      // case the discount type should match that campaign's rule, otherwise fall
      // back to the dominant type among the cart's item-level campaigns.
      const autoCampaign = campaign?.id ? getAutoCampaign(cart) : null;
      let computedType: 'percentage' | 'fixed' | null = null;
      if (itemBasedDiscount > 0) {
        if (autoCampaign && (autoCampaign.type === 'PERCENTAGE' || autoCampaign.type === 'percentage')) {
          computedType = 'percentage';
        } else {
          const hasPercentageItem = cart.items.some(i => i.campaign_id && (i as any).campaign_discount_type === 'percentage');
          computedType = hasPercentageItem ? 'percentage' : 'fixed';
        }
      }
      const computedDiscount = { amount: itemBasedDiscount, type: computedType };

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          activeOrderId
            ? { action: 'addItems', id: activeOrderId, items: unsent }
            : {
                table_number: cart.table_number,
                items: unsent,
                status: 'confirmed',
                guest_count: cart.guest_count,
                customer_note: cart.notes,
                order_type: cart.order_type,
                customer_id: cart.customer_id || null,
                customer_name: cart.customer_name || null,
                reservation_id: cart.reservation_id || null,
                discount_amount: computedDiscount.amount,
                discount_type: computedDiscount.type,
                campaign_id: campaign?.id || null,
                created_by: (() => {
                  try {
                    const session = localStorage.getItem('saito_staff_session');
                    return session ? JSON.parse(session).id : null;
                  } catch { return null; }
                })()
              }
        ),
      });
      if (res.ok) {
        toast.success('Sifariş göndərildi');
        // Advance sentQuantity by exactly what was sent so re-sending the same
        // cart never double-sends already-kitchened items.
        const sentKeys = new Set(unsent.map(u => `${u.product_id}__${u.variant_id || ''}__${u.is_combo ? 'c' : 'p'}`));
        setCart(prev => {
          if (!prev) return null;
          return {
            ...prev,
            items: prev.items.map(i => {
              const key = `${i.product_id}__${i.variant_id || ''}__${i.is_combo ? 'c' : 'p'}`;
              if (!sentKeys.has(key)) return i;
              const newSent = Math.min(i.quantity, (i.sentQuantity || 0) + (i.quantity - (i.sentQuantity || 0)));
              return { ...i, sentQuantity: Math.max(i.sentQuantity || 0, newSent) };
            })
          };
        });
        setActiveView('floor');
        fetchFloor().catch(() => {});
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

    setCart(prev => {
      if (!prev) return null;
      const keptItems = prev.items.filter(item => (item.sentQuantity ?? 0) > 0);
      return { ...prev, items: keptItems };
    });
  };

  const updateGuestCount = async (delta: number) => {
    if (!cart) return;
    const newCount = Math.max(1, (cart.guest_count || 1) + delta);
    // Guest count is a local draft only — it is persisted when the order is
    // sent to the kitchen (placeOrder payload) or when the table is saved,
    // NOT on every +/- tap. Persisting on each tap caused redundant writes
    // and made the counter feel detached from the "save" action.
    setCart(prev => prev ? { ...prev, guest_count: newCount } : null);
  };

  const updateCartCustomer = (customerId: string | null, customerName: string | null) => {
    setCart(prev => prev ? {
      ...prev,
      customer_id: customerId,
      customer_name: customerName,
      customer_phone: null,
    } : null);
  };

  return {
    floors, products, categories, combos, variantsByProduct, loading, placingOrder, selectedTable, cart, activeView, lastUndo,
    fetchData, selectTable, mergeTables, transferTable, dismissTable, performUndo,
    setActiveView, setCart, setSelectedTable, addToCart, addComboToCart, updateCartItemQty, placeOrder, clearCart, updateGuestCount,
    updateCartCustomer, getAutoCampaign
  };
}
