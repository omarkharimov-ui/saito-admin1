'use client';

import React, { useState, useEffect } from 'react';
import { Trash2, AlertCircle, Loader2, Users, Calendar, Clock, Phone, User, MessageSquare } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import MobileModal from '@/components/ui/MobileModal';

interface DeleteModalProps {
  reservation: { id: string; guest: string } | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteReservationModal = ({ reservation, onConfirm, onCancel }: DeleteModalProps) => {
  const { t } = useLanguage();
  return (
    <MobileModal open={!!reservation} onClose={onCancel}>
      <div className="flex flex-col items-center text-center">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
          <Trash2 size={32} className="text-red-500" />
        </div>
        <h3 className="text-xl font-serif font-bold text-white mb-2">{t('delete')}</h3>
        <p className="text-white/60 text-sm mb-6">"{reservation?.guest}" - {t('confirm_delete')}</p>
        <div className="flex gap-3 w-full">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-white/10 text-white/60 text-sm font-medium">
            {t('no')}
          </button>
          <button onClick={onConfirm} className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-semibold flex items-center justify-center gap-2">
            <Trash2 size={16} />{t('yes_delete')}
          </button>
        </div>
      </div>
    </MobileModal>
  );
};

interface ClearArchiveModalProps {
  open: boolean;
  clearing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  description?: string;
}

export const ClearArchiveModal = ({ open, clearing, onConfirm, onCancel, title, description }: ClearArchiveModalProps) => {
  const { t } = useLanguage();
  return (
    <MobileModal open={open} onClose={onCancel}>
      <div className="flex flex-col items-center text-center">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
          <AlertCircle size={32} className="text-red-500" />
        </div>
        <h3 className="text-xl font-serif font-bold text-white mb-2">{title ?? t('clear_archive')}</h3>
        <p className="text-white/60 text-sm mb-6">{description ?? t('confirm_clear_archive')}</p>
        <div className="flex gap-3 w-full">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-white/10 text-white/60 text-sm font-medium">
            {t('no')}
          </button>
          <button onClick={onConfirm} disabled={clearing} className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2">
            {clearing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}{t('yes_delete')}
          </button>
        </div>
      </div>
    </MobileModal>
  );
};

interface UpsertReservationModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  initialData?: any;
  loading?: boolean;
}

export const UpsertReservationModal = ({ open, onClose, onSave, initialData, loading }: UpsertReservationModalProps) => {
  const { t } = useLanguage();
  const [formData, setFormData] = useState({
    customer_name: '',
    phone: '',
    date: new Date().toISOString().split('T')[0],
    time: '19:00',
    guests: 2,
    notes: ''
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        customer_name: initialData.customer_name || initialData.name || '',
        phone: initialData.phone || '',
        date: initialData.date || new Date().toISOString().split('T')[0],
        time: initialData.time || '19:00',
        guests: initialData.guests || 2,
        notes: initialData.notes || initialData.note || ''
      });
    } else {
      setFormData({
        customer_name: '',
        phone: '',
        date: new Date().toISOString().split('T')[0],
        time: '19:00',
        guests: 2,
        notes: ''
      });
    }
  }, [initialData, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <MobileModal open={open} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <h3 className="text-xl font-serif font-bold text-white mb-2">{initialData ? t('edit_reservation') : t('new_reservation')}</h3>
        <form onSubmit={handleSubmit} className="space-y-5 py-2">
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold flex items-center gap-2">
              <User size={12} /> {t('res.name')}
            </label>
            <input
              required
              type="text"
              className="w-full bg-white/5 border border-white/10 px-4 py-3 rounded-xl outline-none focus:border-gold/50 text-white text-sm"
              value={formData.customer_name}
              onChange={e => setFormData({ ...formData, customer_name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold flex items-center gap-2">
              <Phone size={12} /> {t('res.phone')}
            </label>
            <input
              required
              type="tel"
              className="w-full bg-white/5 border border-white/10 px-4 py-3 rounded-xl outline-none focus:border-gold/50 text-white text-sm"
              value={formData.phone}
              onChange={e => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold flex items-center gap-2">
                <Calendar size={12} /> {t('date')}
              </label>
              <input
                required
                type="date"
                className="w-full bg-white/5 border border-white/10 px-4 py-3 rounded-xl outline-none focus:border-gold/50 text-white text-sm"
                value={formData.date}
                onChange={e => setFormData({ ...formData, date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold flex items-center gap-2">
                <Clock size={12} /> {t('time')}
              </label>
              <input
                required
                type="time"
                className="w-full bg-white/5 border border-white/10 px-4 py-3 rounded-xl outline-none focus:border-gold/50 text-white text-sm"
                value={formData.time}
                onChange={e => setFormData({ ...formData, time: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold flex items-center gap-2">
              <Users size={12} /> {t('guests_count')}
            </label>
            <input
              required
              type="number"
              min="1"
              className="w-full bg-white/5 border border-white/10 px-4 py-3 rounded-xl outline-none focus:border-gold/50 text-white text-sm"
              value={formData.guests}
              onChange={e => setFormData({ ...formData, guests: parseInt(e.target.value) })}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold flex items-center gap-2">
              <MessageSquare size={12} /> {t('note')}
            </label>
            <textarea
              className="w-full bg-white/5 border border-white/10 px-4 py-3 rounded-xl outline-none focus:border-gold/50 text-white text-sm h-20 resize-none"
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 py-4 rounded-2xl border border-white/10 text-white/60 text-xs font-black uppercase tracking-widest">
              {t('cancel')}
            </button>
            <button type="submit" disabled={loading} className="flex-[2] py-4 rounded-2xl bg-gold text-black text-xs font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <Loader2 size={16} className="animate-spin" /> : initialData ? t('save') : t('create')}
            </button>
          </div>
        </form>
      </div>
    </MobileModal>
  );
};
