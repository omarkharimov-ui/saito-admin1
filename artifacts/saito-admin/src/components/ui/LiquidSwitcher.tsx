'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface LiquidSwitcherProps {
  options: { id: string; label: string }[];
  activeId: string;
  onChange: (id: string) => void;
}

export function LiquidSwitcher({ options, activeId, onChange }: LiquidSwitcherProps) {
  const [isHolding, setIsHolding] = useState(false);

  return (
    <div 
      className="relative flex items-center p-1 bg-white/[0.03] backdrop-blur-md rounded-full border border-white/[0.06] shadow-sm select-none"
      onMouseDown={() => setIsHolding(true)}
      onMouseUp={() => setIsHolding(false)}
      onMouseLeave={() => setIsHolding(false)}
      onTouchStart={() => setIsHolding(true)}
      onTouchEnd={() => setIsHolding(false)}
    >
      {options.map((opt) => {
        const isActive = activeId === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className={`relative px-6 py-2 rounded-full text-xs font-black tracking-widest uppercase transition-colors duration-300 z-10 ${
              isActive ? 'text-black' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]'
            }`}
          >
            {isActive && (
              <motion.div
                layoutId="liquid-bg"
                className={`absolute inset-0 rounded-full z-[-1] overflow-hidden ${
                  isHolding 
                    ? 'bg-white/80 backdrop-blur-xl shadow-[inset_0_0_12px_rgba(255,255,255,0.5),0_10px_20px_rgba(0,0,0,0.1)]' 
                    : 'bg-white shadow-sm'
                }`}
                transition={{
                  type: 'spring',
                  stiffness: 400,
                  damping: 30,
                  mass: 0.8
                }}
              >
                {/* Liquid Glass Highlight */}
                {isHolding && (
                  <motion.div
                    initial={{ x: '-100%' }}
                    animate={{ x: '100%' }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-[-20deg]"
                  />
                )}
              </motion.div>
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
