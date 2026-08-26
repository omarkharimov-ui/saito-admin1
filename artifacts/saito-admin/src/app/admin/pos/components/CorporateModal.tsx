'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, X } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from '@/lib/toast';
import { appleCard, fastExit } from '@/lib/modal-transitions';

interface CorporateModalProps {
  open: boolean;
  onClose: () => void;
  amount: number;
  onSuccess: () => void;
}

export function CorporateModal({ open, onClose, amount, onSuccess }: CorporateModalProps) {
  const { lightMode } = useTheme();
  const { t } = useLanguage();
  const keyboardHeight = useKeyboardHeight();
  const [companyName, setCompanyName] = useState('');
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(false);

  const canPay = companyName.length >= 2;

  const handlePay = async () => {
    if (!canPay) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/orders/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'corporate',
          amount,
          company_name: companyName,
          reference: reference || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(t('corporate_success') || 'Korporativ hesaba yazıldı');
        onSuccess();
        onClose();
      } else {
        toast.error(data.error || t('corporate_failed') || 'Ödəniş uğursuz oldu');
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
          className={`fixed inset-0 z-[140] flex items-center justify-center bg-black/25 ${keyboardHeight > 0 ? '' : 'backdrop-blur-[2px]'}`} onClick={onClose}
          style={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight : undefined }}>
          <motion.div {...appleCard} transition={fastExit} onClick={e => e.stopPropagation()}
            className={`w-80 rounded-3xl p-7 shadow-elevated border ${lightMode ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-white/10'}`}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Building2 size={18} className="text-cyan-500" />
                <p className="text-sm font-black">{t('corporate') || 'Korporativ'}</p>
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

            {/* Company name */}
            <div className="mb-3">
              <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>{t('corporate_company') || 'Şirkət adı'}</p>
              <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)}
                placeholder="ABC Company" autoFocus
                className={`w-full rounded-2xl px-5 py-3.5 text-sm font-bold outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black placeholder:text-zinc-300 focus:border-cyan-400' : 'bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-cyan-400/50'}`} />
            </div>

            {/* Reference */}
            <div className="mb-5">
              <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>{t('reference') || 'Referans (ixtiyari)'}</p>
              <input type="text" value={reference} onChange={e => setReference(e.target.value)}
                placeholder="PO-2024-001"
                className={`w-full rounded-2xl px-5 py-3 text-sm font-bold outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black placeholder:text-zinc-300 focus:border-cyan-400' : 'bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-cyan-400/50'}`} />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button onClick={onClose}
                className={`flex-1 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all ${lightMode ? 'border-zinc-200 text-zinc-500 hover:bg-zinc-50' : 'border-white/10 text-white/50 hover:bg-white/5'}`}>
                {t('cancel') || 'Ləğv et'}
              </button>
              <button onClick={handlePay} disabled={!canPay || loading}
                className="flex-1 py-3.5 rounded-2xl bg-cyan-500 text-white text-xs font-black uppercase tracking-widest hover:bg-cyan-600 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20">
                {loading ? <span className="inline-flex items-center gap-2"><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />{t('processing') || 'Gözləyin'}</span> : t('confirm') || 'Təsdiqlə'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
