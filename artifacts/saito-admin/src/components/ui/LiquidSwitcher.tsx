'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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

  // Apple-style Spring Physics
  const springConfig = {
    type: 'spring',
    stiffness: 300,
    damping: 28,
    mass: 0.8
  };

  return (
    <motion.div
      // 2. Arxadakı Ümumi Fonun Sıxılması (Critical Physics)
      animate={{
        scale: isHolding ? 0.96 : 1,
      }}
      transition={springConfig}
      className="relative flex items-center p-1.5 bg-white/[0.04] backdrop-blur-md rounded-full border border-white/[0.06] shadow-sm select-none touch-none"
      onPointerDown={() => setIsHolding(true)}
      onPointerUp={() => setIsHolding(false)}
      onPointerLeave={() => setIsHolding(false)}
    >
      {options.map((opt) => {
        const isActive = activeId === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className="relative px-6 py-2 rounded-full z-10 transition-colors duration-500"
          >
            {/* Label Animation */}
            <span className={`text-[11px] font-black uppercase tracking-[0.2em] transition-all duration-300 ${
              isActive ? 'text-black' : 'text-[var(--theme-text-muted)]'
            }`}>
              {opt.label}
            </span>

            {/* 1. Komponentin Vəziyyətləri & Liquid Glass Effect */}
            {isActive && (
              <motion.div
                layoutId="liquid-pill"
                className={`absolute inset-0 rounded-full z-[-1] overflow-hidden ${
                  isHolding 
                    ? 'bg-white/10 backdrop-blur-2xl' // Active/Hold State
                    : 'bg-white shadow-sm'            // Idle State
                }`}
                animate={{
                  scale: isHolding ? 1.08 : 1, // 3D Durbin Effekti
                }}
                transition={springConfig}
              >
                {/* 3. Maqnit və İşıq Qırılması (Prismatic Refraction) */}
                <AnimatePresence>
                  {isHolding && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0"
                    >
                      {/* Prismatic Border */}
                      <div className="absolute inset-0 rounded-full border border-white/20 shadow-[inset_0_0_8px_rgba(255,255,255,0.2)]" />
                      
                      {/* Gradient Refraction Glow */}
                      <div className="absolute inset-[-50%] bg-[conic-gradient(from_0deg,transparent,rgba(56,189,248,0.2),rgba(236,72,153,0.2),transparent)] animate-[spin_3s_linear_infinite]" />
                      
                      {/* Glossy Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-transparent" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </button>
        );
      })}
    </motion.div>
  );
}
