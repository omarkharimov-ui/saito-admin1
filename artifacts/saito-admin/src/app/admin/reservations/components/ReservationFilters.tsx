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
    <div className="w-full space-y-0">

      {/* ── MOBILE layout ─────────────────────────────── */}
      <div className="md:hidden space-y-0">
        <div className={`flex items-center justify-evenly w-full px-3 border-b overflow-hidden ${lightMode ? 'border-zinc-200 bg-white' : 'border-white/[0.05] bg-transparent'}`}>
          {timeTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => onTimeFilter(tab)}
              className="relative flex items-center gap-1.5 py-4 px-2 shrink-0 transition-colors duration-300 group min-h-[52px]"
            >
              <span className={`text-[14px] font-bold tracking-wide transition-colors duration-300 ${timeFilter === tab ? (lightMode ? 'text-zinc-900' : 'text-white') : (lightMode ? 'text-zinc-400' : 'text-white/40')}`}>
                {timeLabel(tab)}
              </span>
              <span className={`absolute bottom-0 left-0 right-0 h-[2px] bg-gold rounded-full transition-all duration-300 ${timeFilter === tab ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-0'}`} />
            </button>
          ))}
        </div>

        <div className={`px-3 py-3 border-b ${lightMode ? 'border-zinc-100 bg-[#fcfcfd]' : 'border-white/[0.04]'}`}>
          <div className="flex flex-wrap items-center justify-center gap-2 max-w-full">
            {statusTabs.map((status) => (
              <button
                key={status}
                onClick={() => onStatusFilter(status)}
                className={`relative px-3.5 py-2 rounded-full text-[12px] font-black tracking-tight transition-all duration-200 border ${
                  statusFilter === status
                    ? (lightMode ? 'bg-zinc-900 text-white border-zinc-900 shadow-md' : 'bg-white/[0.12] text-white border-white/[0.15]')
                    : (lightMode ? 'bg-zinc-100 text-zinc-500 border-transparent' : 'bg-transparent text-white/50 border-transparent')
                }`}
              >
                {statusLabel(status)}
              </button>
            ))}
          </div>
        </div>

        {/* Search on mobile */}
        <AnimatePresence>
          {searchOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="relative px-4 pt-2 pb-3">
                <Search className={`absolute left-7 top-1/2 -translate-y-1/2 ${lightMode ? 'text-zinc-400' : 'text-white/20'}`} size={13} />
                <input
                  type="text" placeholder={`${t('search')}...`} value={searchQuery}
                  onChange={(e) => onSearch(e.target.value)}
                  className={`w-full pl-8 pr-4 py-2.5 rounded-xl text-[13px] outline-none border transition-all ${lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:border-zinc-300' : 'bg-white/[0.04] text-white placeholder:text-white/15 border-white/[0.07] focus:border-white/20'}`}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── DESKTOP layout ─────────────────────────────── */}
      <div className="hidden md:block">
        <div className={`rounded-[2rem] px-5 py-4 shadow-2xl transition-all border ${lightMode ? 'bg-white border-zinc-200 shadow-zinc-200/50' : 'bg-white/[0.03] backdrop-blur-xl border-white/[0.07] shadow-black/30'}`}>
          <div className="flex items-center gap-4">
            {/* Time filter tabs */}
            <div className={`relative shrink-0 flex rounded-2xl p-1.5 border transition-all ${lightMode ? 'bg-zinc-100 border-zinc-200/50' : 'bg-white/[0.04] border-white/[0.07]'}`}>
              {timeTabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => onTimeFilter(tab)}
                  className={`relative z-10 px-5 py-2.5 rounded-xl text-[13px] font-black transition-all flex items-center gap-2 ${
                    timeFilter === tab ? (lightMode ? 'text-white' : 'text-white') : (lightMode ? 'text-zinc-500 hover:text-zinc-800' : 'text-white/40 hover:text-white/70')
                  }`}
                >
                  {timeFilter === tab && (
                    <motion.span
                      layoutId="desktopTimeIndicator"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      className={`absolute inset-0 rounded-xl border shadow-lg ${lightMode ? 'bg-zinc-900 border-zinc-900 shadow-zinc-900/20' : 'bg-white/[0.07] border-white/[0.15]'}`}
                    />
                  )}
                  <span className="relative z-10 whitespace-nowrap uppercase tracking-wider">{timeLabel(tab)}</span>
                  {tab === 'today' && todayPendingCount > 0 && (
                    <span className="relative z-10 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[9px] font-black shadow-sm">
                      {todayPendingCount}
                    </span>
                  )}
                  {tab === 'future' && futurePendingCount > 0 && (
                    <span className="relative z-10 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-gold text-black text-[9px] font-black shadow-sm">
                      {futurePendingCount}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative flex-1 group">
              <Search className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${lightMode ? 'text-zinc-400 group-focus-within:text-zinc-900' : 'text-white/25 group-focus-within:text-white'}`} size={18} />
              <input
                type="text" placeholder={`${t('search')}...`} value={searchQuery}
                onChange={(e) => onSearch(e.target.value)}
                className={`peer w-full pl-12 pr-10 py-3 rounded-2xl text-sm font-medium outline-none transition-all border ${lightMode ? 'bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:border-zinc-300 focus:shadow-inner' : 'bg-transparent border-white/[0.07] text-white placeholder:text-white/20 focus:border-white/25'}`}
              />
              {searchQuery && (
                <button onClick={() => onSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100 transition-opacity">
                  <XCircle size={16} />
                </button>
              )}
            </div>

            {/* Status filter */}
            <div className={`flex rounded-2xl p-1.5 border shrink-0 transition-all ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/[0.03] border-white/[0.06]'}`}>
              {statusTabs.map((status) => (
                <button
                  key={status}
                  onClick={() => onStatusFilter(status)}
                  className={`px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-200 ${
                    statusFilter === status
                      ? (lightMode ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200' : 'bg-white/10 text-white shadow-lg shadow-white/5')
                      : (lightMode ? 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100/50' : 'text-white/30 hover:text-white/60 hover:bg-white/5')
                  }`}
                >
                  {statusLabel(status)}
                </button>
              ))}
            </div>

            {/* Arxiv Delete - Only visible if timeFilter is archive */}
            {timeFilter === 'archive' && !archiveSelectionMode && (
              <button
                onClick={onStartArchiveSelection}
                className={`shrink-0 flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${lightMode ? 'bg-red-50 border-red-100 text-red-500 hover:bg-red-500 hover:text-white shadow-sm' : 'bg-red-500/5 border-red-500/20 text-red-400 hover:bg-red-500/20 shadow-lg shadow-red-500/5'}`}
              >
                <Trash2 size={14} />
                {t('select_archive')}
              </button>
            )}
          </div>

          {/* Archive Selection Mode Actions */}
          <AnimatePresence>
            {timeFilter === 'archive' && archiveSelectionMode && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className={`mt-3 pt-3 border-t flex items-center justify-between ${lightMode ? 'border-zinc-100' : 'border-white/[0.05]'}`}>
                  <div className="flex items-center gap-3">
                    <button onClick={onSelectAll} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border ${lightMode ? 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50' : 'bg-white/5 border-white/10 text-white/60 hover:text-white'}`}>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${selectedArchiveCount === totalArchiveCount && totalArchiveCount > 0 ? 'bg-blue-500 border-blue-500' : (lightMode ? 'border-zinc-300' : 'border-white/30')}`}>
                        {selectedArchiveCount === totalArchiveCount && totalArchiveCount > 0 && (
                          <svg width="8" height="6" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        )}
                      </div>
                      Hamısını seç ({totalArchiveCount})
                    </button>
                    <span className={`text-xs font-medium ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>{selectedArchiveCount} seçilib</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={onCancelArchiveSelection} className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${lightMode ? 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}>
                      {t('cancel_selection')}
                    </button>
                    <button onClick={onDeleteSelectedArchive} disabled={selectedArchiveCount === 0} className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-red-500 text-white shadow-lg shadow-red-500/20 disabled:opacity-30 transition-all hover:scale-105 active:scale-95">
                      {t('delete_selected')}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

    </div>
  );
};

export default ReservationFilters;
