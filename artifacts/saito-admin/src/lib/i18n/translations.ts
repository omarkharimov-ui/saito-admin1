// Admin Panel Translations — Barrel file
// Individual locale files: ./locales/az.ts, ./locales/en.ts, ./locales/ru.ts
import { az } from './locales/az';
import { en } from './locales/en';
import { ru } from './locales/ru';

export const translations = { az, en, ru } as const;

export type Language = keyof typeof translations;
export type TranslationKey = keyof typeof az;

// Lazy loader — loads only the requested language at runtime
export async function loadTranslations(lang: Language) {
  switch (lang) {
    case 'az':
      return (await import('./locales/az')).az;
    case 'en':
      return (await import('./locales/en')).en;
    case 'ru':
      return (await import('./locales/ru')).ru;
  }
}
