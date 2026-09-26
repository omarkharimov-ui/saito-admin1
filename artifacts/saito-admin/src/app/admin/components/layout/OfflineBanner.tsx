'use client';

// 2026-09-26 (Q8 offline phase 2, owner: "offline tam şekildə hazırla"):
// global admin banner — amber pill, fixed top-center, spring 500/26.
// Click → sync popover: queued ops list (auto/manual), "İNDİ SİNHRONLAŞDIR",
// last-sync result. Starts monitor + replay pump once (idempotent).
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, RefreshCw, X, ListOrdered } from 'lucide-react';
import { startMonitor, useIsOffline } from '@/lib/offline/monitor';
import {
  startReplayPump, useQueueCount, onSyncComplete, drainNow, peekQueue, QueueItem,
} from '@/lib/offline/queue';
import { toast } from '@/lib/toast';

const ROUTE_LABELS: Record<string, string> = {
  '/api/orders': 'Sifariş',
  '/api/orders/pay': 'Ödəniş',
  '/api/pos/tables': 'Cədvəl statusu',
  '/api/waitlist': 'Növbə',
  '/api/orders/undo': 'Undo',
  '/api/orders/guest-count': 'Müştri sayı',
  '/api/reservations/pre-order-items': 'Pre-order',
  '/api/campaigns/coupon': 'Kupon',
};

export default function OfflineBanner() {
  const offline = useIsOffline();
  const queueCount = useQueueCount();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    startMonitor();
    startReplayPump();
    const off = onSyncComplete((synced, err) => {
      if (synced > 0) toast.success(`${synced} əməliyyat sinxronlaşdı ✓`);
      else if (err) toast(`Sinxron: ${err} — növbəti cəhd avtomatik`, { id: 'offline-sync' });
    });
    return off;
  }, []);

  useEffect(() => {
    if (open) setItems(peekQueue());
  }, [open, queueCount]);

  const sync = async () => {
    setBusy(true);
    // give the drain a beat, then refresh the list
    drainNow();
    setTimeout(() => { setItems(peekQueue()); setBusy(false); }, 1200);
  };

  return (
    <>
      <AnimatePresence>
        {offline && (
          <motion.div
            initial={{ opacity: 0, y: -18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 500, damping: 26 }}
            className="fixed top-3 left-1/2 -translate-x-1/2 z-[9998]"
          >
            <button
              onClick={() => setOpen(true)}
              className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-amber-500/95 text-black shadow-[0_12px_40px_rgba(245,158,11,0.35)] border border-amber-400/60 active:scale-95 transition-transform"
            >
              <WifiOff size={15} className="shrink-0" />
              <span className="text-[11px] font-black uppercase tracking-widest whitespace-nowrap">
                Offline — yerli rejim
              </span>
              {queueCount > 0 && (
                <span className="flex items-center gap-1.5 text-[11px] font-black whitespace-nowrap bg-black/15 rounded-full px-2.5 py-0.5">
                  <RefreshCw size={11} className={busy ? 'animate-spin' : ''} />
                  {queueCount} gözləyir
                </span>
              )}
              <span className="text-[10px] font-bold opacity-70 whitespace-nowrap hidden sm:inline">
                tap = sinxron panel
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 500, damping: 26 }}
              className="w-full max-w-md rounded-3xl bg-[#141419] border border-white/10 p-5 space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                  <ListOrdered size={16} className="text-amber-400" />
                </span>
                <div>
                  <h3 className="text-base font-black text-white">Offline sinxron</h3>
                  <p className="text-[10px] uppercase tracking-widest text-white/35 font-bold">
                    {items.length ? `${items.length} əməliyyat növbədə` : 'Növbə boş — hamısı sinxronlaşdı'}
                  </p>
                </div>
                <button onClick={() => setOpen(false)} className="ml-auto w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/50 hover:text-white">
                  <X size={15} />
                </button>
              </div>

              {items.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {items.map(it => (
                    <div key={it.id} className="flex items-center gap-2.5 rounded-xl bg-white/[0.04] border border-white/8 px-3 py-2.5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${it.auto ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                      <div className="min-w-0">
                        <p className="text-[12px] font-bold text-white/85 truncate">
                          {ROUTE_LABELS[it.url.split('?')[0]] || it.url}
                        </p>
                        <p className="text-[10px] text-white/35">
                          {new Date(it.createdAt).toLocaleTimeString('az', { hour: '2-digit', minute: '2-digit' })}
                          {it.attempts > 0 && ` · ${it.attempts} cəhd`}
                          {!it.auto && ' · əl ilə'}
                        </p>
                      </div>
                      <span className={`ml-auto text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0 ${
                        it.auto ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
                      }`}>
                        {it.auto ? 'auto' : 'manual'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setOpen(false)}
                  className="flex-1 py-3 rounded-xl border border-white/10 text-white/60 text-[11px] font-black uppercase tracking-widest">
                  Bağla
                </button>
                <button onClick={sync} disabled={busy || items.length === 0}
                  className="flex-[2] py-3 rounded-xl bg-amber-500 text-black text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-40">
                  <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
                  {busy ? 'Sinxronlaşır...' : 'İNDİ SİNHRONLAŞDIR'}
                </button>
              </div>
              <p className="text-[10px] text-white/30 leading-relaxed">
                <span className="text-emerald-400">● auto</span> = internet qayıtda avtomatik yüklənir (idempotency-guaranteed).{' '}
                <span className="text-amber-400">● manual</span> = mütəxəssis təsdiqi (duplication riski). Ödənişlər idempotency_key ilə qorunur.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
