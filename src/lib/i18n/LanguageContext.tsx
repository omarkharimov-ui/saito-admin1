'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { translations, Language, TranslationKey } from './translations';
import { Product, Category } from '@/types';

// Helper function to interpolate template strings with values
export function interpolateTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => values[key] || match);
}

interface TranslatedProduct {
  name: string;
  description: string;
  ingredients: string[];
}

interface TranslatedCategory {
  name: string;
}

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
  getProductTranslation: (product: Product) => TranslatedProduct;
  getCategoryTranslation: (category: Category) => TranslatedCategory;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = 'saito_admin_language';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window === 'undefined') return 'az';
    const saved = localStorage.getItem(STORAGE_KEY) as Language | null;
    return saved && ['az', 'en', 'ru'].includes(saved) ? saved : 'az';
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, lang);
    }
  }, []);

  const t = useCallback((key: TranslationKey): string => {
    return (translations[language] as Record<string, string>)[key] || key;
  }, [language]);

  // Get product translation for current language (flat columns only)
  const getProductTranslation = useCallback((product: Product): TranslatedProduct => {
    const flatName = (product as any)[`name_${language}`];
    const flatDesc = (product as any)[`description_${language}`];
    const flatIngr = (product as any)[`ingredients_${language}`];
    return {
      name: flatName || product.name,
      description: flatDesc || product.description,
      ingredients: flatIngr
        ? flatIngr.split(',').map((i: string) => i.trim())
        : product.ingredients,
    };
  }, [language]);

  // Get category translation for current language (flat columns only)
  const getCategoryTranslation = useCallback((category: Category): TranslatedCategory => {
    const flatName = (category as any)[`name_${language}`];
    return {
      name: flatName || category.name,
    };
  }, [language]);

  // Always provide context to avoid SSR/hydration issues
  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, getProductTranslation, getCategoryTranslation }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
