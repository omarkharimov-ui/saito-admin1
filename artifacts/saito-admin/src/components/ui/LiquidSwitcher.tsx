'use client';

import React, { useState, useRef } from 'react';
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
  
  // ─── MOTION DATA ───
  const dragX = useMotionValue(0);
  const xVelocity = useVelocity(dragX);
  
  // 1. ELASTIC STRETCH (The "Liquid Tail" Effect)
  // Barmağın sürətinə görə pill-in enini (scaleX) 1.0-dan 1.35-ə qədər dartırıq.
  const stretchX = useTransform(xVelocity, [-3000, 0, 3000], [1.35, 1, 1.35]);
  const smoothStretchX = useSpring(stretchX, { stiffness: 500, damping: 30 });

  // 2. iOS WHATSAPP SPRING (The Bouncy Snap)
  const springConfig = {
    type: 'spring',
    stiffness: 400,
    damping: 26,
    mass: 0.6
  } as const;

  const activeIndex = options.findIndex(opt => opt.id === activeId);

  const handleDragEnd = (event: any, info: any) => {
    setIsHolding(false);
    const offset = info.offset.x;
    const threshold = 45;

    if (Math.abs(offset) > threshold) {
      const direction = offset > 0 ? -1 : 1;
      const nextIndex = Math.max(0, Math.min(options.length - 1, activeIndex + direction));
      onChange(options[nextIndex].id);
    }
    dragX.set(0);
  };

  return (
    <div className="relative flex items-center justify-center py-6">
      {/* ── STATIC BACKGROUND PILL (Arxadakı Kapsul - Terpənmir) ── */}
      <div className="relative flex items-center p-1 bg-[#efeff4] dark:bg-white/[0.05] rounded-full border border-black/[0.03] dark:border-white/[0.06] shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] select-none touch-none overflow-visible">
        {options.map((opt) => {
          const isActive = activeId === opt.id;
          
          return (
            <button
              key={opt.id}
              onClick={() => { if (!isHolding) onChange(opt.id); }}
              className="relative px-8 py-3 min-w-[125px] flex items-center justify-center z-10"
            >
              {/* Text Label: Dynamic Color Swap */}
              <span className={`text-[12px] font-black uppercase tracking-[0.2em] transition-all duration-300 z-20 ${
                isActive ? 'text-black dark:text-white' : 'text-[#8e8e93]'
              }`}>
                {opt.label}
              </span>

              {/* ── THE LIQUID GLASS INDICATOR (Aktiv pill canlanır) ── */}
              {isActive && (
                <motion.div
                  layoutId="whatsapp-pill-liquid"
                  drag="x"
                  _dragX={dragX}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.06}
                  onDragStart={() => setIsHolding(true)}
                  onDragEnd={handleDragEnd}
                  style={{
                    scaleX: smoothStretchX, // THE VELOCITY STRETCH
                    transformOrigin: xVelocity.get() > 0 ? 'left center' : 'right center'
                  }}
                  className={`absolute inset-0 rounded-full z-10 overflow-hidden pointer-events-auto ${
                    isHolding 
                      ? 'bg-white/60 dark:bg-white/15 backdrop-blur-2xl ring-1 ring-white/40 shadow-2xl' 
                      : 'bg-white dark:bg-zinc-800 shadow-[0_3px_12px_rgba(0,0,0,0.1)]'
                  }`}
                  animate={{
                    scale: isHolding ? 1.12 : 1, // Tutanda böyüyür (iOS 18 style)
                  }}
                  transition={springConfig}
                >
                  {/* Prismatic Reflection (İşıq qırılması) */}
                  <AnimatePresence>
                    {isHolding && (
                      <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="absolute inset-0"
                      >
                        {/* Shimmer line */}
                        <motion.div
                          animate={{ x: ['-100%', '250%'] }}
                          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent skew-x-[-30deg]"
                        />
                        {/* High Glow Border */}
                        <div className="absolute inset-0 rounded-full border border-white/60 shadow-[inset_0_0_15px_rgba(255,255,255,0.6)]" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
