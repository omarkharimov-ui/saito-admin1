'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus, ShoppingBag, ArrowLeft, Users, GitMerge, CheckCircle, X } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { toast } from 'react-hot-toast';
import type { PosCart, LossItem } from '../types/shared';
import { SendOrderButton, type SendOrderButtonStatus } from './SendOrderButton';

interface CartPanelProps {
  cart: PosCart | null;
  onUpdateQty: (index: number, delta: number) => void;
  onPlaceOrder: () => void;
  onClear: () => void;
  onBack: () => void;
  orderButtonStatus: SendOrderButtonStatus;
  onUpdateGuests?: (delta: number) => void;
  mergedChildNumbers?: number[];
  onRecordLoss?: (items: LossItem[], reason: string) => Promise<void>;
}

export function CartPanel({
  cart, onUpdateQty, onPlaceOrder,
  onClear, onBack, orderButtonStatus, onUpdateGuests, mergedChildNumbers, onRecordLoss,
}: CartPanelProps) {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  const customInputRef = useRef<HTMLInputElement>(null);

  const [lossMode, setLossMode] = useState(false);
  const [selectedForLoss, setSelectedForLoss] = useState<Map<number, number>>(new Map());
  const [lossReason, setLossReason] = useState<string>('wrong_entry');
  const [showCustomReason, setShowCustomReason] = useState(false);
  const [customReasonText, setCustomReasonText] = useState('');
  const [confirming, setConfirming] = useState(false);
  const lossExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const exitLossMode = useCallback(() => {
    setSelectedForLoss(new Map());
    setShowCustomReason(false);
    setCustomReasonText('');
    if (lossExitTimerRef.current) clearTimeout(lossExitTimerRef.current);
    lossExitTimerRef.current = setTimeout(() => {
      setLossMode(false);
      lossExitTimerRef.current = null;
    }, 250);
  }, []);

  useEffect(() => {
    return () => { if (lossExitTimerRef.current) clearTimeout(lossExitTimerRef.current); };
  }, []);

  const lossReasons = [
    { key: 'customer_disliked', label: 'Müştəri bəyənmədi' },
    { key: 'kitchen_error', label: 'Mətbəx səhvi' },
    { key: 'wrong_entry', label: 'Səhv daxil edilmə' },
  ];

  useEffect(() => {
    if (showCustomReason && customInputRef.current) {
      customInputRef.current.focus();
    }
  }, [showCustomReason]);

  if (!cart) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 text-[var(--theme-text-muted)]">
        <ShoppingBag size={40} className="mb-3 opacity-30" />
        <p className="text-sm">Masa seçilməyib</p>
      </div>
    );
  }

  const total = cart.items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const isEmpty = cart.items.length === 0;

  const lossTotal = Array.from(selectedForLoss.entries()).reduce((sum, [idx, qty]) => {
    return sum + cart.items[idx].unit_price * qty;
  }, 0);

  const toggleLossSelection = (idx: number) => {
    setSelectedForLoss(prev => {
      const next = new Map(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.set(idx, cart!.items[idx].quantity);
      }
      return next;
    });
  };

  const updateLossQty = (idx: number, delta: number) => {
    setSelectedForLoss(prev => {
      const current = prev.get(idx);
      if (!current) return prev;
      const next = new Map(prev);
      const newQty = current + delta;
      if (newQty <= 0) {
        next.delete(idx);
      } else {
        next.set(idx, Math.min(newQty, cart!.items[idx].quantity));
      }
      return next;
    });
  };

  const confirmLoss = async () => {
    if (!onRecordLoss || selectedForLoss.size === 0) return;
    setConfirming(true);
    const reason = showCustomReason && customReasonText.trim() ? customReasonText.trim() : lossReason;
    const items: LossItem[] = Array.from(selectedForLoss.entries()).map(([idx, qty]) => ({
      product_id: cart.items[idx].product_id,
      product_name: cart.items[idx].product_name || '',
      quantity: qty,
      unit_price: cart.items[idx].unit_price,
    }));
    try {
      await onRecordLoss(items, reason);
      const sortedEntries = Array.from(selectedForLoss.entries()).sort(([a], [b]) => b - a);
      for (const [idx, qty] of sortedEntries) {
        onUpdateQty(idx, -qty);
      }
      const names = items.map(i => `${i.quantity} əd. ${i.product_name}`).join(', ');
      toast.success(`${names} — ləğv edildi`);
      if (lossExitTimerRef.current) clearTimeout(lossExitTimerRef.current);
      setLossMode(false);
      setSelectedForLoss(new Map());
      setShowCustomReason(false);
      setCustomReasonText('');
    } catch {
    } finally {
      setConfirming(false);
    }
  };

  const hasLossSelection = selectedForLoss.size > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0 pb-4 border-b border-[var(--theme-border)]">
        <div className="flex items-center gap-2">
          <button onClick={onBack}
            className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)]">
            <ArrowLeft size={18} />
          </button>
          <div>
            <p className="text-lg font-bold text-[var(--theme-text)]">
              Masa {cart.table_number}
              {mergedChildNumbers && mergedChildNumbers.length > 0 && (
                <span className={`ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider border ${lightMode ? 'bg-zinc-200 border-zinc-300 text-zinc-600' : 'bg-zinc-800/40 border-zinc-700/30 text-zinc-300'}`}>
                  <GitMerge size={10} /> Qrup {cart.table_number}
                </span>
              )}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs text-[var(--theme-text-secondary)]">{cart.items.length} məhsul</span>
              <span className={`text-xs ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>·</span>
              <div className="flex items-center gap-1.5">
                <Users size={12} className="text-[var(--theme-text-secondary)]" />
                {onUpdateGuests && (
                  <button onClick={e => { e.stopPropagation(); onUpdateGuests(-1); }}
                    className="w-10 h-8 rounded-xl flex items-center justify-center text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)] text-base font-bold leading-none transition-all active:scale-90">
                    −
                  </button>
                )}
                <span className="text-sm font-bold tabular-nums text-[var(--theme-text)] min-w-[18px] text-center">{cart.guest_count}</span>
                {onUpdateGuests && (
                  <button onClick={e => { e.stopPropagation(); onUpdateGuests(1); }}
                    className="w-10 h-8 rounded-xl flex items-center justify-center text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)] text-base font-bold leading-none transition-all active:scale-90">
                    +
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isEmpty && !lossMode && (
            <button onClick={() => { setLossMode(true); setLossReason('wrong_entry'); }}
              className="h-10 px-3.5 rounded-2xl text-xs font-semibold transition-all text-[var(--theme-text-secondary)] hover:text-red-600 hover:bg-red-500/10">
              İtki Yaz
            </button>
          )}
          {!isEmpty && !lossMode && (
            <button onClick={onClear}
              className="h-10 px-3.5 rounded-2xl text-xs font-semibold transition-all text-[var(--theme-text-secondary)] hover:text-red-600 hover:bg-red-500/10">
              Təmizlə
            </button>
          )}
          {lossMode && (
            <button onClick={exitLossMode}
              className="h-10 px-3.5 rounded-2xl text-xs font-semibold transition-all text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)]">
              Ləğv et
            </button>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto py-3 space-y-2">
        <motion.div layout className="space-y-2">
        <AnimatePresence initial={false}>
          {isEmpty ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full text-[var(--theme-text-muted)]"
            >
              <p className="text-sm font-medium">Məhsul əlavə edin</p>
            </motion.div>
          ) : (
            cart.items.map((item, idx) => {
              const isChecked = selectedForLoss.has(idx);
              const lossQty = selectedForLoss.get(idx) ?? 0;
              return (
                <motion.div
                  key={`${item.product_id}__${idx}`}
                  layout
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20, height: 0 }}
                  transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
                  className={`flex items-center gap-2.5 rounded-2xl px-3.5 py-3 border bg-[var(--theme-surface-muted)] shadow-[0_1px_3px_rgba(255,255,255,0.04)] transition-all duration-300 ${isChecked ? (lightMode ? 'border-red-300/40' : 'border-red-500/20') : `border-[var(--theme-border)]`}`}
                >
                  {lossMode && (
                    <button onClick={() => toggleLossSelection(idx)}
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all active:scale-90 ${
                        isChecked
                          ? (lightMode ? 'bg-red-600 border-red-600' : 'bg-red-500 border-red-500')
                          : (lightMode ? 'border-gray-400' : 'border-white/30')
                      }`}>
                      {isChecked && <CheckCircle size={14} className="text-white" />}
                    </button>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate text-[var(--theme-text)]">{item.product_name}</p>
                    {item.modifiers?.length ? (
                      <p className="text-[10px] truncate text-[var(--theme-text-secondary)]">
                        {(item.modifiers ?? []).map(m => m.name).join(', ')}
                      </p>
                    ) : null}
                    <p className="text-xs font-bold mt-0.5 text-[var(--theme-accent)]">{(item.unit_price * item.quantity).toFixed(2)} ₼</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {lossMode && isChecked ? (
                      <div className="flex items-center rounded-2xl overflow-hidden bg-red-500/10 border border-red-500/25">
                        <button onClick={() => updateLossQty(idx, -1)}
                          className="w-14 h-14 flex items-center justify-center active:scale-90 transition-all text-red-400 hover:bg-red-500/10">
                          <Minus size={18} />
                        </button>
                        <span className="text-base min-w-[28px] text-center font-black tabular-nums text-red-400">{lossQty}</span>
                        <button onClick={() => updateLossQty(idx, 1)}
                          className="w-14 h-14 flex items-center justify-center active:scale-90 transition-all text-red-400 hover:bg-red-500/10">
                          <Plus size={18} />
                        </button>
                      </div>
                    ) : lossMode ? null : (
                      <div className="flex items-center rounded-2xl overflow-hidden bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
                        <button onClick={() => onUpdateQty(idx, -1)} className="w-14 h-14 flex items-center justify-center active:scale-90 transition-all text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]">
                          <Minus size={18} />
                        </button>
                        <span className="text-base min-w-[28px] text-center font-black tabular-nums text-[var(--theme-text)]">{item.quantity}</span>
                        <button onClick={() => onUpdateQty(idx, 1)} className="w-14 h-14 flex items-center justify-center active:scale-90 transition-all text-[var(--theme-accent)]">
                          <Plus size={18} />
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
        </motion.div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 pt-4 border-t space-y-3 border-[var(--theme-border)]">
        {/* Total / Loss Total */}
        <AnimatePresence mode="wait">
          {hasLossSelection ? (
            <motion.div
              key="loss-total"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="flex items-center justify-between px-1"
            >
              <span className="text-xs uppercase tracking-widest font-semibold text-red-400">Ləğv edilən məbləğ</span>
              <span className="text-xl font-black tracking-tight tabular-nums text-red-400">{lossTotal.toFixed(2)} ₼</span>
            </motion.div>
          ) : (
            <motion.div
              key="std-total"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="flex items-center justify-between px-1"
            >
              <span className="text-xs uppercase tracking-widest font-semibold text-[var(--theme-text-secondary)]">{t('total_label')}</span>
              <span className="text-xl font-black tracking-tight tabular-nums text-[var(--theme-accent)]">{total.toFixed(2)} ₼</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loss reason bar */}
        {lossMode && hasLossSelection && (
          <div className="px-1 space-y-2">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-[var(--theme-text-secondary)]">İtki səbəbi</p>
            <AnimatePresence mode="wait">
            {showCustomReason ? (
              <motion.div
                key="custom"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2"
              >
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: '100%', opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                  className="flex-1 overflow-hidden"
                >
                  <input
                    ref={customInputRef}
                    type="text"
                    value={customReasonText}
                    onChange={e => setCustomReasonText(e.target.value)}
                    placeholder="Səbəbi əllə yazın..."
                    className={`w-full px-4 py-3 rounded-xl text-sm border outline-none ${
                      lightMode ? 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400' : 'bg-zinc-800 border-zinc-700 text-white placeholder:text-white/30'
                    }`}
                  />
                </motion.div>
                <motion.button
                  layoutId="digər-morph"
                  onClick={() => { setShowCustomReason(false); setCustomReasonText(''); }}
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-colors"
                >
                  <X size={16} />
                </motion.button>
              </motion.div>
            ) : (
              <motion.div
                key="preset"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-1.5"
              >
                <motion.div layout className="flex gap-1.5">
                  {lossReasons.map(r => (
                    <button key={r.key}
                      onClick={() => setLossReason(r.key)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all border ${
                        lossReason === r.key
                          ? 'bg-red-500/15 border-red-500/40 text-red-400'
                          : 'bg-[var(--theme-surface-soft)] border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]'
                      }`}>
                      {r.label}
                    </button>
                  ))}
                </motion.div>
                <motion.button
                  layoutId="digər-morph"
                  onClick={() => setShowCustomReason(true)}
                  className="px-3 py-1.5 rounded-xl text-[11px] font-medium border border-dashed border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:border-[var(--theme-text-muted)] transition-colors"
                >
                  + Digər
                </motion.button>
              </motion.div>
            )}
            </AnimatePresence>
          </div>
        )}

        <SendOrderButton
          disabled={isEmpty || (lossMode && selectedForLoss.size === 0) || confirming}
          status={lossMode ? 'idle' : orderButtonStatus}
          variant={lossMode ? 'loss' : 'send'}
          label={lossMode ? 'Dəyişiklikləri Təsdiqlə' : undefined}
          onClick={lossMode ? confirmLoss : onPlaceOrder}
        />
      </div>

    </div>
  );
}
