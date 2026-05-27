'use client';

import { Toaster } from 'react-hot-toast';

/** Lightweight toasts — max 1 visible at a time, new toast replaces old. */
export default function SimpleToaster() {
  return (
    <Toaster
      position="top-center"
      containerStyle={{ top: 'max(12px, env(safe-area-inset-top))' }}
      gutter={8}
      toastOptions={{
        duration: 2500,
        style: {
          background: '#0d0b00',
          color: '#D4AF37',
          border: '1px solid rgba(212,175,55,0.28)',
          fontWeight: 600,
          fontSize: 13,
          maxWidth: 'min(360px, calc(100vw - 24px))',
          borderRadius: '14px',
          padding: '10px 14px',
        },
        success: {
          duration: 2500,
          iconTheme: { primary: '#4ade80', secondary: '#000' },
          style: {
            background: '#0d0b00',
            color: '#D4AF37',
            border: '1px solid rgba(212,175,55,0.28)',
            fontWeight: 600,
            fontSize: 13,
            maxWidth: 'min(360px, calc(100vw - 24px))',
            borderRadius: '14px',
            padding: '10px 14px',
          },
        },
        error: {
          duration: 3000,
          icon: '✕',
          iconTheme: { primary: '#f87171', secondary: '#1f0d0d' },
          style: {
            background: '#1a0808',
            color: '#fca5a5',
            border: '1px solid rgba(248,113,113,0.25)',
            fontWeight: 600,
            fontSize: 13,
            maxWidth: 'min(360px, calc(100vw - 24px))',
            borderRadius: '14px',
            padding: '10px 14px',
          },
        },
      }}
    />
  );
}
