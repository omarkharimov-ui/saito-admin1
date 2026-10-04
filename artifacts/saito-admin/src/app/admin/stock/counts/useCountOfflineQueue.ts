'use client';

import { useCallback, useEffect, useState } from 'react';

// 13c: offline stocktake buffer — the KDS offline-queue pattern (12u) applied
// to physical counts. A count entry recorded while the network is down is
// buffered in localStorage and replayed in FIFO order once connectivity
// returns — a kitchen count must never be lost because the freezer has no
// signal. Reversible: entries are plain JSON, inspectable, dedup-safe.

const KEY = 'saito_count_offline_queue_v1';

export interface QueuedCountItem {
  id: string;
  count_id: string;
  ingredient_id: string;
  actual_qty: number;
  queued_at: string;
}

function readQueue(): QueuedCountItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr)
      ? arr.filter((e: any) => e && e.count_id && e.ingredient_id && typeof e.actual_qty === 'number')
      : [];
  } catch {
    return [];
  }
}

function writeQueue(q: QueuedCountItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(q));
  } catch {
    /* storage full/blocked — the caller still has the in-memory list */
  }
}

export function useCountOfflineQueue() {
  const [queued, setQueued] = useState<QueuedCountItem[]>([]);
  const [replaying, setReplaying] = useState(false);

  const sync = useCallback(() => setQueued(readQueue()), []);

  const replay = useCallback(async () => {
    const q = readQueue();
    if (q.length === 0) {
      setQueued([]);
      return;
    }
    setReplaying(true);
    for (const entry of q) {
      try {
        const res = await fetch(`/api/stock/counts/${entry.count_id}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ingredient_id: entry.ingredient_id, actual_qty: entry.actual_qty }),
        });
        if (res.ok) {
          // Delivered — remove from the queue.
          const rest = readQueue().filter((e) => e.id !== entry.id);
          writeQueue(rest);
          setQueued(rest);
        } else if (res.status >= 400 && res.status < 500) {
          // Definitive server rejection (bad id / count closed) — drop it so
          // the queue cannot loop forever on an entry that will never land.
          const rest = readQueue().filter((e) => e.id !== entry.id);
          writeQueue(rest);
          setQueued(rest);
        }
        // 5xx: keep queued, try the next entry.
      } catch {
        // Still offline — stop here; the remainder stays buffered for the
        // next 'online' event or manual replay.
        setQueued(readQueue());
        return;
      }
    }
    setReplaying(false);
  }, []);

  const enqueue = useCallback((count_id: string, ingredient_id: string, actual_qty: number) => {
    const entry: QueuedCountItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      count_id,
      ingredient_id,
      actual_qty,
      queued_at: new Date().toISOString(),
    };
    writeQueue([...readQueue(), entry]);
    setQueued(readQueue());
    return entry;
  }, []);

  useEffect(() => {
    sync();
    void replay();
    const onOnline = () => {
      sync();
      void replay();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [sync, replay]);

  return { queued, replaying, enqueue, replay, sync };
}
