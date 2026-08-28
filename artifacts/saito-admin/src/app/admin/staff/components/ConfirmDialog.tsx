'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Təsdiq',
  cancelLabel = 'Ləğv Et',
  destructive = false,
  loading = false,
}: ConfirmDialogProps) {
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
              className="pointer-events-auto w-full max-w-sm bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-base font-black text-[var(--theme-text)]">{title}</h3>
                  <button
                    onClick={onClose}
                    className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/5 text-white/30 hover:text-white hover:bg-white/10 transition-all"
                  >
                    <X size={14} />
                  </button>
                </div>
                <p className="text-sm text-[var(--theme-text-secondary)] leading-relaxed">{description}</p>
              </div>
              <div className="p-6 pt-0 flex items-center justify-end gap-3">
                <button
                  onClick={onClose}
                  disabled={loading}
                  className="px-5 py-2.5 text-xs font-bold text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-colors rounded-xl hover:bg-white/5 disabled:opacity-40"
                >
                  {cancelLabel}
                </button>
                <button
                  onClick={onConfirm}
                  disabled={loading}
                  className={`px-5 py-2.5 rounded-2xl text-xs font-bold tracking-wide transition-all disabled:opacity-40 ${
                    destructive
                      ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20 hover:bg-rose-400'
                      : 'bg-white text-black shadow-lg hover:bg-white/90'
                  }`}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                      Emal olunur...
                    </span>
                  ) : (
                    confirmLabel
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
