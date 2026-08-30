'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Users, Clock, Plus, X, ChevronRight,
  Shield, Mail, Trash2, Edit3, KeyRound, UserCheck, UserX, Timer, Filter
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { toast } from '@/lib/toast';
import { useFirstLoad } from '@/hooks/useFirstLoad';
import { getRoleColor, getRoleIcon } from '@/lib/staff-utils';
import { StaffWorkspaceSwitcher } from './components/StaffWorkspaceSwitcher';
import { FilterDropdown } from './components/FilterDropdown';
import { StaffSheet } from './components/StaffSheet';
import { ConfirmDialog } from './components/ConfirmDialog';
import { PinInputDialog } from './components/PinInputDialog';
import { StaffEmptyState, ShiftsEmptyState, StaffSkeleton, ShiftSkeleton } from './components/StaffSkeletons';
import Link from 'next/link';

type View = 'staff' | 'shifts';
type StaffMember = {
  id: string; name: string; role: string; role_id?: string;
  shift: string | null; phone: string | null; email?: string | null;
  is_active: boolean; created_at: string;
  hourly_rate?: number;
  activeShift?: { id: string; opened_at: string; staff_id: string; starting_cash?: number; expected_cash?: number; notes?: string | null } | null;
};
type Role = { id: string; name: string; is_system: boolean };

export default function StaffPage() {
  const { t } = useLanguage();
  const [view, setView] = useState<View>('staff');
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('name_asc');
  const [showSheet, setShowSheet] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', role_id: '', shift: '', is_active: true, pin: '', hourly_rate: undefined as number | undefined });
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [shifts, setShifts] = useState<any[]>([]);
  const [shiftsLoading, setShiftsLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [closeShiftData, setCloseShiftData] = useState<any>(null);
  const [closeActualCash, setCloseActualCash] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [closingShift, setClosingShift] = useState(false);
  const [showCloseSheet, setShowCloseSheet] = useState(false);

  const isFirstLoad = useFirstLoad(400, loading);

  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch('/api/staff/roles');
      if (res.ok) { const data = await res.json(); setRoles(data.roles || []); }
    } catch { /* ignore */ }
  }, []);

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (roleFilter) params.set('role_id', roleFilter);
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/staff?${params.toString()}`);
      if (res.ok) { const data = await res.json(); setStaff(Array.isArray(data) ? data : []); }
      else setStaff([]);
    } catch { setStaff([]); }
    finally { setLoading(false); }
  }, [search, roleFilter, statusFilter]);

  const fetchShifts = useCallback(async () => {
    setShiftsLoading(true);
    try {
      const res = await fetch('/api/shifts?period=today');
      if (res.ok) {
        const data = await res.json();
        setShifts(Array.isArray(data) ? data : []);
      }
    } catch { setShifts([]); }
    finally { setShiftsLoading(false); }
  }, []);

  useEffect(() => {
    fetchStaff();
    fetchRoles();
    fetchShifts();
  }, [fetchStaff, fetchRoles, fetchShifts]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const sortedStaff = useMemo(() => {
    const sorted = [...staff];
    switch (sortBy) {
      case 'name_asc': sorted.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'name_desc': sorted.sort((a, b) => b.name.localeCompare(a.name)); break;
      case 'role_asc': sorted.sort((a, b) => (getRoleName(a.role_id) || '').localeCompare(getRoleName(b.role_id) || '')); break;
      case 'created_desc': sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); break;
    }
    return sorted;
  }, [staff, sortBy, roles]);

  const stats = useMemo(() => {
    const total = staff.length;
    const active = staff.filter(s => s.is_active).length;
    const inactive = total - active;
    const onShift = staff.filter(s => s.activeShift).length;
    const offShift = active - onShift;
    return { total, active, inactive, onShift, offShift };
  }, [staff]);

  const getRoleName = useCallback((roleId?: string) => {
    if (!roleId) return '—';
    return roles.find(r => r.id === roleId)?.name || '—';
  }, [roles]);

  const formatDuration = (openedAt: string) => {
    const diff = now - new Date(openedAt).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    if (hours > 0) return `${hours}s ${mins % 60}dc`;
    return `${mins} dəq`;
  };

  const openAddSheet = () => {
    setEditingStaff(null);
    setForm({ name: '', email: '', phone: '', role_id: '', shift: '', is_active: true, pin: '', hourly_rate: undefined });
    setShowSheet(true);
  };

  const openEditSheet = (member: StaffMember) => {
    setEditingStaff(member);
    setForm({ name: member.name, email: member.email || '', phone: member.phone || '', role_id: member.role_id || '', shift: member.shift || '', is_active: member.is_active, pin: '', hourly_rate: member.hourly_rate });
    setShowSheet(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editingStaff ? `/api/staff/${editingStaff.id}` : '/api/staff';
      const method = editingStaff ? 'PATCH' : 'POST';
      const body: any = { name: form.name.trim(), email: form.email.trim() || null, phone: form.phone.trim() || null, role_id: form.role_id || null, shift: form.shift.trim() || null, is_active: form.is_active, hourly_rate: form.hourly_rate ?? null };
      if (form.pin && form.pin.length === 4) body.pin = form.pin;

      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        toast.success(editingStaff ? 'İşçi yeniləndi' : 'İşçi əlavə edildi');
        setShowSheet(false);
        fetchStaff();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Xəta baş verdi');
      }
    } catch { toast.error('Xəta baş verdi'); }
    finally { setSaving(false); }
  };

  const handleDeactivate = async () => {
    if (!deactivatingId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/staff/${deactivatingId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: false }) });
      if (res.ok) { toast.success('İşçi deaktiv edildi'); fetchStaff(); }
      else toast.error('Deaktiv edilə bilmədi');
    } catch { toast.error('Xəta baş verdi'); }
    finally { setSaving(false); setShowDeactivateConfirm(false); setDeactivatingId(null); }
  };

  const handleResetPin = async (pin: string) => {
    if (!resettingId) return;
    setPinLoading(true);
    try {
      const res = await fetch(`/api/staff/${resettingId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) });
      if (res.ok) { toast.success('PIN yeniləndi'); setShowPinDialog(false); setResettingId(null); }
      else toast.error('PIN yenilənə bilmədi');
    } catch { toast.error('Xəta baş verdi'); }
    finally { setPinLoading(false); }
  };

  const handleClockIn = async () => {
    try {
      const res = await fetch('/api/pos/staff/clock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'in' }) });
      if (res.ok) { toast.success('Smena başlatıldı'); fetchShifts(); }
      else { const err = await res.json(); toast.error(err.error || 'Xəta baş verdi'); }
    } catch { toast.error('Xəta baş verdi'); }
  };

  const handleOpenCloseSheet = (shift: any) => {
    setCloseShiftData(shift);
    setCloseActualCash('');
    setCloseNotes('');
    setShowCloseSheet(true);
  };

  const handleCloseShift = async () => {
    if (!closeShiftData || !closeActualCash) return;
    setClosingShift(true);
    try {
      const res = await fetch('/api/pos/staff/clock', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'out', actual_cash: parseFloat(closeActualCash), notes: closeNotes || null }),
      });
      if (res.ok) { toast.success('Smena bağlandı'); setShowCloseSheet(false); fetchShifts(); }
      else { const err = await res.json(); toast.error(err.error || 'Xəta baş verdi'); }
    } catch { toast.error('Xəta baş verdi'); }
    finally { setClosingShift(false); }
  };

  const filteredStaff = useMemo(() => {
    let result = sortedStaff;
    if (statusFilter) {
      result = result.filter(s => statusFilter === 'true' ? s.is_active : !s.is_active);
    }
    return result;
  }, [sortedStaff, statusFilter]);

  const activeShifts = useMemo(() => shifts.filter((s: any) => !s.closed_at), [shifts]);
  const todayShifts = useMemo(() => {
    const today = new Date().toDateString();
    return shifts.filter((s: any) => new Date(s.opened_at).toDateString() === today);
  }, [shifts]);

  const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '—';
    return `₼${Number(val).toLocaleString('az-AZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Compact Header */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-[var(--theme-text)] tracking-tighter">TEAM</h1>
          <p className="text-[10px] text-[var(--theme-text-muted)] mt-1 uppercase tracking-widest">
            Staff operations
          </p>
        </div>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={openAddSheet}
          className="flex items-center gap-2 px-5 py-2.5 bg-white text-black rounded-full text-xs font-black uppercase tracking-wider hover:bg-white/90 transition-all shadow-lg"
        >
          <Plus size={14} />
          Add
        </motion.button>
      </div>

      <StaffWorkspaceSwitcher view={view} onChange={setView} staffCount={stats.total} activeShiftCount={stats.onShift} />

      {/* Compact Filter Bar */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
           <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)]" />
          <input
             value={search}
             onChange={(e) => setSearch(e.target.value)}
             placeholder="Search staff..."
             className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] rounded-xl pl-9 pr-4 py-2 text-xs text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none focus:border-[var(--theme-border-strong)] transition-all"
           />
        </div>
         <FilterDropdown
           value={roleFilter}
           onChange={setRoleFilter}
           options={[{ value: '', label: 'All roles' }, ...roles.map(r => ({ value: r.id, label: r.name }))]}
           className="flex-shrink-0"
         />
         <FilterDropdown
           value={statusFilter}
           onChange={setStatusFilter}
           options={[
             { value: '', label: 'All status' },
             { value: 'true', label: 'Active' },
             { value: 'false', label: 'Inactive' },
           ]}
           className="flex-shrink-0"
         />
        {(search || roleFilter || statusFilter) && (
          <button
            onClick={() => { setSearch(''); setRoleFilter(''); setStatusFilter(''); }}
            className="flex items-center gap-1 px-3 py-2 text-xs text-rose-400 hover:text-rose-300 transition-colors"
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {view === 'staff' ? (
          <motion.div
            key="staff"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          >
            {/* Operational Staff Rows */}
            {isFirstLoad ? (
              <StaffSkeleton />
            ) : filteredStaff.length === 0 ? (
              <StaffEmptyState onCreate={openAddSheet} />
            ) : (
              <div className="space-y-1">
                <AnimatePresence mode="popLayout">
                  {filteredStaff.map((member, idx) => {
                    const roleName = getRoleName(member.role_id);
                    const roleColor = getRoleColor(roleName);
                    const isOnShift = !!member.activeShift;

                    return (
                      <motion.div
                        key={member.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2, delay: idx * 0.02, type: 'spring', stiffness: 400, damping: 30 }}
                        className="group relative"
                      >
                        <Link
                           href={`/admin/staff/${member.id}`}
                           className={`block relative px-5 py-3.5 rounded-[28px] border border-transparent transition-all duration-200 overflow-hidden active:scale-[0.97] shadow-card hover:border-[var(--theme-border-strong)] ${
                             member.is_active ? 'bg-[var(--theme-surface-soft)]' : 'bg-[var(--theme-surface)]'
                           } ${
                             isOnShift ? 'border-l-2 border-l-emerald-400/60' : 'border-l-2 border-l-transparent'
                           }`}
                        >
                          <div className="flex items-center gap-4">
                             {/* Avatar + Name */}
                             <div className="flex items-center gap-3 flex-1 min-w-0">
                              <motion.div
                                 whileHover={{ scale: 1.05 }}
                                 className={`w-9 h-9 rounded-full flex items-center justify-center border transition-colors ${roleColor.bg} ${roleColor.border}`}
                              >
                                {(() => {
                                  const RoleIcon = getRoleIcon(getRoleName(member.role_id));
                                  return <RoleIcon size={16} className={roleColor.text} />;
                                })()}
                              </motion.div>
                               <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-bold text-[var(--theme-text)] truncate group-hover:text-white transition-colors">{member.name}</p>
                                  {isOnShift && (
                                    <motion.span
                                      animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                                      className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0"
                                    />
                                  )}
                                </div>
                                <p className="text-[10px] text-[var(--theme-text-muted)] truncate">
                                  {isOnShift ? `On shift · ${formatDuration(member.activeShift!.opened_at)}` : 'Off shift'}
                                </p>
                              </div>
                            </div>

                            {/* Role Badge */}
                            <div className="hidden sm:block">
                              <motion.span
                                whileHover={{ scale: 1.05 }}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${roleColor.bg} ${roleColor.text} ${roleColor.border} ${roleColor.glow} transition-all duration-300`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${roleColor.dot}`} />
                                {roleName}
                              </motion.span>
                            </div>

                             {/* Quick Actions */}
                             <motion.div
                               className="flex items-center gap-0.5"
                             >
                               <motion.button
                                  whileTap={{ scale: 0.9 }}
                                  onClick={(e) => { e.preventDefault(); openEditSheet(member); }}
                                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)] transition-all"
                                >
                                  <Edit3 size={13} />
                                </motion.button>
                                <motion.button
                                  whileTap={{ scale: 0.9 }}
                                  onClick={(e) => { e.preventDefault(); setResettingId(member.id); setShowPinDialog(true); }}
                                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--theme-text-muted)] hover:text-gold hover:bg-gold/10 transition-all"
                                >
                                  <KeyRound size={13} />
                                </motion.button>
                                {member.is_active && (
                                  <motion.button
                                    whileTap={{ scale: 0.9 }}
                                    onClick={(e) => { e.preventDefault(); setDeactivatingId(member.id); setShowDeactivateConfirm(true); }}
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--theme-text-muted)] hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                                  >
                                    <Trash2 size={13} />
                                  </motion.button>
                                )}
                                <ChevronRight size={14} className="text-[var(--theme-text-muted)]" />
                             </motion.div>
                          </div>
                        </Link>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="shifts"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="space-y-6"
          >
            {/* Active Shifts Banner */}
            {activeShifts.length > 0 && (
                <motion.div
                 initial={{ opacity: 0, y: 12 }}
                 animate={{ opacity: 1, y: 0 }}
                 className="bg-[var(--theme-success-soft)] border border-[var(--theme-border)] rounded-2xl p-5"
               >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-[var(--theme-success-soft)] border border-[var(--theme-border)] flex items-center justify-center">
                      <UserCheck size={16} className="text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-xs font-black text-emerald-400 uppercase tracking-wider">Active Now</h3>
                      <p className="text-[10px] text-emerald-400/60 uppercase tracking-widest mt-0.5">
                        {activeShifts.length} staff on shift
                      </p>
                    </div>
                  </div>
                </div>
                <div className="grid gap-2">
                   {activeShifts.map((shift: any, i: number) => {
                     const shiftRoleColor = getRoleColor(getRoleName(shift.staff?.role_id));
                     const isOpen = !shift.closed_at;
                     return (
                       <motion.div
                         key={shift.id}
                         initial={{ opacity: 0, x: -10 }}
                         animate={{ opacity: 1, x: 0 }}
                         transition={{ delay: i * 0.05 }}
                         className="flex items-center justify-between p-4 rounded-[28px] bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]"
                       >
                         <div className="flex items-center gap-3">
                           <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${shiftRoleColor.bg} ${shiftRoleColor.border}`}>
                             {(() => {
                               const RoleIcon = getRoleIcon(getRoleName(shift.staff?.role_id));
                               return <RoleIcon size={14} className={shiftRoleColor.text} />;
                             })()}
                           </div>
                           <div>
                             <p className="text-sm font-bold text-[var(--theme-text)]">{shift.staff?.name || 'Unknown'}</p>
                             <p className="text-[10px] text-[var(--theme-text-muted)]">
                               Started {new Date(shift.opened_at).toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' })}
                               {isOpen && ` · ${formatDuration(shift.opened_at)}`}
                             </p>
                           </div>
                         </div>
                         <div className="flex items-center gap-4">
                           <div className="text-right hidden sm:block">
                             <p className="text-xs text-[var(--theme-text-secondary)] tabular-nums">{formatCurrency(shift.expected_cash)}</p>
                             <p className="text-[10px] text-[var(--theme-text-muted)]">expected</p>
                           </div>
                           <button
                             onClick={() => handleOpenCloseSheet(shift)}
                             className="px-4 py-2 bg-white text-black rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-white/90 transition-all shadow-lg active:scale-95"
                           >
                             Manage
                           </button>
                         </div>
                       </motion.div>
                     );
                   })}
                 </div>
              </motion.div>
            )}

            {activeShifts.length === 0 && (
              <div className="flex justify-end">
                <button
                  onClick={handleClockIn}
                  className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-white/90 transition-all shadow-lg active:scale-95"
                >
                  <Plus size={14} />
                  Open Shift
                </button>
              </div>
            )}

            {/* Shift History */}
            <div>
              <h3 className="text-xs uppercase tracking-widest text-[var(--theme-text-muted)] font-bold mb-4">Today</h3>
              {shiftsLoading ? (
                <ShiftSkeleton />
              ) : todayShifts.length === 0 ? (
                <ShiftsEmptyState />
              ) : (
                <div className="space-y-1">
                  <AnimatePresence mode="popLayout">
                    {todayShifts.map((shift: any, idx: number) => {
                      const isOpen = !shift.closed_at;
                      return (
                         <motion.div
                           key={shift.id}
                           layout
                           initial={{ opacity: 0, y: 8 }}
                           animate={{ opacity: 1, y: 0 }}
                           exit={{ opacity: 0, y: -8 }}
                           transition={{ duration: 0.18, delay: idx * 0.03 }}
                           className="flex items-center justify-between px-5 py-3.5 rounded-2xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] hover:bg-[var(--theme-surface)] transition-colors"
                         >
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${isOpen ? 'bg-emerald-400 animate-pulse' : 'bg-[var(--theme-text-muted)]'}`} />
                            <div>
                              <p className="text-sm font-bold text-[var(--theme-text)]">{shift.staff?.name || 'Unknown'}</p>
                              <p className="text-[10px] text-[var(--theme-text-muted)]">
                                {new Date(shift.opened_at).toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' })}
                                {shift.closed_at && ` → ${new Date(shift.closed_at).toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' })}`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right hidden sm:block">
                              <p className="text-xs text-[var(--theme-text-secondary)] tabular-nums">
                                {isOpen ? formatDuration(shift.opened_at) : 'Closed'}
                              </p>
                              <p className="text-[10px] text-[var(--theme-text-muted)]">
                                {shift.actual_cash !== null && shift.actual_cash !== undefined
                                  ? `Variance: ${formatCurrency(shift.difference)}`
                                  : formatCurrency(shift.expected_cash)}
                              </p>
                            </div>
                             <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                               isOpen
                                 ? 'bg-emerald-500/10 text-emerald-400 border-[var(--theme-border)]'
                                 : 'bg-[var(--theme-surface-soft)] text-[var(--theme-text-muted)] border-[var(--theme-border)]'
                             }`}>
                              {isOpen ? 'Active' : 'Closed'}
                            </span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog open={showDeactivateConfirm} onClose={() => { setShowDeactivateConfirm(false); setDeactivatingId(null); }} onConfirm={handleDeactivate} title="Deactivate" description="Deactivate this staff member? Historical records will be preserved." confirmLabel="Deactivate" destructive loading={saving} />
      <PinInputDialog open={showPinDialog} onClose={() => { setShowPinDialog(false); setResettingId(null); }} onConfirm={handleResetPin} title="Reset PIN" description="Enter new 4-digit PIN" loading={pinLoading} />

      <StaffSheet open={showSheet} onClose={() => setShowSheet(false)} editingStaff={editingStaff} roles={roles} saving={saving} form={form} onFormChange={setForm} onSubmit={handleSubmit} />

      <AnimatePresence>
        {showCloseSheet && closeShiftData && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22, ease: 'easeOut' }} className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md" onClick={() => setShowCloseSheet(false)} />
            <motion.div initial={{ x: '100%', opacity: 0.8 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '100%', opacity: 0.8 }} transition={{ type: 'spring', stiffness: 400, damping: 35, mass: 0.9 }} className="fixed right-0 top-0 bottom-0 z-[101] w-full max-w-md bg-[var(--theme-surface)] border-l border-[var(--theme-border)] shadow-2xl flex flex-col rounded-l-[3.5rem]">
              <div className="p-6 border-b border-[var(--theme-border)]">
                <h2 className="text-base font-black text-[var(--theme-text)]">Close Shift</h2>
                <p className="text-[10px] text-[var(--theme-text-muted)] mt-1 uppercase tracking-widest">{closeShiftData.staff?.name || 'Unknown'} — Cash details</p>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="p-4 rounded-2xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--theme-text-secondary)] uppercase tracking-wider font-bold">Expected cash</span>
                    <span className="text-sm font-black text-[var(--theme-text)] tabular-nums">{formatCurrency(closeShiftData.expected_cash)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--theme-text-secondary)] uppercase tracking-wider font-bold">Starting cash</span>
                    <span className="text-sm font-bold text-[var(--theme-text-secondary)] tabular-nums">{formatCurrency(closeShiftData.starting_cash)}</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-bold">Actual cash *</label>
                  <input type="number" step="0.01" value={closeActualCash} onChange={(e) => setCloseActualCash(e.target.value)} placeholder="0.00" className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] px-4 py-3 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none rounded-2xl transition-all tabular-nums" />
                </div>
                {closeActualCash && closeShiftData.expected_cash > 0 && (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={`p-4 rounded-2xl border ${parseFloat(closeActualCash) === closeShiftData.expected_cash ? 'bg-emerald-500/10 border-[var(--theme-border)]' : parseFloat(closeActualCash) > closeShiftData.expected_cash ? 'bg-blue-500/10 border-[var(--theme-border)]' : 'bg-amber-500/10 border-[var(--theme-border)]'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[var(--theme-text-secondary)] uppercase tracking-wider font-bold">Variance</span>
                      <span className={`text-sm font-black tabular-nums ${parseFloat(closeActualCash) === closeShiftData.expected_cash ? 'text-emerald-400' : parseFloat(closeActualCash) > closeShiftData.expected_cash ? 'text-blue-400' : 'text-amber-400'}`}>
                        {formatCurrency(parseFloat(closeActualCash) - closeShiftData.expected_cash)}
                      </span>
                    </div>
                    <p className="text-[10px] text-[var(--theme-text-muted)] mt-1">{parseFloat(closeActualCash) === closeShiftData.expected_cash ? 'Balanced' : parseFloat(closeActualCash) > closeShiftData.expected_cash ? 'Over' : 'Short'}</p>
                  </motion.div>
                )}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-bold">Notes</label>
                  <textarea value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} rows={3} placeholder="Optional notes..." className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] px-4 py-3 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none rounded-2xl transition-all resize-none" />
                </div>
              </div>
              <div className="p-6 border-t border-[var(--theme-border)] flex items-center justify-end gap-3">
                <button onClick={() => setShowCloseSheet(false)} className="px-5 py-2.5 text-xs font-bold text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-colors rounded-xl hover:bg-[var(--theme-surface-soft)]">Cancel</button>
                <button onClick={handleCloseShift} disabled={closingShift || !closeActualCash} className="flex items-center gap-2 bg-white text-black px-6 py-2.5 rounded-2xl font-bold text-xs tracking-wide transition-all disabled:opacity-40 shadow-lg hover:bg-white/90 active:scale-95">
                  {closingShift ? <span className="w-3.5 h-3.5 border-2 border-black/20 border-t-black rounded-full animate-spin" /> : <Timer size={12} />}
                  Close Shift
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
