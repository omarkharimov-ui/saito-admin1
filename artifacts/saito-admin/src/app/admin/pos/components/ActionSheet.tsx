'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';
import {
  Plus, Merge, Move, Split, CreditCard,
  Printer, Save, XCircle, Check, X
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
  
  // Shared Layout Props
  mergeMode?: boolean;
  transferMode?: boolean;
  splitMode?: boolean;
  allTables?: PosTable[];
  selectedForMerge?: number[];
  selectedForSplit?: number[];
  transferSource?: number | null;
  transferTarget?: number | null;
  
  onToggleSplit?: (num: number) => void;
  onConfirmSplit?: () => void;
  onCancelMode?: () => void;
  onConfirmMerge?: () => void;
  onConfirmTransfer?: () => void;
}

export function ActionSheet({ 
  table, open, onClose, onAddOrder, onMerge, onTransfer, onSplitBill, onCloseBill, onPrint, onSaveDraft, onCancelTable,
  mergeMode, transferMode, splitMode, allTables, selectedForMerge, selectedForSplit, transferSource, transferTarget,
  onToggleSplit, onConfirmSplit, onCancelMode, onConfirmMerge, onConfirmTransfer
}: ActionSheetProps) {
  const { t } = useLanguage();
  const { lightMode } = useTheme();

  useEffect(() => {
    if (open && !mergeMode && !transferMode) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
  }, [open, mergeMode, transferMode]);

  const isOccupied = table?.status !== 'empty';
  const isMerged = (table?.merged_orders && (table?.merged_orders as any[]).length > 0) || false;

  const actions = [
    { id: 'add_order', icon: Plus, label: t('add_items'), visible: true },
    { id: 'merge', icon: Merge, label: t('merge_tables'), visible: true },
    { id: 'transfer', icon: Move, label: t('move_table'), visible: true },
    { id: 'split', icon: Split, label: 'Masaları Ayır', visible: isMerged },
    { id: 'close_bill', icon: CreditCard, label: t('close_bill'), visible: isOccupied && (table?.total_amount ?? 0) > 0 },
    { id: 'cancel_table', icon: XCircle, label: t('cancel_table_btn'), visible: isOccupied },
  ];

  const visibleActions = actions.filter(a => a.visible);
  const mergedChildren = splitMode && allTables && table ? allTables.filter(t => t.merged_into_table === table.table_number) : [];

  // Determine current view
  const currentView = mergeMode ? 'merge' : transferMode ? 'transfer' : splitMode ? 'split' : open ? 'actions' : 'none';

  return (
    <AnimatePresence>
      {currentView !== 'none' && (
        <>
          {/* Backdrop only for Modal views */}
          {(currentView === 'actions' || currentView === 'split') && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className={`fixed inset-0 z-40 ${lightMode ? 'bg-black/10' : 'bg-black/40 backdrop-blur-sm'}`}
              onClick={onClose}
            />
          )}

          <div className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-8 flex justify-center pointer-events-none">
            <motion.div
              layout
              layoutId="pos-hybrid-kapsul"
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
              className={`pointer-events-auto overflow-hidden shadow-[0_25px_50px_rgba(0,0,0,0.3)] backdrop-blur-3xl border ${
                lightMode ? 'bg-white border-zinc-200' : 'bg-zinc-900/95 border-white/10'
              } ${
                (currentView === 'merge' || currentView === 'transfer') 
                  ? 'rounded-full px-6 py-3 min-w-[320px] max-w-md mb-2' 
                  : 'rounded-[2.5rem] p-6 w-full max-w-md'
              }`}
            >
              {/* 1. Main Actions View */}
              {currentView === 'actions' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} key="actions">
                  <div className="text-center mb-5">
                    <p className="text-2xl font-black text-[var(--theme-text)] tracking-tighter">Masa {table?.table_number}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--theme-text-secondary)] opacity-50 mt-0.5">
                      {isOccupied ? `${table?.guest_count} Qonaq · ${table?.total_amount.toFixed(2)} ₼` : 'Boş Masa'}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2.5">
                    {visibleActions.map((action) => (
                      <button
                        key={action.id}
                        onClick={() => {
                          const fn = { add_order: onAddOrder, merge: onMerge, transfer: onTransfer, split: onSplitBill, close_bill: onCloseBill, cancel_table: onCancelTable }[action.id as string];
                          if (fn) fn();
                        }}
                        className={`flex flex-col items-center justify-center gap-1.5 py-4 rounded-[1.2rem] border transition-all ${lightMode ? 'bg-zinc-100 border-zinc-200' : 'bg-white/5 border-white/5'} hover:brightness-105 active:scale-95`}
                      >
                        <action.icon size={20} strokeWidth={2.5} className={lightMode ? 'text-zinc-600' : 'text-zinc-300'} />
                        <span className="text-[9px] font-black tracking-widest uppercase opacity-80">{action.label}</span>
                      </button>
                    ))}
                  </div>
                  <button onClick={onClose} className="w-full mt-4 py-3.5 rounded-[1.2rem] text-[10px] font-black uppercase tracking-widest bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)]">Bağla</button>
                </motion.div>
              )}

              {/* 2. Split Mode View */}
              {currentView === 'split' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} key="split" className="flex flex-col gap-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex flex-col">
                       <span className="text-[8px] font-black uppercase tracking-[0.2em] text-blue-500">Masaları Ayır</span>
                       <span className="text-lg font-black text-[var(--theme-text)] tracking-tighter">Masa {table?.table_number} Qrupu</span>
                    </div>
                    <button onClick={onClose} className="p-2 text-rose-500"><XCircle size={22} /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1">
                    {mergedChildren.map(child => (
                      <button
                        key={child.table_number}
                        onClick={() => onToggleSplit?.(child.table_number)}
                        className={`flex items-center gap-3 p-4 rounded-[1.2rem] border transition-all ${selectedForSplit?.includes(child.table_number) ? 'bg-blue-500 border-blue-500 text-white' : lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/5 border-white/5'}`}
                      >
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${selectedForSplit?.includes(child.table_number) ? 'bg-white border-white' : 'border-current opacity-20'}`}>
                          {selectedForSplit?.includes(child.table_number) && <Check size={10} className="text-blue-500" strokeWidth={4} />}
                        </div>
                        <span className="text-xs font-black">Masa {child.table_number}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                     <button onClick={onClose} className="flex-1 py-3.5 rounded-[1.2rem] text-[9px] font-black bg-[var(--theme-surface-soft)]">Ləğv Et</button>
                     <button onClick={onConfirmSplit} className={`flex-[2] py-3.5 rounded-[1.2rem] text-[9px] font-black ${lightMode ? 'bg-zinc-900 text-white' : 'bg-white text-black'}`}>Seçilənləri Ayır</button>
                  </div>
                </motion.div>
              )}

              {/* 3. Merge/Transfer Bar View */}
              {(currentView === 'merge' || currentView === 'transfer') && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} key="bar" className="flex items-center gap-4">
                  <div className="flex flex-col mr-auto">
                    <span className="text-[8px] font-black uppercase tracking-widest text-blue-500 mb-0.5">
                      {mergeMode ? 'Masaları Birləşdir' : 'Masayı Köçür'}
                    </span>
                    <span className={`text-xs font-black ${lightMode ? 'text-zinc-900' : 'text-white'}`}>
                      {mergeMode ? `${selectedForMerge?.length} masa seçildi` : (transferSource ? (transferTarget ? `Hədəf: Masa ${transferTarget}` : `Hədəf masanı seçin`) : 'Mənbə masanı seçin')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={onCancelMode} className="p-2.5 rounded-full bg-rose-500/10 text-rose-500"><X size={16} strokeWidth={3} /></button>
                    <button 
                      onClick={mergeMode ? onConfirmMerge : onConfirmTransfer}
                      className={`px-6 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest ${lightMode ? 'bg-zinc-900 text-white' : 'bg-white text-black'}`}
                    >
                      Təsdiqlə
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
