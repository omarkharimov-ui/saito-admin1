'use client';

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, Wallet, CreditCard, X, TriangleAlert } from '@/components/ui/saito-icons';
// SPRING here = the single POS micro spring (pos-motion) — button/pill pops.
import { SPRING } from '../lib/pos-motion';
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
  // 2026-09-29 (owner: "refund-dəki hər state machine üçün transition"):
  // the quick-% active highlight is ONE measured sliding capsule (same
  // pattern as the product-modal instance pills) — state→motion, not a
  // static repaint.
  const quickRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [quickInd, setQuickInd] = useState<{ x: number; w: number } | null>(null);
  // P-4 (D-1/D-4): refund retry token memoized per (order, amount) for this
  // modal instance. A double-click / lost-response retry of the SAME amount
  // reuses the SAME key → the DB replays the stored result (one refund row).
  // A different amount gets a different key → independent refund. Sending the
  // same key with a different amount is a 409 IDEMPOTENCY_CONFLICT at the
  // boundary. Key text is opaque to the boundary; namespace 'refund' + the
  // order/amount binding are enforced server-side.
  // Derived money values are computed BEFORE refundKey (below) so the callback
  // and its dependency array never reference a block-scoped const before its
  // declaration (TDZ — this was a build-breaking TS error on Vercel).
  const refundAmount = parseFloat(amount) || 0;
  const isFullRefund = Math.abs(refundAmount - paidAmount) < 0.01;
  const isValid = refundAmount > 0 && refundAmount <= paidAmount + 0.01;

  const refundKeyRef = useRef<Map<string, string>>(new Map());
  const refundKey = useCallback(() => {
    const k = `${orderId}|${refundAmount}`;
    let tok = refundKeyRef.current.get(k);
    if (!tok) {
      tok = `refund:${orderId}:${refundAmount}:${crypto.randomUUID()}`;
      refundKeyRef.current.set(k, tok);
    }
    return tok;
  }, [orderId, refundAmount]);

  useEffect(() => {
    if (open) {
      setAmount('');
      setReason('');
      setMethod(paymentMethod === 'card' ? 'card' : 'cash');
    }
  }, [open, paymentMethod]);

  const quickBtns = [
    { label: '25%', value: paidAmount * 0.25 },
    { label: '50%', value: paidAmount * 0.5 },
    { label: '75%', value: paidAmount * 0.75 },
    { label: t('full') || 'Tam', value: paidAmount },
  ];
  const activeQuickIdx = quickBtns.findIndex(b => Math.abs(refundAmount - b.value) < 0.01);
  // Measure the active quick button (layout coords — immune to the modal's
  // open scale) and spring the capsule to it on every state change.
  useLayoutEffect(() => {
    if (!open || activeQuickIdx < 0) { setQuickInd(null); return; }
    const el = quickRefs.current[activeQuickIdx];
    if (!el) return;
    setQuickInd((prev) => (prev && prev.x === el.offsetLeft && prev.w === el.offsetWidth ? prev : { x: el.offsetLeft, w: el.offsetWidth }));
  }, [open, activeQuickIdx, paidAmount]);
  // 2026-09-29 (owner: "refund modalında problem var"): over-amount entry is a
  // REAL STATE now — red border + one-line hint (spring pop), not a silent
  // disabled button.
  const isOverAmount = refundAmount > paidAmount + 0.01;

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
          idempotency_key: refundKey(),
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
          // 2026-09-27 (owner: "klavye popup-ın üstünə çıxır, yazmaq olmaz"):
          // lift above BOTH the native keyboard and the in-app VirtualKeyboard
          // (--vk-height is set globally on <html> while the VKB is open).
          style={{ paddingBottom: `calc(var(--vk-height, 0px) + ${keyboardHeight > 0 ? keyboardHeight : 0}px + 16px)` }}
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
                <RotateCcw size={18} className={lightMode ? 'text-zinc-900' : 'text-amber-500'} />
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
                  className={`w-full rounded-2xl pl-9 pr-5 py-4 text-lg font-black outline-none border transition-all ${
                    isOverAmount
                      ? 'bg-red-500/5 border-red-500/60 text-red-600 dark:text-red-300'
                      : lightMode ? 'bg-white border-black/10 text-black focus:border-emerald-400' : 'bg-white/5 border-white/10 text-white focus:border-emerald-400/50'
                  }`}
                />
              </div>
              {/* 2026-09-29 (owner: "refund-dəki hər state machine üçün
                  transition"): the active quick-% highlight is a MEASURED
                  sliding capsule (springs between buttons on state change);
                  over-amount gets its own error state with a spring-pop hint. */}
              <div className="relative flex gap-2 mt-2">
                {quickInd && (
                  <motion.div
                    aria-hidden
                    initial={false}
                    animate={{ x: quickInd.x, width: quickInd.w }}
                    transition={SPRING}
                    className={`absolute top-0 bottom-0 rounded-xl border ${lightMode ? 'bg-zinc-900/10 border-zinc-900/25' : 'bg-amber-500/10 border-amber-500/30'}`}
                  />
                )}
                {quickBtns.map((btn, i) => (
                  <button
                    key={btn.label}
                    ref={(el) => { quickRefs.current[i] = el; }}
                    onClick={() => setAmount(btn.value.toFixed(2))}
                    className={`relative z-10 flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-colors duration-200 active:scale-95 ${
                      activeQuickIdx === i
                        ? (lightMode ? 'border-transparent text-zinc-900' : 'border-transparent text-amber-400')
                        : lightMode ? 'bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100' : 'bg-white/5 border-white/10 text-white/40 hover:bg-amber-500/10'
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
              <AnimatePresence>
                {isOverAmount && (
                  <motion.p
                    key="over-hint"
                    initial={{ opacity: 0, y: -4, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -4, height: 0 }}
                    transition={SPRING}
                    className="mt-1.5 text-[10px] font-bold text-red-600 dark:text-red-400 overflow-hidden"
                  >
                    Ödənilən məbləgdən çox girmək olmaz (maks ₼{paidAmount.toFixed(2)})
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Method selector */}
            <div className="mb-4">
              <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                {t('refund_method') || 'Geri qaytarma üsulu'}
              </p>
              <div className="flex gap-2">
                {/* 2026-09-29 (owner: state-machine transitions everywhere):
                    200ms color crossfade on every state flip (idle → active),
                    not an instant repaint. */}
                <button
                  onClick={() => setMethod('cash')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border text-sm font-black transition-all duration-200 ${
                    method === 'cash'
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                      : lightMode ? 'bg-zinc-50 border-zinc-200 text-zinc-500 hover:border-zinc-300' : 'bg-white/5 border-white/10 text-white/40 hover:border-white/25'
                  } active:scale-95`}
                >
                  <Wallet size={16} />
                  {t('cash') || 'Nağd'}
                </button>
                <button
                  onClick={() => setMethod('card')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border text-sm font-black transition-all duration-200 ${
                    method === 'card'
                      ? 'bg-blue-500/10 border-blue-500/40 text-blue-600 dark:text-blue-400'
                      : lightMode ? 'bg-zinc-50 border-zinc-200 text-zinc-500 hover:border-zinc-300' : 'bg-white/5 border-white/10 text-white/40 hover:border-white/25'
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
                  className={`w-full rounded-2xl px-5 py-3 text-sm font-bold outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black placeholder:text-zinc-400 focus:border-emerald-400' : 'bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-emerald-400/50'}`}
                />
              </div>

              {/* 2026-09-29 (owner: state-machine transitions): the full-refund
                  warning now SPRING-POPS in AND OUT (AnimatePresence — the old
                  code had an enter-only animation, so the warning vanished in
                  one frame when the amount dropped below 100%), and the raw
                  "⚠" character became the Phosphor TriangleAlert (icon-package
                  rule). */}
              <AnimatePresence>
                {isFullRefund && (
                  <motion.div
                    key="full-warning"
                    initial={{ opacity: 0, y: 6, scale: 0.97, height: 0 }}
                    animate={{ opacity: 1, y: 0, scale: 1, height: 'auto' }}
                    exit={{ opacity: 0, y: 4, scale: 0.97, height: 0 }}
                    transition={SPRING}
                    className="overflow-hidden"
                  >
                    <div className={`p-3 rounded-2xl border mb-4 ${lightMode ? 'bg-amber-50 border-amber-300' : 'bg-amber-500/10 border-amber-500/20'}`}>
                      <p className={`flex items-center gap-1.5 text-xs font-bold ${lightMode ? 'text-amber-800' : 'text-amber-300'}`}>
                        <TriangleAlert size={13} className="shrink-0" /> {t('full_refund_warning') || 'Tam geri ödəniş — əməliyyat geri alınamaz'}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

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
                className={`flex-1 py-3.5 rounded-2xl text-white text-xs font-black uppercase tracking-widest active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed ${lightMode ? 'bg-zinc-900 hover:bg-zinc-800 shadow-lg shadow-zinc-900/20' : 'bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-500/20'}`}
              >
                {/* 2026-09-29 (owner: state-machine transitions): idle ↔
                    processing is a crossfade state swap, not an instant one. */}
                <AnimatePresence mode="wait" initial={false}>
                  {loading ? (
                    <motion.span
                      key="loading"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.14 }}
                      className="inline-flex items-center gap-2"
                    >
                      <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {t('processing') || 'Gözləyin'}
                    </motion.span>
                  ) : (
                    <motion.span
                      key="idle"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.14 }}
                    >
                      {t('confirm_refund') || 'Geri qaytar'}
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
