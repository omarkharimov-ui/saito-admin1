'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus, Trash2, ShoppingBag, ArrowLeft, Users, GitMerge } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { PosCart } from '../types/shared';
import { SendOrderButton, type SendOrderButtonStatus } from './SendOrderButton';

interface CartPanelProps {
  cart: PosCart | null;
  onUpdateQty: (index: number, delta: number) => void;
  onRemove: (index: number) => void;
  onPlaceOrder: () => void;
  onClear: () => void;
  onBack: () => void;
  orderButtonStatus: SendOrderButtonStatus;
  onUpdateGuests?: (delta: number) => void;
  mergedChildNumbers?: number[];
}

export function CartPanel({
  cart, onUpdateQty, onRemove, onPlaceOrder,
  onClear, onBack, orderButtonStatus, onUpdateGuests, mergedChildNumbers,
}: CartPanelProps) {
  const { t } = useLanguage();
  const { lightMode } = useTheme();

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
        {!isEmpty && (
          <button onClick={onClear}
            className="h-10 px-3.5 rounded-2xl text-xs font-semibold transition-all text-[var(--theme-text-secondary)] hover:text-red-600 hover:bg-red-500/10">
            Təmizlə
          </button>
        )}
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
                  <button onClick={() => onRemove(idx)} className="w-11 h-11 rounded-2xl flex items-center justify-center active:scale-90 transition-all text-[var(--theme-text-secondary)] hover:text-red-600 hover:bg-red-500/10">
                    <Trash2 size={16} />
                  </button>
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
          disabled={isEmpty}
          status={orderButtonStatus}
          onClick={onPlaceOrder}
        />
      </div>
    </div>
  );
}
