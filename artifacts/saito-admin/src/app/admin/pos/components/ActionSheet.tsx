'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';
import {
  Plus, Merge, Move, Split, CreditCard,
  Printer, Save, XCircle, Check
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
  // New props for split mode
  splitMode?: boolean;
  allTables?: PosTable[];
  selectedForSplit?: number[];
  onToggleSplit?: (num: number) => void;
  onConfirmSplit?: () => void;
}

export function ActionSheet({ 
  table, open, onClose, onAddOrder, onMerge, onTransfer, onSplitBill, onCloseBill, onPrint, onSaveDraft, onCancelTable,
  splitMode, allTables, selectedForSplit, onToggleSplit, onConfirmSplit
}: ActionSheetProps) {
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

  const isOccupied = table.status !== 'empty';
  const isMerged = (table.merged_orders && (table.merged_orders as any[]).length > 0) || false;

  const actions = [
    { id: 'add_order', icon: Plus, label: t('add_items'), visible: true },
    { id: 'merge', icon: Merge, label: t('merge_tables'), visible: true },
    { id: 'transfer', icon: Move, label: t('move_table'), visible: true },
    { id: 'split', icon: Split, label: 'Masaları Ayır', visible: isMerged },
    { id: 'close_bill', icon: CreditCard, label: t('close_bill'), visible: isOccupied && table.total_amount > 0 },
    { id: 'cancel_table', icon: XCircle, label: t('cancel_table_btn'), visible: isOccupied },
  ];

  const visibleActions = actions.filter(a => a.visible);

  const mergedChildren = splitMode && allTables ? allTables.filter(t => t.merged_into_table === table.table_number) : [];

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
            layout
            layoutId="action-sheet-morph"
            initial={{ opacity: 0, y: 100, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 60, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-8 pointer-events-none"
          >
            <div className="max-w-lg mx-auto pointer-events-auto">
              <div className={`flex justify-center mb-3`}>
                <div className={`w-10 h-1 rounded-full ${lightMode ? 'bg-gray-300' : 'bg-white/20'}`} />
              </div>

              <motion.div 
                layout
                className="rounded-[2.5rem] border p-6 bg-[var(--theme-panel)] border-[var(--theme-border)] shadow-2xl backdrop-blur-xl"
              >
                {!splitMode ? (
                  <>
                    <div className="text-center mb-6">
                      <p className="text-3xl font-black text-[var(--theme-text)] tracking-tighter">{t('table_label')} {table.table_number}</p>
                      <p className="text-sm mt-0.5 text-[var(--theme-text-secondary)] font-medium">
                        {isOccupied ? `${table.guest_count} ${t('guest')} · ${table.total_amount.toFixed(2)} ₼` : t('empty')}
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      {visibleActions.map((action) => {
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
                              }[action.id as string];
                              if (fn) fn();
                            }}
                            className={`flex flex-col items-center gap-2 p-4 rounded-[1.5rem] border transition-all ${
                              lightMode
                                ? 'bg-zinc-100 border-zinc-200'
                                : 'bg-zinc-800/40 border-zinc-700/30'
                            } shadow-sm hover:brightness-110`}
                          >
                            <Icon size={22} className={`${lightMode ? 'text-zinc-600' : 'text-zinc-300'}`} />
                            <span className="text-[10px] font-black tracking-wider uppercase text-[var(--theme-text-secondary)] text-center leading-tight">{action.label}</span>
                          </motion.button>
                        );
                      })}
                    </div>
                    
                    <button onClick={onClose} className="w-full mt-4 py-4 rounded-[1.5rem] text-sm font-bold transition-all bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:brightness-95 shadow-sm">
                      {t('close')}
                    </button>
                  </>
                ) : (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-5">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                         <span className="text-[10px] font-black uppercase tracking-widest text-[var(--theme-text-secondary)] opacity-50">Masaları Ayır</span>
                         <span className="text-xl font-black text-[var(--theme-text)] tracking-tight">Masa {table.table_number} Qrupundan Seçin</span>
                      </div>
                      <button onClick={onClose} className="p-2 rounded-full bg-rose-500/10 text-rose-500"><XCircle size={24} /></button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {mergedChildren.map(child => (
                        <button
                          key={child.table_number}
                          onClick={() => onToggleSplit?.(child.table_number)}
                          className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${
                            selectedForSplit?.includes(child.table_number)
                              ? 'bg-blue-500 border-blue-500 text-white shadow-lg shadow-blue-500/20'
                              : lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-600' : 'bg-zinc-800/40 border-zinc-700/30 text-zinc-400'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${selectedForSplit?.includes(child.table_number) ? 'bg-white border-white' : 'border-current opacity-30'}`}>
                            {selectedForSplit?.includes(child.table_number) && <Check size={12} className="text-blue-500" strokeWidth={4} />}
                          </div>
                          <span className="text-sm font-black tracking-tight">MASA {child.table_number}</span>
                        </button>
                      ))}
                    </div>

                    <div className="flex gap-3">
                       <button onClick={onClose} className="flex-1 py-4 rounded-2xl text-xs font-black uppercase tracking-widest bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)]">Ləğv Et</button>
                       <button 
                         onClick={onConfirmSplit}
                         className={`flex-[2] py-4 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl transition-all ${
                           lightMode ? 'bg-zinc-900 text-white' : 'bg-white text-black'
                         }`}
                       >
                         Seçilənləri Ayır
                       </button>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
