'use client';

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useVelocity, useSpring, useTransform } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

interface Option {
  id: string;
  label: string;
}

interface LiquidDropdownProps {
  options: Option[];
  activeId: string;
  onChange: (id: string) => void;
}

export function LiquidDropdown({ options, activeId, onChange }: LiquidDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  
  const activeLabel = options.find(o => o.id === activeId)?.label || 'Seçin';

  // Apple-style Spring Physics
  const springConfig = {
    type: 'spring',
    stiffness: 400,
    damping: 28,
    mass: 0.6
  } as const;

  return (
    <div className="relative select-none">
      {/* ── Layer: SVG FILTERS ── */}
      <svg className="absolute w-0 h-0 invisible">
        <defs>
          <filter id="glass-distort-dropdown">
            <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      {/* ── TRIGGER PILL (Açan düymə) ── */}
      <motion.button
        onPointerDown={() => setIsHolding(true)}
        onPointerUp={() => setIsHolding(false)}
        onPointerLeave={() => setIsHolding(false)}
        onClick={() => setIsOpen(!isOpen)}
        animate={{
          scale: isHolding ? 0.96 : 1, // Interaction squash
        }}
        transition={springConfig}
        className={`relative flex items-center gap-3 px-6 py-2.5 rounded-full border transition-all duration-500 z-30 ${
          isOpen 
            ? 'bg-white/10 dark:bg-white/5 backdrop-blur-2xl border-white/20 shadow-2xl' 
            : 'bg-[#efeff4] dark:bg-white/[0.05] border-black/[0.03] dark:border-white/[0.06] shadow-sm'
        }`}
      >
        <span className={`text-[12px] font-black uppercase tracking-[0.2em] ${
          isOpen ? 'text-black dark:text-white' : 'text-[#8e8e93]'
        }`}>
          {activeLabel}
        </span>
        <ChevronDown size={14} className={`transition-transform duration-500 ${isOpen ? 'rotate-180 text-gold' : 'text-[#8e8e93]'}`} />

        {/* Liquid Indicator Layer (When holding) */}
        {isHolding && (
          <motion.div
            layoutId="dropdown-liquid"
            className="absolute inset-0 rounded-full bg-white/20 backdrop-blur-3xl ring-1 ring-white/40 z-[-1]"
            animate={{ scale: 1.1 }}
            transition={springConfig}
          />
        )}
      </motion.button>

      {/* ── LIQUID MENU (Açılan hissə) ── */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop for closing */}
            <div className="fixed inset-0 z-20" onClick={() => setIsOpen(false)} />
            
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.9, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 8, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -5, scale: 0.9, filter: 'blur(10px)' }}
              transition={springConfig}
              className="absolute top-full left-0 z-30 min-w-[200px] p-1.5 bg-white/70 dark:bg-zinc-900/80 backdrop-blur-3xl rounded-[28px] border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.2)] origin-top-left overflow-hidden"
              style={{ filter: 'url(#glass-distort-dropdown)' }} // Liquid glass refraction
            >
              <div className="space-y-1">
                {options.map((opt) => (
                  <motion.button
                    key={opt.id}
                    whileHover={{ scale: 1.02, x: 5 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      onChange(opt.id);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-5 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${
                      activeId === opt.id
                        ? 'bg-gray-900 text-white dark:bg-white dark:text-black shadow-lg'
                        : 'text-[#8e8e93] hover:bg-black/5 dark:hover:bg-white/5 hover:text-black dark:hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </motion.button>
                ))}
              </div>

              {/* Glossy Reflection Overlay */}
              <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-white/10 via-transparent to-transparent" />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
