'use client';

import React, { useState, useRef, useMemo } from 'react';
import { 
  motion, 
  useMotionValue, 
  useVelocity, 
  useTransform, 
  useSpring,
  AnimatePresence 
} from 'framer-motion';

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
  
  // ─── MOTION INFRASTRUCTURE ───
  // x position for drag tracking
  const dragX = useMotionValue(0);
  // Track current velocity
  const xVelocity = useVelocity(dragX);
  
  // 1. DYNAMIC STRETCH (Elastic Physics)
  // Sürət artdıqca (max 3000px/s) elementin enini 1.0-dan 1.3-ə qədər dartırıq.
  // Transform-origin sürət istiqamətinə görə dinamik dəyişəcək.
  const stretchX = useTransform(xVelocity, [-3000, 0, 3000], [1.3, 1, 1.3]);
  
  // useSpring makes the stretching fluid and non-linear
  const springStretchX = useSpring(stretchX, {
    stiffness: 450,
    damping: 25,
    mass: 0.5
  });

  // 2. WHATSAPP iOS SPRING PHYSICS (The "Bouncy Snap")
  const springConfig = {
    type: 'spring',
    stiffness: 400,
    damping: 24, // Perfect balance for overshoot
    mass: 0.7
  } as const;

  const activeIndex = options.findIndex(opt => opt.id === activeId);

  const handleDragEnd = (event: any, info: any) => {
    setIsHolding(false);
    const offset = info.offset.x;
    const threshold = 40;

    if (Math.abs(offset) > threshold) {
      const direction = offset > 0 ? -1 : 1;
      const nextIndex = Math.max(0, Math.min(options.length - 1, activeIndex + direction));
      onChange(options[nextIndex].id);
    }
    dragX.set(0); // Reset for next interaction
  };

  return (
    <div className="relative flex items-center justify-center py-6">
      {/* ── PARENT CONTAINER: The Squash Effect ── */}
      <motion.div
        ref={containerRef}
        animate={{
          scale: isHolding ? 0.95 : 1, // Parent scale down on interaction
        }}
        transition={springConfig}
        className="relative flex items-center p-1 bg-[#efeff4] dark:bg-white/[0.05] rounded-full border border-black/[0.02] dark:border-white/[0.06] shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] select-none touch-none overflow-visible"
        onPointerDown={() => setIsHolding(true)}
        onPointerUp={() => setIsHolding(false)}
      >
        {options.map((opt) => {
          const isActive = activeId === opt.id;
          
          return (
            <button
              key={opt.id}
              onClick={() => { if (!isHolding) onChange(opt.id); }}
              className="relative px-8 py-3 min-w-[120px] flex items-center justify-center z-10"
            >
              {/* Text Label: High Contrast Inversion */}
              <span className={`text-[12px] font-black uppercase tracking-[0.2em] transition-all duration-300 ${
                isActive ? 'text-black dark:text-white scale-105' : 'text-[#8e8e93] hover:text-[#636366]'
              }`}>
                {opt.label}
              </span>

              {/* ── CHILD INDICATOR: The Liquid Glass ── */}
              {isActive && (
                <motion.div
                  layoutId="active-pill-liquid"
                  drag="x"
                  _dragX={dragX}
                  dragConstraints={containerRef}
                  dragElastic={0.08}
                  onDragStart={() => setIsHolding(true)}
                  onDragEnd={handleDragEnd}
                  style={{
                    scaleX: springStretchX, // THE REAL-TIME VELOCITY STRETCH
                    transformOrigin: xVelocity.get() > 0 ? 'left center' : 'right center'
                  }}
                  className={`absolute inset-0 rounded-full z-[-1] overflow-hidden ${
                    isHolding 
                      ? 'bg-white/50 dark:bg-white/10 backdrop-blur-2xl ring-1 ring-white/20' 
                      : 'bg-white dark:bg-zinc-800 shadow-[0_3px_10px_rgba(0,0,0,0.12)]'
                  }`}
                  animate={{
                    scaleY: isHolding ? 1.06 : 1, // Child squash inversion
                  }}
                  transition={springConfig}
                >
                  {/* ── PRISMATIC REFRACTION (The Glass Sparkle) ── */}
                  <AnimatePresence>
                    {isHolding && (
                      <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="absolute inset-0"
                      >
                        {/* Edge Glow */}
                        <div className="absolute inset-0 rounded-full border border-white/40 shadow-[inset_0_0_15px_rgba(255,255,255,0.5)]" />
                        
                        {/* Dynamic Reflection */}
                        <motion.div
                          animate={{ x: ['-100%', '200%'] }}
                          transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-[-30deg]"
                        />

                        {/* Liquid Rainbow Effect (Subtle) */}
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(56,189,248,0.1),transparent_70%)]" />
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
