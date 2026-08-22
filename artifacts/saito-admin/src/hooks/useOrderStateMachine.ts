'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api-fetch';

export type OrderStatus =
  | 'draft' | 'new' | 'open' | 'confirmed'
  | 'in_kitchen' | 'partially_ready' | 'ready'
  | 'served' | 'payment_pending'
  | 'paid' | 'closed' | 'cancelled' | 'refunded';

export type DeliveryStatus =
  | 'pending' | 'confirmed' | 'preparing' | 'ready'
  | 'waiting_courier' | 'picked_up' | 'in_transit'
  | 'delivered' | 'completed' | 'cancelled';

export interface ValidTransition {
  to_status: string;
  description: string | null;
  requires_role: string | null;
  requires_manager_pin: boolean;
}

export interface TransitionResult {
  success: boolean;
  order_id?: string;
  old_status?: string;
  new_status?: string;
  kitchen_status?: string;
  error?: string;
}

interface UseOrderStateMachineOptions {
  onTransition?: (result: TransitionResult) => void;
  onError?: (error: string) => void;
}

export function useOrderStateMachine(options?: UseOrderStateMachineOptions) {
  const [transitioning, setTransitioning] = useState(false);
  const [validTransitions, setValidTransitions] = useState<ValidTransition[]>([]);

  const getValidTransitions = useCallback(async (currentStatus: string, entity: 'order' | 'delivery' = 'order'): Promise<ValidTransition[]> => {
    try {
      const res = await apiFetch(`/api/rpc/get_valid_transitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_entity: entity, p_current_status: currentStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        const transitions = data?.transitions || [];
        setValidTransitions(transitions);
        return transitions;
      }
    } catch (e) {
      console.error('Failed to get valid transitions:', e);
    }
    return [];
  }, []);

  const transition = useCallback(async (
    orderId: string,
    newStatus: OrderStatus,
    params?: {
      reason?: string;
      metadata?: Record<string, unknown>;
      employeeName?: string;
    }
  ): Promise<TransitionResult> => {
    setTransitioning(true);
    try {
      const res = await apiFetch('/api/rpc/transition_order_status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_order_id: orderId,
          p_new_status: newStatus,
          p_reason: params?.reason,
          p_metadata: params?.metadata,
          p_employee_name: params?.employeeName,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const error = data?.error || 'Transition failed';
        options?.onError?.(error);
        return { success: false, error };
      }

      const result: TransitionResult = {
        success: true,
        order_id: data?.order_id,
        old_status: data?.old_status,
        new_status: data?.new_status,
        kitchen_status: data?.kitchen_status,
      };

      options?.onTransition?.(result);
      return result;
    } catch (e: any) {
      const error = e?.message || 'Network error';
      options?.onError?.(error);
      return { success: false, error };
    } finally {
      setTransitioning(false);
    }
  }, [options]);

  const transitionDelivery = useCallback(async (
    orderId: string,
    newStatus: DeliveryStatus,
    params?: {
      courierId?: string;
      courierName?: string;
      metadata?: Record<string, unknown>;
      employeeName?: string;
    }
  ): Promise<TransitionResult> => {
    setTransitioning(true);
    try {
      const res = await apiFetch('/api/rpc/transition_delivery_status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_order_id: orderId,
          p_new_status: newStatus,
          p_courier_id: params?.courierId,
          p_courier_name: params?.courierName,
          p_employee_name: params?.employeeName,
          p_metadata: params?.metadata,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const error = data?.error || 'Delivery transition failed';
        options?.onError?.(error);
        return { success: false, error };
      }

      const result: TransitionResult = {
        success: true,
        order_id: data?.order_id,
        old_status: data?.old_delivery_status,
        new_status: data?.new_delivery_status,
      };

      options?.onTransition?.(result);
      return result;
    } catch (e: any) {
      const error = e?.message || 'Network error';
      options?.onError?.(error);
      return { success: false, error };
    } finally {
      setTransitioning(false);
    }
  }, [options]);

  return {
    transition,
    transitionDelivery,
    getValidTransitions,
    validTransitions,
    transitioning,
  };
}
