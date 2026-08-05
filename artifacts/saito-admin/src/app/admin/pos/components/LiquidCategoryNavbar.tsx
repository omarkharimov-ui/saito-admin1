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
    <div className={`relative flex gap-4 items-center overflow-x-auto scrollbar-none no-scrollbar select-none py-1.5 px-6 rounded-full ${
      lightMode ? 'bg-[#efeff4]' : 'bg-white/5'
    }`}>
      {showLeftFade && (
        <div className="absolute left-0 top-0 bottom-0 w-8 z-20 pointer-events-none rounded-l-full"
          style={{ background: `linear-gradient(to right, ${lightMode ? '#efeff4' : 'rgba(255,255,255,0.05)'}, transparent)` }} />
      )}
      {showRightFade && (
        <div className="absolute right-0 top-0 bottom-0 w-8 z-20 pointer-events-none rounded-r-full"
          style={{ background: `linear-gradient(to left, ${lightMode ? '#efeff4' : 'rgba(255,255,255,0.05)'}, transparent)` }} />
      )}
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
