'use client';

import React from 'react';
import { Trash2, AlertCircle, Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import MobileModal from '@/components/ui/MobileModal';

interface DeleteAllModalProps {
  open: boolean;
  updating: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

interface DeleteProductModalProps {
  product: { id: string; name: string } | null;
  updating: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

interface DeleteCategoryModalProps {
  category: { id: string; name: string } | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteAllModal({ open, updating, onClose, onConfirm }: DeleteAllModalProps) {
  const { t } = useLanguage();
  return (
    <MobileModal open={open} onClose={onClose}>
      <div className="flex flex-col items-center text-center">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
          <AlertCircle size={32} className="text-red-500" />
        </div>
        <h3 className="text-xl font-serif font-bold text-white mb-2">{t('delete_all')}</h3>
        <p className="text-white/60 text-sm mb-6">{t('confirm_delete_all_text')}</p>
        <div className="flex gap-3 w-full">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-white/10 text-white/60 text-sm font-medium">{t('no')}</button>
          <button onClick={onConfirm} disabled={updating} className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2">
            {updating ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}{t('yes_delete')}
          </button>
        </div>
      </div>
    </MobileModal>
  );
}

export function DeleteProductModal({ product, updating, onClose, onConfirm }: DeleteProductModalProps) {
  const { t } = useLanguage();
  return (
    <MobileModal open={!!product} onClose={onClose}>
      <div className="flex flex-col items-center text-center">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
          <Trash2 size={32} className="text-red-500" />
        </div>
        <h3 className="text-xl font-serif font-bold text-white mb-2">{t('delete_product')}</h3>
        <p className="text-white/60 text-sm mb-6">"{product?.name}" {t('confirm_delete_product')}</p>
        <div className="flex gap-3 w-full">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-white/10 text-white/60 text-sm font-medium">{t('no')}</button>
          <button onClick={onConfirm} disabled={updating} className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2">
            {updating ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}{t('yes_delete')}
          </button>
        </div>
      </div>
    </MobileModal>
  );
}

export function DeleteCategoryModal({ category, loading, onClose, onConfirm }: DeleteCategoryModalProps) {
  const { t } = useLanguage();
  return (
    <MobileModal open={!!category} onClose={onClose}>
      <div className="flex flex-col items-center text-center">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
          <AlertCircle size={32} className="text-red-500" />
        </div>
        <h3 className="text-xl font-serif font-bold text-white mb-2">{t('delete_category')}</h3>
        <p className="text-white/60 text-sm mb-6">"{category?.name}" {t('confirm_delete_category')}</p>
        <div className="flex gap-3 w-full">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-white/10 text-white/60 text-sm font-medium">{t('no')}</button>
          <button onClick={onConfirm} disabled={loading} className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}{t('yes_delete')}
          </button>
        </div>
      </div>
    </MobileModal>
  );
}
