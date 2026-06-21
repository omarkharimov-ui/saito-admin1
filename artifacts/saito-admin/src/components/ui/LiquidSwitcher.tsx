'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, useMotionValue, useTransform, AnimatePresence } from 'framer-motion';

interface Option {
  id: string;
  label: string;
}

interface LiquidSwitcherProps {
  options: Option[];
  activeId: string;
  onChange: (id: string) => void;
}

export function LiquidSwitcher({ options, activeId, onChange }: LiquidSwitcherProps) {
  const [isHolding, setIsHolding] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Active index calculation
  const activeIndex = options.findIndex(opt => opt.id === activeId);
  
  // Framer Motion Spring Settings (WhatsApp iOS Style)
  const springConfig = {
    type: 'spring',
    stiffness: 350,
    damping: 25,
    mass: 0.8
  };

  // Drag logic
  const x = useMotionValue(0);
  const tabWidth = 100; // Estimated tab width in px

  const handleDragEnd = (event: any, info: any) => {
    setIsHolding(false);
    const offset = info.offset.x;
    const threshold = 40; // Snap threshold

    if (Math.abs(offset) > threshold) {
      const direction = offset > 0 ? -1 : 1;
      const nextIndex = Math.max(0, Math.min(options.length - 1, activeIndex + direction));
      onChange(options[nextIndex].id);
    }
  };

  return (
    <div className="relative flex items-center justify-center py-4">
      {/* 1. Main Container (Fon Kapsulu) */}
      <motion.div
        ref={containerRef}
        animate={{
          scale: isHolding ? 0.95 : 1, // Parent scale down
        }}
        transition={springConfig}
        className="relative flex items-center p-1 bg-[#efeff4] dark:bg-white/[0.05] rounded-full border border-black/[0.03] dark:border-white/[0.06] shadow-sm select-none touch-none overflow-hidden"
        onPointerDown={() => setIsHolding(true)}
        onPointerUp={() => setIsHolding(false)}
      >
        {options.map((opt, index) => {
          const isActive = activeId === opt.id;
          
          return (
            <button
              key={opt.id}
              onClick={() => {
                if (!isHolding) onChange(opt.id);
              }}
              className="relative px-8 py-2.5 min-w-[100px] flex items-center justify-center z-10 transition-colors duration-500"
            >
              {/* Text Label */}
              <span className={`text-[11px] font-black uppercase tracking-[0.15em] transition-all duration-300 ${
                isActive ? 'text-black dark:text-white' : 'text-[#8e8e93]'
              }`}>
                {opt.label}
              </span>

              {/* 2. Active Liquid Glass Element */}
              {isActive && (
                <motion.div
                  layoutId="active-pill"
                  drag="x"
                  dragConstraints={containerRef}
                  dragElastic={0.1}
                  onDragStart={() => setIsHolding(true)}
                  onDragEnd={handleDragEnd}
                  className={`absolute inset-0 rounded-full z-[-1] overflow-hidden ${
                    isHolding 
                      ? 'bg-white/40 dark:bg-white/10 backdrop-blur-md' // Active Glass State
                      : 'bg-white dark:bg-zinc-800 shadow-md'           // Idle Solid State
                  }`}
                  animate={{
                    scale: isHolding ? 1.06 : 1, // Child scale up
                  }}
                  transition={springConfig}
                >
                  {/* Refraction Border (Parıltı) */}
                  <AnimatePresence>
                    {isHolding && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 rounded-full border border-white/40 shadow-[inset_0_0_10px_rgba(255,255,255,0.3)]"
                      >
                        {/* Shimmer effect */}
                        <motion.div
                          animate={{ x: ['-100%', '100%'] }}
                          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-[-20deg]"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </button>
          );
        })}
      </motion.div>
    </div>
  );
}
