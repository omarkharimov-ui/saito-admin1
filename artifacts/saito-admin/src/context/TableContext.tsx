'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { toast } from '@/lib/toast';
import { computeTableStatus } from '@/lib/tableStatus';
import type { TableStatus } from '@/lib/tableStatus';

export interface TableRow {
  id: string;
  table_number: number;
  floor_name: string;
  sort_order: number;
  status: TableStatus;
  guest_count: number;
  reservation_id: string | null;
  reservation_name: string | null;
  reservation_phone: string | null;
  reservation_time: string | null;
  total_amount: number;
  order_ids: string[];
  merged_into_table: number | null;
  merged_orders: unknown[];
  has_pending: boolean;
  opened_at: string | null;
  order_count: number;
}

export interface FloorConfig {
  id: string;
  name: string;
  sort_order: number;
}

export interface PaymentInfo {
  method: 'cash' | 'card';
  cash_amount: number;
  card_amount: number;
  tip: number;
}

export interface TableContextType {
  tables: TableRow[];
  floors: FloorConfig[];
  loading: boolean;
  error: string | null;
  refresh(): Promise<void>;
  selectTable(tableNumber: number): void;
  dismissTable(tableNumber: number): Promise<void>;
  closeBill(orderId: string, payment: PaymentInfo): Promise<void>;
  activateTable(tableId: string): Promise<void>;
  reserveTables(reservationId: string, tableIds: string[], guestCount: number): Promise<void>;
}

const TableContext = createContext<TableContextType | null>(null);

export function TableProvider({ children }: { children: React.ReactNode }) {
  const [tables, setTables] = useState<TableRow[]>([]);
  const [floors, setFloors] = useState<FloorConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/pos/tables');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTables(data.tables || []);
      setFloors(data.floors || []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load tables';
      setError(msg);
      toast.error(msg);
    }
  }, []);

  const selectTable = useCallback((tableNumber: number) => {
    window.location.href = `/admin/pos?table=${tableNumber}`;
  }, []);

  const dismissTable = useCallback(async (tableNumber: number) => {
    try {
      const res = await fetch('/api/orders/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_number: tableNumber }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to dismiss table');
      toast.success(`Table ${tableNumber} cleared`);
      await refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to dismiss table';
      toast.error(msg);
      throw e;
    }
  }, [refresh]);

  const closeBill = useCallback(async (orderId: string, payment: PaymentInfo) => {
    try {
      const res = await fetch('/api/orders/pay', {
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
      toast.success('Bill closed');
      await refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Payment failed';
      toast.error(msg);
      throw e;
    }
  }, [refresh]);

  const activateTable = useCallback(async (tableId: string) => {
    try {
      const res = await fetch('/api/tables/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_id: tableId }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to activate table');
      toast.success('Table activated');
      await refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to activate table';
      toast.error(msg);
      throw e;
    }
  }, [refresh]);

  const reserveTables = useCallback(async (reservationId: string, tableIds: string[], guestCount: number) => {
    try {
      const res = await fetch('/api/reservations/reserve-table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservation_id: reservationId, table_ids: tableIds, guest_count: guestCount }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to reserve tables');
      toast.success('Tables reserved');
      await refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to reserve tables';
      toast.error(msg);
      throw e;
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const debouncedRefresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        refresh();
      }, 2000);
    };

    const channel = createRealtimeChannel('tables-context')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_floors' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, debouncedRefresh)
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      removeRealtimeChannel(channel);
    };
  }, [refresh]);

  const value = useMemo<TableContextType>(
    () => ({
      tables,
      floors,
      loading,
      error,
      refresh,
      selectTable,
      dismissTable,
      closeBill,
      activateTable,
      reserveTables,
    }),
    [tables, floors, loading, error, refresh, selectTable, dismissTable, closeBill, activateTable, reserveTables]
  );

  return <TableContext.Provider value={value}>{children}</TableContext.Provider>;
}

export function useTables() {
  const ctx = useContext(TableContext);
  if (!ctx) {
    throw new Error('useTables must be used within a TableProvider');
  }
  return ctx;
}
