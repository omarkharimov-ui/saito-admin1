'use client';

import React from 'react';
import { CheckCircle, XCircle, Calendar, Users, Phone, Clock, Gift, CakeSlice, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { Reservation } from '@/types';

interface Props {
  res: Reservation;
  timeFilter: 'today' | 'future' | 'archive';
  statusBadge: (status: string) => React.ReactNode;
  onUpdateStatus: (id: string, status: 'confirmed' | 'cancelled') => void;
  onDelete: (id: string, name: string) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelection?: (id: string) => void;
}

const getNoteIcon = (note: string) => {
  const n = note.toLowerCase();
  if (n.includes('ad gün') || n.includes('ad gun') || n.includes('birthday') || n.includes('tort') || n.includes('cake')) return CakeSlice;
  if (n.includes('hədiyy') || n.includes('hediyy') || n.includes('gift') || n.includes('surprise')) return Gift;
  return null;
};

const isTomorrowDate = (date: string) => {
  const resDate = new Date(date);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const dayAfter = new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000);
  return resDate >= tomorrow && resDate < dayAfter;
};

export const ReservationTableRow = ({ res, timeFilter, statusBadge, onUpdateStatus, onDelete, selectionMode, selected, onToggleSelection }: Props) => {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  const isTomorrow = isTomorrowDate(res.date);
  const NoteIcon = res.note ? getNoteIcon(res.note) : null;

  return (
    <motion.tr
      layout
      initial={false}
      animate={{ opacity: 1 }}
      key={res.id}
      onClick={selectionMode ? () => onToggleSelection?.(res.id) : undefined}
      className={`transition-all duration-300 ${lightMode ? 'hover:bg-gray-50' : 'hover:bg-white/[0.02]'}${selectionMode ? 'cursor-pointer' : ''} ${selected ? 'bg-white/[0.05] ring-1 ring-gold/30' : ''}`}
    >
      <td className="px-6 py-5">
        <div className="flex items-start gap-3">
          {selectionMode && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleSelection?.(res.id); }}
              className="flex-shrink-0 w-[22px] h-[22px] rounded-full flex items-center justify-center transition-all mt-1"
              style={{ background: selected ? '#007AFF' : (lightMode ? '#f3f4f6' : 'rgba(255,255,255,0.06)'), border: selected ? '2px solid #007AFF' : (lightMode ? '2px solid #d1d5db' : '2px solid rgba(255,255,255,0.2)') }}
              aria-pressed={selected}
            >
              {selected && (
                <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                  <path d="M1.5 4.5L4 7L9.5 1.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          )}
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className={`font-medium ${lightMode ? 'text-gray-900' : 'text-white'}`}>{res.name}</span>
              {isTomorrow && (
                <span className="relative inline-flex items-center text-[9px] font-bold text-gold bg-gold/10 px-1.5 py-0.5 rounded ml-1 ring-1 ring-gold/40">
                  {t('tomorrow').toUpperCase()}
                </span>
              )}
            </div>
            <div className={`flex items-center gap-2 text-xs mt-1 ${lightMode ? 'text-gray-400' : 'text-white/40'}`}>
              <Phone size={12} /> {res.phone}
            </div>
          </div>
        </div>
      </td>
      <td className="px-6 py-5">
        <div className="flex flex-col gap-1">
          <div className={`flex items-center gap-2 text-xs ${lightMode ? 'text-gray-600' : 'text-white/70'}`}>
            <Calendar size={12} className={lightMode ? 'text-gray-400' : 'text-white/30'} />
            {new Date(res.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
          <div className={`flex items-center gap-2 text-xs ${lightMode ? 'text-gray-400' : 'text-white/40'}`}>
            <Clock size={12} /> {res.time}
          </div>
        </div>
      </td>
      <td className="px-6 py-5 text-center">
        <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm ${lightMode ? 'bg-gray-100 text-gray-900' : 'bg-white/5 text-white'}`}>
          <Users size={14} /> {res.guests}
        </div>
      </td>
      <td className="px-6 py-5">{statusBadge(res.status)}</td>
      <td className="px-6 py-5">
        {res.note ? (
          <div className="flex items-start gap-2 max-w-[200px]">
            {NoteIcon && <NoteIcon size={14} className="text-gold/60 shrink-0 mt-1" />}
            <span className={`text-xs italic truncate ${lightMode ? 'text-gray-400' : 'text-white/40'}`} title={res.note}>{res.note}</span>
          </div>
        ) : <span className={`text-xs ${lightMode ? 'text-gray-200' : 'text-white/10'}`}>-</span>}
      </td>
      {timeFilter !== 'archive' && <td className="px-6 py-5 text-right">
        {selectionMode ? (
          <div className={`inline-flex items-center justify-end gap-2 text-xs ${lightMode ? 'text-gray-500' : 'text-white/50'}`}>
            <span className={selected ? 'text-white' : 'text-white/40'}>
              {selected ? t('selected_items') : t('tap_to_select')}
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-3 md:gap-4">
            {res.status === 'pending' && (
              <>
                <button onClick={() => onUpdateStatus(res.id, 'confirmed')} className="p-2.5 inline-flex items-center justify-center text-green-400/70 bg-green-500/[0.07] hover:bg-green-500/[0.12] hover:text-green-300 border border-green-500/[0.12] hover:border-green-500/25 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95" title={t('confirm')}>
                  <CheckCircle size={17} />
                </button>
                <button onClick={() => onUpdateStatus(res.id, 'cancelled')} className="p-2.5 inline-flex items-center justify-center text-red-400/70 bg-red-500/[0.07] hover:bg-red-500/[0.12] hover:text-red-300 border border-red-500/[0.12] hover:border-red-500/25 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95" title={t('cancel')}>
                  <XCircle size={17} />
                </button>
              </>
            )}
            {res.status === 'confirmed' && (
              <>
                <button onClick={() => onUpdateStatus(res.id, 'cancelled')} className="p-2.5 inline-flex items-center justify-center text-red-400/70 bg-red-500/[0.07] hover:bg-red-500/[0.12] hover:text-red-300 border border-red-500/[0.12] hover:border-red-500/25 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95" title={t('cancel')}>
                  <XCircle size={17} />
                </button>
                <button onClick={() => onDelete(res.id, res.name)} className={`p-2.5 inline-flex items-center justify-center hover:text-red-400 hover:bg-red-500/[0.08] border hover:border-red-500/20 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 ${lightMode ? 'text-gray-300 bg-gray-50/80 border-gray-200' : 'text-white/25 bg-white/[0.04] border-white/[0.07]'}`} title={t('delete')}>
                  <Trash2 size={16} />
                </button>
              </>
            )}
            {res.status === 'cancelled' && (
              <button onClick={() => onDelete(res.id, res.name)} className={`p-2.5 inline-flex items-center justify-center hover:text-red-400 hover:bg-red-500/[0.08] border hover:border-red-500/20 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 ${lightMode ? 'text-gray-300 bg-gray-50/80 border-gray-200' : 'text-white/25 bg-white/[0.04] border-white/[0.07]'}`} title={t('delete')}>
                <Trash2 size={16} />
              </button>
            )}
          </div>
        )}
      </td>}
    </motion.tr>
  );
};

export const ReservationCard = ({ res, timeFilter, statusBadge, onUpdateStatus, onDelete, selectionMode, selected, onToggleSelection }: Props) => {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  const isTomorrow = isTomorrowDate(res.date);
  const NoteIcon = res.note ? getNoteIcon(res.note) : null;
  const dateStr = new Date(res.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <motion.div
      key={res.id}
      initial={false}
      animate={{ opacity: 1 }}
      onClick={selectionMode ? () => onToggleSelection?.(res.id) : undefined}
      className={`border-b px-4 py-4 transition-colors ${lightMode ? 'border-gray-200' : 'border-white/[0.05]'}${selectionMode ? 'cursor-pointer hover:bg-white/[0.03]' : ''} ${selected ? 'bg-white/[0.04]' : ''}`}
    >
      {/* Top row: name + status badge */}
      <div className="flex items-start justify-between mb-2.5">
        <div className="flex items-center gap-2">
          {selectionMode && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleSelection?.(res.id); }}
              className="flex-shrink-0 w-[22px] h-[22px] rounded-full flex items-center justify-center transition-all"
              style={{ background: selected ? '#007AFF' : (lightMode ? '#f3f4f6' : 'rgba(255,255,255,0.06)'), border: selected ? '2px solid #007AFF' : (lightMode ? '2px solid #d1d5db' : '2px solid rgba(255,255,255,0.2)') }}
              aria-pressed={selected}
            >
              {selected && (
                <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                  <path d="M1.5 4.5L4 7L9.5 1.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          )}
          <span className={`font-medium text-[15px] tracking-tight ${lightMode ? 'text-gray-900' : 'text-white'}`}>{res.name}</span>
          {isTomorrow && (
            <span className="text-[8px] font-bold text-gold bg-gold/10 px-1.5 py-0.5 rounded tracking-widest uppercase ring-1 ring-gold/30">
              {t('tomorrow')}
            </span>
          )}
        </div>
        {statusBadge(res.status)}
      </div>

      {/* Meta row */}
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] mb-2 ${lightMode ? 'text-gray-400' : 'text-white/45'}`}>
        <span className="flex items-center gap-1"><Phone size={10} className={lightMode ? 'text-gray-300' : 'text-white/25'} />{res.phone}</span>
        <span className={lightMode ? 'text-gray-200' : 'text-white/15'}>·</span>
        <span className="flex items-center gap-1"><Calendar size={10} className={lightMode ? 'text-gray-300' : 'text-white/25'} />{dateStr}</span>
        <span className={lightMode ? 'text-gray-200' : 'text-white/15'}>·</span>
        <span className="flex items-center gap-1"><Clock size={10} className={lightMode ? 'text-gray-300' : 'text-white/25'} />{res.time}</span>
        <span className={lightMode ? 'text-gray-200' : 'text-white/15'}>·</span>
        <span className="flex items-center gap-1"><Users size={10} className={lightMode ? 'text-gray-300' : 'text-white/25'} />{res.guests} {t('guests')}</span>
      </div>

      {/* Note */}
      {res.note && (
        <p className={`text-[11px] italic flex items-center gap-1.5 mb-2 ${lightMode ? 'text-gray-500' : 'text-white/50'}`}>
          {NoteIcon && <NoteIcon size={11} className="text-gold/50 shrink-0" />}
          {res.note}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2">
        {selectionMode ? (
          <div className={`inline-flex items-center gap-2 text-[11px] ${lightMode ? 'text-gray-500' : 'text-white/50'}`}>
            <span className={selected ? 'text-white' : 'text-white/40'}>
              {selected ? t('selected_items') : t('tap_to_select')}
            </span>
          </div>
        ) : (
          <>
            {res.status === 'pending' && timeFilter !== 'archive' && (
              <>
                <button onClick={() => onUpdateStatus(res.id, 'confirmed')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-green-400 border border-green-500/20 hover:bg-green-500/10 rounded-lg transition-colors">
                  <CheckCircle size={13} />{t('confirm')}
                </button>
                <button onClick={() => onUpdateStatus(res.id, 'cancelled')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-red-400 border border-red-500/20 hover:bg-red-500/10 rounded-lg transition-colors">
                  <XCircle size={13} />{t('cancel')}
                </button>
              </>
            )}
            {res.status === 'confirmed' && timeFilter !== 'archive' && (
              <button onClick={() => onUpdateStatus(res.id, 'cancelled')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-red-400 border border-red-500/20 hover:bg-red-500/10 rounded-lg transition-colors">
                <XCircle size={13} />{t('cancel')}
              </button>
            )}
            {(res.status === 'cancelled' || res.status === 'confirmed') && timeFilter !== 'archive' && (
              <button onClick={() => onDelete(res.id, res.name)}
                className={`w-7 h-7 flex items-center justify-center hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/[0.08] ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>
                <XCircle size={13} />
              </button>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
};
