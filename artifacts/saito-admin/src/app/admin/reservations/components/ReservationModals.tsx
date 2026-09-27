'use client';

import React, { useState, useEffect } from 'react';
import { Trash2, AlertCircle, Loader2, Users, Calendar, Clock, Phone, User, MessageSquare, Star, Wallet, Mail } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import MobileModal from '@/components/ui/MobileModal';
import { toast } from '@/lib/toast';
import { apiFetch } from '@/lib/api-fetch';

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
        <p className="text-white/60 text-sm mb-6">&ldquo;{reservation?.guest}&rdquo; - {t('confirm_delete')}</p>
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
  // 2026-09-26 (owner, Task 49): local-date helper — toISOString() is UTC and
  // mis-files "today" reservations in UTC+4 between 00:00–04:00.
  const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  const [formData, setFormData] = useState({
    customer_name: '',
    phone: '',
    // 2026-09-26 (owner): guest e-mail — confirm/reminder recipient (optional).
    email: '',
    date: localToday(),
    time: '19:00',
    guests: 2,
    notes: '',
    // 2026-09-26 (owner, Task 49): VIP + table-hold deposit engine fields.
    is_vip: false,
    deposit_amount: ''
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        customer_name: initialData.customer_name || initialData.name || '',
        phone: initialData.phone || '',
        email: initialData.email || '',
        date: initialData.date || localToday(),
        time: initialData.time || '19:00',
        guests: initialData.guests || 2,
        notes: initialData.notes || initialData.note || '',
        is_vip: !!initialData.is_vip,
        deposit_amount: initialData.deposit_amount != null && initialData.deposit_amount !== '' ? String(initialData.deposit_amount) : ''
      });
    } else {
      setFormData({
        customer_name: '',
        phone: '',
        email: '',
        date: localToday(),
        time: '19:00',
        guests: 2,
        notes: '',
        is_vip: false,
        deposit_amount: ''
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
              className="w-full bg-white/5 border border-white/10 px-4 py-3 rounded-xl outline-none focus:border-emerald-400/60 text-white text-sm"
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
              className="w-full bg-white/5 border border-white/10 px-4 py-3 rounded-xl outline-none focus:border-emerald-400/60 text-white text-sm"
              value={formData.phone}
              onChange={e => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>

          {/* 2026-09-26 (owner): guest e-mail — optional; powers the
              "EMAIL GÖNDƏR" confirm/reminder button in the detail sheet. */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold flex items-center gap-2">
              <Mail size={12} /> E-mail <span className="normal-case tracking-normal text-white/25">(təsdiq/xatırlatma üçün, istəyə bağlı)</span>
            </label>
            <input
              type="email"
              className="w-full bg-white/5 border border-white/10 px-4 py-3 rounded-xl outline-none focus:border-emerald-400/60 text-white text-sm"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              placeholder="qonaq@mail.com"
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
                className="w-full bg-white/5 border border-white/10 px-4 py-3 rounded-xl outline-none focus:border-emerald-400/60 text-white text-sm"
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
                className="w-full bg-white/5 border border-white/10 px-4 py-3 rounded-xl outline-none focus:border-emerald-400/60 text-white text-sm"
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
              className="w-full bg-white/5 border border-white/10 px-4 py-3 rounded-xl outline-none focus:border-emerald-400/60 text-white text-sm"
              value={formData.guests}
              onChange={e => setFormData({ ...formData, guests: parseInt(e.target.value) })}
            />
          </div>

          {/* 2026-09-26 (owner, Task 49): VIP + table-hold deposit engine.
              VIP = priority badge on POS sheet + reservations page; deposit
              = ₼ hold taken at booking, credited to the bill at payment. */}
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, is_vip: !formData.is_vip })}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-black uppercase tracking-widest transition-all ${
                formData.is_vip
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-lg shadow-amber-500/10'
                  : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
              }`}
            >
              <Star size={16} className={formData.is_vip ? 'fill-amber-400 text-amber-400' : ''} />
              VIP
            </button>
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold flex items-center gap-2">
                <Wallet size={12} /> {t('deposit')}
              </label>
              <input
                type="number"
                min="0"
                step="5"
                placeholder="0"
                className="w-full bg-white/5 border border-white/10 px-4 py-3 rounded-xl outline-none focus:border-emerald-400/60 text-white text-sm"
                value={formData.deposit_amount}
                onChange={e => setFormData({ ...formData, deposit_amount: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold flex items-center gap-2">
              <MessageSquare size={12} /> {t('note')}
            </label>
            <textarea
              className="w-full bg-white/5 border border-white/10 px-4 py-3 rounded-xl outline-none focus:border-emerald-400/60 text-white text-sm h-20 resize-none"
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

/* 2026-09-26 (owner): reservation e-mail sender dialog.
   to = guest e-mail (prefilled from reservation, editable), template
   confirm|remind, live preview, send via /api/email/send. Success persists
   the e-mail onto the reservation (server-side). */
interface SendEmailModalProps {
  reservation: any | null;
  onSent: () => void;
  onClose: () => void;
}

export const SendReservationEmailModal = ({ reservation, onSent, onClose }: SendEmailModalProps) => {
  const { t } = useLanguage();
  const [to, setTo] = useState(reservation?.email || '');
  const [template, setTemplate] = useState<'confirm' | 'remind'>('confirm');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (reservation) {
      setTo(reservation.email || '');
      // sensible default: pending → confirm, confirmed/waiting → remind
      setTemplate(reservation.status === 'pending' ? 'confirm' : 'remind');
    }
  }, [reservation]);

  if (!reservation) return null;

  const date = String(reservation.date || '').slice(0, 10);
  const time = reservation.time || '';
  const guests = Number(reservation.guests) || Number(reservation.guest_count) || 0;
  const name = reservation.name || 'Qonaq';
  const preview = template === 'confirm'
    ? `Salam ${name}, rezervasiyanız təsdiqlənib: ${date} · ${time}${guests ? ` · ${guests} nəfər` : ''}. Görüşə qədər!`
    : `Salam ${name}, xatırladırıq: ${date} · ${time}${guests ? ` · ${guests} nəfər` : ''}. Görüşə qədər!`;

  const send = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      alert('Düzgün e-mail ünvanı daxil edin');
      return;
    }
    setSending(true);
    try {
      const res = await apiFetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, template, reservation_id: reservation.id }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`E-mail ${to}-a göndərildi ✓`);
        onSent();
      } else if (data.error === 'smtp_not_configured') {
        toast.error('SMTP yoxdur — Ayarlar → Bildirişlər → E-mail konfiqurasiya edin');
      } else if (data.error === 'email_disabled') {
        toast.error('Email sönükdür — Ayarlar → Bildirişlər-də aktiv edin');
      } else {
        toast.error(data.error === 'err_bad_email' ? 'E-mail ünvanı düzgün deyil' : data.error || 'Göndəriş uğursuz oldu');
      }
    } catch {
      toast.error('Ağ şəbəkəsi yoxdur');
    } finally { setSending(false); }
  };

  return (
    <MobileModal open={!!reservation} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2.5 mb-1">
          <span className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center">
            <Mail size={16} className="text-emerald-400" />
          </span>
          <div>
            <h3 className="text-lg font-serif font-bold text-white leading-tight">{t('resv_email_title') || 'E-mail göndər'}</h3>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/35">{name} · {date} {time}</p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Göndəriləcək e-mail</label>
          <input
            type="email"
            className="w-full bg-white/5 border border-white/10 px-4 py-3 rounded-xl outline-none focus:border-emerald-400/60 text-white text-sm"
            value={to}
            onChange={e => setTo(e.target.value)}
            placeholder="qonaq@mail.com"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          {([['confirm', 'Təsdiq'], ['remind', 'Xatırlatma']] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTemplate(id)}
              className={`py-3 rounded-xl border text-[11px] font-black uppercase tracking-widest transition-all ${
                template === id
                  ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-300'
                  : 'bg-white/5 border-white/10 text-white/45 hover:bg-white/10'
              }`}>
              {label}
            </button>
          ))}
        </div>

        <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/35 mb-1.5">Preview</p>
          <p className="text-[13px] text-white/70 leading-relaxed">{preview}</p>
          {reservation.is_vip && <p className="text-[11px] font-bold text-amber-400 mt-1.5">★ VIP rezervasiya çipi daxil ediləcək</p>}
          {Number(reservation.deposit_amount) > 0 && (
            <p className="text-[11px] font-bold text-emerald-400 mt-1">Depozit ₼{Number(reservation.deposit_amount).toFixed(0)} çipi daxil ediləcək</p>
          )}
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-3.5 rounded-xl border border-white/10 text-white/60 text-sm font-medium">
            {t('cancel')}
          </button>
          <button onClick={send} disabled={sending || !to}
            className="flex-[2] py-3.5 rounded-xl bg-emerald-500 text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-40">
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
            {sending ? 'Göndərilir...' : (t('resv_email_send_btn') || 'Göndər')}
          </button>
        </div>
      </div>
    </MobileModal>
  );
};
