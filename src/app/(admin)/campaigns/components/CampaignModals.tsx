'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { Trash2, AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface DeleteCampaignModalProps {
  campaign: { id: string; title: string } | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteCampaignModal = ({ campaign, onConfirm, onCancel }: DeleteCampaignModalProps) => {
  const { t } = useLanguage();
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {campaign && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancel} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-full sm:max-w-md bg-card border border-red-500/30 p-8 shadow-2xl rounded-2xl">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4"><Trash2 size={32} className="text-red-500" /></div>
              <h3 className="text-xl font-serif font-bold text-white mb-2">{t('delete_campaign')}</h3>
              <p className="text-white/60 text-sm mb-6">"{campaign.title}" {t('confirm_delete_campaign')}</p>
              <div className="flex gap-3 w-full">
                <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-white/10 text-white/60 text-sm font-medium hover:text-white hover:border-white/30 transition-all">{t('no')}</button>
                <button onClick={onConfirm} className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-400 transition-all flex items-center justify-center gap-2">
                  <Trash2 size={16} />{t('yes_delete')}
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

interface DeleteAllModalProps {
  open: boolean;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteAllCampaignsModal = ({ open, loading, onConfirm, onCancel }: DeleteAllModalProps) => {
  const { t } = useLanguage();
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancel} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-full sm:max-w-md bg-card border border-red-500/30 p-8 shadow-2xl rounded-2xl">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4"><AlertCircle size={32} className="text-red-500" /></div>
              <h3 className="text-xl font-serif font-bold text-white mb-2">{t('delete_all_campaigns')}</h3>
              <p className="text-white/60 text-sm mb-6">{t('confirm_delete_all_campaigns')}</p>
              <div className="flex gap-3 w-full">
                <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-white/10 text-white/60 text-sm font-medium hover:text-white hover:border-white/30 transition-all">{t('no')}</button>
                <button onClick={onConfirm} disabled={loading} className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-400 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}{t('yes_delete')}
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
