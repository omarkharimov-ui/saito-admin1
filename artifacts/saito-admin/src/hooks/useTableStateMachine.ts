'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api-fetch';

export type TableStatus =
  | 'empty' | 'reserved' | 'seated' | 'ordering'
  | 'in_kitchen' | 'dining' | 'bill_requested'
  | 'payment_pending' | 'paid' | 'cleaning'
  | 'merged' | 'out_of_service';

export interface TableTransitionResult {
  success: boolean;
  table_number?: number;
  old_status?: string;
  new_status?: string;
  error?: string;
}

interface UseTableStateMachineOptions {
  onTransition?: (result: TableTransitionResult) => void;
  onError?: (error: string) => void;
}

export function useTableStateMachine(options?: UseTableStateMachineOptions) {
  const [transitioning, setTransitioning] = useState(false);
  const [validTransitions, setValidTransitions] = useState<{ to_status: string; description: string | null }[]>([]);

  const getValidTransitions = useCallback(async (currentStatus: TableStatus) => {
    try {
      const res = await apiFetch('/api/rpc/get_valid_transitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_entity: 'table', p_current_status: currentStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        const transitions = data?.transitions || [];
        setValidTransitions(transitions);
        return transitions;
      }
    } catch (e) {
      console.error('Failed to get table transitions:', e);
    }
    return [];
  }, []);

  const transition = useCallback(async (
    tableNumber: number,
    newStatus: TableStatus,
    params?: {
      reason?: string;
      metadata?: Record<string, unknown>;
      employeeName?: string;
      undoPayload?: Record<string, unknown>;
    }
  ): Promise<TableTransitionResult> => {
    setTransitioning(true);
    try {
      const res = await apiFetch('/api/rpc/transition_table_status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_table_number: tableNumber,
          p_new_status: newStatus,
          p_reason: params?.reason,
          p_metadata: params?.metadata,
          p_employee_name: params?.employeeName,
          p_undo_payload: params?.undoPayload,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const error = data?.error || 'Table transition failed';
        options?.onError?.(error);
        return { success: false, error };
      }

      const result: TableTransitionResult = {
        success: true,
        table_number: data?.table_number,
        old_status: data?.old_status,
        new_status: data?.new_status,
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
    getValidTransitions,
    validTransitions,
    transitioning,
  };
}
