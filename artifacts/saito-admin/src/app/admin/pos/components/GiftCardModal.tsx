'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, X } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from '@/lib/toast';
import { appleCard, fastExit } from '@/lib/modal-transitions';

interface GiftCardModalProps {
  open: boolean;
  onClose: () => void;
  amount: number;
  onSuccess: () => void;
}

export function GiftCardModal({ open, onClose, amount, onSuccess }: GiftCardModalProps) {
  const { lightMode } = useTheme();
  const { t } = useLanguage();
  const keyboardHeight = useKeyboardHeight();
  const [code, setCode] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);

  const canPay = balance !== null && balance >= amount && code.length >= 4;

  const handleCheckBalance = async () => {
    if (code.length < 4) return;
    setChecking(true);
    try {
      const res = await apiFetch(`/api/gift-cards?code=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (res.ok && data.balance !== undefined) {
        setBalance(data.balance);
      } else {
        toast.error(data.error || t('gift_card_not_found') || 'Kart tapılmadı');
        setBalance(null);
      }
    } catch {
      toast.error(t('network_error') || 'Şəbəkə xətası');
    } finally {
      setChecking(false);
    }
  };

  const handlePay = async () => {
    if (!canPay) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/gift-cards/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, amount }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(t('gift_card_redeemed') || 'Hədiyyə kartı istifadə edildi');
        onSuccess();
        onClose();
      } else {
        toast.error(data.error || t('gift_card_redeem_failed') || 'Ödəniş uğursuz oldu');
      }
    } catch {
      toast.error(t('network_error') || 'Şəbəkə xətası');
    } finally {
      setLoading(false);
    }
  };

  const remaining = balance !== null ? balance - amount : 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fastExit}
          className={`fixed inset-0 z-[140] flex items-center justify-center bg-black/25 ${keyboardHeight > 0 ? '' : 'backdrop-blur-[2px]'}`} onClick={onClose}
          style={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight : undefined }}>
          <motion.div {...appleCard} transition={fastExit} onClick={e => e.stopPropagation()}
            className={`w-80 rounded-3xl p-7 shadow-elevated border ${lightMode ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-white/10'}`}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Gift size={18} className="text-rose-500" />
                <p className="text-sm font-black">{t('gift_card') || 'Hədiyyə kartı'}</p>
              </div>
              <button onClick={onClose} className={`p-1.5 rounded-xl transition-all ${lightMode ? 'hover:bg-zinc-100' : 'hover:bg-white/10'}`}>
                <X size={16} />
              </button>
            </div>

            {/* Amount to pay */}
            <div className={`p-3 rounded-2xl border mb-4 ${lightMode ? 'bg-zinc-50 border-zinc-100' : 'bg-white/5 border-white/5'}`}>
              <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>{t('amount') || 'Məbləğ'}</p>
              <p className={`text-lg font-black tabular-nums ${lightMode ? 'text-black' : 'text-white'}`}>₼{amount.toFixed(2)}</p>
            </div>

            {/* Code input */}
            <div className="mb-4">
              <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>{t('gift_card_code') || 'Kart kodu'}</p>
              <input type="text" value={code} onChange={e => { setCode(e.target.value.toUpperCase()); setBalance(null); }}
                placeholder="XXXX-XXXX" autoFocus
                className={`w-full rounded-2xl px-5 py-3.5 text-lg font-black tracking-[0.15em] text-center outline-none border transition-all uppercase ${lightMode ? 'bg-white border-black/10 text-black placeholder:text-zinc-300 focus:border-rose-400' : 'bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-rose-400/50'}`} />
            </div>

            {/* Check balance */}
            {!balance && code.length >= 4 && (
              <button onClick={handleCheckBalance} disabled={checking}
                className="w-full mb-4 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-black uppercase tracking-widest active:scale-[0.98] transition-all disabled:opacity-50">
                {checking ? <span className="inline-flex items-center gap-2"><span className="w-3 h-3 border-2 border-rose-400/30 border-t-rose-400 rounded-full animate-spin" />{t('checking') || 'Yoxlanılır...'}</span> : t('check_balance') || 'Balansı yoxla'}
              </button>
            )}

            {/* Balance display */}
            {balance !== null && (
              <div className={`p-3 rounded-2xl border mb-4 ${remaining >= 0 ? (lightMode ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-500/10 border-emerald-500/20') : (lightMode ? 'bg-rose-50 border-rose-200' : 'bg-rose-500/10 border-rose-500/20')}`}>
                <div className="flex justify-between items-center">
                  <span className={`text-[9px] font-black uppercase tracking-widest ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>{t('gift_card_balance') || 'Balans'}</span>
                  <span className={`text-sm font-black tabular-nums ${remaining >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>₼{balance.toFixed(2)}</span>
                </div>
                {remaining >= 0 && (
                  <div className="flex justify-between items-center mt-1.5 pt-1.5 border-t" style={{ borderColor: lightMode ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' }}>
                    <span className={`text-[9px] font-black uppercase tracking-widest ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>{t('remaining') || 'Qalan'}</span>
                    <span className={`text-sm font-black tabular-nums text-emerald-400`}>₼{remaining.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button onClick={onClose}
                className={`flex-1 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all ${lightMode ? 'border-zinc-200 text-zinc-500 hover:bg-zinc-50' : 'border-white/10 text-white/50 hover:bg-white/5'}`}>
                {t('cancel') || 'Ləğv et'}
              </button>
              <button onClick={handlePay} disabled={!canPay || loading}
                className="flex-1 py-3.5 rounded-2xl bg-rose-500 text-white text-xs font-black uppercase tracking-widest hover:bg-rose-600 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-rose-500/20">
                {loading ? <span className="inline-flex items-center gap-2"><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />{t('processing') || 'Gözləyin'}</span> : t('confirm') || 'Təsdiqlə'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
