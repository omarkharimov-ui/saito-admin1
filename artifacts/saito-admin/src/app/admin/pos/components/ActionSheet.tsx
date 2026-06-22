'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';
import {
  Plus, Merge, Move, Split, CreditCard,
  Printer, Save, XCircle,
} from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import type { PosTable } from '../types/shared';

interface ActionSheetProps {
  table: PosTable | null;
  open: boolean;
  onClose: () => void;
  onAddOrder: () => void;
  onMerge: () => void;
  onTransfer: () => void;
  onSplitBill: () => void;
  onCloseBill: () => void;
  onPrint: () => void;
  onSaveDraft: () => void;
  onCancelTable?: () => void;
}

export function ActionSheet({ table, open, onClose, onAddOrder, onMerge, onTransfer, onSplitBill, onCloseBill, onPrint, onSaveDraft, onCancelTable }: ActionSheetProps) {
  const { t } = useLanguage();
  const { lightMode } = useTheme();

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [open]);

  if (!table) return null;

  const actions = [
    { id: 'add_order', icon: Plus, label: t('add_items') },
    { id: 'merge', icon: Merge, label: t('merge_tables') },
    { id: 'transfer', icon: Move, label: t('move_table') },
    { id: 'split', icon: Split, label: 'Masaları Ayır' },
    { id: 'close_bill', icon: CreditCard, label: t('close_bill') },
    { id: 'cancel_table', icon: XCircle, label: t('cancel_table_btn') },
    { id: 'print', icon: Printer, label: `${t('print')} · soon` },
    { id: 'save_draft', icon: Save, label: `${t('save')} · soon` },
  ];

  const isOccupied = table.status !== 'empty';
  const isMerged = (table.merged_orders && table.merged_orders.length > 0) || false;
  const visible = actions.filter(a => {
    if (a.id === 'close_bill') return isOccupied && table.total_amount > 0;
    if (a.id === 'cancel_table') return isOccupied;
    if (a.id === 'merge') return true;
    if (a.id === 'transfer') return true;
    if (a.id === 'split') return isMerged; // unmerge
    if (a.id === 'print' || a.id === 'save_draft') return false;
    return true;
  });

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className={`fixed inset-0 z-40 ${lightMode ? 'bg-black/20' : 'bg-black/40 backdrop-blur-sm'}`}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 60, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-8"
          >
            <div className="max-w-lg mx-auto">
              <div className={`flex justify-center mb-3`}>
                <div className={`w-10 h-1 rounded-full ${lightMode ? 'bg-gray-300' : 'bg-white/20'}`} />
              </div>

              <div className="text-center mb-4">
                <p className="text-2xl font-black text-[var(--theme-text)]">{t('table_label')} {table.table_number}</p>
                <p className="text-sm mt-0.5 text-[var(--theme-text-secondary)]">
                  {isOccupied ? `${table.guest_count} ${t('guest')} · ${table.total_amount.toFixed(2)} ₼` : t('empty')}
                </p>
              </div>

              <div className="rounded-[2rem] border p-4 bg-[var(--theme-panel)] border-[var(--theme-border)] shadow-2xl backdrop-blur-xl">
                <div className="grid grid-cols-4 gap-3">
                  {visible.map((action) => {
                    const Icon = action.icon;
                    return (
                      <motion.button
                        key={action.id}
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => {
                          const fn = {
                            add_order: onAddOrder,
                            merge: onMerge,
                            transfer: onTransfer,
                            split: onSplitBill,
                            close_bill: onCloseBill,
                            cancel_table: onCancelTable,
                            print: onPrint,
                            save_draft: onSaveDraft,
                          }[action.id];
                          if (fn) fn();
                          onClose();
                        }}
                        className={`flex flex-col items-center gap-1.5 p-3.5 rounded-[1.25rem] border transition-all ${
                          lightMode
                            ? 'bg-zinc-100 border-zinc-200'
                            : 'bg-zinc-800/40 border-zinc-700/30'
                        } shadow-sm hover:brightness-110`}
                      >
                        <Icon size={20} className={`${lightMode ? 'text-zinc-600' : 'text-zinc-300'}`} />
                        <span className="text-[9px] font-bold tracking-wider uppercase text-[var(--theme-text-secondary)] text-center leading-none">{action.label}</span>
                      </motion.button>
                    );
                  })}
                </div>
                <button onClick={onClose} className="w-full mt-3 py-3.5 rounded-[1.25rem] text-sm font-semibold transition-all bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-panel)] shadow-sm">
                  {t('close')}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
