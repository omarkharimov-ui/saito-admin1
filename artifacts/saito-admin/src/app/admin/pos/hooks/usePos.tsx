'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { toast } from '@/lib/toast';
import { apiFetch } from '@/lib/api-fetch';
import { useLanguage } from '@/lib/i18n/LanguageContext';

import type { PosProduct, PosTable, PosCart, PosCartItem, PosModifierSelection } from '../types/shared';

// Sətir identikliyi — editOf əvəzetməsi üçün stabil açar. Həm səbət sətri,
// həm modal preset eyni funksiya ilə normalizə olunur (JSON sıra həssaslığına düşmür).
export function cartLineKey(
  variantId: string | null | undefined,
  notes: string | null | undefined,
  mods: Array<{ id: string; quantity?: number }> | undefined
): string {
  const modKey = (mods || [])
    .filter(m => (m.quantity ?? 1) > 0)
    .slice()
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map(m => `${m.id}x${m.quantity ?? 1}`)
    .join('|');
  return `${variantId ?? ''}::${(notes || '').trim()}::${modKey}`;
}

export function usePos() {
  const { t } = useLanguage();
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
  const [cartHydrating, setCartHydrating] = useState(false);
  const [tableOrderCache, setTableOrderCache] = useState<Record<number, any>>({});
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
        toast.error(t('table_data_refresh_error'), { id: 'pos-tables-stale' });
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
      // Pre-fetch order items for all active tables in the background
      // so the cart is instantly populated when a table is tapped
      const activeTables = (floorsRef.current || [])
        .flatMap((f: any) => (f.tables || []).filter((t: any) =>
          ['occupied', 'cooking', 'waiting_bill', 'waiting'].includes(t.status)
        ))
        .map((t: any) => t.table_number);
      const uniqueTables = [...new Set(activeTables)];
      for (const tableNum of uniqueTables) {
        const params = `table_number=${tableNum}`;
        apiFetch(`/api/orders?${params}`)
          .then(async (res) => {
            if (res.ok) {
              const data = await res.json();
              const orderItems = (data.orders || []).flatMap((o: any) =>
                (o.items || []).map((item: any) => ({
                  id: `${o.id}_${item.product_id}`,
                  product_id: item.product_id,
                  product_name: (item.products || { name: '' }).name || '',
                  quantity: item.quantity || 0,
                  unit_price: item.unit_price || 0,
                  original_unit_price: item.unit_price || 0,
                  total_price: item.total_price || (item.unit_price || 0) * (item.quantity || 0),
                  sentQuantity: item.quantity || 0,
                  sent: true,
                  campaign_badge: null,
                  effective_price: null,
                  modifiers: [],
                  note: item.note || null,
                  variant: null,
                  station: item.station || 'kitchen',
                  course: item.course || 'mains',
                  priority: item.priority || 'normal',
                  hold_until: item.hold_until || null,
                  is_hold: !!item.hold_until,
                  order_id: o.id,
                }))
              );
              setTableOrderCache(prev => ({ ...prev, [tableNum]: { orders: data.orders, items: orderItems } }));
            }
          })
          .catch(() => {});
      }
    } catch (e) {
      console.error('POS fetch error:', e);
      toast.error(t('data_load_error'), { id: 'action-toast' });
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

  const draftRestoredRef = useRef(false);

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

    const poll = setInterval(() => fetchFloorRef.current(), 3000);

    return () => { 
      clearInterval(poll);
      removeRealtimeChannel(channel); 
    };
  }, [fetchData, terminalId]);

  useEffect(() => {
    if (posMode !== 'takeaway' && posMode !== 'delivery') return;
    if (!cart) return;
    if (cart.order_id) return;
    if (draftRestoredRef.current) return;
    const isEmpty = !(cart.items?.length) && !cart.customer_name && !cart.customer_phone && !cart.delivery_address;
    if (!isEmpty) return;
    try {
      const draft = sessionStorage.getItem('pos_takeaway_draft');
      if (draft) {
        const parsed = JSON.parse(draft);
        if (parsed.posMode === posMode && parsed.version === 1 && parsed.cart) {
          setCart(parsed.cart);
          draftRestoredRef.current = true;
        }
      }
    } catch {
      // ignore draft restore errors
    }
  }, [posMode, cart]);

  useEffect(() => {
    if (posMode !== 'takeaway' && posMode !== 'delivery') return;
    if (!cart) return;
    if (cart.order_id) {
      try { sessionStorage.removeItem('pos_takeaway_draft'); } catch {}
      return;
    }
    const hasData = (cart.items?.length || 0) > 0 || cart.customer_name || cart.customer_phone || cart.delivery_address;
    if (!hasData) {
      try { sessionStorage.removeItem('pos_takeaway_draft'); } catch {}
      return;
    }
    try {
      sessionStorage.setItem('pos_takeaway_draft', JSON.stringify({ posMode, cart, version: 1 }));
    } catch {
      // ignore storage errors
    }
  }, [posMode, cart]);

  const selectTable = async (table: PosTable, opts?: { allowReserved?: boolean; force?: boolean }) => {
    const sameTable =
      selectedTable?.table_number === table.table_number &&
      cart?.table_number === table.table_number;

    if (sameTable && activeView === 'order' && !opts?.force) return;

    if (table.status === 'reserved' && !opts?.allowReserved) {
      toast.error(t('table_reserved_activate'), { id: 'action-toast' });
      return;
    }

    if (table.status === 'waiting') {
      toast.error(t('guest_waiting_redirect'), { id: 'action-toast' });
      return;
    }

    const switchingToDifferentTable = selectedTable?.table_number !== table.table_number;
    const reqId = ++selectTableReqId.current;

    // Opening a normal (non-reserved) table always exits reservation mode —
    // otherwise the order panel would keep showing the PRE-ORDER UI on tables
    // that are just ordinary occupied/empty tables.
    if (!opts?.allowReserved) exitReservationMode();

    setSelectedTable(table);
    setActiveView('order');

    // Snapshot current items BEFORE the async fetch (for draft preservation)
    const prevCartItems = cart?.items ?? [];
    const draftItems = prevCartItems.filter((i) => (i.sentQuantity ?? 0) === 0);
    const sentItems = prevCartItems.filter((i) => (i.sentQuantity ?? 0) > 0);

    // Set a loading cart immediately so the UI is not blank during fetch
    if (switchingToDifferentTable || !cart) {
      // Use cached order data if available (pre-fetched from floor load)
      const cached = tableOrderCache[table.table_number];
      const cachedItems = cached?.items || (switchingToDifferentTable ? [] : sentItems);
      setCart({
        table_number: table.table_number,
        guest_count: table.guest_count || 1,
        items: cachedItems,
        notes: cached?.orders?.[0]?.notes || '',
        order_type: 'dine_in'
      });
      // Mark hydrating when cache is empty (items will flash empty before fetch completes)
      if (cachedItems.length === 0) setCartHydrating(true);
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
              id: item.id,
              product_id: item.product_id,
              product_name: item.product_name,
              unit_price: item.unit_price,
              quantity: item.quantity,
              total_price: item.total_price,
              modifiers: typeof item.modifiers === 'string' ? JSON.parse(item.modifiers || '[]') : (item.modifiers || []),
              special_notes: item.special_notes || '',
              hold_until: item.hold_until || null,
              is_hold: !!item.hold_until,
              course: item.course || 'mains',
              is_combo: !!item.is_combo_parent,
              combo_id: item.combo_group_id || null,
              sentQuantity: item.quantity,
              kitchen_status: item.kitchen_status || 'pending',
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
            // Merge in any unsent (draft) items from local state — but ONLY when
            // re-entering the SAME table. Leaving a table (switching to another)
            // auto-discards the drafts, mirroring reservation drafts.
            const carryDrafts = !switchingToDifferentTable;
            const seen = new Set<string>();
            for (const u of carryDrafts
              ? [...draftItems, ...prev.items.filter(i => (i.sentQuantity ?? 0) === 0)]
              : []) {
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
          setCart(prev => {
            if (!prev) return null;
            // Keep only sent (server-synced) items, drop all drafts
            const kept = prev.items.filter(i => (i.sentQuantity ?? 0) > 0);
            if (kept.length === prev.items.length) return prev; // nothing to clear
            return { ...prev, items: kept.map(i => ({ ...i, quantity: i.sentQuantity ?? i.quantity })) };
          });
        }
      }
      setCartHydrating(false);
    } catch (e) {
      console.error('Failed to load existing order items:', e);
      setCartHydrating(false);
      // On failure, restore drafts only when re-entering the same table; leaving
      // a table discards them (same auto-delete rule as above).
      if (draftItems.length > 0 && !switchingToDifferentTable && reqId === selectTableReqId.current) {
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
      setLastUndo({ action: 'merge', data: data.data?.undo, message: t('tables_merged') });
      fetchFloor();
      return { action: 'merge' as const, data: data.data?.undo, message: t('tables_merged') };
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

  const markTableSeatedLocal = useCallback((nums: number[], guestCount: number) => {
    const set = new Set(nums);
    setFloors(prev => prev.map((f: any) => ({
      ...f,
      tables: (f.tables || []).map((t: any) =>
        set.has(t.table_number)
          ? { ...t, status: 'occupied', guest_count: guestCount, last_activity_at: new Date().toISOString() }
          : t
      ),
    })));
  }, []);

  const seatTable = async (num: number, guestCount: number) => {
    return withOperationLock(`seat_${num}`, async () => {
      const res = await apiFetch('/api/tables/seat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_number: num, guest_count: guestCount }),
      });
      if (res.ok) {
        markTableSeatedLocal([num], guestCount);
        setSelectedTable((prev: any) => (prev && prev.table_number === num ? { ...prev, status: 'occupied', guest_count: guestCount } : prev));
        toast.success(t('guest_seated'));
        setLastUndo({ action: 'seat', data: { table_number: num }, message: t('guest_seated') });
      } else {
        const err = await res.json().catch(() => ({ error: 'Seat failed' }));
        toast.error(err.error || t('seat_failed'));
      }
    });
  };

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
        markTableEmptyLocal([num, ...childNums]);
        toast.success(t('table_cleared').replace('{table}', String(num)));
        setLastUndo({ action: 'dismiss', data: { table_number: num, child_tables: childNums }, message: t('table_cleared').replace('{table}', String(num)) });
      } else {
        const err = await res.json().catch(() => ({ error: 'Dismiss failed' }));
        toast.error(err.error || t('table_clear_failed'));
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
        toast.success(t('table_cleared').replace('{table}', String(num)));
        setLastUndo({ action: 'clear', data: { table_number: num, terminal_id: terminalId }, message: t('table_cleared').replace('{table}', String(num)) });
      } else {
        const err = await res.json().catch(() => ({ error: 'Clear failed' }));
        toast.error(err.error || t('table_clean_failed'));
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
          toast.success(t('restored'));
          await fetchFloor();
        } else {
          const err = await res.json();
          toast.error(err.error || t('restore_failed'));
        }
      } else {
        const res = await apiFetch('/api/orders/undo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: lastUndo.action, data: lastUndo.data, terminal_id: terminalId }),
        });
        if (res.ok) {
          toast.success(t('restored'));
          await fetchFloor();
        } else {
          const err = await res.json();
          toast.error(err.error || t('restore_failed'));
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
    opts?: { variantId?: string | null; notes?: string; modifiers?: PosModifierSelection[]; quantity?: number; editOf?: { identity?: string } }
  ) => {
    const addQty = Math.max(1, Number(opts?.quantity) || 1);
    const base = cartRef.current ?? {
      table_number: selectedTable?.table_number || null,
      guest_count: selectedTable?.guest_count || 1,
      items: [],
      notes: '',
      order_type: posMode,
    };
    const items = base.items.map(i => ({ ...i }));
    const variant = opts?.variantId
      ? (variantsByProduct[p.id] || []).find(v => v.id === opts.variantId)
      : undefined;
    const variantId = opts?.variantId ?? null;
    const basePrice = variant ? Number(variant.discount_price != null && variant.discount_price !== '' ? variant.discount_price : variant.price) : (p.price ?? 0);
    const effective = (p as any).effective_price;
    // Variant seçilibsə variant qiyməti əsasdır (kampaniya endirimi məbləğ kimi düşülür);
    // variantsızdırsa kampaniyalı effektiv qiymət tətbiq olunur.
    const effNum = typeof effective === 'number' ? effective : effective?.effective_price;
    const campaignDiscountAmt = typeof effective === 'object' && effective ? Number(effective.discount_amount) || 0 : 0;
    const productUnit = variant
      ? (campaignDiscountAmt > 0 ? Math.max(0, basePrice - campaignDiscountAmt) : basePrice)
      : (effNum ?? basePrice);
    // Modifikator qiymətləri unit_price-a da, original_unit_price-a da əlavə olunur ki,
    // (original − unit) əsaslı endirim hesablamaları pozulmasın.
    const modifiersTotal = (opts?.modifiers || []).reduce((s, m) => s + Number(m.price || 0) * (m.quantity || 1), 0);
    const unitPrice = Math.round((productUnit + modifiersTotal) * 100) / 100;
    const originalWithMods = Math.round((basePrice + modifiersTotal) * 100) / 100;
    const campaignId = typeof effective === 'object' && effective?.campaign_id ? effective.campaign_id : null;
    const campaignDiscount = typeof effective === 'object' && effective?.discount_amount ? effective.discount_amount : 0;
    const campaignDiscountType = typeof effective === 'object' && effective?.discount_type ? effective.discount_type : null;
    // EditOf: modal mövcud sətri redaktə edirdisə — köhnə konfiqurasiyalı
    // sətri tapıb əvəz edirik (merge yox). Yalnız göndərilməmiş sətirlər.
    if (opts?.editOf?.identity) {
      const target = items.find(
        i => String(i.product_id) === String(p.id)
          && !(i.sentQuantity ?? 0)
          && cartLineKey(i.variant_id, i.special_notes, i.modifiers as any) === opts.editOf!.identity
      );
      if (target) {
        const replaced = {
          ...target,
          unit_price: unitPrice,
          original_unit_price: originalWithMods,
          quantity: addQty,
          total_price: Math.round(unitPrice * addQty * 100) / 100,
          modifiers: opts?.modifiers ?? [],
          variant_id: variantId,
          special_notes: opts?.notes ?? '',
        };
        setCart({ ...base, items: items.map(i => (i === target ? replaced : i)) });
        return;
      }
    }
    const existing = items.find(
      i => String(i.product_id) === String(p.id)
        && (i.variant_id ?? null) === variantId
        && JSON.stringify(i.modifiers || []) === JSON.stringify(opts?.modifiers || [])
        && (i.special_notes || '') === (opts?.notes || '')
    );
    if (existing) {
      existing.quantity += addQty;
      existing.total_price = existing.unit_price * existing.quantity;
      setCart({ ...base, items });
      return;
    }
    const newItem = {
      product_id: p.id,
      product_name: p.name,
      unit_price: unitPrice,
      original_unit_price: originalWithMods,
      quantity: addQty,
      total_price: Math.round(unitPrice * addQty * 100) / 100,
      modifiers: opts?.modifiers ?? [],
      variant_id: variantId,
      special_notes: opts?.notes ?? '',
      campaign_id: campaignId,
      campaign_discount_amount: campaignDiscount,
      campaign_discount_type: campaignDiscountType,
      is_pre_order: reservationMode,
      pre_order_id: null,
    };
    const newIndex = items.length;
    items.push(newItem);
    setCart({ ...base, items });

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
              items: prev.items.map((it, idx) =>
                idx === newIndex && it.is_pre_order && !it.pre_order_id
                  ? { ...it, pre_order_id: saved.id }
                  : it
              ),
            } : null);
          }
        })
        .catch(() => {});
    }
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
      const sent = items[idx].sentQuantity ?? 0;
      items[idx].quantity = Math.max(items[idx].quantity + delta, sent);
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


  const isValidUUID = (id: string | null | undefined) => {
    if (!id) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
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
    console.log('[placeOrder] called', { 
      cart: !!cart, 
      placingOrder, 
      cartTableNumber: cart?.table_number, 
      cartItems: cart?.items?.length,
      posMode 
    });
    if (!cart || placingOrder) {
      console.log('[placeOrder] early return', { cart: !!cart, placingOrder });
      return;
    }
    setPlacingOrder(true);
    try {
      const unsent = cart.items
        .map(i => ({
          item: i,
          delta: Math.max(0, (i.quantity || 0) - (i.sentQuantity || 0)),
        }))
        .filter(x => x.delta > 0 && !(x.item as any).is_hold)
        .map(x => ({
          product_id: x.item.product_id,
          product_name: x.item.product_name,
          unit_price: x.item.unit_price,
          quantity: x.delta,
          modifiers: x.item.modifiers || [],
          special_notes: x.item.special_notes || '',
          variant_id: x.item.variant_id || null,
          course: (x.item as any).course || 'mains',
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
          toast(t('no_new_products'), { id: 'action-toast' });
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

      console.log('[placeOrder] API payload', { table_number: cart?.table_number, unsent: unsent?.length, activeOrderId, posMode });
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
                 assigned_to: isValidUUID(assignedTo) ? assignedTo : null,
                 discount_amount: computedDiscount.amount,
                 discount_type: computedDiscount.type,
                 campaign_id: campaign?.id || null,
                 is_rush: false,
                 payment_method: checkoutOverrides?.payment_method || null,
                }
        ),
      });
      let createdOrderId: string | null = null;
      console.log('[placeOrder] API response', { status: res.status, ok: res.ok });
      if (res.ok) {
        const data = await res.json();
        createdOrderId = data.data?.id || data.id || data.order?.id || activeOrderId;
        console.log('[placeOrder] success', { createdOrderId, data });
        toast.success(t('order_sent'));
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
          toast.error(t('order_changed_by_other_terminal'), { id: 'action-toast' });
        } else {
          toast.error(err.error || t('order_not_sent'), { id: 'action-toast' });
        }
        // Refresh to clear any stale state so the user sees current server data
        fetchFloor().catch(() => {});
      }
    } catch (e: any) {
      console.error('[placeOrder] failed:', e);
      toast.error(e.message || t('order_not_sent'), { id: 'action-toast' });
    } finally {
      setPlacingOrder(false);
    }
  };

  const clearCart = () => {
    const current = cart;
    if (!current) return;

    if (reservationMode) {
      // Reservation mode: keep saved pre-order items (reset to their saved
      // quantity, undoing any qty increases), remove draft items entirely —
      // and sync the backend so cleared drafts don't reappear on reload.
      const keptItems = current.items
        .filter(item => (item.sentQuantity ?? 0) > 0)
        .map(item => ({ ...item, quantity: item.sentQuantity ?? item.quantity }));
      setCart(prev => prev ? { ...prev, items: keptItems } : null);
      if (reservationId) {
        apiFetch('/api/reservations/pre-order-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reservation_id: reservationId,
            replace: true,
            items: keptItems.map(i => ({
              id: i.pre_order_id || undefined,
              product_id: i.product_id,
              product_name: i.product_name,
              quantity: i.quantity,
              unit_price: i.unit_price,
              modifiers: i.modifiers || [],
              special_notes: i.special_notes || '',
            })),
          }),
        }).catch(() => {});
      }
      return;
    }

    // Remove unsent (draft) items entirely; reset saved items back to their
    // sent quantity (undo unsent additions)
    const draftIds = current.items
      .filter(item => (item.sentQuantity ?? 0) === 0 && (item as any).id)
      .map(item => (item as any).id);
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
      toast.error(e?.message || t('guest_count_update_failed'), { id: 'guest-count-error' });
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

  const switchMode = (mode: 'dine_in' | 'takeaway' | 'delivery') => {
    setPosMode(mode);
    setCart(prev => {
      if (!prev) return null;
      const base = { ...prev, order_type: mode };
      if (mode === 'dine_in') {
        return {
          ...base,
          table_number: null,
          guest_count: 1,
          reservation_id: null,
          delivery_address: null,
          delivery_district: null,
          delivery_street: null,
          delivery_building: null,
          delivery_floor: null,
          delivery_apartment: null,
          delivery_intercom: null,
          delivery_zone: null,
          delivery_fee: 0,
          estimated_delivery_time: null,
          courier_id: null,
          courier_name: null,
          tracking_number: null,
          delivered_at: null,
        };
      }
      if (mode === 'takeaway') {
        return {
          ...base,
          table_number: null,
          guest_count: 1,
          reservation_id: null,
          delivery_address: null,
          delivery_district: null,
          delivery_street: null,
          delivery_building: null,
          delivery_floor: null,
          delivery_apartment: null,
          delivery_intercom: null,
          delivery_zone: null,
          delivery_fee: 0,
          estimated_delivery_time: null,
          courier_id: null,
          courier_name: null,
          tracking_number: null,
          delivered_at: null,
        };
      }
      if (mode === 'delivery') {
        return {
          ...base,
          table_number: null,
          guest_count: 1,
          reservation_id: null,
          estimated_delivery_time: null,
        };
      }
      return base;
    });
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
        id: item.id,
        product_id: item.product_id,
        product_name: item.product_name || item.products?.name_az || item.products?.name_en || t('product'),
        unit_price: item.unit_price,
        quantity: item.quantity,
        total_price: item.total_price ?? item.unit_price * item.quantity,
        modifiers: item.modifiers ? (typeof item.modifiers === 'string' ? JSON.parse(item.modifiers) : item.modifiers) : [],
        special_notes: item.special_notes || '',
        variant_id: item.variant_id || null,
        is_combo: !!item.is_combo_parent,
        combo_id: item.combo_group_id || null,
        course: item.course || 'mains',
        hold_until: item.hold_until || null,
        is_hold: !!item.hold_until,
        sentQuantity: item.quantity,
        kitchen_status: item.kitchen_status || 'pending',
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
        toast.success(`${orderNumber} ${t('order_created')}`);
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
        toast.success(t('pre_order_saved'));
        fetchFloor();
      } else {
        const err = await res.json().catch(() => ({ error: t('error') }));
        toast.error(err.error || t('pre_order_save_failed'));
      }
    } catch {
      toast.error(t('error'));
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

      // Merge duplicate rows (same product + same modifiers/notes) into one entry
      const merged = (() => {
        const byKey = new Map<string, any>();
        for (const r of reservationItems) {
          const key = [
            r.product_id,
            r.variant_id ?? null,
            JSON.stringify(r.modifiers || []),
            r.special_notes || '',
          ].join('|');
          const ex = byKey.get(key);
          if (ex) {
            ex.quantity = (Number(ex.quantity) || 0) + (Number(r.quantity) || 1);
            ex.total_price = (Number(ex.unit_price) || 0) * (ex.quantity || 1);
            if (!ex.id && r.id) ex.id = r.id;
          } else {
            byKey.set(key, { ...r });
          }
        }
        return [...byKey.values()];
      })();
      setReservationPreOrderItems(merged);

      const cartItems: PosCartItem[] = merged.map((item: any) => ({
        product_id: item.product_id || '',
        product_name: item.product_name || t('product'),
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
        sentQuantity: Number(item.quantity) || 1,
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
        toast.success(t('guest_arrived_table_opened'));
        logOperation('guest_arrived', {
          reservation_id: reservationId,
          table_number: selectedTable?.table_number,
          new_values: { status: 'arrived' },
        }).catch(() => {});
        exitReservationMode();
        fetchFloor();
      } else {
        const err = await res.json().catch(() => ({ error: t('error') }));
        toast.error(err.error || t('guest_not_arrived'));
      }
    } catch {
      toast.error(t('error'));
    }
  };

    return {
      floors, products, categories, combos, variantsByProduct, loading, placingOrder, selectedTable, cart, cartHydrating, activeView, lastUndo, posMode,
      fetchData, selectTable, mergeTables, transferTable, dismissTable, clearTable, performUndo, seatTable,
      setActiveView, setCart, setSelectedTable, addToCart, addComboToCart, updateCartItemQty, placeOrder, clearCart, updateGuestCount,
      updateCartCustomer, updateOrderType, switchMode, getAutoCampaign, setPosMode, initializeTakeawayCart, createOrderShell, loadOrderIntoCart,
      reservationMode, reservationId, reservationPreOrderItems, reservationInfo,
      enterReservationMode, exitReservationMode, guestArrived, savePreOrder, terminalId,
      expandedProductId, setExpandedProductId
    };
}
