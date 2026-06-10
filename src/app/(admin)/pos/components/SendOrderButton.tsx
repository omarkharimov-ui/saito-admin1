'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Loader2, Send } from 'lucide-react';

export type SendOrderButtonStatus = 'idle' | 'loading' | 'success' | 'error';

interface SendOrderButtonProps {
  disabled?: boolean;
  status: SendOrderButtonStatus;
  onClick: () => Promise<void> | void;
}

export function SendOrderButton({ disabled = false, status, onClick }: SendOrderButtonProps) {
  const handleClick = async () => {
    if (disabled || status === 'loading') return;
    await Promise.resolve(onClick());
  };

  const isActive = status !== 'idle';

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      whileTap={{ scale: 0.98 }}
      animate={{ scale: isActive ? 1.01 : 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="relative w-full overflow-hidden rounded-2xl px-4 py-4 font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-[var(--theme-accent)] text-black shadow-lg shadow-black/20"
    >
      <motion.span
        className="absolute inset-0 bg-white/10"
        initial={false}
        animate={{ opacity: loading ? 1 : 0 }}
        transition={{ duration: 0.2 }}
      />

      <AnimatePresence mode="wait" initial={false}>
        {loading ? (
          <motion.span
            key="loading"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="relative z-10 flex items-center gap-2"
          >
            <Loader2 size={16} className="animate-spin" />
            Göndərilir...
          </motion.span>
        ) : sent ? (
          <motion.span
            key="sent"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="relative z-10 flex items-center gap-2"
          >
            <Check size={16} />
            Mətbəxə göndərildi
          </motion.span>
        ) : failed ? (
          <motion.span
            key="failed"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="relative z-10 flex items-center gap-2"
          >
            <span className="text-base leading-none">✕</span>
            Göndərmək alınmadı
          </motion.span>
        ) : (
          <motion.span
            key="idle"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="relative z-10 flex items-center gap-2"
          >
            <Send size={16} />
            Sifariş göndər
          </motion.span>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {loading && (
          <motion.span
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            exit={{ scaleX: 0 }}
            transition={{ duration: 0.9, ease: 'easeInOut' }}
            className="absolute inset-x-0 bottom-0 h-[3px] origin-left bg-black/20"
          />
        )}
      </AnimatePresence>
    </motion.button>
  );
}
