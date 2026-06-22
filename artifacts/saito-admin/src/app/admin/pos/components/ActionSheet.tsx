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

  // Split mode is handled internally, but for Merge/Transfer we close and morph to the Bar in page.tsx
  const isMorphingOut = !splitMode && open === false; 

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className={`fixed inset-0 z-40 ${lightMode ? 'bg-black/10' : 'bg-black/40 backdrop-blur-sm'}`}
            onClick={onClose}
          />
          <motion.div
            layout
            layoutId="pos-modal-kapsul"
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-8 pointer-events-none"
          >
            <div className="max-w-md mx-auto pointer-events-auto">
              <motion.div 
                layout
                className="rounded-[2.2rem] border p-5 bg-[var(--theme-panel)] border-[var(--theme-border)] shadow-[0_25px_50px_rgba(0,0,0,0.3)] backdrop-blur-3xl overflow-hidden"
              >
                {!splitMode ? (
                  <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div className="text-center mb-5">
                      <p className="text-2xl font-black text-[var(--theme-text)] tracking-tighter">Masa {table.table_number}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--theme-text-secondary)] opacity-50 mt-0.5">
                        {isOccupied ? `${table.guest_count} Qonaq · ${table.total_amount.toFixed(2)} ₼` : 'Boş Masa'}
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-2.5">
                      {visibleActions.map((action) => {
                        const Icon = action.icon;
                        return (
                          <motion.button
                            key={action.id}
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
                            className={`flex flex-col items-center justify-center gap-1.5 py-4 rounded-[1.2rem] border transition-all ${
                              lightMode
                                ? 'bg-zinc-100 border-zinc-200'
                                : 'bg-white/5 border-white/5'
                            } hover:brightness-105 active:brightness-95`}
                          >
                            <Icon size={20} strokeWidth={2.5} className={lightMode ? 'text-zinc-600' : 'text-zinc-300'} />
                            <span className="text-[9px] font-black tracking-widest uppercase text-center leading-none opacity-80">{action.label}</span>
                          </motion.button>
                        );
                      })}
                    </div>
                    
                    <button onClick={onClose} className="w-full mt-4 py-3.5 rounded-[1.2rem] text-[10px] font-black uppercase tracking-[0.2em] transition-all bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:brightness-95 shadow-sm">
                      Bağla
                    </button>
                  </motion.div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex flex-col gap-4"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex flex-col">
                         <span className="text-[8px] font-black uppercase tracking-[0.2em] text-blue-500">Masaları Ayır</span>
                         <span className="text-lg font-black text-[var(--theme-text)] tracking-tighter">Masa {table.table_number} Qrupu</span>
                      </div>
                      <button onClick={onClose} className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5"><XCircle size={22} className="text-rose-500" /></button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 max-h-[220px] overflow-y-auto custom-scrollbar">
                      {mergedChildren.map(child => (
                        <button
                          key={child.table_number}
                          onClick={() => onToggleSplit?.(child.table_number)}
                          className={`flex items-center gap-3 p-4 rounded-[1.2rem] border transition-all duration-300 ${
                            selectedForSplit?.includes(child.table_number)
                              ? 'bg-blue-500 border-blue-500 text-white shadow-lg shadow-blue-500/10 scale-[1.02]'
                              : lightMode ? 'bg-zinc-50 border-zinc-200 text-zinc-500' : 'bg-white/5 border-white/5 text-zinc-400'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${selectedForSplit?.includes(child.table_number) ? 'bg-white border-white' : 'border-current opacity-20'}`}>
                            {selectedForSplit?.includes(child.table_number) && <Check size={10} className="text-blue-500" strokeWidth={4} />}
                          </div>
                          <span className="text-xs font-black tracking-tight">Masa {child.table_number}</span>
                        </button>
                      ))}
                    </div>

                    <div className="flex gap-2">
                       <button onClick={onClose} className="flex-1 py-3.5 rounded-[1.2rem] text-[9px] font-black uppercase tracking-widest bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)]">Ləğv Et</button>
                       <button 
                         onClick={onConfirmSplit}
                         className={`flex-[2] py-3.5 rounded-[1.2rem] text-[9px] font-black uppercase tracking-widest shadow-xl transition-all ${
                           lightMode ? 'bg-zinc-900 text-white' : 'bg-white text-black'
                         }`}
                       >
                         Seçilənləri Ayır ({selectedForSplit ? selectedForSplit.filter(n => n !== table.table_number).length : 0})
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
