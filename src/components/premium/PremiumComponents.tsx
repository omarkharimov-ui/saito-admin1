'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DESIGN TOKENS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const colors = {
  background: {
    primary: '#F7F7F8',
    secondary: '#FFFFFF',
  },
  text: {
    primary: '#1D1D1F',
    secondary: '#6E6E73',
    muted: '#8E8E93',
  },
  border: {
    soft: '#E5E5E7',
    strong: '#D2D2D7',
  },
  accent: {
    primary: '#111111',
    light: '#F7F7F8',
    hover: '#1F1F1F',
    active: '#0A0A0A',
  },
  status: {
    success: '#16A34A',
    warning: '#9A6700',
    danger: '#BE123C',
    info: '#1D4ED8',
  },
  gold: '#8C7A4A',
};

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  '2xl': '32px',
  '3xl': '48px',
};

export const radius = {
  sm: '10px',
  md: '10px',
  lg: '16px',
  xl: '20px',
};

export const shadows = {
  subtle: '0 1px 2px rgba(0,0,0,.03)',
  small: '0 1px 2px rgba(0,0,0,.03), 0 8px 24px rgba(0,0,0,.04)',
  medium: '0 2px 6px rgba(0,0,0,.04), 0 12px 28px rgba(0,0,0,.06)',
  large: '0 8px 30px rgba(0,0,0,.10)',
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
  const baseClasses = 'font-medium transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-[0_0_0_4px_rgba(0,0,0,0.08)] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2';

  const variants = {
    primary: 'bg-[var(--theme-text)] text-[var(--theme-surface)] border border-[var(--theme-text)] hover:opacity-90 active:opacity-85',
    secondary: 'bg-[var(--theme-surface)] border border-[var(--theme-border)] text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)]',
    ghost: 'bg-transparent text-[var(--theme-text)] hover:bg-black/[0.03]',
    danger: 'bg-[#BE123C] text-white border border-[#BE123C] hover:bg-[#9F1239]',
  };

  const sizes = {
    sm: 'px-3 py-2 text-sm rounded-[10px]',
    md: 'px-4 py-2.5 text-base rounded-[10px]',
    lg: 'px-6 py-3 text-base rounded-[10px]',
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
      className={`inline-flex items-center justify-center gap-2 px-5 py-3 rounded-[12px] bg-[#111111] text-white border border-[#111111] hover:bg-[#1F1F1F] disabled:opacity-50 disabled:cursor-not-allowed transition-all ${className}`}
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
      <span>{phase === 'success' ? 'Saved' : children}</span>
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
      className={`relative h-8 w-14 rounded-full border transition-all backdrop-blur-xl ${
        checked
          ? 'bg-[var(--theme-text)] border-[var(--theme-text)]'
          : 'bg-[var(--theme-surface)]/70 border-[var(--theme-border)]'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 550, damping: 34 }}
        className={`absolute top-1 h-6 w-6 rounded-full shadow-sm ${
          checked ? 'bg-white left-7' : 'bg-[#111111] left-1'
        }`}
      />
    </motion.button>
  );
}

export function SlidingTabs({
  tabs,
  value,
  onChange,
  layoutId = 'active-tab-indicator',
  className = '',
}: {
  tabs: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  layoutId?: string;
  className?: string;
}) {
  return (
    <div className={`inline-flex items-center gap-1 p-1 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-soft)] ${className}`}>
      {tabs.map(tab => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`relative px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-colors ${active ? 'text-[var(--theme-text)]' : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]'}`}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-lg bg-[var(--theme-surface)] border border-[var(--theme-border-strong)] shadow-[0_6px_18px_rgba(0,0,0,0.05)]"
                transition={{ type: 'spring', stiffness: 460, damping: 34 }}
              />
            )}
            <span className="relative z-10">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CARD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function Card({
  children,
  className = '',
  ...props
}: {
  children: React.ReactNode;
  className?: string;
  [key: string]: any;
}) {
  return (
    <div
      className={`bg-[var(--theme-surface)] rounded-[16px] border border-[var(--theme-border)] shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_24px_rgba(0,0,0,0.04)] p-6 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INPUT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
        <label className="text-sm font-medium text-[var(--theme-text-secondary)]">{label}</label>
      )}
      <input
        className={`px-4 py-2.5 rounded-[10px] border font-medium text-base transition-all outline-none
          focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-[0_0_0_4px_rgba(212,175,55,0.12)]
          ${error ? 'border-[#BE123C]' : 'border-[var(--theme-border)]'}
          bg-[var(--theme-surface)] text-[var(--theme-text)] placeholder-[var(--theme-text-muted)]
          disabled:bg-[var(--theme-surface-soft)] disabled:cursor-not-allowed disabled:opacity-50`}
        {...props}
      />
      {error && <p className="text-sm text-[#BE123C]">{error}</p>}
      {helperText && <p className="text-sm text-[var(--theme-text-muted)]">{helperText}</p>}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MODAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/20 z-40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 6 }}
        transition={{ duration: 0.18 }}
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[90vh] bg-[var(--theme-surface)]/92 backdrop-blur-2xl rounded-[20px] shadow-[0_8px_30px_rgba(0,0,0,0.10)] z-50 overflow-hidden flex flex-col border border-[var(--theme-border)]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--theme-border)]">
          <h2 className="text-xl font-semibold text-[var(--theme-text)]">{title}</h2>
          {description && (
            <p className="text-sm text-[var(--theme-text-secondary)] mt-1">{description}</p>
          )}
        </div>

        {/* Content */}
        <div className="px-6 py-4 flex-1 overflow-y-auto">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-[var(--theme-border)] flex gap-3 justify-end">
            {footer}
          </div>
        )}
      </motion.div>
    </>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BADGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function Badge({
  children,
  variant = 'default',
}: {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}) {
  const variants = {
    default: 'bg-[#F5F5F5] text-[#1D1D1F]',
    success: 'bg-[#ECFDF3] text-[#166534]',
    warning: 'bg-[#FFF8E7] text-[#9A6700]',
    danger: 'bg-[#FFF1F2] text-[#BE123C]',
    info: 'bg-[#F5F7FF] text-[#1D4ED8]',
  };

  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[variant]}`}>
      {children}
    </span>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TABLE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function Table({
  columns,
  data,
  renderRow,
}: {
  columns: { key: string; label: string }[];
  data: any[];
  renderRow: (row: any, idx: number) => React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-[16px] border border-[var(--theme-border)] bg-[var(--theme-surface)]">
      <table className="w-full">
        <thead className="bg-[var(--theme-surface-soft)] border-b border-[var(--theme-border)]">
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                className="px-4 py-3 text-left text-xs font-semibold text-[#6E6E73] uppercase tracking-wider"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <motion.tr
              key={idx}
              className="border-b border-[#F0F0F2] last:border-b-0 hover:bg-black/[0.025] transition-colors"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {renderRow(row, idx)}
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STATUS INDICATOR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function StatusIndicator({
  status,
  label,
}: {
  status: 'available' | 'occupied' | 'reserved' | 'bill' | 'alert';
  label: string;
}) {
  const statusColors = {
    available: { dot: 'bg-[#D2D2D7]', text: 'text-[#6E6E73]' },
    occupied: { dot: 'bg-[#1D4ED8]', text: 'text-[#1D4ED8]' },
    reserved: { dot: 'bg-[#9A6700]', text: 'text-[#9A6700]' },
    bill: { dot: 'bg-[#166534]', text: 'text-[#166534]' },
    alert: { dot: 'bg-[#BE123C]', text: 'text-[#BE123C]' },
  };

  const colors = statusColors[status];

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
      <span className={`text-sm font-medium ${colors.text}`}>{label}</span>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// METRIC CARD (for dashboard)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function MetricCard({
  label,
  value,
  trend,
  context,
}: {
  label: string;
  value: string;
  trend?: { direction: 'up' | 'down'; percentage: number };
  context?: string;
}) {
  return (
    <Card className="space-y-2">
      <p className="text-sm font-medium text-[#6E6E73]">{label}</p>
      <div className="flex items-end justify-between">
        <p className="text-3xl font-bold text-[#1D1D1F]">{value}</p>
        {trend && (
          <div className={`flex items-center gap-1 text-sm font-medium ${trend.direction === 'up' ? 'text-[#166534]' : 'text-[#BE123C]'}`}>
            {trend.direction === 'up' ? '↑' : '↓'} {trend.percentage}%
          </div>
        )}
      </div>
      {context && <p className="text-xs text-[#8E8E93]">{context}</p>}
    </Card>
  );
}
