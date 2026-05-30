'use client';

import { useToaster } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useRef, useEffect } from 'react';

const variants = {
  init: { opacity: 0, y: -12, scale: 0.92 },
  show: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.92 },
};

const shakeKeyframes = {
  x: [0, -6, 6, -6, 6, -4, 4, -2, 2, 0],
};

export default function SimpleToaster() {
  const { toasts, handlers } = useToaster();
  const { startPause, endPause } = handlers;
  const seen = useRef(new Set<string>());

  useEffect(() => {
    const visible = new Set(toasts.map((t) => t.id));
    for (const id of seen.current) {
      if (!visible.has(id)) seen.current.delete(id);
    }
  }, [toasts]);

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
          {toShow.map((t) => {
            const isRepeat = seen.current.has(t.id);
            seen.current.add(t.id);

            return (
              <motion.div
                key={t.id}
                layout
                variants={variants}
                initial={isRepeat ? 'show' : 'init'}
                animate={isRepeat ? shakeKeyframes : 'show'}
                exit="exit"
                transition={isRepeat ? { duration: 0.45 } : { type: 'spring', stiffness: 400, damping: 25 }}
                className="pointer-events-auto select-none"
                style={{
                  background: t.type === 'error' ? '#1a0808' : '#0d0b00',
                  color: t.type === 'error' ? '#fca5a5' : '#D4AF37',
                  border: t.type === 'error'
                    ? '1px solid rgba(248,113,113,0.25)'
                    : '1px solid rgba(212,175,55,0.28)',
                  borderRadius: '14px',
                  padding: '10px 14px',
                  fontWeight: 600,
                  fontSize: 13,
                  maxWidth: 'min(360px, calc(100vw - 24px))',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
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
                  <span>{typeof t.message === 'string' ? t.message : ''}</span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
