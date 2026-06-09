'use client';

import React from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import LanguageTransition from './LanguageTransition';

export default function LanguageTransitionWrapper({ children }: { children: React.ReactNode }) {
  const { isTransitioning } = useLanguage();

  return (
    <LanguageTransition isTransitioning={isTransitioning}>
      {children}
    </LanguageTransition>
  );
}
