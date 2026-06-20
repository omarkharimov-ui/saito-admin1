'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Zap, Loader2, Trash2, ChevronLeft, Clock, Percent } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import MobileModal from '@/components/ui/MobileModal';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Product } from '@/types';

/* ──────────────────────────────────────────
   Happy Hour Modal
────────────────────────────────────────── */
interface HappyHourForm {
  start_time: string;
  end_time: string;
  discountPercent: number;
  productId: string;
}

interface HappyHourModalProps {
  open: boolean;
  form: HappyHourForm;
  products: Product[];
  updating: boolean;
  onClose: () => void;
  onFormChange: React.Dispatch<React.SetStateAction<any>>;
  onSubmit: (e: React.FormEvent) => void;
}

// Dual Range Slider Component
const DualTimeSlider = ({ start, end, onChange }: { start: string; end: string; onChange: (start: string, end: string) => void }) => {
  const min = 0; // 00:00
  const max = 24 * 60; // 24 hours in minutes
  
  const parseTime = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  
  const formatTime = (m: number) => {
    const h = Math.floor(m / 60);
    const mins = m % 60;
    return `${h.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };
  
  const startMin = parseTime(start);
  const endMin = parseTime(end);
  
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null);
  
  const getValueFromX = (x: number) => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
    return Math.round(min + pct * (max - min));
  };
  
  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!dragging) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const val = getValueFromX(clientX);
      if (dragging === 'start') {
        const newStart = Math.min(val, endMin - 30);
        onChange(formatTime(Math.max(0, newStart)), end);
      } else {
        const newEnd = Math.max(val, startMin + 30);
        onChange(start, formatTime(Math.min(max, newEnd)));
      }
    };
    
    const handleUp = () => setDragging(null);
    
    if (dragging) {
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
      document.addEventListener('touchmove', handleMove);
      document.addEventListener('touchend', handleUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleUp);
    };
  }, [dragging, startMin, endMin]);
  
  const startPct = ((startMin - min) / (max - min)) * 100;
  const endPct = ((endMin - min) / (max - min)) * 100;
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-white/60 font-serif">{start}</span>
        <span className="text-gold font-serif text-lg">—</span>
        <span className="text-white/60 font-serif">{end}</span>
      </div>
      <div ref={trackRef} className="relative h-12 bg-white/[0.03] rounded-2xl overflow-hidden">
        {/* Filled track */}
        <div 
          className="absolute top-1/2 -translate-y-1/2 h-2 bg-gold/30 rounded-full"
          style={{ left: `${startPct}%`, right: `${100 - endPct}%` }}
        />
        {/* Start handle */}
        <div
          className="absolute top-0 bottom-0 w-12 flex items-center justify-center cursor-ew-resize"
          style={{ left: `calc(${startPct}% - 24px)` }}
          onMouseDown={() => setDragging('start')}
          onTouchStart={() => setDragging('start')}
        >
          <div className="w-8 h-8 rounded-full bg-gold shadow-lg shadow-gold/30 flex items-center justify-center">
            <Clock size={14} className="text-black" />
          </div>
        </div>
        {/* End handle */}
        <div
          className="absolute top-0 bottom-0 w-12 flex items-center justify-center cursor-ew-resize"
          style={{ left: `calc(${endPct}% - 24px)` }}
          onMouseDown={() => setDragging('end')}
          onTouchStart={() => setDragging('end')}
        >
          <div className="w-8 h-8 rounded-full bg-gold shadow-lg shadow-gold/30 flex items-center justify-center">
            <Clock size={14} className="text-black" />
          </div>
        </div>
      </div>
    </div>
  );
};

// Golden Discount Slider
const GoldenSlider = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  
  const getValueFromX = (x: number) => {
    if (!trackRef.current) return 5;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
    return Math.round(5 + pct * 45); // 5 to 50
  };
  
  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!dragging) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      onChange(getValueFromX(clientX));
    };
    const handleUp = () => setDragging(false);
    
    if (dragging) {
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
      document.addEventListener('touchmove', handleMove);
      document.addEventListener('touchend', handleUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleUp);
    };
  }, [dragging]);
  
  const pct = ((value - 5) / 45) * 100;
  
  return (
    <div className="space-y-3">
      {/* Value bubble */}
      <div className="flex justify-center">
        <motion.div 
          className="px-4 py-2 rounded-xl bg-gold text-black font-bold text-xl font-serif"
          initial={false}
          animate={{ scale: dragging ? 1.1 : 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >
          {value}%
        </motion.div>
      </div>
      {/* Track */}
      <div 
        ref={trackRef}
        className="relative h-4 bg-white/10 rounded-full cursor-pointer"
        onMouseDown={(e) => { setDragging(true); onChange(getValueFromX(e.clientX)); }}
        onTouchStart={(e) => { setDragging(true); onChange(getValueFromX(e.touches[0].clientX)); }}
      >
        {/* Filled bar */}
        <div className="absolute top-0 left-0 h-full bg-gold rounded-full" style={{ width: `${pct}%` }} />
        {/* Glow effect */}
        <div 
          className="absolute top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gold shadow-[0_0_20px_rgba(212,175,55,0.6)]"
          style={{ left: `calc(${pct}% - 12px)` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-white/30 uppercase tracking-wider">
        <span>5%</span>
        <span>50%</span>
      </div>
    </div>
  );
};

export const HappyHourModal = ({ open, form, products, updating, onClose, onFormChange, onSubmit }: HappyHourModalProps) => {
  const { t } = useLanguage();
  
  const handleTimeChange = (start: string, end: string) => {
    onFormChange({...form, start_time: start, end_time: end});
  };
  
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] md:hidden"
        >
          {/* Backdrop with blur */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-xl"
            onClick={onClose}
          />
          
          {/* Main Card - Glassmorphism */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 bg-[#0a0a0a]/90 backdrop-blur-2xl border-t border-white/[0.08] rounded-t-3xl overflow-hidden"
            style={{ maxHeight: '85vh' }}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 px-5 pt-6 pb-4 bg-gradient-to-b from-[#0a0a0a] to-transparent">
              <button
                onClick={onClose}
                className="absolute top-5 left-5 w-10 h-10 flex items-center justify-center rounded-full bg-white/[0.05] text-white/60 hover:text-white transition-all"
              >
                <ChevronLeft size={22} />
              </button>
              <div className="text-center pt-2">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gold/10 mb-3">
                  <Zap size={24} className="text-gold" />
                </div>
                <h2 className="text-2xl font-serif text-white">{t('sensei_happy_hour')}</h2>
                <p className="text-[10px] text-white/40 uppercase tracking-[0.3em] mt-1">Endirim vaxti</p>
              </div>
            </div>
            
            <form noValidate onSubmit={onSubmit} className="px-5 pb-32 overflow-y-auto h-[calc(85vh-140px)]">
              {/* Floating Card - Glassmorphism */}
              <div className="mb-6 p-5 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06]">
                {/* Time Range */}
                <div className="mb-6">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-4 block">Vaxt araligi</label>
                  <DualTimeSlider 
                    start={form.start_time} 
                    end={form.end_time} 
                    onChange={handleTimeChange}
                  />
                </div>
                
                {/* Discount */}
                <div>
                  <label className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-3 block">Endirim faizi</label>
                  <GoldenSlider 
                    value={form.discountPercent} 
                    onChange={(v) => onFormChange({...form, discountPercent: v})}
                  />
                </div>
              </div>
              
              {/* Product Selection - Zigzag Grid */}
              <div className="space-y-4">
                <label className="text-[10px] uppercase tracking-[0.2em] text-white/40">{t('select_product')}</label>
                <div className="grid grid-cols-2 gap-3">
                  {products.map((p, i) => {
                    const isSelected = form.productId === p.id;
                    // Zigzag: odd items offset
                    const offsetClass = i % 2 === 1 ? 'mt-4' : '';
                    const name = typeof p.name === 'string' ? p.name : (p.name as any)?.az || '';
                    return (
                      <button 
                        key={p.id} 
                        type="button" 
                        onClick={() => onFormChange({...form, productId: p.id})}
                        className={`group relative overflow-hidden rounded-2xl transition-all ${offsetClass} ${
                          isSelected 
                            ? 'ring-2 ring-gold' 
                            : 'hover:bg-white/[0.02]'
                        }`}
                      >
                        {/* Image */}
                        <div className="aspect-square bg-white/[0.03]">
                          <img src={p.image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                        </div>
                        {/* Info overlay */}
                        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 to-transparent">
                          <p className={`text-xs font-medium truncate ${isSelected ? 'text-gold' : 'text-white/80'}`}>
                            {name}
                          </p>
                          <p className="text-[10px] text-white/40 mt-0.5">ℼ{p.price}</p>
                        </div>
                        {/* Selection indicator */}
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-gold flex items-center justify-center">
                            <Zap size={14} className="text-black" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </form>
            
            {/* Fixed Bottom Button */}
            <div className="fixed bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a] to-transparent">
              <button
                type="submit"
                disabled={updating || !form.productId}
                className={`w-full py-4 rounded-xl bg-gold text-black font-bold text-sm tracking-wider uppercase transition-all ${
                  updating || !form.productId ? 'opacity-50' : 'hover:brightness-110 active:scale-[0.98]'
                }`}
              >
                {updating ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 size={18} className="animate-spin" />
                    {t('confirm_and_start')}
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Zap size={18} />
                    {t('confirm_and_start')}
                  </span>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

/* ──────────────────────────────────────────
   Delete Product Modal
────────────────────────────────────────── */
interface DeleteModalProps {
  open: boolean;
  product: { id: string; name: string } | null;
  updating: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const DeleteProductModal = ({ open, product, updating, onClose, onConfirm }: DeleteModalProps) => {
  const { t } = useLanguage();
  return (
    <MobileModal open={open} onClose={onClose}>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
          <Trash2 className="text-red-500" size={28} />
        </div>
        <div>
          <h3 className="text-xl font-bold text-white">{t('confirm_delete_title')}</h3>
          <p className="text-[var(--theme-text-secondary)] mt-1">{t('confirm_delete_message')}</p>
        </div>
      </div>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 px-4 rounded-xl bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)]">{t('cancel')}</button>
        <button onClick={onConfirm} disabled={updating} className="flex-1 py-3 px-4 rounded-xl bg-red-500 text-white disabled:opacity-50 flex items-center justify-center gap-2">
          {updating ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
          {t('delete')}
        </button>
      </div>
    </MobileModal>
  );
};
