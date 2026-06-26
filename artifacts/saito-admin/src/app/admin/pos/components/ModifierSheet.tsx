'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Check } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { PosModifier, PosModifierSelection } from '../types/shared';

interface PosVariant {
  id: string;
  name: string;
  price: number;
  is_default: boolean;
}

interface ModifierSheetProps {
  open: boolean;
  productName: string;
  productPrice: number;
  variants?: PosVariant[];
  onClose: () => void;
  onConfirm: (modifiers: PosModifierSelection[], notes: string, variantId?: string) => void;
}

const DONENESS: PosModifier[] = [
  { id: 'doneness_rare', name: 'Azbişmiş (Rare)', price: 0, quantity: 1 },
  { id: 'doneness_medium', name: 'Orta (Medium)', price: 0, quantity: 1 },
  { id: 'doneness_well', name: 'Tam bişmiş (Well)', price: 0, quantity: 1 },
];

const EXTRAS: PosModifier[] = [
  { id: 'extra_cheese', name: 'Əlavə pendir', price: 1.50, quantity: 1 },
  { id: 'extra_bacon', name: 'Əlavə bekon', price: 2.00, quantity: 1 },
  { id: 'extra_avocado', name: 'Əlavə avokado', price: 2.50, quantity: 1 },
  { id: 'extra_egg', name: 'Əlavə yumurta', price: 1.00, quantity: 1 },
];

const REMOVALS: PosModifier[] = [
  { id: 'remove_onion', name: 'Soğansız', price: 0, quantity: 1 },
  { id: 'remove_pickle', name: 'Turşusuz', price: 0, quantity: 1 },
  { id: 'remove_tomato', name: 'Pomidorsuz', price: 0, quantity: 1 },
  { id: 'remove_lettuce', name: 'Kahısız', price: 0, quantity: 1 },
];

export function ModifierSheet({ open, productName, productPrice, variants = [], onClose, onConfirm }: ModifierSheetProps) {
  const { lightMode } = useTheme();
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(undefined);
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [selectedRemovals, setSelectedRemovals] = useState<string[]>([]);
  const [doneness, setDoneness] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      const defaultVar = variants.find(v => v.is_default) || variants[0];
      setSelectedVariantId(defaultVar?.id);
      setDoneness(null);
      setSelectedExtras([]);
      setSelectedRemovals([]);
      setNotes('');
    }
  }, [open, variants]);

  const currentVariant = useMemo(() => variants.find(v => v.id === selectedVariantId), [variants, selectedVariantId]);
  const basePrice = currentVariant?.price ?? productPrice;
  const totalExtras = EXTRAS.filter(e => selectedExtras.includes(e.id)).reduce((s, e) => s + (e.price ?? 0), 0);

  const handleConfirm = () => {
    const modifiers: PosModifierSelection[] = [];
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
    onConfirm(modifiers, notes, selectedVariantId);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-md" onClick={onClose} />
          <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 40, stiffness: 400 }} className="fixed bottom-0 inset-x-0 z-[140] max-h-[90vh] overflow-y-auto bg-[var(--theme-surface)] rounded-t-[40px] border-t border-white/[0.08] shadow-2xl p-6 pb-12">
            <div className="max-w-2xl mx-auto space-y-8">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-black tracking-tight">{productName}</h2>
                  <p className="text-gold font-bold mt-1">{basePrice.toFixed(2)} ₼</p>
                </div>
                <button onClick={onClose} className="w-10 h-10 rounded-2xl bg-white/[0.05] flex items-center justify-center text-white/40 hover:text-white transition-all"><X size={20} /></button>
              </div>

              {/* Variants Section (Task 5) */}
              {variants.length > 0 && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-3">Variant seçin</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {variants.map(v => (
                      <button key={v.id} onClick={() => setSelectedVariantId(v.id)} className={`relative flex flex-col p-4 rounded-2xl border transition-all ${selectedVariantId === v.id ? 'bg-gold/10 border-gold/50 text-gold' : 'bg-white/[0.03] border-white/[0.06] text-white/60 hover:border-white/20'}`}>
                        <span className="text-sm font-bold">{v.name}</span>
                        <span className="text-xs mt-1 opacity-60">{v.price.toFixed(2)} ₼</span>
                        {selectedVariantId === v.id && <div className="absolute top-2 right-2"><Check size={14} /></div>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Doneness */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-3">Bişmə dərəcəsi</p>
                <div className="flex flex-wrap gap-2">
                  {DONENESS.map(d => (
                    <button key={d.id} onClick={() => setDoneness(doneness === d.id ? null : d.id)} className={`px-5 py-2.5 rounded-xl text-xs font-bold border transition-all ${doneness === d.id ? 'bg-white text-black border-white' : 'bg-white/[0.03] border-white/[0.06] text-white/60'}`}>{d.name}</button>
                  ))}
                </div>
              </div>

              {/* Extras & Removals (Grid) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-3">Əlavələr</p>
                  <div className="space-y-2">
                    {EXTRAS.map(e => {
                      const sel = selectedExtras.includes(e.id);
                      return (
                        <button key={e.id} onClick={() => setSelectedExtras(p => sel ? p.filter(x => x !== e.id) : [...p, e.id])} className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all ${sel ? 'bg-white/10 border-white/30 text-white' : 'bg-white/[0.02] border-white/[0.05] text-white/40'}`}>
                          <span className="text-sm font-bold">{e.name}</span>
                          <span className="text-xs opacity-60">+{(e.price ?? 0).toFixed(2)} ₼</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-3">Çıxarılacaq</p>
                  <div className="grid grid-cols-2 gap-2">
                    {REMOVALS.map(r => {
                      const sel = selectedRemovals.includes(r.id);
                      return (
                        <button key={r.id} onClick={() => setSelectedRemovals(p => sel ? p.filter(x => x !== r.id) : [...p, r.id])} className={`p-3 rounded-xl border text-xs font-bold transition-all ${sel ? 'bg-rose-500/20 border-rose-500/50 text-rose-400' : 'bg-white/[0.02] border-white/[0.05] text-white/30'}`}>{r.name}</button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-3">Xüsusi qeyd</p>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Məsələn: Buzlu olsun, acı olmasın və s." className="w-full bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 text-sm text-white placeholder:text-white/20 outline-none focus:border-gold/30 min-h-[100px] transition-all resize-none" />
              </div>

              {/* Footer Actions */}
              <div className="flex items-center gap-4 pt-4 border-t border-white/[0.05]">
                <div className="flex-1">
                  <p className="text-[10px] uppercase font-black tracking-widest text-white/20">Ümumi Məbləğ</p>
                  <p className="text-2xl font-black text-white tabular-nums">{(basePrice + totalExtras).toFixed(2)} ₼</p>
                </div>
                <button onClick={handleConfirm} className="px-10 py-4 rounded-[20px] bg-gold text-black font-black text-sm uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all shadow-xl shadow-gold/20 flex items-center gap-2">
                  <Plus size={18} /> Əlavə et
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
