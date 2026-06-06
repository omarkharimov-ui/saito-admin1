'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Merge, Move, Split, CreditCard,
  Printer, Save, X,
} from 'lucide-react';
import type { PosTable } from '../types';

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
}

const actions = [
  { id: 'add_order', icon: Plus, label: 'Sifariş', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { id: 'merge', icon: Merge, label: 'Birləşdir', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  { id: 'transfer', icon: Move, label: 'Köçür', color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
  { id: 'split', icon: Split, label: 'Böl', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  { id: 'close_bill', icon: CreditCard, label: 'Hesab', color: 'text-gold', bg: 'bg-gold/10', border: 'border-gold/20' },
  { id: 'print', icon: Printer, label: 'Çap', color: 'text-white/60', bg: 'bg-white/5', border: 'border-white/10' },
  { id: 'save_draft', icon: Save, label: 'Saxla', color: 'text-white/60', bg: 'bg-white/5', border: 'border-white/10' },
];

export function ActionSheet({ table, open, onClose, onAddOrder, onMerge, onTransfer, onSplitBill, onCloseBill, onPrint, onSaveDraft }: ActionSheetProps) {
  if (!table) return null;

  const isOccupied = table.status !== 'empty';
  const visible = actions.filter(a => {
    if (a.id === 'close_bill') return isOccupied && table.total_amount > 0;
    return true;
  });

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
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
              <div className="flex justify-center mb-3">
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>

              <div className="text-center mb-4">
                <p className="text-2xl font-black text-white">Masa {table.table_number}</p>
                <p className="text-sm text-white/40 mt-0.5">
                  {isOccupied ? `${table.guest_count} nəfər · ${table.total_amount.toFixed(2)} ₼` : 'Boş masa'}
                </p>
              </div>

              <div className="rounded-3xl border border-white/[0.08] bg-[#0c0c0c]/95 backdrop-blur-xl p-4 shadow-2xl">
                <div className="grid grid-cols-4 gap-2">
                  {visible.map((action) => {
                    const Icon = action.icon;
                    return (
                      <motion.button
                        key={action.id}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.92 }}
                        onClick={() => {
                          const fn = {
                            add_order: onAddOrder,
                            merge: onMerge,
                            transfer: onTransfer,
                            split: onSplitBill,
                            close_bill: onCloseBill,
                            print: onPrint,
                            save_draft: onSaveDraft,
                          }[action.id];
                          if (fn) fn();
                          onClose();
                        }}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all ${action.bg} ${action.border}`}
                      >
                        <Icon size={20} className={action.color} />
                        <span className="text-[9px] font-bold tracking-wider uppercase text-white/50">{action.label}</span>
                      </motion.button>
                    );
                  })}
                </div>
                <button onClick={onClose} className="w-full mt-3 py-3 rounded-2xl bg-white/5 border border-white/10 text-white/40 text-sm font-semibold hover:bg-white/10 transition-all">
                  Bağla
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
