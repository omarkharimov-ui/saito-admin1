import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

let channelSeq = 0;

/**
 * Fresh Realtime channel per effect mount.
 * Static channel names break under React Strict Mode (subscribe → cleanup race).
 */
export function createRealtimeChannel(prefix: string): RealtimeChannel {
  channelSeq += 1;
  const id = `${prefix}_${channelSeq}_${Math.random().toString(36).slice(2, 9)}`;
  return supabase.channel(id);
}

export function removeRealtimeChannel(channel: RealtimeChannel) {
  return supabase.removeChannel(channel);
}
