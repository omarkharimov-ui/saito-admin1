'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Ban, X } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from '@/lib/toast';
import { appleCard, fastExit } from '@/lib/modal-transitions';
import { PinGuard } from './PinGuard';
import type { LossItem } from '../types/shared';

interface LossItemModalProps {
  open: boolean;
  onClose: () => void;
  item: { idx: number; name: string; qty: number; price: number; productId: string };
  onRecordLoss: (items: LossItem[], reason: string) => Promise<void>;
  onRemoved: (qty: number) => void;
}

const LOSS_REASONS = [
  { key: 'customer_return', az: 'Müştəri qaytardı', en: 'Customer return', ru: 'Возврат клиента' },
  { key: 'kitchen_error', az: 'Mətbəx səhvi', en: 'Kitchen error', ru: 'Ошибка кухни' },
  { key: 'spoilage', az: 'Xarabolma', en: 'Spoilage', ru: 'Порча' },
  { key: 'spillage', az: 'Tökülmə', en: 'Spillage', ru: 'Разлив' },
  { key: 'other', az: 'Digər', en: 'Other', ru: 'Другое' },
];

export function LossItemModal({ open, onClose, item, onRecordLoss, onRemoved }: LossItemModalProps) {
  const { lightMode } = useTheme();
  const { t } = useLanguage();
  const keyboardHeight = useKeyboardHeight();
  const [pinVerified, setPinVerified] = useState(false);
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [qty, setQty] = useState(item.qty);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    const reason = customReason.trim() || selectedReason;
    if (!reason || qty <= 0) return;
    setLoading(true);
    try {
      await onRecordLoss([{
        product_id: item.productId,
        product_name: item.name,
        quantity: qty,
        unit_price: item.price,
      }], reason);
      toast.success(`${qty}x ${item.name} — ${t('loss_mode')}`);
      onRemoved(qty);
    } catch (e: any) {
      toast.error(e?.message || 'İtki qeyd edilmədi');
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
          action="loss"
        />
      )}
      {open && pinVerified && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fastExit}
          className="fixed inset-0 z-[140] flex items-center justify-center bg-black/25 backdrop-blur-[2px]" onClick={onClose}
          style={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight : undefined }}>
          <motion.div {...appleCard} transition={fastExit} onClick={e => e.stopPropagation()}
            className={`w-[92%] max-w-sm rounded-3xl p-6 shadow-elevated border backdrop-blur-2xl ${lightMode ? 'bg-white/85 border-zinc-200' : 'bg-zinc-900/85 border-white/10'}`}>

            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Ban size={18} className="text-red-500" />
                <p className="text-sm font-black">{t('loss_mode') || 'İtki Yaz'}</p>
              </div>
              <button onClick={onClose} className={`p-1.5 rounded-xl transition-all ${lightMode ? 'hover:bg-zinc-100' : 'hover:bg-white/10'}`}>
                <X size={16} />
              </button>
            </div>

            {/* Item info */}
            <div className={`p-4 rounded-2xl border mb-4 ${lightMode ? 'bg-zinc-50 border-zinc-100' : 'bg-white/5 border-white/5'}`}>
              <p className={`text-sm font-bold ${lightMode ? 'text-black' : 'text-white'}`}>{item.name}</p>
              <div className="flex items-center justify-between mt-2">
                <p className={`text-[10px] font-bold tabular-nums ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                  ₼{item.price.toFixed(2)} / ədəd
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setQty(q => Math.max(1, q - 1))}
                    className={`w-8 h-8 rounded-lg border flex items-center justify-center text-sm font-black transition-all ${lightMode ? 'bg-white border-zinc-200 hover:bg-zinc-50' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                    −
                  </button>
                  <span className={`w-10 text-center text-sm font-black tabular-nums ${lightMode ? 'text-black' : 'text-white'}`}>{qty}</span>
                  <button onClick={() => setQty(q => Math.min(item.qty, q + 1))}
                    className={`w-8 h-8 rounded-lg border flex items-center justify-center text-sm font-black transition-all ${lightMode ? 'bg-white border-zinc-200 hover:bg-zinc-50' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Reasons */}
            <div className="mb-4">
              <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>{t('loss_reason') || 'Səbəb'}</p>
              <div className="space-y-1.5">
                {LOSS_REASONS.map(r => (
                  <button key={r.key} onClick={() => { setSelectedReason(r.key); setCustomReason(''); }}
                    className={`w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                      selectedReason === r.key
                        ? 'bg-red-500/10 border-red-500/30 text-red-500'
                        : lightMode ? 'bg-white border-zinc-100 text-zinc-500 hover:bg-zinc-50' : 'bg-white/5 border-white/5 text-zinc-400 hover:bg-white/10'
                    }`}>
                    {r.az}
                  </button>
                ))}
                <input type="text" value={customReason} onChange={e => { setCustomReason(e.target.value); setSelectedReason(''); }}
                  placeholder={t('other') || 'Digər səbəb...'}
                  className={`w-full rounded-xl px-4 py-2.5 text-xs font-bold outline-none border transition-all ${lightMode ? 'bg-white border-zinc-200 text-black placeholder:text-zinc-300 focus:border-red-400' : 'bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-red-400/50'}`} />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button onClick={onClose}
                className={`flex-1 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all ${lightMode ? 'border-zinc-200 text-zinc-500 hover:bg-zinc-50' : 'border-white/10 text-white/50 hover:bg-white/5'}`}>
                {t('cancel') || 'Ləğv et'}
              </button>
              <button onClick={handleConfirm}
                disabled={(!selectedReason && !customReason.trim()) || qty <= 0 || loading}
                className="flex-1 py-3.5 rounded-2xl bg-red-500 text-white text-xs font-black uppercase tracking-widest hover:bg-red-600 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-red-500/20">
                {loading ? <span className="inline-flex items-center gap-2"><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />...</span> : t('loss_confirm') || 'İtkini təsdiqlə'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
