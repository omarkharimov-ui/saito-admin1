'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { KeyRound, X } from 'lucide-react';

interface PinInputDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (pin: string) => void;
  title: string;
  description: string;
  loading?: boolean;
}

export function PinInputDialog({ open, onClose, onConfirm, title, description, loading }: PinInputDialogProps) {
  const [pin, setPin] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPin('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length === 4) onConfirm(pin);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 35, mass: 0.4 }}
              className="pointer-events-auto w-full max-w-xs bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-3xl shadow-2xl overflow-hidden"
            >
              <form onSubmit={handleSubmit}>
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-gold/10 border border-gold/20 flex items-center justify-center text-gold">
                        <KeyRound size={20} />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-[var(--theme-text)]">{title}</h3>
                        <p className="text-[10px] text-[var(--theme-text-muted)] mt-0.5">{description}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onClose}
                      className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/5 text-white/30 hover:text-white hover:bg-white/10 transition-all"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <input
                      ref={inputRef}
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="0000"
                      className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-gold/30 px-4 py-3 text-center text-2xl font-black tracking-[0.5em] text-[var(--theme-text)] placeholder:text-white/10 outline-none rounded-2xl transition-all"
                    />
                    <p className="text-[10px] text-[var(--theme-text-muted)] text-center">4 rəqəmli PIN daxil edin</p>
                  </div>
                </div>
                <div className="p-6 pt-0">
                  <button
                    type="submit"
                    disabled={pin.length !== 4 || loading}
                    className="w-full py-3 bg-white text-black rounded-2xl text-xs font-black uppercase tracking-widest disabled:opacity-40 hover:bg-white/90 transition-all shadow-lg"
                  >
                    {loading ? 'Yoxlanır...' : 'Təsdiq Et'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
