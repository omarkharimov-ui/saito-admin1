'use client';

// 13i — the visual layer of the view state machine (owner: "state machine
// transitions + micro-interactions"). One set of primitives for every
// inventory sub-view: skeleton (shimmer), error (quiet card + retry),
// empty (contextual CTA), and a ready-content transition wrapper.
// All theme-var based — no hardcoded white (light mode safe).

import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCw } from '@/components/ui/saito-icons';
import { SPRING } from '@/lib/motion/system';

/** Shimmer skeleton — `rows` quiet bars. */
export function ViewSkeleton({ rows = 4, height = 56 }: { rows?: number; height?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Yüklənir">
      {Array.from({ length: rows }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0.35 }}
          animate={{ opacity: [0.35, 0.7, 0.35] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.12 }}
          className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)]"
          style={{ height }}
        />
      ))}
    </div>
  );
}

/** Error card — quiet, one retry action. */
export function ViewError({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      className="rounded-2xl border border-rose-500/25 bg-rose-500/[0.04] p-8 text-center space-y-3"
    >
      <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center">
        <AlertTriangle size={22} className="text-rose-400" />
      </div>
      <p className="text-sm font-bold text-[var(--theme-text)]">Məlumat yüklənə bilmədi</p>
      <p className="text-xs text-[var(--theme-text-muted)] max-w-sm mx-auto">{message || 'Bağlantını yoxlayıb yenidən cəh edin.'}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--theme-text)] text-[var(--theme-bg)] text-[11px] font-black uppercase tracking-widest transition-all active:scale-[0.97]"
        >
          <RefreshCw size={13} /> Yenidən Cəh Et
        </button>
      )}
    </motion.div>
  );
}

/** Contextual empty state — icon, one line, optional CTA. */
export function ViewEmpty({
  icon, title, desc, ctaLabel, onCta,
}: {
  icon: React.ReactNode;
  title: string;
  desc?: string;
  ctaLabel?: string;
  onCta?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] py-14 text-center space-y-3"
    >
      <div className="w-14 h-14 mx-auto rounded-2xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] flex items-center justify-center text-[var(--theme-text-muted)]">
        {icon}
      </div>
      <p className="text-sm font-bold text-[var(--theme-text)]">{title}</p>
      {desc && <p className="text-xs text-[var(--theme-text-muted)] max-w-md mx-auto leading-relaxed">{desc}</p>}
      {ctaLabel && onCta && (
        <button
          onClick={onCta}
          className="mt-1 px-5 py-2.5 rounded-xl bg-[var(--theme-text)] text-[var(--theme-bg)] text-[11px] font-black uppercase tracking-widest transition-all active:scale-[0.97]"
        >
          {ctaLabel}
        </button>
      )}
    </motion.div>
  );
}

/** Ready-content transition — every sub-view's content enters with a soft
    fade+rise so state changes (tab switch, sub switch, retry→ready) read
    as one continuous motion, never a hard swap. */
export function ViewContent({ children, id }: { children: React.ReactNode; id: string }) {
  return (
    <motion.div
      key={id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, duration: 0.35 }}
    >
      {children}
    </motion.div>
  );
}

/** 13l: deep-link / CTA anchor scroll to a stacked section (`sec-{id}`).
    Re-anchors a few times so async content (skeleton → table) expanding
    ABOVE the section doesn't push the viewport off-target. */
export function scrollToSection(id: string) {
  const go = () => document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  go();
  [400, 900, 1600].forEach(d => setTimeout(go, d));
}

/** Animated number — pulses once when the value changes (KPI micro-interaction). */
export function LiveNumber({ value, className = '' }: { value: number | string; className?: string }) {
  return (
    <span key={String(value)} className={`inline-block ${className}`}>
      <motion.span
        initial={{ scale: 1.18, opacity: 0.4 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 20 }}
        className="inline-block tabular-nums"
      >
        {value}
      </motion.span>
    </span>
  );
}
