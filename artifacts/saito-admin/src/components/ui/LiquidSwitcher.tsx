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
  
  // ─── MOTION INFRASTRUCTURE ───
  const activeIndex = options.findIndex(opt => opt.id === activeId);
  const x = useMotionValue(0);
  const velocity = useVelocity(x);
  
  // 1. LIQUID STRETCH PHYSICS (Elastic scaleX based on velocity)
  const stretch = useTransform(velocity, [-3000, 0, 3000], [1.3, 1, 1.3]);
  const springStretch = useSpring(stretch, { stiffness: 600, damping: 30 });

  // 2. iOS SPRING PHYSICS (WhatsApp Bouncy Snap)
  const springConfig = {
    type: 'spring',
    stiffness: 450,
    damping: 25,
    mass: 0.6
  } as const;

  // Track each tab's width and position
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
    if (Math.abs(offset) > 40) {
      const direction = offset > 0 ? -1 : 1;
      const nextIndex = Math.max(0, Math.min(options.length - 1, activeIndex + direction));
      onChange(options[nextIndex].id);
    }
    x.set(0);
  };

  return (
    <div className="relative flex items-center justify-center py-6 select-none">
      {/* ── Layer 2 & 3: SVG FILTERS (Hidden) ── */}
      <svg className="absolute w-0 h-0 invisible">
        <defs>
          {/* Liquid Gooey Filter */}
          <filter id="goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo" />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
          
          {/* Glass Distortion (Refraction) */}
          <filter id="glass-distort">
            <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="3" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="4" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      {/* ── STATIC TRACK (Layer 1: Frosted Glass Base) ── */}
      <div 
        ref={containerRef}
        className="relative flex items-center p-1 bg-white/10 dark:bg-white/[0.05] backdrop-blur-2xl rounded-full border border-white/20 shadow-2xl overflow-hidden"
      >
        {/* ── THE LIQUID THUMB (Aktiv üzən şüşə) ── */}
        {activeTab && (
          <motion.div
            drag="x"
            _dragX={x}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.08}
            onDragStart={() => setIsHolding(true)}
            onDragEnd={handleDragEnd}
            animate={{
              x: activeTab.x,
              width: activeTab.width,
              scaleY: isHolding ? 0.94 : 1, 
              scaleX: isHolding ? 1.05 : 1,
            }}
            style={{
              scaleX: springStretch, // THE REAL-TIME VELOCITY STRETCH
              transformOrigin: velocity.get() > 0 ? 'left center' : 'right center',
              filter: isHolding ? 'url(#glass-distort)' : 'none' // Refraction on hold
            }}
            transition={springConfig}
            className={`absolute top-1 bottom-1 left-0 rounded-full z-10 overflow-hidden ${
              isHolding 
                ? 'bg-white/40 dark:bg-white/20 backdrop-blur-3xl ring-1 ring-white/50 shadow-[0_10px_40px_rgba(255,255,255,0.2)]' 
                : 'bg-white dark:bg-zinc-800 shadow-md'
            }`}
          >
            {/* Layer 4: Specular highlight (Rainbow Edge) */}
            <AnimatePresence>
              {isHolding && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="absolute inset-0 rounded-full"
                >
                   {/* Chromatic Aberration Edge */}
                   <div className="absolute inset-0 rounded-full border border-white/40 shadow-[inset_0_0_12px_rgba(255,255,255,0.5)]" />
                   
                   {/* Dynamic Reflection Shimmer */}
                   <motion.div
                    animate={{ x: ['-100%', '200%'] }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-[-35deg]"
                  />
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
              <span className={`text-[12px] font-black uppercase tracking-[0.2em] transition-all duration-500 ${
                isActive ? 'text-black dark:text-white' : 'text-white/40 dark:text-white/25'
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
