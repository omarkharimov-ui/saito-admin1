'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, Users, Calendar, Timer, ChevronRight, Play, Square,
  RefreshCw, Filter, X, Activity, Wallet, ArrowUpDown, DollarSign
} from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { toast } from '@/lib/toast';
import GoldSelect from '@/components/GoldSelect';
import { useFirstLoad } from '@/hooks/useFirstLoad';
import { EmptyState } from '@/components/ui/primitives';
import Link from 'next/link';

type Shift = {
  id: string;
  staff_id: string;
  report_date: string;
  opened_at: string;
  closed_at?: string | null;
  starting_cash: number;
  expected_cash: number;
  actual_cash?: number | null;
  difference?: number | null;
  notes?: string | null;
  created_at: string;
};

type StaffMember = {
  id: string;
  name: string;
  role: string;
};

const PERIODS = [
  { value: 'today', label: 'Bu gün' },
  { value: 'week', label: 'Bu həftə' },
  { value: 'month', label: 'Bu ay' },
  { value: 'all', label: 'Bütün' },
];

const STATUS_FILTERS = [
  { value: '', label: 'Bütün' },
  { value: 'open', label: 'Aktiv' },
  { value: 'closed', label: 'Bağlanmış' },
];

export default function ShiftsPage() {
  const router = useRouter();
  const { lightMode } = useTheme();
  const { t } = useLanguage();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('week');
  const [statusFilter, setStatusFilter] = useState('');
  const [staffFilter, setStaffFilter] = useState('');
  const [sortBy, setSortBy] = useState('opened_at_desc');
  const [clockAction, setClockAction] = useState<'in' | 'out' | null>(null);
  const [showCloseSheet, setShowCloseSheet] = useState(false);
  const [closingShift, setClosingShift] = useState<Shift | null>(null);
  const [actualCash, setActualCash] = useState('');
  const [closing, setClosing] = useState(false);

  const isFirstLoad = useFirstLoad(400, loading);

  const fetchShifts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (period) params.set('period', period);
      if (statusFilter) params.set('active', statusFilter === 'open' ? 'true' : 'false');
      if (staffFilter) params.set('staff_id', staffFilter);

      const res = await fetch(`/api/shifts?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setShifts(Array.isArray(data) ? data : []);
      } else {
        setShifts([]);
      }
    } catch {
      setShifts([]);
    } finally {
      setLoading(false);
    }
  }, [period, statusFilter, staffFilter]);

  const fetchStaff = useCallback(async () => {
    try {
      const res = await fetch('/api/staff');
      if (res.ok) {
        const data = await res.json();
        setStaff(Array.isArray(data) ? data : []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const handleClockIn = async () => {
    setClockAction('in');
    try {
      const res = await fetch('/api/pos/staff/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'in' }),
      });
      if (res.ok) {
        toast.success('Smena açıldı');
        fetchShifts();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Smena açıla bilmədi');
      }
    } catch {
      toast.error('Xəta baş verdi');
    } finally {
      setClockAction(null);
    }
  };

  const handleClockOut = async () => {
    setClockAction('out');
    try {
      const res = await fetch('/api/pos/staff/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'out' }),
      });
      if (res.ok) {
        toast.success('Smena bağlandı');
        fetchShifts();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Smena bağlana bilmədi');
      }
    } catch {
      toast.error('Xəta baş verdi');
    } finally {
      setClockAction(null);
    }
  };

  const handleCloseShift = async () => {
    if (!closingShift || !actualCash) return;

    setClosing(true);
    try {
      const res = await fetch('/api/pos/staff/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'out',
          actual_cash: parseFloat(actualCash),
        }),
      });

      if (res.ok) {
        toast.success('Smena bağlandı');
        setShowCloseSheet(false);
        setActualCash('');
        setClosingShift(null);
        fetchShifts();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Smena bağlana bilmədi');
      }
    } catch {
      toast.error('Xəta baş verdi');
    } finally {
      setClosing(false);
    }
  };

  const formatDuration = (start: string, end?: string | null) => {
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : new Date();
    const diff = endDate.getTime() - startDate.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours === 0 && minutes === 0) return '< 1 dəq';
    return `${hours}s ${minutes}d`;
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('az-AZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const getStaffName = useCallback((staffId: string) => {
    return staff.find(s => s.id === staffId)?.name || 'Naməlum';
  }, [staff]);

  const sortedShifts = useMemo(() => {
    const sorted = [...shifts];
    switch (sortBy) {
      case 'opened_at_desc':
        sorted.sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime());
        break;
      case 'opened_at_asc':
        sorted.sort((a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime());
        break;
      case 'duration_desc':
        sorted.sort((a, b) => {
          const durA = a.closed_at ? new Date(a.closed_at).getTime() - new Date(a.opened_at).getTime() : 0;
          const durB = b.closed_at ? new Date(b.closed_at).getTime() - new Date(b.opened_at).getTime() : 0;
          return durB - durA;
        });
        break;
      case 'staff_asc':
        sorted.sort((a, b) => getStaffName(a.staff_id).localeCompare(getStaffName(b.staff_id)));
        break;
    }
    return sorted;
  }, [shifts, sortBy, getStaffName]);

  const activeShift = shifts.find(s => !s.closed_at);

  const stats = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayStr = today.toISOString();

    const todayShifts = shifts.filter(s => s.opened_at >= todayStr);
    const activeShifts = shifts.filter(s => !s.closed_at);
    const closedShifts = shifts.filter(s => s.closed_at);

    const totalDuration = closedShifts.reduce((sum, s) => {
      if (!s.closed_at) return sum;
      return sum + (new Date(s.closed_at).getTime() - new Date(s.opened_at).getTime());
    }, 0);

    const totalCash = closedShifts.reduce((sum, s) => sum + (s.actual_cash || 0), 0);
    const totalDifference = closedShifts.reduce((sum, s) => sum + (s.difference || 0), 0);

    return {
      todayShifts: todayShifts.length,
      activeShifts: activeShifts.length,
      totalShifts: shifts.length,
      totalHours: Math.round(totalDuration / (1000 * 60 * 60) * 10) / 10,
      totalCash,
      totalDifference,
    };
  }, [shifts]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[var(--theme-text)]">Smenalar</h1>
          <p className="text-sm text-[var(--theme-text-secondary)] mt-1">
            {stats.totalShifts} smena · {stats.activeShifts} aktiv · Bu gün {stats.todayShifts}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!activeShift ? (
            <button
              onClick={handleClockIn}
              disabled={clockAction === 'in'}
              className="flex items-center gap-2 px-5 py-3 bg-emerald-500 text-white text-xs font-bold rounded-2xl hover:bg-emerald-600 transition-all disabled:opacity-50 shadow-[0_10px_28px_rgba(0,0,0,0.12)]"
            >
              {clockAction === 'in' ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Play size={14} />
              )}
              Smena Başlat
            </button>
          ) : (
            <button
              onClick={() => {
                setClosingShift(activeShift);
                setShowCloseSheet(true);
              }}
              disabled={clockAction === 'out'}
              className="flex items-center gap-2 px-5 py-3 bg-rose-500 text-white text-xs font-bold rounded-2xl hover:bg-rose-600 transition-all disabled:opacity-50 shadow-[0_10px_28px_rgba(0,0,0,0.12)]"
            >
              {clockAction === 'out' ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Square size={14} />
              )}
              Smenanı Bitir
            </button>
          )}
        </div>
      </div>

      {activeShift && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-black uppercase tracking-widest text-emerald-400">Aktiv Smena</span>
            <span className="text-xs text-emerald-400/60 ml-auto">
              {formatDuration(activeShift.opened_at)}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] mb-1">İşçi</p>
              <Link href={`/admin/staff/${activeShift.staff_id}`} className="text-sm font-bold text-[var(--theme-text)] hover:text-emerald-400 transition-colors">
                {getStaffName(activeShift.staff_id)}
              </Link>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] mb-1">Başlanğıc</p>
              <p className="text-sm font-bold text-[var(--theme-text)]">{formatTime(activeShift.opened_at)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] mb-1">Gözlənilən nağd</p>
              <p className="text-sm font-bold text-[var(--theme-text)]">₼{(activeShift.expected_cash || 0).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] mb-1">Tarix</p>
              <p className="text-sm font-bold text-[var(--theme-text)]">{formatDate(activeShift.opened_at)}</p>
            </div>
          </div>
        </motion.div>
      )}

      <div className="bg-[var(--theme-surface-muted)] border border-[var(--theme-border)] rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)]" />
            <select
              value={staffFilter}
              onChange={e => setStaffFilter(e.target.value)}
              className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[var(--theme-text)] outline-none focus:border-[var(--theme-border-strong)]"
            >
              <option value="">Bütün işçilər</option>
              {staff.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <GoldSelect
            value={period}
            options={PERIODS}
            onChange={(val) => setPeriod(val as string)}
          />
          <GoldSelect
            value={statusFilter}
            options={STATUS_FILTERS}
            onChange={(val) => setStatusFilter(val as string)}
          />
          <GoldSelect
            value={sortBy}
            options={[
              { value: 'opened_at_desc', label: 'Tarix (yenı-eskı)' },
              { value: 'opened_at_asc', label: 'Tarix (eskı-yenı)' },
              { value: 'duration_desc', label: 'Saat (cox-az)' },
              { value: 'staff_asc', label: 'İşçi (A-Z)' },
            ]}
            onChange={(val) => setSortBy(val as string)}
          />
        </div>
      </div>

      {isFirstLoad ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-[var(--theme-surface-muted)] border border-[var(--theme-border)] rounded-2xl p-5 animate-pulse">
              <div className="h-5 bg-white/5 rounded w-1/3 mb-3" />
              <div className="h-4 bg-white/5 rounded w-full mb-2" />
              <div className="h-4 bg-white/5 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : sortedShifts.length === 0 ? (
        <EmptyState
          icon={<Clock size={48} />}
          title="Smena tapılmadı"
          description="Hələ heç bir smena qeydi yoxdur"
        />
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {sortedShifts.map((shift, idx) => {
              const isOpen = !shift.closed_at;
              const staffName = getStaffName(shift.staff_id);

              return (
                <motion.div
                  key={shift.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, delay: idx * 0.02 }}
                  className={`bg-[var(--theme-surface-muted)] border rounded-2xl p-5 transition-all hover:border-[var(--theme-border-strong)] ${
                    isOpen ? 'border-emerald-500/30' : 'border-[var(--theme-border)]'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Link
                          href={`/admin/staff/${shift.staff_id}`}
                          className="text-sm font-bold text-[var(--theme-text)] hover:text-emerald-400 transition-colors"
                        >
                          {staffName}
                        </Link>
                        {isOpen && (
                          <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Aktiv
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--theme-text-secondary)]">
                        <div className="flex items-center gap-1">
                          <Calendar size={12} />
                          {formatDate(shift.opened_at)}
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock size={12} />
                          {formatTime(shift.opened_at)}
                          {shift.closed_at && ` - ${formatTime(shift.closed_at)}`}
                        </div>
                        <div className="flex items-center gap-1">
                          <Timer size={12} />
                          {formatDuration(shift.opened_at, shift.closed_at)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-[var(--theme-text)] tabular-nums">
                        ₼{(shift.actual_cash || shift.expected_cash || 0).toFixed(2)}
                      </p>
                      {shift.difference !== undefined && shift.difference !== null && (
                        <p className={`text-xs font-bold ${shift.difference >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {shift.difference >= 0 ? '+' : ''}{shift.difference.toFixed(2)}
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Close Shift Sheet */}
      <AnimatePresence>
        {showCloseSheet && closingShift && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-xl"
              onClick={() => {
                setShowCloseSheet(false);
                setActualCash('');
                setClosingShift(null);
              }}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed right-0 top-0 bottom-0 z-[101] w-full max-w-lg bg-[var(--theme-surface)] border-l border-[var(--theme-border)] shadow-2xl flex flex-col"
            >
              <div className="flex items-center justify-between p-6 border-b border-[var(--theme-border)]">
                <div>
                  <h2 className="text-lg font-black text-[var(--theme-text)]">Smenanı Bağla</h2>
                  <p className="text-xs text-[var(--theme-text-muted)] mt-1">
                    Nağd məbləği daxil edin
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowCloseSheet(false);
                    setActualCash('');
                    setClosingShift(null);
                  }}
                  className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--theme-surface-soft)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-[var(--theme-border)]">
                    <span className="text-xs text-[var(--theme-text-secondary)]">İşçi</span>
                    <span className="text-sm font-bold text-[var(--theme-text)]">{getStaffName(closingShift.staff_id)}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-[var(--theme-border)]">
                    <span className="text-xs text-[var(--theme-text-secondary)]">Başlanğıc</span>
                    <span className="text-sm font-bold text-[var(--theme-text)]">{formatTime(closingShift.opened_at)}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-[var(--theme-border)]">
                    <span className="text-xs text-[var(--theme-text-secondary)]">Müddət</span>
                    <span className="text-sm font-bold text-[var(--theme-text)]">{formatDuration(closingShift.opened_at)}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-semibold">
                    <DollarSign size={10} className="text-gold/70" /> Həqiqi nağd (₼)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={actualCash}
                    onChange={e => setActualCash(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] px-4 py-2.5 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none rounded-xl transition-all"
                  />
                </div>

                {actualCash && !isNaN(parseFloat(actualCash)) && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-2"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--theme-text-secondary)]">Gözlənilən</span>
                      <span className="font-bold text-[var(--theme-text)]">₼{(closingShift.expected_cash || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--theme-text-secondary)]">Həqiqi</span>
                      <span className="font-bold text-[var(--theme-text)]">₼{parseFloat(actualCash).toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm pt-2 border-t border-emerald-500/20">
                      <span className="text-[var(--theme-text-secondary)]">Fərq</span>
                      <span className={`font-black tabular-nums ${
                        (parseFloat(actualCash) - (closingShift.expected_cash || 0)) >= 0
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                      }`}>
                        {((parseFloat(actualCash) - (closingShift.expected_cash || 0)) >= 0 ? '+' : '') + (parseFloat(actualCash) - (closingShift.expected_cash || 0)).toFixed(2)}
                      </span>
                    </div>
                  </motion.div>
                )}
              </div>

              <div className="p-6 border-t border-[var(--theme-border)] flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setShowCloseSheet(false);
                    setActualCash('');
                    setClosingShift(null);
                  }}
                  className="px-5 py-2.5 text-xs text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-colors rounded-lg hover:bg-[var(--theme-surface-muted)]"
                >
                  Ləğv Et
                </button>
                <button
                  onClick={handleCloseShift}
                  disabled={closing || !actualCash || parseFloat(actualCash) < 0}
                  className="flex items-center gap-2 bg-[var(--theme-surface)] text-[var(--theme-text)] px-6 py-2.5 rounded-2xl font-bold text-xs tracking-wide transition-all disabled:opacity-40 shadow-[0_10px_28px_rgba(0,0,0,0.12)] hover:bg-[var(--theme-panel)]"
                >
                  {closing ? (
                    <div className="w-3.5 h-3.5 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Square size={12} />
                  )}
                  Smenanı Bağla
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
