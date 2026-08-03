'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api-fetch';

export interface ServiceChargeResult {
  success: boolean;
  serviceChargePct?: number;
  serviceChargeAmount?: number;
  newTotal?: number;
  error?: string;
}

export function useServiceCharge() {
  const [loading, setLoading] = useState(false);

  const apply = useCallback(async (orderId: string, pct: number): Promise<ServiceChargeResult> => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/rpc/apply_service_charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_order_id: orderId, p_pct: pct }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data?.error };
      return {
        success: true,
        serviceChargePct: data?.service_charge_pct,
        serviceChargeAmount: data?.service_charge_amount,
        newTotal: data?.new_total,
      };
    } catch (e: any) {
      return { success: false, error: e?.message };
    } finally {
      setLoading(false);
    }
  }, []);

  const remove = useCallback(async (orderId: string): Promise<{ success: boolean; error?: string }> => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/rpc/remove_service_charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_order_id: orderId }),
      });
      const data = await res.json();
      return res.ok ? { success: true } : { success: false, error: data?.error };
    } catch (e: any) {
      return { success: false, error: e?.message };
    } finally {
      setLoading(false);
    }
  }, []);

  const applyTax = useCallback(async (orderId: string, pct: number) => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/rpc/apply_tax', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_order_id: orderId, p_pct: pct }),
      });
      const data = await res.json();
      return res.ok ? { success: true, taxPct: data?.tax_pct, taxAmount: data?.tax_amount } : { success: false, error: data?.error };
    } catch (e: any) {
      return { success: false, error: e?.message };
    } finally {
      setLoading(false);
    }
  }, []);

  return { apply, remove, applyTax, loading };
}
