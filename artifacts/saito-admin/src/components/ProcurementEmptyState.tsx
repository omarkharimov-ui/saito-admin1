'use client';

import { motion } from 'framer-motion';
import { CheckCircle, Loader2 } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-16 text-white/20">
      <div className="mx-auto mb-4 flex items-center justify-center">
        {icon || <CheckCircle size={40} className="text-emerald-400/50" />}
      </div>
      <p className="text-sm text-white/40 mb-1">{title}</p>
      {description && <p className="text-xs text-white/20">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="flex items-center justify-center h-48">
      <Loader2 size={28} className="animate-spin text-white/15" />
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border p-8 text-center"
      style={{ borderColor: 'rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)' }}
    >
      <p className="text-sm text-red-400 mb-2">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="text-xs text-white/40 hover:text-white transition-colors underline">
          Yenidən cəhd et
        </button>
      )}
    </motion.div>
  );
}
