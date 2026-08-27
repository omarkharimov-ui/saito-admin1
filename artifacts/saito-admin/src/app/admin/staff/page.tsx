'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Users, Clock, Phone, Filter, X, Plus, MoreVertical, Shield, Mail, Trash2, Edit3, KeyRound, ChevronRight } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { toast } from '@/lib/toast';
import GoldSelect from '@/components/GoldSelect';
import { useFirstLoad } from '@/hooks/useFirstLoad';
import { EmptyState } from '@/components/ui/primitives';
import Link from 'next/link';

type StaffMember = {
  id: string;
  name: string;
  role: string;
  role_id?: string;
  shift: string | null;
  phone: string | null;
  email?: string | null;
  is_active: boolean;
  created_at: string;
  activeShift?: {
    id: string;
    opened_at: string;
  } | null;
};

type Role = {
  id: string;
  name: string;
  is_system: boolean;
};

const SORT_OPTIONS = [
  { value: 'name_asc', label: 'Ad (A-Z)' },
  { value: 'name_desc', label: 'Ad (Z-A)' },
  { value: 'role_asc', label: 'Rol (A-Z)' },
  { value: 'created_desc', label: 'Son əlavə edilən' },
];

export default function StaffPage() {
  const { lightMode } = useTheme();
  const { t } = useLanguage();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [shiftStatusFilter, setShiftStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('name_asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showSheet, setShowSheet] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    role_id: '',
    shift: '',
    hourly_rate: '',
    is_active: true,
    pin: '',
  });

  const isFirstLoad = useFirstLoad(400, loading);

  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch('/api/staff/roles');
      if (res.ok) {
        const data = await res.json();
        setRoles(data.roles || []);
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (roleFilter) params.set('role_id', roleFilter);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/staff?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setStaff(Array.isArray(data) ? data : []);
      } else {
        setStaff([]);
      }
    } catch {
      setStaff([]);
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, statusFilter]);

  useEffect(() => {
    fetchStaff();
    fetchRoles();
  }, [fetchStaff, fetchRoles]);

  const sortedStaff = useMemo(() => {
    const sorted = [...staff];
    switch (sortBy) {
      case 'name_asc':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'name_desc':
        sorted.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'role_asc':
        sorted.sort((a, b) => (a.role || '').localeCompare(b.role || ''));
        break;
      case 'created_desc':
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
    }
    return sorted;
  }, [staff, sortBy]);

  const filteredStaff = useMemo(() => {
    if (!shiftStatusFilter) return sortedStaff;
    return sortedStaff.filter(s => {
      if (shiftStatusFilter === 'open') return !!s.activeShift;
      if (shiftStatusFilter === 'closed') return !s.activeShift;
      return true;
    });
  }, [sortedStaff, shiftStatusFilter]);

  const stats = useMemo(() => {
    const total = staff.length;
    const active = staff.filter(s => s.is_active).length;
    const inactive = total - active;
    const onShift = staff.filter(s => s.activeShift).length;
    return { total, active, inactive, onShift };
  }, [staff]);

  const getRoleName = useCallback((roleId?: string) => {
    if (!roleId) return '—';
    const role = roles.find(r => r.id === roleId);
    return role?.name || '—';
  }, [roles]);

  const getRoleColor = (roleName: string) => {
    const colors: Record<string, { bg: string; text: string; border: string }> = {
      'superadmin': { bg: 'bg-gold/10', text: 'text-gold', border: 'border-gold/20' },
      'admin': { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
      'manager': { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
      'cashier': { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
      'waiter': { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20' },
      'kitchen': { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
      'bartender': { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
      'host': { bg: 'bg-pink-500/10', text: 'text-pink-400', border: 'border-pink-500/20' },
      'stock': { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20' },
      'accountant': { bg: 'bg-teal-500/10', text: 'text-teal-400', border: 'border-teal-500/20' },
      'owner': { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20' },
    };
    return colors[roleName] || { bg: 'bg-white/5', text: 'text-white/60', border: 'border-white/10' };
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredStaff.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredStaff.map(s => s.id)));
    }
  };

  const handleBulkDeactivate = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size} işçini deaktiv etmək istəyirsiniz?`)) return;

    setSaving(true);
    try {
      const res = await fetch('/api/staff', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds), is_active: false }),
      });

      if (res.ok) {
        toast.success(`${selectedIds.size} işçi deaktiv edildi`);
        setSelectedIds(new Set());
        fetchStaff();
      } else {
        toast.error('Deaktiv edilə bilmədi');
      }
    } catch {
      toast.error('Xəta baş verdi');
    } finally {
      setSaving(false);
    }
  };

  const openAddSheet = () => {
    setEditingStaff(null);
    setForm({ name: '', email: '', phone: '', role_id: '', shift: '', hourly_rate: '', is_active: true, pin: '' });
    setShowSheet(true);
  };

  const openEditSheet = (member: StaffMember) => {
    setEditingStaff(member);
    setForm({
      name: member.name,
      email: member.email || '',
      phone: member.phone || '',
      role_id: member.role_id || '',
      shift: member.shift || '',
      hourly_rate: '',
      is_active: member.is_active,
      pin: '',
    });
    setShowSheet(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editingStaff ? `/api/staff/${editingStaff.id}` : '/api/staff';
      const method = editingStaff ? 'PATCH' : 'POST';

      const body: any = {
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        role_id: form.role_id || null,
        shift: form.shift.trim() || null,
        is_active: form.is_active,
      };

      if (form.pin && form.pin.length === 4) {
        body.pin = form.pin;
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success(editingStaff ? 'İşçi yeniləndi' : 'İşçi əlavə edildi');
        setShowSheet(false);
        fetchStaff();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Xəta baş verdi');
      }
    } catch {
      toast.error('Xəta baş verdi');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm('Bu işçini deaktiv etmək istəyirsiniz? Tarixi məlumatlar qorunacaq.')) return;
    try {
      const res = await fetch(`/api/staff/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      });
      if (res.ok) {
        toast.success('İşçi deaktiv edildi');
        fetchStaff();
      } else {
        toast.error('Deaktiv edilə bilmədi');
      }
    } catch {
      toast.error('Xəta baş verdi');
    }
  };

  const handleResetPin = async (id: string) => {
    const newPin = prompt('Yeni PIN (4 rəqəm):');
    if (!newPin || !/^\d{4}$/.test(newPin)) {
      toast.error('PIN 4 rəqəmli olmalıdır');
      return;
    }
    try {
      const res = await fetch(`/api/staff/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: newPin }),
      });
      if (res.ok) {
        toast.success('PIN yeniləndi');
      } else {
        toast.error('PIN yenilənə bilmədi');
      }
    } catch {
      toast.error('Xəta baş verdi');
    }
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[var(--theme-text)]">İşçilər</h1>
          <p className="text-sm text-[var(--theme-text-secondary)] mt-1">
            {stats.total} işçi · {stats.active} aktiv · {stats.onShift} smenada
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <button
              onClick={handleBulkDeactivate}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-2xl text-xs font-bold hover:bg-rose-500/20 transition-all disabled:opacity-50"
            >
              <Trash2 size={14} />
              {selectedIds.size} deaktiv et
            </button>
          )}
          <button
            onClick={openAddSheet}
            className="flex items-center gap-2 px-5 py-2.5 bg-[var(--theme-surface)] text-[var(--theme-text)] text-xs font-bold rounded-2xl hover:bg-[var(--theme-panel)] transition-all shadow-[0_10px_28px_rgba(0,0,0,0.12)] border border-[var(--theme-border)]"
          >
            <Plus size={14} />
            Yeni İşçi
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[var(--theme-surface-muted)] border border-[var(--theme-border)] rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Ad, telefon və ya email axtar..."
              className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none focus:border-[var(--theme-border-strong)]"
            />
          </div>
          <GoldSelect
            value={roleFilter}
            options={[{ value: '', label: 'Bütün rollar' }, ...roles.map(r => ({ value: r.id, label: r.name }))]}
            onChange={(val) => setRoleFilter(val as string)}
          />
          <GoldSelect
            value={statusFilter}
            options={[
              { value: '', label: 'Bütün vəziyyət' },
              { value: 'true', label: 'Aktiv' },
              { value: 'false', label: 'Deaktiv' },
            ]}
            onChange={(val) => setStatusFilter(val as string)}
          />
          <GoldSelect
            value={shiftStatusFilter}
            options={[
              { value: '', label: 'Smena vəziyyəti' },
              { value: 'open', label: 'Aktiv smena' },
              { value: 'closed', label: 'Bağlanmış' },
            ]}
            onChange={(val) => setShiftStatusFilter(val as string)}
          />
          <GoldSelect
            value={sortBy}
            options={SORT_OPTIONS}
            onChange={(val) => setSortBy(val as string)}
          />
          {(search || roleFilter || statusFilter || shiftStatusFilter) && (
            <button
              onClick={() => { setSearch(''); setRoleFilter(''); setStatusFilter(''); setShiftStatusFilter(''); }}
              className="flex items-center gap-1 px-3 py-2 text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              <X size={12} /> Təmizlə
            </button>
          )}
        </div>
      </div>

      {/* Staff Table */}
      {isFirstLoad ? (
        <div className="bg-[var(--theme-surface-muted)] border border-[var(--theme-border)] rounded-2xl overflow-hidden">
          <div className="animate-pulse">
            <div className="h-12 bg-white/5 border-b border-[var(--theme-border)]" />
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-16 bg-white/5 border-b border-[var(--theme-border)] last:border-b-0" />
            ))}
          </div>
        </div>
      ) : filteredStaff.length === 0 ? (
        <EmptyState
          icon={<Users size={48} />}
          title="İşçi tapılmadı"
          description="Axtarış kriteriyalarını dəyişdirin və ya yeni işçi əlavə edin"
        />
      ) : (
        <div className="bg-[var(--theme-surface-muted)] border border-[var(--theme-border)] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--theme-border)]">
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filteredStaff.length && filteredStaff.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-[var(--theme-border)]"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold">İşçi</th>
                  <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold">Rol</th>
                  <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold">Status</th>
                  <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold">Smeta</th>
                  <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold">Əlaqə</th>
                  <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold">Əməliyyatlar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--theme-border)]">
                <AnimatePresence mode="popLayout">
                  {filteredStaff.map((member, idx) => {
                    const roleName = getRoleName(member.role_id);
                    const roleColor = getRoleColor(roleName);
                    const isSelected = selectedIds.has(member.id);
                    const isOnShift = !!member.activeShift;

                    return (
                      <motion.tr
                        key={member.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2, delay: idx * 0.02 }}
                        className={`group hover:bg-white/[0.02] transition-colors ${isSelected ? 'bg-gold/[0.04]' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(member.id)}
                            className="rounded border-[var(--theme-border)]"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/admin/staff/${member.id}`} className="flex items-center gap-3 min-w-[200px]">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                              member.is_active ? 'bg-gold/10 text-gold' : 'bg-white/5 text-white/30'
                            }`}>
                              {member.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-[var(--theme-text)] truncate group-hover:text-gold transition-colors">{member.name}</p>
                              <p className="text-[10px] text-[var(--theme-text-muted)] truncate">{member.email || '—'}</p>
                            </div>
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${roleColor.bg} ${roleColor.text} ${roleColor.border}`}>
                            <Shield size={10} />
                            {roleName}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                            member.is_active
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-red-500/10 text-red-400 border-red-500/20'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${member.is_active ? 'bg-emerald-400' : 'bg-red-400'}`} />
                            {member.is_active ? 'Aktiv' : 'Deaktiv'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {isOnShift ? (
                            <div className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              <span className="text-xs text-emerald-400 font-medium">
                                Başladı: {formatTime(member.activeShift!.opened_at)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-[var(--theme-text-muted)]">Smetada deyil</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            {member.phone && (
                              <span className="flex items-center gap-1 text-xs text-[var(--theme-text-secondary)]">
                                <Phone size={10} />
                                {member.phone}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Link href={`/admin/staff/${member.id}`} className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] hover:bg-white/5 transition-all">
                              <ChevronRight size={14} />
                            </Link>
                            <button
                              onClick={() => openEditSheet(member)}
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] hover:bg-white/5 transition-all"
                              title="Redaktə et"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              onClick={() => handleResetPin(member.id)}
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--theme-text-muted)] hover:text-gold hover:bg-gold/10 transition-all"
                              title="PIN sıfırla"
                            >
                              <KeyRound size={14} />
                            </button>
                            {member.is_active && (
                              <button
                                onClick={() => handleDeactivate(member.id)}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--theme-text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-all"
                                title="Deaktiv et"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Staff Sheet */}
      <AnimatePresence>
        {showSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-xl"
              onClick={() => setShowSheet(false)}
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
                  <h2 className="text-lg font-black text-[var(--theme-text)]">
                    {editingStaff ? 'İşçi Redaktə' : 'Yeni İşçi'}
                  </h2>
                  <p className="text-xs text-[var(--theme-text-muted)] mt-1">
                    {editingStaff ? 'Məlumatları dəyişdir' : 'Yeni işçi əlavə et'}
                  </p>
                </div>
                <button
                  onClick={() => setShowSheet(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--theme-surface-soft)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-semibold">
                    Ad Soyad *
                  </label>
                  <input
                    required
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="Tural Məmmədov"
                    className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] px-4 py-2.5 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none rounded-xl transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-semibold">
                    <Mail size={10} className="text-gold/70" /> Email
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    placeholder="tural@example.com"
                    className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] px-4 py-2.5 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none rounded-xl transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-semibold">
                    <Phone size={10} className="text-gold/70" /> Telefon
                  </label>
                  <input
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    placeholder="050 000 00 00"
                    className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] px-4 py-2.5 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none rounded-xl transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-semibold">
                    <Shield size={10} className="text-gold/70" /> Rol
                  </label>
                  <GoldSelect
                    value={form.role_id}
                    options={[{ value: '', label: 'Rol seçin' }, ...roles.map(r => ({ value: r.id, label: r.name }))]}
                    onChange={(val) => setForm({ ...form, role_id: val as string })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-semibold">
                    Smeta
                  </label>
                  <input
                    value={form.shift}
                    onChange={e => setForm({ ...form, shift: e.target.value })}
                    placeholder="12:00 – 20:00"
                    className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] px-4 py-2.5 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none rounded-xl transition-all"
                  />
                </div>

                {!editingStaff && (
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-semibold">
                      <KeyRound size={10} className="text-gold/70" /> PIN kod
                    </label>
                    <input
                      maxLength={4}
                      value={form.pin}
                      onChange={e => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                      placeholder="0000"
                      className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] px-4 py-2.5 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none rounded-xl transition-all tracking-widest"
                    />
                    <p className="text-[10px] text-[var(--theme-text-muted)]">4 rəqəmli PIN. Yalnız rəqəmlər.</p>
                  </div>
                )}

                <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-[var(--theme-border)]">
                  <div>
                    <p className="text-xs font-bold text-[var(--theme-text)]">Status</p>
                    <p className="text-[10px] text-[var(--theme-text-muted)] mt-0.5">
                      {form.is_active ? 'Aktiv — sisteme daxil ola bilər' : 'Deaktiv — daxil ola bilməz'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, is_active: !form.is_active })}
                    className={`w-12 h-6 rounded-full transition-all ${
                      form.is_active ? 'bg-emerald-500' : 'bg-white/10'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white shadow-md transition-transform ${
                      form.is_active ? 'translate-x-7' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
              </form>

              <div className="p-6 border-t border-[var(--theme-border)] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowSheet(false)}
                  className="px-5 py-2.5 text-xs text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-colors rounded-lg hover:bg-[var(--theme-surface-muted)]"
                >
                  Ləğv Et
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={saving || !form.name.trim()}
                  className="flex items-center gap-2 bg-[var(--theme-surface)] text-[var(--theme-text)] px-6 py-2.5 rounded-2xl font-bold text-xs tracking-wide transition-all disabled:opacity-40 shadow-[0_10px_28px_rgba(0,0,0,0.12)] hover:bg-[var(--theme-panel)]"
                >
                  {saving ? (
                    <div className="w-3.5 h-3.5 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Plus size={12} />
                  )}
                  {editingStaff ? 'Yadda Saxla' : 'Əlavə Et'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
