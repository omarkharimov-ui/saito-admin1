'use client';
import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface GoldCalendarProps {
  value: string;
  min?: string;
  onChange: (val: string) => void;
}

export default function GoldCalendar({ value, min, onChange }: GoldCalendarProps) {
  const { t } = useLanguage();
  const DAYS = t('cal_days').split(',');
  const MONTHS_SHORT = t('cal_months_short').split(',');
  const MONTHS_FULL = t('cal_months_full').split(',');
  const today = new Date();
  const initDate = value ? new Date(value + 'T00:00:00') : today;
  const [viewYear, setViewYear] = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());
  const [picker, setPicker] = useState<'none' | 'month' | 'year'>('none');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setPicker('none');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open && wrapRef.current) {
      setTimeout(() => {
        wrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 80);
    }
  }, [open]);

  const minDate = min ? new Date(min + 'T00:00:00') : null;
  const selected = value ? new Date(value + 'T00:00:00') : null;

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const startOffset = (firstDay + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const isDisabled = (day: number) => {
    if (!minDate) return false;
    return new Date(viewYear, viewMonth, day) < minDate;
  };
  const isSelected = (day: number) =>
    !!selected && selected.getFullYear() === viewYear && selected.getMonth() === viewMonth && selected.getDate() === day;
  const isToday = (day: number) =>
    today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day;

  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const select = (day: number) => {
    if (isDisabled(day)) return;
    const mm = String(viewMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    onChange(`${viewYear}-${mm}-${dd}`);
    setOpen(false);
    setPicker('none');
  };

  const displayValue = value
    ? new Date(value + 'T00:00:00').toLocaleDateString('az-AZ', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;

  const yearRange = Array.from({ length: 10 }, (_, i) => today.getFullYear() + i);

  return (
    <div ref={wrapRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-2.5 px-0 py-2.5 text-sm transition-all text-left border-b ${
          open
            ? 'border-white/25 text-white'
            : 'border-white/5 text-white/60 hover:border-white/20 hover:text-white/80'
        }`}
      >
        <Calendar size={14} className={open || value ? 'text-white/70' : 'text-white/30'} strokeWidth={1.5} />
        <span className={value ? 'text-white' : 'text-white/35'}>
          {displayValue ?? t('select_date')}
        </span>
        {value && (
          <span
            role="button"
            tabIndex={0}
            onPointerDown={e => { e.stopPropagation(); e.preventDefault(); onChange(''); }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onChange(''); } }}
            className="ml-auto text-white/25 hover:text-white/60 transition-colors text-xs leading-none cursor-pointer"
          >✕</span>
        )}
      </button>

      {/* Popover calendar */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            onWheel={e => e.stopPropagation()}
            className="absolute top-full left-0 mt-2 z-50 w-full min-w-[280px] bg-[#111] backdrop-blur-xl border border-white/[0.09] rounded-2xl p-4 shadow-[0_8px_32px_rgba(0,0,0,0.5)] select-none"
          >
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5">
        <button type="button" onClick={prevMonth}
          className="w-6 h-6 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.1] transition-all">
          <ChevronLeft size={12} />
        </button>

        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setPicker(p => p === 'month' ? 'none' : 'month')}
            className="flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs font-semibold text-white/75 hover:text-white hover:bg-white/[0.07] transition-all">
            {MONTHS_FULL[viewMonth]}
            <ChevronDown size={10} className={`transition-transform ${picker === 'month' ? 'rotate-180' : ''}`} />
          </button>
          <button type="button" onClick={() => setPicker(p => p === 'year' ? 'none' : 'year')}
            className="flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs font-semibold text-white/75 hover:text-white hover:bg-white/[0.07] transition-all">
            {viewYear}
            <ChevronDown size={10} className={`transition-transform ${picker === 'year' ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <button type="button" onClick={nextMonth}
          className="w-6 h-6 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.1] transition-all">
          <ChevronRight size={12} />
        </button>
      </div>

      {/* Month picker */}
      <AnimatePresence>
        {picker === 'month' && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="grid grid-cols-4 gap-1 mb-2.5">
            {MONTHS_SHORT.map((m, i) => (
              <button key={m} type="button"
                onClick={() => { setViewMonth(i); setPicker('none'); }}
                className={`py-1 rounded-lg text-[10px] font-semibold transition-all ${viewMonth === i ? 'bg-white/[0.15] text-white border border-white/20' : 'text-white/50 hover:text-white hover:bg-white/[0.07]'}`}>
                {m}
              </button>
            ))}
          </motion.div>
        )}
        {picker === 'year' && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="grid grid-cols-4 gap-1 mb-2.5">
            {yearRange.map(y => (
              <button key={y} type="button"
                onClick={() => { setViewYear(y); setPicker('none'); }}
                className={`py-1 rounded-lg text-[10px] font-semibold transition-all ${viewYear === y ? 'bg-white/[0.15] text-white border border-white/20' : 'text-white/50 hover:text-white hover:bg-white/[0.07]'}`}>
                {y}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((d, i) => (
          <div key={d} className={`text-center text-[9px] font-medium py-0.5 ${i >= 5 ? 'text-white/20' : 'text-white/25'}`}>{d}</div>
        ))}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} className="h-9" />;
          const col = idx % 7;
          const weekend = col >= 5;
          const disabled = isDisabled(day);
          const sel = isSelected(day);
          const tod = isToday(day);
          return (
            <button key={idx} type="button" disabled={disabled} onClick={() => select(day)}
              className={`
                mx-auto w-9 h-9 rounded-full flex items-center justify-center text-[13px] transition-all
                ${sel ? 'bg-white/[0.18] text-white font-bold border border-white/30' : ''}
                ${!sel && tod ? 'border border-white/30 text-white' : ''}
                ${!sel && !tod && !disabled ? `${weekend ? 'text-white/25' : 'text-white/60'} hover:bg-white/[0.08] hover:text-white` : ''}
                ${disabled ? 'text-white/[0.12] cursor-not-allowed' : ''}
              `}>
              {day}
            </button>
          );
        })}
      </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
