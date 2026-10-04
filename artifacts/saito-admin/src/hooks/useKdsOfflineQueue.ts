'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';

export type KdsQueueKind = 'prepared' | 'recall' | 'ready' | 'void';

export interface KdsQueueEntry {
  /** dedupe key — same logical action never queues twice */
  id: string;
  kind: KdsQueueKind;
  /** the canonical API the action targets */
  api: string;
  body: Record<string, unknown>;
  ts: number;
  /** a business failure (4xx) — do NOT auto-retry; human "retry" only */
  failed?: boolean;
}

const KEY = 'saito.kds.queue.v1';
const MAX_ENTRIES = 20;
const BATCH = 5;

function readQueue(): KdsQueueEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function persist(q: KdsQueueEntry[]) {
  try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* storage full — queue is memory-only then */ }
}

/**
 * 12u (owner, §1c #2) — KITCHEN OFFLINE BUFFER (Toast offline-parity).
 *
 * A kitchen terminal must keep working when the network drops: the chef's
 * ticks / "Hazırdır" / recalls / 86s land in a LOCAL queue (localStorage —
 * survives a reload) and replay in order as soon as the board's own 5 s
 * poll proves connectivity.
 *
 * Queueable actions are the near-idempotent ones:
 *   • prepared  — SET prepared_quantity (absolute value)
 *   • recall    — ready→pending (state-guarded edge; no-op if not ready)
 *   • ready     — mark_item_ready_atomic (state-guarded; no-op if ready)
 *   • void      — item_kitchen_terminal (terminal guard; no-op if voided)
 * (12v: the expo 'serve' kind was removed — the pass is view-only, servis = POS)
 * NOT queued (documented): rush (a TOGGLE — replay would flip twice) and
 * course-fire (multi-item stateful) — they fail with an error toast and
 * the chef presses again.
 *
 * Before each replay POST the entry is RECONCILED against the freshest
 * board snapshot (the poll that triggered the replay): if the board already
 * reflects the action (e.g. the item became ready by another path), the
 * entry is dropped as stale — no error-code archaeology needed.
 *
 * 4xx = business failure → the entry is marked `failed` (red badge + a
 * manual "retry") and never auto-looped. 5xx / network-down = transient →
 * the entry stays and retries on the next cycle.
 */
export function useKdsOfflineQueue(opts: {
  /** latest board snapshot (orders as fetched) — for stale reconciliation */
  getOrders: () => any[];
  /** called after ≥1 entry was replayed/dropped → the caller refetches */
  onReplayed: () => void;
}) {
  const [queue, setQueue] = useState<KdsQueueEntry[]>(() => readQueue());
  const queueRef = useRef<KdsQueueEntry[]>(queue);
  const inFlightRef = useRef(false);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  const optsRef = useRef(opts);
  useEffect(() => { optsRef.current = opts; });

  const enqueue = useCallback((e: KdsQueueEntry) => {
    setQueue(prev => {
      if (prev.some(x => x.id === e.id)) return prev; // dedupe
      const next = [...prev, e].slice(-MAX_ENTRIES);
      persist(next);
      return next;
    });
  }, []);

  /** Replay up to BATCH entries (in order). Safe to call on every poll. */
  const replay = useCallback(async () => {
    if (inFlightRef.current) return;
    const q = queueRef.current;
    if (q.length === 0) return;
    inFlightRef.current = true;
    let resolved = 0; // replayed OR dropped-as-stale
    const rest: KdsQueueEntry[] = [];
    for (const e of q.slice(0, BATCH)) {
      if (e.failed) { rest.push(e); continue; }
      if (reconcile(e) === 'stale') { resolved++; continue; }
      try {
        const res = await apiFetch(e.api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(e.body),
        });
        if (res.ok) { resolved++; continue; } // replayed — drop
        const d: any = await res.json().catch(() => ({}));
        if (res.status >= 500) { rest.push(e); continue; } // transient — keep
        rest.push({ ...e, failed: true }); resolved++; // business fail — flag
      } catch {
        rest.push(e); // offline — keep, retry next cycle
      }
    }
    rest.push(...q.slice(BATCH));
    persist(rest);
    setQueue(rest);
    inFlightRef.current = false;
    if (resolved > 0) optsRef.current.onReplayed();
  }, []);

  const reconcile = (e: KdsQueueEntry): 'do' | 'stale' => {
    const orders: any[] = optsRef.current.getOrders() || [];
    const find = (itemId: string) => {
      for (const o of orders) {
        const it = (o.items || []).find((i: any) => i.id === itemId);
        if (it) return it;
      }
      return null;
    };
    const body: any = e.body || {};
    const itemId: string = body.order_item_id || '';
    if (e.kind === 'prepared') {
      const it = itemId ? find(itemId) : null;
      if (!it) return 'stale';
      if ((it.prepared_quantity ?? 0) === body.prepared_quantity) return 'stale';
      return 'do';
    }
    if (e.kind === 'recall') {
      const it = itemId ? find(itemId) : null;
      if (!it) return 'stale';
      if (it.kitchen_status !== 'ready') return 'stale'; // only ready can be recalled
      return 'do';
    }
    if (e.kind === 'ready') {
      const o = orders.find((x: any) => x.id === body.order_id);
      if (!o) return 'stale';
      const ids: string[] | null = body.item_ids ?? null;
      const act = (o.items || []).filter((i: any) =>
        (i.quantity ?? 0) > 0 && !['completed', 'cancelled', 'voided'].includes(i.kitchen_status));
      const scope = ids ? act.filter((i: any) => ids.includes(i.id)) : act;
      if (scope.length === 0 || scope.every((i: any) => ['ready', 'served'].includes(i.kitchen_status))) return 'stale';
      return 'do';
    }
    if (e.kind === 'void') {
      const it = itemId ? find(itemId) : null;
      if (!it) return 'stale';
      if (['voided', 'cancelled', 'completed'].includes(it.kitchen_status)) return 'stale';
      return 'do';
    }
    return 'do';
  };

  /** Human retry of `failed` entries (unflags them + replays now). */
  const retryFailed = useCallback(() => {
    setQueue(prev => {
      const next = prev.map(e => (e.failed ? { ...e, failed: false } : e));
      persist(next);
      return next;
    });
    // give the state a beat, then replay (inFlight is free)
    setTimeout(() => { void replay(); }, 50);
  }, [replay]);

  return {
    queue,
    queuedCount: queue.filter(e => !e.failed).length,
    failedCount: queue.filter(e => e.failed).length,
    enqueue,
    replay,
    retryFailed,
  };
}
