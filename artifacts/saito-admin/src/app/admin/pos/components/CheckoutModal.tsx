'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Phone, User, MapPin, Clock, FileText, Banknote, CreditCard, Wifi, Timer } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { appleCard, appleBackdrop } from '@/lib/modal-transitions';

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
  { value: 'cash' as const, label: 'Nağd', icon: Banknote, color: 'emerald' },
  { value: 'card' as const, label: 'Kart', icon: CreditCard, color: 'blue' },
  { value: 'online' as const, label: 'Online', icon: Wifi, color: 'purple' },
  { value: 'pay_later' as const, label: 'Sonra', icon: Timer, color: 'amber' },
];

export default function CheckoutModal({ open, mode, total, currency = '₼', onSubmit, onClose }: CheckoutModalProps) {
  const { lightMode } = useTheme();
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

  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) { setWasOpen(true); resetFormState(); }
  if (!open && wasOpen) { setWasOpen(false); }

  function resetFormState() {
    setPhone(''); setName(''); setNote(''); setAddress(''); setDistrict('');
    setStreet(''); setBuilding(''); setFloor(''); setApartment(''); setIntercom('');
    setZone(''); setFee(0); setPickupTime('now'); setCustomTime('');
    setScheduledDate(''); setPaymentMethod('cash');
  }

  if (!open) return null;

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
        estimated_pickup_time: pickupTime === 'custom' ? customTime : pickupTime === 'now' ? '' : `${pickupTime} dəq`,
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
    lightMode ? 'bg-zinc-50 border-zinc-200 text-black focus:border-emerald-400' : 'bg-white/5 border-white/10 text-white focus:border-emerald-500/50'
  }`;

  return (
    <AnimatePresence>
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
        {...appleCard}
        className={`w-full max-w-lg rounded-3xl shadow-2xl border overflow-hidden ${
          lightMode ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-white/10'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-white/10">
          <div>
            <h2 className={`text-xl font-black ${lightMode ? 'text-black' : 'text-white'}`}>
              {mode === 'takeaway' ? 'Gel-Al Ödənişi' : 'Çatdırma Ödənişi'}
            </h2>
            <p className={`text-[10px] font-black uppercase tracking-widest mt-1 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
              {mode === 'takeaway' ? 'Müştəri məlumatları' : 'Müştəri və ünvan'}
            </p>
          </div>
          <button
            onClick={handleClose}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
              lightMode ? 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200' : 'bg-white/5 text-white/50 hover:bg-white/10'
            }`}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Phone + Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                Telefon {mode === 'delivery' ? '*' : ''}
              </label>
              <div className="relative">
                <Phone size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${lightMode ? 'text-zinc-400' : 'text-white/30'}`} />
                <input type="tel" value={phone} onChange={(e) => { const v = e.target.value.replace(/[^0-9+\s\-()]/g, '').slice(0, 20); setPhone(v); }}
                  placeholder="050 000 00 00" className={`${inputClass} pl-10`}
                />
              </div>
            </div>
            <div>
              <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                Müştəri
              </label>
              <div className="relative">
                <User size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${lightMode ? 'text-zinc-400' : 'text-white/30'}`} />
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Ad Soyad" className={`${inputClass} pl-10`}
                />
              </div>
            </div>
          </div>

          {/* Delivery: District */}
          {mode === 'delivery' && (
            <div>
              <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                Rayon
              </label>
              <input type="text" value={district} onChange={(e) => setDistrict(e.target.value)}
                placeholder="Məs: Yasamal, 28 May" className={inputClass}
              />
            </div>
          )}

          {/* Delivery: Structured address */}
          {mode === 'delivery' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                    Küçə *
                  </label>
                  <input type="text" value={street} onChange={(e) => setStreet(e.target.value)}
                    placeholder="Küçə adı" className={inputClass}
                  />
                </div>
                <div>
                  <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                    Bina
                  </label>
                  <input type="text" value={building} onChange={(e) => setBuilding(e.target.value)}
                    placeholder="Bina №" className={inputClass}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                    Mərtəbə
                  </label>
                  <input type="text" value={floor} onChange={(e) => setFloor(e.target.value)}
                    placeholder="5" className={inputClass}
                  />
                </div>
                <div>
                  <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                    Mənzil
                  </label>
                  <input type="text" value={apartment} onChange={(e) => setApartment(e.target.value)}
                    placeholder="12" className={inputClass}
                  />
                </div>
                <div>
                  <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                    Domofon
                  </label>
                  <input type="text" value={intercom} onChange={(e) => setIntercom(e.target.value)}
                    placeholder="Kod" className={inputClass}
                  />
                </div>
              </div>
            </>
          )}

          {/* Delivery fee + time */}
          {mode === 'delivery' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                  Çatdırma Haqqı
                </label>
                <div className="relative">
                  <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>₼</span>
                  <input type="number" step="0.50" value={fee || ''}
                    onChange={(e) => setFee(Number(e.target.value) || 0)}
                    placeholder="0.00" className={`${inputClass} pl-10`}
                  />
                </div>
              </div>
              <div>
                <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                  Çatdırma Vaxtı
                </label>
                <input type="time" value={customTime} onChange={(e) => setCustomTime(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          )}

          {/* Takeaway: Pickup time */}
          {mode === 'takeaway' && (
            <>
              <div>
                <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                  Götürülmə Vaxtı
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { value: 'now', label: 'İndi' },
                    { value: '15', label: '15 dəq' },
                    { value: '30', label: '30 dəq' },
                    { value: 'custom', label: 'Xüsusi' },
                  ].map(opt => (
                    <button key={opt.value} type="button" onClick={() => setPickupTime(opt.value)}
                      className={`py-2.5 rounded-xl text-[11px] font-black uppercase transition-all ${
                        pickupTime === opt.value ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                          : lightMode ? 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200' : 'bg-white/5 text-white/40 hover:bg-white/10'
                      }`}
                    >{opt.label}</button>
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
                <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                  Planlaşdırılmış Tarix
                </label>
                <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)} className={inputClass}
                />
              </div>
            </>
          )}

          {/* Payment method */}
          <div>
            <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
              Ödəniş Növü
            </label>
            <div className="grid grid-cols-4 gap-2">
              {PAYMENT_METHODS.map(m => {
                const Icon = m.icon;
                return (
                  <button key={m.value} type="button" onClick={() => setPaymentMethod(m.value)}
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${
                      paymentMethod === m.value ? `bg-${m.color}-500 text-white shadow-lg`
                        : lightMode ? 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200' : 'bg-white/5 text-white/40 hover:bg-white/10'
                    }`}
                    style={paymentMethod === m.value ? { backgroundColor: `var(--tw-${m.color}-500, ${m.color === 'emerald' ? '#10b981' : m.color === 'blue' ? '#3b82f6' : m.color === 'purple' ? '#a855f7' : '#f59e0b'})` } : undefined}
                  >
                    <Icon size={16} />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Note */}
          <div>
            <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
              Qeyd
            </label>
            <div className="relative">
              <FileText size={16} className={`absolute left-3 top-3 ${lightMode ? 'text-zinc-400' : 'text-white/30'}`} />
              <textarea value={note} onChange={(e) => setNote(e.target.value)}
                placeholder={mode === 'delivery' ? 'Kuryerə qeyd: "Qapı zəngi etmə", "Lift yoxdur"...' : 'Xüsusi qeyd'}
                rows={2} className={`${inputClass} pl-10 resize-none`}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`p-6 pt-4 border-t ${lightMode ? 'border-zinc-100' : 'border-white/5'}`}>
          {/* Total */}
          <div className="flex items-center justify-between mb-4">
            <span className={`text-sm font-black uppercase tracking-wider ${lightMode ? 'text-zinc-500' : 'text-white/50'}`}>
              Cəmi
            </span>
            <span className={`text-2xl font-black ${lightMode ? 'text-black' : 'text-white'}`}>
              {total.toFixed(2)} {currency}
            </span>
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
              Geri
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !isDeliveryValid}
              className="flex-1 py-4 rounded-2xl bg-emerald-500 text-white text-sm font-black uppercase tracking-wider hover:bg-emerald-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
            >
              {submitting ? 'Göndərilir...' : mode === 'takeaway' ? 'Sifarişi Yarat' : 'Çatdırılma Yarat'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
    </AnimatePresence>
  );
}
