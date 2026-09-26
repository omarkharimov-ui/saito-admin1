'use client';

// 2026-09-26 (Q8 offline phase 1, owner: "offline 10000% bunu basla"):
// global admin banner — amber pill, fixed top-center, spring 500/26 (owner
// DNA). Shows: net state + queued-ops count + sync-complete toasts.
// Starts the monitor + replay pump once per session (idempotent).
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, RefreshCw } from 'lucide-react';
import { startMonitor, useIsOffline } from '@/lib/offline/monitor';
import { startReplayPump, useQueueCount, onSyncComplete } from '@/lib/offline/queue';
import { toast } from '@/lib/toast';

export default function OfflineBanner() {
  const offline = useIsOffline();
  const queueCount = useQueueCount();

  useEffect(() => {
    startMonitor();
    startReplayPump();
    return onSyncComplete((synced, _err) => {
      if (synced > 0) {
        toast.success(`${synced} əməliyyat sinxronlaşdı ✓`);
      }
    });
  }, []);

  return (
    <AnimatePresence>
      {offline && (
        <motion.div
          initial={{ opacity: 0, y: -18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -14, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 500, damping: 26 }}
          className="fixed top-3 left-1/2 -translate-x-1/2 z-[9998] pointer-events-none"
        >
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-amber-500/95 text-black shadow-[0_12px_40px_rgba(245,158,11,0.35)] backdrop-blur border border-amber-400/60">
            <WifiOff size={15} className="shrink-0" />
            <span className="text-[11px] font-black uppercase tracking-widest whitespace-nowrap">
              Offline — yerli rejim
            </span>
            {queueCount > 0 && (
              <span className="flex items-center gap-1.5 text-[11px] font-black whitespace-nowrap bg-black/15 rounded-full px-2.5 py-0.5">
                <RefreshCw size={11} className="animate-spin" style={{ animationDuration: '2.4s' }} />
                {queueCount} gözləyir
              </span>
            )}
            <span className="text-[10px] font-bold opacity-70 whitespace-nowrap hidden sm:inline">
              sinxron qayıdarkən avtomatik yüklənəcək
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
