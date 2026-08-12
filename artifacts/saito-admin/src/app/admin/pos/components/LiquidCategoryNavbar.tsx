'use client';

import React, { useRef, useEffect, useState } from 'react';
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(true);

  const checkScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    setShowLeftFade(el.scrollLeft > 2);
    setShowRightFade(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    return () => el.removeEventListener('scroll', checkScroll);
  }, [categories]);

  const items = [{ id: null, name: allLabel }, ...categories];

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
    <div className={`relative flex items-center overflow-x-auto scrollbar-none no-scrollbar select-none py-2 px-3 rounded-full ${
      lightMode ? 'bg-zinc-100' : 'bg-white/[0.06]'
    }`}>
      {showLeftFade && (
        <div className="absolute left-0 top-0 bottom-0 w-8 z-20 pointer-events-none rounded-l-full"
          style={{ background: `linear-gradient(to right, ${lightMode ? '#f3f4f6' : 'rgba(255,255,255,0.05)'}, transparent)` }} />
      )}
      {showRightFade && (
        <div className="absolute right-0 top-0 bottom-0 w-8 z-20 pointer-events-none rounded-r-full"
          style={{ background: `linear-gradient(to left, ${lightMode ? '#f3f4f6' : 'rgba(255,255,255,0.05)'}, transparent)` }} />
      )}
      {items.map((item, idx) => {
        const isActive = activeId === item.id;
        
        return (
          <button
            key={item.id ?? 'all'}
            ref={el => { itemRefs.current[idx] = el; }}
            onClick={() => onChange(item.id)}
            className="relative px-4 rounded-full transition-all duration-200 flex-shrink-0 outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400/50 group h-[36px] flex items-center justify-center min-w-[90px]"
          >
             {isActive && (
               <motion.div
                 initial={{ opacity: 0, scale: 0.9 }}
                 animate={{ opacity: 1, scale: 1 }}
                 exit={{ opacity: 0, scale: 0.9 }}
                 transition={{ duration: 0.12, ease: [0.4, 0, 0.2, 1] }}
                 className={`absolute inset-[2px] z-0 rounded-full shadow-sm ${lightMode ? 'bg-zinc-800' : 'bg-white'}`}
               />
             )}
            
            <span className={`relative z-10 text-xs font-medium uppercase tracking-wider transition-colors duration-200 whitespace-nowrap ${
              isActive 
                ? (lightMode ? 'text-black' : 'text-black') 
                : (lightMode ? 'text-zinc-500 hover:text-zinc-800' : 'text-white/50 hover:text-white/80')
            }`}>
              {item.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
