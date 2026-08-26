'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, Trash2, X } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from '@/lib/toast';
import { appleCard, fastExit } from '@/lib/modal-transitions';
import { PinGuard } from './PinGuard';

interface ReturnItemModalProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  item: {
    order_item_id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    kitchen_status: string;
  };
  onSuccess: () => void;
}

export function ReturnItemModal({ open, onClose, orderId, item, onSuccess }: ReturnItemModalProps) {
  const { lightMode } = useTheme();
  const { t } = useLanguage();
  const keyboardHeight = useKeyboardHeight();
  const [pinVerified, setPinVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [qty, setQty] = useState(item.quantity);

  const handleReturn = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/orders/return-to-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_item_id: item.order_item_id,
          quantity: qty,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`${qty}x ${item.product_name} — ${t('returned_to_stock') || 'Anbara qaytarıldı'}`);
        onSuccess();
        onClose();
      } else {
        toast.error(data.error || t('return_failed') || 'Qaytarılma uğursuz oldu');
      }
    } catch {
      toast.error(t('network_error') || 'Şəbəkə xətası');
    } finally {
      setLoading(false);
    }
  };

  const handleWaste = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/orders/waste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_item_id: item.order_item_id,
          quantity: qty,
          reason: 'customer_return',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`${qty}x ${item.product_name} — ${t('waste_recorded') || 'İtki qeyd edildi'}`);
        onSuccess();
        onClose();
      } else {
        toast.error(data.error || t('waste_failed') || 'İtki qeyd edilmədi');
      }
    } catch {
      toast.error(t('network_error') || 'Şəbəkə xətası');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && !pinVerified && (
        <PinGuard
          open
          onClose={onClose}
          onVerified={() => setPinVerified(true)}
          action="void_item"
        />
      )}
      {open && pinVerified && (
        <motion.div
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
            className={`w-[92%] max-w-sm rounded-3xl p-6 shadow-elevated border backdrop-blur-lg ${lightMode ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-white/10'}`}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Package size={18} className="text-blue-500" />
                <p className="text-sm font-black">{t('return_item') || 'Məhsulu qaytar'}</p>
              </div>
              <button onClick={onClose} className={`p-1.5 rounded-xl transition-all ${lightMode ? 'hover:bg-zinc-100' : 'hover:bg-white/10'}`}>
                <X size={16} />
              </button>
            </div>

            {/* Item info */}
            <div className={`p-4 rounded-2xl border mb-4 ${lightMode ? 'bg-zinc-50 border-zinc-100' : 'bg-white/5 border-white/5'}`}>
              <p className={`text-sm font-bold ${lightMode ? 'text-black' : 'text-white'}`}>{item.product_name}</p>
              <div className="flex items-center justify-between mt-2">
                <p className={`text-[10px] font-bold tabular-nums ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                  ₼{item.unit_price.toFixed(2)} / ədəd
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setQty(q => Math.max(1, q - 1))}
                    className={`w-8 h-8 rounded-lg border flex items-center justify-center text-sm font-black transition-all ${lightMode ? 'bg-white border-zinc-200 hover:bg-zinc-50' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                    −
                  </button>
                  <span className={`w-10 text-center text-sm font-black tabular-nums ${lightMode ? 'text-black' : 'text-white'}`}>{qty}</span>
                  <button onClick={() => setQty(q => Math.min(item.quantity, q + 1))}
                    className={`w-8 h-8 rounded-lg border flex items-center justify-center text-sm font-black transition-all ${lightMode ? 'bg-white border-zinc-200 hover:bg-zinc-50' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Choice: Return to stock or Waste */}
            <div className="mb-5 space-y-2">
              <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                {t('item_fate') || 'Məhsulun taleyi'}
              </p>
              <button
                onClick={handleReturn}
                disabled={loading}
                className={`w-full flex items-center gap-3 p-4 rounded-2xl border text-left transition-all active:scale-[0.98] ${
                  lightMode ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100' : 'bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20'
                }`}
              >
                <Package size={20} strokeWidth={2.5} />
                <div>
                  <p className="text-sm font-black">{t('return_to_stock') || 'Anbara qaytar'}</p>
                  <p className={`text-[10px] font-bold ${lightMode ? 'text-blue-500' : 'text-blue-300/60'}`}>
                    {t('stock_increases') || 'Stock geri artırılır'}
                  </p>
                </div>
              </button>
              <button
                onClick={handleWaste}
                disabled={loading}
                className={`w-full flex items-center gap-3 p-4 rounded-2xl border text-left transition-all active:scale-[0.98] ${
                  lightMode ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100' : 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'
                }`}
              >
                <Trash2 size={20} strokeWidth={2.5} />
                <div>
                  <p className="text-sm font-black">{t('write_off') || 'İtkiyə yaz'}</p>
                  <p className={`text-[10px] font-bold ${lightMode ? 'text-red-500' : 'text-red-300/60'}`}>
                    {t('stock_unchanged') || 'Stock dəyişmir'}
                  </p>
                </div>
              </button>
            </div>

            {/* Cancel */}
            <button
              onClick={onClose}
              className={`w-full py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all ${lightMode ? 'border-zinc-200 text-zinc-500 hover:bg-zinc-50' : 'border-white/10 text-white/50 hover:bg-white/5'}`}
            >
              {t('cancel') || 'Ləğv et'}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
