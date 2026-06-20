'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

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
          background: 'rgba(0,0,0,0.6)',
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
          maxWidth: 400,
          background: 'var(--card)',
          border: '1px solid rgba(128,128,128,0.22)',
          borderRadius: 20,
          padding: 28,
          opacity: open ? 1 : 0,
          transform: open ? 'scale(1) translateY(0)' : 'scale(0.94) translateY(8px)',
          transition: 'opacity 0.22s ease, transform 0.22s cubic-bezier(0.32,0.72,0,1)',
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
