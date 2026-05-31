'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type ThemeContextValue = {
  isHighContrast: boolean;
  lightMode: boolean;
  setLightMode: (v: boolean) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemContrast(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-contrast: more)').matches;
}

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [isHighContrast, setIsHighContrast] = useState(false);
  const [lightMode, setLightMode] = useState(false);

  useEffect(() => {
    const contrastMedia = window.matchMedia('(prefers-contrast: more)');
    const handleContrastChange = () => setIsHighContrast(getSystemContrast());
    setIsHighContrast(getSystemContrast());
    contrastMedia.addEventListener('change', handleContrastChange);
    return () => contrastMedia.removeEventListener('change', handleContrastChange);
  }, []);

  useEffect(() => {
    try {
      if (isHighContrast) {
        document.documentElement.setAttribute('data-contrast', 'high');
      } else {
        document.documentElement.removeAttribute('data-contrast');
      }
      if (lightMode) {
        document.documentElement.setAttribute('data-light-mode', 'true');
      } else {
        document.documentElement.removeAttribute('data-light-mode');
      }
    } catch {
      // ignore
    }
  }, [isHighContrast, lightMode]);

  const value = useMemo(() => ({
    isHighContrast,
    lightMode,
    setLightMode,
  }), [isHighContrast, lightMode]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
