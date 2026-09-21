'use client';

// QF3 (RED #2): MASANI BOŞALT is a destructive manager op — it is gated by a
// verified manager PIN (server-side: verifyManagerPin) with an optional reason
// (audited via log_audit). The PIN doubles as the shift-lock override.
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, X } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { appleCard, fastExit } from '@/lib/modal-transitions';
import { useVirtualKeyboard } from './VirtualKeyboard';

interface ClearTablePinModalProps {
  open: boolean;
  tableNumber: number;
  onClose: () => void;
  onConfirm: (pin: string, reason: string) => void;
}

export default function ClearTablePinModal({ open, tableNumber, onClose, onConfirm }: ClearTablePinModalProps) {
  const { lightMode } = useTheme();
  const { t } = useLanguage();
  // Yellow #2: lift the card above the in-app virtual keyboard when open.
  const { height: vkHeight } = useVirtualKeyboard();
  const [pin, setPin] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setPin(''); setReason(''); setError(''); }
  }, [open]);

  const canSubmit = pin.length >= 4 && pin.length <= 6 && /^\d+$/.test(pin);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={fastExit}
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          style={{ paddingBottom: vkHeight > 0 ? vkHeight + 12 : undefined }}
          onClick={onClose}
        >
          <motion.div
            {...appleCard}
            transition={fastExit}
            className={`relative w-full max-w-xs rounded-5xl shadow-elevated overflow-hidden ${lightMode ? 'bg-white' : 'bg-zinc-900'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pt-6 pb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-amber-500" />
                <h2 className="text-sm font-black uppercase tracking-widest">{t('clear_table_pin_title')}</h2>
              </div>
              <button onClick={onClose} className={`p-1.5 rounded-full ${lightMode ? 'hover:bg-zinc-100 text-zinc-400' : 'hover:bg-white/10 text-white/40'}`}>
                <X size={16} />
              </button>
            </div>
            <p className={`px-6 text-xs font-bold ${lightMode ? 'text-zinc-500' : 'text-white/40'}`}>
              {t('clear_table_pin_hint').replace('{table}', String(tableNumber))}
            </p>

            <div className="px-6 py-4 space-y-3">
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoFocus
                data-vk="numeric"
                value={pin}
                onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setError(''); }}
                placeholder="••••"
                className={`w-full text-center text-2xl font-black tracking-[0.5em] rounded-xl px-3 py-3 outline-none border ${lightMode ? 'bg-zinc-50 border-zinc-200 focus:border-amber-500 text-black' : 'bg-white/5 border-white/10 focus:border-amber-500 text-white'}`}
              />
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('clear_table_reason')}
                className={`w-full rounded-xl px-3 py-2.5 text-sm font-bold outline-none border ${lightMode ? 'bg-white border-zinc-200 focus:border-zinc-400 text-black' : 'bg-white/5 border-white/10 focus:border-zinc-400/50 text-white'}`}
              />
              {error && <p className="text-xs font-bold text-rose-500">{error}</p>}
            </div>

            <div className="px-6 pb-6">
              <button
                disabled={!canSubmit}
                onClick={() => onConfirm(pin, reason)}
                className="w-full py-4 rounded-2xl bg-rose-600 text-white text-xs font-black uppercase tracking-widest hover:bg-rose-500 active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none"
              >
                {t('confirm')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
