'use client';

import React, { useRef, useState, useEffect, useMemo } from 'react';
import { motion, useMotionValue, useSpring, animate, PanInfo, AnimatePresence } from 'framer-motion';
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
  const items = useMemo(() => [{ id: null, name: allLabel }, ...categories], [categories, allLabel]);
  
  const [isInteracting, setIsInteracting] = useState(false);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Physical motion values
  const x = useMotionValue(0);
  const width = useMotionValue(0);
  
  // Spring config for "Butter" feel
  const springConfig = { stiffness: 450, damping: 38, mass: 0.4 };
  const smoothX = useSpring(x, springConfig);
  const smoothWidth = useSpring(width, springConfig);

  // Function to sync capsule to a specific item
  const syncToItem = (index: number, immediate = false) => {
    const el = itemRefs.current[index];
    if (!el || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    
    const targetX = rect.left - containerRect.left;
    const targetWidth = rect.width;

    if (immediate) {
      x.set(targetX);
      width.set(targetWidth);
    } else {
      animate(x, targetX, { type: "spring", ...springConfig });
      animate(width, targetWidth, { type: "spring", ...springConfig });
    }
  };

  useEffect(() => {
    const idx = items.findIndex(item => item.id === activeId);
    if (idx !== -1) syncToItem(idx);
  }, [activeId, items]);

  const handleDrag = (_: any, info: PanInfo) => {
    setIsInteracting(true);
    x.set(x.get() + info.delta.x);
    
    // Dynamic stretching based on drag speed
    const velocity = Math.abs(info.velocity.x);
    const stretch = Math.min(velocity / 1200, 0.4);
    width.set(width.get() * (1 + stretch));
  };

  const handleDragEnd = (_: any, info: PanInfo) => {
    setIsInteracting(false);
    
    const currentCenter = x.get() + width.get() / 2;
    let bestIndex = 0;
    let minDistance = Infinity;

    itemRefs.current.forEach((el, idx) => {
      if (!el || !containerRef.current) return;
      const cRect = containerRef.current.getBoundingClientRect();
      const iRect = el.getBoundingClientRect();
      const center = (iRect.left - cRect.left) + iRect.width / 2;
      const dist = Math.abs(currentCenter - center);
      if (dist < minDistance) {
        minDistance = dist;
        bestIndex = idx;
      }
    });

    // Magnetic snap to nearest
    onChange(items[bestIndex].id);
    syncToItem(bestIndex);
  };

  return (
    <div 
      ref={containerRef}
      className={`relative flex gap-1 items-center overflow-x-auto pb-4 mb-2 scrollbar-none no-scrollbar select-none py-8 px-4 rounded-[28px] transition-colors duration-500 ${
        lightMode ? 'bg-zinc-100/50' : 'bg-white/5'
      }`}
    >
      {/* ── THE LIQUID GLASS OBJECT (The interactive floating element) ── */}
      <motion.div
        drag="x"
        dragMomentum={false}
        dragConstraints={containerRef}
        onDragStart={() => setIsInteracting(true)}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        onPointerDown={() => setIsInteracting(true)}
        onPointerUp={() => setIsInteracting(false)}
        style={{
          x: smoothX,
          width: smoothWidth,
        }}
        className={`absolute h-[44px] z-50 rounded-full cursor-grab active:cursor-grabbing flex items-center justify-center transition-all duration-300
          ${isInteracting 
            ? 'scale-[1.1] -translate-y-2 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] border-white/40' 
            : 'scale-100 translate-y-0 shadow-lg border-transparent'}
          ${lightMode 
            ? (isInteracting ? 'bg-zinc-900/90 backdrop-blur-[40px]' : 'bg-zinc-900') 
            : (isInteracting ? 'bg-white/20 backdrop-blur-[40px]' : 'bg-white')
          }
          border
        `}
      >
        {/* Iridescent Refraction (Internal light flow) */}
        {isInteracting && (
          <motion.div
            animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 rounded-full opacity-40 mix-blend-overlay pointer-events-none"
            style={{
              background: "linear-gradient(110deg, transparent 20%, rgba(255,255,255,0.6) 40%, rgba(120,119,198,0.5) 50%, rgba(255,121,121,0.5) 60%, transparent 80%)",
              backgroundSize: "200% 100%",
            }}
          />
        )}
        
        {/* Glass Specular Highlights */}
        <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none border-[0.5px] border-white/20 shadow-inner">
           <div className="absolute top-0 inset-x-0 h-[50%] bg-gradient-to-b from-white/10 to-transparent" />
        </div>
      </motion.div>

      {/* Tabs */}
      {items.map((item, idx) => {
        const isActive = activeId === item.id;
        
        return (
          <button
            key={item.id ?? 'all'}
            ref={el => { itemRefs.current[idx] = el; }}
            onClick={() => {
              onChange(item.id);
              syncToItem(idx);
            }}
            className="relative px-7 py-3 rounded-full transition-colors duration-500 flex-shrink-0 outline-none focus-visible:ring-0 group z-10 touch-manipulation h-[44px] flex items-center justify-center"
          >
            <span className={`relative text-[12px] font-black uppercase tracking-[0.25em] transition-all duration-500
              ${isActive 
                ? (isInteracting ? (lightMode ? 'text-white' : 'text-white') : (lightMode ? 'text-white' : 'text-black'))
                : 'text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-white'
              }
              ${isInteracting && isActive ? 'scale-110 opacity-100' : 'scale-100'}
            `}>
              {item.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
