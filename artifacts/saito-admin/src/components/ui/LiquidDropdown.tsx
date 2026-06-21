'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

interface Option {
  id: string;
  label: string;
}

interface LiquidDropdownProps {
  options: Option[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}

export function LiquidDropdown({ options, activeId, onChange, className = '' }: LiquidDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const activeLabel = options.find(o => o.id === activeId)?.label || 'Seçin';

  // Apple-style Spring Physics
  const springConfig = {
    type: 'spring',
    stiffness: 400,
    damping: 30,
    mass: 0.6
  } as const;

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={dropdownRef} className={`relative select-none ${className}`}>
      {/* ── TRIGGER PILL ── */}
      <motion.div
        onPointerDown={() => setIsHolding(true)}
        onPointerUp={() => setIsHolding(false)}
        onPointerLeave={() => setIsHolding(false)}
        onClick={() => setIsOpen(!isOpen)}
        animate={{
          scale: isHolding ? 0.96 : 1,
        }}
        transition={springConfig}
        className={`relative flex items-center justify-between gap-3 px-6 py-2.5 rounded-full border cursor-pointer transition-all duration-500 z-30 min-w-[140px] ${
          isOpen 
            ? 'bg-white/15 dark:bg-white/10 backdrop-blur-2xl border-white/30 shadow-2xl' 
            : 'bg-[#efeff4] dark:bg-white/[0.08] border-black/[0.03] dark:border-white/[0.1] shadow-sm hover:bg-[#e5e5ea]'
        }`}
      >
        <span className={`text-[11px] font-black uppercase tracking-[0.2em] pointer-events-none ${
          isOpen ? 'text-black dark:text-white' : 'text-[#8e8e93]'
        }`}>
          {activeLabel}
        </span>
        <ChevronDown size={14} className={`transition-transform duration-500 pointer-events-none ${isOpen ? 'rotate-180 text-gold' : 'text-[#8e8e93]'}`} />

        {/* Liquid Hold Indicator */}
        {isHolding && (
          <motion.div
            layoutId="dropdown-liquid-glow"
            className="absolute inset-0 rounded-full bg-white/30 backdrop-blur-3xl ring-1 ring-white/50 z-[-1]"
            animate={{ scale: 1.1 }}
            transition={springConfig}
          />
        )}
      </motion.div>

      {/* ── LIQUID MENU ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.92, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 8, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -5, scale: 0.92, filter: 'blur(10px)' }}
            transition={springConfig}
            className="absolute top-full left-0 z-[100] min-w-[200px] p-1.5 bg-white/80 dark:bg-zinc-900/90 backdrop-blur-3xl rounded-[28px] border border-white/20 shadow-[0_24px_60px_rgba(0,0,0,0.25)] origin-top-left overflow-hidden"
          >
            <div className="space-y-1">
              {options.map((opt) => (
                <button
                  key={opt.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(opt.id);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-5 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    activeId === opt.id
                      ? 'bg-gray-900 text-white dark:bg-white dark:text-black shadow-lg'
                      : 'text-[#8e8e93] hover:bg-black/5 dark:hover:bg-white/5 hover:text-black dark:hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            
            {/* Specular Highlight */}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-white/10 via-transparent to-transparent" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
