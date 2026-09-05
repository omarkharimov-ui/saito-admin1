'use client';

import { useEffect, useRef } from 'react';
import { useLocation } from '@/context/LocationContext';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UseLocationRealtimeOptions {
  tables: string[];
  onRefresh: () => void;
  enabled?: boolean;
}

export function useLocationRealtime({
  tables,
  onRefresh,
  enabled = true,
}: UseLocationRealtimeOptions) {
  const { activeLocationId } = useLocation();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const activeLocRef = useRef(activeLocationId);

  useEffect(() => {
    if (!enabled || !activeLocationId || tables.length === 0) return;

    // If location changed, clean up old channel
    if (activeLocRef.current !== activeLocationId && channelRef.current) {
      removeRealtimeChannel(channelRef.current);
      channelRef.current = null;
    }
    activeLocRef.current = activeLocationId;

    const channel = createRealtimeChannel(`loc_${activeLocationId.slice(0, 8)}`);
    channelRef.current = channel;

    tables.forEach((table) => {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
        },
        () => onRefresh()
      );
    });

    channel.subscribe();

    return () => {
      if (channelRef.current) {
        removeRealtimeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [activeLocationId, enabled, tables, onRefresh]);
}
