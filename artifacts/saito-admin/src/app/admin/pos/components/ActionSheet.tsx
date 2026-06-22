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
    <AnimatePresence mode="wait">
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className={`fixed inset-0 z-40 ${lightMode ? 'bg-black/20' : 'bg-black/40 backdrop-blur-sm'}`}
            onClick={onClose}
          />
          <motion.div
            layout
            layoutId="action-sheet-container"
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ type: 'spring', stiffness: 400, damping: 40 }}
            className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-10 pointer-events-none"
          >
            <div className="max-w-lg mx-auto pointer-events-auto">
              <div className="flex justify-center mb-3">
                <div className={`w-10 h-1.5 rounded-full ${lightMode ? 'bg-gray-300' : 'bg-white/20'}`} />
              </div>

              <motion.div 
                layout
                className="rounded-[3rem] border p-7 bg-[var(--theme-panel)] border-[var(--theme-border)] shadow-[0_30px_60px_rgba(0,0,0,0.4)] backdrop-blur-3xl overflow-hidden"
              >
                {!splitMode ? (
                  <motion.div 
                    key="main-menu"
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="text-center mb-8">
                      <p className="text-4xl font-black text-[var(--theme-text)] tracking-tighter leading-none mb-1">Masa {table.table_number}</p>
                      <p className="text-sm text-[var(--theme-text-secondary)] font-bold uppercase tracking-widest opacity-60">
                        {isOccupied ? `${table.guest_count} Qonaq · ${table.total_amount.toFixed(2)} ₼` : 'Boş Masa'}
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      {visibleActions.map((action) => {
                        const Icon = action.icon;
                        return (
                          <motion.button
                            key={action.id}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
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
                            className={`flex flex-col items-center justify-center gap-2.5 aspect-square rounded-[2rem] border transition-all ${
                              lightMode
                                ? 'bg-zinc-100 border-zinc-200 text-zinc-600'
                                : 'bg-white/5 border-white/5 text-zinc-300'
                            } hover:brightness-110 active:brightness-90`}
                          >
                            <Icon size={24} strokeWidth={2.5} />
                            <span className="text-[10px] font-black tracking-widest uppercase text-center leading-none">{action.label}</span>
                          </motion.button>
                        );
                      })}
                    </div>
                    
                    <button onClick={onClose} className="w-full mt-5 py-4.5 rounded-[1.8rem] text-sm font-black uppercase tracking-widest transition-all bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:brightness-95 active:scale-[0.98]">
                      Bağla
                    </button>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="split-menu"
                    initial={{ opacity: 0, x: 20 }} 
                    animate={{ opacity: 1, x: 0 }} 
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                    className="flex flex-col gap-6"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                         <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500 mb-1">Masaları Ayır</span>
                         <span className="text-2xl font-black text-[var(--theme-text)] tracking-tighter">Ayırmaq üçün masaları seçin</span>
                      </div>
                      <button onClick={() => onClose()} className="p-3 rounded-full bg-rose-500/10 text-rose-500 hover:scale-110 transition-transform"><XCircle size={26} /></button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                      {mergedChildren.length > 0 ? mergedChildren.map(child => (
                        <button
                          key={child.table_number}
                          onClick={() => onToggleSplit?.(child.table_number)}
                          className={`flex items-center gap-4 p-5 rounded-3xl border transition-all duration-300 ${
                            selectedForSplit?.includes(child.table_number)
                              ? 'bg-blue-500 border-blue-500 text-white shadow-[0_10px_25px_rgba(59,130,246,0.3)] scale-[1.02]'
                              : lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-500' : 'bg-white/5 border-white/5 text-zinc-400'
                          }`}
                        >
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedForSplit?.includes(child.table_number) ? 'bg-white border-white' : 'border-current opacity-20'}`}>
                            {selectedForSplit?.includes(child.table_number) && <Check size={14} className="text-blue-500" strokeWidth={4} />}
                          </div>
                          <span className="text-base font-black tracking-tight">Masa {child.table_number}</span>
                        </button>
                      )) : (
                        <div className="col-span-2 py-10 text-center opacity-40 font-bold uppercase tracking-widest text-xs">Seçilə bilən masa yoxdur</div>
                      )}
                    </div>

                    <div className="flex gap-3">
                       <button onClick={() => onClose()} className="flex-1 py-4.5 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)] hover:brightness-95 active:scale-[0.98]">Ləğv Et</button>
                       <button 
                         onClick={onConfirmSplit}
                         disabled={!selectedForSplit || selectedForSplit.filter(n => n !== table.table_number).length === 0}
                         className={`flex-[2.5] py-4.5 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest shadow-2xl transition-all disabled:opacity-30 disabled:grayscale ${
                           lightMode ? 'bg-zinc-900 text-white' : 'bg-white text-black'
                         } hover:scale-[1.02] active:scale-[0.98]`}
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
