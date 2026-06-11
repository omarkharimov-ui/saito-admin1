'use client';

import { useState, useCallback, useRef } from 'react';

interface AiFallbackState<T> {
  loading: boolean;
  error: string | null;
  data: T | null;
  manualMode: boolean;
}

interface UseAiFallbackOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: string) => void;
  fallbackMessage?: string;
}

export function useAiFallback<T = any>(options?: UseAiFallbackOptions<T>) {
  const [state, setState] = useState<AiFallbackState<T>>({
    loading: false,
    error: null,
    data: null,
    manualMode: false,
  });
  const abortRef = useRef<AbortController | null>(null);

  const execute = useCallback(async (fetcher: () => Promise<T>, timeoutMs = 15000) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ loading: true, error: null, data: null, manualMode: false });

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI sorğu vaxtı keçdi')), timeoutMs)
      );

      const data = await Promise.race([
        fetcher(),
        timeoutPromise,
      ]);

      if (controller.signal.aborted) return;

      setState({ loading: false, error: null, data, manualMode: false });
      options?.onSuccess?.(data);
    } catch (err: any) {
      if (controller.signal.aborted) return;
      const message = err?.message || 'AI bağlantı xətası';
      setState({ loading: false, error: message, data: null, manualMode: false });
      options?.onError?.(message);
    }
  }, [options]);

  const enterManualMode = useCallback(() => {
    setState(prev => ({ ...prev, manualMode: true, error: null }));
  }, []);

  const reset = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setState({ loading: false, error: null, data: null, manualMode: false });
  }, []);

  const setData = useCallback((data: T) => {
    setState(prev => ({ ...prev, data, loading: false, error: null }));
  }, []);

  return {
    ...state,
    execute,
    enterManualMode,
    reset,
    setData,
  };
}
