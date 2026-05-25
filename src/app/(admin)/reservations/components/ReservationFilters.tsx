'use client';

import React from 'react';
import { Search, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/LanguageContext';

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

        {/* Row 1 — Time: underline style, minimal */}
        <div className="flex items-center justify-evenly w-full max-w-full gap-2 sm:gap-6 px-3 border-b border-white/[0.05] overflow-hidden">
          {timeTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => onTimeFilter(tab)}
              className="relative flex items-center gap-1.5 py-4 px-2 shrink-0 transition-colors duration-300 group min-h-[52px]"
            >
              <span className={`text-[14px] font-medium tracking-wide transition-colors duration-300 ${timeFilter === tab ? 'text-white' : 'text-white/40 hover:text-white/70'}`}>
                {timeLabel(tab)}
              </span>
              {/* Underline indicator */}
              <span className={`absolute bottom-0 left-0 right-0 h-[2px] bg-gold rounded-full transition-all duration-300 ${timeFilter === tab ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-0 group-hover:opacity-30 group-hover:scale-x-50'}`} />
              {/* Badge counter */}
              {tab === 'today' && todayPendingCount > 0 && (
                <span className="flex items-center justify-center min-w-[20px] h-[20px] px-1 rounded-full bg-red-500/15 text-red-300 text-[10px] font-bold border border-red-500/25">
                  {todayPendingCount}
                </span>
              )}
              {tab === 'future' && futurePendingCount > 0 && (
                <span className="flex items-center justify-center min-w-[20px] h-[20px] px-1 rounded-full bg-gold/15 text-gold text-[10px] font-bold border border-gold/25">
                  {futurePendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Row 2 — Status: wrap, horizontal scroll yox */}
        <div className="px-3 py-3 border-b border-white/[0.04]">
          <div className="flex flex-wrap items-center justify-center gap-2 max-w-full">
            {statusTabs.map((status) => (
              <button
                key={status}
                onClick={() => onStatusFilter(status)}
                className={`relative px-3.5 py-2 rounded-full text-[12px] font-medium transition-colors duration-200 border ${
                  statusFilter === status
                    ? 'bg-white/[0.08] text-white border-white/[0.12]'
                    : 'bg-transparent text-white/50 border-transparent hover:text-white/70 hover:bg-white/[0.03]'
                }`}
              >
                {statusLabel(status)}
              </button>
            ))}
          </div>
        </div>

        {/* Arxiv təmizləmə */}
        {timeFilter === 'archive' && (
          <div className="px-3 pb-3 mt-2">
            {archiveSelectionMode ? (
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={onSelectAll}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white/60 hover:text-white transition-colors"
                  >
                    <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      selectedArchiveCount === totalArchiveCount && totalArchiveCount > 0
                        ? 'bg-blue-500 border-blue-500'
                        : 'border-white/30 bg-transparent'
                    }`}>
                      {selectedArchiveCount === totalArchiveCount && totalArchiveCount > 0 && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </span>
                    Hamısını seç ({totalArchiveCount})
                  </button>
                  <span className="text-xs text-white/40">{selectedArchiveCount} seçili</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onCancelArchiveSelection}
                    className="flex-1 rounded-xl border border-white/[0.08] bg-white/5 px-4 py-2 text-sm text-white/70 transition hover:bg-white/10"
                  >
                    {t('cancel_selection')}
                  </button>
                  <button
                    type="button"
                    onClick={onDeleteSelectedArchive}
                    disabled={selectedArchiveCount === 0}
                    className="flex-1 rounded-xl bg-red-500/90 px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-40 hover:bg-red-500"
                  >
                    {t('delete_selected')} {selectedArchiveCount > 0 ? `(${selectedArchiveCount})` : ''}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="mx-auto w-full max-w-[280px]">
                  <button
                    type="button"
                    onClick={onStartArchiveSelection}
                    className="mobile-tap-lift w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-medium tracking-wide text-red-300 border border-red-500/15 bg-white/5 hover:bg-white/10 transition-all duration-200"
                  >
                    <Trash2 size={16} strokeWidth={2} />
                    {t('select_archive')}
                  </button>
                </div>
                <p className="text-[11px] text-center text-white/40 mt-2 leading-relaxed px-2">
                  {t('clear_archive_help')}
                </p>
              </>
            )}
          </div>
        )}

        {/* Search — always below tabs on mobile */}
        <AnimatePresence>
          {searchOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div className="relative px-4 pt-2 pb-3">
                <Search className="absolute left-7 top-1/2 -translate-y-1/2 text-white/20" size={13} />
                <input
                  autoFocus
                  type="text"
                  placeholder={`${t('search')}...`}
                  value={searchQuery}
                  onChange={(e) => onSearch(e.target.value)}
                  className="w-full pl-8 pr-4 py-2.5 bg-white/[0.04] rounded-xl text-[13px] text-white placeholder:text-white/15 outline-none border border-white/[0.07] focus:border-white/20 transition-colors"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── DESKTOP layout (unchanged) ────────────────── */}
      <div className="hidden md:block">
        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.07] rounded-2xl px-5 py-3.5 shadow-2xl shadow-black/30">
          <div className="flex items-center gap-3">
            {/* Time filter tabs */}
            <div className="relative shrink-0 flex rounded-xl p-1 bg-white/[0.04] border border-white/[0.07]">
              {timeTabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => onTimeFilter(tab)}
                  className={`relative z-10 px-4 py-1.5 rounded-xl text-sm transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2 ${
                    timeFilter === tab ? 'text-white font-semibold' : 'text-white/50 hover:text-white/80'
                  }`}
                >
                  {timeFilter === tab && (
                    <motion.span
                      layoutId="desktopTimeIndicator"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      className="absolute inset-0 rounded-xl bg-white/[0.07] border border-white/[0.15]"
                    />
                  )}
                  <span className="relative z-10 whitespace-nowrap">{timeLabel(tab)}</span>
                  {/* Statik counter - CPU qızdırmır */}
                  {tab === 'today' && todayPendingCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500/20 text-red-300 text-[10px] font-black border border-red-500/30">
                      {todayPendingCount}
                    </span>
                  )}
                  {tab === 'future' && futurePendingCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-gold/20 text-gold text-[10px] font-black border border-gold/30">
                      {futurePendingCount}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" size={18} />
              <input
                type="text"
                placeholder={`${t('search')}...`}
                value={searchQuery}
                onChange={(e) => onSearch(e.target.value)}
                className="peer w-full pl-10 pr-4 py-2 bg-transparent border-b border-white/[0.07] rounded-xl text-white placeholder:text-white/20 focus:border-white/25 outline-none transition-all"
              />
            </div>

            {/* Clear archive */}
            {timeFilter === 'archive' && (
              archiveSelectionMode ? (
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={onSelectAll} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white/60 hover:text-white transition-colors whitespace-nowrap">
                    <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                      selectedArchiveCount === totalArchiveCount && totalArchiveCount > 0
                        ? 'bg-blue-500 border-blue-500'
                        : 'border-white/30'
                    }`}>
                      {selectedArchiveCount === totalArchiveCount && totalArchiveCount > 0 && (
                        <svg width="8" height="6" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </span>
                    Hamısını seç
                  </button>
                  <span className="text-xs text-white/40 shrink-0">{selectedArchiveCount}/{totalArchiveCount}</span>
                  <button onClick={onCancelArchiveSelection} className="rounded-xl border border-white/[0.08] bg-white/5 px-3 py-2 text-xs text-white/60 transition hover:bg-white/10 whitespace-nowrap">
                    {t('cancel_selection')}
                  </button>
                  <button onClick={onDeleteSelectedArchive} disabled={selectedArchiveCount === 0} className="rounded-xl bg-red-500/90 px-3 py-2 text-xs font-medium text-white transition disabled:opacity-40 hover:bg-red-500 whitespace-nowrap">
                    {t('delete_selected')} {selectedArchiveCount > 0 ? `(${selectedArchiveCount})` : ''}
                  </button>
                </div>
              ) : (
                <div className="relative group shrink-0">
                  <button onClick={onStartArchiveSelection} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-white/40 hover:text-red-400 border border-white/10 hover:border-red-500/30 hover:bg-red-500/5 transition-all hover:-translate-y-0.5 active:translate-y-0">
                    <Trash2 size={14} />
                    {t('select_archive')}
                  </button>
                  <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-max -translate-x-1/2 rounded-xl bg-black/80 px-3 py-2 text-[11px] text-gold/90 border border-gold/20 shadow-[0_18px_60px_rgba(0,0,0,0.55)] opacity-0 translate-y-1 transition-all group-hover:opacity-100 group-hover:translate-y-0">
                    {t('clear_archive_help')}
                  </div>
                </div>
              )
            )}

            {/* Status filter - sadə dizayn */}
            <div className="flex rounded-xl p-1 bg-white/[0.03] border border-white/[0.06] shrink-0">
              {statusTabs.map((status) => (
                <button
                  key={status}
                  onClick={() => onStatusFilter(status)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                    statusFilter === status
                      ? 'bg-white/10 text-white'
                      : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                  }`}
                >
                  {statusLabel(status)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default ReservationFilters;
