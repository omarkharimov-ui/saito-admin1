import React from 'react';
import { LanguageProvider } from '@/lib/i18n/LanguageContext';
import { ThemeProvider } from '@/lib/theme/ThemeContext';
import { Toaster } from '@/lib/toast';

export default function KitchenLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <LanguageProvider>
        {children}
        <Toaster position="top-right" />
      </LanguageProvider>
    </ThemeProvider>
  );
}
