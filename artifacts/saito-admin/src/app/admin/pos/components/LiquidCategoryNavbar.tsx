'use client';

import React, { useRef, useState, useEffect, useMemo } from 'react';
import { motion, useMotionValue, useSpring, useTransform, animate, PanInfo } from 'framer-motion';
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
  
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPressed, setIsPressed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Motion values for physical simulation
  const x = useMotionValue(0);
  const width = useMotionValue(0);
  const scale = useSpring(1, { stiffness: 300, damping: 20 });
  const stretch = useMotionValue(1);
  const skew = useMotionValue(0);

  // Smooth springs for position and width
  const smoothX = useSpring(x, { stiffness: 400, damping: 35, mass: 0.5 });
  const smoothWidth = useSpring(width, { stiffness: 400, damping: 35, mass: 0.5 });

  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Update position based on active item
  const updateToItem = (index: number, immediate = false) => {
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
      animate(x, targetX, { type: "spring", stiffness: 400, damping: 35 });
      animate(width, targetWidth, { type: "spring", stiffness: 400, damping: 35 });
    }
  };

  useEffect(() => {
    const idx = items.findIndex(item => item.id === activeId);
    if (idx !== -1) {
      setActiveIndex(idx);
      updateToItem(idx);
    }
  }, [activeId, items]);

  const handleDrag = (_: any, info: PanInfo) => {
    setIsDragging(true);
    const newX = x.get() + info.delta.x;
    x.set(newX);
    
    // Liquid stretching based on velocity
    const velocity = Math.abs(info.velocity.x);
    const stretchVal = Math.min(1 + velocity / 1500, 1.4);
    stretch.set(stretchVal);
    skew.set(info.velocity.x / 100);
  };

  const handleDragEnd = (_: any, info: PanInfo) => {
    setIsDragging(false);
    setIsPressed(false);
    stretch.set(1);
    skew.set(0);

    // Find nearest item for magnetic snap
    const currentX = x.get() + width.get() / 2;
    let bestIndex = 0;
    let minDistance = Infinity;

    itemRefs.current.forEach((el, idx) => {
      if (!el || !containerRef.current) return;
      const cRect = containerRef.current.getBoundingClientRect();
      const iRect = el.getBoundingClientRect();
      const center = (iRect.left - cRect.left) + iRect.width / 2;
      const dist = Math.abs(currentX - center);
      if (dist < minDistance) {
        minDistance = dist;
        bestIndex = idx;
      }
    });

    onChange(items[bestIndex].id);
  };

  return (
    <div 
      ref={containerRef}
      className="relative flex gap-1 items-center overflow-x-auto pb-8 mb-2 scrollbar-none no-scrollbar select-none py-10 px-4"
    >
      {/* ── THE LIQUID GLASS CAPSULE (The Physical Object) ── */}
      <motion.div
        drag="x"
        dragMomentum={false}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        onPointerDown={() => { setIsPressed(true); scale.set(1.08); }}
        onPointerUp={() => { setIsPressed(false); scale.set(1); }}
        style={{
          x: smoothX,
          width: smoothWidth,
          scale,
          scaleX: stretch,
          skewX: skew,
        }}
        className={`absolute top-10 h-[44px] z-20 rounded-[22px] border cursor-grab active:cursor-grabbing shadow-2xl backdrop-blur-[50px] pointer-events-auto
          ${lightMode 
            ? 'bg-zinc-900/90 border-white/20 shadow-black/30' 
            : 'bg-white/10 border-white/30 shadow-black/60'
          }`}
      >
        {/* Iridescent Refraction (Internal light movement) */}
        <motion.div
          animate={{
            backgroundPosition: isDragging ? ["0% 0%", "100% 100%"] : "50% 50%",
          }}
          className="absolute inset-0 rounded-[22px] opacity-50 mix-blend-overlay pointer-events-none"
          style={{
            background: "radial-gradient(circle at center, rgba(120,119,198,0.4) 0%, rgba(255,121,121,0.2) 50%, transparent 80%)",
            backgroundSize: "200% 200%",
          }}
        />

        {/* Specular Edges (Realistic glass lighting) */}
        <div className="absolute inset-0 rounded-[22px] overflow-hidden pointer-events-none border-[0.5px] border-white/40 shadow-inner">
           <div className="absolute top-0 inset-x-0 h-[15px] bg-gradient-to-b from-white/20 to-transparent" />
        </div>

        {/* Dynamic Shadow (Lift effect) */}
        <AnimatePresence>
          {isPressed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute -inset-4 bg-black/20 blur-2xl z-[-1] rounded-[40px]"
            />
          )}
        </AnimatePresence>
      </motion.div>

      {items.map((item, idx) => {
        const isActive = activeId === item.id;
        
        return (
          <button
            key={item.id ?? 'all'}
            ref={el => { itemRefs.current[idx] = el; }}
            onClick={() => {
              onChange(item.id);
              updateToItem(idx);
            }}
            className="relative px-7 py-3 rounded-full transition-colors duration-500 flex-shrink-0 outline-none focus-visible:ring-0 group z-10 touch-manipulation h-[44px] flex items-center justify-center"
          >
            <span className={`relative text-[12px] font-black uppercase tracking-[0.25em] transition-all duration-500
              ${isActive 
                ? 'text-white' 
                : 'text-[#8e8e93] group-hover:text-zinc-900 dark:group-hover:text-white'
              }
              ${isPressed && isActive ? 'scale-110' : 'scale-100'}
            `}>
              {item.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
