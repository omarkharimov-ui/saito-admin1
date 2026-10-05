'use client';

// 13j — THE ONE DESIGN SYSTEM of the inventory module.
// Owner: "0 dan yenidən yaz UI-ni — hazırda pisdir". 13i regrouped the
// navigation but kept the OLD content components underneath. From now on
// every inventory view is composed of these primitives — one visual
// language, both themes, no hardcoded colors, no gradients in tables.
//
// Rules (Apple-minimal):
//   • hairline borders (theme-border), rounded-xl (controls) / rounded-2xl (cards)
//   • 9-10px UPPERCASE tracking micro-labels for headers/labels
//   • tabular-nums for every number
//   • ONE accent per row (status chip); everything else neutral
//   • row hover = surface-soft/40 + action reveal
//   • solid button = bg theme-text / text theme-bg (brand-neutral, both themes)

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Loader2 } from '@/components/ui/saito-icons';
import { SPRING } from '@/lib/motion/system';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLayout } from '../context/LayoutContext';

/* ── Btn ────────────────────────────────────────────────────────────────── */
type BtnVariant = 'solid' | 'ghost' | 'soft' | 'danger' | 'success';
const BTN: Record<BtnVariant, string> = {
  solid:   'bg-[var(--theme-text)] text-[var(--theme-bg)] hover:opacity-90 shadow-sm',
  ghost:   'bg-[var(--theme-surface)] border border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)]',
  soft:    'bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]',
  danger:  'bg-rose-500/10 border border-rose-500/25 text-rose-500 hover:bg-rose-500/20',
  success: 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-500 hover:bg-emerald-500/20',
};

export function Btn({
  variant = 'ghost', icon: Icon, children, onClick, disabled, small, className = '', type = 'button', title,
}: {
  variant?: BtnVariant;
  icon?: React.ComponentType<{ size?: number | string; className?: string }>;
  children?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  small?: boolean;
  className?: string;
  /** Inside <form>: 'submit' triggers submit; default 'button' is safe. */
  type?: 'button' | 'submit';
  /** tooltip / icon-only label */
  title?: string;
}) {
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-black uppercase tracking-wider transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed ${small ? 'px-3 py-1.5 text-[10px]' : 'px-4 py-2.5 text-[11px]'} ${BTN[variant]} ${className}`}
    >
      {Icon && <Icon size={small ? 12 : 14} />}
      {children}
    </button>
  );
}

/* ── Card ───────────────────────────────────────────────────────────────── */
export function Card({ children, pad = 'none', className = '' }: {
  children: React.ReactNode; pad?: 'none' | 'sm' | 'md' | 'lg'; className?: string;
}) {
  const p = { none: '', sm: 'p-4', md: 'p-5', lg: 'p-6' }[pad];
  return <div className={`rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] ${p} ${className}`}>{children}</div>;
}

/* ── Stat (KPI) ─────────────────────────────────────────────────────────── */
const STAT_TONE: Record<string, string> = {
  neutral: 'text-[var(--theme-text)]',
  blue: 'text-blue-500 light:text-blue-700',
  rose: 'text-rose-500 light:text-rose-700',
  red: 'text-red-500 light:text-red-700',
  amber: 'text-amber-500 light:text-amber-700',
  emerald: 'text-emerald-500 light:text-emerald-700',
};
export function Stat({ label, value, sub, tone = 'neutral', onClick }: {
  label: string; value: React.ReactNode; sub?: string;
  tone?: keyof typeof STAT_TONE; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 py-3.5 transition-all hover:border-[var(--theme-text-muted)]/40 ${onClick ? 'cursor-pointer active:scale-[0.99]' : ''}`}
    >
      <p className="text-[9px] font-black uppercase tracking-[0.15em] text-[var(--theme-text-muted)]">{label}</p>
      <p className={`text-2xl font-black mt-1 ${STAT_TONE[tone]}`}>{value}</p>
      {sub && <p className="text-[10px] text-[var(--theme-text-muted)] mt-0.5">{sub}</p>}
    </div>
  );
}

/* ── Chip (status) ──────────────────────────────────────────────────────── */
const CHIP_TONE: Record<string, { dark: string; light: string }> = {
  ok:      { dark: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400', light: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700' },
  warn:    { dark: 'bg-amber-500/10 border-amber-500/25 text-amber-400', light: 'bg-amber-500/10 border-amber-500/30 text-amber-700' },
  crit:    { dark: 'bg-rose-500/10 border-rose-500/25 text-rose-400', light: 'bg-rose-500/10 border-rose-500/30 text-rose-700' },
  info:    { dark: 'bg-blue-500/10 border-blue-500/25 text-blue-400', light: 'bg-blue-500/10 border-blue-500/30 text-blue-700' },
  neutral: { dark: 'bg-[var(--theme-surface-soft)] border-[var(--theme-border)] text-[var(--theme-text-muted)]', light: 'bg-[var(--theme-surface-soft)] border-[var(--theme-border)] text-[var(--theme-text-secondary)]' },
};
export function Chip({ tone = 'neutral', children, dot = true, className = '' }: {
  tone?: keyof typeof CHIP_TONE; children: React.ReactNode; dot?: boolean; className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold whitespace-nowrap ${className} ${CHIP_TONE[tone].dark} ${CHIP_TONE[tone].light}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full bg-current ${tone === 'crit' ? 'animate-pulse' : ''}`} />}
      {children}
    </span>
  );
}

/* ── SectionHead (overline + title + right slot) ───────────────────────── */
export function SectionHead({ overline, title, right, className = '' }: {
  overline?: string; title?: string; right?: React.ReactNode; className?: string;
}) {
  if (!overline && !title && !right) return null;
  return (
    <div className={`flex items-center justify-between gap-3 flex-wrap ${className}`}>
      <div className="min-w-0">
        {overline && <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--theme-text-muted)]">{overline}</p>}
        {title && <h3 className="text-base font-black tracking-tight text-[var(--theme-text)] mt-0.5">{title}</h3>}
      </div>
      {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </div>
  );
}

/* ── SearchInput ────────────────────────────────────────────────────────── */
export function SearchInput({ value, onChange, placeholder = 'Axtar...', className = '' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)] pointer-events-none" />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm bg-[var(--theme-surface)] border border-[var(--theme-border)] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none focus:border-[var(--theme-text)]/40 transition-colors"
      />
    </div>
  );
}

/* ── Seg (segmented control) ────────────────────────────────────────────── */
export function Seg<T extends string>({ options, value, onChange }: {
  options: { id: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex bg-[var(--theme-surface-soft)] p-1 rounded-full border border-[var(--theme-border)] gap-0.5">
      {options.map(o => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={`relative px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-colors ${active ? 'text-[var(--theme-bg)]' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]'}`}
          >
            {active && <motion.span layoutId="seg-pill" className="absolute inset-0 rounded-full bg-[var(--theme-text)]" transition={SPRING} />}
            <span className="relative z-10">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ── DataTable ──────────────────────────────────────────────────────────── */
export interface Col<T> {
  key: string;
  label: string;
  /** grid track size: '1.4fr' | '100px' | 'auto' (default '1fr') */
  width?: string;
  align?: 'left' | 'center' | 'right';
  render: (row: T) => React.ReactNode;
  /** hide below this breakpoint: 'md' hides under md */
  hide?: 'sm' | 'md' | 'lg';
  className?: string;
}
const HIDE_CLS: Record<string, string> = { sm: 'hidden sm:block', md: 'hidden md:block', lg: 'hidden lg:block' };
const ALIGN_CLS: Record<string, string> = { left: 'text-left items-start', center: 'text-center items-center justify-center', right: 'text-right items-center' };

export function DataTable<T extends Record<string, any>>({
  cols, rows, rowKey, onRow, rowClass, empty, actionsWidth = 72,
}: {
  cols: Col<T>[];
  rows: T[];
  rowKey: (r: T) => string;
  onRow?: (r: T) => void;
  rowClass?: (r: T) => string;
  empty?: React.ReactNode;
  /** px width reserved for the trailing actions cell; 0 to disable */
  actionsWidth?: number;
}) {
  const track = cols.map(c => c.width || '1fr').join(' ') + (actionsWidth ? ` ${actionsWidth}px` : '');
  return (
    <Card pad="none" className="overflow-x-auto">
      <div style={{ minWidth: 640 }}>
        {/* header */}
        <div className="grid gap-3 px-4 sm:px-5 py-3 bg-[var(--theme-surface-soft)]/50 border-b border-[var(--theme-border)]" style={{ gridTemplateColumns: track }}>
          {cols.map(c => (
            <div key={c.key} className={`${HIDE_CLS[c.hide || ''] || ''} ${ALIGN_CLS[c.align || 'left']}`}>
              <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--theme-text-muted)]">{c.label}</span>
            </div>
          ))}
          {actionsWidth > 0 && <div className="text-right"><span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--theme-text-muted)]/60">Əməliyyat</span></div>}
        </div>
        {/* rows */}
        <div className="divide-y divide-[var(--theme-border)]">
          {rows.map(row => (
            <motion.div
              key={rowKey(row)}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={onRow ? () => onRow(row) : undefined}
              className={`group grid gap-3 px-4 sm:px-5 py-3 transition-colors ${onRow ? 'cursor-pointer' : ''} hover:bg-[var(--theme-surface-soft)]/40 ${rowClass?.(row) || ''}`}
              style={{ gridTemplateColumns: track }}
            >
              {cols.map(c => (
                <div key={c.key} className={`min-w-0 flex ${HIDE_CLS[c.hide || ''] || ''} ${ALIGN_CLS[c.align || 'left']} ${c.className || ''}`}>
                  {c.render(row)}
                </div>
              ))}
              {actionsWidth > 0 && <RowActions>{row.__actions as React.ReactNode}</RowActions>}
            </motion.div>
          ))}
        </div>
        {rows.length === 0 && (empty || <div className="py-12 text-center text-sm text-[var(--theme-text-muted)]">Qeyd yoxdur</div>)}
      </div>
    </Card>
  );
}

/** hover-reveal action cell (micro-interaction). Row content sets
    `row.__actions` via the helper below. */
function RowActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity duration-150">
      {children}
    </div>
  );
}

/** icon action button used inside DataTable rows */
export function IconBtn({ icon: Icon, onClick, tone = 'neutral', title }: {
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  onClick: (e: React.MouseEvent) => void;
  tone?: 'neutral' | 'emerald' | 'rose' | 'amber' | 'blue';
  title?: string;
}) {
  const tones: Record<string, string> = {
    neutral: 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)]',
    emerald: 'text-[var(--theme-text-muted)] hover:text-emerald-500 hover:bg-emerald-500/10',
    rose: 'text-[var(--theme-text-muted)] hover:text-rose-500 hover:bg-rose-500/10',
    amber: 'text-[var(--theme-text-muted)] hover:text-amber-500 hover:bg-amber-500/10',
    blue: 'text-[var(--theme-text-muted)] hover:text-blue-500 hover:bg-blue-500/10',
  };
  return (
    <button
      title={title}
      onClick={e => { e.stopPropagation(); onClick(e); }}
      className={`p-2 rounded-lg transition-all active:scale-90 ${tones[tone]}`}
    >
      <Icon size={14} />
    </button>
  );
}

/* ── Field (label + control) ────────────────────────────────────────────── */
export const fieldCls = 'w-full bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl px-3.5 py-2.5 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none focus:border-[var(--theme-text)]/40 transition-colors';
export function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="block text-[9px] font-black uppercase tracking-[0.18em] text-[var(--theme-text-muted)] ml-1">{label}</label>
      {children}
    </div>
  );
}

/* ── Modal (shared) ─────────────────────────────────────────────────────── */
export function Modal({ title, subtitle, onClose, children, wide }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/50 backdrop-blur-xl"
        onClick={onClose}
      />
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 340, damping: 28, mass: 1 }}
        className={`relative w-full ${wide ? 'max-w-2xl' : 'max-w-md'} bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-2xl p-5 sm:p-7 shadow-2xl max-h-[85vh] flex flex-col`}
      >
        <div className="flex items-start justify-between mb-5">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-[var(--theme-text)] tracking-tight">{title}</h2>
            {subtitle && <p className="text-[10px] text-[var(--theme-text-muted)] font-bold uppercase tracking-widest mt-1 truncate">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-all active:scale-90">
            <X size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pr-1 -mr-1">{children}</div>
      </motion.div>
    </div>
  );
}

/* ── FullPanel (13l) ────────────────────────────────────────────────────── */
// Owner: "xammal modal açılışı səhifəni 2/10 kimi açılmasın, tam şəkildə
// açılsın — bax hədiyyə kartları səhifəsi necə açılır". Portaled to <body>;
// geometry from LayoutContext (desktop shell: left = app-sidebar edge,
// top = below AdminHeader) — the panel spans the ENTIRE main content area
// (iOS-push at full size). Mobile / no provider → 0/0 → full viewport.
// Mount inside <AnimatePresence> so the exit slide plays on unmount.
export function FullPanel({ onClose, children }: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { mainEdge, mainBottom } = useLayout();
  const { lightMode } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div
      className="pointer-events-none fixed right-0 bottom-0 z-[200]"
      style={{ left: mainEdge, top: mainBottom }}
    >
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        onClick={onClose}
        aria-hidden
        className={`absolute inset-0 z-30 pointer-events-auto ${lightMode ? 'bg-black/25' : 'bg-black/50'} backdrop-blur-[3px]`}
      />
      <motion.aside
        role="dialog" aria-modal="true"
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
        className="absolute inset-0 z-40 pointer-events-auto flex flex-col bg-[var(--theme-bg)]"
      >
        {children}
      </motion.aside>
    </div>,
    document.body
  );
}

/* ── Drawer (13k → 13l full main-area panel) ────────────────────────────── */
export function Drawer({
  title, subtitle, onClose, children, footer, wide,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  /** sticky bottom action bar */
  footer?: React.ReactNode;
  /** @deprecated 13l — the panel spans the full main area; kept for call-site compat */
  wide?: boolean;
}) {
  return (
    <FullPanel onClose={onClose}>
      <div className="flex items-center justify-between gap-3 px-6 sm:px-10 py-5 border-b border-[var(--theme-border)] shrink-0">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-[var(--theme-text)] tracking-tight truncate">{title}</h2>
          {subtitle != null && subtitle !== '' && (
            <p className="text-[10px] font-bold text-[var(--theme-text-muted)] uppercase tracking-wider mt-1 truncate">{subtitle}</p>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Bağla"
          className="w-9 h-9 rounded-full flex items-center justify-center bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-all active:scale-90 shrink-0"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-8">{children}</div>
      {footer && (
        <div className="shrink-0 border-t border-[var(--theme-border)] px-6 sm:px-10 py-4 bg-[var(--theme-bg)]">
          {footer}
        </div>
      )}
    </FullPanel>
  );
}

/* ── Spinner (loading block) ────────────────────────────────────────────── */
export function SpinnerBlock({ height = 240 }: { height?: number }) {
  return (
    <div style={{ height }} className="flex items-center justify-center rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)]">
      <Loader2 size={20} className="animate-spin text-[var(--theme-text-muted)]" />
    </div>
  );
}

/* ── format helpers ─────────────────────────────────────────────────────── */
export const fmtAZN = (n: number | null | undefined, digits = 2) =>
  `₼${(n ?? 0).toLocaleString('az', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
export const fmtDate = (iso: string | null | undefined, withTime = true) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('az-AZ', { day: '2-digit', month: 'short' }) + (withTime ? ' · ' + d.toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' }) : '');
};
export const fmtTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('az-AZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export { AnimatePresence, motion };
