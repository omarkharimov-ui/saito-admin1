'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Ban, Minus, Plus, X } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from '@/lib/toast';
import { appleCard, fastExit } from '@/lib/modal-transitions';

interface OrderItem {
  id: string;
  product_name?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  products?: { name_az?: string; name_en?: string };
}

interface VoidItemsModalProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  items: OrderItem[];
  onSuccess: () => void;
}

export function VoidItemsModal({ open, onClose, orderId, items, onSuccess }: VoidItemsModalProps) {
  const { lightMode } = useTheme();
  const { t } = useLanguage();
  const keyboardHeight = useKeyboardHeight();
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setSelected({});
  }, [open]);

  const toggleItem = (id: string, maxQty: number) => {
    setSelected(prev => {
      const current = prev[id] || 0;
      if (current >= maxQty) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: current + 1 };
    });
  };

  const setQty = (id: string, qty: number, maxQty: number) => {
    const clamped = Math.max(0, Math.min(qty, maxQty));
    setSelected(prev => {
      if (clamped === 0) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: clamped };
    });
  };

  const selectedCount = Object.keys(selected).length;
  const selectedTotal = Object.entries(selected).reduce((sum, [id, qty]) => {
    const item = items.find(i => i.id === id);
    return sum + (item ? (item.unit_price || item.total_price / item.quantity) * qty : 0);
  }, 0);

  const handleVoid = async () => {
    if (selectedCount === 0) return;
    setLoading(true);
    try {
      const payload = Object.entries(selected).map(([id, qty]) => ({
        order_item_id: id,
        quantity: qty,
      }));

      const res = await apiFetch('/api/orders/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, items: payload }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(t('void_success') || 'Ləğv edildi');
        onSuccess();
        onClose();
      } else {
        toast.error(data.error || t('void_error') || 'Ləğv edilmədi');
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
          key="void-items-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={fastExit}
          className={`fixed inset-0 z-[140] flex items-center justify-center bg-black/25 ${keyboardHeight > 0 ? '' : 'backdrop-blur-[2px]'}`}
          onClick={onClose}
          style={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight : undefined }}
        >
          <motion.div
            {...appleCard}
            transition={fastExit}
            onClick={e => e.stopPropagation()}
            className={`w-[92%] max-w-sm max-h-[80vh] rounded-3xl p-6 shadow-elevated border flex flex-col ${lightMode ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-white/10'}`}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Ban size={18} className="text-rose-500" />
                <p className="text-sm font-black">{t('void_items') || 'Elementləri ləğv et'}</p>
              </div>
              <button onClick={onClose} className={`p-1.5 rounded-xl transition-all ${lightMode ? 'hover:bg-zinc-100' : 'hover:bg-white/10'}`}>
                <X size={16} />
              </button>
            </div>

            {/* Items list */}
            <div className="flex-1 overflow-y-auto space-y-2 mb-4 min-h-0">
              {items.map(item => {
                const qty = selected[item.id] || 0;
                const isSelected = qty > 0;
                return (
                  <motion.div
                    key={item.id}
                    layout
                    className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                      isSelected
                        ? 'bg-rose-500/10 border-rose-500/30'
                        : lightMode ? 'bg-zinc-50 border-zinc-100' : 'bg-white/5 border-white/5'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold truncate ${lightMode ? 'text-black' : 'text-white'}`}>
                        {item.quantity}x {item.product_name || item.products?.name_az || item.products?.name_en || t('product')}
                      </p>
                      <p className={`text-[10px] font-bold tabular-nums ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                        ₼{(Number(item.unit_price || item.total_price / item.quantity) || 0).toFixed(2)} / ədəd
                      </p>
                    </div>

                    {/* Qty controls */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setQty(item.id, (selected[item.id] || 0) - 1, item.quantity)}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all border ${
                          qty > 0
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                            : lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-300' : 'bg-white/5 border-white/10 text-white/20'
                        } active:scale-95`}
                        disabled={qty === 0}
                      >
                        <Minus size={14} strokeWidth={3} />
                      </button>
                      <span className={`w-8 text-center text-sm font-black tabular-nums ${isSelected ? 'text-rose-400' : lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                        {qty || '—'}
                      </span>
                      <button
                        onClick={() => toggleItem(item.id, item.quantity)}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all border ${
                          qty < item.quantity
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 active:scale-95'
                            : lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-300' : 'bg-white/5 border-white/10 text-white/20'
                        }`}
                        disabled={qty >= item.quantity}
                      >
                        <Plus size={14} strokeWidth={3} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Summary */}
            {selectedCount > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-3 rounded-2xl border mb-4 ${lightMode ? 'bg-rose-50 border-rose-200' : 'bg-rose-500/10 border-rose-500/20'}`}
              >
                <div className="flex justify-between items-center">
                  <span className={`text-xs font-black uppercase tracking-widest ${lightMode ? 'text-rose-500' : 'text-rose-400'}`}>
                    {selectedCount} {t('items_selected') || 'element seçildi'}
                  </span>
                  <span className={`text-sm font-black tabular-nums ${lightMode ? 'text-rose-600' : 'text-rose-300'}`}>
                    -₼{selectedTotal.toFixed(2)}
                  </span>
                </div>
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
                onClick={handleVoid}
                disabled={selectedCount === 0 || loading}
                className="flex-1 py-3.5 rounded-2xl bg-rose-500 text-white text-xs font-black uppercase tracking-widest hover:bg-rose-600 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-rose-500/20"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t('processing') || 'Gözləyin'}
                  </span>
                ) : t('void') || 'Ləğv et'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
