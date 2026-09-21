'use client';

import React, { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '@/lib/theme/ThemeContext';
import { SPRING, TAP } from '../lib/pos-motion';

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
    // QA bug 7 (2026-09-22): reset to the start when the category list changes
    // (floor/mode remounts) — stale scroll positions left the first pill
    // clipped mid-word at the left edge ("AMISI", "QARA K…").
    el.scrollLeft = 0;
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
    <div ref={containerRef} className={`relative overflow-x-auto scrollbar-none no-scrollbar select-none py-2 rounded-full ${
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
      <div className="flex items-center px-1.5">
      {items.map((item, idx) => {
        const isActive = activeId === item.id;
        
        return (
          <motion.button
            key={item.id ?? 'all'}
            ref={el => { itemRefs.current[idx] = el; }}
            onClick={() => onChange(item.id)}
            whileTap={{ scale: 0.94 }}
            transition={TAP}
            className="relative px-4 rounded-full flex-shrink-0 outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400/50 group h-[36px] flex items-center justify-center min-w-[90px]"
          >
             {isActive && (
              /* layoutId: the pill SPRINGS to the newly tapped category
                 (slide/drag feel); whileTap covers the touch press. */
                <motion.div
                  layoutId="liquid-cat-pill"
                  transition={SPRING}
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
          </motion.button>
        );
      })}
      </div>
    </div>
  );
}
