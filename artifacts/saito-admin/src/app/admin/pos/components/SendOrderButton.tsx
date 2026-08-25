'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Armchair, CheckCircle, Loader2, MoreHorizontal, PlusCircle, Send } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';

export type SendOrderButtonStatus = 'idle' | 'loading' | 'success' | 'error';
export type SendOrderAction = 'send' | 'seat' | 'add' | 'actions';

interface SendOrderButtonProps {
  disabled?: boolean;
  status: SendOrderButtonStatus;
  onClick: () => Promise<void> | void;
  label?: string;
  variant?: 'send' | 'loss';
  action?: SendOrderAction;
  isDirty?: boolean;
  className?: string;
}

const ACTION_ICON: Record<Exclude<SendOrderAction, 'send'>, typeof Send> = {
  seat: Armchair,
  add: PlusCircle,
  actions: MoreHorizontal,
};

export function SendOrderButton({ disabled = false, status, onClick, label, variant = 'send', action = 'send', isDirty = false, className = '' }: SendOrderButtonProps) {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  const handleClick = async () => {
    if (disabled || status === 'loading') return;
    await Promise.resolve(onClick());
  };

  const isLoading = status === 'loading';
  const isSuccess = status === 'success';
  const isError = status === 'error';
  const isContextual = variant === 'send' && !isLoading && !isSuccess && !isError && action !== 'send';

  const defaultLabel = variant === 'loss'
    ? t('confirm_changes')
    : action === 'seat' ? t('seat_table')
      : action === 'add' ? t('add_items')
        : action === 'actions' ? t('actions')
          : isDirty ? t('send_to_kitchen') : t('send_to_kitchen');

  return (
    <button
      disabled={disabled}
      onClick={handleClick}
      className={`
        relative h-[72px] rounded-4xl font-black uppercase tracking-[0.2em] text-[13px]
        flex items-center justify-center gap-3 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
        ${status === 'loading' ? 'cursor-wait' : 'cursor-pointer'}
        ${variant === 'loss'
          ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/20'
          : isSuccess
            ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
            : isError
              ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30'
              : isContextual
                ? (action === 'seat'
                  ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-900/25 hover:brightness-110'
                  : (lightMode
                    ? 'bg-zinc-900 text-white shadow-xl shadow-black/10 hover:bg-zinc-800'
                    : 'bg-zinc-800 text-white shadow-xl shadow-white/5 hover:bg-zinc-700'))
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
            initial={{ opacity: 0, scale: 0.5, filter: 'blur(6px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.6, filter: 'blur(6px)' }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          >
            <Loader2 size={20} className="animate-spin text-white" />
          </motion.span>
        ) : isSuccess ? (
            <motion.span
            key="success"
            initial={{ opacity: 0, scale: 0.4, width: 0, filter: 'blur(6px)' }}
            animate={{ opacity: 1, scale: 1, width: 'auto', filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.8, filter: 'blur(4px)' }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            className="flex items-center gap-2 overflow-hidden whitespace-nowrap"
          >
            <motion.span
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-300">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </motion.span>
            <motion.span
              initial={{ opacity: 0, x: -10, filter: 'blur(4px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              className="text-emerald-100"
            >
              {t('confirmed')}
            </motion.span>
          </motion.span>
        ) : isError ? (
            <motion.span
            key="failed"
            initial={{ opacity: 0, scale: 0.5, filter: 'blur(6px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.7, filter: 'blur(4px)' }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            className="flex items-center gap-2"
          >
            <span className="text-xl leading-none text-red-400">×</span>
            <span className="text-xs font-black text-red-300 uppercase tracking-wider">{t('error_retry')}</span>
          </motion.span>
        ) : (
            <motion.span
            key={`idle-${action}-${label || ''}`}
            initial={{ opacity: 0, y: 14, scale: 0.92, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -14, scale: 0.95, filter: 'blur(6px)' }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="flex items-center gap-2.5 whitespace-nowrap"
          >
            {(() => {
              if (variant === 'loss') return <CheckCircle size={16} />;
              if (action !== 'send') {
                const Icon = ACTION_ICON[action as Exclude<SendOrderAction, 'send'>];
                return <Icon size={17} />;
              }
              return <Send size={16} />;
            })()}
            {label || defaultLabel}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
