'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, Loader2, Send } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';

export type SendOrderButtonStatus = 'idle' | 'loading' | 'success' | 'error';

interface SendOrderButtonProps {
  disabled?: boolean;
  status: SendOrderButtonStatus;
  onClick: () => Promise<void> | void;
  label?: string;
  variant?: 'send' | 'loss';
  isDirty?: boolean;
  className?: string;
}

export function SendOrderButton({ disabled = false, status, onClick, label, variant = 'send', isDirty = false, className = '' }: SendOrderButtonProps) {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  const handleClick = async () => {
    if (disabled || status === 'loading') return;
    await Promise.resolve(onClick());
  };

  const isLoading = status === 'loading';
  const isSuccess = status === 'success';
  const isError = status === 'error';
  const isCompact = isLoading || isSuccess || isError;

  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`
        relative h-[72px] rounded-[24px] font-black uppercase tracking-[0.2em] text-[13px]
        flex items-center justify-center gap-3 transition-all duration-300
        ${status === 'loading' ? 'cursor-wait' : 'cursor-pointer'}
        ${variant === 'loss' 
          ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/20' 
          : status === 'success'
            ? 'bg-emerald-500 text-white'
            : status === 'error'
              ? 'bg-rose-500 text-white'
              : isDirty 
                ? (lightMode ? 'bg-zinc-900 text-white shadow-xl shadow-black/10' : 'bg-white text-black shadow-xl shadow-white/5') 
                : 'bg-zinc-800 text-white/40'
        }
        ${className}
      `}
    >
      {/* Dirty dot */}
      {isDirty && !isLoading && !isSuccess && !isError && (
        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
      )}

      <AnimatePresence mode="wait" initial={false}>
        {isLoading ? (
          <motion.span
            key="loading"
            initial={{ opacity: 0, rotate: -90 }}
            animate={{ opacity: 1, rotate: 0 }}
            exit={{ opacity: 0, rotate: 90 }}
            transition={{ duration: 0.2 }}
          >
            <Loader2 size={20} className="animate-spin text-white" />
          </motion.span>
        ) : isSuccess ? (
          <motion.span
            key="success"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.4 }}
            transition={{ type: 'spring', stiffness: 350, damping: 18 }}
          >
            <CheckCircle size={20} className="text-emerald-400" />
          </motion.span>
        ) : isError ? (
          <motion.span
            key="failed"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.15 }}
          >
            <span className="text-xl leading-none text-red-400">✕</span>
          </motion.span>
        ) : (
          <motion.span
            key="idle"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-2.5"
          >
            {variant === 'send' ? <Send size={16} /> : <CheckCircle size={16} />}
            {label || (variant === 'send' ? 'Sifariş göndər' : 'Dəyişiklikləri Təsdiqlə')}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
