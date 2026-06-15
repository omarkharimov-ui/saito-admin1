'use client';

import { motion, type HTMLMotionProps } from 'framer-motion';
import { forwardRef } from 'react';
import { useTheme } from '@/lib/theme/ThemeContext';

interface GlassCardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children: React.ReactNode;
  hover?: boolean;
  intensity?: 'light' | 'medium' | 'strong';
  padding?: 'sm' | 'md' | 'lg' | 'xl';
}

const intensityMap = {
  light: {
    bg: 'bg-white/[0.02]',
    border: 'border-white/[0.06]',
    hover: 'hover:bg-white/[0.04]',
    glow: 'rgba(255,255,255,0.03)',
  },
  medium: {
    bg: 'bg-[var(--theme-nested)]/80',
    border: 'border-[var(--theme-border)]',
    hover: 'hover:bg-[var(--theme-nested)]',
    glow: 'rgba(255,255,255,0.05)',
  },
  strong: {
    bg: 'bg-[var(--theme-panel)]/90',
    border: 'border-[var(--theme-border)]',
    hover: 'hover:bg-[var(--theme-panel)]',
    glow: 'rgba(255,255,255,0.08)',
  },
};

const paddingMap = {
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
  xl: 'p-6',
};

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ children, hover = false, intensity = 'medium', padding = 'md', className = '', ...props }, ref) => {
    const { lightMode } = useTheme();
    const style = intensityMap[intensity];
    const baseBg = lightMode ? 'bg-white' : style.bg;
    const baseBorder = lightMode ? 'border-[var(--theme-border)]' : style.border;
    const baseGlow = lightMode ? 'rgba(17,24,39,0.04)' : style.glow;
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
        className={`
          rounded-2xl border backdrop-blur-xl
          ${baseBg} ${baseBorder}
          ${hover ? style.hover + ' transition-all duration-300' : ''}
          ${paddingMap[padding]}
          ${className}
        `}
        style={{
          boxShadow: lightMode
            ? `0 4px 24px rgba(17,24,39,0.06), inset 0 1px 0 ${baseGlow}`
            : `0 4px 24px rgba(0,0,0,0.04), inset 0 1px 0 ${baseGlow}`,
        }}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);

GlassCard.displayName = 'GlassCard';
