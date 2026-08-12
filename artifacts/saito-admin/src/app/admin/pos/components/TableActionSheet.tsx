'use client';

import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { fastExit, slideUp } from '@/lib/modal-transitions';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';

interface ActionCardProps {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: 'default' | 'accent' | 'destructive';
  disabled?: boolean;
}

export function ActionCard({ icon, label, onClick, href, variant = 'default', disabled }: ActionCardProps) {
  const { lightMode } = useTheme();
  const { t } = useLanguage();

  const baseClass = `flex flex-col items-center justify-center gap-2.5 py-4 px-1 rounded-4xl border transition-all active:scale-95`;
  
  const variantClasses = {
    default: lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-600' : 'bg-white/5 border-white/5 text-zinc-300',
    accent: lightMode ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600' : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400',
    destructive: lightMode ? 'bg-rose-500/10 border-rose-500/20 text-rose-600' : 'bg-rose-500/10 border-rose-500/20 text-rose-400',
  };

  const content = (
    <>
      <div className="flex items-center justify-center">{icon}</div>
      <span className="text-xs font-black tracking-widest uppercase text-center px-1 leading-tight min-h-[45px] flex items-center justify-center">{label}</span>
    </>
  );

  if (href) {
    return (
      <a href={href} className={`${baseClass} ${variantClasses[variant]} ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
        {content}
      </a>
    );
  }

  return (
    <button onClick={onClick} disabled={disabled} className={`${baseClass} ${variantClasses[variant]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      {content}
    </button>
  );
}

interface ActionGridProps {
  children: ReactNode;
  cols?: 2 | 3 | 4;
}

export function ActionGrid({ children, cols = 3 }: ActionGridProps) {
  const colClass = cols === 2 ? 'grid-cols-2' : cols === 4 ? 'grid-cols-4' : 'grid-cols-3';
  return <div className={`grid ${colClass} gap-3`}>{children}</div>;
}

interface TableActionSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  badge?: ReactNode;
  guestCount?: ReactNode;
  children: ReactNode;
}

export function TableActionSheet({ open, onClose, title, subtitle, badge, guestCount, children }: TableActionSheetProps) {
  const { lightMode } = useTheme();
  const { t } = useLanguage();
  const keyboardHeight = useKeyboardHeight();

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [open]);

  if (!open) return null;

  return (
    <motion.div
      {...slideUp}
      transition={fastExit}
      className="fixed bottom-0 left-0 right-0 z-[120] flex items-center justify-center p-4 pointer-events-none"
      style={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight + 16 : undefined }}
    >
      <div className="pointer-events-auto w-full max-w-md overflow-hidden shadow-overlay border rounded-6xl p-7 bg-zinc-900/80 border-white/10 backdrop-blur-2xl">
        <div className="text-center mb-6">
          <p className="text-2xl font-black tracking-tighter mb-1 leading-none text-white">{title}</p>
          {badge && <div className="mt-2">{badge}</div>}
          {guestCount && <div className="mt-3">{guestCount}</div>}
          {subtitle && <p className="text-xs font-bold uppercase tracking-widest opacity-50 mt-2 text-white/50">{subtitle}</p>}
        </div>
        {children}
        <button onClick={onClose} className="w-full mt-5 py-4 rounded-4xl text-xs font-black uppercase tracking-widest bg-white/5 hover:bg-white/10 transition-all text-white/70">
          t('close')
        </button>
      </div>
    </motion.div>
  );
}
