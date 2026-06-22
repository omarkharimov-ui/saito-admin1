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

const fastTransition = { type: "spring", stiffness: 500, damping: 42, mass: 0.8 };

export function ActionSheet({ 
  table, open, onClose, onAddOrder, onMerge, onTransfer, onSplitBill, onCloseBill, onPrint, onSaveDraft, onCancelTable,
  mergeMode, transferMode, splitMode, allTables, selectedForMerge, selectedForSplit, transferSource, transferTarget,
  onToggleSplit, onConfirmSplit, onCancelMode, onConfirmMerge, onConfirmTransfer
}: ActionSheetProps) {
  const { t } = useLanguage();
  const { lightMode } = useTheme();

  useEffect(() => {
    if (open && !mergeMode && !transferMode) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
  }, [open, mergeMode, transferMode]);

  if (!table && !mergeMode && !transferMode) return null;

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
  const currentView = mergeMode ? 'merge' : transferMode ? 'transfer' : splitMode ? 'split' : open ? 'actions' : 'none';

  return (
    <AnimatePresence mode="popLayout">
      {currentView !== 'none' && (
        <div key="modal-wrapper" className="fixed inset-0 z-50 flex items-end justify-center pointer-events-none">
          {(currentView === 'actions' || currentView === 'split') && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className={`fixed inset-0 z-0 pointer-events-auto ${lightMode ? 'bg-black/10' : 'bg-black/40 backdrop-blur-sm'}`}
              onClick={onClose}
            />
          )}

          <motion.div
            layout
            layoutId="pos-hybrid-kapsul"
            transition={fastTransition}
            className={`relative z-10 pointer-events-auto overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.2)] backdrop-blur-3xl border mb-8 ${
              lightMode ? 'bg-white border-zinc-200' : 'bg-zinc-900/95 border-white/10'
            } ${
              (currentView === 'merge' || currentView === 'transfer') 
                ? 'rounded-full px-6 py-3 min-w-[320px] max-w-md' 
                : 'rounded-[2.5rem] p-6 w-[90%] max-w-md'
            }`}
          >
            <AnimatePresence mode="wait">
              {currentView === 'actions' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }} key="actions">
                  <div className="text-center mb-5">
                    <p className="text-2xl font-black tracking-tighter">Masa {table?.table_number}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-50">{isOccupied ? `${table?.guest_count} Qonaq · ${table?.total_amount.toFixed(2)} ₼` : 'Boş Masa'}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2.5">
                    {visibleActions.map((action) => (
                      <button key={action.id} onClick={() => { const fn = { add_order: onAddOrder, merge: onMerge, transfer: onTransfer, split: onSplitBill, close_bill: onCloseBill, cancel_table: onCancelTable }[action.id as string]; if (fn) fn(); }}
                        className={`flex flex-col items-center justify-center gap-1.5 py-4 rounded-[1.2rem] border transition-all ${lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-600' : 'bg-white/5 border-white/5 text-zinc-300'} active:scale-95`}>
                        <action.icon size={20} strokeWidth={2.5} />
                        <span className="text-[9px] font-black tracking-widest uppercase">{action.label}</span>
                      </button>
                    ))}
                  </div>
                  <button onClick={onClose} className="w-full mt-4 py-3.5 rounded-[1.2rem] text-[10px] font-black uppercase tracking-widest bg-[var(--theme-surface-soft)] opacity-70 hover:opacity-100">Bağla</button>
                </motion.div>
              )}

              {currentView === 'split' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }} key="split" className="flex flex-col gap-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex flex-col">
                       <span className="text-[8px] font-black uppercase tracking-[0.2em] text-blue-500">Masaları Ayır</span>
                       <span className="text-lg font-black tracking-tighter">Masa {table?.table_number} Qrupu</span>
                    </div>
                    <button onClick={onClose} className="p-2 text-rose-500"><XCircle size={22} /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1">
                    {mergedChildren.map(child => (
                      <button key={child.table_number} onClick={() => onToggleSplit?.(child.table_number)}
                        className={`flex items-center gap-3 p-4 rounded-[1.2rem] border transition-all ${selectedForSplit?.includes(child.table_number) ? 'bg-blue-500 border-blue-500 text-white' : lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/5 border-white/5'}`}>
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

              {(currentView === 'merge' || currentView === 'transfer') && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }} key="bar" className="flex items-center gap-4">
                  <div className="flex flex-col mr-auto min-w-[140px]">
                    <span className="text-[8px] font-black uppercase tracking-widest text-blue-500 mb-0.5">{mergeMode ? 'Masaları Birləşdir' : 'Masayı Köçür'}</span>
                    <span className="text-xs font-black truncate">{mergeMode ? `${selectedForMerge?.length} masa seçildi` : (transferSource ? (transferTarget ? `Hədəf: Masa ${transferTarget}` : `Hədəf masanı seçin`) : 'Mənbə masanı seçin')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={onCancelMode} className="p-2 rounded-full bg-rose-500/10 text-rose-500"><X size={16} strokeWidth={3} /></button>
                    <button onClick={mergeMode ? onConfirmMerge : onConfirmTransfer} className={`px-6 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest ${lightMode ? 'bg-zinc-900 text-white' : 'bg-white text-black'}`}>Təsdiqlə</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
