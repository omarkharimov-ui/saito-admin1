'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, X, User } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from '@/lib/toast';
import { appleCard, fastExit } from '@/lib/modal-transitions';

interface RoomChargeModalProps {
  open: boolean;
  onClose: () => void;
  amount: number;
  onSuccess: () => void;
}

export function RoomChargeModal({ open, onClose, amount, onSuccess }: RoomChargeModalProps) {
  const { lightMode } = useTheme();
  const { t } = useLanguage();
  const keyboardHeight = useKeyboardHeight();
  const [roomNumber, setRoomNumber] = useState('');
  const [guestName, setGuestName] = useState('');
  const [loading, setLoading] = useState(false);

  const canPay = roomNumber.length >= 1 && guestName.length >= 1;

  const handlePay = async () => {
    if (!canPay) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/orders/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'room_charge',
          amount,
          room_number: roomNumber,
          guest_name: guestName,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(t('room_charge_success') || 'Otaq hesabına yazıldı');
        onSuccess();
        onClose();
      } else {
        toast.error(data.error || t('room_charge_failed') || 'Ödəniş uğursuz oldu');
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
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fastExit}
          className="fixed inset-0 z-[140] flex items-center justify-center bg-black/25 backdrop-blur-[2px]" onClick={onClose}
          style={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight : undefined }}>
          <motion.div {...appleCard} transition={fastExit} onClick={e => e.stopPropagation()}
            className={`w-80 rounded-3xl p-7 shadow-elevated border backdrop-blur-2xl ${lightMode ? 'bg-white/85 border-zinc-200' : 'bg-zinc-900/85 border-white/10'}`}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Building2 size={18} className="text-indigo-500" />
                <p className="text-sm font-black">{t('room_charge') || 'Otaq hesabı'}</p>
              </div>
              <button onClick={onClose} className={`p-1.5 rounded-xl transition-all ${lightMode ? 'hover:bg-zinc-100' : 'hover:bg-white/10'}`}>
                <X size={16} />
              </button>
            </div>

            {/* Amount */}
            <div className={`p-3 rounded-2xl border mb-4 ${lightMode ? 'bg-zinc-50 border-zinc-100' : 'bg-white/5 border-white/5'}`}>
              <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>{t('amount') || 'Məbləğ'}</p>
              <p className={`text-lg font-black tabular-nums ${lightMode ? 'text-black' : 'text-white'}`}>₼{amount.toFixed(2)}</p>
            </div>

            {/* Room number */}
            <div className="mb-3">
              <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>{t('room_number') || 'Otaq nömrəsi'}</p>
              <input type="text" value={roomNumber} onChange={e => setRoomNumber(e.target.value)}
                placeholder="302" autoFocus
                className={`w-full rounded-2xl px-5 py-3.5 text-lg font-black text-center outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black placeholder:text-zinc-300 focus:border-indigo-400' : 'bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-indigo-400/50'}`} />
            </div>

            {/* Guest name */}
            <div className="mb-5">
              <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>{t('guest_name') || 'Qonaq'}</p>
              <div className="relative">
                <User size={16} className={`absolute left-4 top-1/2 -translate-y-1/2 ${lightMode ? 'text-zinc-400' : 'text-white/30'}`} />
                <input type="text" value={guestName} onChange={e => setGuestName(e.target.value)}
                  placeholder="John Doe"
                  className={`w-full rounded-2xl pl-10 pr-5 py-3.5 text-sm font-bold outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black placeholder:text-zinc-300 focus:border-indigo-400' : 'bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-indigo-400/50'}`} />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button onClick={onClose}
                className={`flex-1 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all ${lightMode ? 'border-zinc-200 text-zinc-500 hover:bg-zinc-50' : 'border-white/10 text-white/50 hover:bg-white/5'}`}>
                {t('cancel') || 'Ləğv et'}
              </button>
              <button onClick={handlePay} disabled={!canPay || loading}
                className="flex-1 py-3.5 rounded-2xl bg-indigo-500 text-white text-xs font-black uppercase tracking-widest hover:bg-indigo-600 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20">
                {loading ? <span className="inline-flex items-center gap-2"><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />{t('processing') || 'Gözləyin'}</span> : t('confirm') || 'Təsdiqlə'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
