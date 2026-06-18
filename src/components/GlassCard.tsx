'use client';

import { motion, type HTMLMotionProps } from 'framer-motion';
import { forwardRef } from 'react';

interface GlassCardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children: React.ReactNode;
  hover?: boolean;
  intensity?: 'light' | 'medium' | 'strong';
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
}

const intensityMap = {
  light: {
    bg: 'bg-white/[0.02]',
    border: 'border-white/[0.06]',
    hover: 'hover:bg-white/[0.04]',
  },
  medium: {
    bg: 'bg-[var(--theme-nested)]/80',
    border: 'border-[var(--theme-border)]',
    hover: 'hover:bg-[var(--theme-nested)]',
  },
  strong: {
    bg: 'bg-[var(--theme-panel)]/90',
    border: 'border-[var(--theme-border)]',
    hover: 'hover:bg-[var(--theme-panel)]',
  },
};

const paddingMap = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
  xl: 'p-6',
};

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ children, hover = false, intensity = 'medium', padding = 'md', className = '', ...props }, ref) => {
    const style = intensityMap[intensity];
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] }}
        className={`
          rounded-xl border
          ${style.bg} ${style.border}
          ${hover ? style.hover + ' transition-colors duration-200' : ''}
          ${paddingMap[padding]}
          ${className}
        `}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);

GlassCard.displayName = 'GlassCard';
