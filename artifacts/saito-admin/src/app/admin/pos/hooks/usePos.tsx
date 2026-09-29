'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { toast } from '@/lib/toast';
import { apiFetch } from '@/lib/api-fetch';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { isFinalOrderStatus } from '@/lib/pos-tables';

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

// --- S1 pos-sync observability (dev-only) ------------------------------
// Lightweight counters around the floor/order realtime path. They answer the
// later question "can the 3s polling fallback be reduced/removed?" without any
// external analytics dependency or production log noise. Inspect live state in
// the browser console via `window.__POS_SYNC_STATS__` (development builds).
type PosSyncStats = {
  realtimeEvents: number;      // postgres_changes events seen after echo filter
  echoSuppressed: number;      // self-originated events (same terminal) skipped
  debounceCoalesced: number;   // extra triggers merged into an open debounce window
  debouncedExecutions: number; // floor refetches actually fired by the debounce
  pollTicks: number;           // 3s fallback poll ticks
  pollSkips: number;           // poll ticks skipped (coalesced/in-flight refresh)
  realtimeExecutions: number;  // fetchFloor() runs triggered by realtime
  pollExecutions: number;      // fetchFloor() runs triggered by polling
  manualFetches: number;       // fetchFloor() runs from actions/initial/manual
  failedFetches: number;       // non-ok or network-failed refetches
  staleDiscarded: number;      // late responses dropped by the generation guard
};

const initialPosSyncStats = (): PosSyncStats => ({
  realtimeEvents: 0,
  echoSuppressed: 0,
  debounceCoalesced: 0,
  debouncedExecutions: 0,
  pollTicks: 0,
  pollSkips: 0,
  realtimeExecutions: 0,
  pollExecutions: 0,
  manualFetches: 0,
  failedFetches: 0,
  staleDiscarded: 0,
});

function debugSync(...args: unknown[]) {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.debug('[pos-sync]', ...args);
  }
}

// Delivery Phase 2 (2026-09-24): map the server-side delivery gate codes
// (thrown by /api/orders POST) to friendly POS text. The client gate in
// page.tsx usually blocks first; this covers a stale client that raced the
// switch. Returns null for non-delivery codes (caller falls through).
function deliveryGateMsg(code: unknown): string | null {
  const c = String(code || '');
  if (c.startsWith('DELIVERY_PAUSED')) return 'Çatdırılma sifarişləri hazırda qəbul edilmir';
  if (c.startsWith('DELIVERY_DISABLED')) return 'Çatdırılma hazırda fəaliyyətə deyil — Ayarlar → Çatdırılma';
  if (c.startsWith('DELIVERY_MIN_ORDER')) {
    const m = c.match(/required=([\d.]+),\s*actual=([\d.]+)/);
    if (m) return `Min sifariş ₼${Number(m[1]).toFixed(0)} — sifariş cəmi ₼${Number(m[2]).toFixed(0)}`;
    return 'Sifariş minimum çatdırılma məbləğindən aşağıdır';
  }
  return null;
}

export function usePos() {
  const { t } = useLanguage();
  const [floors, setFloors] = useState<any[]>([]);
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [combos, setCombos] = useState<any[]>([]);
  const [variantsByProduct, setVariantsByProduct] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  // Minimal floor-refresh error flag for the dine-in floor view inline error
  // state (G8 Batch 2). Set by fetchFloor on failure, cleared on success.
  const [floorLoadFailed, setFloorLoadFailed] = useState(false);
  // Minimal catalog error flag for ProductGrid inline error + retry (G8
  // Batch 3). Set by fetchCatalog on failure, cleared on success.
  const [catalogLoadFailed, setCatalogLoadFailed] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  // 2026-09-24 (owner: "bir terminaldan ediram, bezi masalarda hələ də
  // 'başqa terminaldan dəyişdirildi'"): React state (placingOrder) only
  // re-renders AFTER the microtask, so a fast double-tap on the touch
  // screen fires TWO sends before the button re-disables — both read
  // placingOrder=false, both append, the 1st bumps the order version, the
  // 2nd's conditional PATCH matches 0 rows → spurious CONCURRENCY_CONFLICT
  // ("another terminal"). This synchronous ref closes that window.
  const placingRef = useRef(false);
  const operationLocks = useRef<Set<string>>(new Set());
  // 2026-09-24 (owner: "tam məlumat ver — hansı terminaldı, self-ordermı,
  // KDS/BDS-mi"): the full second-writer diagnostics returned by the 409,
  // shown in a dialog (not just a toast).
  const [conflictInfo, setConflictInfo] = useState<any>(null);
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

  // 2026-09-26 (Task 54 verify hardening, P1 floor empty first load): dev
  // cold-start (route compile ~5-10s) used to exhaust 3×1s retries → the
  // floor sat on the empty state until the user clicked YENIDƏN CƏHD ET.
  // 5×1.5s ≈ covers a slow compile; the 3s poll still heals after.
  const retryWithBackoff = async (fn: () => Promise<Response>, retries = 5, delay = 1500): Promise<Response> => {
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

  // --- S1 stale-response + coalescing state --------------------------
  // Generation token: bumped at the START of every floor refresh (realtime,
  // polling, action, initial). A response is applied only when its token is
  // still the newest — an older response finishing later can never overwrite
  // newer floor state, regardless of network response ordering.
  const floorGenRef = useRef(0);
  // Realtime/poll coalescing: triggers inside a short window collapse into one
  // guarded refresh (see scheduleFloorRefresh below).
  const floorDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const floorDebounceSinceRef = useRef(0);
  // In-flight tracking so the 3s poll does not stack an overlapping request on
  // top of a refresh that started moments ago (starvation-safe: polls older
  // than ~2.5s are allowed to supersede a hung request).
  const floorInFlightCountRef = useRef(0);
  const floorInFlightSinceRef = useRef(0);
  const syncStatsRef = useRef<PosSyncStats>(initialPosSyncStats());

  // Light refresh: floor + open orders only. Used for every reactive operation
  // (place order, merge, transfer, mark-ready) and on realtime events. Kept
  // cheap so the UI reflects changes immediately instead of waiting on the
  // heavy product catalog reload.
  //
  // S1 guard: every call bumps the generation token; only the newest request's
  // response is committed to state. This protects against the classic race of
  // "UPDATE order → fetch A, PAYMENT → fetch B, B returns, then A returns and
  // overwrites the paid state with stale data".
  const fetchFloor = useCallback(async (reason?: 'realtime' | 'poll' | 'manual') => {
    const gen = floorGenRef.current + 1;
    floorGenRef.current = gen;
    floorInFlightCountRef.current += 1;
    floorInFlightSinceRef.current = Date.now();
    if (reason === 'realtime') syncStatsRef.current.realtimeExecutions += 1;
    else if (reason === 'poll') syncStatsRef.current.pollExecutions += 1;
    else syncStatsRef.current.manualFetches += 1;
    debugSync('refetch start', reason ?? 'manual', `gen=${gen}`);
    try {
      const tablesRes = await retryWithBackoff(async () => {
        const r = await fetch('/api/pos/tables', { cache: 'no-store' });
        // Defensive: a 307/HTML login page (stale session) is not JSON.
        // Reject so the retry kicks in instead of crashing the floor.
        const ct = r.headers.get('content-type') || '';
        if (!r.ok || !ct.includes('application/json')) {
          if (r.status === 401) window.dispatchEvent(new CustomEvent('pos:unauthorized'));
          throw new Error(`pos/tables: ${r.status}`);
        }
        return r;
      });
      if (tablesRes.ok) {
        const data = await tablesRes.json();
        if (gen !== floorGenRef.current) {
          syncStatsRef.current.staleDiscarded += 1;
          debugSync('discard stale response', `gen=${gen}`, `latest=${floorGenRef.current}`);
          return;
        }
        setFloors(data.floors || []);
        setFloorLoadFailed(false);
      } else {
        syncStatsRef.current.failedFetches += 1;
        setFloorLoadFailed(true);
        console.error('POS tables fetch failed:', tablesRes.status);
        if (tablesRes.status === 401) {
          window.dispatchEvent(new CustomEvent('pos:unauthorized'));
        }
        toast.error(t('table_data_refresh_error'), { id: 'pos-tables-stale' });
      }
    } catch (e) {
      syncStatsRef.current.failedFetches += 1;
      setFloorLoadFailed(true);
      console.error('POS floor fetch error:', e);
    } finally {
      floorInFlightCountRef.current -= 1;
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
        setCatalogLoadFailed(false);
      } else {
        setCatalogLoadFailed(true);
        console.error('POS products fetch failed:', (productsRes as Response)?.status);
      }
    } catch (e) {
      setCatalogLoadFailed(true);
      console.error('POS catalog fetch error:', e);
    }
  }, []);

  // 2026-09-27 (owner: "stok yeniləndikdə avtomatik yenilənib-yenilənmədiyini
  // yoxla; sistemin məntiqini düzgün və ardıcıl şəkildə qur"):
  // STOCK SSOT = products.is_in_stock / products.is_available (admin flags,
  // managed in Admin → Məhsullar). The POS derives its out-of-stock Set from
  // this catalog. The catalog used to load ONCE on mount — an admin flipping
  // a product's stock in a different tab was invisible to the terminal until
  // a manual reload. Now: every 60s (visible tabs only) the catalog quietly
  // re-syncs, so OOS cards / prices / availability follow the admin without
  // touching the cart or the floor.
  const catalogSyncRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    catalogSyncRef.current = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return; // background tab: skip
      fetchCatalog();
    }, 60000);
    return () => {
      if (catalogSyncRef.current) clearInterval(catalogSyncRef.current);
      catalogSyncRef.current = null;
    };
  }, [fetchCatalog]);

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
                  course: item.course || 'main',
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

  // Per-mode one-shot: a restored draft must not re-trigger in the same
  // session for that mode, but switching AWAY and BACK must be able to
  // restore the other mode's draft (old single ref blocked the 2nd restore).
  const draftRestoredForRef = useRef<Set<string>>(new Set());

  // --- S1 realtime coalescing scheduler ------------------------------
  // Every refresh trigger (realtime event, 3s fallback poll) funnels through
  // here so the floor is never refetched more than once per short window:
  //   * realtime events → one debounced guarded fetch (250ms trailing window,
  //     hard ceiling ~1s so a continuous event stream cannot starve the fetch)
  //   * poll ticks → skipped while a realtime-coalesced refresh is pending or
  //     a fetch started within the last ~2.5s (no overlapping requests)
  // Polling is NOT permanently coupled to subscription health — its removal
  // stays a separate decision based on the __POS_SYNC_STATS__ measurements.
  const scheduleFloorRefresh = useCallback((reason: 'realtime' | 'poll') => {
    if (reason === 'realtime') {
      syncStatsRef.current.realtimeEvents += 1;
    } else {
      syncStatsRef.current.pollTicks += 1;
      if (floorDebounceRef.current !== null) {
        // A coalesced refresh is already pending — do not stack another one.
        syncStatsRef.current.pollSkips += 1;
        return;
      }
      if (
        floorInFlightCountRef.current > 0 &&
        Date.now() - floorInFlightSinceRef.current < 2500
      ) {
        syncStatsRef.current.pollSkips += 1;
        return;
      }
    }
    if (floorDebounceRef.current !== null) {
      syncStatsRef.current.debounceCoalesced += 1;
      // Hard ceiling: measured from the FIRST trigger of this window. Once ~1s
      // old, stop extending — the pending timer is left to fire, so a
      // continuous event stream can never starve the refresh.
      if (Date.now() - floorDebounceSinceRef.current >= 1000) return;
      clearTimeout(floorDebounceRef.current);
    } else {
      floorDebounceSinceRef.current = Date.now();
    }
    floorDebounceRef.current = setTimeout(() => {
      floorDebounceRef.current = null;
      syncStatsRef.current.debouncedExecutions += 1;
      debugSync('debounced refetch', reason);
      fetchFloorRef.current(reason);
    }, 250);
  }, []);

  useEffect(() => {
    fetchData();
    if (typeof window !== 'undefined') {
      (window as any).__POS_SYNC_STATS__ = syncStatsRef.current;
    }

    const onPosChange = (payload: any) => {
      const record = payload?.new || payload?.record || {};
      // Terminal echo suppression: updates originating from this terminal are
      // already reflected locally (optimistic patch + action refetch), so the
      // realtime echo must not trigger a self-refresh loop.
      if (record.updated_by_terminal_id === terminalId) {
        syncStatsRef.current.echoSuppressed += 1;
        return;
      }
      scheduleFloorRefresh('realtime');
    };

    // S1 = canonical POS realtime owner for table_floors + orders (fetch-based
    // reconciliation: payloads never patch table/order state directly).
    const channel = createRealtimeChannel('pos-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_floors' }, onPosChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, onPosChange)
      .subscribe();

    // P1 — temporary reliability fallback (3s). S1 realtime is primary; this
    // poll is kept until measurements prove the channel alone covers floor and
    // order transitions. It goes through the same guarded scheduler above, so
    // it never creates an unnecessary overlapping request.
    const poll = setInterval(() => scheduleFloorRefresh('poll'), 3000);

    return () => {
      clearInterval(poll);
      if (floorDebounceRef.current !== null) {
        clearTimeout(floorDebounceRef.current);
        floorDebounceRef.current = null;
      }
      removeRealtimeChannel(channel);
    };
  }, [fetchData, scheduleFloorRefresh, terminalId]);

  const prevSelectedTableStatusRef = useRef<string | null>(null);

  const resetCart = useCallback(() => {
    setCart(null);
    setTableOrderCache(prev => {
      const next = { ...prev };
      if (selectedTable) delete next[selectedTable.table_number];
      return next;
    });
  }, [selectedTable]);

  useEffect(() => {
    if (!selectedTable) return;
    const tableNumber = selectedTable.table_number;
    const currentTable = floors
      .flatMap((f: any) => f.tables || [])
      .find((t: any) => t.table_number === tableNumber);
    const currentStatus = currentTable?.status || null;
    const prevStatus = prevSelectedTableStatusRef.current;

    if (prevStatus && currentStatus && prevStatus !== currentStatus) {
      if (['empty', 'free'].includes(currentStatus)) {
        resetCart();
        setSelectedTable(null);
        setActiveView('floor');
      }
    }

    prevSelectedTableStatusRef.current = currentStatus;
  }, [floors, selectedTable, selectedTable?.table_number, resetCart]);

  // 2026-09-27 (owner: "sebet itmesinde nie itir"): drafts now cover
  // DINE-IN too — a table cart is no longer destroyed by a mode switch.
  // 2026-09-27 (owner: "tab-a kecib geri qayitdim, masada eyni mavi border
  // qalib"): the restore is DATA-ONLY now. No re-selection, no auto-opened
  // order view — the floor comes back CLEAN (no ghost blue border); the
  // restored cart sits in state and the operator taps the table to
  // reconnect it (selectTable keeps the drafts — see below). The occupancy
  // guard stays: a table taken by another terminal invalidates the draft.
  const pendingTableGuardRef = useRef<number | null>(null);

  useEffect(() => {
    if (cart?.order_id) return;
    if (draftRestoredForRef.current.has(posMode)) return;
    const hasData = (c: any) => !!(c && ((c.items?.length || 0) > 0 || c.customer_name || c.customer_phone || c.delivery_address));
    if (hasData(cart)) return; // live cart already has work — nothing to restore
    try {
      const draft = sessionStorage.getItem(`pos_draft_${posMode}`);
      if (draft) {
        const parsed = JSON.parse(draft);
        if (parsed.posMode === posMode && parsed.version === 1 && parsed.cart && hasData(parsed.cart)) {
          if (posMode === 'dine_in' && parsed.cart.table_number) {
            // Table must still be free; otherwise another terminal owns it.
            const tbl = floors
              .flatMap((f: any) => f.tables || [])
              .find((x: any) => x.table_number === parsed.cart.table_number);
            if (tbl && !['empty', 'free'].includes(tbl.status)) {
              draftRestoredForRef.current.add(posMode);
              sessionStorage.removeItem(`pos_draft_${posMode}`);
              return;
            }
            if (!tbl) pendingTableGuardRef.current = parsed.cart.table_number;
          }
          setCart(parsed.cart);
          draftRestoredForRef.current.add(posMode);
        }
      }
    } catch {
      // ignore draft restore errors
    }
  }, [posMode, cart, floors]);

  // Deferred occupancy guard (floors may arrive after the draft was
  // restored): if the table got taken by another terminal meanwhile, the
  // stale draft is dropped — but NO table is ever auto-selected.
  useEffect(() => {
    const tn = pendingTableGuardRef.current;
    if (tn == null) return;
    const tbl = floors
      .flatMap((f: any) => f.tables || [])
      .find((x: any) => x.table_number === tn);
    if (!tbl) return;
    pendingTableGuardRef.current = null;
    if (!['empty', 'free'].includes(tbl.status)) {
      setCart((prev: any) => (prev && prev.table_number === tn && !prev.order_id ? null : prev));
      try { sessionStorage.removeItem(`pos_draft_${posMode}`); } catch {}
    }
  }, [floors, posMode]);

  useEffect(() => {
    if (!cart) return;
    if (cart.order_id) {
      // Order was sent (or loaded): the mode's draft is consumed.
      try { sessionStorage.removeItem(`pos_draft_${posMode}`); } catch {}
      draftRestoredForRef.current.add(posMode);
      return;
    }
    const hasData = (cart.items?.length || 0) > 0 || cart.customer_name || cart.customer_phone || cart.delivery_address;
    if (!hasData) {
      try { sessionStorage.removeItem(`pos_draft_${posMode}`); } catch {}
      return;
    }
    try {
      // Per-mode key (2026-09-22; dine-in extended 2026-09-27): each mode's
      // unsent work survives a tab switch and comes back on return.
      sessionStorage.setItem(`pos_draft_${posMode}`, JSON.stringify({ posMode, cart, version: 1 }));
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

    // 2026-09-27 (owner: ghost border after tab switch): "different table"
    // must also look at the CART (it is the item owner). After a data-only
    // draft restore (selectedTable=null, cart.table_number=1), tapping table
    // 1 is NOT a switch — its drafts must survive, not be discarded.
    const switchingToDifferentTable =
      selectedTable?.table_number !== table.table_number
      && cart?.table_number !== table.table_number;
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
            !isFinalOrderStatus(o.status)
        );

        if (primary) {
          const groupOrders = [
            primary,
            ...orders.filter(
              (o: any) =>
                o.merged_into === primary.id &&
                !isFinalOrderStatus(o.status)
            ),
          ];
          const groupIds = new Set(groupOrders.map((o: any) => o.id));

          const serverItems: any[] = [];
          // 2026-09-28 (owner: per-instance state machine — E2E defect #3):
          // the OLD load merged server rows by product_id+variant_id, so two
          // instances of the same product with DIFFERENT modifiers/notes/
          // allergens collapsed into ONE line (qty summed, first instance's
          // price × qty → cart 41.00 vs real order 35.00, Row B's modifiers +
          // allergen chip lost). Each server order_item IS one instance →
          // one cart line, no merge.
          for (const item of orderItems.filter((i: any) => groupIds.has(i.order_id))) {
            const mapped = {
              id: item.id,
              product_id: item.product_id,
              product_name: item.product_name,
              unit_price: item.unit_price,
              quantity: item.quantity,
              total_price: item.total_price,
              modifiers: typeof item.modifiers === 'string' ? JSON.parse(item.modifiers || '[]') : (item.modifiers || []),
              special_notes: item.special_notes || '',
              // 2026-09-28 (E2E defect #4, part 2): allergens + variant_id were
              // SILENTLY DROPPED by the load mapping — the DB carries them
              // (verified: order_items.allergens = ["fish"]) but every table
              // reload stripped them, so the red allergen chip (and the variant
              // identity) vanished after send→reopen.
              allergens: item.allergens ? (typeof item.allergens === 'string' ? JSON.parse(item.allergens || '[]') : item.allergens) : [],
              variant_id: item.variant_id || null,
              hold_until: item.hold_until || null,
              is_hold: !!item.hold_until,
              course: item.course || 'main',
              is_combo: !!item.is_combo_parent,
              combo_id: item.combo_group_id || null,
              sentQuantity: item.quantity,
              kitchen_status: item.kitchen_status || 'pending',
            };
            serverItems.push(mapped);
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
            // 2026-09-28 (per-instance): the old carry merged any draft into a
            // server row with the same product+variant — a NEW instance of the
            // same product (different modifiers) would inflate the sent row's
            // quantity. Now: a draft only re-attaches to a server row it
            // tracks (same server id — the "+ after send" case); every other
            // draft is its OWN line. Reference-dedup: draftItems (snapshot)
            // and prev.items can contain the same row objects.
            const draftSet = new Set<any>();
            if (carryDrafts) {
              for (const u of [...draftItems, ...prev.items.filter(i => (i.sentQuantity ?? 0) === 0)]) draftSet.add(u);
            }
            for (const u of draftSet) {
              if (u.id) {
                const found = merged.find((m: any) => m.id === u.id);
                if (found) {
                  found.quantity = Math.max(found.quantity, u.quantity);
                  found.total_price = found.unit_price * found.quantity;
                  continue;
                }
              }
              merged.push(u);
            }
            return {
              table_number: table.table_number,
              guest_count: primary.guest_count || table.guest_count || 1,
              items: merged,
              notes: primary.customer_note || '',
              order_type: primary.order_type || 'dine_in',
              order_id: primary.id,
              // 2026-09-25 (full-seat): guest identity + order number from the
              // existing order (waitlist Oturdur yazar customer_name/phone —
              // cart bunu göstərməli ki, "qonaq kimdir" tapşırıqda görünsün).
              customer_id: primary.customer_id || null,
              customer_name: primary.customer_name || null,
              customer_phone: primary.customer_phone || null,
              order_number: primary.order_number || null,
              serverTotal: serverTotal !== itemSum ? serverTotal : undefined,
            };
          });
        } else {
          // No active server order for this table. If the CART already holds
          // THIS table's drafts (data-only restore + tap), keep them — they
          // belong here. Only drafts of a DIFFERENT table get cleared.
          const draftsAreThisTables = cart?.table_number === table.table_number;
          setCart(prev => {
            if (!prev) return null;
            if (draftsAreThisTables) return prev;
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
        // U-3: the backend returns terse G_* guard codes — surface them
        // readably instead of toasting "G_MERGE_CHILD_NO_ORDER" (or nothing
        // visible at all, as the UI E2E found).
        const raw = data?.error || 'Merge failed';
        const mergeMsgMap: Record<string, string> = {
          G_MERGE_CHILD_NO_ORDER: t('merge_child_no_order'),
          G_MERGE_PARENT_NO_ORDER: t('merge_parent_no_order'),
          G_MERGE_SAME_TABLE: t('merge_same_table'),
          G_MERGE_TABLE_MERGED: t('merge_already_merged'),
          G_TABLE_RESERVED: t('merge_reserved'),
        };
        toast.error(mergeMsgMap[raw] || raw, { id: 'merge-error' });
        return null;
      }
      // Interpolate {tables} — the raw key leaked verbatim into the toast
      // (E2E 2026-09-21: "Masalar birləşdirildi: {tables}").
        const mergeToast = t('tables_merged').replace('{tables}', tableNumbers.join(' + '));
        setLastUndo({ action: 'merge', data: data.data?.undo, message: mergeToast });
        // Parent gets the merged-in flash; children are hidden on the floor
        // (visibleTables filters them), so flash the parent with all numbers.
        fetchFloor();
      return { action: 'merge' as const, data: data.data?.undo, message: mergeToast };
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
        const err = await res.json().catch(() => ({}));
        // 2026-09-26 (Task 51 freeze audit): no-fallback toast.error(err.error)
        // could toast undefined — friendly fallback.
        toast.error(err.error || t('transfer_failed'));
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

  // 2026-09-27 (owner: "OVERLAY NEVER"): op-flash removed — the table card
  // IS the operation feedback (border crossfade + label morph + settle +
  // layout glide). No label slaps onto the card.

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

  // U-2: release a fully-PAID table. dismissTable CANCELS active orders and
  // refuses paid-only tables (G_NO_ACTIVE_ORDER); release CLOSES the settled
  // orders and frees the table. Returns {ok, error?}.
  const releaseTable = async (num: number) => {
    return withOperationLock(`release_${num}`, async () => {
      const res = await apiFetch('/api/tables/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_number: num }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        markTableEmptyLocal([num]);
        fetchFloor();
        toast.success(t('table_cleared').replace('{table}', String(num)), { id: `release_${num}` });
        return { ok: true as const };
      }
      const raw = data?.error || 'Release failed';
      const map: Record<string, string> = {
        G_TABLE_HAS_ACTIVE_ORDERS: t('release_has_active_orders'),
        G_NO_PAID_ORDER: t('release_no_paid'),
        G_TABLE_RESERVED: t('release_reserved'),
        G_TABLE_MERGED: t('release_merged'),
      };
      toast.error(map[raw] || raw, { id: `release_${num}` });
      return { ok: false as const, error: raw };
    });
  };

  const dismissTable = async (num: number, opts?: { manager_pin?: string; reason?: string; terminal_id?: string | null }) => {
    return withOperationLock(`dismiss_${num}`, async () => {
      const res = await apiFetch('/api/orders/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_number: num, manager_pin: opts?.manager_pin || null, reason: opts?.reason || null, terminal_id: opts?.terminal_id ?? null }),
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
        const raw = String(err.error || '');
        const map: Record<string, string> = {
          G_DISMISS_ORDER_PAID: t('dismiss_paid_use_release'),
          G_DISMISS_KITCHEN_ACTIVE: t('dismiss_kitchen_active'),
        };
        toast.error(map[raw] || raw || t('table_clear_failed'));
      }
    });
  };

  const clearTable = async (num: number, opts?: { manager_pin?: string; reason?: string }) => {
    return withOperationLock(`clear_${num}`, async () => {
      const res = await apiFetch('/api/orders/clear-table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_number: num, terminal_id: terminalId, manager_pin: opts?.manager_pin || null, reason: opts?.reason || null }),
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
    opts?: { variantId?: string | null; notes?: string; modifiers?: PosModifierSelection[]; quantity?: number; editOf?: { identity?: string; lineIndex?: number }; course?: string | null; isHold?: boolean; allergens?: string[] }
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
    // EditOf: modal mövcud sətri redaktə edirdisə — həmin sətri əvəz edirik
    // (merge yox, count+ yox). Owner fix 2026-09-21: the exact tapped line is
    // the target (lineIndex), SENT lines included — the old "unsent only +
    // config-hash" lookup made edits of sent lines fall through to the merge
    // below (course/modifier change → quantity +1, config lost). Two
    // Philadelphias with different modifiers each keep their own line.
    if (opts?.editOf) {
      let target: (typeof items)[number] | undefined;
      if (typeof opts.editOf.lineIndex === 'number' && opts.editOf.lineIndex >= 0 && opts.editOf.lineIndex < items.length) {
        const li = opts.editOf.lineIndex;
        const cand = items[li];
        if (String(cand.product_id) === String(p.id) && !(cand as any).__isCombo) target = cand;
      }
      if (!target && opts.editOf.identity) {
        target = items.find(
          i => String(i.product_id) === String(p.id)
            && !(i.sentQuantity ?? 0)
            && cartLineKey(i.variant_id, i.special_notes, i.modifiers as any) === opts.editOf!.identity
        );
      }
      if (target) {
        const sentQty = (target as any).sentQuantity ?? 0;
        // A sent line can't be un-sent: the editable part is (qty − sentQty).
        const newQty = Math.max(addQty, sentQty);
        const replaced = {
          ...target,
          unit_price: unitPrice,
          original_unit_price: originalWithMods,
          quantity: newQty,
          total_price: Math.round(unitPrice * newQty * 100) / 100,
          modifiers: opts?.modifiers ?? [],
          variant_id: variantId,
          special_notes: opts?.notes ?? '',
          // Course/hold: only override when the modal carried them (a plain
          // re-add without course info must not wipe the line's course).
          ...(opts?.course !== undefined ? { course: opts.course } : {}),
          ...(opts?.isHold !== undefined ? { is_hold: opts.isHold } : {}),
          allergens: opts?.allergens ?? (target as any).allergens ?? [],
        };
        setCart({ ...base, items: items.map(i => (i === target ? replaced : i)) });
        return;
      }
    }
    // 2026-09-28 (owner: "modifikatorları hər məhsul instansiyası üçün
    // ayrıca idarə et"): NO auto-merge anymore — every tap creates its OWN
    // line instance with its own modifiers/notes/state. The +/- stepper grows
    // the instance's quantity; the per-line editor (editOf) rewrites ONLY that
    // instance.
    // 2026-09-30 (owner, round 9 — reverses the 8i no-merge for the SAFE case
    // only): a PLAIN tap whose spec is IDENTICAL to an existing line (same
    // product + variant + modifiers + notes + course + allergens) now
    // INCREMENTS that line instead of spawning a duplicate pill — the
    // "tap Tom Yam 4× = ×4" fix (owner: "×3 + ×1 olmasın, ×4 olsun"). A
    // MODIFIED line never merges with a plain tap (different key), so
    // per-instance modifier state is preserved — the 8i concern ("merge made
    // per-instance modifiers impossible") only ever applied to merging
    // DIFFERENT specs, which we still never do. Distinct instances are created
    // explicitly via the editor's "＋ Yeni sətir" button, not by tapping.
    {
      const addKey = cartLineKey(variantId, opts?.notes ?? '', (opts?.modifiers || []) as any);
      const addCourse = opts?.course !== undefined ? opts.course : null;
      const addAllergens = JSON.stringify(opts?.allergens ?? []);
      const existing = items.find((i: any) =>
        String(i.product_id) === String(p.id)
        && !i.__isCombo && !i.is_combo
        && cartLineKey(i.variant_id, i.special_notes, i.modifiers as any) === addKey
        && (i.course ?? null) === addCourse
        && JSON.stringify(i.allergens ?? []) === addAllergens
      );
      if (existing) {
        const sentQty = existing.sentQuantity ?? 0;
        const newQty = Math.max(existing.quantity + addQty, sentQty);
        setCart({
          ...base,
          items: items.map(i => i === existing
            ? { ...i, quantity: newQty, total_price: Math.round(i.unit_price * newQty * 100) / 100 }
            : i),
        });
        return;
      }
    }
    const newItem = {
      // client-side instance identity (stable React key + per-instance
      // targeting); server order_items ids are assigned on send.
      instance_id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `inst-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      product_id: p.id,
      product_name: p.name,
      unit_price: unitPrice,
      original_unit_price: originalWithMods,
      quantity: addQty,
      total_price: Math.round(unitPrice * addQty * 100) / 100,
        modifiers: opts?.modifiers ?? [],
        variant_id: variantId,
        special_notes: opts?.notes ?? '',
        allergens: opts?.allergens ?? [],
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

  // 2026-09-28 (owner: "eyni mehsul ayri-ayri qeyd olunmali deyil... modifikator
  // acanda surusdurme pilli tiktokdaki kimi"): ATOMIC multi-instance save.
  // The cart collapses same-product lines into ONE presented row and the modal
  // edits each instance through pill tabs. One setCart applies ALL instance
  // edits at once — N sequential addToCart(editOf) calls would lose
  // replacements (each reads the same stale cartRef snapshot, last write wins).
  // Per-instance price math mirrors the addToCart edit path exactly; unchanged
  // instances are skipped (no-op detection), so a save that only touched the
  // 2nd instance never rewrites the 1st.
  // 2026-09-28 (owner P2): "+" on a SPEC'D (modifiers/notes/allergens) or SENT
  // instance creates a NEW independent instance — a fresh line (own
  // instance_id, qty 1, unsent) that COPIES the source spec. The old
  // qty+1-on-the-same-line merged one modifier set across ALL units
  // ("modifikatorlar bütün instansiyalar üçün birləşir"); now each instance is
  // independently editable (its own pill tab / cart line). Plain
  // (no-modifier, no-note) instances still grow qty on the same line
  // (normal POS: 3× çay = 1 line).
  const cloneInstance = (lineIndex: number): boolean => {
    const base = cartRef.current;
    if (!base) return false;
    const src: any = base.items[lineIndex];
    if (!src || src.__isCombo || src.is_combo) return false;
    const p = products.find(x => x.id === src.product_id);
    if (!p) return false;
    const srcMods: any[] = src.modifiers || [];
    const modsTotal = srcMods.reduce((s, m) => s + Number(m.price || 0) * (m.quantity || 1), 0);
    const variant = src.variant_id
      ? (variantsByProduct[p.id] || []).find((v: any) => v.id === src.variant_id)
      : undefined;
    // Same price math as addToCart (variant base − campaign amount; no-variant
    // → effective_price with the campaign baked in).
    const basePrice = variant
      ? Number(variant.discount_price != null && variant.discount_price !== '' ? variant.discount_price : variant.price)
      : (p.price ?? 0);
    const effective: any = (p as any).effective_price;
    const effNum = typeof effective === 'number' ? effective : effective?.effective_price;
    const campaignDiscountAmt = typeof effective === 'object' && effective ? Number(effective.discount_amount) || 0 : 0;
    const productUnit = variant
      ? (campaignDiscountAmt > 0 ? Math.max(0, basePrice - campaignDiscountAmt) : basePrice)
      : (effNum ?? basePrice);
    const unit = Math.round((productUnit + modsTotal) * 100) / 100;
    const items = base.items.map(i => ({ ...i }));
    items.splice(lineIndex + 1, 0, {
      instance_id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `inst-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      product_id: p.id,
      product_name: p.name,
      unit_price: unit,
      original_unit_price: Math.round((basePrice + modsTotal) * 100) / 100,
      quantity: 1,
      total_price: unit,
      modifiers: srcMods.map((m: any) => ({ ...m })),
      variant_id: src.variant_id ?? null,
      special_notes: src.special_notes || '',
      allergens: Array.isArray(src.allergens) ? [...src.allergens] : [],
      course: src.course ?? null,
      campaign_id: src.campaign_id ?? null,
      campaign_discount_amount: src.campaign_discount_amount ?? 0,
      campaign_discount_type: src.campaign_discount_type ?? null,
    } as any);
    setCart({ ...base, items });
    return true;
  };

  const applyInstanceEdits = (
    p: PosProduct,
    edits: {
      lineIndex: number;
      /** 2026-09-28 (owner P2): a NEW instance created by the modal's Miqdar +
          on a spec'd/sent instance — appended as a fresh cart line. */
      isNew?: boolean;
      /** Fallback identity (cartLineKey) when lineIndex is stale/missing. */
      identity?: string;
      quantity?: number;
      variantId?: string | null;
      notes?: string;
      modifiers?: PosModifierSelection[];
      course?: string | null;
      isHold?: boolean;
      allergens?: string[];
    }[],
  ) => {
    const base = cartRef.current;
    if (!base) return;
    const items = base.items.map(i => ({ ...i }));
    let touched = 0;
    // 2026-09-28 (owner P1: "sonradan edilən modifikator dəyişiklikləri ayrıca
    // mətbəxə göndərilməlidir"): spec changes on ALREADY-SENT lines are synced
    // to the server via updateItem — the KDS reads order_items live, so the
    // kitchen ticket updates immediately. (Previously the change stayed local,
    // the next send hit "Yeni məhsul yoxdur" (delta=0), and a re-select
    // reverted the line to the server's old spec.)
    const specSyncs: { itemId: string; data: Record<string, any> }[] = [];
    for (const e of edits || []) {
      if (typeof e.lineIndex !== 'number') continue;
      // ── NEW instance (modal Miqdar + on a spec'd/sent instance) ──────────
      if (e.isNew) {
        const nextMods: any[] = e.modifiers || [];
        const variant = (e.variantId ?? null)
          ? (variantsByProduct[p.id] || []).find((v: any) => v.id === e.variantId)
          : undefined;
        const basePrice = variant ? Number(variant.discount_price != null && variant.discount_price !== '' ? variant.discount_price : variant.price) : (p.price ?? 0);
        const effective: any = (p as any).effective_price;
        const effNum = typeof effective === 'number' ? effective : effective?.effective_price;
        const campaignDiscountAmt = typeof effective === 'object' && effective ? Number(effective.discount_amount) || 0 : 0;
        const productUnit = variant
          ? (campaignDiscountAmt > 0 ? Math.max(0, basePrice - campaignDiscountAmt) : basePrice)
          : (effNum ?? basePrice);
        const modifiersTotal = nextMods.reduce((s, m) => s + Number(m.price || 0) * (m.quantity || 1), 0);
        const unit = Math.round((productUnit + modifiersTotal) * 100) / 100;
        const qty = Math.max(1, Number(e.quantity) || 1);
        items.push({
          instance_id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `inst-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          product_id: p.id,
          product_name: p.name,
          unit_price: unit,
          original_unit_price: Math.round((basePrice + modifiersTotal) * 100) / 100,
          quantity: qty,
          total_price: Math.round(unit * qty * 100) / 100,
          modifiers: nextMods,
          variant_id: e.variantId ?? null,
          special_notes: e.notes || '',
          allergens: e.allergens || [],
          ...(e.course != null ? { course: e.course } : {}),
        } as any);
        touched++;
        continue;
      }
      // ── EXISTING line replacement ────────────────────────────────────────
      let li = typeof e.lineIndex === 'number' ? e.lineIndex : -1;
      if (li < 0 || li >= items.length) {
        // Stale index (cart shifted while the modal was open) → fall back to
        // the identity (cartLineKey) of the SAME product's unsent line.
        if (e.identity) {
          li = items.findIndex((i: any) =>
            String(i.product_id) === String(p.id) && !i.__isCombo && !i.is_combo
            && (i.sentQuantity ?? 0) === 0
            && cartLineKey(i.variant_id, i.special_notes, i.modifiers as any) === e.identity
          );
        }
        if (li < 0 || li >= items.length) continue;
      }
      const target: any = items[li];
      if (!target || String(target.product_id) !== String(p.id) || target.__isCombo || target.is_combo) continue;
      const prevMods: any[] = target.modifiers || [];
      const nextMods: any[] = e.modifiers || [];
      const modKey = (m: any) => `${m.id}:${m.quantity || 1}`;
      const modsChanged = prevMods.map(modKey).sort().join('|') !== nextMods.map(modKey).sort().join('|');
      const variantChanged = e.variantId !== undefined && (target.variant_id ?? null) !== (e.variantId ?? null);
      const noteChanged = e.notes !== undefined && (target.special_notes ?? '') !== e.notes;
      const courseChanged = e.course !== undefined && (target.course ?? null) !== (e.course ?? null);
      const holdChanged = e.isHold !== undefined && !!target.is_hold !== !!e.isHold;
      const allergensChanged = e.allergens !== undefined && JSON.stringify(target.allergens ?? []) !== JSON.stringify(e.allergens);
      const sentQty = target.sentQuantity ?? 0;
      const newQty = e.quantity != null ? Math.max(e.quantity, sentQty) : target.quantity;
      const qtyChanged = newQty !== target.quantity;
      if (!modsChanged && !variantChanged && !noteChanged && !courseChanged && !holdChanged && !allergensChanged && !qtyChanged) continue;
      let unit: number = target.unit_price;
      let orig: number = target.original_unit_price;
      if (modsChanged || variantChanged) {
        // Same math as addToCart (variant base − campaign amount; no-variant →
        // effective_price with the campaign baked in; modifiers on both unit
        // and original so discount math stays intact).
        const variant = (e.variantId ?? null)
          ? (variantsByProduct[p.id] || []).find((v: any) => v.id === e.variantId)
          : undefined;
        const basePrice = variant ? Number(variant.discount_price != null && variant.discount_price !== '' ? variant.discount_price : variant.price) : (p.price ?? 0);
        const effective: any = (p as any).effective_price;
        const effNum = typeof effective === 'number' ? effective : effective?.effective_price;
        const campaignDiscountAmt = typeof effective === 'object' && effective ? Number(effective.discount_amount) || 0 : 0;
        const productUnit = variant
          ? (campaignDiscountAmt > 0 ? Math.max(0, basePrice - campaignDiscountAmt) : basePrice)
          : (effNum ?? basePrice);
        const modifiersTotal = nextMods.reduce((s, m) => s + Number(m.price || 0) * (m.quantity || 1), 0);
        unit = Math.round((productUnit + modifiersTotal) * 100) / 100;
        orig = Math.round((basePrice + modifiersTotal) * 100) / 100;
      }
      items[li] = {
        ...target,
        unit_price: unit,
        original_unit_price: orig,
        quantity: newQty,
        total_price: Math.round(unit * newQty * 100) / 100,
        ...(modsChanged ? { modifiers: nextMods } : {}),
        ...(variantChanged ? { variant_id: e.variantId ?? null } : {}),
        ...(noteChanged ? { special_notes: e.notes } : {}),
        ...(courseChanged ? { course: e.course } : {}),
        ...(holdChanged ? { is_hold: e.isHold } : {}),
        ...(allergensChanged ? { allergens: e.allergens } : {}),
      };
      touched++;
      // Spec-only change on a SENT line (no qty delta): sync to the kitchen.
      // When qty also changed, the unsent delta goes out as a fresh append on
      // the next send carrying the new spec — the already-sent portion keeps
      // the spec it was made with (correct: those units are in production).
      if (
        target.id && !qtyChanged && base.order_id &&
        (modsChanged || variantChanged || noteChanged || courseChanged || allergensChanged)
      ) {
        specSyncs.push({
          itemId: target.id,
          data: {
            order_item_id: target.id,
            unit_price: unit,
            quantity: newQty,
            ...(modsChanged ? { modifiers: nextMods } : {}),
            ...(variantChanged ? { variant_id: e.variantId ?? null } : {}),
            ...(noteChanged ? { special_notes: e.notes } : {}),
            ...(courseChanged ? { course: e.course } : {}),
            ...(allergensChanged ? { allergens: e.allergens } : {}),
          },
        });
      }
    }
    if (touched > 0) setCart({ ...base, items });
    if (specSyncs.length > 0 && base.order_id) {
      let ok = 0;
      let done = 0;
      for (const s of specSyncs) {
        apiFetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'updateItem', id: base.order_id, data: s.data }),
        })
          .then(r => r.json().catch(() => null))
          .then(d => { if (d?.success !== false) ok++; })
          .catch(() => {})
          .finally(() => {
            done++;
            if (done === specSyncs.length) {
              if (ok > 0) toast.success('Mətbəx yeniləndi', { id: 'spec-sync-toast', duration: 2200 });
              else toast.error('Mətbəx yenilənə bilmədi — sifəri yenidən yoxlayın', { id: 'spec-sync-toast', duration: 3200 });
            }
          });
      }
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

  // 2026-09-28 (owner: "avtomatik hesab berbat işləyir"): LOCAL-ONLY optimistic
  // patch of one table row (bill chip / status flip in the same frame). The
  // authoritative fetchFloor('manual') right after the API call reconciles.
  const patchFloor = (tableNumber: number, patch: Record<string, any>) => {
    setFloors(prev => (prev || []).map(f => ({
      ...f,
      tables: (f.tables || []).map((tb: any) => (tb.table_number === tableNumber ? { ...tb, ...patch } : tb)),
    })));
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

  // 409 / CONCURRENCY_CONFLICT recovery: the table's order changed under us
  // (another terminal, or a KDS/bill-request trigger on this one). Re-pull the
  // floor and re-select the table so the cart now points at the FRESH order —
  // the next send merges into it instead of 409ing again.
  const recoverFromConflict = () => {
    const num = cartRef.current?.table_number;
    if (num == null) return;
    (async () => {
      try {
        const r = await fetch('/api/pos/tables', { cache: 'no-store' });
        if (!r.ok) return;
        const data = await r.json();
        const tbl = (data.floors || []).find((x: any) => x.table_number === num);
        if (tbl) selectTable(tbl, { force: true });
      } catch { /* floor polling will heal */ }
    })();
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
    if (!cart || placingOrder || placingRef.current) {
      console.log('[placeOrder] early return', { cart: !!cart, placingOrder, placingRef: placingRef.current });
      return;
    }
    placingRef.current = true; // synchronous — blocks a double-tap before re-render
    setPlacingOrder(true);
    try {
      // 2026-09-28 (per-instance): keep the ITEM refs of the rows that pass
      // the send filter — the post-send reconciliation must match by INSTANCE
      // identity, not by product+variant key. (Old key-based reconciliation
      // would also mark a HELD row of the same product as sent when its twin
      // went out — sentQuantity would freeze the held instance.)
      const pendingRows = cart.items
        .map(i => ({
          item: i,
          delta: Math.max(0, (i.quantity || 0) - (i.sentQuantity || 0)),
        }))
        .filter(x => x.delta > 0 && !(x.item as any).is_hold);
      const sentIdentity = new Set(
        pendingRows.map(x =>
          (x.item as any).instance_id ?? (x.item as any).id ??
          `${x.item.product_id}__${x.item.variant_id || ''}__${x.item.is_combo ? 'c' : 'p'}`
        )
      );
      const unsent = pendingRows
        .map(x => ({
          product_id: x.item.product_id,
          product_name: x.item.product_name,
          unit_price: x.item.unit_price,
          quantity: x.delta,
           modifiers: x.item.modifiers || [],
           special_notes: x.item.special_notes || '',
           allergens: (x.item as any).allergens || null,
           variant_id: x.item.variant_id || null,
           course: (x.item as any).course || 'main',
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
          // 2026-09-28 (owner P1): a spec-only edit on an already-sent instance
          // is synced to the kitchen at SAVE time (applyInstanceEdits →
          // updateItem, "Mətbəx yeniləndi" toast) — so by the time the user
          // presses SEND here, everything is already in the kitchen. A neutral
          // "yeni məhsul yoxdur" read as an ERROR to the owner; give a
          // confirmatory success instead (held items still get the plain hint).
          const anyHeld = cart.items.some((i: any) => i.is_hold || i.hold_until);
          if (anyHeld) {
            toast(t('no_new_products'), { id: 'action-toast' });
          } else {
            toast.success(t('all_already_in_kitchen') || 'Yeni məhsul yoxdur — bütün sifariş artıq mətbəxdədir', { id: 'action-toast' });
          }
        }
        setActiveView('floor');
        return;
      }

      // Reuse the table's existing active order (e.g. a reservation draft) instead
      // of creating a 2nd active order, which would violate idx_orders_active_table.
      // For takeaway/delivery: use cart.order_id if already created via modal
      let activeOrderId: string | null = cart.order_id || null;

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
      // Quick-fix 4: validated coupon → order-level discount. The server
      // subtracts it exactly once (create) / re-applies it on item-sum
      // recomputes (addItems) and stamps the order with the campaign_id.
      const coupon = (cart as any).coupon;
      const orderBody = JSON.stringify(
          activeOrderId
            ? { action: 'addItems', id: activeOrderId, items: unsent, terminal_id: terminalId, ...(coupon ? { coupon: { campaign_id: coupon.campaign_id, amount: coupon.discount_amount } } : {}) }
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
                  // Quick-fix 4: a validated coupon is the order-level
                  // discount (exclusive with auto item-campaigns — the UI
                  // refuses to apply a coupon when items already carry a
                  // campaign, so these cannot coexist here).
                  discount_amount: coupon ? coupon.discount_amount : computedDiscount.amount,
                  discount_type: coupon ? 'coupon' : computedDiscount.type,
                  campaign_id: coupon ? coupon.campaign_id : (campaign?.id || null),
                 is_rush: false,
                 payment_method: checkoutOverrides?.payment_method || null,
                 }
      );
      // ONE retry on 5xx ONLY. A 5xx from /api/orders means the server's
      // Supabase call threw (e.g. the intermittent pooler TLS reset) — the
      // order was NOT created, so a retry is safe and cannot duplicate items.
      // A client-side network throw is ambiguous (the order may have landed),
      // so we do NOT auto-retry that — we surface a clear error instead.
      const doOrderFetch = () => apiFetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: orderBody,
      });
      let res: Response = await doOrderFetch();
      if (!res.ok && res.status >= 500 && res.status <= 599) {
        console.warn('[placeOrder] 5xx server failure, retrying once', res.status);
        await new Promise(r => setTimeout(r, 300));
        res = await doOrderFetch();
      }
      let createdOrderId: string | null = null;
      console.log('[placeOrder] API response', { status: res.status, ok: res.ok });
      if (res.ok) {
        const data = await res.json();
        // CRITICAL: /api/orders returns HTTP 200 even on business failure
        // ({success:false, error}). Without this check the UI toasted
        // "order sent" for an order that was never created — the exact
        // "seated but no order" state dismiss/merge then hit.
          if (data?.success === false) {
            if (data?.error === 'CONCURRENCY_CONFLICT') {
              toast.error(t('order_changed_by_other_terminal'), { id: 'action-toast' });
              recoverFromConflict();
            } else {
              // Delivery Phase 2: friendly text for the server-side delivery
              // gates (the client gate in page.tsx usually blocks first).
              toast.error(deliveryGateMsg(data?.error) || data?.error || t('order_not_sent'), { id: 'action-toast' });
            }
          fetchFloor().catch(() => {});
          return;
        }
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
        // Instance-identity reconciliation (see sentIdentity above).
        setCart(prev => {
          if (!prev) return null;
          return {
            ...prev,
            order_id: createdOrderId,
            items: prev.items.map(i => {
              const ident = (i as any).instance_id ?? (i as any).id ??
                `${i.product_id}__${i.variant_id || ''}__${i.is_combo ? 'c' : 'p'}`;
              if (!sentIdentity.has(ident)) return i;
              const newSent = Math.min(i.quantity, (i.sentQuantity || 0) + (i.quantity - (i.sentQuantity || 0)));
              return { ...i, sentQuantity: Math.max(i.sentQuantity || 0, newSent) };
            })
          };
        });

         // pr v1: kitchen ticket — enqueue ONE ticket per order (trigger
         // 'kitchen' is idempotent per order). Appends don't re-print
         // automatically — reprint from KDS / order history. Fire-and-forget:
         // print routing must never block the order flow.
         if (createdOrderId && unsent.length > 0) {
           fetch('/api/print/enqueue', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             credentials: 'include',
             body: JSON.stringify({
               doc_type: 'kitchen',
               order_id: createdOrderId,
               trigger_key: 'kitchen',
               payload: {
                 table: cart.table_number,
                 orderNumber: data.data?.order_number ?? data.order_number ?? null,
                 items: unsent.map((u) => ({
                   name: u.product_name || 'Məhsul',
                   quantity: u.quantity, // already the unsent delta
                   note: u.special_notes || null,
                   course: u.course || null,
                 })),
                 note: cart.notes || null,
                 staffName: null,
                 date: new Date().toLocaleDateString('az-AZ'),
                 time: new Date().toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' }),
               },
             }),
           }).catch(() => {});
         }

         if (posMode !== 'dine_in') {
           setCart(prev => prev ? { ...prev, items: [] } : null);
         }
         setActiveView('floor');
         fetchFloor().catch(() => {});
      } else {
        const err = await res.json().catch(() => ({}));
        if (res.status === 409) {
          if (err?.conflict) {
            // Full second-writer diagnostics available → show the dialog
            // (which channel wrote: KDS/BDSD, QR self-order, 2nd tab, other POS).
            setConflictInfo(err.conflict);
          } else {
            toast.error(t('order_changed_by_other_terminal'), { id: 'action-toast' });
          }
          recoverFromConflict();
        } else if (res.status === 401) {
          // Staff session died mid-action (was previously masked by the
          // middleware's 307→HTML redirect, leaving a "seated but no order"
          // table). Be explicit so the user re-logs in instead of retrying.
          toast.error(t('session_expired') || 'Session expired — log in again', { id: 'action-toast', duration: 6000 });
          window.dispatchEvent(new CustomEvent('pos:unauthorized'));
        } else {
          // Delivery Phase 2: friendly delivery-gate text (403 DELIVERY_PAUSED /
          // DELIVERY_DISABLED, 422 DELIVERY_MIN_ORDER) instead of the raw code.
          toast.error(deliveryGateMsg(err.error) || err.error || t('order_not_sent'), { id: 'action-toast' });
        }
        // Refresh to clear any stale state so the user sees current server data
        fetchFloor().catch(() => {});
      }
     } catch (e: any) {
      console.error('[placeOrder] failed:', e);
      toast.error(e.message || t('order_not_sent'), { id: 'action-toast' });
    } finally {
      placingRef.current = false;
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
      // Same first-tap race as the dine-in path below (see the BUG B note there):
      // drop the mode's draft synchronously whenever the cart ends up dataless,
      // so the restore effect (which is declared above the persist effect) can
      // never resurrect the items we just cleared.
      if (
        keptItems.length === 0
        && !current.customer_name
        && !current.customer_phone
        && !current.delivery_address
      ) {
        try { sessionStorage.removeItem(`pos_draft_${posMode}`); } catch {}
      }
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

    // 2026-09-27 BUG B FIX (owner: "TƏMİZLƏ-yə ilk basışda heç nə olmur,
    // ikinci basışda işləyir") — ROOT CAUSE: an effect ORDERING race, not the
    // click. The draft-restore effect is declared ABOVE the draft-persist
    // effect, so in the very commit that this clear commits, restore runs
    // FIRST: it sees "live cart has no data", reads `pos_draft_<mode>` out of
    // sessionStorage — which still holds the pre-clear draft, because the
    // persist effect (the one that removes the key when the cart goes empty)
    // only runs LATER in that same commit — and writes the just-cleared items
    // straight back with `setCart(parsed.cart)`. So tap #1 looked like a no-op
    // and tap #2 stuck (by then `draftRestoredForRef` already had this mode, so
    // restore short-circuits). Dropping the key SYNCHRONOUSLY here makes the
    // restore find nothing — deterministic on the first tap.
    // NOTE: the key is dropped only when the cart ends up dataless, mirroring
    // the persist effect's own `hasData()` predicate, so a cart that still
    // holds a customer/address keeps its draft.
    if (
      keptItems.length === 0
      && !current.customer_name
      && !current.customer_phone
      && !current.delivery_address
    ) {
      try { sessionStorage.removeItem(`pos_draft_${posMode}`); } catch {}
    }
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

  const updateCartCustomer = (customerId: string | null, customerName: string | null, customerPhone?: string | null) => {
    // Customer linking: keep the phone unless a new one is explicitly passed
    // (the linked-customer pickers send id+name+phone from the shared source).
    setCart(prev => prev ? {
      ...prev,
      customer_id: customerId,
      customer_name: customerName,
      customer_phone: customerPhone !== undefined ? customerPhone : (prev.customer_phone ?? null),
    } : null);
  };

  const switchMode = (mode: 'dine_in' | 'takeaway' | 'delivery') => {
    // QA bug 3 (2026-09-22): the old code carried the PREVIOUS mode's cart
    // (items + order_id!) across the tab switch, so a takeaway session could
    // silently keep a dine-in order bound (or vice versa). Each mode now
    // starts clean; per-mode unsent work is preserved by the pos_draft_*
    // sessionStorage mechanism — 2026-09-27 (owner: "sebet itir"): ALL modes
    // incl. dine-in (the draft is saved by the persistence effect BEFORE the
    // cart is cleared, so the switch itself never loses items).
    // 2026-09-27: allow re-restore when the user comes BACK to a mode
    // (the one-shot guard is cleared for the mode being left).
    setPosMode(prev => {
      if (prev !== mode) draftRestoredForRef.current.delete(prev);
      return mode;
    });
    setSelectedTable(null);
    setCart(null);
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
        course: item.course || 'main',
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
      order_number: order.order_number || null,
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
        const res = await apiFetch('/api/rpc/create_takeaway_order', {
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
        const res = await apiFetch('/api/rpc/create_delivery_order', {
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
      floors, products, categories, combos, variantsByProduct, loading, floorLoadFailed, catalogLoadFailed, placingOrder, selectedTable, cart, cartHydrating, activeView, lastUndo, posMode,
      fetchData, fetchFloor, patchFloor, selectTable, mergeTables, transferTable, dismissTable, releaseTable, clearTable, performUndo, seatTable,
      setActiveView, setCart, setSelectedTable, addToCart, applyInstanceEdits, cloneInstance, addComboToCart, updateCartItemQty, placeOrder, clearCart, resetCart, updateGuestCount,
      updateCartCustomer, updateOrderType, switchMode, getAutoCampaign, setPosMode, initializeTakeawayCart, createOrderShell, loadOrderIntoCart,
      reservationMode, reservationId, reservationPreOrderItems, reservationInfo,
      enterReservationMode, exitReservationMode, guestArrived, savePreOrder, terminalId,
      expandedProductId, setExpandedProductId,
      conflictInfo, setConflictInfo
    };
}
