'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus, ShoppingBag, ArrowLeft, Users, GitMerge, AlertTriangle, X, CheckCircle } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
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

const lossReasons = [
  { key: 'customer_disliked', labelKey: 'loss_reason_not_liked' },
  { key: 'kitchen_error', labelKey: 'loss_reason_kitchen_error' },
  { key: 'wrong_entry', labelKey: 'loss_reason_wrong_entry' },
];

export function CartPanel({
  cart, onUpdateQty, onPlaceOrder,
  onClear, onBack, orderButtonStatus, onUpdateGuests, mergedChildNumbers, onRecordLoss,
}: CartPanelProps) {
  const { t } = useLanguage();
  const { lightMode } = useTheme();

  const [lossMode, setLossMode] = useState(false);
  const [selectedForLoss, setSelectedForLoss] = useState<Set<number>>(new Set());
  const [lossModalOpen, setLossModalOpen] = useState(false);
  const [lossSubmitting, setLossSubmitting] = useState(false);

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

  const toggleLossSelection = (idx: number) => {
    setSelectedForLoss(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const openLossModal = () => {
    if (selectedForLoss.size === 0) return;
    setLossModalOpen(true);
  };

  const confirmLoss = async (reason: string) => {
    if (!onRecordLoss || selectedForLoss.size === 0) return;
    setLossSubmitting(true);
    const items: LossItem[] = Array.from(selectedForLoss).map(idx => ({
      product_id: cart.items[idx].product_id,
      product_name: cart.items[idx].product_name || '',
      quantity: cart.items[idx].quantity,
      unit_price: cart.items[idx].unit_price,
    }));
    try {
      await onRecordLoss(items, reason);
      // Remove loss items from cart
      const sorted = Array.from(selectedForLoss).sort((a, b) => b - a);
      for (const idx of sorted) onUpdateQty(idx, -cart.items[idx].quantity);
      setLossMode(false);
      setSelectedForLoss(new Set());
      setLossModalOpen(false);
    } catch {
      // error handled in parent
    } finally {
      setLossSubmitting(false);
    }
  };

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
              <div className="flex items-center gap-1">
                <Users size={10} className="text-[var(--theme-text-secondary)]" />
                {onUpdateGuests && (
                  <button onClick={e => { e.stopPropagation(); onUpdateGuests(-1); }}
                    className="w-4 h-4 rounded flex items-center justify-center text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)] text-[10px] font-bold leading-none">
                    −
                  </button>
                )}
                <span className="text-xs font-bold tabular-nums text-[var(--theme-text)]">{cart.guest_count}</span>
                {onUpdateGuests && (
                  <button onClick={e => { e.stopPropagation(); onUpdateGuests(1); }}
                    className="w-4 h-4 rounded flex items-center justify-center text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)] text-[10px] font-bold leading-none">
                    +
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isEmpty && !lossMode && (
            <button onClick={() => setLossMode(true)}
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
            <button onClick={() => { setLossMode(false); setSelectedForLoss(new Set()); }}
              className="h-10 px-3.5 rounded-2xl text-xs font-semibold transition-all text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)]">
              Ləğv et
            </button>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto py-3 space-y-2">
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
            cart.items.map((item, idx) => (
              <motion.div
                key={`${item.product_id}__${idx}`}
                layout
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20, height: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2.5 rounded-2xl px-3.5 py-3 border bg-[var(--theme-surface-muted)] border-[var(--theme-border)] shadow-[0_1px_3px_rgba(255,255,255,0.04)]"
              >
                {lossMode && (
                  <button onClick={() => toggleLossSelection(idx)}
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      selectedForLoss.has(idx)
                        ? (lightMode ? 'bg-red-600 border-red-600' : 'bg-red-500 border-red-500')
                        : (lightMode ? 'border-gray-400' : 'border-white/30')
                    }`}>
                    {selectedForLoss.has(idx) && <CheckCircle size={12} className="text-white" />}
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
                  <div className="flex items-center rounded-2xl overflow-hidden bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
                    <button onClick={() => onUpdateQty(idx, -1)} className="w-11 h-11 flex items-center justify-center active:scale-90 transition-all text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]">
                      <Minus size={16} />
                    </button>
                    <span className="text-sm min-w-[24px] text-center font-black tabular-nums text-[var(--theme-text)]">{item.quantity}</span>
                    <button onClick={() => onUpdateQty(idx, 1)} className="w-11 h-11 flex items-center justify-center active:scale-90 transition-all text-[var(--theme-accent)]">
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 pt-4 border-t space-y-3 border-[var(--theme-border)]">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs uppercase tracking-widest font-semibold text-[var(--theme-text-secondary)]">{t('total_label')}</span>
          <span className="text-xl font-black tracking-tight tabular-nums text-[var(--theme-accent)]">{total.toFixed(2)} ₼</span>
        </div>
        <SendOrderButton
          disabled={isEmpty || (lossMode && selectedForLoss.size === 0)}
          status={lossMode ? 'idle' : orderButtonStatus}
          variant={lossMode ? 'loss' : 'send'}
          label={lossMode ? 'Dəyişiklikləri Təsdiqlə' : undefined}
          onClick={lossMode ? openLossModal : onPlaceOrder}
        />
      </div>

      {/* Loss Reason Modal */}
      <AnimatePresence>
        {lossModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
              onClick={() => !lossSubmitting && setLossModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className={`max-w-sm w-full rounded-3xl border p-6 shadow-2xl backdrop-blur-xl ${lightMode ? 'bg-white border-gray-200' : 'bg-zinc-900/95 border-zinc-700/50'}`}>
                <div className="text-center mb-5">
                  <AlertTriangle size={36} className={`mx-auto mb-3 ${lightMode ? 'text-red-500' : 'text-red-400'}`} />
                  <p className="text-lg font-bold">İtki səbəbi</p>
                  <p className={`text-sm mt-1 ${lightMode ? 'text-gray-500' : 'text-white/40'}`}>
                    {selectedForLoss.size} məhsul itki kimi qeyd olunacaq
                  </p>
                </div>
                <div className="space-y-2 mb-5">
                  {lossReasons.map(r => (
                    <button key={r.key}
                      onClick={() => confirmLoss(r.key)}
                      disabled={lossSubmitting}
                      className={`w-full py-3.5 px-4 rounded-2xl text-sm font-semibold border transition-all ${
                        lightMode
                          ? 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 active:scale-[0.98]'
                          : 'border-zinc-700/50 bg-zinc-800/40 text-white/70 hover:bg-zinc-700/40 active:scale-[0.98]'
                      }`}>
                      {r.key === 'customer_disliked' ? 'Müştəri bəyənmədi' : r.key === 'kitchen_error' ? 'Mətbəx səhvi' : 'Səhv daxil edilmə'}
                    </button>
                  ))}
                </div>
                <button onClick={() => setLossModalOpen(false)} disabled={lossSubmitting}
                  className={`w-full py-3 rounded-2xl text-sm font-semibold transition-all ${lightMode ? 'text-gray-500 hover:text-gray-700' : 'text-white/40 hover:text-white/60'}`}>
                  İmtina
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
