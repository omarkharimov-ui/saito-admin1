'use client';

import React from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import LanguageTransition from './LanguageTransition';

export default function LanguageTransitionWrapper({ children }: { children: React.ReactNode }) {
  try {
    const { isTransitioning } = useLanguage();
    
    return (
      <LanguageTransition isTransitioning={isTransitioning}>
        {children}
      </LanguageTransition>
    );
  } catch (error) {
    // Fallback for SSR/build time when LanguageProvider is not available
    console.warn('LanguageTransitionWrapper used outside LanguageProvider, rendering without transition');
    return <>{children}</>;
  }
}
