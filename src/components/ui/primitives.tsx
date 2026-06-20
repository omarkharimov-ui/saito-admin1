'use client';

import React from 'react';
import { motion } from 'framer-motion';

type CardPadding = 'none' | 'sm' | 'md' | 'lg' | 'xl';
type CardVariant = 'default' | 'premium' | 'glass';

const paddingMap: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
  xl: 'p-6',
};

const variantMap: Record<CardVariant, string> = {
  default: 'bg-[var(--theme-surface)] border border-[var(--theme-border)]',
  premium: 'bg-[var(--theme-nested)] border border-[var(--theme-border-strong)] shadow-[0_8px_24px_rgba(0,0,0,0.08)]',
  glass: 'bg-[var(--theme-panel)]/90 backdrop-blur-xl border border-[var(--theme-border)]',
};

interface CardProps {
  children: React.ReactNode;
  padding?: CardPadding;
  variant?: CardVariant;
  className?: string;
  onClick?: () => void;
  hover?: boolean;
}

export function Card({ children, padding = 'md', variant = 'default', className = '', onClick, hover }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`
        rounded-xl
        ${variantMap[variant]}
        ${paddingMap[padding]}
        ${hover ? 'hover:bg-[var(--theme-surface-soft)] cursor-pointer transition-colors' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div role="status" className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {icon && (
        <div className="w-12 h-12 rounded-xl bg-[var(--theme-surface)] border border-[var(--theme-border)] flex items-center justify-center mb-4 text-[var(--theme-text-muted)]">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-[var(--theme-text-secondary)] mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-[var(--theme-text-muted)] max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

interface LoadingSkeletonProps {
  lines?: number;
  className?: string;
}

export function LoadingSkeleton({ lines = 3, className = '' }: LoadingSkeletonProps) {
  return (
    <div aria-label="Loading" className={`space-y-3 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 rounded-lg bg-[var(--theme-surface)] animate-pulse"
          style={{ width: `${Math.max(40, 100 - i * 20)}%` }}
        />
      ))}
    </div>
  );
}

interface PageHeaderProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  actionAriaLabel?: string;
}

export function PageHeader({ icon, title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="w-9 h-9 rounded-xl bg-[var(--theme-surface)] border border-[var(--theme-border)] flex items-center justify-center text-[var(--theme-text-secondary)]">
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-lg font-bold text-[var(--theme-text)]">{title}</h1>
          {subtitle && <p className="text-xs text-[var(--theme-text-muted)] mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
