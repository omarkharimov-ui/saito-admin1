'use client';

import { Toaster } from 'react-hot-toast';

/** Lightweight toasts — no framer-motion, better on mobile. */
export default function SimpleToaster() {
  return (
    <Toaster
      position="top-center"
      containerStyle={{ top: 'max(12px, env(safe-area-inset-top))' }}
      toastOptions={{
        duration: 5000,
        style: {
          background: '#0d0b00',
          color: '#D4AF37',
          border: '1px solid rgba(212,175,55,0.28)',
          fontWeight: 600,
          fontSize: 13,
          maxWidth: 'min(360px, calc(100vw - 24px))',
        },
      }}
    />
  );
}
