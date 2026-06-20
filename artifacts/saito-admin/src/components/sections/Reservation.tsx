'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Clock, Users, Send, CheckCircle2, ChevronRight, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/context/LanguageContext';

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
      const itemHeight = 40; // Smaller height
      scrollRef.current.scrollTop = currentIndex * itemHeight;
    }
  }, [isOpen, currentIndex]);

  // Click outside logic
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  return (
    <div className="relative flex-1" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-black/40 backdrop-blur-md border-b border-gold/10 px-2 py-3 flex items-center justify-between outline-none transition-all hover:bg-black/60 group"
      >
        <span className={`text-[13px] tracking-tight ${value ? 'text-white' : 'text-white/20'}`}>
          {value || t(label || '')}
        </span>
        <ChevronDown size={12} className={`text-gold/30 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -5 }}
            className="absolute top-full left-0 right-0 z-[60] mt-1 bg-black/90 backdrop-blur-xl border border-gold/10 shadow-[0_10px_40px_rgba(0,0,0,0.8)] overflow-hidden rounded-sm"
          >
            <div 
              ref={scrollRef}
              className="h-40 overflow-y-scroll scrollbar-hide snap-y relative"
              style={{ scrollSnapType: 'y mandatory' }}
            >
              {/* Highlight Lines */}
              <div className="absolute top-1/2 left-4 right-4 h-10 -translate-y-1/2 border-y border-gold/20 pointer-events-none z-10" />
              
              <div className="h-[60px]" /> {/* Padding top */}
              {options.map((option) => (
                <div
                  key={option}
                  onClick={() => handleSelect(option)}
                  className={`h-10 flex items-center justify-center cursor-pointer snap-center transition-all duration-300 text-[13px] ${
                    value === option 
                      ? 'text-gold font-medium scale-110' 
                      : 'text-white/40 hover:text-white/70'
                  }`}
                  style={{ scrollSnapAlign: 'center' }}
                >
                  {option}
                </div>
              ))}
              <div className="h-[60px]" /> {/* Padding bottom */}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const DateWheelPicker: React.FC<{
  day: string;
  month: string;
  year: string;
  onDayChange: (v: string) => void;
  onMonthChange: (v: string) => void;
  onYearChange: (v: string) => void;
}> = ({ day, month, year, onDayChange, onMonthChange, onYearChange }) => {
  const { language } = useLanguage();
  const months = MONTHS_LIST[language];

  const getDaysInMonth = () => {
    if (!month || !year) return 31;
    const monthIndex = months.indexOf(month);
    const daysInMonth = new Date(parseInt(year), monthIndex + 1, 0).getDate();
    return daysInMonth;
  };

  const filteredDays = DAYS.slice(0, getDaysInMonth());

  return (
    <div className="flex gap-px bg-gold/5 border border-gold/10 p-0.5 rounded-sm">
      <WheelPicker value={day} options={filteredDays} onChange={onDayChange} label="picker.day" />
      <WheelPicker value={month} options={months} onChange={onMonthChange} label="picker.month" />
      <WheelPicker value={year} options={YEARS} onChange={onYearChange} label="picker.year" />
    </div>
  );
};

const TimeWheelPicker: React.FC<{
  hour: string;
  minute: string;
  onHourChange: (v: string) => void;
  onMinuteChange: (v: string) => void;
}> = ({ hour, minute, onHourChange, onMinuteChange }) => {
  return (
    <div className="flex gap-px bg-gold/5 border border-gold/10 p-0.5 rounded-sm">
      <WheelPicker value={hour} options={HOURS} onChange={onHourChange} label="picker.hour" />
      <WheelPicker value={minute} options={MINUTES} onChange={onMinuteChange} label="picker.min" />
    </div>
  );
};

const Reservation = () => {
  const { t, language } = useLanguage();
  const months = MONTHS_LIST[language];

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    guests: '2',
    manualGuests: '',
    notes: ''
  });
  const [showManualGuests, setShowManualGuests] = useState(false);
  const [dateParts, setDateParts] = useState({ 
    day: String(new Date().getDate()).padStart(2, '0'), 
    month: months[new Date().getMonth()], 
    year: String(new Date().getFullYear()) 
  });
  const [timeParts, setTimeParts] = useState({ hour: '19', minute: '00' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const phoneRef = useRef<HTMLInputElement>(null);
  const guestsRef = useRef<HTMLSelectElement>(null);
  const manualGuestsRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Update month when language changes
    const monthIndex = MONTHS_LIST.AZ.indexOf(dateParts.month) !== -1 
      ? MONTHS_LIST.AZ.indexOf(dateParts.month)
      : MONTHS_LIST.EN.indexOf(dateParts.month) !== -1
      ? MONTHS_LIST.EN.indexOf(dateParts.month)
      : MONTHS_LIST.RU.indexOf(dateParts.month);
    
    if (monthIndex !== -1) {
      setDateParts(prev => ({ ...prev, month: months[monthIndex] }));
    }
  }, [language]);

  const getFormattedDate = () => {
    const monthIndex = months.indexOf(dateParts.month);
    const paddedMonth = String(monthIndex + 1).padStart(2, '0');
    return `${dateParts.year}-${paddedMonth}-${dateParts.day}`;
  };

  const getFormattedTime = () => {
    return `${timeParts.hour}:${timeParts.minute}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const formattedDate = getFormattedDate();
      const formattedTime = getFormattedTime();
      const guestCount = showManualGuests ? parseInt(formData.manualGuests) : parseInt(formData.guests);
      
      if (isNaN(guestCount) || guestCount < 1) {
        throw new Error(language === 'AZ' ? 'Zəhmət olmasa düzgün qonaq sayı daxil edin.' : language === 'EN' ? 'Please enter a valid guest count.' : 'Пожалуйста, введите корректное количество гостей.');
      }

      const { error } = await supabase
        .from('reservations')
        .insert([{
          name: formData.name,
          phone: formData.phone,
          date: formattedDate,
          time: formattedTime,
          guests: guestCount,
          note: formData.notes,
          status: 'pending'
        }]);

      if (error) throw error;
      
      setIsSuccess(true);
      setFormData({ name: '', phone: '', guests: '2', manualGuests: '', notes: '' });
      setShowManualGuests(false);
      setDateParts({ 
        day: String(new Date().getDate()).padStart(2, '0'), 
        month: months[new Date().getMonth()], 
        year: String(new Date().getFullYear()) 
      });
      setTimeParts({ hour: '19', minute: '00' });
    } catch (error: any) {
      console.error('Error making reservation:', error);
      const errorMsg = error.message || 'Naməlum xəta';
      alert(`Rezervasiya zamanı xəta baş verdi: ${errorMsg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGuestChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'other') {
      setShowManualGuests(true);
      setFormData({ ...formData, guests: 'other' });
      setTimeout(() => manualGuestsRef.current?.focus(), 100);
    } else {
      setShowManualGuests(false);
      setFormData({ ...formData, guests: val });
    }
  };

  const handleDayChange = (day: string) => {
    setDateParts(prev => ({ ...prev, day }));
  };

  const handleMonthChange = (month: string) => {
    setDateParts(prev => ({ ...prev, month }));
  };

  const handleYearChange = (year: string) => {
    setDateParts(prev => ({ ...prev, year }));
  };

  const handleHourChange = (hour: string) => {
    setTimeParts(prev => ({ ...prev, hour }));
  };

  const handleMinuteChange = (minute: string) => {
    setTimeParts(prev => ({ ...prev, minute }));
  };

  return (
    <section id="reservation" className="py-32 px-4 md:px-20 bg-[#050505] relative overflow-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 bg-gold/5 rounded-full blur-[100px] -mr-48 -mt-48" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-gold/5 rounded-full blur-[100px] -ml-48 -mb-48" />

      <div className="max-w-5xl mx-auto relative z-10">
        <div className="text-center mb-16">
          <span className="text-gold text-xs tracking-[0.5em] uppercase mb-4 block">{t('res.subtitle')}</span>
          <h2 className="text-5xl md:text-6xl font-serif font-bold mb-6">{t('res.title')}</h2>
          <p className="text-white/40 max-w-lg mx-auto font-light leading-relaxed">
            {t('res.desc')}
          </p>
        </div>

        <div className="bg-card border border-gold/10 p-8 md:p-12 shadow-2xl">
          {isSuccess ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-20 text-center"
            >
              <div className="w-20 h-20 bg-gold/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 size={40} className="text-gold" />
              </div>
              <h3 className="text-3xl font-serif font-bold mb-4">{t('res.success.title')}</h3>
              <p className="text-white/50 mb-8">
                {t('res.success.desc')}
              </p>
              <button 
                onClick={() => setIsSuccess(false)}
                className="px-8 py-3 border border-gold text-gold text-xs tracking-widest uppercase transition-all"
              >
                {t('res.new')}
              </button>
            </motion.div>
          ) : (
            <form noValidate onSubmit={handleSubmit} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Name */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-white/40 block">{t('res.name')}</label>
                  <div className="relative group">
                    <input 
                      required
                      type="text"
                      placeholder={language === 'AZ' ? 'Məs: Əli Məmmədov' : language === 'EN' ? 'e.g. John Doe' : 'Напр: Иван Иванов'}
                      className="w-full bg-white/5 border border-white/10 px-4 py-4 focus:border-gold outline-none transition-colors text-white placeholder:text-white/10"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          phoneRef.current?.focus();
                        }
                      }}
                    />
                    {formData.name.length > 3 && (
                      <motion.div 
                        initial={{ opacity: 0, x: -10 }} 
                        animate={{ opacity: 1, x: 0 }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gold/30"
                      >
                        <ChevronRight size={14} />
                      </motion.div>
                    )}
                  </div>
                </div>

                {/* Phone */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-white/40 block">{t('res.phone')}</label>
                  <div className="relative group">
                    <input 
                      ref={phoneRef}
                      required
                      type="tel"
                      placeholder={language === 'AZ' ? 'Məs: +994 50 000 00 00' : language === 'EN' ? 'e.g. +1 234 567 89 00' : 'Напр: +7 900 000 00 00'}
                      className="w-full bg-white/5 border border-white/10 px-4 py-4 focus:border-gold outline-none transition-colors text-white placeholder:text-white/10"
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                        }
                      }}
                    />
                    {formData.phone.length > 5 && (
                      <motion.div 
                        initial={{ opacity: 0, x: -10 }} 
                        animate={{ opacity: 1, x: 0 }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gold/30"
                      >
                        <ChevronRight size={14} />
                      </motion.div>
                    )}
                  </div>
                </div>

                {/* Date & Time Compact Row */}
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Date Wheel Picker */}
                  <div className="space-y-3">
                    <label className="text-[10px] uppercase tracking-widest text-white/40 block flex items-center gap-2">
                      <Calendar size={12} className="text-gold/50" />
                      {t('res.date')}
                    </label>
                    <DateWheelPicker
                      day={dateParts.day}
                      month={dateParts.month}
                      year={dateParts.year}
                      onDayChange={handleDayChange}
                      onMonthChange={handleMonthChange}
                      onYearChange={handleYearChange}
                    />
                  </div>

                  {/* Time Wheel Picker */}
                  <div className="space-y-3">
                    <label className="text-[10px] uppercase tracking-widest text-white/40 block flex items-center gap-2">
                      <Clock size={12} className="text-gold/50" />
                      {t('res.time')}
                    </label>
                    <TimeWheelPicker
                      hour={timeParts.hour}
                      minute={timeParts.minute}
                      onHourChange={handleHourChange}
                      onMinuteChange={handleMinuteChange}
                    />
                  </div>
                </div>

                {/* Guests */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-white/40 block">{t('res.guests')}</label>
                  <div className="relative group">
                    <Users size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gold/50" />
                    <select 
                      ref={guestsRef}
                      className="w-full bg-white/5 border border-white/10 pl-12 pr-4 py-4 focus:border-gold outline-none transition-colors text-white appearance-none cursor-pointer"
                      value={formData.guests}
                      onChange={handleGuestChange}
                    >
                      <option value="1">1 {language === 'RU' ? 'Персона' : language === 'EN' ? 'Person' : 'Nəfər'}</option>
                      <option value="2">2 {language === 'RU' ? 'Персоны' : language === 'EN' ? 'People' : 'Nəfər'}</option>
                      <option value="3">3 {language === 'RU' ? 'Персоны' : language === 'EN' ? 'People' : 'Nəfər'}</option>
                      <option value="4">4 {language === 'RU' ? 'Персоны' : language === 'EN' ? 'People' : 'Nəfər'}</option>
                      <option value="5">5 {language === 'RU' ? 'Персон' : language === 'EN' ? 'People' : 'Nəfər'}</option>
                      <option value="other">{t('res.guests.other')}</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                      <ChevronDown size={14} className="text-gold/50" />
                    </div>
                  </div>
                </div>

                {/* Manual Guest Count (Visible only when 'other' is selected) */}
                <AnimatePresence>
                  {showManualGuests && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-2 overflow-hidden"
                    >
                      <label className="text-[10px] uppercase tracking-widest text-white/40 block">{t('res.guests.count')}</label>
                      <div className="relative group">
                        <input 
                          ref={manualGuestsRef}
                          required={showManualGuests}
                          type="number"
                          min="6"
                          placeholder="Məs: 8"
                          className="w-full bg-white/5 border border-white/10 px-4 py-4 focus:border-gold outline-none transition-colors text-white placeholder:text-white/10"
                          value={formData.manualGuests}
                          onChange={(e) => setFormData({...formData, manualGuests: e.target.value})}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Notes */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-white/40 block">{t('res.notes')}</label>
                  <textarea
                    className="w-full bg-white/5 border border-white/10 px-4 py-4 focus:border-gold outline-none transition-colors text-white placeholder:text-white/10 resize-none h-[52px]"
                    placeholder={language === 'AZ' ? 'Xüsusi istəkləriniz...' : language === 'EN' ? 'Special requests...' : 'Особые пожелания...'}
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  />
                </div>
              </div>

              <button 
                disabled={isSubmitting}
                className="w-full bg-gold text-black py-5 font-bold text-sm tracking-[0.3em] uppercase transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Send size={18} />
                    {t('res.submit')}
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
};

export default Reservation;