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
        <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center mb-3.5">
          <Trash2 size={28} className="text-red-500" />
        </div>
        <h3 className="text-lg font-serif font-bold text-white mb-1.5">{t('delete_campaign')}</h3>
        <p className="text-[var(--theme-text-secondary)] text-sm mb-5">&ldquo;{campaign?.title}&rdquo; {t('confirm_delete_campaign')}</p>
        <div className="flex gap-2.5 w-full">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-[var(--theme-border)] text-[var(--theme-text-secondary)] text-sm font-medium hover:text-[var(--theme-text)] transition-colors">{t('cancel')}</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold flex items-center justify-center gap-1.5">
            <Trash2 size={15} />{t('yes_delete')}
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
        <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center mb-3.5">
          <AlertCircle size={28} className="text-red-500" />
        </div>
        <h3 className="text-lg font-serif font-bold text-white mb-1.5">{t('delete_all_campaigns')}</h3>
        <p className="text-[var(--theme-text-secondary)] text-sm mb-5">{t('confirm_delete_all_campaigns')}</p>
        <div className="flex gap-2.5 w-full">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-[var(--theme-border)] text-[var(--theme-text-secondary)] text-sm font-medium hover:text-[var(--theme-text)] transition-colors">{t('cancel')}</button>
          <button onClick={onConfirm} disabled={loading} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-1.5">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}{t('yes_delete')}
          </button>
        </div>
      </div>
    </MobileModal>
  );
};