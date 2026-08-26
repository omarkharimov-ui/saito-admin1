'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, Wallet, CreditCard, X } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from '@/lib/toast';
import { appleCard, fastExit } from '@/lib/modal-transitions';

interface RefundModalProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  paidAmount: number;
  paymentMethod?: string;
  onSuccess: () => void;
}

export function RefundModal({ open, onClose, orderId, paidAmount, paymentMethod = 'cash', onSuccess }: RefundModalProps) {
  const { lightMode } = useTheme();
  const { t } = useLanguage();
  const keyboardHeight = useKeyboardHeight();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState<'cash' | 'card'>(paymentMethod === 'card' ? 'card' : 'cash');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount('');
      setReason('');
      setMethod(paymentMethod === 'card' ? 'card' : 'cash');
    }
  }, [open, paymentMethod]);

  const refundAmount = parseFloat(amount) || 0;
  const isFullRefund = Math.abs(refundAmount - paidAmount) < 0.01;
  const isValid = refundAmount > 0 && refundAmount <= paidAmount + 0.01;

  const handleRefund = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/orders/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          amount: refundAmount,
          method,
          reason: reason || 'Müştəri şikayəti',
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(t('refund_success') || 'Geri ödəniş edildi');
        onSuccess();
        onClose();
      } else {
        toast.error(data.error || t('refund_error') || 'Geri ödəniş uğursuz oldu');
      }
    } catch {
      toast.error(t('network_error') || 'Şəbəkə xətası');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="refund-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={fastExit}
          className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/25 backdrop-blur-sm"
          onClick={onClose}
          style={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight : undefined }}
        >
          <motion.div
            {...appleCard}
            transition={fastExit}
            onClick={e => e.stopPropagation()}
            className={`w-80 rounded-3xl p-7 shadow-elevated border backdrop-blur-lg ${lightMode ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-white/10'}`}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <RotateCcw size={18} className="text-amber-500" />
                <p className="text-sm font-black">{t('refund') || 'Geri ödəniş'}</p>
              </div>
              <button onClick={onClose} className={`p-1.5 rounded-xl transition-all ${lightMode ? 'hover:bg-zinc-100' : 'hover:bg-white/10'}`}>
                <X size={16} />
              </button>
            </div>

            {/* Paid amount info */}
            <div className={`p-3 rounded-2xl border mb-4 ${lightMode ? 'bg-zinc-50 border-zinc-100' : 'bg-white/5 border-white/5'}`}>
              <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                {t('paid_amount') || 'Ödənilən məbləğ'}
              </p>
              <p className={`text-lg font-black tabular-nums ${lightMode ? 'text-black' : 'text-white'}`}>
                ₼{paidAmount.toFixed(2)}
              </p>
            </div>

            {/* Refund amount input */}
            <div className="mb-4">
              <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                {t('refund_amount') || 'Geri qaytarılacaq məbləğ'}
              </p>
              <div className="relative">
                <span className={`absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>₼</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={paidAmount}
                  autoFocus
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className={`w-full rounded-2xl pl-9 pr-5 py-4 text-lg font-black outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black focus:border-amber-400' : 'bg-white/5 border-white/10 text-white focus:border-amber-400/50'}`}
                />
              </div>
              {/* Quick buttons */}
              <div className="flex gap-2 mt-2">
                {[
                  { label: '25%', value: paidAmount * 0.25 },
                  { label: '50%', value: paidAmount * 0.5 },
                  { label: '75%', value: paidAmount * 0.75 },
                  { label: t('full') || 'Tam', value: paidAmount },
                ].map(btn => (
                  <button
                    key={btn.label}
                    onClick={() => setAmount(btn.value.toFixed(2))}
                    className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all ${
                      Math.abs(refundAmount - btn.value) < 0.01
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                        : lightMode ? 'bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-amber-50' : 'bg-white/5 border-white/10 text-white/40 hover:bg-amber-500/10'
                    } active:scale-95`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Method selector */}
            <div className="mb-4">
              <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                {t('refund_method') || 'Geri qaytarma üsulu'}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setMethod('cash')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border text-sm font-black transition-all ${
                    method === 'cash'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                      : lightMode ? 'bg-zinc-50 border-zinc-200 text-zinc-500' : 'bg-white/5 border-white/10 text-white/40'
                  } active:scale-95`}
                >
                  <Wallet size={16} />
                  {t('cash') || 'Nağd'}
                </button>
                <button
                  onClick={() => setMethod('card')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border text-sm font-black transition-all ${
                    method === 'card'
                      ? 'bg-blue-500/10 border-blue-500/30 text-blue-500'
                      : lightMode ? 'bg-zinc-50 border-zinc-200 text-zinc-500' : 'bg-white/5 border-white/10 text-white/40'
                  } active:scale-95`}
                >
                  <CreditCard size={16} />
                  {t('card') || 'Kart'}
                </button>
              </div>
            </div>

            {/* Reason */}
            <div className="mb-5">
              <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                {t('refund_reason') || 'Səbəb'}
              </p>
              <input
                type="text"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder={t('refund_reason_placeholder') || 'Müştəri şikayəti...'}
                className={`w-full rounded-2xl px-5 py-3 text-sm font-bold outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black placeholder:text-zinc-300 focus:border-amber-400' : 'bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-amber-400/50'}`}
              />
            </div>

            {/* Warning */}
            {isFullRefund && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-3 rounded-2xl border mb-4 ${lightMode ? 'bg-amber-50 border-amber-200' : 'bg-amber-500/10 border-amber-500/20'}`}
              >
                <p className={`text-xs font-bold ${lightMode ? 'text-amber-700' : 'text-amber-300'}`}>
                  ⚠ {t('full_refund_warning') || 'Tam geri ödəniş — əməliyyat geri alınamaz'}
                </p>
              </motion.div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className={`flex-1 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all ${lightMode ? 'border-zinc-200 text-zinc-500 hover:bg-zinc-50' : 'border-white/10 text-white/50 hover:bg-white/5'}`}
              >
                {t('cancel') || 'Ləğv et'}
              </button>
              <button
                onClick={handleRefund}
                disabled={!isValid || loading}
                className="flex-1 py-3.5 rounded-2xl bg-amber-500 text-white text-xs font-black uppercase tracking-widest hover:bg-amber-600 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t('processing') || 'Gözləyin'}
                  </span>
                ) : t('confirm_refund') || 'Geri qaytar'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
