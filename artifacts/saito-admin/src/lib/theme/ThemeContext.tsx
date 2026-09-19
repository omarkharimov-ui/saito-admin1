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

function getInitialLightMode(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const stored = window.localStorage.getItem('saito_light_mode');
    if (stored === 'true') return true;
    if (stored === 'false') return false;
  } catch {
    // ignore storage access failures
  }

  return false;
}

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [isHighContrast, setIsHighContrast] = useState(false);
  const [lightMode, _setLightMode] = useState(() => getInitialLightMode());

  useEffect(() => {
    const contrastMedia = window.matchMedia('(prefers-contrast: more)');
    const handleContrastChange = () => setIsHighContrast(getSystemContrast());
    setIsHighContrast(getSystemContrast());
    contrastMedia.addEventListener('change', handleContrastChange);
    return () => contrastMedia.removeEventListener('change', handleContrastChange);
  }, []);

  useEffect(() => {
    try {
      const html = document.documentElement;

      if (isHighContrast) {
        html.setAttribute('data-contrast', 'high');
      } else {
        html.removeAttribute('data-contrast');
      }

      html.setAttribute('data-theme', lightMode ? 'light' : 'dark');
      html.classList.toggle('dark', !lightMode);
      html.classList.toggle('light', lightMode);
      html.style.colorScheme = lightMode ? 'light' : 'dark';
    } catch {
      // ignore
    }
  }, [isHighContrast, lightMode]);

  const setLightMode = (v: boolean) => {
    // v7.2: SYNCHRONOUS DOM flip — the .light/.dark switch AND the
    // synchronized-transition window must open in the same frame as the
    // click, BEFORE the React commit. While this lived in useEffect, the
    // token-driven colors (text, borders) switched one effect-latency later
    // than React-class backgrounds → user saw "bg white, text 0.3s later".
    try {
      const html = document.documentElement;
      html.classList.add('theme-switching');
      html.setAttribute('data-theme', v ? 'light' : 'dark');
      html.classList.toggle('dark', !v);
      html.classList.toggle('light', v);
      html.style.colorScheme = v ? 'light' : 'dark';
      window.setTimeout(() => html.classList.remove('theme-switching'), 240);
    } catch {
      // ignore
    }
    try {
      window.localStorage.setItem('saito_light_mode', String(v));
    } catch {
      // ignore storage writes
    }
    _setLightMode(v);
  };

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
