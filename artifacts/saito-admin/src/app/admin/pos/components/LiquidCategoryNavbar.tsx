'use client';

import React, { useRef, useEffect } from 'react';
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
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  
  const items = [{ id: null, name: allLabel }, ...categories];

  // Auto-scroll active item into view
  useEffect(() => {
    const idx = items.findIndex(item => item.id === activeId);
    if (idx !== -1 && itemRefs.current[idx]) {
      itemRefs.current[idx]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
  }, [activeId, items]);
  
  return (
    <div className={`relative flex gap-4 items-center overflow-x-auto scrollbar-none no-scrollbar select-none py-1.5 px-6 rounded-full ${
      lightMode ? 'bg-[#efeff4]' : 'bg-white/5'
    }`}>
      {items.map((item, idx) => {
        const isActive = activeId === item.id;
        
        return (
          <button
            key={item.id ?? 'all'}
            ref={el => { itemRefs.current[idx] = el; }}
            onClick={() => onChange(item.id)}
            className="relative px-4 rounded-full transition-colors duration-300 flex-shrink-0 outline-none focus-visible:ring-0 group h-[40px] flex items-center justify-center min-w-[100px]"
          >
            {isActive && (
              <motion.div
                layoutId="active-pill"
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 30
                }}
                className={`absolute inset-[3px] z-0 rounded-full shadow-md ${lightMode ? 'bg-zinc-900' : 'bg-white'}`}
              />
            )}
            
            <span className={`relative z-10 text-[11px] font-black uppercase tracking-widest transition-colors duration-300 whitespace-nowrap ${
              isActive 
                ? (lightMode ? 'text-white' : 'text-black') 
                : (lightMode ? 'text-zinc-500 hover:text-zinc-900' : 'text-white/40 hover:text-white')
            }`}>
              {item.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
