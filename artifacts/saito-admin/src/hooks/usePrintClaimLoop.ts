'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// pr v1 — terminal print claim loop (POS / KDS).
//
// Every 4s the terminal claims QUEUED jobs routed to BROWSER devices of its
// (server-derived, D-5) location, prints them through the provided onPrint
// callback (iframe print dialog), and reports the result back to the server.
// Network (ESC/POS) devices are NOT claimed here — their LAN print agent
// polls /api/print/agent/poll with the device key.
//
// The terminal id is the same per-tab id POS mutations already send
// (sessionStorage 'pos_terminal_id') — one tab = one terminal.

export interface PrintJob {
  id: string;
  doc_type: 'receipt' | 'kitchen' | 'label';
  order_id: string | null;
  trigger_key: string;
  payload: any;
  staff_name: string | null;
  device: {
    id: string;
    name: string;
    iface: string;
    paper_width: string;
    copies: number;
    host?: string | null;
    port?: number | null;
  };
}

export function getTerminalId(): string {
  try {
    const key = 'pos_terminal_id';
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = `term_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return `term_${Date.now()}`;
  }
}

export interface PrintQueueState {
  queued: number;
  claimed: number;
}

export function usePrintClaimLoop(
  enabled: boolean,
  opts: { onPrint: (job: PrintJob) => Promise<boolean> }
): PrintQueueState {
  const [queue, setQueue] = useState<PrintQueueState>({ queued: 0, claimed: 0 });
  const busy = useRef(false);
  const onPrintRef = useRef(opts.onPrint);
  onPrintRef.current = opts.onPrint;

  const report = useCallback(async (jobId: string, success: boolean, error?: string) => {
    try {
      await fetch('/api/print/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ job_id: jobId, terminal_id: getTerminalId(), success, error: error || undefined }),
      });
    } catch {
      // result reporting must never break the print loop
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let stop = false;

    const tick = async () => {
      if (busy.current || stop) return;
      busy.current = true;
      try {
        const res = await fetch('/api/print/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ terminal_id: getTerminalId(), max: 3 }),
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const jobs: PrintJob[] = Array.isArray(data?.jobs) ? data.jobs : [];
          for (const job of jobs) {
            if (stop) break;
            let ok = false;
            let err: string | undefined;
            try {
              ok = await onPrintRef.current(job);
            } catch (e: any) {
              err = e?.message || 'print error';
            }
            await report(job.id, ok, ok ? undefined : (err || 'print failed'));
          }
        }
        if (!stop) {
          const q = await fetch(`/api/print/queue?terminal_id=${encodeURIComponent(getTerminalId())}`, { credentials: 'include' });
          if (q.ok) {
            const d = await q.json().catch(() => ({}));
            if (!stop) setQueue({ queued: d.queued || 0, claimed: d.claimed_mine || 0 });
          }
        }
      } catch {
        // network hiccup — next tick retries
      } finally {
        busy.current = false;
      }
    };

    tick();
    const iv = setInterval(tick, 4000);
    return () => {
      stop = true;
      clearInterval(iv);
    };
  }, [enabled, report]);

  return queue;
}
