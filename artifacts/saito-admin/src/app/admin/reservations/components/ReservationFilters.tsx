'use client';

import React from 'react';
import { Search, Trash2, XCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';

interface Props {
  timeFilter: 'today' | 'future' | 'archive';
  statusFilter: 'all' | 'pending' | 'confirmed' | 'cancelled';
  searchQuery: string;
  todayPendingCount: number;
  futurePendingCount: number;
  searchOpen: boolean;
  archiveSelectionMode: boolean;
  selectedArchiveCount: number;
  totalArchiveCount: number;
  onTimeFilter: (v: 'today' | 'future' | 'archive') => void;
  onStatusFilter: (v: 'all' | 'pending' | 'confirmed' | 'cancelled') => void;
  onSearch: (v: string) => void;
  onStartArchiveSelection: () => void;
  onDeleteSelectedArchive: () => void;
  onCancelArchiveSelection: () => void;
  onSelectAll: () => void;
}

const ReservationFilters = ({
  timeFilter, statusFilter, searchQuery,
  todayPendingCount, futurePendingCount, searchOpen,
  archiveSelectionMode, selectedArchiveCount, totalArchiveCount,
  onTimeFilter, onStatusFilter, onSearch,
  onStartArchiveSelection, onDeleteSelectedArchive, onCancelArchiveSelection, onSelectAll,
}: Props) => {
  const { t } = useLanguage();
  const { lightMode } = useTheme();

  const timeTabs = ['today', 'future', 'archive'] as const;
  const statusTabs = ['all', 'pending', 'confirmed', 'cancelled'] as const;

  const timeLabel = (tab: typeof timeTabs[number]) =>
    tab === 'today' ? t('tab_today') : tab === 'future' ? t('tab_future') : t('tab_archive');
  const statusLabel = (s: typeof statusTabs[number]) =>
    s === 'all' ? t('all') : s === 'pending' ? t('filter_pending') : s === 'confirmed' ? t('filter_confirmed') : t('filter_cancelled');

  return (
    <div className="w-full space-y-4">
      <div className={`rounded-[2.5rem] px-6 py-4 shadow-2xl transition-all border ${lightMode ? 'bg-white border-zinc-200 shadow-zinc-200/50' : 'bg-[#0f0f0f] border-white/5 shadow-black/40'}`}>
        <div className="flex flex-wrap items-center gap-4">
          
          {/* Time Filter */}
          <div className={`flex rounded-2xl p-1.5 border transition-all ${lightMode ? 'bg-zinc-100 border-zinc-200/50' : 'bg-white/5 border-white/10'}`}>
            {timeTabs.map((tab) => (
              <button
                key={tab}
                onClick={() => onTimeFilter(tab)}
                className={`relative px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                  timeFilter === tab 
                    ? (lightMode ? 'text-white' : 'text-white') 
                    : (lightMode ? 'text-zinc-500 hover:text-zinc-900' : 'text-white/40 hover:text-white/70')
                }`}
              >
                {timeFilter === tab && (
                  <motion.span
                    layoutId="timeIndicator"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    className={`absolute inset-0 rounded-xl shadow-lg ${lightMode ? 'bg-zinc-900' : 'bg-white/10 border border-white/20'}`}
                  />
                )}
                <span className="relative z-10">{timeLabel(tab)}</span>
                {tab === 'today' && todayPendingCount > 0 && (
                  <span className="relative z-10 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[9px] font-black shadow-sm">
                    {todayPendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className={`absolute left-4 top-1/2 -translate-y-1/2 ${lightMode ? 'text-zinc-400' : 'text-white/20'}`} size={16} />
            <input
              type="text" placeholder={`${t('search')}...`} value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              className={`w-full pl-12 pr-10 py-3 rounded-2xl text-sm font-bold outline-none border transition-all ${
                lightMode 
                  ? 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:bg-white focus:border-zinc-300' 
                  : 'bg-white/5 border-white/5 text-white placeholder:text-white/20 focus:border-white/20'
              }`}
            />
          </div>

          {/* Status Filter */}
          <div className={`flex rounded-2xl p-1.5 border transition-all ${lightMode ? 'bg-zinc-100/50 border-zinc-200/50' : 'bg-white/5 border-white/10'}`}>
            {statusTabs.map((status) => (
              <button
                key={status}
                onClick={() => onStatusFilter(status)}
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 ${
                  statusFilter === status
                    ? (lightMode ? 'bg-white text-zinc-900 shadow-md border border-zinc-200' : 'bg-white/20 text-white shadow-lg')
                    : (lightMode ? 'text-zinc-400 hover:text-zinc-600' : 'text-white/30 hover:text-white/60')
                }`}
              >
                {statusLabel(status)}
              </button>
            ))}
          </div>

          {/* Archive Clear */}
          {timeFilter === 'archive' && (
            <button
              onClick={onStartArchiveSelection}
              className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                lightMode 
                  ? 'bg-red-50 border-red-100 text-red-500 hover:bg-red-500 hover:text-white shadow-sm' 
                  : 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20 shadow-lg'
              }`}
            >
              <Trash2 size={14} />
              {t('select_archive')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReservationFilters;
