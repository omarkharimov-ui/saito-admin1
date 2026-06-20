'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';

type TableEvent = {
  table: string;
  schema?: string;
  filter?: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
};

type RefreshFn = () => void;

/**
 * Subscribe to realtime changes on one or more tables and call a shared
 * refresh callback when any change is detected. Avoids duplicate refresh
 * calls within a debounce window.
 *
 * Centralizes the common pattern:
 *   useEffect(() => {
 *     const channel = createRealtimeChannel('x')
 *       .on('postgres_changes', { event: '*', schema: 'public', table: 't' }, () => fetch())
 *       .subscribe();
 *     return () => { supabase.removeChannel(channel); };
 *   }, []);
 */
export function useCrossTableRefresh(
  prefix: string,
  tables: string[],
  onRefresh: RefreshFn,
  debounceMs = 2000,
) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<ReturnType<typeof createRealtimeChannel> | null>(null);

  const handleChange = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onRefresh();
    }, debounceMs);
  }, [onRefresh, debounceMs]);

  useEffect(() => {
    if (tables.length === 0) return;

    const channel = createRealtimeChannel(prefix);
    channelRef.current = channel;

    tables.forEach((table) => {
      channel.on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table },
        handleChange,
      );
    });

    channel.subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (channelRef.current) removeRealtimeChannel(channelRef.current);
    };
  }, [prefix, ...tables]);
}
