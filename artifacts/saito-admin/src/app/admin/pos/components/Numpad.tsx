'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/lib/theme/ThemeContext';
import { appleCard, appleBackdrop } from '@/lib/modal-transitions';

interface NumpadProps {
  open: boolean;
  value: number;
  min?: number;
  max?: number;
  onClose: () => void;
  onConfirm: (value: number) => void;
}

export function Numpad({ open, value, min = 1, max = 99, onClose, onConfirm }: NumpadProps) {
  const { lightMode } = useTheme();
  const [display, setDisplay] = useState(String(value));
  const inputRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) setDisplay(String(value));
  }, [open, value]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const handleKey = useCallback((key: string) => {
    if (key === 'del') {
      setDisplay(prev => prev.length > 1 ? prev.slice(0, -1) : '');
    } else if (key === 'clear') {
      setDisplay('');
    } else {
      setDisplay(prev => {
        if (prev.length >= 2) return prev;
        return prev + key;
      });
    }
  }, []);

  const numVal = parseInt(display, 10);
  const isValid = !isNaN(numVal) && numVal >= min && numVal <= max;

  const handleConfirm = () => {
    if (isValid) {
      onConfirm(numVal);
      onClose();
    }
  };

  const keys = ['1','2','3','4','5','6','7','8','9','C','0','⌫'];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="numpad"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={appleBackdrop}
          className="fixed inset-0 z-[135] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            {...appleCard}
            onClick={e => e.stopPropagation()}
            className={`w-72 rounded-3xl p-5 shadow-2xl border ${lightMode ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-white/10'}`}
          >
            {/* Display */}
            <div className={`text-center mb-4 py-4 rounded-2xl border ${lightMode ? 'bg-zinc-50 border-zinc-100' : 'bg-white/5 border-white/10'}`}>
              <p className="text-4xl font-black tabular-nums text-[var(--theme-accent)]">{display || '—'}</p>
            </div>

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-2">
              {keys.map(key => (
                <button
                  key={key}
                  ref={key === '5' ? inputRef : undefined}
                  onClick={() => {
                    if (key === 'C') handleKey('clear');
                    else if (key === '⌫') handleKey('del');
                    else handleKey(key);
                  }}
                  className={`h-14 rounded-2xl text-lg font-bold transition-all active:scale-95 ${
                    key === 'C'
                      ? lightMode ? 'bg-red-50 text-red-500 border border-red-100' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      : key === '⌫'
                      ? lightMode ? 'bg-zinc-100 text-zinc-500 border border-zinc-200' : 'bg-white/5 text-zinc-400 border border-white/10'
                      : lightMode ? 'bg-zinc-100 text-zinc-900 border border-zinc-200 hover:bg-zinc-200' : 'bg-white/5 text-white border border-white/10 hover:bg-white/10'
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>

            {/* Confirm */}
            <button
              onClick={handleConfirm}
              disabled={!isValid}
              className="w-full mt-3 py-4 rounded-2xl bg-emerald-500 text-white text-xs font-black uppercase tracking-widest active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
            >
              Təsdiqlə
            </button>
            <button
              onClick={onClose}
              className="w-full mt-2 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-[var(--theme-surface-soft)] hover:opacity-100 transition-all"
            >
              Ləğv
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
