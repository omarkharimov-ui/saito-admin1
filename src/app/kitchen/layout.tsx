import React from 'react';
import { LanguageProvider } from '@/lib/i18n/LanguageContext';
import { Toaster } from '@/lib/toast';

export default function KitchenLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      {children}
      <Toaster position="top-right" />
    </LanguageProvider>
  );
}
