'use client';

import React from 'react';
import { CheckCircle, Calendar, Users, Phone, Clock, Trash2, Star, UserPlus, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { Reservation } from '@/types';

interface Props {
  res: Reservation & { visitCount?: number; table_id?: string; preOrderItems?: any[] };
  timeFilter: 'today' | 'future' | 'archive';
  statusBadge: (status: string) => React.ReactNode;
  onUpdateStatus: (id: string, status: 'confirmed' | 'cancelled') => void;
  onDelete: (id: string, name: string) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelection?: (id: string) => void;
  onSelect: (res: any) => void;
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

export const ReservationTableRow = ({ res, statusBadge, onUpdateStatus, onDelete, selectionMode, selected, onToggleSelection, onSelect }: Props) => {
  const { lightMode } = useTheme();
  const tag = getGuestTag(res.visitCount || 1);

  return (
    <motion.tr
      layoutId={`reserv-${res.id}`}
      onClick={() => selectionMode ? onToggleSelection?.(res.id) : onSelect(res)}
      className={`group transition-all duration-300 border-b ${lightMode ? 'border-zinc-100 hover:bg-zinc-50' : 'border-white/[0.04] hover:bg-white/[0.02]'} cursor-zoom-in ${selected ? 'bg-white/[0.05]' : ''}`}
    >
      <td className="px-6 py-5">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className={`font-bold text-[15px] ${lightMode ? 'text-zinc-900' : 'text-white'}`}>{res.name}</span>
              <span className={`px-1.5 py-0.5 rounded border text-[8px] font-black uppercase tracking-widest ${tag.color}`}>
                {tag.label}
              </span>
            </div>
            <span className={`text-[11px] font-medium opacity-40`}>{maskPhone(res.phone)}</span>
          </div>
        </div>
      </td>
      <td className="px-6 py-5">
        <div className="flex flex-col gap-1 text-[12px] font-bold opacity-70">
          <span className="flex items-center gap-2"><Calendar size={13} className="opacity-30" /> {new Date(res.date).toLocaleDateString('az-AZ')}</span>
          <span className="flex items-center gap-2 opacity-50"><Clock size={13} className="opacity-30" /> {res.time}</span>
        </div>
      </td>
      <td className="px-6 py-5 text-center font-bold text-xs"><Users size={14} className="inline mr-1.5 opacity-30" />{res.guests}</td>
      <td className="px-6 py-5">{statusBadge(res.status)}</td>
      <td className="px-6 py-5 opacity-40 text-[11px] italic truncate max-w-[150px]">{res.note || '—'}</td>
      <td className="px-6 py-5 text-right">
        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
           {res.status === 'pending' && <button onClick={(e) => { e.stopPropagation(); onUpdateStatus(res.id, 'confirmed'); }} className="p-2 rounded-lg bg-green-500/10 text-green-500"><CheckCircle size={16} /></button>}
           <button onClick={(e) => { e.stopPropagation(); onDelete(res.id, res.name); }} className="p-2 rounded-lg bg-red-500/10 text-red-500"><Trash2 size={16} /></button>
        </div>
      </td>
    </motion.tr>
  );
};

export const ReservationCard = ReservationTableRow; // For simplicity in this demo
