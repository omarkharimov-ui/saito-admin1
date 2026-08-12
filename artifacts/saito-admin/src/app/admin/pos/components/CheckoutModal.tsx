'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Phone, User, MapPin, Clock, FileText, Banknote, CreditCard, Wifi, Timer, Loader2, ChevronDown, MapPinOff } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { appleBackdrop, slideUp } from '@/lib/modal-transitions';
import { RollingNumber } from './RollingNumber';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';

export interface CheckoutData {
  customer_phone: string;
  customer_name: string;
  customer_note: string;
  delivery_address: string;
  delivery_district: string;
  delivery_street: string;
  delivery_building: string;
  delivery_floor: string;
  delivery_apartment: string;
  delivery_intercom: string;
  delivery_zone: string;
  delivery_fee: number;
  estimated_pickup_time: string;
  scheduled_date: string;
  payment_method: 'cash' | 'card' | 'online' | 'pay_later';
}

interface CheckoutModalProps {
  open: boolean;
  mode: 'takeaway' | 'delivery';
  total: number;
  currency?: string;
  onSubmit: (data: CheckoutData) => void;
  onClose: () => void;
}

const PAYMENT_METHODS = [
  { value: 'cash' as const, labelKey: 'cash', icon: Banknote, color: 'emerald' },
  { value: 'card' as const, labelKey: 'card', icon: CreditCard, color: 'blue' },
  { value: 'online' as const, labelKey: 'pay_online', icon: Wifi, color: 'purple' },
  { value: 'pay_later' as const, labelKey: 'pay_later', icon: Timer, color: 'amber' },
];

const ADDRESS_STORAGE_KEY = 'saito_delivery_addresses';

function loadAddressSuggestions(): string[] {
  try {
    const stored = localStorage.getItem(ADDRESS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function saveAddressSuggestion(address: string) {
  try {
    const existing = loadAddressSuggestions();
    const updated = [address, ...existing.filter((a: string) => a !== address)].slice(0, 10);
    localStorage.setItem(ADDRESS_STORAGE_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
}

interface Zone {
  name: string;
  fee: number;
  free_delivery_threshold: number;
  estimated_minutes: number;
}

export default function CheckoutModal({ open, mode, total, currency = '₼', onSubmit, onClose }: CheckoutModalProps) {
  const { lightMode } = useTheme();
  const { t } = useLanguage();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [address, setAddress] = useState('');
  const [district, setDistrict] = useState('');
  const [street, setStreet] = useState('');
  const [building, setBuilding] = useState('');
  const [floor, setFloor] = useState('');
  const [apartment, setApartment] = useState('');
  const [intercom, setIntercom] = useState('');
  const [zone, setZone] = useState('');
  const [fee, setFee] = useState(0);
  const [pickupTime, setPickupTime] = useState('now');
  const [customTime, setCustomTime] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'online' | 'pay_later'>('cash');
  const [submitting, setSubmitting] = useState(false);
  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneLoading, setZoneLoading] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [noteExpanded, setNoteExpanded] = useState(false);
  const keyboardHeight = useKeyboardHeight();
  const addressInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) { setWasOpen(true); resetFormState(); }
  if (!open && wasOpen) { setWasOpen(false); }

  function resetFormState() {
    setPhone(''); setName(''); setNote(''); setAddress(''); setDistrict('');
    setStreet(''); setBuilding(''); setFloor(''); setApartment(''); setIntercom('');
    setZone(''); setFee(0); setPickupTime('now'); setCustomTime('');
    setScheduledDate(''); setPaymentMethod('cash');
    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
  }

  useEffect(() => {
    if (mode === 'delivery' && zones.length === 0) {
      setZoneLoading(true);
      fetch('/api/rpc/calculate_delivery_fee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_zone_name: '', p_order_amount: total }),
      }).then(r => r.json().catch(() => null)).then(data => {
        setZoneLoading(false);
      }).catch(() => setZoneLoading(false));
    }
  }, [mode, zones.length, total]);

  const fetchZones = useCallback(async () => {
    try {
      const res = await fetch('/api/rpc/calculate_delivery_fee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_zone_name: '', p_order_amount: total }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.success !== false) {
          setZones(prev => {
            const existing = prev.find(z => z.name === data.zone);
            if (existing) return prev;
            return [...prev, { name: data.zone || '', fee: data.fee || 0, free_delivery_threshold: data.free_delivery_threshold || 50, estimated_minutes: data.estimated_minutes || 30 }];
          });
        }
      }
    } catch { /* ignore */ }
  }, [total]);

  const handleZoneChange = async (zoneName: string) => {
    setZone(zoneName);
    if (!zoneName) { setFee(0); return; }
    try {
      const res = await fetch('/api/rpc/calculate_delivery_fee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_zone_name: zoneName, p_order_amount: total }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.success) {
          setFee(data.fee || 0);
        }
      }
    } catch { /* ignore */ }
  };

  const handleAddressChange = (value: string) => {
    setAddress(value);
    const suggestions = loadAddressSuggestions().filter(a =>
      a.toLowerCase().includes(value.toLowerCase())
    );
    setAddressSuggestions(suggestions);
    setShowAddressSuggestions(suggestions.length > 0 && value.length > 0);
  };

  const selectAddressSuggestion = (addr: string) => {
    setAddress(addr);
    setShowAddressSuggestions(false);
    saveAddressSuggestion(addr);
  };

  useEffect(() => {
    if (open && mode === 'delivery') {
      fetchZones();
    }
  }, [open, mode, fetchZones]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
          addressInputRef.current && !addressInputRef.current.contains(e.target as Node)) {
        setShowAddressSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isDeliveryValid = mode === 'delivery' ? street.trim().length > 0 : true;

  const handleSubmit = async () => {
    if (submitting) return;
    if (!isDeliveryValid) return;
    setSubmitting(true);
    try {
      onSubmit({
        customer_phone: phone,
        customer_name: name,
        customer_note: note,
        delivery_address: street ? `${street}${building ? ', ' + building : ''}${apartment ? ', ' + apartment : ''}` : address,
        delivery_district: district,
        delivery_street: street,
        delivery_building: building,
        delivery_floor: floor,
        delivery_apartment: apartment,
        delivery_intercom: intercom,
        delivery_zone: zone,
        delivery_fee: fee,
          estimated_pickup_time: pickupTime === 'custom' ? customTime : pickupTime === 'now' ? '' : `${pickupTime} ${t('min_abbrev')}`,
        scheduled_date: scheduledDate,
        payment_method: paymentMethod,
      });
      resetFormState();
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    resetFormState();
    onClose();
  };

  const inputClass = `w-full rounded-xl px-4 py-3 text-sm font-bold outline-none border transition-all ${
    lightMode ? 'bg-[var(--theme-bg)] border-zinc-200 text-black focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white focus:border-zinc-400/50'
  }`;

  return (
    <motion.div
       key="checkout-backdrop"
       initial={{ opacity: 0 }}
       animate={{ opacity: 1 }}
       exit={{ opacity: 0 }}
       transition={appleBackdrop}
       className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
       onClick={handleClose}
    >
       <motion.div
         {...slideUp}
          className={`w-full max-w-lg rounded-3xl shadow-elevated border overflow-hidden backdrop-blur-2xl ${
            lightMode ? 'bg-white/85 border-zinc-200' : 'bg-zinc-900/85 border-white/10'
          }`}
         onClick={(e) => e.stopPropagation()}
       >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-white/10">
          <div>
            <h2 className={`text-xl font-black ${lightMode ? 'text-black' : 'text-white'}`}>
              {mode === 'takeaway' ? t('takeaway_payment') : t('delivery_payment')}
            </h2>
            <p className={`text-xs font-black uppercase tracking-widest mt-1 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
              {mode === 'takeaway' ? t('customer_info') : t('customer_and_address')}
            </p>
          </div>
          {total > 0 && (
            <button
              onClick={handleClose}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                lightMode ? 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200' : 'bg-white/5 text-white/50 hover:bg-white/10'
              }`}
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto relative">
          {/* Blur overlay behind modal content */}
          <div className="absolute inset-0 bg-black/10 dark:bg-black/20 pointer-events-none z-0" />
          <div className="relative z-10">
          {/* Phone + Name */}
          {mode === 'takeaway' && (
            <>
              <div>
                <label className={`block text-xs font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                  {t('pickup_time')}
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { value: 'now', labelKey: 'pickup_now' },
                    { value: '15', labelKey: 'pickup_15' },
                    { value: '30', labelKey: 'pickup_30' },
                    { value: 'custom', labelKey: 'pickup_custom' },
                  ].map(opt => (
                    <button key={opt.value} type="button" onClick={() => setPickupTime(opt.value)}
                      className={`py-2.5 rounded-xl text-xs font-black uppercase transition-all ${
                        pickupTime === opt.value ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                          : lightMode ? 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200' : 'bg-white/5 text-white/40 hover:bg-white/10'
                      }`}
                    >{t(opt.labelKey as any)}</button>
                  ))}
                </div>
                {pickupTime === 'custom' && (
                  <div className="mt-2 relative">
                    <Clock size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${lightMode ? 'text-zinc-400' : 'text-white/30'}`} />
                    <input type="time" value={customTime} onChange={(e) => setCustomTime(e.target.value)} className={`${inputClass} pl-10`} />
                  </div>
                )}
              </div>
              <div>
                <label className={`block text-xs font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                  {t('scheduled_date')}
                </label>
                <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)} className={inputClass}
                />
              </div>
            </>
          )}

          {/* Payment method */}
          <div>
            <label className={`block text-xs font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
              {t('payment_method_label')}
            </label>
            <div className="grid grid-cols-4 gap-2">
              {PAYMENT_METHODS.map(m => {
                const Icon = m.icon;
                return (
                  <button key={m.value} type="button" onClick={() => setPaymentMethod(m.value)}
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-black uppercase transition-all ${
                      paymentMethod === m.value ? `bg-${m.color}-500 text-white shadow-lg`
                        : lightMode ? 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200' : 'bg-white/5 text-white/40 hover:bg-white/10'
                    }`}
                    style={paymentMethod === m.value ? { backgroundColor: `var(--tw-${m.color}-500, ${m.color === 'emerald' ? '#10b981' : m.color === 'blue' ? '#3b82f6' : m.color === 'purple' ? '#a855f7' : '#f59e0b'})` } : undefined}
                  >
                    <Icon size={16} />
                    <span>{t(m.labelKey as any)}</span>
                  </button>
                );
              })}
            </div>
          </div>

           {/* Note */}
           <div>
             <AnimatePresence mode="wait">
             {noteExpanded ? (
               <motion.div
                 key="note-expanded"
                 initial={{ opacity: 0, scale: 0.95 }}
                 animate={{ opacity: 1, scale: 1 }}
                 exit={{ opacity: 0, scale: 0.95 }}
                 transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                 className="w-full"
               >
                 <label className={`block text-xs font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                   {t('notes')}
                 </label>
                 <div className="relative">
                   <FileText size={16} className={`absolute left-3 top-3 ${lightMode ? 'text-zinc-400' : 'text-white/30'}`} />
                   <textarea value={note} onChange={(e) => setNote(e.target.value)}
                     placeholder={mode === 'delivery' ? t('delivery_note_placeholder') : t('custom_note_placeholder')}
                     rows={3} className={`${inputClass} pl-10 resize-none`}
                     style={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight + 12 : undefined }}
                     autoFocus
                   />
                 </div>
                 <button onClick={() => setNoteExpanded(false)} className="w-full mt-2 py-3 rounded-4xl text-xs font-black uppercase tracking-widest bg-white/10 hover:bg-white/20 transition-all text-white/90">{t('done')}</button>
               </motion.div>
             ) : (
               <motion.button
                 key="note-button"
                 layout
                 onClick={() => setNoteExpanded(true)} className="w-full py-4 rounded-4xl text-xs font-black uppercase tracking-widest bg-white/10 hover:bg-white/20 transition-all text-white/90"
               >
                 {t('add_note') || 'Qeyd əlavə et'}
               </motion.button>
             )}
             </AnimatePresence>
           </div>
           </div>
        </div>

        {/* Footer */}
        <div className={`p-6 pt-4 border-t ${lightMode ? 'border-zinc-100' : 'border-white/5'}`}>
          {/* Total */}
          <div className="flex items-center justify-between mb-4">
            <span className={`text-sm font-black uppercase tracking-wider ${lightMode ? 'text-zinc-500' : 'text-white/50'}`}>
              {t('total')}
            </span>
            <RollingNumber value={total} prefix="" suffix={` ${currency}`} decimals={2} className="text-2xl font-black tracking-tight tabular-nums text-[var(--theme-accent)]" duration={0.3} />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className={`flex-1 py-4 rounded-2xl text-sm font-black uppercase tracking-wider border transition-all ${
                lightMode
                  ? 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                  : 'border-white/10 text-white/50 hover:bg-white/5'
              }`}
            >
              {t('back')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !isDeliveryValid}
              className="flex-1 py-4 rounded-2xl bg-emerald-500 text-white text-sm font-black uppercase tracking-wider hover:bg-emerald-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
            >
              {submitting ? t('submitting') : mode === 'takeaway' ? t('create_takeaway_order') : t('create_delivery_order')}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
