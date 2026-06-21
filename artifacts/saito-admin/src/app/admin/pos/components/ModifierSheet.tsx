'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Minus } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { PosModifier, PosModifierSelection } from '../types/shared';

type Modifier = PosModifier;

type ModifierSelection = PosModifierSelection;

interface ModifierSheetProps {
  open: boolean;
  productName: string;
  productPrice: number;
  onClose: () => void;
  onConfirm: (modifiers: ModifierSelection[], notes: string) => void;
}

const DONENESS: Modifier[] = [
  { id: 'doneness_rare', name: 'Azbişmiş (Rare)', price: 0, quantity: 1 },
  { id: 'doneness_medium', name: 'Orta (Medium)', price: 0, quantity: 1 },
  { id: 'doneness_well', name: 'Tam bişmiş (Well)', price: 0, quantity: 1 },
];

const EXTRAS: Modifier[] = [
  { id: 'extra_cheese', name: 'Əlavə pendir', price: 1.50, quantity: 1 },
  { id: 'extra_bacon', name: 'Əlavə bekon', price: 2.00, quantity: 1 },
  { id: 'extra_avocado', name: 'Əlavə avokado', price: 2.50, quantity: 1 },
  { id: 'extra_egg', name: 'Əlavə yumurta', price: 1.00, quantity: 1 },
];

const REMOVALS: Modifier[] = [
  { id: 'remove_onion', name: 'Soğansız', price: 0, quantity: 1 },
  { id: 'remove_pickle', name: 'Turşusuz', price: 0, quantity: 1 },
  { id: 'remove_tomato', name: 'Pomidorsuz', price: 0, quantity: 1 },
  { id: 'remove_lettuce', name: 'Kahısız', price: 0, quantity: 1 },
];

export function ModifierSheet({ open, productName, productPrice, onClose, onConfirm }: ModifierSheetProps) {
  const { lightMode } = useTheme();
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [selectedRemovals, setSelectedRemovals] = useState<string[]>([]);
  const [doneness, setDoneness] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

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

  const totalExtras = EXTRAS.filter(e => selectedExtras.includes(e.id)).reduce((s, e) => s + (e.price ?? 0), 0);

  const handleConfirm = () => {
    const modifiers: ModifierSelection[] = [];
    if (doneness) {
      const d = DONENESS.find(m => m.id === doneness);
      if (d) modifiers.push({ id: d.id, name: d.name, price: d.price ?? 0, quantity: 1 });
    }
    selectedExtras.forEach(id => {
      const e = EXTRAS.find(m => m.id === id);
      if (e) modifiers.push({ id: e.id, name: e.name, price: e.price ?? 0, quantity: 1 });
    });
    selectedRemovals.forEach(id => {
      const r = REMOVALS.find(m => m.id === id);
      if (r) modifiers.push({ id: r.id, name: r.name, price: r.price ?? 0, quantity: 1 });
    });
    onConfirm(modifiers, notes);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className={`fixed inset-0 z-50 ${lightMode ? 'bg-black/20' : 'bg-black/50 backdrop-blur-sm'}`} onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 200, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] overflow-y-auto p-4 pb-8"
          >
            <div className="max-w-lg mx-auto rounded-3xl border p-5 bg-[var(--theme-surface-muted)] border-[var(--theme-border)] shadow-2xl backdrop-blur-xl">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className={`text-lg font-bold ${lightMode ? 'text-gray-900' : 'text-white'}`}>{productName}</p>
                  <p className={`text-sm font-black ${lightMode ? 'text-gray-900' : 'text-white/60'}`}>{productPrice.toFixed(2)} ₼</p>
                </div>
                <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]">
                  <X size={18} />
                </button>
              </div>

              {/* Doneness */}
              <div className="mb-4">
                <p className={`text-[10px] uppercase tracking-widest font-semibold mb-2 ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>Bişmə dərəcəsi</p>
                <div className="flex gap-1.5">
                  {DONENESS.map(d => (
                    <button
                      key={d.id}
                      onClick={() => setDoneness(d.id === doneness ? null : d.id)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
                        doneness === d.id
                          ? lightMode ? 'bg-gray-900 text-white shadow-sm' : 'bg-white text-black'
                          : lightMode ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-white/[0.06] text-white/50'
                      }`}
                    >{d.name}</button>
                  ))}
                </div>
              </div>

              {/* Extras */}
              <div className="mb-4">
                <p className={`text-[10px] uppercase tracking-widest font-semibold mb-2 ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>Əlavələr</p>
                <div className="space-y-1">
                  {EXTRAS.map(e => {
                    const sel = selectedExtras.includes(e.id);
                    return (
                      <button
                        key={e.id}
                        onClick={() => setSelectedExtras(prev => sel ? prev.filter(x => x !== e.id) : [...prev, e.id])}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all border ${
                          sel ? (lightMode ? 'bg-zinc-900 border-zinc-900 text-white shadow-sm' : 'bg-white border-white text-black') : lightMode ? 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100' : 'bg-white/[0.03] border-white/[0.06] text-white/60'
                        }`}
                      >
                        <span>{e.name}</span>
                        <span className="font-bold">+{(e.price ?? 0).toFixed(2)} ₼</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Removals */}
              <div className="mb-4">
                <p className={`text-[10px] uppercase tracking-widest font-semibold mb-2 ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>Çıxarılacaq</p>
                <div className="flex flex-wrap gap-1.5">
                  {REMOVALS.map(r => {
                    const sel = selectedRemovals.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        onClick={() => setSelectedRemovals(prev => sel ? prev.filter(x => x !== r.id) : [...prev, r.id])}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                          sel ? (lightMode ? 'bg-red-50 border-red-300 text-red-700' : 'bg-red-500/10 border-red-500/25 text-red-300') : lightMode ? 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200' : 'bg-white/[0.04] border-white/[0.07] text-white/50'
                        }`}
                      >{r.name}</button>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              <div className="mb-4">
                <p className={`text-[10px] uppercase tracking-widest font-semibold mb-2 ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>Qeyd</p>
                <input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Xüsusi istəklər..."
                  className={`w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all ${lightMode ? 'bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-gray-400 shadow-sm' : 'bg-white/[0.04] border border-white/[0.07] text-white placeholder:text-white/20 focus:border-white/25'}`}
                />
              </div>

               {/* Total + Confirm */}
              <div className={`flex items-center gap-3 pt-3 border-t ${lightMode ? 'border-gray-200' : 'border-white/[0.06]'}`}>
                <div className="flex-1">
                  <p className={`text-xs ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>Cəmi</p>
                  <p className={`text-lg font-black ${lightMode ? 'text-gray-900' : 'text-white'}`}>{(productPrice + totalExtras).toFixed(2)} ₼</p>
                </div>
                <button onClick={handleConfirm}
                  className={`px-6 py-3 rounded-xl font-bold text-sm active:scale-95 transition-all ${lightMode ? 'bg-zinc-900 text-white shadow-lg shadow-black/25 hover:bg-black' : 'bg-white text-black shadow-lg shadow-white/10 hover:bg-gray-200'}`}>
                  <Plus size={16} className="inline mr-1" /> Əlavə et
                </button>
              </div>

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
