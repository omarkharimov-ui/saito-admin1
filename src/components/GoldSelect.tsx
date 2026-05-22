'use client';
import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface GoldSelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface GoldSelectProps {
  value: string;
  options: GoldSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  hideLabel?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function GoldSelect({ value, options, onChange, placeholder, className = '', hideLabel = false, open: controlledOpen, onOpenChange }: GoldSelectProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (!isControlled) setInternalOpen(v);
    onOpenChange?.(v);
  };

  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 180 });

  useLayoutEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const updatePos = () => {
      if (!triggerRef.current || !ref.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const parentRect = ref.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const padding = 16;
      let left = parentRect.left;
      let width = Math.max(parentRect.width, 180);
      const maxAvailableWidth = viewportWidth - (padding * 2);
      if (width > maxAvailableWidth) {
        width = maxAvailableWidth;
      }
      if (left + width > viewportWidth - padding) {
        left = Math.max(padding, viewportWidth - width - padding);
      }
      setDropdownPos({
        top: rect.bottom + 6,
        left,
        width,
      });
    };
    updatePos();

    const ro = new ResizeObserver(updatePos);
    ro.observe(ref.current);
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [open]);

  const selected = options.find(o => o.value === value);

  const dropdown = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="rounded-2xl overflow-hidden bg-[rgba(12,12,12,0.97)] backdrop-blur-xl border border-white/[0.10] shadow-[0_24px_64px_rgba(0,0,0,0.9)]"
          style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, maxHeight: 320, overflowY: 'auto', zIndex: 99999 }}
        >
          {/* Top accent line */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

          <div className="py-2">
            {options.map((opt) => {
              const isSel = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className={`relative w-full flex items-center justify-between gap-3 px-5 py-4 text-[15px] transition-all duration-150 text-left group ${
                    isSel ? 'text-white bg-white/[0.06]' : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  {isSel && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-[60%] rounded-r-full bg-white/50" />
                  )}
                  <span className="flex items-center gap-3 truncate">
                    {opt.icon && (
                      <span className={`flex-shrink-0 transition-colors ${isSel ? 'text-white/70' : 'text-white/30 group-hover:text-white/50'}`}>
                        {opt.icon}
                      </span>
                    )}
                    <span className="font-semibold">{opt.label}</span>
                  </span>
                  {isSel && (
                    <Check size={15} className="flex-shrink-0 text-white/50" strokeWidth={2.5} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Bottom accent line */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full h-14 flex items-center justify-between gap-2.5 px-5 rounded-2xl border text-[15px] font-semibold transition-all duration-200 text-left ${
          open
            ? 'bg-white/[0.05] border-white/[0.08] text-white'
            : 'bg-white/[0.03] border-white/[0.08] text-white/70'
        }`}
      >
        <span className="flex items-center gap-2.5 truncate">
          {selected?.icon && (
            <span className={`flex-shrink-0 transition-colors ${open ? 'text-white/60' : 'text-white/35'}`}>
              {selected.icon}
            </span>
          )}
          {!hideLabel && (
            <span className={selected ? '' : 'text-white/25'}>
              {selected?.label ?? placeholder ?? ''}
            </span>
          )}
        </span>
        <ChevronDown
          size={17}
          strokeWidth={2}
          className={`flex-shrink-0 transition-all duration-200 ${open ? 'rotate-180 text-white/50' : 'text-white/25'}`}
        />
      </button>

      {/* Dropdown — portaled to body */}
      {typeof document !== 'undefined' && createPortal(dropdown, document.body)}
    </div>
  );
}
