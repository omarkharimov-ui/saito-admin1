'use client';

// PageHeaderCard — products-page header language (user, 2026-09-20):
// the page top is one CONTAINED block (rounded-[32px] surface card, border,
// theme shadow) instead of floating text — that's what reads "clean" on
// /admin/products. Inside: serif display title (Playfair, uppercase) +
// wide-tracked subtitle, an optional live-count PILL (a pill sits in the
// background of a small container and morphs neutral→accent-soft while
// searching; the number ticks on top), and right-aligned actions
// (Spotlight search, primary button).
//
// First consumers: /admin/customers (v8.3) + /admin/gift-cards.
// Products keeps its own inline copy for now (not touched this wave).
// Colors: --theme-* tokens only. Motion: state (pill color morph 150ms,
// count tick 160ms) — all killed by prefers-reduced-motion.

import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

export function PillCount({
  pillId, label, searching,
}: {
  pillId: string; label: string; searching: boolean;
}) {
  const reduce = useReducedMotion() ?? false;
  return (
    <span className="shrink-0 rounded-full border border-[var(--theme-border)] bg-[var(--theme-surface-soft)] p-1">
      <span className="relative block rounded-full px-3 py-0.5 min-w-[86px] text-center">
        <motion.span
          layoutId={pillId}
          initial={false}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
          className={`absolute inset-0 rounded-full transition-colors duration-150 ${searching ? 'bg-[var(--theme-accent-soft)] border border-[var(--theme-accent-border)]' : 'bg-transparent border border-transparent'}`}
          aria-hidden
        />
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={label}
            initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: reduce ? 0 : 0.16, ease: 'easeOut' }}
            className={`relative z-10 block text-[11px] font-bold tabular-nums leading-4 ${searching ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-text-muted)]'}`}>
            {label}
          </motion.span>
        </AnimatePresence>
      </span>
    </span>
  );
}

export default function PageHeaderCard({
  title, subtitle, count, children,
}: {
  title: string;
  subtitle: string;
  count?: { pillId: string; label: string; searching: boolean };
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-[32px] p-6 sm:p-8 shadow-[var(--theme-shadow)]">
      <div className="flex items-center justify-between gap-x-4 gap-y-3 flex-wrap">
        <div className="min-w-0 flex items-center gap-3">
          <h1 className="font-serif text-3xl font-black uppercase tracking-tight text-[var(--theme-text)] leading-none truncate">
            {title}
          </h1>
          {count && <PillCount pillId={count.pillId} label={count.label} searching={count.searching} />}
        </div>
        {children && (
          <div className="flex items-center gap-3 flex-wrap justify-end">{children}</div>
        )}
      </div>
      <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--theme-text-muted)]">
        {subtitle}
      </p>
    </div>
  );
}
