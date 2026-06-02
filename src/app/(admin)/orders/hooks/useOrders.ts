'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { toast } from 'react-hot-toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import type { Order } from '../types';
import { CACHE_KEY, DEFAULT_TABLE_COUNT, SETTINGS_CACHE_KEY } from '../utils';
import { deductStockForOrder } from '@/lib/stockAutomation';

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
  const [orders, setOrders] = useState<Order[]>(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? (JSON.parse(raw) as Order[]) : [];
    } catch { return []; }
  });

  const [loading, setLoading]             = useState(true);
  const [tableCount, setTableCount]       = useState<number>(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
      if (raw) { const s = JSON.parse(raw); if (s?.tableCount >= 1) return s.tableCount; }
      // Fallback: QRTab stores count under its own key
      const qrRaw = localStorage.getItem('saito_qr_table_count');
      if (qrRaw) { const n = Number(qrRaw); if (!Number.isNaN(n) && n >= 1 && n <= 200) return n; }
    } catch {}
    return DEFAULT_TABLE_COUNT;
  });
  const [delayThreshold, setDelayThreshold] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
      if (raw) { const s = JSON.parse(raw); if (s?.delayThreshold) return s.delayThreshold; }
    } catch {}
    return 30;
  });
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

  /* ─── Action handlers ─── */
  const handleConfirm = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('orders').update({ status: 'confirmed' }).eq('id', id);
      if (error) throw error;
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
      // Find child orders before paying
      const { data: children } = await supabase
        .from('orders').select('id').eq('merged_into', order.id);
      const childIds = (children || []).map((c: any) => c.id);
      const allIds = [order.id, ...childIds];

      // 1. Optimistic update — remove from UI immediately
      setOrders(prev => applyOrdersUpdate(prev, o => o.filter(x => !allIds.includes(x.id))));

      // 2. DB operations
      await supabase.from('orders').update({
        status: 'paid', payment_method: paymentMethod || 'card',
        ...(tipAmount !== undefined ? { tip_amount: tipAmount } : {}),
      }).eq('id', order.id);
      if (childIds.length > 0) {
        await supabase.from('order_items').delete().in('order_id', childIds);
        await supabase.from('orders').delete().in('id', childIds);
      }

      // 3. Avtomatik stok azaltma (recipes + inventory_logs)
      try {
        await deductStockForOrder(order.id);
      } catch (stockErr) {
        console.error('[handlePay] Stock deduction failed:', stockErr);
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
      const { error } = await supabase.from('orders')
        .update({ kitchen_status: 'preparing', status: 'confirmed', kitchen_accepted_at: now })
        .eq('id', id);
      if (error) throw error;
      setOrders(prev => prev.map(o => o.id === id ? { ...o, kitchen_status: 'preparing', status: 'confirmed', kitchen_accepted_at: now } : o));
    } catch (e: unknown) {
      toast.error(`${t('error')}: ${errMsg(e)}`, { id: 'action-toast' });
    }
  }, [t, setOrders]);

  const handleMarkReady = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('orders')
        .update({ kitchen_status: 'ready', kitchen_ready_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      setOrders(prev => prev.map(o => o.id === id ? { ...o, kitchen_status: 'ready', kitchen_ready_at: new Date().toISOString() } : o));
    } catch (e: unknown) {
      toast.error(`${t('error')}: ${errMsg(e)}`, { id: 'action-toast' });
    }
  }, [t, setOrders]);

  const handleDeleteOrder = useCallback(async (id: string) => {
    try {
      await supabase.from('order_items').delete().eq('order_id', id);
      const { error } = await supabase.from('orders').delete().eq('id', id);
      if (error) throw error;
      toast.success(t('order_deleted'), { id: 'action-toast' });
      setOrders(prev => prev.filter(o => o.id !== id));
    } catch (e: unknown) {
      toast.error(`${t('error')}: ${errMsg(e)}`, { id: 'action-toast' });
    }
  }, [t]);

  const handleClearTable = useCallback(async (tableNum: number) => {
    try {
      // 1. Aktiv (yeni və ya təsdiqlənmiş) ana sifarişi tapırıq
      const { data: active, error } = await supabase
        .from('orders')
        .select('id, table_number')
        .eq('table_number', tableNum)
        .in('status', ['new', 'confirmed']);
      
      if (error) throw error;
      const primaryOrder = active?.[0];
      if (!primaryOrder) return;

      const primaryId = primaryOrder.id;

      // 2. Bu sifarişə bağlı olan bütün uşaq (merged) masaları tapırıq
      const { data: mergedChildren } = await supabase
        .from('orders')
        .select('id, table_number')
        .eq('merged_into', primaryId);

      const childIds = (mergedChildren || []).map(r => r.id);
      const allIdsToClear = [primaryId, ...childIds];
      const childTableNums = (mergedChildren || [])
        .map(r => r.table_number)
        .filter((n): n is number => n !== null);

      // 3. OPTİMİSTİK UPDATE: local state + localStorage dərhal yenilə
      setOrders(prev => applyOrdersUpdate(prev, o => o.filter(x => !allIdsToClear.includes(x.id))));

      // 4. BAZA ƏMƏLİYYATLARI — paralel sil
      const [, { error: delErr }] = await Promise.all([
        supabase.from('order_items').delete().in('order_id', allIdsToClear),
        supabase.from('orders').delete().in('id', allIdsToClear),
      ]);

      if (delErr) throw delErr;

      // 5. DB silməni təsdiqlədi — state-i bir daha təmizlə
      setOrders(prev => applyOrdersUpdate(prev, o => o.filter(x => !allIdsToClear.includes(x.id))));

      // 6. BİLDİRİŞ
      if (childTableNums.length > 0) {
        const allTableNums = [tableNum, ...childTableNums].sort((a, b) => a - b);
        toast.success(t('group_cleared').replace('{tables}', allTableNums.join(', ')), { id: 'action-toast', duration: 3000 });
      } else {
        toast.success(t('table_cleared').replace('{table}', String(tableNum)), { id: 'action-toast' });
      }

      // 7. Baza trigerlərinin işini bitirməsi üçün gözlə, sonra fetch et
      setTimeout(() => fetchOrders(false), 500);

    } catch (e: unknown) {
      const msg = errMsg(e);
      toast.error(`${t('error')}: ${msg}`, { id: 'action-toast' });
      // Xəta olsa, datanı geri qaytarmaq üçün fetch edirik
      fetchOrders(false);
    }
  }, [fetchOrders, t, setOrders]);

  const handleMergeOrders = useCallback(async (sourceId: string, targetId: string) => {
    const sourceOrder = orders.find(o => o.id === sourceId);
    const targetOrder = orders.find(o => o.id === targetId);
    if (!sourceOrder || !targetOrder) return;
    try {
      const items = sourceOrder.order_items || [];
      for (const item of items) {
        const existing = targetOrder.order_items?.find(i => i.product_id === item.product_id);
        if (existing) {
          const newQty = existing.quantity + item.quantity;
          await supabase.from('order_items').update({ quantity: newQty, total_price: existing.unit_price * newQty }).eq('id', existing.id);
          await supabase.from('order_items').delete().eq('id', item.id);
        } else {
          await supabase.from('order_items').update({ order_id: targetOrder.id }).eq('id', item.id);
        }
      }
      const extraTotal = items.reduce((s, i) => s + i.total_price, 0);
      const updateData: Record<string, unknown> = {
        total_amount: (targetOrder.total_amount || 0) + extraTotal,
        kitchen_status: 'pending',
        is_rush: false,
        kitchen_accepted_at: null,
      };
      if (sourceOrder.customer_note && !targetOrder.customer_note) updateData.customer_note = sourceOrder.customer_note;

      await supabase.from('orders').update(updateData).eq('id', targetOrder.id);

      // Reset prepared_quantity to 0 on all target order items
      const targetItemIds = (targetOrder.order_items || []).map(i => i.id);
      if (targetItemIds.length > 0) {
        await supabase.from('order_items').update({ prepared_quantity: 0 }).in('id', targetItemIds);
      }

      await supabase.from('orders').update({ 
        merged_into: targetOrder.id, 
        status: 'confirmed', 
        is_rush: false, 
        kitchen_status: null,
        kitchen_accepted_at: null,
        is_served: true 
      }).eq('id', sourceOrder.id);

      const existingMerged = orders
        .filter(o => o.merged_into === targetOrder.id && o.table_number !== null)
        .map(o => o.table_number as number);
      const allNums = Array.from(new Set([
        targetOrder.table_number, 
        ...existingMerged, 
        sourceOrder.table_number
      ])).filter((n): n is number => n !== null).sort((a, b) => a - b);
      const tablesStr = allNums.join('+');
      toast.success(t('tables_merged').replace('{tables}', tablesStr), { id: 'action-toast', duration: 3000 });

      // Optimistic update — reflect merge in local state immediately
      setOrders(prev => applyOrdersUpdate(prev, o => o.map(x => {
        if (x.id === sourceOrder.id) return { ...x, status: 'confirmed' as const, merged_into: targetOrder.id, kitchen_status: null };
        if (x.id === targetOrder.id) return { ...x, total_amount: (x.total_amount || 0) + extraTotal, kitchen_status: 'pending' as const };
        return x;
      })));

      setTimeout(() => fetchOrders(false), 100);
    } catch (e: unknown) {
      toast.error(`${t('error')}: ${errMsg(e)}`, { id: 'action-toast' });
    }
  }, [orders, fetchOrders, t, setOrders]);

  const handleCreateMergedEmptyOrder = useCallback(async (tableNums: number[]) => {
    // Remove duplicates using Set
    const uniqueTableNums = Array.from(new Set(tableNums));
    if (uniqueTableNums.length < 2) return;
    const [primary, ...rest] = uniqueTableNums;
    
    try {
      const { data: order, error } = await supabase.from('orders')
        .insert({ table_number: primary, total_amount: 0, status: 'confirmed', kitchen_status: 'pending', is_rush: false, items: [] })
        .select().single();
      if (error) throw error;
      
      if (rest.length > 0) {
        const childOrders = rest.map(n => ({ table_number: n, total_amount: 0, status: 'confirmed', merged_into: order.id, kitchen_status: null, is_rush: false }));
        const { error: e2 } = await supabase.from('orders').insert(childOrders);
        if (e2) throw e2;
      }
      toast.success(t('tables_merged').replace('{tables}', uniqueTableNums.join('+')), { id: 'action-toast' });
      await fetchOrders(false);
      setOrders(current => {
        const found = current.find(o => o.id === order.id);
        if (found) setSelectedOrder(found);
        return current;
      });
    } catch (e: unknown) {
      toast.error(`${t('error')}: ${errMsg(e)}`, { id: 'action-toast' });
    }
  }, [fetchOrders, t, setSelectedOrder]);

  const handleAddEmptyTable = useCallback(async (emptyTableNum: number, targetOrderId: string) => {
    try {
      // Insert a lightweight placeholder so the table appears linked in grid
      // but filter it out of order cards (no items = no card)
      const { error } = await supabase.from('orders').insert({
        table_number: emptyTableNum,
        total_amount: 0,
        status: 'confirmed',
        merged_into: targetOrderId,
        kitchen_status: null,
        is_rush: false,
      });
      if (error) throw error;
      toast.success(t('table_added_to_group').replace('{table}', String(emptyTableNum)), { id: 'action-toast' });
      setTimeout(() => fetchOrders(false), 100);
    } catch (e: unknown) {
      toast.error(`${t('error')}: ${errMsg(e)}`, { id: 'action-toast' });
    }
  }, [fetchOrders, t]);

  const handleMoveOrder = useCallback(async (orderId: string, toTableNum: number) => {
    try {
      const { error } = await supabase.from('orders').update({ table_number: toTableNum }).eq('id', orderId);
      if (error) throw error;
      toast.success(t('table_moved').replace('{table}', String(toTableNum)), { id: 'action-toast' });
      setTimeout(() => fetchOrders(false), 100);
    } catch (e: unknown) {
      toast.error(`${t('error')}: ${errMsg(e)}`, { id: 'action-toast' });
    }
  }, [fetchOrders, t]);

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
  };
}
