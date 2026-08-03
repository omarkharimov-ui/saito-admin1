'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api-fetch';

export interface SplitResult {
  success: boolean;
  newOrderId?: string;
  seatNumber?: number;
  itemsMoved?: number;
  newTotal?: number;
  remainingTotal?: number;
  error?: string;
}

export interface EqualSplitResult {
  success: boolean;
  splitCount?: number;
  splitAmount?: number;
  remainder?: number;
  originalOrderId?: string;
  error?: string;
}

export function useSplitBill() {
  const [loading, setLoading] = useState(false);

  const splitBySeat = useCallback(async (orderId: string, seatNumber: number): Promise<SplitResult> => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/rpc/split_by_seat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_order_id: orderId, p_seat_number: seatNumber }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data?.error };
      return {
        success: true,
        newOrderId: data?.new_order_id,
        seatNumber: data?.seat_number,
        itemsMoved: data?.items_moved,
        newTotal: data?.new_total,
        remainingTotal: data?.remaining_total,
      };
    } catch (e: any) {
      return { success: false, error: e?.message };
    } finally {
      setLoading(false);
    }
  }, []);

  const splitEqual = useCallback(async (orderId: string, splitCount: number): Promise<EqualSplitResult> => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/rpc/split_equal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_order_id: orderId, p_split_count: splitCount }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data?.error };
      return {
        success: true,
        splitCount: data?.split_count,
        splitAmount: data?.split_amount,
        remainder: data?.remainder,
        originalOrderId: data?.original_order_id,
      };
    } catch (e: any) {
      return { success: false, error: e?.message };
    } finally {
      setLoading(false);
    }
  }, []);

  const splitItems = useCallback(async (orderId: string, itemsToSplit: { order_item_id: string; quantity: number }[]) => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/orders/bill-split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ original_order_id: orderId, items_to_split: itemsToSplit }),
      });
      const data = await res.json();
      return res.ok ? { success: true, ...data } : { success: false, error: data?.error };
    } catch (e: any) {
      return { success: false, error: e?.message };
    } finally {
      setLoading(false);
    }
  }, []);

  return { splitBySeat, splitEqual, splitItems, loading };
}
