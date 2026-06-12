'use client';

import { useToaster } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/lib/theme/ThemeContext';

const variants = {
  init: { opacity: 0, y: -12, scale: 0.92 },
  show: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.92 },
};

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
      <div className="flex flex-col items-center gap-2">
        <AnimatePresence mode="popLayout">
          {toShow.map((t) => (
            <motion.div
              key={t.id}
              layout
              variants={variants}
              initial="init"
              animate="show"
              exit="exit"
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="pointer-events-auto select-none rounded-[14px] px-3.5 py-2.5 font-semibold text-[13px] max-w-[min(360px,calc(100vw-24px))] shadow-[0_8px_32px_rgba(0,0,0,0.12)] border"
              style={{
                background: t.type === 'error' ? 'var(--theme-panel)' : 'var(--theme-panel-strong)',
                color: t.type === 'error' ? '#dc2626' : 'var(--theme-accent)',
                borderColor: t.type === 'error' ? 'rgba(248,113,113,0.25)' : 'var(--theme-accent-border)',
              }}
            >
              <div className="flex items-center gap-2">
                {t.type === 'success' && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
                {t.type === 'error' && (
                  <span style={{ color: '#f87171', fontSize: 14 }}>✕</span>
                )}
                <span>
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
