'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Check, CheckCircle, Loader2, Send } from 'lucide-react';

export type SendOrderButtonStatus = 'idle' | 'loading' | 'success' | 'error';

interface SendOrderButtonProps {
  disabled?: boolean;
  status: SendOrderButtonStatus;
  onClick: () => Promise<void> | void;
  label?: string;
  variant?: 'send' | 'loss';
}

export function SendOrderButton({ disabled = false, status, onClick, label, variant = 'send' }: SendOrderButtonProps) {
  const handleClick = async () => {
    if (disabled || status === 'loading') return;
    await Promise.resolve(onClick());
  };

  const isLoading = status === 'loading';
  const isSuccess = status === 'success';
  const isError = status === 'error';

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      disabled={disabled || isLoading}
      animate={{
        width: isLoading ? 52 : '100%',
        borderRadius: isLoading ? '50%' : 16,
        padding: isLoading ? '0px' : undefined,
      }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className={`relative overflow-hidden font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
        isLoading ? 'h-[52px] mx-auto' : 'px-4 py-4 w-full'
      } ${
        variant === 'loss'
          ? 'bg-red-600/15 border border-red-500/25 text-red-300 hover:bg-red-600/25 shadow-[0_0_15px_rgba(239,68,68,0.1)]'
          : 'bg-[var(--theme-accent)] text-black shadow-lg shadow-black/20'
      }`}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isLoading ? (
          <motion.span
            key="loading"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
          >
            <Loader2 size={20} className="animate-spin" />
          </motion.span>
        ) : isSuccess ? (
          <motion.span
            key="sent"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex items-center gap-2"
          >
            <Check size={18} />
            <span className="hidden sm:inline">Mətbəxə göndərildi</span>
          </motion.span>
        ) : isError ? (
          <motion.span
            key="failed"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex items-center gap-2"
          >
            <span className="text-base leading-none">✕</span>
            <span className="hidden sm:inline">Göndərmək alınmadı</span>
          </motion.span>
        ) : (
          <motion.span
            key="idle"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex items-center gap-2"
          >
            {variant === 'send' ? <Send size={16} /> : <CheckCircle size={16} />}
            {label || (variant === 'send' ? 'Sifariş göndər' : 'Dəyişiklikləri Təsdiqlə')}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
