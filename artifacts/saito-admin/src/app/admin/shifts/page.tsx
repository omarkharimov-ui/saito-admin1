'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, Users, DollarSign, AlertTriangle, CheckCircle, XCircle,
  Filter, Calendar, ChevronRight, Play, Square, Coffee
} from '@/components/ui/saito-icons';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';

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
  status: 'active' | 'closed' | 'force_closed';
};

export default function ShiftsPage() {
  const { t } = useLanguage();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'closed' | 'variances'>('all');
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);

  // 2026-09-28 (owner: "Scheduling hissəsini bərpa et"): RESTORE. The page
  // expected `{ shifts, kpis }` from GET /api/shifts, but the route returns a
  // PLAIN ARRAY of raw rows (staff_id UUID, closed_at — no names, no
  // duration, no status, no kpis) → the page ALWAYS showed "No shifts found"
  // with zero KPIs. Now: parse the array, join staff name/role from
  // /api/staff (same pattern as admin/staff/shifts), and compute KPIs
  // client-side. The API shape is NOT changed — it has other consumers
  // (staff/shifts, staff/[id]) that rely on the plain array.
  const fetchStaff = useCallback(async () => {
    try {
      const res = await fetch('/api/staff');
      if (res.ok) {
        const data = await res.json();
        setStaff(Array.isArray(data) ? data : []);
      }
    } catch { /* non-fatal — names fall back to "—" */ }
  }, []);

  const fetchShifts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/shifts');
      if (res.ok) {
        const data = await res.json();
        setShifts((Array.isArray(data) ? data : []).map((r: any): Shift => {
          const st = staff.find((m: any) => m.id === r.staff_id);
          const start = new Date(r.opened_at).getTime();
          const end = r.closed_at ? new Date(r.closed_at).getTime() : Date.now();
          return {
            id: r.id,
            staff_id: r.staff_id,
            staff_name: st?.name || '—',
            staff_role: st?.role || st?.role_name || '—',
            opened_at: r.opened_at,
            closed_at: r.closed_at || null,
            duration_minutes: Math.max(0, (end - start) / 60000),
            starting_cash: Number(r.starting_cash) || 0,
            expected_cash: Number(r.expected_cash) || 0,
            actual_cash: r.actual_cash != null ? Number(r.actual_cash) : null,
            difference: r.difference != null ? Number(r.difference) : null,
            status: r.closed_at ? 'closed' : 'active',
          };
        }));
      }
    } catch { toast.error('Smenalar yüklənə bilmədi'); }
    finally { setLoading(false); }
  }, [staff, t]);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);
  useEffect(() => { fetchShifts(); }, [fetchShifts]);

  // KPIs from the mapped rows (no server KPI endpoint exists).
  const kpis = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayShifts = shifts.filter(s => new Date(s.opened_at) >= startOfToday);
    const closed = shifts.filter(s => s.status === 'closed');
    return {
      active_shifts: shifts.filter(s => s.status === 'active').length,
      total_hours_today: todayShifts.reduce((a, s) => a + s.duration_minutes, 0) / 60,
      total_variance: closed.reduce((a, s) => a + (Number(s.difference) || 0), 0),
      avg_shift_duration: closed.length ? closed.reduce((a, s) => a + s.duration_minutes, 0) / closed.length : 0,
    };
  }, [shifts]);

  const filteredShifts = shifts.filter(s => {
    if (filter === 'active') return s.status === 'active';
    if (filter === 'closed') return s.status === 'closed';
    if (filter === 'variances') return s.difference !== null && Math.abs(s.difference) > 5;
    return true;
  });

  const activeShifts = shifts.filter(s => s.status === 'active');

  const handleForceClose = async (shift: Shift) => {
    if (!confirm(`${shift.staff_name} — smenani məcburi bağlayım?`)) return;
    try {
      // P-8 (D-8): /api/shifts/[id]/close never existed (404) — the canonical
      // force path is /api/staff/force-clock-out (timeclock.override + CSRF).
      const csrf = typeof document !== 'undefined' ? document.cookie.match(/saito_csrf=([^;]+)/)?.[1] || '' : '';
      const res = await fetch('/api/staff/force-clock-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ staff_id: shift.staff_id, reason: 'Force closed by admin' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success !== false) { toast.success('Smena bağlandı'); fetchShifts(); }
      else if (data?.error === 'NO_ACTIVE_SHIFT') { toast.success('Aktiv smena yoxdur'); fetchShifts(); }
      else toast.error(data?.error || 'Səhv');
    } catch { toast.error('Səhv'); }
  };

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-black text-[var(--theme-text)] tracking-tight">NÖVBƏLƏR</h1>
          <p className="text-[10px] text-[var(--theme-text-muted)] mt-0.5 uppercase tracking-widest">
            {kpis?.active_shifts ?? 0} Aktiv Smena · Bugün {Math.round((kpis?.total_hours_today ?? 0) * 10) / 10} saat
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 flex-shrink-0">
        <KpiCard label="Aktiv Smenalar" value={kpis?.active_shifts ?? 0} icon={Play} accent="emerald" />
        <KpiCard label="Bugünkü Saatlar" value={`${Math.round((kpis?.total_hours_today ?? 0) * 10) / 10}h`} icon={Clock} />
        <KpiCard label="Orta Smena Müddəti" value={`${Math.round(kpis?.avg_shift_duration ?? 0)} dəq`} icon={Users} />
        <KpiCard label="Kassa Fərqi (bağlı)" value={`₼${(kpis?.total_variance ?? 0).toFixed(2)}`} icon={AlertTriangle} accent={kpis?.total_variance && Math.abs(kpis.total_variance) > 20 ? 'amber' : undefined} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <FilterPill active={filter === 'all'} onClick={() => setFilter('all')}>Bütün ({shifts.length})</FilterPill>
          <FilterPill active={filter === 'active'} onClick={() => setFilter('active')} count={activeShifts.length} accent="emerald">Aktiv</FilterPill>
          <FilterPill active={filter === 'closed'} onClick={() => setFilter('closed')}>Bağlı</FilterPill>
          <FilterPill active={filter === 'variances'} onClick={() => setFilter('variances')} accent="amber">Fərqli</FilterPill>
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
              <p className="text-sm text-[var(--theme-text-secondary)]">{t('st_no_shifts') || 'Smena tapılmadı'}</p>
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
              <span className="text-[10px] font-semibold text-emerald-400">AKTİV</span>
            </div>
          ) : (
            <span className="text-[10px] text-zinc-400">{shift.status === 'force_closed' ? 'MƏCBURİ BAĞLI' : 'BAĞLI'}</span>
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
          <p className="text-[10px] text-[var(--theme-text-muted)] tabular-nums">{Math.round(shift.duration_minutes)} dəq</p>
        </div>

        {/* Cash */}
        <div className="min-w-[120px]">
          <p className="text-xs text-[var(--theme-text)] tabular-nums">₼{Number(shift.expected_cash ?? 0).toFixed(2)}</p>
          <p className="text-[10px] text-[var(--theme-text-muted)]">nəzərdə tutulan</p>
        </div>

        {/* Variance */}
        <div className="min-w-[100px]">
          {shift.difference !== null ? (
            <p className={`text-xs font-medium tabular-nums ${Math.abs(shift.difference) > 5 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {shift.difference > 0 ? '+' : ''}₼{Number(shift.difference).toFixed(2)}
            </p>
          ) : (
            <p className="text-xs text-[var(--theme-text-muted)]">—</p>
          )}
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
          <h2 className="text-lg font-bold text-[var(--theme-text)]">Smena Detalı</h2>
          <p className="text-xs text-[var(--theme-text-muted)]">{shift.staff_name} · {new Date(shift.opened_at).toLocaleDateString('az')} {new Date(shift.opened_at).toLocaleTimeString('az', { hour: '2-digit', minute: '2-digit' })}</p>
        </div>
        <button onClick={onClose} className="p-2 rounded-xl text-[var(--theme-text-muted)] hover:bg-white/5">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-2 gap-4">
          <DetailCard label="Başlanğıc" value={new Date(shift.opened_at).toLocaleTimeString('az', { hour: '2-digit', minute: '2-digit' })} />
          <DetailCard label="Bitiş" value={shift.closed_at ? new Date(shift.closed_at).toLocaleTimeString('az', { hour: '2-digit', minute: '2-digit' }) : '— (açıq)'} />
          <DetailCard label="Müddət" value={`${Math.round(shift.duration_minutes)} dəq`} />
          <DetailCard label="Status" value={shift.status === 'active' ? 'Aktiv' : shift.status === 'force_closed' ? 'Məcburi bağlandı' : 'Bağlı'} />
          <DetailCard label="Açılış Kassa" value={`₼${Number(shift.starting_cash || 0).toFixed(2)}`} />
          <DetailCard label="Nəzərdə Tutulan" value={`₼${Number(shift.expected_cash || 0).toFixed(2)}`} />
          <DetailCard label="Fakt Kassa" value={shift.actual_cash !== null ? `₼${Number(shift.actual_cash).toFixed(2)}` : '—'} />
          <DetailCard label="Fərq" value={shift.difference !== null ? `₼${Number(shift.difference).toFixed(2)}` : '—'} accent={shift.difference !== null && Math.abs(shift.difference) > 5 ? 'amber' : undefined} />
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
