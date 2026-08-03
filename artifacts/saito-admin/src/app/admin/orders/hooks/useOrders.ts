'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import type { Order } from '../types';
import { CACHE_KEY, DEFAULT_TABLE_COUNT, SETTINGS_CACHE_KEY } from '../utils';


/* ─── Extract readable message from any error type ─── */
function errMsg(e: unknown): string {
  if (!e) return 'Unknown error';
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  const obj = e as Record<string, unknown>;
  return (obj.message as string) || (obj.details as string) || (obj.hint as string) || JSON.stringify(obj);
}

/* ─── Atomic state+cache helper (used by all mutating operations) ─── */
function applyOrdersUpdate(prev: Order[], updater: (o: Order[]) => Order[]): Order[] {
  const next = updater(prev);
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch {}
  return next;
}

export function useOrders() {
  const { t } = useLanguage();

  /* ─── Orders state ─── */
  const [orders, setOrders] = useState<Order[]>([]);
  const [tableStatuses, setTableStatuses] = useState<any[]>([]);

  const [loading, setLoading]             = useState(true);
  const [tableCount, setTableCount]       = useState<number>(DEFAULT_TABLE_COUNT);
  const [delayThreshold, setDelayThreshold] = useState<number>(20);
  const [isOnline, setIsOnline]           = useState(true);
  const [openingHours, setOpeningHours]   = useState<string>('');

  /* ─── UI state that belongs to the page, not the hook ─── */
  const [selectedOrder, setSelectedOrder]   = useState<Order | null>(null);
  const [manualTableNum, setManualTableNum] = useState<number | null>(null);
  const [updatedLabels, setUpdatedLabels]   = useState<Map<string, string>>(new Map());
  const [flashIds, setFlashIds]             = useState<Set<string>>(new Set());
  const [confirmedIds, setConfirmedIds]     = useState<Set<string>>(new Set());
  const [, setTick]                         = useState(0);
  const [staleDismissed, setStaleDismissed] = useState(false);
  const prevStaleKey                        = useRef<string>('');
  const fetchOrdersRef                      = useRef<(showLoading?: boolean) => Promise<void>>(async () => {});

  /* ─── Fetch ─── */
  const fetchOrders = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const res = await fetch('/api/orders');
      if (!res.ok) throw new Error('API xətası');
      const data = await res.json();
      
      // Merge orders with order_items
      const ordersWithItems = (data.orders || []).map((order: any) => ({
        ...order,
        order_items: (data.orderItems || []).filter((item: any) => item.order_id === order.id),
      }));
      
      setOrders(ordersWithItems);
      if (data.tableStatuses) setTableStatuses(data.tableStatuses);
      if (data.tableCount > 0) setTableCount(data.tableCount);
      setDelayThreshold(data.delayThreshold || 20);
      setOpeningHours(data.openingHours || '09:00-23:00');
      setSelectedOrder(prev => {
        if (!prev) return null;
        return ordersWithItems.find((o: Order) => o.id === prev.id) || null;
      });
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(ordersWithItems)); } catch {}
    } catch (e: unknown) {
      toast.error(`${t('error')}: ${errMsg(e)}`, { id: 'action-toast' });
    } finally {
      setLoading(false);
    }
  }, [t]);

  fetchOrdersRef.current = fetchOrders;

  /* ─── Initial load + realtime ─── */
  useEffect(() => {
    const hasCache = (() => { try { return !!localStorage.getItem(CACHE_KEY); } catch { return false; } })();
    if (hasCache) {
      // Show cached data instantly, fetch fresh in background without spinner
      setLoading(false);
      fetchOrdersRef.current(false);
    } else {
      fetchOrdersRef.current(true);
    }

    /* Debounce 1000ms - CPU yükünü azaltmaq üçün */
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fetchOrdersRef.current(false), 1000);
    };

    const channel = createRealtimeChannel('orders_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, debouncedFetch)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_items' }, debouncedFetch)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'order_items' }, debouncedFetch)
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      removeRealtimeChannel(channel);
    };
  }, []);

  /* ─── Settings (table count + delay threshold) ─── */
  useEffect(() => {
    let isMounted = true;
    const loadSettings = async () => {
      const { data: rows } = await supabase
        .from('settings')
        .select('qr_table_count, order_delay_minutes, opening_hours')
        .limit(1);
      if (!isMounted) return;
      const row = rows?.[0];
      if (!row) return; // no row — keep cached values, don't overwrite with defaults
      const n = Number(row.qr_table_count);
      const d = Number(row.order_delay_minutes);
      if (!Number.isNaN(n) && n >= 1 && n <= 200) setTableCount(n);
      if (!Number.isNaN(d) && d >= 1) setDelayThreshold(d);
      if (row.opening_hours) setOpeningHours(row.opening_hours);
      const finalCount = (!Number.isNaN(n) && n >= 1 && n <= 200) ? n : undefined;
      const finalDelay = (!Number.isNaN(d) && d >= 1) ? d : undefined;
      if (finalCount !== undefined || finalDelay !== undefined) {
        try {
          const existing = (() => { try { const r = localStorage.getItem(SETTINGS_CACHE_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; } })();
          localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify({ ...existing, ...(finalCount !== undefined && { tableCount: finalCount }), ...(finalDelay !== undefined && { delayThreshold: finalDelay }) }));
        } catch {}
      }
    };
    loadSettings();

    const channel = createRealtimeChannel('orders_table_count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, loadSettings)
      .subscribe();

    return () => {
      isMounted = false;
      removeRealtimeChannel(channel);
    };
  }, []);

  /* ─── Online/offline ─── */
  useEffect(() => {
    const up   = () => { setIsOnline(true);  toast.success(t('connection_restored'), { id: 'connection-toast' }); };
    const down = () => { setIsOnline(false); toast.error(t('connection_lost'), { id: 'connection-toast' }); };
    window.addEventListener('online',  up);
    window.addEventListener('offline', down);
    setIsOnline(navigator.onLine);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, [t]);

  /* ─── Polling fallback (hər 10s) — realtime işləməsə də data təzə qalır ─── */
  useEffect(() => {
    const id = setInterval(() => fetchOrdersRef.current(false), 10_000);
    return () => clearInterval(id);
  }, []);

  /* ─── Tick (60s) for timeAgo refresh ─── */
  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  /* ─── Action handlers — all mutations routed through API/RPC ─── */

  const handleConfirm = useCallback(async (id: string) => {
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id, data: { status: 'confirmed' } }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Update failed');
      setUpdatedLabels(prev => { const n = new Map(prev); n.set(id, t('updated').toUpperCase()); return n; });
      setFlashIds(prev => new Set(prev).add(id));
      toast.success(t('updated'), { id: 'action-toast' });
      await fetchOrders(false);
    } catch (e: unknown) {
      toast.error(`${t('error')}: ${errMsg(e)}`, { id: 'action-toast' });
    }
  }, [fetchOrders, t]);

  const handlePay = useCallback(async (order: Order, paymentMethod?: string, tipAmount?: number) => {
    try {
      const { data: children } = await supabase
        .from('orders').select('id').eq('merged_into', order.id);
      const childIds = (children || []).map((c: any) => c.id);
      const allIds = [order.id, ...childIds];
      // Optimistic remove from UI
      setOrders(prev => applyOrdersUpdate(prev, o => o.filter(x => !allIds.includes(x.id))));

      // Route through API — RPC handles lock, validation, stock, table release
      const res = await apiFetch('/api/orders/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: order.id,
          payment_method: paymentMethod || 'card',
          cash_amount: order.total_amount || 0,
          card_amount: 0,
          tip_amount: tipAmount || 0,
        }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Payment failed');
      }

      toast.success(t('order_paid'), { id: 'action-toast' });
      setTimeout(() => fetchOrders(false), 200);
    } catch (e: unknown) {
      toast.error(`${t('error')}: ${errMsg(e)}`, { id: 'action-toast' });
      fetchOrders(false);
    }
  }, [fetchOrders, t, setOrders]);

  const handleStartPreparing = useCallback(async (id: string) => {
    try {
      const now = new Date().toISOString();
      // Use RPC — the transaction layer, not direct REST
      const { error } = await supabase.rpc('prepare_order_items', { p_order_id: id });
      if (error) throw error;
      setOrders(prev => prev.map(o => o.id === id ? { ...o, kitchen_status: 'preparing', status: 'confirmed', kitchen_accepted_at: now } : o));
    } catch (e: unknown) {
      toast.error(`${t('error')}: ${errMsg(e)}`, { id: 'action-toast' });
    }
  }, [t, setOrders]);

  const handleMarkReady = useCallback(async (id: string) => {
    try {
      // Use RPC — FOR UPDATE, deducts stock, maintains audit
      const { error } = await supabase.rpc('mark_order_ready', { p_order_id: id });
      if (error) throw error;
      setOrders(prev => prev.map(o => o.id === id ? { ...o, kitchen_status: 'ready', kitchen_ready_at: new Date().toISOString() } : o));
    } catch (e: unknown) {
      toast.error(`${t('error')}: ${errMsg(e)}`, { id: 'action-toast' });
    }
  }, [t, setOrders]);

  const handleDeleteOrder = useCallback(async (id: string) => {
    try {
      // Soft-delete via API (action=delete sets status=cancelled)
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Delete failed');
      toast.success(t('order_deleted'), { id: 'action-toast' });
      setOrders(prev => prev.filter(o => o.id !== id));
    } catch (e: unknown) {
      toast.error(`${t('error')}: ${errMsg(e)}`, { id: 'action-toast' });
    }
  }, [t]);

  const handleClearTable = useCallback(async (tableNum: number) => {
    try {
      // RPC — FOR UPDATE, reverses stock, cancels orders, releases table
      const { error } = await supabase.rpc('cancel_table_orders', { p_table_number: tableNum });
      if (error) throw error;

      // Optimistic remove from UI
      setOrders(prev => applyOrdersUpdate(prev, o => o.filter(x => x.table_number === tableNum)));
      toast.success(t('table_cleared').replace('{table}', String(tableNum)), { id: 'action-toast' });

      setTimeout(() => fetchOrders(false), 500);
    } catch (e: unknown) {
      const msg = errMsg(e);
      toast.error(`${t('error')}: ${msg}`, { id: 'action-toast' });
      fetchOrders(false);
    }
  }, [fetchOrders, t, setOrders]);

  const handleMergeOrders = useCallback(async (sourceId: string, targetId: string) => {
    const sourceOrder = orders.find(o => o.id === sourceId);
    const targetOrder = orders.find(o => o.id === targetId);
    if (!sourceOrder || !targetOrder) return;
    try {
      const sourceTable = sourceOrder.table_number;
      const targetTable = targetOrder.table_number;
      if (!sourceTable || !targetTable) throw new Error('Table numbers required');

      // Route through merge API — uses merge_orders_atomic RPC (FOR UPDATE)
      const res = await fetch('/api/orders/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_numbers: [targetTable, sourceTable] }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Merge failed');
      }

      const existingMerged = orders
        .filter(o => o.merged_into === targetOrder.id && o.table_number !== null)
        .map(o => o.table_number as number);
      const allNums = Array.from(new Set([
        targetTable, ...existingMerged, sourceTable,
      ])).filter((n): n is number => n !== null).sort((a, b) => a - b);
      toast.success(t('tables_merged').replace('{tables}', allNums.join('+')), { id: 'action-toast', duration: 3000 });

      setOrders(prev => applyOrdersUpdate(prev, o => o.map(x => {
        if (x.id === sourceOrder.id) return { ...x, merged_into: targetOrder.id, kitchen_status: null };
        if (x.id === targetOrder.id) return { ...x, kitchen_status: 'pending' as const };
        return x;
      })));

      setTimeout(() => fetchOrders(false), 100);
    } catch (e: unknown) {
      toast.error(`${t('error')}: ${errMsg(e)}`, { id: 'action-toast' });
    }
  }, [orders, fetchOrders, t, setOrders]);

  const handleCreateMergedEmptyOrder = useCallback(async (tableNums: number[]) => {
    const uniqueTableNums = Array.from(new Set(tableNums));
    if (uniqueTableNums.length < 2) return;
    try {
      // Use merge API — handles empty table grouping
      const res = await fetch('/api/orders/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_numbers: uniqueTableNums }),
      });
      if (!res.ok) throw new Error('Merge failed');
      toast.success(t('tables_merged').replace('{tables}', uniqueTableNums.join('+')), { id: 'action-toast' });
      await fetchOrders(false);
    } catch (e: unknown) {
      toast.error(`${t('error')}: ${errMsg(e)}`, { id: 'action-toast' });
    }
  }, [fetchOrders, t]);

  const handleAddEmptyTable = useCallback(async (emptyTableNum: number, targetOrderId: string) => {
    const targetOrder = orders.find(o => o.id === targetOrderId);
    const targetTable = targetOrder?.table_number;
    if (!targetTable) return;
    try {
      // Use merge API — adds empty table to existing merge group
      const res = await fetch('/api/orders/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_numbers: [targetTable, emptyTableNum] }),
      });
      if (!res.ok) throw new Error('Failed to add table');
      toast.success(t('table_added_to_group').replace('{table}', String(emptyTableNum)), { id: 'action-toast' });
      setTimeout(() => fetchOrders(false), 100);
    } catch (e: unknown) {
      toast.error(`${t('error')}: ${errMsg(e)}`, { id: 'action-toast' });
    }
  }, [orders, fetchOrders, t]);

  const handleMoveOrder = useCallback(async (orderId: string, toTableNum: number) => {
    const order = orders.find(o => o.id === orderId);
    const fromTable = order?.table_number;
    if (!fromTable) return;
    try {
      // Route through transfer API — uses transfer_orders_atomic RPC (FOR UPDATE)
      const res = await apiFetch('/api/orders/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_table: fromTable, to_table: toTableNum }),
      });
      if (!res.ok) throw new Error('Transfer failed');
      toast.success(t('table_moved').replace('{table}', String(toTableNum)), { id: 'action-toast' });
      setTimeout(() => fetchOrders(false), 100);
    } catch (e: unknown) {
      toast.error(`${t('error')}: ${errMsg(e)}`, { id: 'action-toast' });
    }
  }, [orders, fetchOrders, t]);

  return {
    /* data */
    orders,
    setOrders,
    loading,
    tableCount,
    delayThreshold,
    isOnline,
    openingHours,
    /* ui state */
    selectedOrder,
    setSelectedOrder,
    manualTableNum,
    setManualTableNum,
    updatedLabels,
    flashIds,
    confirmedIds,
    setConfirmedIds,
    staleDismissed,
    setStaleDismissed,
    prevStaleKey,
    /* actions */
    fetchOrders,
    handleConfirm,
    handlePay,
    handleDeleteOrder,
    handleClearTable,
    handleMergeOrders,
    handleMoveOrder,
    handleAddEmptyTable,
    handleCreateMergedEmptyOrder,
    handleStartPreparing,
    handleMarkReady,
    tableStatuses,
  };
}
