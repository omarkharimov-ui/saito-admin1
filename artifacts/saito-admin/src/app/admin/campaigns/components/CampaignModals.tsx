'use client';

import React from 'react';
import { Trash2, AlertCircle, Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import MobileModal from '@/components/ui/MobileModal';

interface DeleteCampaignModalProps {
  campaign: { id: string; title: string } | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteCampaignModal = ({ campaign, onConfirm, onCancel }: DeleteCampaignModalProps) => {
  const { t } = useLanguage();
  return (
    <MobileModal open={!!campaign} onClose={onCancel}>
      <div className="flex flex-col items-center text-center">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4"><Trash2 size={32} className="text-red-500" /></div>
        <h3 className="text-xl font-serif font-bold text-white mb-2">{t('delete_campaign')}</h3>
        <p className="text-[var(--theme-text-secondary)] text-sm mb-6">"{campaign?.title}" {t('confirm_delete_campaign')}</p>
        <div className="flex gap-3 w-full">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-[var(--theme-border)] text-[var(--theme-text-secondary)] text-sm font-medium">{t('no')}</button>
          <button onClick={onConfirm} className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-semibold flex items-center justify-center gap-2">
            <Trash2 size={16} />{t('yes_delete')}
          </button>
        </div>
      </div>
    </MobileModal>
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
  return (
    <MobileModal open={open} onClose={onCancel}>
      <div className="flex flex-col items-center text-center">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4"><AlertCircle size={32} className="text-red-500" /></div>
        <h3 className="text-xl font-serif font-bold text-white mb-2">{t('delete_all_campaigns')}</h3>
        <p className="text-[var(--theme-text-secondary)] text-sm mb-6">{t('confirm_delete_all_campaigns')}</p>
        <div className="flex gap-3 w-full">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-white/10 text-white/60 text-sm font-medium">{t('no')}</button>
          <button onClick={onConfirm} disabled={loading} className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}{t('yes_delete')}
          </button>
        </div>
      </div>
    </MobileModal>
  );
};
