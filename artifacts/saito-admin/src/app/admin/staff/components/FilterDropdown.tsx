'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

interface FilterDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
}

export function FilterDropdown({ value, onChange, options, placeholder = 'Seçin', className = '' }: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeLabel = options.find(o => o.value === value)?.label || placeholder;

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
      <motion.button
        onClick={(e) => {
          e.preventDefault();
          setIsOpen(!isOpen);
        }}
        whileTap={{ scale: 0.97 }}
        className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-xs text-[var(--theme-text)] outline-none focus:border-[var(--theme-border-strong)] transition-all cursor-pointer min-w-[120px]"
      >
        <span className="truncate">{activeLabel}</span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-[var(--theme-text-muted)] flex-shrink-0"
        >
          <ChevronDown size={14} />
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute top-full left-0 mt-1 z-50 min-w-[160px] p-1.5 rounded-2xl border border-[var(--theme-border)] shadow-xl bg-[var(--theme-surface)] overflow-hidden"
          >
            <div className="space-y-0.5">
              {options.map((opt) => (
                <motion.button
                  key={opt.value}
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  whileTap={{ scale: 0.97 }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                    value === opt.value
                      ? 'bg-[var(--theme-surface-soft)] text-[var(--theme-text)]'
                      : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)]'
                  }`}
                >
                  {opt.label}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
