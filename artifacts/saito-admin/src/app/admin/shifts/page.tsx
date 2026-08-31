'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, Users, DollarSign, AlertTriangle, CheckCircle, XCircle,
  Filter, Calendar, ChevronRight, Play, Square, Coffee
} from 'lucide-react';
import { toast } from '@/lib/toast';

type Shift = {
  id: string;
  staff_id: string;
  staff_name: string;
  staff_role: string;
  opened_at: string;
  closed_at: string | null;
  duration_minutes: number;
  starting_cash: number;
  expected_cash: number;
  actual_cash: number | null;
  difference: number | null;
  orders_count: number;
  status: 'active' | 'closed' | 'force_closed';
};

type ShiftKpis = {
  active_shifts: number;
  total_hours_today: number;
  total_orders: number;
  total_variance: number;
  avg_shift_duration: number;
};

export default function ShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [kpis, setKpis] = useState<ShiftKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'closed' | 'variances'>('all');
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);

  const fetchShifts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/shifts');
      if (res.ok) {
        const data = await res.json();
        setShifts(data.shifts || []);
        setKpis(data.kpis || {});
      }
    } catch { toast.error('Failed to shifts'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchShifts(); }, [fetchShifts]);

  const filteredShifts = shifts.filter(s => {
    if (filter === 'active') return s.status === 'active';
    if (filter === 'closed') return s.status === 'closed';
    if (filter === 'variances') return s.difference !== null && Math.abs(s.difference) > 5;
    return true;
  });

  const activeShifts = shifts.filter(s => s.status === 'active');

  const handleForceClose = async (shift: Shift) => {
    if (!confirm(`Force close shift for ${shift.staff_name}?`)) return;
    try {
      const res = await fetch(`/api/shifts/${shift.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Force closed by admin' }),
      });
      if (res.ok) { toast.success('Shift closed'); fetchShifts(); }
      else toast.error('Failed');
    } catch { toast.error('Error'); }
  };

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-black text-[var(--theme-text)] tracking-tight">SHIFTS</h1>
          <p className="text-[10px] text-[var(--theme-text-muted)] mt-0.5 uppercase tracking-widest">
            {kpis?.active_shifts ?? 0} Active · {kpis?.total_orders ?? 0} Orders Today
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 flex-shrink-0">
        <KpiCard label="Active Shifts" value={kpis?.active_shifts ?? 0} icon={Play} accent="emerald" />
        <KpiCard label="Total Hours" value={`${Math.round((kpis?.total_hours_today ?? 0) / 60 * 10) / 10}h`} icon={Clock} />
        <KpiCard label="Total Orders" value={kpis?.total_orders ?? 0} icon={Users} />
        <KpiCard label="Cash Variance" value={`₼${kpis?.total_variance ?? 0}`} icon={AlertTriangle" accent={kpis?.total_variance && Math.abs(kpis.total_variance) > 20 ? 'amber' : undefined} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <FilterPill active={filter === 'all'} onClick={() => setFilter('all')}>All ({shifts.length})</FilterPill>
          <FilterPill active={filter === 'active'} onClick={() => setFilter('active')} count={activeShifts.length} accent="emerald">Active</FilterPill>
          <FilterPill active={filter === 'closed'} onClick={() => setFilter('closed')}>Closed</FilterPill>
          <FilterPill active={filter === 'variances'} onClick={() => setFilter('variances')} accent="amber">Variances</FilterPill>
        </div>
      </div>

      {/* Shifts Table */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.02)' }} />
            ))}
          </div>
        ) : filteredShifts.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Clock size={48} className="mx-auto text-[var(--theme-text-muted)] mb-4" />
              <p className="text-sm text-[var(--theme-text-secondary)]">No shifts found</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {filteredShifts.map((shift, idx) => (
                <ShiftRow key={shift.id} shift={shift} index={idx}
                  onClick={() => setSelectedShift(shift)}
                  onForceClose={() => handleForceClose(shift)} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Shift Detail */}
      <AnimatePresence>
        {selectedShift && <ShiftDetailPanel shift={selectedShift} onClose={() => setSelectedShift(null)} />}
      </AnimatePresence>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, accent }: { label: string; value: any; icon: any; accent?: 'emerald' | 'amber' }) {
  const style = accent === 'emerald' ? { background: 'rgba(16, 185, 129, 0.05)', borderColor: 'rgba(16, 185, 129, 0.15)' }
    : accent === 'amber' ? { background: 'rgba(245, 158, 11, 0.05)', borderColor: 'rgba(245, 158, 11, 0.15)' }
    : { background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' };
  return (
    <div className="p-4 rounded-2xl border" style={style}>
      <Icon size={16} className="text-[var(--theme-text-muted)] mb-2" />
      <p className="text-xl font-bold text-[var(--theme-text)] tabular-nums">{value}</p>
      <p className="text-[9px] text-[var(--theme-text-muted)] uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  );
}

function FilterPill({ children, active, onClick, count, accent }: {
  children: React.ReactNode; active: boolean; onClick: () => void; count?: number; accent?: 'emerald' | 'amber';
}) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${active ? 'bg-[var(--theme-text)] text-[var(--theme-surface)] shadow-md' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] hover:bg-white/5'} ${accent === 'emerald' && active ? '!bg-emerald-500 !text-white' : ''} ${accent === 'amber' && active ? '!bg-amber-500 !text-white' : ''}`}>
      {children}
      {count !== undefined && <span className={`ml-1.5 tabular-nums ${active ? 'opacity-80' : 'opacity-50'}`}>{count}</span>}
    </button>
  );
}

function ShiftRow({ shift, index, onClick, onForceClose }: {
  shift: Shift; index: number; onClick: () => void; onForceClose: () => void;
}) {
  const isActive = shift.status === 'active';
  const hasVariance = shift.difference !== null && Math.abs(shift.difference) > 5;

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, delay: index * 0.02 }}
      className="group rounded-xl p-4 cursor-pointer transition-all"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}>
      <div className="flex items-center gap-4" onClick={onClick}>
        {/* Status */}
        <div className="min-w-[100px]">
          {isActive ? (
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span className="text-[10px] font-semibold text-emerald-400">ACTIVE</span>
            </div>
          ) : (
            <span className="text-[10px] text-zinc-400">{shift.status === 'force_closed' ? 'FORCE CLOSED' : 'CLOSED'}</span>
          )}
        </div>

        {/* Staff */}
        <div className="min-w-[180px]">
          <p className="text-sm font-medium text-[var(--theme-text)]">{shift.staff_name}</p>
          <p className="text-[10px] text-[var(--theme-text-muted)]">{shift.staff_role}</p>
        </div>

        {/* Time */}
        <div className="min-w-[140px]">
          <p className="text-xs text-[var(--theme-text)]">{new Date(shift.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
          <p className="text-[10px] text-[var(--theme-text-muted)]">{Math.round(shift.duration_minutes)}m</p>
        </div>

        {/* Cash */}
        <div className="min-w-[120px]">
          <p className="text-xs text-[var(--theme-text)]">₼{shift.expected_cash ?? 0}</p>
          <p className="text-[10px] text-[var(--theme-text-muted)]">expected</p>
        </div>

        {/* Variance */}
        <div className="min-w-[100px]">
          {shift.difference !== null ? (
            <p className={`text-xs font-medium ${Math.abs(shift.difference) > 5 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {shift.difference > 0 ? '+' : ''}₼{shift.difference}
            </p>
          ) : (
            <p className="text-xs text-[var(--theme-text-muted)]">—</p>
          )}
        </div>

        {/* Orders */}
        <div className="min-w-[80px]">
          <p className="text-xs text-[var(--theme-text)]">{shift.orders_count}</p>
          <p className="text-[10px] text-[var(--theme-text-muted)]">orders</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
          {isActive && (
            <button onClick={(e) => { e.stopPropagation(); onForceClose(); }} title="Force Close"
              className="p-2 rounded-lg text-[var(--theme-text-muted)] hover:bg-rose-500/10 hover:text-rose-400 transition-colors">
              <Square size={14} />
            </button>
          )}
          <button onClick={(e) => { e.stopPropagation(); onClick(); }}
            className="p-2 rounded-lg text-[var(--theme-text-muted)] hover:bg-white/5 hover:text-[var(--theme-text)] transition-colors">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function ShiftDetailPanel({ shift, onClose }: { shift: Shift; onClose: () => void }) {
  return (
    <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 400, damping: 35, mass: 0.9 }}
      className="fixed right-0 top-0 bottom-0 z-[101] w-[calc(100vw-260px)] bg-[var(--theme-surface)] border-l border-[var(--theme-border)] shadow-2xl flex flex-col">
      <div className="p-6 border-b border-[var(--theme-border)] flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-lg font-bold text-[var(--theme-text)]">Shift Detail</h2>
          <p className="text-xs text-[var(--theme-text-muted)]">{shift.staff_name} · {new Date(shift.opened_at).toLocaleDateString()}</p>
        </div>
        <button onClick={onClose} className="p-2 rounded-xl text-[var(--theme-text-muted)] hover:bg-white/5">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-2 gap-4">
          <DetailCard label="Started" value={new Date(shift.opened_at).toLocaleTimeString()} />
          <DetailCard label="Duration" value={`${Math.round(shift.duration_minutes)} min`} />
          <DetailCard label="Starting Cash" value={`₼${shift.starting_cash}`} />
          <DetailCard label="Expected Cash" value={`₼${shift.expected_cash}`} />
          <DetailCard label="Actual Cash" value={shift.actual_cash !== null ? `₼${shift.actual_cash}` : '—'} />
          <DetailCard label="Variance" value={shift.difference !== null ? `₼${shift.difference}` : '—'} accent={shift.difference !== null && Math.abs(shift.difference) > 5 ? 'amber' : undefined} />
          <DetailCard label="Orders" value={shift.orders_count.toString()} />
          <DetailCard label="Status" value={shift.status} />
        </div>
      </div>
    </motion.div>
  );
}

function DetailCard({ label, value, accent }: { label: string; value: string; accent?: 'amber' }) {
  return (
    <div className={`p-4 rounded-xl border ${accent === 'amber' ? 'bg-amber-500/5 border-amber-500/20' : 'bg-white/[0.02] border-white/[0.06]'}`}>
      <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-bold mt-1 ${accent === 'amber' ? 'text-amber-400' : 'text-[var(--theme-text)]'}`}>{value}</p>
    </div>
  );
}
