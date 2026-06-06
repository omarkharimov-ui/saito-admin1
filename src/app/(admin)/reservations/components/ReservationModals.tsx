'use client';

import React from 'react';
import { Trash2, AlertCircle, Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import MobileModal from '@/components/ui/MobileModal';
import { useTheme } from '@/lib/theme/ThemeContext';

interface DeleteModalProps {
  reservation: { id: string; guest: string } | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteReservationModal = ({ reservation, onConfirm, onCancel }: DeleteModalProps) => {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  return (
    <MobileModal open={!!reservation} onClose={onCancel}>
      <div className="flex flex-col items-center text-center">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
          <Trash2 size={32} className="text-red-500" />
        </div>
        <h3 className={`text-xl font-serif font-bold mb-2 ${lightMode ? 'text-gray-900' : 'text-white'}`}>{t('delete')}</h3>
        <p className={`text-sm mb-6 ${lightMode ? 'text-gray-500' : 'text-white/60'}`}>"{reservation?.guest}" - {t('confirm_delete')}</p>
        <div className="flex gap-3 w-full">
          <button onClick={onCancel} className={`flex-1 py-3 rounded-xl border text-sm font-medium ${lightMode ? 'border-gray-200 text-gray-500' : 'border-white/10 text-white/60'}`}>
            {t('no')}
          </button>
          <button onClick={onConfirm} className={`flex-1 py-3 rounded-xl bg-red-500 text-sm font-semibold flex items-center justify-center gap-2 ${lightMode ? 'text-gray-900' : 'text-white'}`}>
            <Trash2 size={16} />{t('yes_delete')}
          </button>
        </div>
      </div>
    </MobileModal>
  );
};

interface ClearArchiveModalProps {
  open: boolean;
  clearing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  description?: string;
}

export const ClearArchiveModal = ({ open, clearing, onConfirm, onCancel, title, description }: ClearArchiveModalProps) => {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  return (
    <MobileModal open={open} onClose={onCancel}>
      <div className="flex flex-col items-center text-center">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
          <AlertCircle size={32} className="text-red-500" />
        </div>
        <h3 className={`text-xl font-serif font-bold mb-2 ${lightMode ? 'text-gray-900' : 'text-white'}`}>{title ?? t('clear_archive')}</h3>
        <p className={`text-sm mb-6 ${lightMode ? 'text-gray-500' : 'text-white/60'}`}>{description ?? t('confirm_clear_archive')}</p>
        <div className="flex gap-3 w-full">
          <button onClick={onCancel} className={`flex-1 py-3 rounded-xl border text-sm font-medium ${lightMode ? 'border-gray-200 text-gray-500' : 'border-white/10 text-white/60'}`}>
            {t('no')}
          </button>
          <button onClick={onConfirm} disabled={clearing} className={`flex-1 py-3 rounded-xl bg-red-500 text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2 ${lightMode ? 'text-gray-900' : 'text-white'}`}>
            {clearing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}{t('yes_delete')}
          </button>
        </div>
      </div>
    </MobileModal>
  );
};
