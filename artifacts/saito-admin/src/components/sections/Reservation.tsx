'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Clock, Users, Send, CheckCircle2, ChevronRight, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/lib/i18n/LanguageContext';

const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
const MONTHS_LIST = {
  AZ: ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'İyun', 'İyul', 'Avqust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'],
  EN: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  RU: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
};
const YEARS = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() + i));
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

interface WheelPickerProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  label?: string;
}

const WheelPicker: React.FC<WheelPickerProps> = ({ value, options, onChange, label }) => {
  const [isOpen, setIsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentIndex = options.indexOf(value);
  const { t } = useLanguage();

  useEffect(() => {
    if (isOpen && scrollRef.current) {
      const itemHeight = 40;
      scrollRef.current.scrollTop = currentIndex * itemHeight;
    }
  }, [isOpen, currentIndex]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    else document.removeEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative flex-1" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-[var(--theme-surface-soft)] backdrop-blur-md border-b border-gold/10 px-4 py-4 flex items-center justify-between outline-none transition-all hover:bg-[var(--theme-surface)] group rounded-xl"
      >
        <span className={`text-[13px] font-bold tracking-tight ${value ? 'text-[var(--theme-text)]' : 'text-[var(--theme-text-muted)]'}`}>
          {value || t(label || '')}
        </span>
        <ChevronDown size={14} className={`text-gold/40 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -5 }}
            className="absolute top-full left-0 right-0 z-[60] mt-2 bg-[var(--theme-bg)] backdrop-blur-xl border border-[var(--theme-border)] shadow-2xl overflow-hidden rounded-2xl"
          >
            <div ref={scrollRef} className="h-40 overflow-y-scroll scrollbar-hide snap-y relative">
              <div className="absolute top-1/2 left-4 right-4 h-10 -translate-y-1/2 border-y border-gold/10 pointer-events-none z-10" />
              <div className="h-[60px]" />
              {options.map((option) => (
                <div
                  key={option}
                  onClick={() => { onChange(option); setIsOpen(false); }}
                  className={`h-10 flex items-center justify-center cursor-pointer snap-center transition-all duration-300 text-[13px] ${
                    value === option ? 'text-gold font-black scale-110' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]'
                  }`}
                >
                  {option}
                </div>
              ))}
              <div className="h-[60px]" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const DateWheelPicker: React.FC<{ day: string; month: string; year: string; onDayChange: (v: string) => void; onMonthChange: (v: string) => void; onYearChange: (v: string) => void; }> = ({ day, month, year, onDayChange, onMonthChange, onYearChange }) => {
  const { language } = useLanguage();
  const months = MONTHS_LIST[language as keyof typeof MONTHS_LIST] || MONTHS_LIST.AZ;
  return (
    <div className="flex gap-2">
      <WheelPicker value={day} options={DAYS} onChange={onDayChange} label="picker.day" />
      <WheelPicker value={month} options={months} onChange={onMonthChange} label="picker.month" />
      <WheelPicker value={year} options={YEARS} onChange={onYearChange} label="picker.year" />
    </div>
  );
};

const TimeWheelPicker: React.FC<{ hour: string; minute: string; onHourChange: (v: string) => void; onMinuteChange: (v: string) => void; }> = ({ hour, minute, onHourChange, onMinuteChange }) => {
  return (
    <div className="flex gap-2">
      <WheelPicker value={hour} options={HOURS} onChange={onHourChange} label="picker.hour" />
      <WheelPicker value={minute} options={MINUTES} onChange={onMinuteChange} label="picker.min" />
    </div>
  );
};

const Reservation = () => {
  const { t, language } = useLanguage();
  const months = MONTHS_LIST[language as keyof typeof MONTHS_LIST] || MONTHS_LIST.AZ;

  const [formData, setFormData] = useState({ name: '', phone: '', guests: '2', manualGuests: '', notes: '' });
  const [showManualGuests, setShowManualGuests] = useState(false);
  const [dateParts, setDateParts] = useState({ day: String(new Date().getDate()).padStart(2, '0'), month: months[new Date().getMonth()], year: String(new Date().getFullYear()) });
  const [timeParts, setTimeParts] = useState({ hour: '19', minute: '00' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  return (
    <section id="reservation" className="py-32 px-4 md:px-20 bg-[var(--theme-bg)] relative overflow-hidden text-[var(--theme-text)]">
      <div className="max-w-5xl mx-auto relative z-10">
        <div className="text-center mb-16">
          <span className="text-gold text-xs tracking-[0.5em] uppercase mb-4 block">{t('res.subtitle')}</span>
          <h2 className="text-5xl md:text-6xl font-serif font-bold mb-6 tracking-tighter">{t('res.title')}</h2>
          <p className="text-[var(--theme-text-muted)] max-w-lg mx-auto font-medium leading-relaxed opacity-80">{t('res.desc')}</p>
        </div>

        <div className="bg-[var(--theme-surface)] border border-[var(--theme-border)] p-8 md:p-12 shadow-2xl rounded-[40px] border-l-[10px] border-l-[#d4af37]">
          {isSuccess ? (
            <div className="py-20 text-center">
              <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6"><CheckCircle2 size={40} className="text-emerald-500" /></div>
              <h3 className="text-3xl font-serif font-bold mb-4">{t('res.success.title')}</h3>
              <button onClick={() => setIsSuccess(false)} className="px-8 py-3 border border-gold text-gold text-xs tracking-widest uppercase font-black rounded-xl">{t('res.new')}</button>
            </div>
          ) : (
            <form onSubmit={(e) => e.preventDefault()} className="space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-3">
                  <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-muted)] font-black">{t('res.name')}</label>
                  <input type="text" className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] px-6 py-5 rounded-2xl focus:border-gold outline-none text-[var(--theme-text)] font-bold transition-all" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-muted)] font-black">{t('res.phone')}</label>
                  <input type="tel" className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] px-6 py-5 rounded-2xl focus:border-gold outline-none text-[var(--theme-text)] font-bold transition-all" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                </div>
                <div className="md:col-span-2 space-y-5">
                   <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-muted)] font-black">Tarix və Saat</label>
                   <DateWheelPicker day={dateParts.day} month={dateParts.month} year={dateParts.year} onDayChange={d => setDateParts({...dateParts, day: d})} onMonthChange={m => setDateParts({...dateParts, month: m})} onYearChange={y => setDateParts({...dateParts, year: y})} />
                   <TimeWheelPicker hour={timeParts.hour} minute={timeParts.minute} onHourChange={h => setTimeParts({...timeParts, hour: h})} onMinuteChange={m => setTimeParts({...timeParts, minute: m})} />
                </div>
              </div>
              <button className="w-full bg-gold text-black py-6 rounded-[24px] font-black text-xs tracking-[0.4em] uppercase transition-all shadow-xl hover:shadow-gold/20 active:scale-[0.98]">
                {t('res.submit')}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
};

export default Reservation;
