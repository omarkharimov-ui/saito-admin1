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

  const springConfig = {
    type: 'spring',
    stiffness: 400,
    damping: 30,
    mass: 0.6
  } as const;

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
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        whileTap={{ scale: 0.98 }}
        className={`relative flex items-center justify-between gap-3 px-6 py-2.5 rounded-full border cursor-pointer transition-all duration-300 z-30 min-w-[120px] ${
          isOpen 
            ? 'bg-zinc-900 text-white border-transparent shadow-xl' 
            : 'bg-[#efeff4] dark:bg-white/[0.08] border-transparent dark:border-white/[0.1] shadow-sm hover:bg-zinc-200 dark:hover:bg-white/[0.12]'
        }`}
      >
        <span className={`text-[11px] font-black uppercase tracking-[0.2em] pointer-events-none ${
          isOpen ? 'text-white' : 'text-[#8e8e93]'
        }`}>
          {activeLabel}
        </span>
        <ChevronDown size={14} className={`transition-transform duration-300 pointer-events-none ${isOpen ? 'rotate-180 text-white' : 'text-[#8e8e93]'}`} />
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
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-white/10 via-transparent to-transparent" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
