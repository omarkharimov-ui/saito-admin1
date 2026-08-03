'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Check, Wallet, CreditCard, X } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { appleCard, appleBackdrop } from '@/lib/modal-transitions';

interface PaymentSuccessModalProps {
  open: boolean;
  onClose: () => void;
  orderNumber?: string;
  tableNumber?: number | string;
  total: number;
  paymentMethod: string;
  tenderedAmount?: number;
  change?: number;
}

export function PaymentSuccessModal({
  open,
  onClose,
  orderNumber,
  tableNumber,
  total,
  paymentMethod,
  tenderedAmount,
  change,
}: PaymentSuccessModalProps) {
  const { lightMode } = useTheme();

  const isCash = paymentMethod === 'cash' || paymentMethod === 'split';
  const methodLabel = paymentMethod === 'cash' ? 'Nağd' : paymentMethod === 'card' ? 'Kart' : paymentMethod === 'split' ? 'Bölünmüş' : paymentMethod;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={appleBackdrop}
          className="fixed inset-0 z-[125] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            {...appleCard}
            className={`relative w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden ${
              lightMode ? 'bg-white' : 'bg-zinc-900'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Success header */}
            <div className="flex flex-col items-center pt-8 pb-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 20, delay: 0.1 }}
                >
                  <Check size={32} className="text-emerald-500" strokeWidth={3} />
                </motion.div>
              </div>
              <h2 className="text-lg font-black tracking-tight">Ödəniş Tamamlandı</h2>
              {orderNumber && (
                <p className={`text-xs font-bold mt-1 ${lightMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  Sifariş {orderNumber}{tableNumber ? ` · Masa ${tableNumber}` : ''}
                </p>
              )}
            </div>

            {/* Divider */}
            <div className={`mx-6 h-px ${lightMode ? 'bg-zinc-200' : 'bg-white/10'}`} />

            {/* Amounts */}
            <div className="px-6 py-5 space-y-3">
              {/* Yekun */}
              <div className="flex items-center justify-between">
                <span className={`text-sm font-bold ${lightMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Hesab</span>
                <span className="text-lg font-black tabular-nums">{total.toFixed(2)} ₼</span>
              </div>

            {/* Verilən pul (yalnız nağd) */}
               {isCash && tenderedAmount != null && (
                 <div className="flex items-center justify-between">
                   <span className={`text-sm font-bold ${lightMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Verilən</span>
                   <span className="text-sm font-black tabular-nums">{tenderedAmount.toFixed(2)} ₼</span>
                 </div>
               )}

               {/* Qalıq (yalnız nağd və tendered > total) */}
               {isCash && change != null && change > 0 && (
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-bold ${lightMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Qalıq</span>
                  <span className="text-lg font-black tabular-nums text-emerald-500">{change.toFixed(2)} ₼</span>
                </div>
              )}

              {/* Ödəniş növü */}
              <div className="flex items-center justify-between">
                <span className={`text-sm font-bold ${lightMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Ödəniş</span>
                <span className="flex items-center gap-1.5 text-sm font-bold">
                  {isCash ? <Wallet size={14} className="text-emerald-500" /> : <CreditCard size={14} className="text-blue-500" />}
                  {methodLabel}
                </span>
              </div>
            </div>

            {/* Divider */}
            <div className={`mx-6 h-px ${lightMode ? 'bg-zinc-200' : 'bg-white/10'}`} />

            {/* Close button */}
            <div className="p-6 pt-4">
              <button
                onClick={onClose}
                className="w-full py-4 rounded-2xl bg-zinc-900 text-white text-xs font-black uppercase tracking-widest hover:bg-zinc-700 transition-all active:scale-[0.98] dark:bg-white dark:text-black"
              >
                Bağla
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
