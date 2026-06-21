'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DESIGN TOKENS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const colors = {
  background: {
    primary: 'var(--theme-bg)',
    secondary: 'var(--theme-surface)',
  },
  text: {
    primary: 'var(--theme-text)',
    secondary: 'var(--theme-text-muted)',
    muted: 'var(--theme-text-muted)',
  },
  border: {
    soft: 'var(--theme-border)',
    strong: 'var(--theme-border)',
  },
  accent: {
    primary: 'var(--theme-text)',
    light: 'var(--theme-surface-soft)',
    hover: 'var(--theme-surface)',
    active: 'var(--theme-bg)',
  },
  status: {
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#3b82f6',
  },
  gold: '#d4af37',
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BUTTONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  ...props
}: {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  [key: string]: any;
}) {
  const baseClasses = 'font-bold transition-all active:scale-[0.98] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2';

  const variants = {
    primary: 'bg-[var(--theme-text)] text-[var(--theme-bg)] border border-[var(--theme-border)] hover:opacity-90',
    secondary: 'bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-[var(--theme-text)] hover:bg-[var(--theme-surface)]',
    ghost: 'bg-transparent text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)]',
    danger: 'bg-rose-500 text-white border border-rose-600 hover:bg-rose-600',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs rounded-xl',
    md: 'px-5 py-2.5 text-sm rounded-2xl',
    lg: 'px-7 py-3.5 text-base rounded-2xl',
  };

  return (
    <button
      className={`${baseClasses} ${variants[variant]} ${sizes[size]}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
          <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      )}
      {children}
    </button>
  );
}

export function SaveSuccessButton({
  children = 'Save',
  onClick,
  disabled = false,
  className = '',
}: {
  children?: React.ReactNode;
  onClick?: () => void | Promise<void>;
  disabled?: boolean;
  className?: string;
}) {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'success'>('idle');

  useEffect(() => {
    if (phase !== 'success') return;
    const t = setTimeout(() => setPhase('idle'), 1200);
    return () => clearTimeout(t);
  }, [phase]);

  const handleClick = async () => {
    if (disabled || phase === 'loading') return;
    setPhase('loading');
    try {
      await onClick?.();
      setPhase('success');
    } catch {
      setPhase('idle');
    }
  };

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95 }}
      onClick={handleClick}
      disabled={disabled || phase === 'loading'}
      className={`inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-[var(--theme-text)] text-[var(--theme-bg)] border border-[var(--theme-border)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all ${className}`}
    >
      {phase === 'loading' && (
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
          <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.37 0 0 5.37 0 12h4z" />
        </svg>
      )}
      {phase === 'success' && (
        <motion.svg
          initial={{ scale: 0.6, rotate: -40, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          className="w-4 h-4"
          viewBox="0 0 20 20"
          fill="none"
        >
          <path d="M4 10.5L8 14L16 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </motion.svg>
      )}
      <span className="font-bold uppercase tracking-widest text-[10px]">{phase === 'success' ? 'TAMAMLANDI' : children}</span>
    </motion.button>
  );
}

export function ElasticSwitch({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      whileTap={{ scale: 0.97 }}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative h-7 w-12 rounded-full border transition-all duration-500 backdrop-blur-xl ${
        checked
          ? 'bg-emerald-500 border-emerald-600'
          : 'bg-[var(--theme-surface-soft)] border-[var(--theme-border)]'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 550, damping: 34 }}
        className={`absolute top-0.5 h-5.5 w-5.5 rounded-full shadow-sm bg-white ${
          checked ? 'left-6' : 'left-0.5'
        }`}
      />
    </motion.button>
  );
}

export function Card({
  children,
  className = '',
  accent = 'none',
  ...props
}: {
  children: React.ReactNode;
  className?: string;
  accent?: 'none' | 'success' | 'warning' | 'danger' | 'info' | 'gold';
  [key: string]: any;
}) {
  const accentClasses = {
    none: '',
    success: 'border-l-[5px] border-l-emerald-500',
    warning: 'border-l-[5px] border-l-amber-500',
    danger: 'border-l-[5px] border-l-rose-500',
    info: 'border-l-[5px] border-l-blue-500',
    gold: 'border-l-[5px] border-l-[#d4af37]',
  };

  return (
    <div
      className={`bg-[var(--theme-surface)] rounded-[24px] border border-[var(--theme-border)] shadow-sm dark:shadow-xl p-6 ${accentClasses[accent]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function Input({
  label,
  error,
  helperText,
  ...props
}: {
  label?: string;
  error?: string;
  helperText?: string;
  [key: string]: any;
}) {
  return (
    <div className="flex flex-col gap-2">
      {label && (
        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--theme-text-muted)]">{label}</label>
      )}
      <input
        className={`px-5 py-3 rounded-2xl border font-bold text-sm transition-all outline-none
          ${error ? 'border-rose-500' : 'border-[var(--theme-border)]'}
          bg-[var(--theme-surface-soft)] text-[var(--theme-text)] placeholder-[var(--theme-text-muted)]
          focus:border-[var(--theme-text)] focus:ring-4 focus:ring-[var(--theme-text)]/5
          disabled:opacity-50 disabled:cursor-not-allowed`}
        {...props}
      />
      {error && <p className="text-xs font-bold text-rose-500">{error}</p>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  if (!open) return null;

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal Body */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className={`relative w-full ${maxWidthClasses[maxWidth]} bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-[40px] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.4)] overflow-hidden flex flex-col border-l-[8px] border-l-[#d4af37]`}
      >
        {/* Header */}
        <div className="px-8 pt-8 pb-4">
          <h2 className="text-2xl font-black tracking-tight text-[var(--theme-text)]">{title}</h2>
          {description && (
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--theme-text-muted)] mt-2 opacity-60">{description}</p>
          )}
        </div>

        {/* Content */}
        <div className="px-8 py-6 flex-1 overflow-y-auto">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="px-8 py-6 bg-[var(--theme-surface-soft)] border-t border-[var(--theme-border)] flex gap-4 justify-end">
            {footer}
          </div>
        )}
      </motion.div>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  trend,
  context,
  className = '',
}: {
  label: string;
  value: string | number;
  trend?: { direction: 'up' | 'down'; percentage: number };
  context?: string;
  className?: string;
}) {
  return (
    <Card className={`flex flex-col gap-2 p-5 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--theme-text-muted)]">{label}</span>
        {trend && (
          <div className={`flex items-center gap-1 text-[10px] font-black ${trend.direction === 'up' ? 'text-emerald-500' : 'text-rose-500'}`}>
            <span>{trend.direction === 'up' ? '↑' : '↓'}</span>
            <span>{trend.percentage}%</span>
          </div>
        )}
      </div>
      <div className="flex flex-col">
        <span className="text-2xl font-black text-[var(--theme-text)]">{value}</span>
        {context && <span className="text-[10px] font-bold text-[var(--theme-text-muted)] mt-0.5 opacity-60">{context}</span>}
      </div>
    </Card>
  );
}

export function Badge({
  children,
  variant = 'default',
}: {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}) {
  const variants = {
    default: 'bg-[var(--theme-surface-soft)] text-[var(--theme-text)] border border-[var(--theme-border)]',
    success: 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-500 border border-amber-500/20',
    danger: 'bg-rose-500/10 text-rose-500 border border-rose-500/20',
    info: 'bg-blue-500/10 text-blue-500 border border-blue-500/20',
  };

  return (
    <span className={`inline-flex px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${variants[variant]}`}>
      {children}
    </span>
  );
}

export function StatusIndicator({
  status,
  label,
}: {
  status: 'available' | 'occupied' | 'reserved' | 'bill' | 'alert';
  label: string;
}) {
  const configs = {
    available: 'bg-zinc-400',
    occupied: 'bg-blue-500',
    reserved: 'bg-amber-500',
    bill: 'bg-emerald-500',
    alert: 'bg-rose-500',
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${configs[status] || configs.available}`} />
      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--theme-text-muted)]">{label}</span>
    </div>
  );
}
