'use client';

import React from 'react';
import { Calendar, Users, Phone, Clock, Trash2, Star, UserPlus, Zap } from 'lucide-react';

import { motion } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { Reservation } from '@/types';

interface Props {
  res: Reservation & { visitCount?: number };
  timeFilter: 'today' | 'future' | 'archive';
  statusBadge: (status: string) => React.ReactNode;
  onUpdateStatus: (id: string, status: string) => void;
  onEdit: (res: any) => void;
  onDelete: (id: string, name: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onSelect: (res: any) => void;
  onHandle?: (res: any) => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

const maskPhone = (phone: string) => {
  if (!phone) return '—';
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

export const ReservationTableRow = ({ 
  res, 
  timeFilter, 
  statusBadge, 
  onUpdateStatus, 
  onEdit, 
  onDelete, 
  onArchive, 
  onRestore, 
  onSelect, 
  onHandle,
  selectionMode,
  isSelected,
  onToggleSelect
}: Props) => {
  const { lightMode } = useTheme();
  const tag = getGuestTag(res.visitCount || 1);
  const displayName = res.name || res.customer_name || 'Qonaq';

  return (
    <motion.tr
      whileHover={{ scale: 1.002 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      onClick={() => selectionMode ? onToggleSelect?.(res.id) : onSelect(res)}
      className={`group border-b cursor-pointer transition-all duration-300 ${
        isSelected 
          ? (lightMode ? 'bg-blue-50/50' : 'bg-blue-500/5') 
          : lightMode 
            ? 'border-zinc-100 hover:bg-zinc-50' 
            : 'border-white/[0.04] hover:bg-white/[0.02]'
      }`}
    >
      <td className="px-8 py-6">
        <div className="flex items-center gap-3">
          {selectionMode && (
            <div onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleSelect?.(res.id)}
                className="w-5 h-5 rounded accent-blue-500 cursor-pointer"
              />
            </div>
          )}
          <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className={`font-bold text-[15px] ${lightMode ? 'text-zinc-900' : 'text-white'}`}>{displayName}</span>
            <span className={`px-1.5 py-0.5 rounded border text-[8px] font-black uppercase tracking-widest ${tag.color}`}>
              {tag.label}
            </span>
          </div>
          <span className={`text-[11px] font-medium mt-1 ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
            {maskPhone(res.phone)}
          </span>
        </div>
        </div>
      </td>
      <td className="px-8 py-6">
        <div className="flex flex-col gap-1.5 text-[12px] font-bold">
          <span className={`flex items-center gap-2 ${lightMode ? 'text-zinc-600' : 'text-white/80'}`}>
            <Calendar size={13} className="opacity-30" /> {new Date(res.date).toLocaleDateString('az-AZ')}
          </span>
          <span className={`flex items-center gap-2 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
            <Clock size={13} className="opacity-30" /> {res.time}
            {res.status !== 'archived' && res.status !== 'cancelled' && res.status !== 'completed' && (() => {
              const today = new Date().toISOString().split('T')[0];
              if (res.date < today || (res.date === today && res.time && (() => {
                const [h, m] = res.time.split(':').map(Number);
                const resTime = new Date(); resTime.setHours(h, m, 0);
                return new Date().getTime() - resTime.getTime() > 0;
              })())) {
                return <span className="px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 text-[8px] font-black uppercase tracking-widest ml-1">vaxtı keçib</span>;
              }
              return null;
            })()}
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
          {res.notes || res.note || '—'}
        </p>
      </td>
      <td className="px-8 py-6 text-right">
        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          {timeFilter === 'archive' && (
            <button title="Bərpa et" onClick={() => onRestore(res.id)} className="p-2.5 rounded-xl bg-white/5 text-white/40 hover:bg-white/10 hover:text-white transition-all"><Zap size={18} /></button>
          )}
          {res.status === 'archived' && (
            <button title="Sil" onClick={() => onDelete(res.id, displayName)} className="p-2.5 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all"><Trash2 size={18} /></button>
          )}
        </div>
      </td>
    </motion.tr>
  );
};


export const ReservationCard = ({ 
  res, 
  statusBadge, 
  onSelect, 
}: any) => {
  const { lightMode } = useTheme();
  const tag = getGuestTag(res.visitCount || 1);
  const displayName = res.name || res.customer_name || 'Qonaq';

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
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
            <span className={`font-bold text-lg ${lightMode ? 'text-zinc-900' : 'text-white'}`}>{displayName}</span>
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
