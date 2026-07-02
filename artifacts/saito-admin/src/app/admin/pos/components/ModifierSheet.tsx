'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Check } from 'lucide-react';
import type { PosModifierSelection } from '../types/shared';

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



export function ModifierSheet({ open, productName, productPrice, variants = [], onClose, onConfirm }: ModifierSheetProps) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(undefined);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      const defaultVar = variants.find(v => v.is_default) || variants[0];
      setSelectedVariantId(defaultVar?.id);
      setNotes('');
    }
  }, [open, variants]);

  const currentVariant = useMemo(() => variants.find(v => v.id === selectedVariantId), [variants, selectedVariantId]);
  const basePrice = currentVariant?.price ?? productPrice;

  const handleConfirm = () => {
    onConfirm([], notes, selectedVariantId);
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

              {/* Notes */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-3">Xüsusi qeyd</p>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Məsələn: Buzlu olsun, acı olmasın və s." className="w-full bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 text-sm text-white placeholder:text-white/20 outline-none focus:border-gold/30 min-h-[100px] transition-all resize-none" />
              </div>

              {/* Footer Actions */}
              <div className="flex items-center gap-4 pt-4 border-t border-white/[0.05]">
                <div className="flex-1">
                  <p className="text-[10px] uppercase font-black tracking-widest text-white/20">Ümumi Məbləğ</p>
                  <p className="text-2xl font-black text-white tabular-nums">{basePrice.toFixed(2)} ₼</p>
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
