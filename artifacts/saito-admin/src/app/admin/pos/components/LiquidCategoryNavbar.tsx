'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '@/lib/theme/ThemeContext';

interface Category {
  id: string;
  name: string;
}

interface LiquidCategoryNavbarProps {
  categories: Category[];
  activeId: string | null;
  onChange: (id: string | null) => void;
  allLabel: string;
}

export function LiquidCategoryNavbar({ categories, activeId, onChange, allLabel }: LiquidCategoryNavbarProps) {
  const { lightMode } = useTheme();
  
  const items = [{ id: null, name: allLabel }, ...categories];
  
  return (
    <div className={`relative flex gap-1 items-center overflow-x-auto pb-4 mb-2 scrollbar-none no-scrollbar select-none py-2 px-2 rounded-full ${
      lightMode ? 'bg-zinc-100/80' : 'bg-white/5'
    }`}>
      {items.map((item) => {
        const isActive = activeId === item.id;
        
        return (
          <button
            key={item.id ?? 'all'}
            onClick={() => onChange(item.id)}
            className="relative px-6 py-2 rounded-full transition-colors duration-300 flex-shrink-0 outline-none focus-visible:ring-0 group h-[40px] flex items-center justify-center"
          >
            {isActive && (
              <motion.div
                layoutId="active-pill"
                transition={{
                  type: "spring",
                  stiffness: 380,
                  damping: 30
                }}
                className={`absolute inset-0 z-0 rounded-full shadow-md ${
                  lightMode ? 'bg-zinc-900' : 'bg-white'
                }`}
              />
            )}
            
            <span className={`relative z-10 text-[11px] font-black uppercase tracking-widest transition-colors duration-300 ${
              isActive 
                ? (lightMode ? 'text-white' : 'text-black') 
                : (lightMode ? 'text-zinc-500 hover:text-black' : 'text-white/40 hover:text-white')
            }`}>
              {item.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
