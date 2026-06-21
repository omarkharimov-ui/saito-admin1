'use client';

import React, { useRef } from 'react';
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
  const containerRef = useRef<HTMLDivElement>(null);

  const items = [{ id: null, name: allLabel }, ...categories];

  return (
    <div 
      ref={containerRef}
      className="relative flex gap-1 items-center overflow-x-auto pb-4 mb-4 scrollbar-none no-scrollbar select-none"
    >
      {items.map((item) => {
        const isActive = activeId === item.id;
        
        return (
          <button
            key={item.id ?? 'all'}
            onClick={() => onChange(item.id)}
            className="relative px-6 py-2.5 rounded-full transition-colors duration-300 flex-shrink-0 outline-none focus-visible:ring-0"
          >
            {isActive && (
              <motion.div
                layoutId="active-capsule"
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 30,
                  mass: 0.8,
                }}
                className={`absolute inset-0 z-0 rounded-full shadow-lg ${
                  lightMode 
                    ? 'bg-zinc-900 shadow-zinc-900/20' 
                    : 'bg-white shadow-white/10'
                }`}
              >
                {/* Glass Highlight Layer */}
                <div className="absolute inset-0 rounded-full overflow-hidden">
                  <div className={`absolute inset-0 opacity-20 bg-gradient-to-tr ${
                    lightMode ? 'from-white/20 to-transparent' : 'from-zinc-400/20 to-transparent'
                  }`} />
                </div>
              </motion.div>
            )}
            
            <span className={`relative z-10 text-[11px] font-black uppercase tracking-widest transition-colors duration-300 ${
              isActive 
                ? (lightMode ? 'text-white' : 'text-black') 
                : 'text-[#8e8e93] hover:text-zinc-600 dark:hover:text-zinc-300'
            }`}>
              {item.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
