'use client';

import React from 'react';
import { CheckCircle, Calendar, Users, Phone, Clock, Trash2, Star, UserPlus, Zap } from 'lucide-react';
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
  onSelect: (res: any) => void;
  onHandle?: (res: any) => void;
}

const maskPhone = (phone: string) => {
  const clean = phone.replace(/\D/g, '');
  if (clean.length < 4) return phone;
  const last4 = clean.slice(-4);
  return `+994 •••• •• ${last4.slice(0, 2)} ${last4.slice(2)}`;
};

const getGuestTag = (count: number) => {
  if (count > 5) return { label: 'VIP', icon: Star, color: 'bg-gold/10 text-gold border-gold/30' };
  if (count > 1) return { label: 'Regular', icon: Zap, color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' };
  return { label: 'Yeni', icon: UserPlus, color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
};

export const ReservationTableRow = ({ res, statusBadge, onUpdateStatus, onDelete, onSelect, onHandle }: Props) => {
  const { lightMode } = useTheme();
  const tag = getGuestTag(res.visitCount || 1);

  return (
    <motion.tr
      layoutId={`reserv-${res.id}`}
      onClick={() => onSelect(res)}
      className={`group border-b cursor-pointer transition-all duration-300 ${
        lightMode 
          ? 'border-zinc-100 hover:bg-zinc-50' 
          : 'border-white/[0.04] hover:bg-white/[0.02]'
      }`}
    >
      <td className="px-8 py-6">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className={`font-bold text-[15px] ${lightMode ? 'text-zinc-900' : 'text-white'}`}>{res.name}</span>
            <span className={`px-1.5 py-0.5 rounded border text-[8px] font-black uppercase tracking-widest ${tag.color}`}>
              {tag.label}
            </span>
          </div>
          <span className={`text-[11px] font-medium mt-1 ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
            {maskPhone(res.phone)}
          </span>
        </div>
      </td>
      <td className="px-8 py-6">
        <div className="flex flex-col gap-1.5 text-[12px] font-bold">
          <span className={`flex items-center gap-2 ${lightMode ? 'text-zinc-600' : 'text-white/80'}`}>
            <Calendar size={13} className="opacity-30" /> {new Date(res.date).toLocaleDateString('az-AZ')}
          </span>
          <span className={`flex items-center gap-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
            <Clock size={13} className="opacity-30" /> {res.time}
          </span>
        </div>
      </td>
      <td className="px-8 py-6 text-center font-bold text-xs">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl ${lightMode ? 'bg-zinc-100 text-zinc-900' : 'bg-white/5 text-white'}`}>
          <Users size={14} className="opacity-30" />{res.guests}
        </span>
      </td>
      <td className="px-8 py-6">{statusBadge(res.status)}</td>
      <td className="px-8 py-6">
        <p className={`text-[11px] italic truncate max-w-[150px] ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
          {res.note || '—'}
        </p>
      </td>
      <td className="px-8 py-6 text-right">
        <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
           {res.status === 'pending' && onHandle && (
             <button onClick={() => onHandle(res)} className="px-3 py-2.5 rounded-xl bg-amber-500/15 text-amber-400 hover:bg-amber-500 hover:text-white transition-all shadow-lg shadow-amber-500/5 text-xs font-bold flex items-center gap-1.5">
               Bron et
             </button>
           )}
           {res.status === 'pending' && (
             <button onClick={() => onUpdateStatus(res.id, 'confirmed')} className="p-2.5 rounded-xl bg-green-500/10 text-green-500 hover:bg-green-500 hover:text-white transition-all shadow-lg shadow-green-500/5"><CheckCircle size={18} /></button>
           )}
           <button onClick={() => onDelete(res.id, res.name)} className="p-2.5 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-lg shadow-red-500/5"><Trash2 size={18} /></button>
        </div>
      </td>
    </motion.tr>
  );
};

export const ReservationCard = ({ res, statusBadge, onUpdateStatus, onDelete, onSelect, onHandle }: Props) => {
  const { lightMode } = useTheme();
  const tag = getGuestTag(res.visitCount || 1);

  return (
    <motion.div
      layoutId={`reserv-${res.id}`}
      onClick={() => onSelect(res)}
      className={`p-6 rounded-[2.5rem] border shadow-2xl transition-all ${
        lightMode 
          ? 'bg-white border-zinc-100 shadow-zinc-200/50' 
          : 'bg-[#0f0f0f] border-white/5 shadow-black/60'
      }`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <span className={`font-bold text-lg ${lightMode ? 'text-zinc-900' : 'text-white'}`}>{res.name}</span>
            <span className={`px-1.5 py-0.5 rounded border text-[8px] font-black uppercase ${tag.color}`}>{tag.label}</span>
          </div>
          <span className={`text-xs font-medium ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>{maskPhone(res.phone)}</span>
        </div>
        {statusBadge(res.status)}
      </div>
      <div className={`flex items-center gap-4 text-xs font-bold ${lightMode ? 'text-zinc-600' : 'text-white/60'}`}>
         <span className="flex items-center gap-1.5"><Calendar size={14} className="opacity-30" /> {res.time}</span>
         <span className="flex items-center gap-1.5"><Users size={14} className="opacity-30" /> {res.guests} Nəfər</span>
      </div>
    </motion.div>
  );
};
