'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from '@/components/ui/saito-icons';
import { useTheme } from '@/lib/theme/ThemeContext';

interface Option {
  id: string;
  label: string;
  badge?: number;
}

interface LiquidDropdownProps {
  options: Option[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
  /** 2026-09-28 (owner: "çip çirkindir — qəşəng et"): compact, readable pill
      for the POS floor chip — tighter padding, normal tracking, higher
      contrast text, emerald floor dot. Default variant (language switcher
      etc.) stays byte-identical to before. */
  floorChip?: boolean;
}

export const LiquidDropdown = React.memo(function LiquidDropdown({ options, activeId, onChange, className = '', floorChip = false }: LiquidDropdownProps) {
  const { lightMode } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const activeOpt = options.find(o => o.id === activeId);
  const activeLabel = activeOpt?.label || 'Seçin';
  const activeBadge = activeOpt?.badge;

  // 2026-09-28 (owner: "VIP seçildikdə çipin ölçüsü kiçilməsin"): the label
  // column is the WIDEST option's text width. An invisible IN-FLOW sizer and
  // the visible label share ONE grid cell (grid-area 1/1), so the cell — and
  // hence the pill — is always exactly the longest label's width regardless
  // of which floor is active. No JS measurement: the sizer IS the layout.
  // (v1 measured an `absolute` sizer — out of flow, contributed 0 width,
  // E2E proved VIP pill 82px vs 1-ci 146px.)
  const longestLabel = options.reduce((a, o) => (o.label.length > a.length ? o.label : a), '');

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
        className={`relative flex items-center justify-between rounded-full border cursor-pointer transition-all duration-300 z-30 ${
          floorChip ? 'gap-1.5 px-4 py-2.5' : 'gap-3 px-6 py-2.5 min-w-[120px]'
        } ${
          isOpen
            ? lightMode ? 'bg-zinc-900 text-white border-transparent shadow-xl' : 'bg-white text-black border-transparent shadow-xl'
            : floorChip
              ? (lightMode ? 'bg-zinc-100 border-zinc-200/70 text-zinc-500 hover:bg-zinc-200/70' : 'bg-white/[0.06] border-white/[0.08] text-white/70 hover:bg-white/[0.12]')
              : (lightMode ? 'bg-[#efeff4] border-transparent text-[#8e8e93] shadow-sm hover:bg-zinc-200' : 'bg-white/[0.08] border-white/[0.1] text-[#8e8e93] shadow-sm hover:bg-white/[0.15]')
        }`}
      >
        {floorChip && (
          <span
            aria-hidden
            className={`w-1.5 h-1.5 rounded-full pointer-events-none ${
              isOpen ? (lightMode ? 'bg-white/60' : 'bg-black/40') : (lightMode ? 'bg-emerald-500' : 'bg-emerald-400/90')
            }`}
          />
        )}
        {floorChip ? (
          /* same-cell grid: invisible sizer (IN-FLOW) + visible label overlap
             in cell 1/1 → the label column always reserves the widest option's
             width; switching floors never resizes the pill */
          <span className="grid items-center">
            <span
              aria-hidden
              className="[grid-area:1/1] invisible whitespace-nowrap text-[11px] font-black uppercase tracking-[0.08em] pointer-events-none"
            >
              {longestLabel}
            </span>
            <span
              className={`[grid-area:1/1] whitespace-nowrap text-[11px] font-black uppercase tracking-[0.08em] text-left pointer-events-none ${
                isOpen ? (lightMode ? 'text-white' : 'text-black') : (lightMode ? 'text-zinc-500' : 'text-white/70')
              }`}>
              {activeLabel}
            </span>
          </span>
        ) : (
          <span
            className={`text-[11px] font-black uppercase pointer-events-none tracking-[0.2em] ${
            isOpen ? (lightMode ? 'text-white' : 'text-black') : 'text-[#8e8e93]'
          }`}>
            {activeLabel}
            {activeBadge != null && activeBadge > 0 && (
              <span className={`ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[8px] font-black ${
                isOpen ? 'bg-white/20 text-current' : 'bg-emerald-500/90 text-white'
              }`}>
                {activeBadge}
              </span>
            )}
          </span>
        )}
        <ChevronDown size={floorChip ? 12 : 14} className={`transition-transform duration-300 pointer-events-none ${isOpen ? 'rotate-180' : ''} ${
          isOpen ? (lightMode ? 'text-white' : 'text-black') : (floorChip ? (lightMode ? 'text-zinc-400' : 'text-white/40') : 'text-[#8e8e93]')
        }`} />
      </motion.div>

      {/* ── LIQUID MENU ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.92, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 8, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -5, scale: 0.92, filter: 'blur(10px)' }}
            transition={springConfig}
            className={`absolute top-full left-0 z-[100] min-w-[200px] p-1.5 backdrop-blur-3xl rounded-[28px] border shadow-[0_24px_60px_rgba(0,0,0,0.25)] origin-top-left overflow-hidden ${
              lightMode ? 'bg-white/90 border-zinc-200' : 'bg-zinc-900/90 border-white/10'
            }`}
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
                  className={`w-full flex items-center justify-between px-5 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    activeId === opt.id
                      ? lightMode ? 'bg-zinc-900 text-white shadow-lg' : 'bg-white text-black shadow-lg'
                      : lightMode ? 'text-[#8e8e93] hover:bg-zinc-100 hover:text-black' : 'text-white/40 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span>{opt.label}</span>
                  {opt.badge != null && opt.badge > 0 && (
                    <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[8px] font-black ${
                      activeId === opt.id ? 'bg-white/20' : 'bg-emerald-500/90 text-white'
                    }`}>
                      {opt.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
