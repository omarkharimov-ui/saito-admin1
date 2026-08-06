'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { toast } from '@/lib/toast';
import { apiFetch } from '@/lib/api-fetch';

import type { PosProduct, PosTable, PosCart, PosCartItem, PosModifierSelection } from '../types/shared';

export function usePos() {
  const [floors, setFloors] = useState<any[]>([]);
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [combos, setCombos] = useState<any[]>([]);
  const [variantsByProduct, setVariantsByProduct] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [placingOrder, setPlacingOrder] = useState(false);
  const operationLocks = useRef<Set<string>>(new Set());
  const [selectedTable, setSelectedTable] = useState<PosTable | null>(null);
  const [lastUndo, setLastUndo] = useState<any>(null);
  const [activeView, setActiveView] = useState<'floor' | 'order' | 'billing'>('floor');
  const [posMode, setPosMode] = useState<'dine_in' | 'takeaway' | 'delivery'>('dine_in');
  const [cart, setCart] = useState<PosCart | null>(null);
  const [reservationMode, setReservationMode] = useState(false);
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [reservationPreOrderItems, setReservationPreOrderItems] = useState<any[]>([]);
  const [reservationInfo, setReservationInfo] = useState<{
    reservation_id: string;
    table_number: number;
    name: string | null;
    phone: string | null;
    time: string | null;
    guests: number;
    is_vip?: boolean | null;
  } | null>(null);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  // guestCountLoading removed — optimistic UI update is instant, no loading guard
  const selectTableReqId = useRef(0);

  const getTerminalId = () => {
    try {
      const key = 'pos_terminal_id';
      let id = sessionStorage.getItem(key);
      if (!id) {
        id = `term_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        sessionStorage.setItem(key, id);
      }
      return id;
    } catch {
      return `term_${Date.now()}`;
    }
  };
  const terminalId = getTerminalId();

  const retryWithBackoff = async (fn: () => Promise<Response>, retries = 3, delay = 1000): Promise<Response> => {
    let lastError: any;
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fn();
        if (res.ok || (res.status >= 400 && res.status < 500)) return res;
        lastError = new Error(`HTTP ${res.status}`);
      } catch (e) {
        lastError = e;
        if (i === retries - 1) throw e;
      }
      await new Promise(r => setTimeout(r, delay * Math.pow(2, i)));
    }
    throw lastError || new Error('Max retries exceeded');
  };

  // Light refresh: floor + open orders only. Used for every reactive operation
  // (place order, merge, transfer, mark-ready) and on realtime events. Kept
  // cheap so the UI reflects changes immediately instead of waiting on the
  // heavy product catalog reload.
  const fetchFloor = useCallback(async () => {
    try {
      const tablesRes = await retryWithBackoff(() => fetch('/api/pos/tables', { cache: 'no-store' }));
      if (tablesRes.ok) {
        const data = await tablesRes.json();
        setFloors(data.floors || []);
      } else {
        console.error('POS tables fetch failed:', tablesRes.status);
        if (tablesRes.status === 401) {
          window.dispatchEvent(new CustomEvent('pos:unauthorized'));
        }
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

  // Keep a ref to the latest floor fetcher so realtime/polling always call the
  // current closure (avoids stale state after re-renders).
  const fetchFloorRef = useRef(fetchFloor);
  useEffect(() => { fetchFloorRef.current = fetchFloor; }, [fetchFloor]);
  const floorsRef = useRef(floors);
  useEffect(() => { floorsRef.current = floors; }, [floors]);
  const cartRef = useRef(cart);
  useEffect(() => { cartRef.current = cart; }, [cart]);

  useEffect(() => {
    fetchData();
    const channel = createRealtimeChannel('pos-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_floors' }, (payload) => {
        const record = (payload as any)?.new || (payload as any)?.record || {};
        if (record.updated_by_terminal_id === terminalId) return;
        fetchFloorRef.current();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        const record = (payload as any)?.new || (payload as any)?.record || {};
        if (record.updated_by_terminal_id === terminalId) return;
        fetchFloorRef.current();
      })
      .subscribe();

    // Polling fallback: realtime events can be delayed or dropped (e.g. on slow
    // Supabase connections or tab backgrounding), so refresh the floor on a
    // timer too. This guarantees the UI reflects table/order changes without a
    // manual page refresh.
    const poll = setInterval(() => fetchFloorRef.current(), 3000);

    return () => { 
      clearInterval(poll);
      removeRealtimeChannel(channel); 
    };
  }, [fetchData, terminalId]);

  const selectTable = async (table: PosTable, opts?: { allowReserved?: boolean }) => {
    const sameTable =
      selectedTable?.table_number === table.table_number &&
      cart?.table_number === table.table_number;

    if (sameTable && activeView === 'order') return;

    if (table.status === 'reserved' && !opts?.allowReserved) {
      toast.error('Bu masa rezerv edilib. Öncə rezervasiyanı aktivləşdirməlisiniz.', { id: 'action-toast' });
      return;
    }

    if (table.status === 'waiting') {
      toast.error('Bu masada qonaq gözlənilir. Məsələni yönləndirin.', { id: 'action-toast' });
      return;
    }

    const switchingToDifferentTable = selectedTable?.table_number !== table.table_number;
    const reqId = ++selectTableReqId.current;

    setSelectedTable(table);
    setActiveView('order');

    // Snapshot current items BEFORE the async fetch (for draft preservation)
    const prevCartItems = cart?.items ?? [];
    const draftItems = prevCartItems.filter((i) => (i.sentQuantity ?? 0) === 0);
    const sentItems = prevCartItems.filter((i) => (i.sentQuantity ?? 0) > 0);

    // Set a loading cart immediately so the UI is not blank during fetch
    if (switchingToDifferentTable || !cart) {
      // For a different table: show sent items optimistically while we fetch
      setCart({
        table_number: table.table_number,
        guest_count: table.guest_count || 1,
        items: switchingToDifferentTable ? [] : sentItems,
        notes: '',
        order_type: 'dine_in'
      });
    }

    try {
      // Find merged children from floor data for this table
      const childTables: number[] = [];
      for (const f of floorsRef.current) {
        for (const g of (f.merged_groups || [])) {
          if (g.parent?.table_number === table.table_number) {
            for (const c of (g.children || [])) {
              childTables.push(c.table_number);
            }
          }
        }
      }
      const tableNums = [table.table_number, ...childTables];
      const params = tableNums.map(n => `table_number=${n}`).join('&');
      const res = await apiFetch(`/api/orders?${params}`);
      if (reqId !== selectTableReqId.current) return;
      if (res.ok) {
        const data = await res.json();
        const orders = data.orders || [];
        const orderItems = (orders || []).flatMap((o: any) =>
          (o.order_items || []).map((item: any) => ({ ...item, order_id: o.id }))
        );

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

          const serverItems: any[] = [];
          const serverSeen = new Map<string, any>();
          for (const item of orderItems.filter((i: any) => groupIds.has(i.order_id))) {
            const key = `${item.product_id}__${item.variant_id ?? ''}`;
            const mapped = {
              product_id: item.product_id,
              product_name: item.product_name,
              unit_price: item.unit_price,
              quantity: item.quantity,
              total_price: item.total_price,
              modifiers: typeof item.modifiers === 'string' ? JSON.parse(item.modifiers || '[]') : (item.modifiers || []),
              special_notes: item.special_notes || '',
              hold_until: item.hold_until || null,
              is_combo: !!item.is_combo_parent,
              combo_id: item.combo_group_id || null,
              sentQuantity: item.quantity,
            };
            const existing = serverSeen.get(key);
            if (existing) {
              existing.quantity += Number(item.quantity || 0);
              existing.total_price = existing.unit_price * existing.quantity;
            } else {
              serverSeen.set(key, mapped);
              serverItems.push(mapped);
            }
          }

          const serverTotal = Number(primary.total_amount || 0);
          const itemSum = serverItems.reduce((s: number, i: any) => s + (i.total_price || 0), 0);

          setCart(prev => {
            if (!prev) return null;
            const merged = serverItems.map((i: any) => ({ ...i }));
            // Merge in any unsent (draft) items from local state. draftItems (the
            // pre-fetch snapshot) and prev.items overlap for the same-table case,
            // so dedupe by key — otherwise drafts get added twice per re-entry
            // (and quadruple after entering the table twice).
            const seen = new Set<string>();
            for (const u of [...draftItems, ...prev.items.filter(i => (i.sentQuantity ?? 0) === 0)]) {
              const key = `${u.product_id}__${u.variant_id || ''}`;
              if (seen.has(key)) continue;
              seen.add(key);
              const found = merged.find((m: any) => `${m.product_id}__${m.variant_id || ''}` === key);
              if (found) {
                found.quantity += u.quantity;
                found.total_price = found.unit_price * found.quantity;
              } else {
                merged.push(u);
              }
            }
            return {
              table_number: table.table_number,
              guest_count: primary.guest_count || table.guest_count || 1,
              items: merged,
              notes: primary.customer_note || '',
              order_type: primary.order_type || 'dine_in',
              order_id: primary.id,
              serverTotal: serverTotal !== itemSum ? serverTotal : undefined,
            };
          });
        } else {
          // No active server order for this table — clear cart (drafts belong to previous table)
        }
      }
    } catch (e) {
      console.error('Failed to load existing order items:', e);
      // On failure, still restore drafts so the user does not lose work.
      if (draftItems.length > 0 && reqId === selectTableReqId.current) {
        setCart(prev => {
          if (!prev) return null;
          return {
            ...prev,
            items: [...prev.items.filter(i => (i.sentQuantity ?? 0) > 0), ...draftItems],
          };
        });
      }
    }
  };

  const withOperationLock = async (key: string, fn: () => Promise<any>): Promise<any> => {
    if (operationLocks.current.has(key)) return null;
    operationLocks.current.add(key);
    try {
      return await fn();
    } finally {
      operationLocks.current.delete(key);
    }
  };

  const mergeTables = async (tableNumbers: number[]) => {
    return withOperationLock(`merge_${tableNumbers.sort().join(',')}`, async () => {
      const res = await apiFetch('/api/orders/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_numbers: tableNumbers, terminal_id: terminalId }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        toast.error(data?.error || 'Merge failed');
        return null;
      }
      setLastUndo({ action: 'merge', data: data.data?.undo, message: 'Masalar birləşdirildi' });
      fetchFloor();
      return { action: 'merge' as const, data: data.data?.undo, message: 'Masalar birləşdirildi' };
    });
  };

  const transferTable = async (from: number, to: number) => {
    return withOperationLock(`transfer_${from}_${to}`, async () => {
      const csrfToken = typeof document !== 'undefined'
        ? document.cookie.match(/saito_csrf=([^;]+)/)?.[1] || ''
        : '';
      const res = await apiFetch('/api/orders/transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
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
    });
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
    return withOperationLock(`dismiss_${num}`, async () => {
      const res = await apiFetch('/api/orders/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_number: num }),
      });
      if (res.ok) {
        const childNums: number[] = [];
        for (const floor of floors) {
          for (const t of (floor.tables || [])) {
            if (t.merged_into_table === num) childNums.push(t.table_number);
          }
        }
        toast.success('Masa boşaldıldı');
        setLastUndo({ action: 'dismiss', data: { table_number: num, child_tables: childNums }, message: 'Masa boşaldıldı' });
        fetchFloor();
      } else {
        const err = await res.json().catch(() => ({ error: 'Dismiss failed' }));
        toast.error(err.error || 'Masa boşaldılmadı');
      }
    });
  };

  const clearTable = async (num: number) => {
    return withOperationLock(`clear_${num}`, async () => {
      const res = await apiFetch('/api/orders/clear-table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_number: num, terminal_id: terminalId }),
      });
      if (res.ok) {
        markTableEmptyLocal([num]);
        fetchFloor();
      } else {
        const err = await res.json().catch(() => ({ error: 'Clear failed' }));
        toast.error(err.error || 'Masa təmizlənmədi');
      }
    });
  };

  const performUndo = async () => {
    if (!lastUndo) return;
    try {
      if (lastUndo.action === 'dismiss') {
        const csrfToken = typeof document !== 'undefined'
          ? document.cookie.match(/saito_csrf=([^;]+)/)?.[1] || ''
          : '';
        const res = await apiFetch('/api/orders/undo', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
          },
          body: JSON.stringify({ action: 'dismiss_undo', data: lastUndo.data, terminal_id: terminalId }),
        });
        if (res.ok) {
          toast.success('Geri alındı');
          await fetchFloor();
        } else {
          const err = await res.json();
          toast.error(err.error || 'Geri alınmadı');
        }
      } else {
        const res = await apiFetch('/api/orders/undo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: lastUndo.action, data: lastUndo.data, terminal_id: terminalId }),
        });
        if (res.ok) {
          toast.success('Geri alındı');
          await fetchFloor();
        } else {
          const err = await res.json();
          toast.error(err.error || 'Geri alınmadı');
        }
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
        base = {
          table_number: selectedTable?.table_number || null,
          guest_count: selectedTable?.guest_count || 1,
          items: [],
          notes: '',
          order_type: posMode
        };
      }
      const items = base.items.map(i => ({ ...i }));
      const variant = opts?.variantId
        ? (variantsByProduct[p.id] || []).find(v => v.id === opts.variantId)
        : undefined;
      const variantId = opts?.variantId ?? null;
      const basePrice = variant ? Number(variant.discount_price != null && variant.discount_price !== '' ? variant.discount_price : variant.price) : (p.price ?? 0);
      const effective = (p as any).effective_price;
      const unitPrice = typeof effective === 'number' ? effective : effective?.effective_price ?? basePrice;
      const campaignId = typeof effective === 'object' && effective?.campaign_id ? effective.campaign_id : null;
      const campaignDiscount = typeof effective === 'object' && effective?.discount_amount ? effective.discount_amount : 0;
      const campaignDiscountType = typeof effective === 'object' && effective?.discount_type ? effective.discount_type : null;
      const existing = items.find(
        i => String(i.product_id) === String(p.id) && (i.variant_id ?? null) === variantId
      );
      if (existing) {
        existing.quantity += 1;
        existing.total_price = existing.unit_price * existing.quantity;
      } else {
        const newItem = {
          product_id: p.id,
          product_name: p.name,
          unit_price: unitPrice,
          original_unit_price: basePrice,
          quantity: 1,
          total_price: unitPrice,
          modifiers: opts?.modifiers ?? [],
          variant_id: variantId,
          special_notes: opts?.notes ?? '',
          campaign_id: campaignId,
          campaign_discount_amount: campaignDiscount,
          campaign_discount_type: campaignDiscountType,
          is_pre_order: reservationMode,
          pre_order_id: null,
        };
        items.push(newItem);

        if (reservationMode && reservationId) {
          apiFetch('/api/reservations/pre-order-items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              reservation_id: reservationId,
              items: [{
                product_id: p.id,
                product_name: p.name,
                quantity: 1,
                unit_price: unitPrice,
                modifiers: opts?.modifiers ?? [],
                special_notes: opts?.notes ?? '',
              }],
            }),
          })
            .then(r => r.json().catch(() => null))
            .then(data => {
              const saved = Array.isArray(data?.items) ? data.items[0] : null;
              if (saved?.id) {
                setCart(prev => prev ? {
                  ...prev,
                  items: prev.items.map(it =>
                    it.is_pre_order && !it.pre_order_id && it.product_id === p.id && (it.variant_id ?? null) === variantId
                      ? { ...it, pre_order_id: saved.id }
                      : it
                  ),
                } : null);
              }
            })
            .catch(() => {});
        }
      }
      return { ...base, items };
    });
  };

  const addComboToCart = (combo: any, opts?: { notes?: string }) => {

    setCart(prev => {
      let base = prev;
      if (!base) {
        base = {
          table_number: selectedTable?.table_number || null,
          guest_count: selectedTable?.guest_count || 1,
          items: [],
          notes: '',
          order_type: posMode
        };
      }
      const items = base.items.map(i => ({ ...i }));
      const existing = items.find(i => String(i.product_id) === String(combo.id) && i.is_combo);
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
          special_notes: opts?.notes ?? ''
        });
      }
      return { ...base, items };
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

  const logOperation = async (action: string, payload: Record<string, any> = {}) => {
    try {
      await apiFetch('/api/operation-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_number: selectedTable?.table_number || payload.table_number || null,
          order_id: cart?.order_id || payload.order_id || null,
          reservation_id: reservationId || payload.reservation_id || null,
          action,
          old_values: payload.old_values || null,
          new_values: payload.new_values || null,
          performed_by: null,
        }),
      });
    } catch {
      // non-blocking
    }
  };

  const placeOrder = async (campaign?: { id?: string; type?: string }, checkoutOverrides?: {
    customer_phone?: string;
    customer_name?: string;
    customer_note?: string;
    delivery_address?: string;
    delivery_district?: string;
    delivery_street?: string;
    delivery_building?: string;
    delivery_floor?: string;
    delivery_apartment?: string;
    delivery_intercom?: string;
    delivery_zone?: string;
    delivery_fee?: number;
    estimated_delivery_time?: string;
    payment_method?: string;
  }, assignedTo?: string) => {
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
          special_notes: x.item.special_notes || '',
          variant_id: x.item.variant_id || null,
          is_combo: x.item.is_combo || false,
          combo_id: x.item.combo_id || null,
          original_unit_price: x.item.original_unit_price || null,
          campaign_id: x.item.campaign_id || null,
          campaign_discount_amount: x.item.campaign_discount_amount || 0,
          campaign_discount_type: x.item.campaign_discount_type || null,
          seat_number: x.item.seat_number || null,
        }));

      if (unsent.length === 0) {
        if (cart.items.length > 0) {
          toast('Yeni məhsul yoxdur', { id: 'action-toast' });
        }
        setActiveView('floor');
        return;
      }

      // Reuse the table's existing active order (e.g. a reservation draft) instead
      // of creating a 2nd active order, which would violate idx_orders_active_table.
      // For takeaway/delivery: use cart.order_id if already created via modal
      let activeOrderId: string | null = cart.order_id || null;
      if (!activeOrderId && cart.table_number) {
        try {
           const ordersRes = await apiFetch(`/api/orders?table_number=${cart.table_number}`, { credentials: 'include' });
          if (ordersRes.ok) {
            const data = await ordersRes.json();
            const active = (data.orders || []).find(
              (o: any) => o.table_number === cart.table_number && !['paid', 'cancelled', 'closed'].includes(o.status)
            );
            activeOrderId = active?.id || null;
          }
        } catch { /* fall through to create */ }
      }

      const itemBasedDiscount = cart.items.reduce((s, i) => s + Math.max(0, ((i.original_unit_price ?? i.unit_price) - i.unit_price) * i.quantity), 0);
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

      const res = await apiFetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(
          activeOrderId
            ? { action: 'addItems', id: activeOrderId, items: unsent, terminal_id: terminalId }
            : {
                ...(cart.table_number !== undefined && cart.table_number !== null ? { table_number: cart.table_number } : {}),
                terminal_id: terminalId,
                items: unsent,
                status: 'confirmed',
                guest_count: cart.guest_count,
                customer_note: checkoutOverrides?.customer_note || cart.notes,
                 order_type: cart.order_type,
                 order_source: posMode,
                 customer_id: cart.customer_id || null,
                 customer_name: checkoutOverrides?.customer_name || cart.customer_name || null,
                 customer_phone: checkoutOverrides?.customer_phone || cart.customer_phone || null,
                 delivery_address: checkoutOverrides?.delivery_address || cart.delivery_address || null,
                 delivery_district: checkoutOverrides?.delivery_district || cart.delivery_district || null,
                 delivery_street: checkoutOverrides?.delivery_street || cart.delivery_street || null,
                 delivery_building: checkoutOverrides?.delivery_building || cart.delivery_building || null,
                 delivery_floor: checkoutOverrides?.delivery_floor || cart.delivery_floor || null,
                 delivery_apartment: checkoutOverrides?.delivery_apartment || cart.delivery_apartment || null,
                 delivery_intercom: checkoutOverrides?.delivery_intercom || cart.delivery_intercom || null,
                 delivery_zone: checkoutOverrides?.delivery_zone || cart.delivery_zone || null,
                 delivery_fee: checkoutOverrides?.delivery_fee ?? cart.delivery_fee ?? 0,
                 estimated_delivery_time: checkoutOverrides?.estimated_delivery_time || cart.estimated_delivery_time || null,
                 scheduled_date: cart.scheduled_date || null,
                 reservation_id: cart.reservation_id || null,
                 assigned_to: assignedTo || null,
                 discount_amount: computedDiscount.amount,
                 discount_type: computedDiscount.type,
                 campaign_id: campaign?.id || null,
                 is_rush: false,
                 payment_method: checkoutOverrides?.payment_method || null,
                }
        ),
      });
      let createdOrderId: string | null = null;
      if (res.ok) {
        const data = await res.json();
        createdOrderId = data.data?.id || data.id || data.order?.id || activeOrderId;
        toast.success('Sifariş göndərildi');
        logOperation('place_order', {
          order_id: createdOrderId,
          table_number: cart.table_number,
          new_values: { items: unsent.length, total: unsent.reduce((s, u) => s + u.unit_price * u.quantity, 0) },
        }).catch(() => {});
        // Merge both setCart calls into one to avoid losing order_id:
        // 1) Set order_id  2) Advance sentQuantity for sent items
        const sentKeys = new Set(unsent.map(u => `${u.product_id}__${u.variant_id || ''}__${u.is_combo ? 'c' : 'p'}`));
        setCart(prev => {
          if (!prev) return null;
          return {
            ...prev,
            order_id: createdOrderId,
            items: prev.items.map(i => {
              const key = `${i.product_id}__${i.variant_id || ''}__${i.is_combo ? 'c' : 'p'}`;
              if (!sentKeys.has(key)) return i;
              const newSent = Math.min(i.quantity, (i.sentQuantity || 0) + (i.quantity - (i.sentQuantity || 0)));
              return { ...i, sentQuantity: Math.max(i.sentQuantity || 0, newSent) };
            })
          };
        });

        if (posMode !== 'dine_in') {
          setCart(prev => prev ? { ...prev, items: [] } : null);
        }
        setActiveView('floor');
        fetchFloor().catch(() => {});
      } else {
        const err = await res.json();
        if (res.status === 409) {
          toast.error('Sifariş eyni anda başqa terminaldan dəyişdirildi. Yenidən cəhd edin.', { id: 'action-toast' });
        } else {
          toast.error(err.error || 'Sifariş göndərilmədi', { id: 'action-toast' });
        }
        // Refresh to clear any stale state so the user sees current server data
        fetchFloor().catch(() => {});
      }
    } finally {
      setPlacingOrder(false);
    }
  };

  const clearCart = () => {
    const current = cart;
    if (!current) return;
    // Remove unsent (draft) items entirely
    const draftIds = current.items
      .filter(item => (item.sentQuantity ?? 0) === 0 && (item as any).id)
      .map(item => (item as any).id);
    // For sent items, reset quantity back to sentQuantity (undo unsent additions)
    const keptItems = current.items
      .filter(item => (item.sentQuantity ?? 0) > 0)
      .map(item => ({ ...item, quantity: item.sentQuantity ?? item.quantity }));
    setCart(prev => prev ? { ...prev, items: keptItems } : null);
    if (draftIds.length > 0) {
      apiFetch('/api/orders/clear-draft-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_ids: draftIds }),
      }).catch(() => {});
    }
  };

  const updateGuestCount = async (delta: number) => {
    const latest = cartRef.current;
    if (!latest || !selectedTable) return;

    const previousCount = latest.guest_count || 1;
    const newCount = Math.max(1, previousCount + delta);

    if (newCount === previousCount) return;

    setCart(prev => prev ? { ...prev, guest_count: newCount } : null);

    // New cart (no order placed yet) — keep it local, placeOrder persists the
    // count. Only persist when an active order actually exists in the DB, so
    // empty tables can never receive a guest count.
    if (!latest.order_id) return;

    const tableNum = latest.table_number || selectedTable.table_number;
    // Takeaway/delivery shells have no table — the count is persisted at
    // placeOrder time, so nothing to update server-side here.
    if (tableNum == null) return;

    try {
      const res = await apiFetch('/api/orders/guest-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_number: tableNum, guest_count: newCount }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Guest count update failed');
      }
    } catch (e: any) {
      setCart(prev => {
        if (!prev) return null;
        if ((prev.guest_count || 1) !== newCount) return prev;
        return { ...prev, guest_count: previousCount };
      });
      toast.error(e?.message || 'Qonaq sayı yenilənə bilmədi', { id: 'guest-count-error' });
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

  const updateOrderType = (type: 'dine_in' | 'takeaway' | 'delivery') => {
    setPosMode(type);
    setCart(prev => prev ? { ...prev, order_type: type } : null);
  };

  const initializeTakeawayCart = () => {
    setSelectedTable(null);
    setCart({
      table_number: null,
      guest_count: 1,
      items: [],
      notes: '',
      order_type: posMode,
      customer_id: null,
      customer_name: null,
      customer_phone: null,
      delivery_address: null,
      delivery_fee: 0,
      estimated_delivery_time: null,
      order_id: null,
    });
  };

  const loadOrderIntoCart = (order: any) => {
    setSelectedTable(null);
    const orderItems = order.items || order.order_items || [];
    setCart({
      table_number: null,
      guest_count: order.guest_count || 1,
      items: orderItems.map((item: any) => ({
        product_id: item.product_id,
        product_name: item.product_name || item.products?.name_az || item.products?.name_en || 'Məhsul',
        unit_price: item.unit_price,
        quantity: item.quantity,
        total_price: item.total_price ?? item.unit_price * item.quantity,
        modifiers: item.modifiers ? (typeof item.modifiers === 'string' ? JSON.parse(item.modifiers) : item.modifiers) : [],
        special_notes: item.special_notes || '',
        variant_id: item.variant_id || null,
        is_combo: !!item.is_combo_parent,
        combo_id: item.combo_group_id || null,
        sentQuantity: item.quantity,
      })),
      notes: order.special_notes || order.customer_note || '',
      order_type: order.order_type || order.order_source || 'takeaway',
      customer_id: order.customer_id || null,
      customer_name: order.customer_name || null,
      customer_phone: order.customer_phone || null,
      delivery_address: order.delivery_address || null,
      delivery_fee: order.delivery_fee || 0,
      estimated_delivery_time: order.estimated_delivery_time || null,
      order_id: order.id,
      payment_method: order.payment_method || null,
    });
  };

  // Create order shell (for takeaway/delivery) via RPC, then set order_id on cart
  const createOrderShell = async (details: {
    customer_phone?: string;
    customer_name?: string;
    customer_note?: string;
    delivery_address?: string;
    delivery_fee?: number;
    estimated_pickup_time?: string;
    estimated_delivery_time?: string;
  }): Promise<string | null> => {
    try {
      let result: any = null;
      if (posMode === 'takeaway') {
        const res = await fetch('/api/rpc/create_takeaway_order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            p_customer_phone: details.customer_phone || null,
            p_customer_name: details.customer_name || null,
            p_customer_note: details.customer_note || null,
            p_estimated_pickup_time: details.estimated_pickup_time || null,
            p_items: JSON.stringify(cart?.items?.map((i: any) => ({
              product_id: i.product_id,
              product_name: i.product_name,
              quantity: i.quantity,
              unit_price: i.unit_price,
              total_price: i.total_price,
              modifiers: i.modifiers || [],
              special_notes: i.special_notes || '',
            })) || []),
          }),
        });
        result = await res.json();
      } else {
        const res = await fetch('/api/rpc/create_delivery_order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            p_customer_phone: details.customer_phone || null,
            p_customer_name: details.customer_name || null,
            p_customer_note: details.customer_note || null,
            p_delivery_address: details.delivery_address || null,
            p_delivery_fee: details.delivery_fee || 0,
            p_estimated_delivery_time: details.estimated_delivery_time || null,
            p_items: JSON.stringify(cart?.items?.map((i: any) => ({
              product_id: i.product_id,
              product_name: i.product_name,
              quantity: i.quantity,
              unit_price: i.unit_price,
              total_price: i.total_price,
              modifiers: i.modifiers || [],
              special_notes: i.special_notes || '',
            })) || []),
          }),
        });
        result = await res.json();
      }

      if (result?.data?.success && result.data.order_id) {
        const orderId = result.data.order_id;
        const orderNumber = result.data.order_number;
        // Update cart with order_id and customer details
        setCart(prev => prev ? {
          ...prev,
          order_id: orderId,
          customer_phone: details.customer_phone || prev.customer_phone,
          customer_name: details.customer_name || prev.customer_name,
          delivery_address: details.delivery_address || prev.delivery_address,
          delivery_fee: details.delivery_fee || prev.delivery_fee,
          estimated_delivery_time: details.estimated_delivery_time || prev.estimated_delivery_time,
        } : null);
        toast.success(`${orderNumber} yaradıldı`);
        return orderId;
      }
    } catch (e) {
      console.error('Failed to create order shell:', e);
    }
    return null;
  };

  const savePreOrder = async () => {
    if (!cart || !reservationId || !selectedTable) return;
    
    const itemsToSave = reservationMode 
      ? cart.items 
      : cart.items.filter(i => (i.sentQuantity ?? 0) === 0);
    
    if (itemsToSave.length === 0) return;

    try {
      const res = await apiFetch('/api/reservations/save-preorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservation_id: reservationId,
          table_number: selectedTable.table_number,
          guest_count: cart.guest_count || 1,
          customer_name: cart.customer_name || null,
          customer_note: cart.notes || null,
          items: itemsToSave.map(i => ({
            id: i.pre_order_id || undefined,
            product_id: i.product_id,
            product_name: i.product_name,
            quantity: i.quantity,
            unit_price: i.unit_price,
            modifiers: i.modifiers || [],
            special_notes: i.special_notes || '',
          })),
        }),
      });

      if (res.ok) {
        setCart(prev => prev ? {
          ...prev,
          items: prev.items.map(i => ({ ...i, sentQuantity: i.quantity })),
        } : null);
        toast.success('Pre-order yadda saxlanıldı');
        fetchFloor();
      } else {
        const err = await res.json().catch(() => ({ error: 'Xəta' }));
        toast.error(err.error || 'Pre-order yadda saxlanıla bilmədi');
      }
    } catch {
      toast.error('Xəta');
    }
  };

  const enterReservationMode = async (table: PosTable) => {
    setReservationMode(true);
    setReservationId(table.reservation_id || null);
    setReservationInfo({
      reservation_id: table.reservation_id || '',
      table_number: table.table_number,
      name: table.reservation_name || null,
      phone: table.reservation_phone || null,
      time: table.reservation_time || null,
      guests: table.guest_count || 1,
      is_vip: table.is_vip || false,
    });
    setSelectedTable(table);
    setActiveView('order');
    setReservationPreOrderItems([]);

    try {
      const preOrderRes = await apiFetch(`/api/reservations/pre-order-items?reservation_id=${table.reservation_id}`);

      let reservationItems: any[] = [];

      if (preOrderRes.ok) {
        const data = await preOrderRes.json();
        reservationItems = Array.isArray(data.items) ? data.items : [];
      }

      const merged = reservationItems;
      setReservationPreOrderItems(merged);

      const cartItems: PosCartItem[] = merged.map((item: any) => ({
        product_id: item.product_id || '',
        product_name: item.product_name || 'Məhsul',
        unit_price: Number(item.unit_price || 0),
        original_unit_price: Number(item.unit_price || 0),
        quantity: item.quantity || 1,
        total_price: Number(item.unit_price || 0) * (item.quantity || 1),
        modifiers: item.modifiers || [],
        variant_id: null,
        special_notes: item.special_notes || '',
        campaign_id: null,
        campaign_discount_amount: 0,
        campaign_discount_type: null,
        sentQuantity: item._draft ? (item.quantity || 1) : 0,
        is_pre_order: true,
        pre_order_id: item.id || item._order_id,
      }));

      setCart({
        table_number: table.table_number,
        guest_count: table.guest_count || 1,
        items: cartItems,
        notes: '',
        order_type: 'dine_in',
        reservation_id: table.reservation_id || null,
      });
    } catch {
      setReservationPreOrderItems([]);
      setCart({
        table_number: table.table_number,
        guest_count: table.guest_count || 1,
        items: [],
        notes: '',
        order_type: 'dine_in',
        reservation_id: table.reservation_id || null,
      });
    }
  };

  const exitReservationMode = () => {
    setReservationMode(false);
    setReservationId(null);
    setReservationPreOrderItems([]);
    setReservationInfo(null);
  };

  const guestArrived = async () => {
    if (!reservationId) return;
    try {
      if (reservationMode && cart?.items?.length) {
        const newPreOrders = cart.items
          .filter(i => i.is_pre_order)
          .map(i => ({
            id: i.pre_order_id || undefined,
            product_id: i.product_id,
            product_name: i.product_name,
            quantity: i.quantity,
            unit_price: i.unit_price,
            modifiers: i.modifiers || [],
            special_notes: i.special_notes || '',
          }));

        if (newPreOrders.length) {
          await apiFetch('/api/reservations/pre-order-items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              reservation_id: reservationId,
              items: newPreOrders,
              replace: true,
            }),
          }).catch(() => {});
        }
      }

      const res = await apiFetch('/api/reservations/guest-arrived', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservation_id: reservationId,
          performed_by: null,
        }),
      });
      if (res.ok) {
        toast.success('Qonaq gəldi — masa açıldı');
        logOperation('guest_arrived', {
          reservation_id: reservationId,
          table_number: selectedTable?.table_number,
          new_values: { status: 'arrived' },
        }).catch(() => {});
        exitReservationMode();
        fetchFloor();
      } else {
        const err = await res.json().catch(() => ({ error: 'Xəta' }));
        toast.error(err.error || 'Qonaq gəlmədi');
      }
    } catch {
      toast.error('Xəta');
    }
  };

   return {
     floors, products, categories, combos, variantsByProduct, loading, placingOrder, selectedTable, cart, activeView, lastUndo, posMode,
     fetchData, selectTable, mergeTables, transferTable, dismissTable, clearTable, performUndo,
     setActiveView, setCart, setSelectedTable, addToCart, addComboToCart, updateCartItemQty, placeOrder, clearCart, updateGuestCount,
     updateCartCustomer, updateOrderType, getAutoCampaign, setPosMode, initializeTakeawayCart, createOrderShell, loadOrderIntoCart,
     reservationMode, reservationId, reservationPreOrderItems, reservationInfo,
     enterReservationMode, exitReservationMode, guestArrived, savePreOrder, terminalId,
     expandedProductId, setExpandedProductId
   };
}
