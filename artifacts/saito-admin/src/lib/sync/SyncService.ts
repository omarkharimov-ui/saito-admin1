import { localStore } from './OfflineStore';
import { mergeStates } from './CRDTMerge';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;

export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: number;
  deadLettered: number;
  error?: string;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function syncNow(): Promise<SyncResult> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { pushed: 0, pulled: 0, conflicts: 0, deadLettered: 0, error: 'Missing Supabase config' };
  }

  const result: SyncResult = { pushed: 0, pulled: 0, conflicts: 0, deadLettered: 0 };

  try {
    const outbox = await localStore.getOutbox();
    const pending = outbox.filter(a => !a.synced && (a.retry_count || 0) < MAX_RETRIES);
    const deadLetter = outbox.filter(a => !a.synced && (a.retry_count || 0) >= MAX_RETRIES);

    result.deadLettered = deadLetter.length;

    for (const action of pending) {
      let lastError: string | null = null;
      let lastStatus: number | null = null;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          let res: Response;
          if (action.rpc) {
            res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${action.rpc}`, {
              method: 'POST',
              headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation',
              },
              body: JSON.stringify(action.payload),
            });
          } else {
            res = await fetch(`${SUPABASE_URL}/rest/v1/${action.table}`, {
              method: action.method || 'POST',
              headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation',
              },
              body: JSON.stringify(action.payload),
            });
          }

          lastStatus = res.status;

          if (res.ok) {
            await localStore.markOutboxSynced(action.id as number);
            result.pushed++;
            lastError = null;
            break;
          } else if (res.status === 409) {
            lastError = 'CONFLICT';
            result.conflicts++;
            await sleep(BASE_RETRY_DELAY_MS * Math.pow(2, attempt));
          } else {
            const errText = await res.text();
            lastError = errText || `HTTP ${res.status}`;
            await sleep(BASE_RETRY_DELAY_MS * Math.pow(2, attempt));
          }
        } catch (e: any) {
          lastError = e?.message || 'Network error';
          await sleep(BASE_RETRY_DELAY_MS * Math.pow(2, attempt));
        }
      }

      if (lastError) {
        await localStore.updateOutboxError(action.id as number, lastError, lastStatus);
      }
    }

    const localOrders = await localStore.getAllOrders();
    if (localOrders.length > 0) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/orders?select=*&id=in.(${localOrders.map(o => o.id).join(',')})`, {
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      });

      if (res.ok) {
        const serverOrders: any[] = await res.json();
        const serverMap = new Map(serverOrders.map(o => [o.id, o]));

        for (const local of localOrders) {
          const server = serverMap.get(local.id);
          if (server && server.updated_at > local.updated_at) {
            const merged = mergeStates(local, server);
            await localStore.saveOrder(merged);
            result.conflicts++;
          }
        }
        result.pulled = serverOrders.length;
      }
    }

    return result;
  } catch (error: any) {
    return { ...result, error: error.message };
  }
}

export function getOnlineStatus(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export function onOnlineChange(callback: (online: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = () => callback(navigator.onLine);
  window.addEventListener('online', handler);
  window.addEventListener('offline', handler);
  return () => {
    window.removeEventListener('online', handler);
    window.removeEventListener('offline', handler);
  };
}
