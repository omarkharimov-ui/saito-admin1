/**
 * Offline monitor — Q8 phase 1 (owner 2026-09-26: "offline 10000% bunu basla").
 *
 * Combines navigator.onLine (cheap, event-driven) with a heartbeat ping to
 * /api/health (catches "Wi-Fi up but our server/Supabase down"). State is
 * broadcast to every tab via localStorage + a window CustomEvent
 * (`saito:net`) so the write-queue replay pump and the admin banner react.
 *
 * NOTE: this is DETECTION + UI state only. Offline WRITE handling lives in
 * queue.ts (explicit, per-route), reads fall back to cache.ts via apiFetch.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';

export type NetState = 'online' | 'offline' | 'checking';

const LS_KEY = 'saito_net_state';
const EVENT = 'saito:net';

let state: NetState = typeof navigator !== 'undefined' && navigator.onLine ? 'online' : 'checking';
let pingInFlight = false;
const listeners = new Set<() => void>();

function emit(next: NetState) {
  if (next === state) return;
  state = next;
  try { localStorage.setItem(LS_KEY, next); } catch { /* private mode */ }
  listeners.forEach(l => l());
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { state: next } }));
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
function getSnapshot(): NetState { return state; }

export function isOffline(): boolean { return state === 'offline'; }

/** One heartbeat ping. Returns true when the server answers. */
export async function ping(): Promise<boolean> {
  if (pingInFlight) return state === 'online';
  pingInFlight = true;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch('/api/health', { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  } finally {
    pingInFlight = false;
  }
}

function recompute(online: boolean, serverOk: boolean | null) {
  if (!online) { emit('offline'); return; }
  if (serverOk === false) { emit('offline'); return; }
  emit('online');
}

let started = false;
/** Start the monitor (idempotent — called from the admin layout). */
export function startMonitor() {
  if (started || typeof window === 'undefined') return;
  started = true;

  const onOnline = () => { ping().then(ok => recompute(true, ok)); };
  const onOffline = () => emit('offline');
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  window.addEventListener('storage', (e) => {
    if (e.key === LS_KEY && (e.newValue === 'online' || e.newValue === 'offline')) {
      if (e.newValue !== state) emit(e.newValue);
    }
  });

  // Initial check + heartbeat. Every 20s; when offline it doubles as the
  // "did we come back?" probe (recovery is fast enough for POS use).
  ping().then(ok => recompute(navigator.onLine, ok));
  const id = setInterval(() => {
    if (document.hidden && state === 'offline') return; // battery in background tabs
    ping().then(ok => recompute(navigator.onLine, ok));
  }, 20_000);

  // React cleanup is not available at module level; the interval is tiny.
  if (typeof window !== 'undefined') {
    (window as any).__saitoMonitorInterval = id;
  }
}

/** React hook: live net state for banners/indicators. */
export function useNetState(): NetState {
  return useSyncExternalStore(subscribe, getSnapshot, () => 'checking' as NetState);
}

export function useIsOffline(): boolean {
  const s = useNetState();
  return s === 'offline';
}
