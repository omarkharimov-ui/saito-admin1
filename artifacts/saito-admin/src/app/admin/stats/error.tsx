'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function StatsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[var(--theme-error-bg)] border border-[var(--theme-error-text)]/20 flex items-center justify-center mb-5">
        <AlertTriangle size={24} className="text-[var(--theme-error-text)]" />
      </div>
      <h2 className="text-2xl font-serif font-bold text-white mb-2">Something went wrong</h2>
      <p className="text-sm text-[var(--theme-text-muted)] mb-6 max-w-md">
        {process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred.'}
      </p>
      <button onClick={reset} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-gold/10 border border-gold/20 text-gold hover:brightness-110 transition-all">
        <RefreshCw size={15} /> Try Again
      </button>
    </div>
  );
}
