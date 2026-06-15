'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '@/lib/theme/ThemeContext';

interface MobileModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

/**
 * Zero-blink centered modal (for confirm dialogs etc).
 * CSS-only animation — no framer-motion mount/unmount.
 * GPU-composited: only opacity + scale animated.
 */
export default function MobileModal({ open, onClose, children, className = '' }: MobileModalProps) {
  const { lightMode } = useTheme();

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      aria-modal="true"
      role="dialog"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        pointerEvents: open ? 'auto' : 'none',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: lightMode ? 'rgba(17,24,39,0.34)' : 'rgba(0,0,0,0.6)',
          opacity: open ? 1 : 0,
          transition: 'opacity 0.2s ease',
          WebkitBackdropFilter: 'blur(4px)',
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Dialog */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 420,
          background: lightMode ? 'var(--theme-surface)' : 'var(--card)',
          border: '1px solid var(--theme-border)',
          borderRadius: 24,
          padding: 24,
          opacity: open ? 1 : 0,
          transform: open ? 'scale(1) translateY(0)' : 'scale(0.94) translateY(8px)',
          transition: 'opacity 0.22s ease, transform 0.22s cubic-bezier(0.32,0.72,0,1)',
          boxShadow: lightMode ? '0 20px 60px rgba(17,24,39,0.12)' : '0 20px 60px rgba(0,0,0,0.35)',
          willChange: 'transform, opacity',
          WebkitTransform: open
            ? 'scale(1) translateY(0)'
            : 'scale(0.94) translateY(8px)',
        }}
        className={className}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
