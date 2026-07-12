import React from 'react';
import { LanguageProvider } from '@/lib/i18n/LanguageContext';
import { ThemeProvider } from '@/lib/theme/ThemeContext';
import { NotificationProvider } from '@/app/admin/context/NotificationContext';
import { Toaster } from '@/lib/toast';

export default function KitchenLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <NotificationProvider>
          {children}
          <Toaster position="top-right" />
        </NotificationProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
