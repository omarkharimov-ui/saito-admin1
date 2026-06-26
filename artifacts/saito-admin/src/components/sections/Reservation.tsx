'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Clock, Users, Send, Check, Phone, User, ChevronUp, ChevronDown } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

const months = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'İyun', 'İyul', 'Avqust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'];
const days = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
const years = ['2026', '2027'];
const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

const WheelPicker = ({ items, value, onChange }: { items: string[], value: string, onChange: (val: string) => void }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollY = e.currentTarget.scrollTop;
    const index = Math.round(scrollY / 40);
    if (items[index] && items[index] !== value) {
      onChange(items[index]);
    }
  };

  return (
    <div className="h-[120px] overflow-y-auto snap-y snap-mandatory scrollbar-hide py-10" onScroll={handleScroll} ref={containerRef}>
      {items.map((item) => (
        <div key={item} className={`h-10 flex items-center justify-center snap-center transition-all duration-300 font-black text-xs tracking-widest ${item === value ? 'text-gold scale-125 opacity-100' : 'text-white/20 scale-90 opacity-40'}`}>
          {item}
        </div>
      ))}
    </div>
  );
};

const DateWheelPicker = ({ day, month, year, onDayChange, onMonthChange, onYearChange }: any) => (
  <div className="grid grid-cols-3 gap-2 bg-white/5 rounded-3xl p-4 border border-white/10">
    <div className="flex flex-col items-center">
      <span className="text-[8px] font-black opacity-30 uppercase tracking-[0.3em] mb-2">Gün</span>
      <WheelPicker items={days} value={day} onChange={onDayChange} />
    </div>
    <div className="flex flex-col items-center">
      <span className="text-[8px] font-black opacity-30 uppercase tracking-[0.3em] mb-2">Ay</span>
      <WheelPicker items={months} value={month} onChange={onMonthChange} />
    </div>
    <div className="flex flex-col items-center">
      <span className="text-[8px] font-black opacity-30 uppercase tracking-[0.3em] mb-2">İl</span>
      <WheelPicker items={years} value={year} onChange={onYearChange} />
    </div>
  </div>
);

const TimeWheelPicker = ({ hour, minute, onHourChange, onMinuteChange }: any) => (
  <div className="grid grid-cols-2 gap-2 bg-white/5 rounded-3xl p-4 border border-white/10">
    <div className="flex flex-col items-center">
      <span className="text-[8px] font-black opacity-30 uppercase tracking-[0.3em] mb-2">Saat</span>
      <WheelPicker items={hours} value={hour} onChange={onHourChange} />
    </div>
    <div className="flex flex-col items-center">
      <span className="text-[8px] font-black opacity-30 uppercase tracking-[0.3em] mb-2">Dəqiqə</span>
      <WheelPicker items={minutes} value={minute} onChange={onMinuteChange} />
    </div>
  </div>
);

const Reservation = () => {
    const { t } = useLanguage();
    const [formData, setFormData] = useState({
      name: '',
      phone: '',
      guests: '2',
      manualGuests: '',
      notes: ''
    });

    const [dateParts, setDateParts] = useState({
      day: '26',
      month: 'İyun',
      year: '2026'
    });

    const [timeParts, setTimeParts] = useState({
      hour: '19',
      minute: '00'
    });

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSubmitting) return;

      const { name, phone, guests } = formData;
      if (!name || !phone || !guests) {
        setError(t('res.error.missing') || 'Please fill in all fields');
        return;
      }

      setIsSubmitting(true);
      setError(null);

      // Convert date parts to ISO date string (YYYY-MM-DD)
      const monthIndex = months.indexOf(dateParts.month);
      const formattedDate = `${dateParts.year}-${String(monthIndex + 1).padStart(2, '0')}-${dateParts.day}`;
      const formattedTime = `${timeParts.hour}:${timeParts.minute}`;

      try {
        const response = await fetch('/api/public/reservations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_name: name,
            phone,
            date: formattedDate,
            time: formattedTime,
            guests,
            notes: formData.notes
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Something went wrong');
        }

        setIsSuccess(true);
        setFormData({ name: '', phone: '', guests: '2', manualGuests: '', notes: '' });
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsSubmitting(false);
      }
    };
  
    return (
      <section id="reservation" className="py-32 px-4 md:px-20 bg-[var(--theme-bg)] relative overflow-hidden text-[var(--theme-text)]">
        <div className="max-w-5xl mx-auto relative z-10">
          <div className="text-center mb-16">
            <span className="text-gold text-xs tracking-[0.5em] uppercase mb-4 block">{t('res.subtitle')}</span>
            <h2 className="text-5xl md:text-7xl font-serif font-bold text-white tracking-tighter mb-8 italic">
              {t('res.title')}
            </h2>
            <p className="text-white/40 max-w-2xl mx-auto text-lg font-medium leading-relaxed">
              {t('res.desc')}
            </p>
          </div>

          <div className="bg-[var(--theme-surface)] border border-[var(--theme-border)] p-8 md:p-12 shadow-2xl rounded-[40px] border-l-[10px] border-l-[#d4af37]">
            {isSuccess ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-20"
              >
                <div className="w-24 h-24 bg-gold/10 rounded-full flex items-center justify-center mx-auto mb-8 border border-gold/20">
                  <Check className="text-gold" size={48} />
                </div>
                <h3 className="text-4xl font-serif font-bold text-white mb-6 italic">{t('res.success.title')}</h3>
                <button 
                  onClick={() => setIsSuccess(false)}
                  className="text-gold text-xs font-black tracking-[0.4em] uppercase hover:opacity-70 transition-opacity"
                >
                  {t('res.new')}
                </button>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-10">
                {error && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-sm font-bold"
                  >
                    {error}
                  </motion.div>
                )}
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
                     <DateWheelPicker day={dateParts.day} month={dateParts.month} year={dateParts.year} onDayChange={(d: string) => setDateParts({...dateParts, day: d})} onMonthChange={(m: string) => setDateParts({...dateParts, month: m})} onYearChange={(y: string) => setDateParts({...dateParts, year: y})} />
                     <TimeWheelPicker hour={timeParts.hour} minute={timeParts.minute} onHourChange={(h: string) => setTimeParts({...timeParts, hour: h})} onMinuteChange={(m: string) => setTimeParts({...timeParts, minute: m})} />
                  </div>
                </div>
                <button 
                  disabled={isSubmitting}
                  className="w-full bg-gold text-black py-6 rounded-[24px] font-black text-xs tracking-[0.4em] uppercase transition-all shadow-xl hover:shadow-gold/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                >
                  {isSubmitting ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      >
                        <Clock size={20} />
                      </motion.div>
                      {t('res.submitting') || 'GÖNDƏRİLİR...'}
                    </>
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
