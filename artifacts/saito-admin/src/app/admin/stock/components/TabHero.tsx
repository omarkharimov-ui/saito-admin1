'use client';

// 13i — "3 saniyə qaydası" (owner: "user anlasında 3 saniyədə nə etməlidir").
// Every tab opens with ONE plain-language status line + ONE primary CTA.
// The user never has to scan a table to learn what to do next.
//
//   ● 7 xammal tədarük tələb edir            [ Nə Alım → ]
//     Stok bitməyə yaxındır — Order Guide ilə DRAFT PO yarat
//
// Tones: ok (emerald, quiet) · info (blue) · warning (amber) · critical
// (rose, pulsing dot). All theme-var based (light-mode safe).

import { motion } from 'framer-motion';

export type HeroTone = 'ok' | 'info' | 'warning' | 'critical' | 'muted';

const TONE: Record<HeroTone, { dot: string; text: string; bg: string; border: string; pulse: boolean }> = {
  muted:    { dot: 'bg-[var(--theme-text-muted)]/40', text: 'text-[var(--theme-text)]', bg: 'bg-[var(--theme-surface-soft)]', border: 'border-[var(--theme-border)]', pulse: false },
  ok:       { dot: 'bg-emerald-400', text: 'text-emerald-400', bg: 'bg-emerald-500/[0.05]', border: 'border-emerald-500/20', pulse: false },
  info:     { dot: 'bg-blue-400',    text: 'text-blue-400',    bg: 'bg-blue-500/[0.05]',    border: 'border-blue-500/20',    pulse: false },
  warning:  { dot: 'bg-amber-400',   text: 'text-amber-400',   bg: 'bg-amber-500/[0.05]',   border: 'border-amber-500/25',   pulse: false },
  critical: { dot: 'bg-rose-500',    text: 'text-rose-400',    bg: 'bg-rose-500/[0.05]',    border: 'border-rose-500/25',    pulse: true },
};

// light-mode: 400-level accents are pale on white — step down one shade.
const TONE_LIGHT: Record<HeroTone, { dot: string; text: string; bg: string; border: string }> = {
  muted:    { dot: 'bg-[var(--theme-text-muted)]/50', text: 'text-[var(--theme-text-secondary)]', bg: 'bg-[var(--theme-surface-soft)]', border: 'border-[var(--theme-border)]' },
  ok:       { dot: 'bg-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-500/[0.06]', border: 'border-emerald-500/25' },
  info:     { dot: 'bg-blue-500',    text: 'text-blue-600',    bg: 'bg-blue-500/[0.06]',    border: 'border-blue-500/25' },
  warning:  { dot: 'bg-amber-500',   text: 'text-amber-600',   bg: 'bg-amber-500/[0.06]',   border: 'border-amber-500/30' },
  critical: { dot: 'bg-rose-500',    text: 'text-rose-600',    bg: 'bg-rose-500/[0.06]',    border: 'border-rose-500/30' },
};

export interface TabHeroProps {
  tone: HeroTone;
  title: string;
  sub?: string;
  cta?: { label: string; onClick: () => void; ghost?: boolean };
  /** optional secondary action (ghost) */
  cta2?: { label: string; onClick: () => void };
  lightMode?: boolean;
}

export default function TabHero({ tone, title, sub, cta, cta2, lightMode }: TabHeroProps) {
  const t = lightMode ? { ...TONE[tone], ...TONE_LIGHT[tone] } : TONE[tone];
  return (
    // 13m: static entry — the tab swap is instant now; a y:10 slide here would
    // re-introduce the "səhifə oynuyur" feel (audit D1). Only the dot pulses.
    <div
      className={`rounded-2xl border ${t.border} ${t.bg} px-5 sm:px-6 py-4 sm:py-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5`}
    >
      <div className="flex items-start gap-3.5 min-w-0 flex-1">
        <span className={`relative mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${t.dot}`}>
          {t.pulse && (
            <motion.span
              className="absolute inset-0 rounded-full"
              style={{ background: 'inherit' }}
              animate={{ scale: [1, 2.1], opacity: [0.55, 0] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
            />
          )}
        </span>
        <div className="min-w-0">
          <h2 className={`text-base sm:text-lg font-black tracking-tight leading-snug ${t.text}`}>{title}</h2>
          {sub && <p className="text-xs text-[var(--theme-text-muted)] mt-1 leading-relaxed">{sub}</p>}
        </div>
      </div>
      {(cta || cta2) && (
        <div className="flex items-center gap-2 shrink-0">
          {cta2 && (
            <button
              onClick={cta2.onClick}
              className="px-4 py-2.5 rounded-xl bg-[var(--theme-surface)] border border-[var(--theme-border)] text-[var(--theme-text-secondary)] text-[11px] font-black uppercase tracking-wider hover:text-[var(--theme-text)] transition-all active:scale-[0.97]"
            >
              {cta2.label}
            </button>
          )}
          {cta && (
            <button
              onClick={cta.onClick}
              className={`px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all active:scale-[0.97] shadow-sm ${
                cta.ghost
                  ? 'bg-[var(--theme-surface)] border border-[var(--theme-border)] text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)]'
                  : 'bg-[var(--theme-text)] text-[var(--theme-bg)] hover:opacity-90'
              }`}
            >
              {cta.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
