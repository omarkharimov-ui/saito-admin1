'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Plus, Users, Clock, ShoppingBag, DollarSign,
  AlertTriangle, ChevronRight, MoreHorizontal, Edit, Timer,
  LogOut, RotateCcw, Utensils, GlassWater, Component, Shield,
  UserCheck, Activity, CreditCard, TrendingUp, Eye, ChefHat,
  CheckCircle, XCircle, LogIn, Coffee, FileText
} from 'lucide-react';

import { TimeClockPanel } from './components/TimeClockPanel';
import { ScheduleCalendar } from './components/ScheduleCalendar';
import { TipManagement } from './components/TipManagement';
import { CashReconciliation } from './components/CashReconciliation';
import { BreakManagement } from './components/BreakManagement';
import { OvertimeTracking } from './components/OvertimeTracking';
import { ShiftHandover } from './components/ShiftHandover';
import { Onboarding } from './components/Onboarding';
import { DocumentManagement } from './components/DocumentManagement';
import { Compliance } from './components/Compliance';
import { Communication } from './components/Communication';
import { PerformanceReviews } from './components/PerformanceReviews';
import { AdvancedPermissions } from './components/AdvancedPermissions';
import { SecurityTab } from './components/SecurityTab';
import { ActivityTab } from './components/ActivityTab';

// Role icon mapping - Apple-style vector icons
function getRoleIcon(roleName: string): React.ComponentType<any> {
  const icons: Record<string, React.ComponentType<any>> = {
    waiter: Utensils,
    bartender: GlassWater,
    kitchen: ChefHat,
    cashier: Component,
    manager: Shield,
    host: UserCheck,
  };
  return icons[roleName?.toLowerCase()] || UserCheck;
}

// Format duration from interval string
function formatDurationShort(intervalStr: string | null | undefined): string {
  if (!intervalStr) return '—';
  // Parse PostgreSQL interval like "00:08:30" or "8 minutes 30 seconds"
  const match = intervalStr.match(/(\d+):(\d+):(\d+)/);
  if (match) {
    const hours = parseInt(match[1]);
    const mins = parseInt(match[2]);
    const secs = parseInt(match[3]);
    if (hours > 0) return `${hours}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  }
  // Try seconds format
  const secondsMatch = intervalStr.match(/(\d+)\s*(seconds?|secs?)/);
  if (secondsMatch) {
    const secs = parseInt(secondsMatch[1]);
    if (secs >= 60) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
    return `${secs}s`;
  }
  return intervalStr;
}

// Short currency format
function formatCurrencyShort(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return '₼0';
  if (value >= 1000) return `₼${(value / 1000).toFixed(1)}k`;
  return `₼${value.toFixed(0)}`;
}
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { toast } from '@/lib/toast';
import { useFirstLoad } from '@/hooks/useFirstLoad';
import type { StaffMember } from './types';

type Kpis = {
  total_staff: number;
  active_staff: number;
  on_shift: number;
  off_shift: number;
  today_orders: number;
  today_revenue: number;
  open_cash_drawers: number;
  cash_variance: number;
  risk_alerts: number;
};

export default function StaffPage() {
  const { t } = useLanguage();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'on_shift' | 'off_shift'>('all');
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);

  const isFirstLoad = useFirstLoad(400, loading);

  const fetchDirectory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/staff/directory-v2');
      if (res.ok) {
        const data = await res.json();
        setKpis(data.kpis);
        setStaff(data.staff || []);
      }
    } catch {
      toast.error('Failed to load staff');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDirectory(); }, [fetchDirectory]);

  const handleForceClockOut = async (member: StaffMember) => {
    if (!confirm(`Force clock out ${member.full_name || member.name}?`)) return;
    try {
      const res = await fetch('/api/staff/force-clock-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: member.id, reason: 'Forced by admin' }),
      });
      if (res.ok) {
        toast.success('Staff clocked out');
        fetchDirectory();
      } else {
        toast.error('Failed');
      }
    } catch {
      toast.error('Error');
    }
  };

  const handleResetPin = async (member: StaffMember) => {
    if (!confirm(`Reset PIN for ${member.full_name || member.name}?`)) return;
    try {
      const res = await fetch('/api/staff/reset-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: member.id }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`New PIN: ${data.new_pin}`);
      } else {
        toast.error('Failed');
      }
    } catch {
      toast.error('Error');
    }
  };

  const filteredStaff = useMemo(() => {
    let result = staff;
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(m =>
        m.name.toLowerCase().includes(s) ||
        m.full_name?.toLowerCase().includes(s) ||
        m.role_name.toLowerCase().includes(s)
      );
    }
    if (filter === 'on_shift') result = result.filter(m => m.shift_status === 'active');
    if (filter === 'off_shift') result = result.filter(m => m.shift_status !== 'active');
    return result;
  }, [staff, search, filter]);

  const onShiftCount = staff.filter(s => s.shift_status === 'active').length;

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-black text-[var(--theme-text)] tracking-tight">TEAM</h1>
          <p className="text-[10px] text-[var(--theme-text-muted)] mt-0.5 uppercase tracking-widest">
            {kpis?.total_staff ?? 0} Staff · {onShiftCount} On Shift
          </p>
        </div>
        <button
          onClick={() => setShowCreateSheet(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-[var(--theme-text)] text-[var(--theme-surface)] rounded-2xl text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-all shadow-xl active:scale-95"
        >
          <Plus size={14} />
          Add Staff
        </button>
      </div>

      {/* Control Header - Glass Effect */}
      <div
        className="flex items-center gap-4 p-4 rounded-2xl flex-shrink-0"
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search staff..."
            className="w-full rounded-xl pl-10 pr-4 py-2.5 text-xs text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none transition-all"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <FilterPill active={filter === 'all'} onClick={() => setFilter('all')}>
            All ({staff.length})
          </FilterPill>
          <FilterPill active={filter === 'on_shift'} onClick={() => setFilter('on_shift')} count={onShiftCount} accent="emerald">
            On Shift
          </FilterPill>
          <FilterPill active={filter === 'off_shift'} onClick={() => setFilter('off_shift')}>
            Off Shift
          </FilterPill>
        </div>
      </div>

      {/* Horizontal Staff Cards */}
      <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
        {isFirstLoad ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div
                key={i}
                className="h-24 rounded-2xl animate-pulse"
                style={{ background: 'rgba(255,255,255,0.02)' }}
              />
            ))}
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Users size={48} className="mx-auto text-[var(--theme-text-muted)] mb-4" />
              <p className="text-sm font-medium text-[var(--theme-text-secondary)]">No staff found</p>
              <p className="text-xs text-[var(--theme-text-muted)] mt-1">Try adjusting your search or filters</p>
            </div>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredStaff.map((member, idx) => (
              <StaffCard
                key={member.id}
                member={member}
                index={idx}
                onClick={() => setSelectedStaff(member)}
                onForceClockOut={handleForceClockOut}
                onResetPin={handleResetPin}
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Add Staff Sheet */}
      <AnimatePresence>
        {showCreateSheet && (
          <CreateStaffSheet onClose={() => setShowCreateSheet(false)} onSuccess={fetchDirectory} />
        )}
      </AnimatePresence>

      {/* Staff Detail Sheet */}
      <AnimatePresence>
        {selectedStaff && (
          <StaffDetailSheet staff={selectedStaff} onClose={() => setSelectedStaff(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function FilterPill({ children, active, onClick, count, accent }: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  count?: number;
  accent?: 'emerald';
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
        active
          ? 'bg-[var(--theme-text)] text-[var(--theme-surface)] shadow-md'
          : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] hover:bg-white/5'
      } ${accent && active ? '!bg-emerald-500 !text-white' : ''}`}
    >
      {children}
      {count !== undefined && (
        <span className={`ml-1.5 tabular-nums ${active ? 'opacity-80' : 'opacity-50'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

function StaffCard({ member, index, onClick, onForceClockOut, onResetPin }: {
  member: StaffMember;
  index: number;
  onClick: () => void;
  onForceClockOut: (member: StaffMember) => void;
  onResetPin: (member: StaffMember) => void;
}) {
  const isOnShift = member.shift_status === 'active';
  const roleColor = getRoleColor(member.role_name);
  const initials = (member.full_name || member.name).split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const RoleIcon = getRoleIcon(member.role_name);

  // Calculate shift progress
  const shiftProgress = calculateShiftProgress(member.shift);

  // Live timer
  const [liveDuration, setLiveDuration] = useState('');

  useEffect(() => {
    if (!isOnShift || !member.shift_opened_at) return;

    const updateTimer = () => {
      const start = new Date(member.shift_opened_at!);
      const now = new Date();
      const diff = now.getTime() - start.getTime();
      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setLiveDuration(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isOnShift, member.shift_opened_at]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.35, delay: index * 0.04, ease: [0.25, 0.46, 0.45, 0.94] }}
      onClick={onClick}
      className="group relative rounded-2xl p-4 cursor-pointer transition-all duration-200 hover:scale-[1.002]"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(10px)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
        e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
        e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
      }}
    >
      <div className="flex items-center gap-5">
        {/* 1. Employee Identity with Role Icon */}
        <div className="flex items-center gap-3 min-w-[220px]">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${roleColor.gradientFrom}, ${roleColor.gradientTo})`,
              boxShadow: `0 4px 12px ${roleColor.gradientFrom}40`,
            }}
          >
            <RoleIcon size={20} />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--theme-text)] truncate max-w-[160px]">
              {member.full_name || member.name}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-[10px] font-medium ${roleColor.text}`}>{member.role_name}</span>
            </div>
          </div>
        </div>

        {/* 2. Status & Live Timer */}
        <div className="min-w-[140px]">
          {isOnShift ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
                <span
                  className="px-2.5 py-1 rounded-lg text-[10px] font-semibold"
                  style={{
                    background: 'rgba(16, 185, 129, 0.1)',
                    color: '#10b981',
                    border: '1px solid rgba(16, 185, 129, 0.2)',
                  }}
                >
                  ON SHIFT
                </span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 tabular-nums ml-4">
                {liveDuration}
              </span>
            </div>
          ) : member.is_active ? (
            <span className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
              OFF SHIFT
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
              INACTIVE
            </span>
          )}
        </div>

        {/* 3. Shift Time / Progress */}
        <div className="flex-1 min-w-[180px]">
          {member.shift ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-[var(--theme-text-muted)]">
                <Clock size={12} />
                <span>{member.shift}</span>
              </div>
              {isOnShift && shiftProgress !== null && (
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-white/5">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${shiftProgress}%` }}
                      transition={{ duration: 1, delay: 0.3 + index * 0.05 }}
                      className="h-full rounded-full"
                      style={{ background: 'linear-gradient(90deg, #10b981, #34d399)' }}
                    />
                  </div>
                  <span className="text-[10px] font-medium text-emerald-400 tabular-nums">{shiftProgress}%</span>
                </div>
              )}
            </div>
          ) : (
            <span className="text-xs text-[var(--theme-text-muted)] opacity-50">No shift set</span>
          )}
        </div>

        {/* 4. Role-Specific Metrics Chips */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {member.role_name?.toLowerCase() === 'kitchen' && (
            <>
              <MetricChip icon={ShoppingBag} value={member.active_tickets ?? 0} label="active" accent="amber" />
              <MetricChip icon={ChefHat} value={member.completed_tickets ?? 0} label="done" />
              {member.avg_prep_time && (
                <MetricChip icon={Timer} value={formatDurationShort(member.avg_prep_time)} label="" />
              )}
              {(member.late_tickets ?? 0) > 0 && (
                <MetricChip icon={AlertTriangle} value={member.late_tickets} label="late" accent="rose" />
              )}
            </>
          )}
          {member.role_name?.toLowerCase() === 'waiter' && (
            <>
              <MetricChip icon={Users} value={member.active_tables ?? 0} label="tables" accent="emerald" />
              <MetricChip icon={UserCheck} value={member.guests_served ?? 0} label="guests" />
              <MetricChip icon={DollarSign} value={formatCurrencyShort(member.total_tips ?? 0)} label="tips" />
              {(member.total_voids ?? 0) > 0 && (
                <MetricChip icon={AlertTriangle} value={member.total_voids} label="voids" accent="amber" />
              )}
            </>
          )}
          {(member.role_name?.toLowerCase() === 'cashier' || member.role_name?.toLowerCase() === 'bartender') && (
            <>
              <MetricChip icon={DollarSign} value={formatCurrencyShort(member.cash_sales ?? 0)} label="cash" />
              <MetricChip icon={ShoppingBag} value={formatCurrencyShort(member.card_sales ?? 0)} label="card" />
              {(member.total_voids ?? 0) > 0 && (
                <MetricChip icon={AlertTriangle} value={member.total_voids} label="voids" accent="amber" />
              )}
              {(member.drawer_variance ?? 0) !== 0 && (
                <MetricChip icon={AlertTriangle} value={formatCurrencyShort(Math.abs(member.drawer_variance ?? 0))} label="var" accent="rose" />
              )}
            </>
          )}
          {!['kitchen', 'waiter', 'cashier', 'bartender'].includes(member.role_name?.toLowerCase() ?? '') && (
            <>
              <MetricChip icon={ShoppingBag} value={member.total_orders} label="orders" />
              <MetricChip icon={DollarSign} value={formatCurrencyShort(member.total_revenue)} label="revenue" />
            </>
          )}
        </div>

        {/* 5. Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {isOnShift && (
            <button
              onClick={(e) => { e.stopPropagation(); onForceClockOut(member); }}
              title="Force Clock Out"
              className="p-2 rounded-lg text-[var(--theme-text-muted)] hover:bg-rose-500/10 hover:text-rose-400 transition-colors"
            >
              <LogOut size={14} />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onResetPin(member); }}
            title="Reset PIN"
            className="p-2 rounded-lg text-[var(--theme-text-muted)] hover:bg-white/5 hover:text-[var(--theme-text)] transition-colors"
          >
            <RotateCcw size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            className="p-2 rounded-lg text-[var(--theme-text-muted)] hover:bg-white/5 hover:text-[var(--theme-text)] transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function MetricChip({ icon: Icon, value, label, accent }: {
  icon: any;
  value: any;
  label: string;
  accent?: 'amber' | 'rose' | 'emerald';
}) {
  const accentStyle = accent === 'amber'
    ? { background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.2)' }
    : accent === 'rose'
      ? { background: 'rgba(244, 63, 94, 0.1)', color: '#f43f5e', border: '1px solid rgba(244, 63, 94, 0.2)' }
      : accent === 'emerald'
        ? { background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)' }
        : { background: 'rgba(255,255,255,0.03)', color: 'var(--theme-text-muted)', border: '1px solid rgba(255,255,255,0.06)' };

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium"
      style={accentStyle}
    >
      <Icon size={10} />
      <span className="tabular-nums">{value}</span>
      {label && <span className="opacity-60">{label}</span>}
    </div>
  );
}

function CreateStaffSheet({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', role_id: '', shift: '', pin: '', hourly_rate: '' });
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          role_id: form.role_id || null,
          shift: form.shift.trim() || null,
          hourly_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : null,
          pin: form.pin || null,
        }),
      });
      if (res.ok) {
        toast.success('Staff created');
        onClose();
        onSuccess();
      } else {
        toast.error('Failed to create');
      }
    } catch {
      toast.error('Error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ x: '100%', opacity: 0.8 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0.8 }}
        transition={{ type: 'spring', stiffness: 400, damping: 35, mass: 0.9 }}
        className="fixed right-0 top-0 bottom-0 z-[101] w-[calc(100vw-260px)] bg-[var(--theme-surface)] border-l border-[var(--theme-border)] shadow-2xl flex flex-col rounded-l-3xl"
      >
        <div className="p-6 border-b border-[var(--theme-border)]">
          <h2 className="text-base font-black text-[var(--theme-text)]">New Staff</h2>
          <p className="text-[10px] text-[var(--theme-text-muted)] mt-1 uppercase tracking-widest">Create a new team member</p>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <FormInput label="Full Name *" value={form.name} onChange={v => setForm({ ...form, name: v })} required />
          <FormInput label="Email" value={form.email} onChange={v => setForm({ ...form, email: v })} type="email" />
          <FormInput label="Phone" value={form.phone} onChange={v => setForm({ ...form, phone: v })} />
          <FormInput label="Shift" value={form.shift} onChange={v => setForm({ ...form, shift: v })} placeholder="e.g. 09:00 - 18:00" />
          <FormInput label="Hourly Rate (AZN)" value={form.hourly_rate} onChange={v => setForm({ ...form, hourly_rate: v })} type="number" />
          <FormInput label="PIN (4 digits)" value={form.pin} onChange={v => setForm({ ...form, pin: v.replace(/\D/g, '').slice(0, 4) })} type="password" placeholder="****" />
        </form>

        <div className="p-6 border-t border-[var(--theme-border)] flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="px-5 py-2.5 text-xs font-bold text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-colors rounded-xl">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={creating || !form.name}
            className="flex items-center gap-2 bg-[var(--theme-text)] text-[var(--theme-surface)] px-6 py-2.5 rounded-2xl font-bold text-xs tracking-wide transition-all disabled:opacity-40 shadow-xl active:scale-95"
          >
            {creating ? <span className="w-3.5 h-3.5 border-2 border-[var(--theme-surface)]/20 border-t-[var(--theme-surface)] rounded-full animate-spin" /> : <Plus size={12} />}
            Create
          </button>
        </div>
      </motion.div>
    </>
  );
}

function FormInput({ label, value, onChange, type = 'text', required, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-wider text-[var(--theme-text-secondary)] font-bold">{label}</label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl px-4 py-3 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none transition-all"
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      />
    </div>
  );
}

function StaffDetailSheet({ staff, onClose }: { staff: StaffMember; onClose: () => void }) {
  const roleColor = getRoleColor(staff.role_name);
  const RoleIcon = getRoleIcon(staff.role_name);
  const isOnShift = staff.shift_status === 'active';
  const [activeTab, setActiveTab] = useState<'overview' | 'timeclock' | 'schedule' | 'shifts' | 'tips' | 'cash' | 'breaks' | 'overtime' | 'handover' | 'onboarding' | 'documents' | 'compliance' | 'messages' | 'reviews' | 'attendance' | 'labor' | 'payroll' | 'approvals' | 'activity' | 'security' | 'permissions'>('overview');
  const [shifts, setShifts] = useState<any[]>([]);
  const [shiftsLoading, setShiftsLoading] = useState(false);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [laborData, setLaborData] = useState<any>(null);
  const [laborLoading, setLaborLoading] = useState(false);
  const [payrollEntries, setPayrollEntries] = useState<any[]>([]);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [activity, setActivity] = useState<any[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'timeclock', label: 'Time Clock' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'shifts', label: 'Shifts' },
    { key: 'tips', label: 'Tips' },
    { key: 'cash', label: 'Cash' },
    { key: 'breaks', label: 'Breaks' },
    { key: 'overtime', label: 'Overtime' },
    { key: 'handover', label: 'Handover' },
    { key: 'onboarding', label: 'Onboarding' },
    { key: 'documents', label: 'Documents' },
    { key: 'compliance', label: 'Compliance' },
    { key: 'messages', label: 'Messages' },
    { key: 'reviews', label: 'Reviews' },
    { key: 'attendance', label: 'Attendance' },
    { key: 'labor', label: 'Labor' },
    { key: 'payroll', label: 'Payroll' },
    { key: 'approvals', label: 'Approvals' },
    { key: 'activity', label: 'Activity' },
    { key: 'security', label: 'Security' },
    { key: 'permissions', label: 'Permissions' },
  ] as const;

  useEffect(() => {
    if (activeTab === 'shifts' && shifts.length === 0) {
      setShiftsLoading(true);
      fetch(`/api/staff/${staff.id}/shifts`).then(res => res.ok ? res.json() : []).then(data => setShifts(data || [])).catch(() => setShifts([])).finally(() => setShiftsLoading(false));
    }
    if (activeTab === 'schedule' && schedule.length === 0) {
      setScheduleLoading(true);
      fetch(`/api/staff/${staff.id}/schedule`).then(res => res.ok ? res.json() : []).then(data => setSchedule(data || [])).catch(() => setSchedule([])).finally(() => setScheduleLoading(false));
    }
    if (activeTab === 'attendance' && attendance.length === 0) {
      setAttendanceLoading(true);
      fetch(`/api/staff/${staff.id}/attendance`).then(res => res.ok ? res.json() : []).then(data => setAttendance(data || [])).catch(() => setAttendance([])).finally(() => setAttendanceLoading(false));
    }
    if (activeTab === 'labor' && !laborData) {
      setLaborLoading(true);
      fetch(`/api/staff/${staff.id}/labor`).then(res => res.ok ? res.json() : null).then(data => setLaborData(data)).catch(() => setLaborData(null)).finally(() => setLaborLoading(false));
    }
    if (activeTab === 'payroll' && payrollEntries.length === 0) {
      setPayrollLoading(true);
      fetch(`/api/staff/${staff.id}/payroll`).then(res => res.ok ? res.json() : []).then(data => setPayrollEntries(data || [])).catch(() => setPayrollEntries([])).finally(() => setPayrollLoading(false));
    }
    if (activeTab === 'approvals' && approvals.length === 0) {
      setApprovalsLoading(true);
      fetch(`/api/staff/${staff.id}/approvals`).then(res => res.ok ? res.json() : []).then(data => setApprovals(data || [])).catch(() => setApprovals([])).finally(() => setApprovalsLoading(false));
    }
    if (activeTab === 'activity' && activity.length === 0) {
      setActivityLoading(true);
      fetch(`/api/staff/${staff.id}/activity`).then(res => res.ok ? res.json() : []).then(data => setActivity(data || [])).catch(() => setActivity([])).finally(() => setActivityLoading(false));
    }
  }, [activeTab, staff.id]);

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0.8 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0.8 }}
      transition={{ type: 'spring', stiffness: 400, damping: 35, mass: 0.9 }}
      className="fixed right-0 top-0 bottom-0 z-[101] w-[calc(100vw-260px)] bg-[var(--theme-surface)] border-l border-[var(--theme-border)] shadow-2xl flex flex-col"
    >
        {/* Header with gradient */}
        <div
          className="p-6 flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, ${roleColor.gradientFrom}15, ${roleColor.gradientTo}05)`,
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-xl"
                style={{
                  background: `linear-gradient(135deg, ${roleColor.gradientFrom}, ${roleColor.gradientTo})`,
                  boxShadow: `0 8px 24px ${roleColor.gradientFrom}40`,
                }}
              >
                <RoleIcon size={28} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[var(--theme-text)]">{staff.full_name || staff.name}</h2>
                <p className={`text-xs font-medium ${roleColor.text} mt-0.5`}>{staff.role_name}</p>
                <div className="flex items-center gap-2 mt-2">
                  {isOnShift ? (
                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                      </span>
                      ON SHIFT
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
                      OFF SHIFT
                    </span>
                  )}
                  {staff.shift && (
                    <span className="text-[10px] text-[var(--theme-text-muted)]">{staff.shift}</span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-[var(--theme-text-muted)] hover:bg-white/5 hover:text-[var(--theme-text)] transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 border-b border-[var(--theme-border)] flex-shrink-0">
          <div className="flex items-center gap-1">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-3 text-xs font-medium transition-all border-b-2 ${
                  activeTab === tab.key
                    ? 'border-[var(--theme-text)] text-[var(--theme-text)]'
                    : 'border-transparent text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Current Shift - if active */}
              {staff.active_shift && (
                <div>
                  <h3 className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold mb-3">Current Shift</h3>
                  <div className="grid grid-cols-4 gap-3">
                    <StatCard label="Started" value={new Date(staff.active_shift.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} icon={Clock} />
                    <StatCard label="Duration" value={`${Math.round(staff.active_shift.duration_minutes)}m`} icon={Timer} />
                    <StatCard label="Starting Cash" value={`₼${staff.active_shift.starting_cash}`} icon={DollarSign} />
                    <StatCard label="Expected Cash" value={`₼${staff.expected_cash ?? 0}`} icon={DollarSign} />
                  </div>
                </div>
              )}

              {/* Role-specific Today's Performance */}
              {staff.role_name?.toLowerCase() === 'waiter' && (
                <div>
                  <h3 className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold mb-3">Today&apos;s Service</h3>
                  <div className="grid grid-cols-4 gap-3">
                    <StatCard label="Orders Taken" value={staff.total_orders} icon={ShoppingBag} />
                    <StatCard label="Tables Served" value={staff.tables_served ?? 0} icon={Users} />
                    <StatCard label="Guests" value={staff.guests_served ?? 0} icon={UserCheck} />
                    <StatCard label="Avg Check" value={formatCurrency(staff.avg_order_value)} icon={DollarSign} />
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <StatCard label="Tips" value={formatCurrency(staff.total_tips ?? 0)} icon={DollarSign} accent="emerald" />
                    <StatCard label="Active Tables" value={staff.active_tables ?? 0} icon={Users} />
                    <StatCard label="Voids" value={staff.total_voids ?? 0} icon={AlertTriangle} accent="amber" />
                  </div>
                </div>
              )}

              {staff.role_name?.toLowerCase() === 'kitchen' && (
                <div>
                  <h3 className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold mb-3">Today&apos;s Kitchen</h3>
                  <div className="grid grid-cols-4 gap-3">
                    <StatCard label="Tickets Done" value={staff.completed_tickets ?? 0} icon={ChefHat} />
                    <StatCard label="Active Tickets" value={staff.active_tickets ?? 0} icon={ShoppingBag} accent="amber" />
                    <StatCard label="Avg Prep Time" value={staff.avg_prep_time ? formatDurationShort(staff.avg_prep_time) : '—'} icon={Timer} />
                    <StatCard label="Items Made" value={staff.items_prepared ?? 0} icon={Component} />
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <StatCard label="Late Tickets" value={staff.late_tickets ?? 0} icon={AlertTriangle} accent="rose" />
                    <StatCard label="Re-fired" value={staff.re_fired ?? 0} icon={AlertTriangle} accent="amber" />
                    <StatCard label="Cancelled" value={staff.cancelled_tickets ?? 0} icon={XCircle} accent="rose" />
                  </div>
                </div>
              )}

              {(staff.role_name?.toLowerCase() === 'cashier' || staff.role_name?.toLowerCase() === 'bartender') && (
                <div>
                  <h3 className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold mb-3">Today&apos;s Sales</h3>
                  <div className="grid grid-cols-4 gap-3">
                    <StatCard label="Orders Closed" value={staff.total_orders} icon={ShoppingBag} />
                    <StatCard label="Total Sales" value={formatCurrency(staff.total_revenue)} icon={DollarSign} />
                    <StatCard label="Cash Sales" value={formatCurrency(staff.cash_sales ?? 0)} icon={DollarSign} />
                    <StatCard label="Card Sales" value={formatCurrency(staff.card_sales ?? 0)} icon={CreditCard} />
                  </div>
                  <div className="grid grid-cols-4 gap-3 mt-3">
                    <StatCard label="Avg Transaction" value={formatCurrency(staff.avg_ticket_value)} icon={TrendingUp} />
                    <StatCard label="Voids" value={staff.total_voids ?? 0} icon={AlertTriangle} accent="amber" />
                    <StatCard label="Refunds" value={formatCurrency(staff.total_refunds ?? 0)} icon={AlertTriangle} accent="rose" />
                    <StatCard label="Cash Variance" value={`₼${staff.drawer_variance ?? 0}`} icon={AlertTriangle} accent={staff.drawer_variance && Math.abs(staff.drawer_variance) > 5 ? 'amber' : 'emerald'} />
                  </div>
                </div>
              )}

              {staff.role_name?.toLowerCase() === 'manager' && (
                <div>
                  <h3 className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold mb-3">Today&apos;s Overview</h3>
                  <div className="grid grid-cols-4 gap-3">
                    <StatCard label="Team Orders" value={staff.total_orders} icon={ShoppingBag} />
                    <StatCard label="Team Revenue" value={formatCurrency(staff.total_revenue)} icon={DollarSign} />
                    <StatCard label="Approvals Given" value={staff.approvals_count ?? 0} icon={CheckCircle} />
                    <StatCard label="Exceptions" value={staff.exceptions_count ?? 0} icon={AlertTriangle} accent="amber" />
                  </div>
                </div>
              )}

              {/* Issues - shown for all if any */}
              {((staff.total_voids ?? 0) > 0 || (staff.total_refunds ?? 0) > 0 || (staff.total_discounts ?? 0) > 0) && (
                <div>
                  <h3 className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold mb-3">Issues</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <StatCard label="Voids" value={staff.total_voids ?? 0} icon={AlertTriangle} accent="amber" />
                    <StatCard label="Refunds" value={formatCurrency(staff.total_refunds ?? 0)} icon={AlertTriangle} accent="rose" />
                    <StatCard label="Discounts" value={formatCurrency(staff.total_discounts ?? 0)} icon={DollarSign} />
                  </div>
                </div>
              )}

              {/* Contact Info */}
              <div>
                <h3 className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold mb-3">Contact</h3>
                <div className="space-y-2">
                  {staff.email && (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                      <span className="text-[var(--theme-text-muted)] text-xs">Email:</span>
                      <span className="text-xs text-[var(--theme-text)]">{staff.email}</span>
                    </div>
                  )}
                  {staff.phone && (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                      <span className="text-[var(--theme-text-muted)] text-xs">Phone:</span>
                      <span className="text-xs text-[var(--theme-text)]">{staff.phone}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'timeclock' && (
            <TimeClockPanel staffId={staff.id} staffName={staff.full_name || staff.name} />
          )}

          {activeTab === 'shifts' && (
            <div className="space-y-4">
              {shiftsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.02)' }} />
                  ))}
                </div>
              ) : shifts.length === 0 ? (
                <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center">
                  <Clock size={48} className="mx-auto text-[var(--theme-text-muted)] mb-4" />
                  <p className="text-sm text-[var(--theme-text-secondary)]">No shifts found</p>
                </div>
              ) : (
                <>
                  <h3 className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold">Shift History</h3>
                  <div className="space-y-2">
                    {shifts.map((shift: any) => (
                      <div key={shift.id} className="p-4 rounded-xl border" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="flex items-center gap-4">
                          <div className="min-w-[120px]">
                            <p className="text-xs font-medium text-[var(--theme-text)]">{new Date(shift.opened_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                            <p className="text-[10px] text-[var(--theme-text-muted)]">{new Date(shift.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{shift.closed_at && ` - ${new Date(shift.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}</p>
                          </div>
                          <div className="min-w-[80px]"><p className="text-xs text-[var(--theme-text)]">{shift.duration_minutes ? `${Math.round(shift.duration_minutes)}m` : 'Active'}</p><p className="text-[10px] text-[var(--theme-text-muted)]">duration</p></div>
                          <div className="min-w-[80px]"><p className="text-xs text-[var(--theme-text)]">{shift.orders_count || 0}</p><p className="text-[10px] text-[var(--theme-text-muted)]">orders</p></div>
                          <div className="min-w-[80px]"><p className="text-xs text-[var(--theme-text)]">₼{shift.expected_cash || 0}</p><p className="text-[10px] text-[var(--theme-text-muted)]">expected</p></div>
                          <div className="min-w-[80px]">{shift.difference !== null ? <p className={`text-xs font-medium ${Math.abs(shift.difference) > 5 ? 'text-amber-400' : 'text-emerald-400'}`}>{shift.difference > 0 ? '+' : ''}₼{shift.difference}</p> : <p className="text-xs text-[var(--theme-text-muted)]">—</p>}<p className="text-[10px] text-[var(--theme-text-muted)]">variance</p></div>
                          <div className="ml-auto"><span className={`px-2 py-1 rounded-lg text-[10px] font-medium ${shift.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : shift.status === 'force_closed' ? 'bg-rose-500/10 text-rose-400' : 'bg-zinc-500/10 text-zinc-400'}`}>{shift.status === 'active' ? 'ACTIVE' : shift.status === 'force_closed' ? 'FORCE CLOSED' : 'CLOSED'}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'schedule' && (
            <ScheduleCalendar />
          )}

          {activeTab === 'tips' && (
            <TipManagement staffId={staff.id} />
          )}

          {activeTab === 'cash' && staff.active_shift && (
            <CashReconciliation
              shiftId={staff.active_shift.id}
              staffId={staff.id}
              startingCash={staff.active_shift.starting_cash || 0}
              expectedCash={staff.expected_cash || 0}
            />
          )}

          {activeTab === 'cash' && !staff.active_shift && (
            <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center">
              <DollarSign size={48} className="mx-auto text-[var(--theme-text-muted)] mb-4" />
              <p className="text-sm text-[var(--theme-text-secondary)]">No active shift</p>
              <p className="text-xs text-[var(--theme-text-muted)] mt-1">Cash reconciliation is available during active shifts</p>
            </div>
          )}

          {activeTab === 'breaks' && (
            <BreakManagement staffId={staff.id} activeShiftId={staff.active_shift?.id} />
          )}

          {activeTab === 'overtime' && (
            <OvertimeTracking staffId={staff.id} />
          )}

          {activeTab === 'handover' && staff.active_shift && (
            <ShiftHandover shiftId={staff.active_shift.id} staffId={staff.id} staffName={staff.full_name || staff.name} />
          )}

          {activeTab === 'handover' && !staff.active_shift && (
            <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center">
              <FileText size={48} className="mx-auto text-[var(--theme-text-muted)] mb-4" />
              <p className="text-sm text-[var(--theme-text-secondary)]">No active shift</p>
            </div>
          )}

          {activeTab === 'onboarding' && (
            <Onboarding staffId={staff.id} roleId={staff.role_id} />
          )}

          {activeTab === 'documents' && (
            <DocumentManagement staffId={staff.id} />
          )}

          {activeTab === 'compliance' && (
            <Compliance staffId={staff.id} />
          )}

          {activeTab === 'messages' && (
            <Communication staffId={staff.id} staffName={staff.full_name || staff.name} />
          )}

          {activeTab === 'reviews' && (
            <PerformanceReviews staffId={staff.id} isManager={staff.role_name?.toLowerCase() === 'manager'} />
          )}

          {activeTab === 'attendance' && (
            <div className="space-y-4">
              {attendanceLoading ? (
                <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.02)' }} />)}</div>
              ) : attendance.length === 0 ? (
                <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center"><Clock size={48} className="mx-auto text-[var(--theme-text-muted)] mb-4" /><p className="text-sm text-[var(--theme-text-secondary)]">No attendance records</p></div>
              ) : (
                <>
                  <h3 className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold">Attendance History</h3>
                  <div className="space-y-2">
                    {attendance.map((a: any, idx: number) => (
                      <div key={idx} className="p-4 rounded-xl border flex items-center gap-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="min-w-[100px]"><p className="text-xs font-medium text-[var(--theme-text)]">{new Date(a.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p></div>
                        <div className="min-w-[80px]"><p className="text-xs text-[var(--theme-text)]">{a.scheduled_start} - {a.scheduled_end}</p><p className="text-[10px] text-[var(--theme-text-muted)]">scheduled</p></div>
                        <div className="min-w-[80px]"><p className="text-xs text-[var(--theme-text)]">{a.actual_start || '—'} - {a.actual_end || '—'}</p><p className="text-[10px] text-[var(--theme-text-muted)]">actual</p></div>
                        <div className="min-w-[60px]">{a.late_minutes > 0 && <p className="text-xs text-amber-400">+{a.late_minutes}m</p>}</div>
                        <div className="ml-auto"><span className={`px-2 py-1 rounded-lg text-[10px] font-medium ${a.status === 'present' ? 'bg-emerald-500/10 text-emerald-400' : a.status === 'late' ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/10 text-rose-400'}`}>{a.status?.toUpperCase()}</span></div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'labor' && (
            <div className="space-y-4">
              {laborLoading ? (
                <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.02)' }} />)}</div>
              ) : !laborData ? (
                <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center"><DollarSign size={48} className="mx-auto text-[var(--theme-text-muted)] mb-4" /><p className="text-sm text-[var(--theme-text-secondary)]">No labor data</p></div>
              ) : (
                <>
                  <h3 className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold">Labor Summary</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <StatCard label="Total Hours" value={`${laborData.total_hours?.toFixed(1) || 0}h`} icon={Clock} />
                    <StatCard label="Labor Cost" value={`₼${laborData.total_labor_cost?.toFixed(2) || 0}`} icon={DollarSign} />
                    <StatCard label="Labor %" value={`${laborData.labor_percentage?.toFixed(1) || 0}%`} icon={TrendingUp} accent={laborData.labor_percentage > 30 ? 'amber' : undefined} />
                  </div>
                  {laborData.role_breakdown && laborData.role_breakdown.length > 0 && (
                    <div>
                      <h4 className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold mt-4 mb-2">By Role</h4>
                      <div className="space-y-2">
                        {laborData.role_breakdown.map((role: any, idx: number) => (
                          <div key={idx} className="p-3 rounded-xl border flex items-center gap-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div className="min-w-[80px]"><p className="text-xs font-medium text-[var(--theme-text)]">{role.role}</p></div>
                            <div className="flex-1"><div className="h-2 rounded-full bg-white/5 overflow-hidden"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(role.percentage, 100)}%` }} /></div></div>
                            <div className="min-w-[60px] text-right"><p className="text-xs text-[var(--theme-text)]">₼{role.cost?.toFixed(0)}</p></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'payroll' && (
            <div className="space-y-4">
              {payrollLoading ? (
                <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.02)' }} />)}</div>
              ) : payrollEntries.length === 0 ? (
                <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center"><DollarSign size={48} className="mx-auto text-[var(--theme-text-muted)] mb-4" /><p className="text-sm text-[var(--theme-text-secondary)]">No payroll records</p></div>
              ) : (
                <>
                  <h3 className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold">Payroll History</h3>
                  <div className="space-y-2">
                    {payrollEntries.map((entry: any) => (
                      <div key={entry.id} className="p-4 rounded-xl border" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="flex items-center gap-4">
                          <div className="min-w-[100px]"><p className="text-xs font-medium text-[var(--theme-text)]">{new Date(entry.period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(entry.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p></div>
                          <div className="min-w-[60px]"><p className="text-xs text-[var(--theme-text)]">{entry.regular_hours?.toFixed(1)}h</p></div>
                          <div className="min-w-[60px]"><p className="text-xs text-[var(--theme-text)]">{entry.overtime_hours?.toFixed(1)}h</p><p className="text-[10px] text-[var(--theme-text-muted)]">OT</p></div>
                          <div className="min-w-[60px]"><p className="text-xs text-[var(--theme-text)]">₼{entry.tips?.toFixed(0)}</p><p className="text-[10px] text-[var(--theme-text-muted)]">tips</p></div>
                          <div className="ml-auto"><p className="text-sm font-bold text-[var(--theme-text)]">₼{entry.gross_pay?.toFixed(2)}</p></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'approvals' && (
            <div className="space-y-4">
              {approvalsLoading ? (
                <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.02)' }} />)}</div>
              ) : approvals.length === 0 ? (
                <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center"><CheckCircle size={48} className="mx-auto text-[var(--theme-text-muted)] mb-4" /><p className="text-sm text-[var(--theme-text-secondary)]">No approval requests</p></div>
              ) : (
                <>
                  <h3 className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold">Approval Requests</h3>
                  <div className="space-y-2">
                    {approvals.map((approval: any) => (
                      <div key={approval.id} className="p-4 rounded-xl border flex items-center gap-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${approval.request_type === 'void' ? 'bg-rose-500/10 text-rose-400' : approval.request_type === 'refund' ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'}`}>
                          {approval.request_type === 'void' ? <XCircle size={14} /> : <DollarSign size={14} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-[var(--theme-text)]">{approval.request_type?.replace('_', ' ')}</p>
                          <p className="text-[10px] text-[var(--theme-text-muted)] truncate">{approval.reason}</p>
                        </div>
                        {approval.amount && <p className="text-xs text-[var(--theme-text)]">₼{approval.amount}</p>}
                        <span className={`px-2 py-1 rounded-lg text-[10px] font-medium ${approval.status === 'pending' ? 'bg-amber-500/10 text-amber-400' : approval.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>{approval.status?.toUpperCase()}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'activity' && (
            <ActivityTab staffId={staff.id} />
          )}

          {activeTab === 'security' && (
            <SecurityTab staffId={staff.id} />
          )}

          {activeTab === 'permissions' && (
            <AdvancedPermissions staffId={staff.id} isManager={staff.role_name?.toLowerCase() === 'manager'} />
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-[var(--theme-border)] flex items-center justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-xs font-bold text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-colors rounded-xl"
          >
            Close
          </button>
          <button className="flex items-center gap-2 bg-[var(--theme-text)] text-[var(--theme-surface)] px-6 py-2.5 rounded-2xl font-bold text-xs tracking-wide transition-all shadow-xl active:scale-95">
            <Edit size={12} />
            Edit
          </button>
        </div>
      </motion.div>
  );
}

function StatCard({ label, value, icon: Icon, accent }: {
  label: string; value: any; icon: any; accent?: 'amber' | 'rose' | 'emerald';
}) {
  const accentStyle = accent === 'amber'
    ? { background: 'rgba(245, 158, 11, 0.05)', borderColor: 'rgba(245, 158, 11, 0.15)' }
    : accent === 'rose'
      ? { background: 'rgba(244, 63, 94, 0.05)', borderColor: 'rgba(244, 63, 94, 0.15)' }
      : accent === 'emerald'
        ? { background: 'rgba(16, 185, 129, 0.05)', borderColor: 'rgba(16, 185, 129, 0.15)' }
        : { background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' };

  return (
    <div className="p-3 rounded-xl border" style={accentStyle}>
      <Icon size={12} className="text-[var(--theme-text-muted)] mb-1.5" />
      <p className="text-sm font-bold text-[var(--theme-text)] tabular-nums">{value}</p>
      <p className="text-[9px] text-[var(--theme-text-muted)] uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  );
}

function PermissionCard({ label, allowed }: { label: string; allowed: boolean }) {
  return (
    <div className={`flex items-center justify-between p-4 rounded-xl border ${
      allowed
        ? 'bg-emerald-500/5 border-emerald-500/20'
        : 'bg-white/[0.02] border-white/[0.06]'
    }`}>
      <span className="text-xs text-[var(--theme-text)]">{label}</span>
      <span className={`text-[10px] font-semibold px-2 py-1 rounded-lg ${
        allowed
          ? 'bg-emerald-500/10 text-emerald-400'
          : 'bg-zinc-500/10 text-zinc-400'
      }`}>
        {allowed ? 'ALLOWED' : 'DENIED'}
      </span>
    </div>
  );
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return '₼0';
  if (value >= 1000) return `₼${(value / 1000).toFixed(1)}k`;
  return `₼${value.toFixed(0)}`;
}

// Utilities
function getRoleColor(roleName: string): { text: string; gradientFrom: string; gradientTo: string } {
  const colors: Record<string, { text: string; gradientFrom: string; gradientTo: string }> = {
    cashier: { text: 'text-blue-400', gradientFrom: '#3b82f6', gradientTo: '#60a5fa' },
    waiter: { text: 'text-emerald-400', gradientFrom: '#10b981', gradientTo: '#34d399' },
    bartender: { text: 'text-amber-400', gradientFrom: '#f59e0b', gradientTo: '#fbbf24' },
    kitchen: { text: 'text-rose-400', gradientFrom: '#f43f5e', gradientTo: '#fb7185' },
    manager: { text: 'text-purple-400', gradientFrom: '#8b5cf6', gradientTo: '#a78bfa' },
    host: { text: 'text-cyan-400', gradientFrom: '#06b6d4', gradientTo: '#22d3ee' },
    default: { text: 'text-zinc-400', gradientFrom: '#71717a', gradientTo: '#a1a1aa' },
  };
  return colors[roleName?.toLowerCase()] || colors.default;
}

function calculateShiftProgress(shift: string | null | undefined): number | null {
  if (!shift) return null;

  try {
    const match = shift.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    if (!match) return null;

    const startH = parseInt(match[1]);
    const startM = parseInt(match[2]);
    const endH = parseInt(match[3]);
    const endM = parseInt(match[4]);

    const now = new Date();
    const startDate = new Date();
    startDate.setHours(startH, startM, 0, 0);
    const endDate = new Date();
    endDate.setHours(endH, endM, 0, 0);

    if (endDate <= startDate) {
      endDate.setDate(endDate.getDate() + 1);
    }

    const totalMs = endDate.getTime() - startDate.getTime();
    const elapsedMs = now.getTime() - startDate.getTime();

    const progress = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));
    return Math.round(progress);
  } catch {
    return null;
  }
}
