'use client';

// Monobtn — monochrome PRIMARY button (user, 2026-09-20): NOT accent-gold.
// Light mode = black bg / white text · Dark mode = white bg / black text
// (Apple-style monochrome primary). Accent stays for highlights/pills only.
//
// Micro-interactions = MEANINGFUL state only (no idle/decorative loops):
//   idle → hover lift (85% opacity) → active press (scale .96, whileTap)
//   busy → spinner replaces content (min-width keeps layout stable)
//   success → check morph for a beat (caller controls the window)

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Loader2, Check } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';

export default function Monobtn({
  label, icon, onClick, disabled, busy, success, size = 'md', className = '',
}: {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  success?: boolean;
  size?: 'md' | 'sm';
  className?: string;
}) {
  const { lightMode } = useTheme();
  const reduce = useReducedMotion() ?? false;
  const bg = lightMode ? 'bg-black text-white hover:bg-black/85' : 'bg-white text-black hover:bg-white/85';
  const pad = size === 'md' ? 'px-4 py-2' : 'px-3.5 py-1.5';

  return (
    <motion.button
      type="button"
      onClick={busy || disabled ? undefined : onClick}
      whileTap={reduce ? undefined : { scale: 0.96 }}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex items-center justify-center rounded-full border border-transparent font-black uppercase tracking-widest transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${bg} ${pad} text-[11px] shrink-0 ${className}`}>
      {busy ? (
        <span className="flex items-center justify-center min-w-[16px]"><Loader2 size={13} strokeWidth={3} className="animate-spin" /></span>
      ) : (
        <span className="relative inline-flex items-center gap-1.5">
          {success ? <Check size={13} strokeWidth={3} /> : icon}
          {label}
        </span>
      )}
    </motion.button>
  );
}
