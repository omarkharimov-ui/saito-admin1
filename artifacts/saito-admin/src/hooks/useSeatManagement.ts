'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api-fetch';

export interface SeatInfo {
  id: string;
  seat_number: number;
  label: string | null;
  sort_order: number;
}

export interface SeatTotal {
  seat_number: number;
  subtotal: number;
  item_count: number;
}

export function useSeatManagement() {
  const [loading, setLoading] = useState(false);

  const upsertSeats = useCallback(async (tableNumber: number, seats: { seat_number: number; label?: string; sort_order?: number }[]) => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/rpc/upsert_seats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_table_number: tableNumber, p_seats: seats }),
      });
      const data = await res.json();
      return res.ok ? { success: true, seats: data?.seats || [] } : { success: false, error: data?.error };
    } catch (e: any) {
      return { success: false, error: e?.message };
    } finally {
      setLoading(false);
    }
  }, []);

  const transferSeatItems = useCallback(async (orderId: string, fromSeat: number, toSeat: number) => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/rpc/transfer_seat_items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_order_id: orderId, p_from_seat: fromSeat, p_to_seat: toSeat }),
      });
      const data = await res.json();
      return res.ok ? { success: true, itemsMoved: data?.items_moved } : { success: false, error: data?.error };
    } catch (e: any) {
      return { success: false, error: e?.message };
    } finally {
      setLoading(false);
    }
  }, []);

  const getSeatTotals = useCallback(async (orderId: string): Promise<SeatTotal[]> => {
    try {
      const res = await apiFetch('/api/rpc/get_seat_totals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_order_id: orderId }),
      });
      const data = await res.json();
      return res.ok ? (data?.seats || []) : [];
    } catch {
      return [];
    }
  }, []);

  return { upsertSeats, transferSeatItems, getSeatTotals, loading };
}
