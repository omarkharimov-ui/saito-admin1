'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { Trash2, AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface DeleteModalProps {
  reservation: { id: string; guest: string } | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteReservationModal = ({ reservation, onConfirm, onCancel }: DeleteModalProps) => {
  const { t } = useLanguage();
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {reservation && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancel} className="absolute inset-0 bg-black/35 backdrop-blur-sm" />
          <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-full sm:max-w-md bg-card border border-red-500/30 p-8 shadow-2xl rounded-2xl">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                <Trash2 size={32} className="text-red-500" />
              </div>
              <h3 className="text-xl font-serif font-bold text-white mb-2">{t('delete')}</h3>
              <p className="text-white/60 text-sm mb-6">"{reservation.guest}" - {t('confirm_delete')}</p>
              <div className="flex gap-3 w-full">
                <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-white/10 text-white/60 text-sm font-medium hover:text-white hover:border-white/30 transition-all transition-premium">
                  {t('no')}
                </button>
                <button onClick={onConfirm} className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-400 transition-all transition-premium shadow-lg shadow-red-500/25 flex items-center justify-center gap-2">
                  <Trash2 size={16} />
                  {t('yes_delete')}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

interface ClearArchiveModalProps {
  open: boolean;
  clearing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ClearArchiveModal = ({ open, clearing, onConfirm, onCancel }: ClearArchiveModalProps) => {
  const { t } = useLanguage();
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancel} className="absolute inset-0 bg-black/35 backdrop-blur-sm" />
          <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-full sm:max-w-md bg-card border border-red-500/30 p-8 shadow-2xl rounded-2xl">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                <AlertCircle size={32} className="text-red-500" />
              </div>
              <h3 className="text-xl font-serif font-bold text-white mb-2">{t('clear_archive')}</h3>
              <p className="text-white/60 text-sm mb-6">{t('confirm_clear_archive')}</p>
              <div className="flex gap-3 w-full">
                <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-white/10 text-white/60 text-sm font-medium hover:text-white hover:border-white/30 transition-all transition-premium">
                  {t('no')}
                </button>
                <button onClick={onConfirm} disabled={clearing} className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-400 transition-all transition-premium disabled:opacity-40 shadow-lg shadow-red-500/25 flex items-center justify-center gap-2">
                  {clearing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  {t('yes_delete')}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
