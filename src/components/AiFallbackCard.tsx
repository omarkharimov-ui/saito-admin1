'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, AlertCircle, AlertTriangle, Sparkles, Keyboard } from 'lucide-react';

interface AiFallbackCardProps {
  loading: boolean;
  error: string | null;
  manualMode: boolean;
  onManualEnter: () => void;
  onRetry: () => void;
  title?: string;
  children?: React.ReactNode;
}

export function AiFallbackCard({
  loading,
  error,
  manualMode,
  onManualEnter,
  onRetry,
  title = 'AI Köməkçi',
  children,
}: AiFallbackCardProps) {
  return (
    <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-soft)] overflow-hidden">
      {/* Status header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--theme-border)]">
        <div className="flex items-center gap-2">
          {loading ? (
            <Loader2 size={14} className="animate-spin text-purple-400" />
          ) : error ? (
            <AlertCircle size={14} className="text-[var(--theme-text-secondary)]" />
          ) : manualMode ? (
            <Keyboard size={14} className="text-blue-400" />
          ) : (
            <Sparkles size={14} className="text-[var(--theme-text-secondary)]" />
          )}
          <span className="text-xs font-bold tracking-wide text-purple-300/80">
            {loading ? 'AI işləyir...' : error ? 'AI əlçatan deyil' : manualMode ? 'Əl ilə daxiletmə' : title}
          </span>
        </div>
        {error && !manualMode && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={onRetry}
              className="px-2 py-1 rounded-lg text-[10px] font-bold text-[var(--theme-text-secondary)] bg-[var(--theme-surface)] hover:bg-[var(--theme-surface-elevated)] transition-all"
            >
              Təkrar cəhd
            </button>
            <button
              onClick={onManualEnter}
              className="px-2 py-1 rounded-lg text-[10px] font-bold text-[var(--theme-text-secondary)] bg-[var(--theme-surface)] hover:bg-[var(--theme-surface-elevated)] transition-all"
            >
              Əl ilə daxil et
            </button>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {loading && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-4 space-y-2"
          >
            <div className="h-4 rounded-lg bg-[var(--theme-surface-elevated)] animate-pulse w-3/4" />
            <div className="h-4 rounded-lg bg-[var(--theme-surface-elevated)] animate-pulse w-1/2" />
            <div className="h-4 rounded-lg bg-[var(--theme-surface-elevated)] animate-pulse w-2/3" />
          </motion.div>
        )}

        {error && !manualMode && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4"
          >
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[var(--theme-surface)] border border-[var(--theme-border)]">
              <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-[var(--theme-text-secondary)]">{error}</p>
            </div>
          </motion.div>
        )}

        {manualMode && (
          <motion.div
            key="manual"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4"
          >
            <div className="flex items-center gap-2 mb-3 text-[var(--theme-text-secondary)]">
              <Keyboard size={12} className="text-blue-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--theme-text-secondary)]">
                Əl ilə daxiletmə rejimi
              </span>
            </div>
            {children}
          </motion.div>
        )}

        {!loading && !error && !manualMode && children && (
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-4"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
