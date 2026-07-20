'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus, ShoppingBag, ArrowLeft, Users, GitMerge, CheckCircle, X, User, Receipt } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { toast } from '@/lib/toast';
import type { PosCart, LossItem } from '../types/shared';
import { SendOrderButton, type SendOrderButtonStatus } from './SendOrderButton';

interface CartPanelProps {
  cart: PosCart | null;
  onUpdateQty: (index: number, delta: number) => void;
  onPlaceOrder: () => void;
  onClearDraft: () => void;
  onBack: () => void;
  orderButtonStatus: SendOrderButtonStatus;
  onUpdateGuests?: (delta: number) => void;
  onUpdateCustomer?: (name: string | null) => void;
  mergedChildNumbers?: number[];
  onRecordLoss?: (items: LossItem[], reason: string) => Promise<void>;
  hasExistingOrder?: boolean;
  isDirty?: boolean;
  isReservationMode?: boolean;
  reservationId?: string;
  guestName?: string;
  customerId?: string | null;
  customerName?: string | null;
}

export function CartPanel({
  cart, onUpdateQty, onPlaceOrder,
  onClearDraft, onBack, orderButtonStatus, onUpdateGuests, onUpdateCustomer, mergedChildNumbers, onRecordLoss,
  hasExistingOrder = false, isDirty = false,
  isReservationMode = false, reservationId, guestName,
  customerId, customerName,
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
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [customerInput, setCustomerInput] = useState('');
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
    { key: 'customer_disliked', label: t('loss_reason_not_liked') },
    { key: 'kitchen_error', label: t('loss_reason_kitchen_error') },
    { key: 'wrong_entry', label: t('loss_reason_wrong_entry') },
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
        <p className="text-sm">{t('no_table_selected')}</p>
      </div>
    );
  }

  const originalTotal = cart.items.reduce((s, i) => s + (i.original_unit_price ?? i.unit_price) * i.quantity, 0);
  const isEmpty = cart.items.length === 0;
  const hasDraftItems = cart.items.some(item => !item.sentQuantity || item.quantity !== item.sentQuantity);

  let total = originalTotal;
  let campaignDiscount = 0;
  const itemBasedDiscount = cart.items.reduce((s, i) => s + Math.max(0, ((i.original_unit_price ?? i.unit_price) - i.unit_price) * i.quantity), 0);
  if (itemBasedDiscount > 0) {
    campaignDiscount = itemBasedDiscount;
    total = originalTotal - campaignDiscount;
  } else {
    const discountAmount = cart.discount_amount ?? 0;
    if (discountAmount > 0) {
      if (cart.discount_type === 'percentage') {
        total = originalTotal * (1 - discountAmount / 100);
      } else {
        total = Math.max(0, originalTotal - discountAmount);
      }
    }
  }

  const lossTotal = Array.from(selectedForLoss.entries()).reduce((sum, [idx, qty]) => {
    return sum + (cart.items[idx].original_unit_price ?? cart.items[idx].unit_price) * qty;
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
    } catch (e: any) {
      toast.error(e?.message || 'Ləğv edilə bilmədi', { id: 'action-toast' });
    } finally {
      setConfirming(false);
    }
  };

  const hasLossSelection = selectedForLoss.size > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0 pb-4">
        <div className="flex items-center gap-2">
          <button onClick={onBack}
            className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)]">
            <ArrowLeft size={18} />
          </button>
          
          <div>
            <p className="text-lg font-bold text-[var(--theme-text)]">
              {mergedChildNumbers && mergedChildNumbers.length > 0 ? `${t('group_label')} ${cart.table_number}` : `${t('table_label')} ${cart.table_number}`}
              {mergedChildNumbers && mergedChildNumbers.length > 0 && (
                <span className={`ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-bold tracking-wider border ${lightMode ? 'bg-zinc-200 border-zinc-300 text-zinc-600' : 'bg-zinc-800/40 border-zinc-700/30 text-zinc-300'}`}>
                  <GitMerge size={10} /> {[cart.table_number, ...mergedChildNumbers].join('+')}
                </span>
              )}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs text-[var(--theme-text-secondary)]">{cart.items.length} {t('items')}</span>
              <span className={`text-xs ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>·</span>
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-[var(--theme-text-secondary)]" />
                  {onUpdateGuests && (
                    <button onClick={e => { e.stopPropagation(); onUpdateGuests(-1); }}
                      className="w-11 h-11 rounded-2xl flex items-center justify-center text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)] text-xl font-bold leading-none transition-all active:scale-90">
                      −
                    </button>
                  )}
                  <span className="text-lg font-black tabular-nums text-[var(--theme-text)] min-w-[24px] text-center">{cart.guest_count}</span>
                  {onUpdateGuests && (
                    <button onClick={e => { e.stopPropagation(); onUpdateGuests(1); }}
                      className="w-11 h-11 rounded-2xl flex items-center justify-center text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)] text-xl font-bold leading-none transition-all active:scale-90">
                      +
                    </button>
                  )}
                </div>
            </div>
            {editingCustomer ? (
              <div className="flex items-center gap-1.5 mt-1">
                <User size={12} className="text-blue-400" />
                <input
                  autoFocus
                  value={customerInput}
                  onChange={(e) => setCustomerInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onUpdateCustomer?.(customerInput.trim() || null);
                      setEditingCustomer(false);
                    }
                    if (e.key === 'Escape') {
                      setEditingCustomer(false);
                      setCustomerInput('');
                    }
                  }}
                  onBlur={() => {
                    onUpdateCustomer?.(customerInput.trim() || null);
                    setEditingCustomer(false);
                  }}
                  placeholder="Müştəri adı yazın..."
                  className={`flex-1 min-w-0 rounded-lg px-2 py-0.5 text-[10px] font-bold outline-none border ${lightMode ? 'bg-white border-blue-300 text-black' : 'bg-white/5 border-blue-500/30 text-white'}`}
                />
              </div>
            ) : cart.customer_name ? (
              <button onClick={() => { setEditingCustomer(true); setCustomerInput(cart.customer_name || ''); }}
                className="flex items-center gap-1.5 mt-1 group">
                <User size={12} className="text-blue-400" />
                <span className="text-[10px] font-bold text-blue-400 truncate">{cart.customer_name}</span>
                <span className="text-[9px] text-[var(--theme-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity">dəyiş</span>
              </button>
            ) : (
              <button onClick={() => { setEditingCustomer(true); setCustomerInput(''); }}
                className="flex items-center gap-1.5 mt-1 text-[var(--theme-text-muted)] hover:text-blue-400 transition-colors">
                <User size={12} />
                <span className="text-[10px] font-bold">Müştəri əlavə et</span>
              </button>
            )}
            {campaignDiscount > 0 ? (
              <div className="flex items-center gap-1.5 mt-1">
                <Receipt size={12} className="text-[var(--theme-text-secondary)]" />
                <span className="text-[10px] font-bold text-[var(--theme-text-secondary)]">
                  Kampaniya: −{campaignDiscount.toFixed(2)} ₼
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Cart Quick Actions Row */}
      {!isEmpty && (
        <div className={`flex items-center gap-2 pb-4 mb-2 border-b ${lightMode ? 'border-zinc-100' : 'border-white/5'}`}>
          <button
            onClick={onClearDraft}
            className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-[0.15em] transition-all border ${
              lightMode 
                ? 'bg-white border-zinc-200 text-red-600 hover:bg-red-50 hover:border-red-200' 
                : 'bg-white/5 border-white/10 text-red-400 hover:bg-red-500/10 hover:border-red-500/20'
            }`}
          >
            {t('clear')}
          </button>
          <button
            onClick={lossMode ? exitLossMode : () => { setLossMode(true); setLossReason('wrong_entry'); }}
            className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-[0.15em] transition-all border ${
              lossMode 
                ? (lightMode ? 'bg-red-600 border-red-600 text-white' : 'bg-red-500 border-red-500 text-white')
                : (lightMode ? 'bg-white border-zinc-200 text-zinc-500 hover:text-zinc-900' : 'bg-white/5 border-white/10 text-white/40 hover:text-white')
            }`}
          >
            {lossMode ? t('loss_mode_cancel') : t('loss_mode')}
          </button>
        </div>
      )}

       {/* Items */}
       <div className="flex-1 py-3 relative">
        <div
          className="absolute inset-0 transition-opacity duration-150 ease-in-out"
          style={{ opacity: isEmpty ? 1 : 0, pointerEvents: isEmpty ? 'auto' : 'none' }}
        >
          <div className="flex items-center justify-center h-full text-[var(--theme-text-muted)]">
            <p className="text-sm font-medium">{t('add_items_hint')}</p>
          </div>
        </div>
        <div
          className="transition-opacity duration-150 ease-in-out"
          style={{ opacity: isEmpty ? 0 : 1 }}
        >
          {cart.items.map((item, idx) => {
            const isChecked = selectedForLoss.has(idx);
            const lossQty = selectedForLoss.get(idx) ?? 0;
            return (
              <div
                key={`${item.product_id}__${idx}`}
                className={`mb-2 flex items-center gap-2.5 rounded-2xl px-3.5 py-3 border bg-[var(--theme-surface-muted)] shadow-[0_1px_3px_rgba(255,255,255,0.04)] transition-all duration-300 ${confirming && isChecked ? 'opacity-0 scale-95' : ''} ${isChecked ? (lightMode ? 'border-red-300/40' : 'border-red-500/20') : `border-[var(--theme-border)]`}`}
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
              </div>
            );
          })}
        </div>
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
              <span className="text-xs uppercase tracking-widest font-semibold text-red-400">{t('cancelled_amount')}</span>
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
               <div className="flex flex-col gap-0.5">
                 <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-widest font-semibold text-[var(--theme-text-secondary)]">{t('total_label')}</span>
                  </div>
                 {campaignDiscount > 0 && (
                   <span className="text-[10px] text-emerald-400 font-bold">
                     {t('savings') || 'You save'} {campaignDiscount.toFixed(2)} ₼
                   </span>
                 )}
               </div>
               <div className="text-right">
                 {campaignDiscount > 0 && (
                   <p className="text-[11px] font-medium line-through text-[var(--theme-text-muted)]">{originalTotal.toFixed(2)} ₼</p>
                 )}
                 <span className="text-xl font-black tracking-tight tabular-nums text-[var(--theme-accent)]">{total.toFixed(2)} ₼</span>
               </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loss reason bar */}
        {lossMode && hasLossSelection && (
          <div className="px-1 space-y-2">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-[var(--theme-text-secondary)]">{t('loss_reason_title')}</p>
            <AnimatePresence mode="wait">
            {showCustomReason ? (
              <motion.div
                key="custom"
                initial={{ opacity: 0, scale: 0.95, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -6 }}
                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                className="flex items-center gap-2"
              >
                <input
                  ref={customInputRef}
                  type="text"
                  value={customReasonText}
                  onChange={e => setCustomReasonText(e.target.value)}
                                                  placeholder={t('loss_reason_custom_placeholder')}
                  className={`flex-1 px-4 py-3 rounded-xl text-sm border outline-none transition-all ${
                    lightMode ? 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400' : 'bg-zinc-800 border-zinc-700 text-white placeholder:text-white/30'
                  }`}
                />
                <button onClick={() => { setShowCustomReason(false); setCustomReasonText(''); }}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                    lightMode ? 'bg-gray-100 text-gray-500 hover:bg-gray-200' : 'bg-zinc-800 text-white/40 hover:text-white'
                  }`}>
                  <X size={16} />
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="preset"
                initial={{ opacity: 0, scale: 0.95, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -6 }}
                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                className="space-y-1.5"
              >
                <div className="flex gap-1.5">
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
                </div>
                <button onClick={() => setShowCustomReason(true)}
                  className="px-3 py-1.5 rounded-xl text-[11px] font-medium border border-dashed border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:border-[var(--theme-text-muted)] transition-all">
                  + {t('other')}
                </button>
              </motion.div>
            )}
            </AnimatePresence>
          </div>
        )}

        {/* Active campaign badge */}
        {campaignDiscount > 0 && (
          <div className={`flex items-center justify-between px-3 py-2 rounded-2xl ${lightMode ? 'bg-zinc-100 border border-zinc-200' : 'bg-white/5 border border-white/10'}`}>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full animate-pulse ${lightMode ? 'bg-zinc-600' : 'bg-white/60'}`} />
              <span className={`text-[10px] font-bold uppercase tracking-wider ${lightMode ? 'text-zinc-600' : 'text-white/60'}`}>Kampaniya tətbiq olundu</span>
            </div>
          </div>
        )}
        {/* Footer actions removed from here */}
        <div className="w-full">
          <SendOrderButton
            disabled={isEmpty || (lossMode && selectedForLoss.size === 0) || confirming}
            status={lossMode ? 'idle' : orderButtonStatus}
            variant={lossMode ? 'loss' : 'send'}
            label={lossMode ? t('loss_confirm') : (isReservationMode ? `${guestName ? guestName + ' — ' : ''}Sifarişi Göndər` : (hasExistingOrder ? t('resend') : t('send_to_kitchen')))}
            onClick={lossMode ? confirmLoss : onPlaceOrder}
            isDirty={isDirty}
            className="w-full"
          />
        </div>
      </div>

    </div>
  );
}
