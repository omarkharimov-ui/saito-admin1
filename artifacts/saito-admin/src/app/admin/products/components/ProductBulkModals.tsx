'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X, Tag, CheckSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Category } from '@/types';

interface ProductBulkModalsProps {
  bulkAction: 'stock' | 'category' | null;
  selectedCount: number;
  categories: Category[];
  bulkUpdating: boolean;
  onClose: () => void;
  onStockUpdate: (inStock: boolean) => void;
  onCategoryUpdate: (categoryId: string) => void;
  getCategoryName: (cat: Category) => string;
}

export function ProductBulkModals({
  bulkAction, selectedCount, categories, bulkUpdating,
  onClose, onStockUpdate, onCategoryUpdate, getCategoryName,
}: ProductBulkModalsProps) {
  const { t } = useLanguage();

  if (typeof document === 'undefined') return null;
  return (
    <>
      {/* Bulk Stock Modal */}
      {createPortal(
      <AnimatePresence>
        {bulkAction === 'stock' && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} onClick={onClose} className="absolute inset-0 bg-black/35 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }} transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="relative w-full max-w-full sm:max-w-sm bg-card/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden"
            >
              <div className="px-7 pt-7 pb-6">
                <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-xl bg-[var(--theme-surface-soft)] hover:bg-[var(--theme-surface)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] flex items-center justify-center transition-all transition-premium"><X size={16} /></button>
                <h3 className="text-lg font-serif font-bold text-[var(--theme-text)] mb-1">{t('stock_status')}</h3>
                <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-widest mb-6">{selectedCount} {t('select_stock_status')}</p>
                <div className="flex gap-3">
                  <button onClick={() => onStockUpdate(true)} disabled={bulkUpdating}
                    className="flex-1 py-3 rounded-xl bg-green-500/10 text-green-400 border border-green-500/25 text-[10px] font-bold tracking-widest uppercase hover:bg-green-500/20 hover:border-green-500/50 hover:text-green-300 transition-all transition-premium disabled:opacity-40 flex items-center justify-center gap-2 hover:-translate-y-0.5 active:translate-y-0">
                    {bulkUpdating ? <Loader2 className="animate-spin" size={16} /> : <CheckSquare size={16} />}
                    {t('in_stock_label')}
                  </button>
                  <button onClick={() => onStockUpdate(false)} disabled={bulkUpdating}
                    className="flex-1 py-3 rounded-xl bg-red-500/10 text-red-400 border border-red-500/25 text-[10px] font-bold tracking-widest uppercase hover:bg-red-500/20 hover:border-red-500/50 hover:text-red-300 transition-all transition-premium disabled:opacity-40 flex items-center justify-center gap-2 hover:-translate-y-0.5 active:translate-y-0">
                    {bulkUpdating ? <Loader2 className="animate-spin" size={16} /> : <X size={16} />}
                    {t('out_of_stock_label')}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body)}

      {/* Bulk Category Modal */}
      {createPortal(
      <AnimatePresence>
        {bulkAction === 'category' && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} onClick={onClose} className="absolute inset-0 bg-black/35 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }} transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="relative w-full max-w-full sm:max-w-sm bg-card/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden"
            >
              <div className="px-7 pt-7 pb-2 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-serif font-bold text-white mb-1">{t('category_selection')}</h3>
                  <p className="text-[10px] text-white/30 uppercase tracking-widest">{selectedCount} {t('choose_new_category')}</p>
                </div>
                <button onClick={onClose} className="w-8 h-8 rounded-xl bg-[var(--theme-surface-soft)] hover:bg-[var(--theme-surface)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] flex items-center justify-center transition-all transition-premium shrink-0"><X size={16} /></button>
              </div>
              <div className="px-4 py-4 space-y-1.5 max-h-[280px] overflow-y-auto">
                {categories.map((cat) => (
                  <button key={cat.id} onClick={() => onCategoryUpdate(cat.id)} disabled={bulkUpdating}
                    className="w-full px-4 py-3 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-left transition-all transition-premium disabled:opacity-40 flex items-center gap-3 group">
                    <Tag size={14} className="text-[var(--theme-text-muted)] transition-colors shrink-0" />
                    <span className="text-sm font-semibold text-[var(--theme-text-secondary)] group-hover:text-[var(--theme-text)] transition-colors">{getCategoryName(cat)}</span>
                    {bulkUpdating && <Loader2 className="animate-spin ml-auto" size={14} />}
                  </button>
                ))}
              </div>
              <div className="px-4 pb-5 pt-1">
                <button onClick={onClose} disabled={bulkUpdating} className="w-full py-2.5 rounded-xl bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)] border border-[var(--theme-border)] text-[10px] font-bold tracking-widest uppercase hover:bg-[var(--theme-surface)] hover:text-[var(--theme-text)] transition-all transition-premium">
                  {t('cancel')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body)}
    </>
  );
}
