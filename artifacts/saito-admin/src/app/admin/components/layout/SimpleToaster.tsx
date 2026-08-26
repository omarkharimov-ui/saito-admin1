'use client';

import { useToaster } from '@/lib/toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/lib/theme/ThemeContext';

export default function SimpleToaster() {
  const { toasts, handlers } = useToaster();
  const { startPause, endPause } = handlers;
  const { lightMode } = useTheme();

  const toShow = toasts.slice(-2);

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none"
      style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}
      onMouseEnter={startPause}
      onMouseLeave={endPause}
    >
      <div className="flex flex-col items-center gap-2.5">
        <AnimatePresence mode="popLayout">
          {toShow.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 500, damping: 35, mass: 0.8 }}
              className="pointer-events-auto select-none rounded-2xl px-4 py-3 font-semibold text-[13px] max-w-[min(380px,calc(100vw-24px))] shadow-[0_4px_24px_rgba(0,0,0,0.15)]"
              style={{
                background: lightMode ? '#ffffff' : '#1C1C1E',
                color: t.type === 'error' ? '#FF453A' : lightMode ? '#1C1C1E' : '#F5F5F7',
                border: `0.5px solid ${lightMode ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'}`,
                WebkitBackdropFilter: 'blur(20px)',
                backdropFilter: 'blur(20px)',
              }}
            >
              <div className="flex items-center gap-2.5">
                {t.type === 'success' && (
                  <div className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34C759" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </div>
                )}
                {t.type === 'error' && (
                  <div className="w-5 h-5 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF453A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </div>
                )}
                <span className="leading-tight">
                  {typeof t.message === 'function'
                    ? (t.message as (t: any) => React.ReactNode)(t)
                    : t.message as React.ReactNode}
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
