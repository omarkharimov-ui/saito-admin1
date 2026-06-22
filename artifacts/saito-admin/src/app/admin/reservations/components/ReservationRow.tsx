'use client';

import React from 'react';
import { CheckCircle, XCircle, Calendar, Users, Phone, Clock, Gift, CakeSlice, Trash2, Star, UserPlus, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { Reservation } from '@/types';

interface Props {
  res: Reservation & { visitCount?: number };
  timeFilter: 'today' | 'future' | 'archive';
  statusBadge: (status: string) => React.ReactNode;
  onUpdateStatus: (id: string, status: 'confirmed' | 'cancelled') => void;
  onDelete: (id: string, name: string) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelection?: (id: string) => void;
  onSelect: (res: Reservation & { visitCount?: number }) => void;
}

const maskPhone = (phone: string) => {
  const clean = phone.replace(/\D/g, '');
  if (clean.length < 4) return phone;
  const last4 = clean.slice(-4);
  const part1 = last4.slice(0, 2);
  const part2 = last4.slice(2);
  return `+994 •••• •• ${part1} ${part2}`;
};

const getGuestTag = (count: number, t: any) => {
  if (count > 5) return { label: 'VIP', icon: Star, color: 'bg-gold/10 text-gold border-gold/30 shadow-[0_0_12px_rgba(212,175,55,0.2)]' };
  if (count > 1) return { label: 'Regular', icon: Zap, color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' };
  return { label: 'Yeni', icon: UserPlus, color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
};

export const ReservationTableRow = ({ res, timeFilter, statusBadge, onUpdateStatus, onDelete, selectionMode, selected, onToggleSelection, onSelect }: Props) => {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  const tag = getGuestTag(res.visitCount || 1, t);

  return (
    <motion.tr
      layoutId={`res-card-${res.id}`}
      onClick={() => selectionMode ? onToggleSelection?.(res.id) : onSelect(res)}
      className={`group transition-all duration-300 border-b ${lightMode ? 'border-zinc-100 hover:bg-zinc-50/50' : 'border-white/[0.04] hover:bg-white/[0.02]'} ${selectionMode ? 'cursor-pointer' : 'cursor-zoom-in'} ${selected ? 'bg-white/[0.05]' : ''}`}
    >
      <td className="px-6 py-5">
        <div className="flex items-start gap-4">
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className={`font-bold text-[15px] tracking-tight ${lightMode ? 'text-zinc-900' : 'text-white'}`}>{res.name}</span>
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[8px] font-black uppercase tracking-widest transition-all ${tag.color}`}>
                <tag.icon size={10} strokeWidth={3} />
                {tag.label}
              </span>
            </div>
            <span className={`text-[11px] font-medium mt-1 tracking-wider ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
              {maskPhone(res.phone)}
            </span>
          </div>
        </div>
      </td>
      <td className="px-6 py-5">
        <div className="flex flex-col gap-1">
          <div className={`flex items-center gap-2 text-[12px] font-bold ${lightMode ? 'text-zinc-600' : 'text-white/70'}`}>
            <Calendar size={13} className="opacity-30" />
            {new Date(res.date).toLocaleDateString('az-AZ', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
          <div className={`flex items-center gap-2 text-[11px] font-medium opacity-50 ${lightMode ? 'text-zinc-500' : 'text-white'}`}>
            <Clock size={13} className="opacity-30" /> {res.time}
          </div>
        </div>
      </td>
      <td className="px-6 py-5 text-center">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black ${lightMode ? 'bg-zinc-100 text-zinc-900' : 'bg-white/5 text-white'}`}>
          <Users size={14} className="opacity-30" /> {res.guests}
        </span>
      </td>
      <td className="px-6 py-5">{statusBadge(res.status)}</td>
      <td className="px-6 py-5">
        <p className={`text-[11px] italic truncate max-w-[180px] ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
          {res.note || '—'}
        </p>
      </td>
      {timeFilter !== 'archive' && (
        <td className="px-6 py-5 text-right" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            {res.status === 'pending' && (
              <button onClick={() => onUpdateStatus(res.id, 'confirmed')} className="p-2.5 rounded-xl bg-green-500/10 text-green-500 hover:bg-green-500 hover:text-white transition-all"><CheckCircle size={18} /></button>
            )}
            <button onClick={() => onDelete(res.id, res.name)} className="p-2.5 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all"><Trash2 size={18} /></button>
          </div>
        </td>
      )}
    </motion.tr>
  );
};

export const ReservationCard = ({ res, timeFilter, statusBadge, onUpdateStatus, onDelete, selectionMode, selected, onToggleSelection, onSelect }: Props) => {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  const tag = getGuestTag(res.visitCount || 1, t);

  return (
    <motion.div
      layoutId={`res-card-${res.id}`}
      onClick={() => selectionMode ? onToggleSelection?.(res.id) : onSelect(res)}
      className={`p-5 rounded-3xl border transition-all ${lightMode ? 'bg-white border-zinc-200 shadow-sm' : 'bg-white/[0.02] border-white/[0.05]'} ${selected ? 'ring-2 ring-blue-500' : ''}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-lg tracking-tight">{res.name}</span>
            <span className={`px-1.5 py-0.5 rounded border text-[8px] font-black uppercase tracking-widest ${tag.color}`}>{tag.label}</span>
          </div>
          <span className="text-xs opacity-40 font-medium">{maskPhone(res.phone)}</span>
        </div>
        {statusBadge(res.status)}
      </div>
      
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className={`p-3 rounded-2xl ${lightMode ? 'bg-zinc-50' : 'bg-white/5'}`}>
          <span className="text-[9px] uppercase tracking-widest opacity-40 font-black block mb-1">Tarix & Saat</span>
          <div className="flex items-center gap-2 text-xs font-bold">
            <Clock size={12} className="text-blue-500" /> {res.time} · {new Date(res.date).toLocaleDateString('az-AZ', { day: 'numeric', month: 'short' })}
          </div>
        </div>
        <div className={`p-3 rounded-2xl ${lightMode ? 'bg-zinc-50' : 'bg-white/5'}`}>
          <span className="text-[9px] uppercase tracking-widest opacity-40 font-black block mb-1">Qonaq Sayı</span>
          <div className="flex items-center gap-2 text-xs font-bold">
            <Users size={12} className="text-blue-500" /> {res.guests} Nəfər
          </div>
        </div>
      </div>

      {!selectionMode && (
        <div className="flex gap-2 pt-2 border-t border-white/5">
          <button className="flex-1 py-3 rounded-xl bg-blue-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-500/20">Detallar</button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(res.id, res.name); }} className="p-3 rounded-xl bg-red-500/10 text-red-500"><Trash2 size={16} /></button>
        </div>
      )}
    </motion.div>
  );
};
