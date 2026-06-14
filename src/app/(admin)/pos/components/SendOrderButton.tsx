'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, Loader2, Send } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export type SendOrderButtonStatus = 'idle' | 'loading' | 'success' | 'error';

interface SendOrderButtonProps {
  disabled?: boolean;
  status: SendOrderButtonStatus;
  onClick: () => Promise<void> | void;
  label?: string;
  variant?: 'send' | 'loss';
  isDirty?: boolean;
}

export function SendOrderButton({ disabled = false, status, onClick, label, variant = 'send', isDirty = false }: SendOrderButtonProps) {
  const { t } = useLanguage();
  const handleClick = async () => {
    if (disabled || status === 'loading') return;
    await Promise.resolve(onClick());
  };

  const isLoading = status === 'loading';
  const isSuccess = status === 'success';
  const isError = status === 'error';
  const showText = !isLoading && !isSuccess && !isError;

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      disabled={disabled || isLoading}
      whileTap={{ scale: 0.95 }}
      layout
      transition={{ type: 'spring', stiffness: 400, damping: 28, mass: 0.8 }}
      className={`relative overflow-hidden font-semibold text-sm flex items-center justify-center gap-2 rounded-full disabled:opacity-40 disabled:cursor-not-allowed ${
        variant === 'loss'
          ? 'bg-red-600/15 border border-red-500/25 text-red-300'
          : 'bg-neutral-900 text-white active:bg-neutral-800'
      } ${showText ? 'h-[44px] px-5' : 'h-[44px] w-[44px]'}`}
    >
      {/* Dirty dot */}
      {isDirty && !isLoading && !isSuccess && !isError && (
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]" />
      )}

      <AnimatePresence mode="wait" initial={false}>
        {isLoading ? (
          <motion.span
            key="loading"
            initial={{ opacity: 0, rotate: -90 }}
            animate={{ opacity: 1, rotate: 0 }}
            exit={{ opacity: 0, rotate: 90 }}
            transition={{ duration: 0.18 }}
          >
            <Loader2 size={18} className="animate-spin" />
          </motion.span>
        ) : isSuccess ? (
          <motion.span
            key="success"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.4 }}
            transition={{ type: 'spring', stiffness: 350, damping: 18 }}
          >
            <CheckCircle size={18} className="text-emerald-400" />
          </motion.span>
        ) : isError ? (
          <motion.span
            key="failed"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.15 }}
          >
            <span className="text-base leading-none text-red-400">✕</span>
          </motion.span>
        ) : (
          <motion.span
            key="idle"
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.12 }}
            className="flex items-center gap-2"
          >
            {variant === 'send' ? <Send size={15} /> : <CheckCircle size={15} />}
            {label || (variant === 'send' ? 'Sifariş göndər' : 'Dəyişiklikləri Təsdiqlə')}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
