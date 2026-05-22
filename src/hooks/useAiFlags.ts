'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'saito_ai_flags';

export interface AiFlags {
  visionEnabled: boolean;
  autoCorrectEnabled: boolean;
}

const defaults: AiFlags = { visionEnabled: true, autoCorrectEnabled: true };

function readFlags(): AiFlags {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {}
  return { ...defaults };
}

export function useAiFlags() {
  const [flags, setFlags] = useState<AiFlags>(defaults);

  useEffect(() => {
    setFlags(readFlags());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setFlags(readFlags());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setFlag = useCallback((key: keyof AiFlags, value: boolean) => {
    setFlags(prev => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: JSON.stringify(next) }));
      } catch {}
      return next;
    });
  }, []);

  return { flags, setFlag };
}

export function readAiFlag(key: keyof AiFlags): boolean {
  return readFlags()[key];
}
