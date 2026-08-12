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

  return (
    <button
      disabled={disabled}
      onClick={handleClick}
      className={`
        relative h-[72px] rounded-4xl font-black uppercase tracking-[0.2em] text-[13px]
        flex items-center justify-center gap-3 transition-all duration-150
        ${status === 'loading' ? 'cursor-wait' : 'cursor-pointer'}
        ${variant === 'loss' 
          ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/20' 
          : status === 'success'
            ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
            : status === 'error'
              ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30'
              : isDirty 
                ? (lightMode ? 'bg-zinc-900 text-white shadow-xl shadow-black/10' : 'bg-white text-black shadow-xl shadow-white/5') 
                : (lightMode ? 'bg-zinc-200 text-zinc-500' : 'bg-zinc-800 text-white/40')
        }
        ${className}
      `}
    >
      {/* Dirty dot */}
      {isDirty && !isLoading && !isSuccess && !isError && (
        <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${lightMode ? 'bg-zinc-900 shadow-[0_0_8px_rgba(0,0,0,0.3)]' : 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]'}`} />
      )}

      <AnimatePresence mode="wait">
        {isLoading ? (
            <motion.span
            key="loading"
            initial={{ opacity: 0, rotate: -90 }}
            animate={{ opacity: 1, rotate: 0 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
          >
            <Loader2 size={20} className="animate-spin text-white" />
          </motion.span>
        ) : isSuccess ? (
            <motion.span
            key="success"
            initial={{ opacity: 0, scale: 0.4, width: 0 }}
            animate={{ opacity: 1, scale: 1, width: 'auto' }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            className="flex items-center gap-2 overflow-hidden whitespace-nowrap"
          >
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-300">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </motion.span>
            <motion.span
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
              className="text-emerald-100"
            >
              {t('confirmed')}
            </motion.span>
          </motion.span>
        ) : isError ? (
            <motion.span
            key="failed"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            className="flex items-center gap-2"
          >
            <span className="text-xl leading-none text-red-400">×</span>
            <span className="text-xs font-black text-red-300 uppercase tracking-wider">{t('error_retry')}</span>
          </motion.span>
        ) : (
            <motion.span
            key="idle"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            className="flex items-center gap-2.5"
          >
            {variant === 'send' ? <Send size={16} /> : <CheckCircle size={16} />}
            {label || (variant === 'send' ? t('send_to_kitchen') : t('confirm_changes'))}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
