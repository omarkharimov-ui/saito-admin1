'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
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
  
  // ─── MOTION STATE ───
  const activeIndex = options.findIndex(opt => opt.id === activeId);
  const x = useMotionValue(0);
  const velocity = useVelocity(x);
  
  // 1. DYNAMIC FLUID STRETCH (The "Liquid" core)
  // Sürətə görə elementin enini (scaleX) dartırıq. 
  // WhatsApp-da bu hissiyat üçün transformOrigin hərəkət istiqamətinin əksinə bərkiyir.
  const stretch = useTransform(velocity, [-3000, 0, 3000], [1.3, 1, 1.3]);
  const springStretch = useSpring(stretch, { stiffness: 600, damping: 35 });

  // 2. WHATSAPP SPRING (Stiff & Bouncy)
  const springConfig = {
    type: 'spring',
    stiffness: 450,
    damping: 28,
    mass: 0.5
  } as const;

  // Track each tab's width and position for exact indicator mapping
  const [tabMeasurements, setTabMeasurements] = useState<{ x: number, width: number }[]>([]);
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (containerRef.current) {
      const measurements = tabsRef.current.map(tab => ({
        x: tab?.offsetLeft || 0,
        width: tab?.offsetWidth || 0
      }));
      setTabMeasurements(measurements);
    }
  }, [options]);

  const activeTab = tabMeasurements[activeIndex];

  const handleDragEnd = (event: any, info: any) => {
    setIsHolding(false);
    const offset = info.offset.x;
    const threshold = 40;

    if (Math.abs(offset) > threshold) {
      const direction = offset > 0 ? -1 : 1;
      const nextIndex = Math.max(0, Math.min(options.length - 1, activeIndex + direction));
      onChange(options[nextIndex].id);
    }
    x.set(0);
  };

  return (
    <div className="relative flex items-center justify-center py-6">
      {/* ── STATIC TRACK (Arxadakı Kapsul - Terpənmir) ── */}
      <div 
        ref={containerRef}
        className="relative flex items-center p-1 bg-[#efeff4] dark:bg-white/[0.05] rounded-full border border-black/[0.02] dark:border-white/[0.06] shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] select-none touch-none"
      >
        {/* ── THE LIQUID THUMB (Aktiv üzən şüşə) ── */}
        {activeTab && (
          <motion.div
            drag="x"
            _dragX={x}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.05}
            onDragStart={() => setIsHolding(true)}
            onDragEnd={handleDragEnd}
            animate={{
              x: activeTab.x,
              width: activeTab.width,
              scaleY: isHolding ? 0.92 : 1, // Squash on hold
              scaleX: isHolding ? 1.05 : 1, // Initial expand
            }}
            style={{
              scaleX: springStretch, // Dynamic real-time velocity stretch
              transformOrigin: velocity.get() > 0 ? 'left center' : 'right center'
            }}
            transition={springConfig}
            className={`absolute top-1 bottom-1 left-0 rounded-full z-10 overflow-hidden pointer-events-auto ${
              isHolding 
                ? 'bg-white/60 dark:bg-white/15 backdrop-blur-2xl ring-1 ring-white/40 shadow-2xl' 
                : 'bg-white dark:bg-zinc-800 shadow-[0_2px_8px_rgba(0,0,0,0.12)]'
            }`}
          >
            {/* Prismatic Reflection (Glass shine) */}
            <AnimatePresence>
              {isHolding && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="absolute inset-0"
                >
                  <motion.div
                    animate={{ x: ['-100%', '250%'] }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent skew-x-[-35deg]"
                  />
                  <div className="absolute inset-0 rounded-full border border-white/60 shadow-[inset_0_0_15px_rgba(255,255,255,0.6)]" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ── TABS ── */}
        {options.map((opt, index) => {
          const isActive = activeId === opt.id;
          return (
            <button
              key={opt.id}
              ref={el => { tabsRef.current[index] = el; }}
              onClick={() => { if (!isHolding) onChange(opt.id); }}
              className="relative px-8 py-3 min-w-[125px] flex items-center justify-center z-20"
            >
              <span className={`text-[12px] font-black uppercase tracking-[0.2em] transition-all duration-300 ${
                isActive ? 'text-black dark:text-white' : 'text-[#8e8e93]'
              }`}>
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
