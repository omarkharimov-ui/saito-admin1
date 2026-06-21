'use client';

import React, { useState, useRef, useEffect } from 'react';
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
  
  // 1. Framer Motion Velocity Tracking
  const x = useMotionValue(0);
  const xVelocity = useVelocity(x);
  
  // 2. Dynamic ScaleX based on velocity (Elastic Stretch)
  // Sürət artdıqca (sağa və ya sola) element 1.0-dan 1.25-ə qədər uzanır
  const stretchScaleX = useTransform(xVelocity, [-2000, 0, 2000], [1.25, 1, 1.25]);
  
  // Smooth out the scale transition
  const smoothScaleX = useSpring(stretchScaleX, {
    stiffness: 400,
    damping: 30,
    mass: 1
  });

  // 3. Apple-style Spring Physics for Snapping
  const springConfig = {
    type: 'spring',
    stiffness: 400,
    damping: 22, // Super axıcı və bouncy overshoot
    mass: 0.8
  } as const;

  // Snapping logic
  const activeIndex = options.findIndex(opt => opt.id === activeId);

  const handleDragEnd = (event: any, info: any) => {
    setIsHolding(false);
    const offset = info.offset.x;
    const threshold = 50;

    if (Math.abs(offset) > threshold) {
      const direction = offset > 0 ? -1 : 1;
      const nextIndex = Math.max(0, Math.min(options.length - 1, activeIndex + direction));
      onChange(options[nextIndex].id);
    }
    // Reset internal x to 0 for next drag
    x.set(0);
  };

  return (
    <div className="relative flex items-center justify-center py-4">
      {/* Main Container (Rubber Squash Effect) */}
      <motion.div
        ref={containerRef}
        animate={{
          scale: isHolding ? 0.95 : 1, // Parent scale down
        }}
        transition={springConfig}
        className="relative flex items-center p-1 bg-[#efeff4] dark:bg-white/[0.05] rounded-full border border-black/[0.02] dark:border-white/[0.06] shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] select-none touch-none overflow-hidden"
        onPointerDown={() => setIsHolding(true)}
        onPointerUp={() => setIsHolding(false)}
      >
        {options.map((opt) => {
          const isActive = activeId === opt.id;
          
          return (
            <button
              key={opt.id}
              onClick={() => {
                if (!isHolding) onChange(opt.id);
              }}
              className="relative px-8 py-2.5 min-w-[110px] flex items-center justify-center z-10 transition-colors duration-500"
            >
              {/* Text Label */}
              <span className={`text-[11px] font-black uppercase tracking-[0.2em] transition-all duration-300 ${
                isActive ? 'text-black dark:text-white' : 'text-[#8e8e93]'
              }`}>
                {opt.label}
              </span>

              {/* Active Liquid Indicator */}
              {isActive && (
                <motion.div
                  layoutId="active-liquid-pill"
                  drag="x"
                  _dragX={x} // Link internal x to drag position for velocity tracking
                  dragConstraints={containerRef}
                  dragElastic={0.12}
                  onDragStart={() => setIsHolding(true)}
                  onDragEnd={handleDragEnd}
                  style={{
                    scaleX: smoothScaleX, // Dynamic Velocity Stretch
                    transformOrigin: xVelocity.get() > 0 ? 'left center' : 'right center'
                  }}
                  className={`absolute inset-0 rounded-full z-[-1] overflow-hidden ${
                    isHolding 
                      ? 'bg-white/50 dark:bg-white/10 backdrop-blur-xl' 
                      : 'bg-white dark:bg-zinc-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)]'
                  }`}
                  animate={{
                    scaleY: isHolding ? 1.05 : 1, // Slight squash
                  }}
                  transition={springConfig}
                >
                  {/* Prismatic Refraction / Glossy Effect */}
                  <AnimatePresence>
                    {isHolding && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 rounded-full border border-white/40 shadow-[inset_0_0_12px_rgba(255,255,255,0.4)]"
                      >
                        {/* Smooth light reflection */}
                        <motion.div
                          animate={{ x: ['-100%', '200%'] }}
                          transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-[-25deg]"
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
