'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, X } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { apiFetch } from '@/lib/api-fetch';
import { appleCard, appleBackdrop, fastExit } from '@/lib/modal-transitions';

interface PinGuardProps {
  open: boolean;
  onClose: () => void;
  onVerified: () => void;
  title?: string;
  action?: string;
}

const ACTION_LABELS: Record<string, string> = {
  void_item: 'void_item',
  loss: 'İtki yazmaq',
  dismiss: 'dismiss_table',
  reprint: 'reprint',
  refund: 'refund',
  split: 'order_split',
  merge: 'merge',
  transfer: 'transfer',
  admin: 'admin_action',
};

export function PinGuard({ open, onClose, onVerified, title, action = 'admin' }: PinGuardProps) {
  const { lightMode } = useTheme()
  const { t } = useLanguage();
  const keyboardHeight = useKeyboardHeight();
  const [pin, setPin] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPin('');
      setError('');
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (pin.length < 4) return;
    setVerifying(true);
    setError('');
    try {
      const res = await apiFetch('/api/auth/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, action }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        onVerified();
        onClose();
      } else {
        setError(data.error || t('wrong_pin'));
        setPin('');
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    } catch {
      setError(t('network_error'));
      setPin('');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
          <motion.div
            key="pin-guard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fastExit}
            className="fixed inset-0 z-[140] flex items-center justify-center bg-black/25 backdrop-blur-[2px]"
            style={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight : undefined }}
            onClick={onClose}
          >
          <motion.div
            {...appleCard}
            transition={fastExit}
            onClick={e => e.stopPropagation()}
            className={`w-80 rounded-3xl p-7 shadow-elevated border backdrop-blur-2xl ${lightMode ? 'bg-white/85 border-zinc-200' : 'bg-zinc-900/85 border-white/10'}`}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Shield size={18} className="text-amber-500" />
                <p className="text-sm font-black">{t('security')}</p>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/10 transition-all">
                <X size={16} />
              </button>
            </div>

            <p className={`text-xs font-bold uppercase tracking-widest mb-4 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
              {title || `${t(ACTION_LABELS[action] as any || 'admin_action')} ${t('pin_for')}`}
            </p>

            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
              placeholder="• • • •"
               className={`w-full rounded-2xl px-5 py-4 text-center text-2xl font-black tracking-[0.5em] outline-none border transition-all ${
                 error
                   ? 'border-red-400 focus:border-red-500'
                   : lightMode ? 'bg-zinc-50 border-zinc-200 focus:border-zinc-400' : 'bg-white/5 border-white/10 focus:border-zinc-400/50'
               } ${lightMode ? 'text-black' : 'text-white'}`}
            />

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xs font-bold text-red-400 mt-2 text-center"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <div className="flex gap-3 mt-5">
              <button onClick={onClose} className={`flex-1 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all ${lightMode ? 'border-zinc-200 text-zinc-500 hover:bg-zinc-50' : 'border-white/10 text-white/50 hover:bg-white/5'}`}>
                t('cancel')
              </button>
              <button
                onClick={handleSubmit}
                disabled={pin.length < 4 || verifying}
                className="flex-1 py-3.5 rounded-2xl bg-amber-500 text-white text-xs font-black uppercase tracking-widest hover:bg-amber-600 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20"
              >
                {verifying ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    t('checking')
                  </span>
                ) : t('confirm')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
