'use client';

import React from 'react';
import { Search, Trash2, CheckSquare, XCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { DragTabSwitcher } from '@/components/ui/DragTabSwitcher';

// 2026-09-26 (Task 55): the filter bar loses its heavy rounded "card" shell and
// becomes a flat hairline toolbar that sits above the reservation book. All
// behaviour (time tabs, status tabs, search, archive selection mode) is intact;
// the archive selection bar now actually renders (its props were already wired
// by the page but never surfaced — the mode had no way to confirm or cancel).

interface Props {
  timeFilter: 'today' | 'future' | 'archive';
  statusFilter: 'all' | 'pending' | 'confirmed' | 'cancelled' | 'expired';
  searchQuery: string;
  todayPendingCount: number;
  futurePendingCount: number;
  searchOpen: boolean;
  archiveSelectionMode: boolean;
  selectedArchiveCount: number;
  totalArchiveCount: number;
  onTimeFilter: (v: 'today' | 'future' | 'archive') => void;
  onStatusFilter: (v: 'all' | 'pending' | 'confirmed' | 'cancelled' | 'expired') => void;
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

  const statusTabs = ['all', 'pending', 'confirmed', 'cancelled', 'expired'] as const;

  const timeLabel = (tab: 'today' | 'future' | 'archive') =>
    tab === 'today' ? t('tab_today') : tab === 'future' ? t('tab_future') : t('tab_archive');
  const statusLabel = (s: typeof statusTabs[number]) =>
    s === 'all' ? t('all') : s === 'pending' ? t('filter_pending') : s === 'confirmed' ? t('filter_confirmed') : s === 'cancelled' ? t('filter_cancelled') : t('resv_status_expired');

  const ghost = lightMode
    ? 'border-zinc-200 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100'
    : 'border-white/10 text-white/40 hover:text-white/80 hover:bg-white/5';

  return (
    <div className={`w-full flex flex-col gap-3 pb-3 border-b ${lightMode ? 'border-zinc-200' : 'border-white/[0.06]'}`}>
      <div className="flex flex-wrap items-center gap-3">
        {/* Time filter */}
        <DragTabSwitcher
          items={[
            { id: 'today', label: timeLabel('today'), badge: todayPendingCount },
            { id: 'future', label: timeLabel('future'), badge: futurePendingCount },
            { id: 'archive', label: timeLabel('archive') },
          ]}
          value={timeFilter}
          onChange={(v) => onTimeFilter(v as 'today' | 'future' | 'archive')}
        />

        {/* Search */}
        {searchOpen && (
          <div className="relative flex-1 min-w-[180px]">
            <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${lightMode ? 'text-zinc-400' : 'text-white/20'}`} size={15} />
            <input
              type="text"
              placeholder={`${t('search')}...`}
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              className={`w-full pl-10 pr-4 py-2.5 rounded-2xl text-sm font-bold outline-none border transition-all ${
                lightMode
                  ? 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:bg-white focus:border-zinc-300'
                  : 'bg-white/5 border-white/5 text-white placeholder:text-white/20 focus:border-white/20'
              }`}
            />
          </div>
        )}

        {/* Status filter */}
        <div className="flex items-center gap-1 flex-wrap">
          {statusTabs.map((status) => (
            <button
              key={status}
              onClick={() => onStatusFilter(status)}
              className={`px-3.5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all duration-200 ${
                statusFilter === status
                  ? (lightMode ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-900 border-white')
                  : ghost
              }`}
            >
              {statusLabel(status)}
            </button>
          ))}
        </div>

        {/* Archive clear */}
        {timeFilter === 'archive' && !archiveSelectionMode && (
          <button
            onClick={onStartArchiveSelection}
            className={`ml-auto flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${
              lightMode
                ? 'bg-red-50 border-red-100 text-red-500 hover:bg-red-500 hover:text-white'
                : 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'
            }`}
          >
            <Trash2 size={13} />
            {t('select_archive')}
          </button>
        )}
      </div>

      {/* Archive selection bar — select all / delete selected / cancel */}
      {archiveSelectionMode && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 26 }}
          className="flex flex-wrap items-center gap-2"
        >
          <span className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full border text-[10px] font-black uppercase tracking-widest tabular-nums ${
            lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-600' : 'bg-white/5 border-white/10 text-white/60'
          }`}>
            <CheckSquare size={13} />
            {selectedArchiveCount}/{totalArchiveCount} {t('resv_selected')}
          </span>
          <button
            onClick={onSelectAll}
            className={`px-3.5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${ghost}`}
          >
            {t('resv_select_all')}
          </button>
          <button
            onClick={onDeleteSelectedArchive}
            disabled={selectedArchiveCount === 0}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all disabled:opacity-30 ${
              lightMode
                ? 'bg-red-50 border-red-100 text-red-500 hover:bg-red-500 hover:text-white'
                : 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'
            }`}
          >
            <Trash2 size={13} />
            {t('delete_selected')}
          </button>
          <button
            onClick={onCancelArchiveSelection}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${ghost}`}
          >
            <XCircle size={13} />
            {t('cancel_selection')}
          </button>
        </motion.div>
      )}
    </div>
  );
};

export default ReservationFilters;
