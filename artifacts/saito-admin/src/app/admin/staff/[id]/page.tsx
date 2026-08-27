'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, TrendingUp, Clock, DollarSign, ShoppingBag, AlertTriangle,
  Calendar, Activity, Timer, Wallet, RefreshCw, X, ChevronRight,
  User, Phone, Briefcase, Ban, Trash2, RotateCcw, Tag, Shield, Mail, KeyRound
} from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { toast } from '@/lib/toast';
import GoldSelect from '@/components/GoldSelect';
import { EmptyState } from '@/components/ui/primitives';

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
  hourly_rate?: number;
};

type Stats = {
  period: string;
  totalOrders: number;
  totalRevenue: number;
  avgCheck: number;
  todayOrders: number;
  todayVoids: number;
  todayWaste: number;
  todayRefunds: number;
  todayDiscounts: number;
  totalShifts: number;
  totalHours: number;
};

type ActionLog = {
  id: string;
  action: string;
  created_at: string;
  table_number?: number;
  order_id?: string;
  old_values?: any;
  new_values?: any;
};

type Shift = {
  id: string;
  opened_at: string;
  closed_at?: string | null;
  expected_cash?: number;
  actual_cash?: number | null;
  difference?: number | null;
  notes?: string | null;
};

const PERIODS = [
  { value: 'today', label: 'Bu gün' },
  { value: 'week', label: 'Bu həftə' },
  { value: 'month', label: 'Bu ay' },
  { value: 'all', label: 'Bütün' },
];

const ACTION_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  place_order: { label: 'Sifariş', color: 'text-blue-400', icon: ShoppingBag },
  send_to_kitchen: { label: 'Mətbəxə göndər', color: 'text-orange-400', icon: Activity },
  complete_payment: { label: 'Ödəniş', color: 'text-emerald-400', icon: DollarSign },
  create_order: { label: 'Yeni sifariş', color: 'text-blue-400', icon: ShoppingBag },
  void_order: { label: 'Void', color: 'text-red-400', icon: Ban },
  waste: { label: 'İtki', color: 'text-red-400', icon: Trash2 },
  refund: { label: 'Refund', color: 'text-rose-400', icon: RotateCcw },
  discount: { label: 'Endirim', color: 'text-amber-400', icon: Tag },
  cancel: { label: 'Ləğv', color: 'text-red-400', icon: Ban },
  clock_in: { label: 'Smena açıldı', color: 'text-emerald-400', icon: Clock },
  clock_out: { label: 'Smena bağlandı', color: 'text-purple-400', icon: Clock },
};

export default function StaffDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { lightMode } = useTheme();
  const { t } = useLanguage();
  const staffId = params.id as string;

  const [staff, setStaff] = useState<StaffMember | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [actions, setActions] = useState<ActionLog[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [showEditSheet, setShowEditSheet] = useState(false);
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
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/staff/${staffId}?period=${period}`);
      if (res.ok) {
        const data = await res.json();
        setStaff(data.staff);
        setStats(data.stats);
        setActions(data.recentActions || []);
        setShifts(data.shifts || []);
        setActiveShift(data.activeShift || null);
      } else {
        toast.error('Məlumat yüklənə bilmədi');
      }
    } catch {
      toast.error('Xəta baş verdi');
    } finally {
      setLoading(false);
    }
  }, [staffId, period]);

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

  useEffect(() => {
    fetchData();
    fetchRoles();
  }, [fetchData, fetchRoles]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('az-AZ', { style: 'currency', currency: 'AZN' }).format(val);
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

  const formatHours = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}s ${m}d`;
  };

  const getActionMeta = (action: string) => {
    return ACTION_LABELS[action] || { label: action, color: 'text-white/60', icon: Activity };
  };

  const getRoleName = (roleId?: string) => {
    if (!roleId) return staff?.role || '—';
    const role = roles.find(r => r.id === roleId);
    return role?.name || staff?.role || '—';
  };

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

  const openEditSheet = () => {
    if (!staff) return;
    setForm({
      name: staff.name,
      email: staff.email || '',
      phone: staff.phone || '',
      role_id: staff.role_id || '',
      shift: staff.shift || '',
      hourly_rate: staff.hourly_rate?.toString() || '',
      is_active: staff.is_active,
      pin: '',
    });
    setShowEditSheet(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staff) return;
    setSaving(true);
    try {
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

      const res = await fetch(`/api/staff/${staff.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success('Məlumatlar yeniləndi');
        setShowEditSheet(false);
        fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Yenilənə bilmədi');
      }
    } catch {
      toast.error('Xəta baş verdi');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!staff) return;
    if (!confirm('Bu işçini deaktiv etmək istəyirsiniz? Tarixi məlumatlar qorunacaq.')) return;
    try {
      const res = await fetch(`/api/staff/${staff.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      });
      if (res.ok) {
        toast.success('İşçi deaktiv edildi');
        fetchData();
      } else {
        toast.error('Deaktiv edilə bilmədi');
      }
    } catch {
      toast.error('Xəta baş verdi');
    }
  };

  const handleResetPin = async () => {
    if (!staff) return;
    const newPin = prompt('Yeni PIN (4 rəqəm):');
    if (!newPin || !/^\d{4}$/.test(newPin)) {
      toast.error('PIN 4 rəqəmli olmalıdır');
      return;
    }
    try {
      const res = await fetch(`/api/staff/${staff.id}`, {
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

  if (loading && !staff) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-white/5 rounded w-1/3" />
          <div className="h-64 bg-white/5 rounded-2xl" />
          <div className="h-48 bg-white/5 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!staff) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <EmptyState
          icon={<User size={48} />}
          title="İşçi tapılmadı"
          description="Seçdiyiniz işçi mövcud deyil"
          action={
            <button
              onClick={() => router.push('/admin/staff')}
              className="px-4 py-2 bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-xl text-xs font-bold text-[var(--theme-text)] hover:bg-[var(--theme-panel)] transition-all"
            >
              Geri qayıt
            </button>
          }
        />
      </div>
    );
  }

  const roleName = getRoleName(staff.role_id);
  const roleColor = getRoleColor(roleName);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/admin/staff')}
          className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--theme-surface)] border border-[var(--theme-border)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-all"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${
              staff.is_active ? 'bg-gold/10 text-gold' : 'bg-white/5 text-white/30'
            }`}>
              {staff.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-black text-[var(--theme-text)]">{staff.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${roleColor.bg} ${roleColor.text} ${roleColor.border}`}>
                  <Shield size={10} />
                  {roleName}
                </span>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                  staff.is_active
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-red-500/10 text-red-400 border-red-500/20'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${staff.is_active ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  {staff.is_active ? 'Aktiv' : 'Deaktiv'}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-xl px-3 py-2 text-xs font-bold text-[var(--theme-text)] outline-none focus:border-[var(--theme-border-strong)]"
          >
            {PERIODS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <button
            onClick={openEditSheet}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--theme-surface)] text-[var(--theme-text)] text-xs font-bold rounded-2xl hover:bg-[var(--theme-panel)] transition-all border border-[var(--theme-border)]"
          >
            <Edit3 size={14} />
            Redaktə
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Satış', value: formatCurrency(stats.totalRevenue), icon: DollarSign, color: 'text-emerald-400' },
            { label: 'Sifariş', value: String(stats.totalOrders), icon: ShoppingBag, color: 'text-blue-400' },
            { label: 'Orta çek', value: formatCurrency(stats.avgCheck), icon: TrendingUp, color: 'text-purple-400' },
            { label: 'Saat', value: formatHours(stats.totalHours), icon: Clock, color: 'text-amber-400' },
          ].map((stat, idx) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-[var(--theme-surface-muted)] border border-[var(--theme-border)] rounded-2xl p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <stat.icon size={16} className={stat.color} />
                <span className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold">{stat.label}</span>
              </div>
              <p className="text-xl font-black text-[var(--theme-text)] tabular-nums">{stat.value}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Current Shift */}
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
              Başladı: {formatTime(activeShift.opened_at)}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] mb-1">Gözlənilən nağd</p>
              <p className="text-sm font-bold text-[var(--theme-text)]">₼{(activeShift.expected_cash || 0).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] mb-1">Başlanğıc</p>
              <p className="text-sm font-bold text-[var(--theme-text)]">{formatDate(activeShift.opened_at)}</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[var(--theme-surface-muted)] border border-[var(--theme-border)] rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-[var(--theme-text)] flex items-center gap-2">
            <User size={14} className="text-gold" />
            Şəxsi məlumat
          </h3>
          {[
            { label: 'Telefon', value: staff.phone, icon: Phone },
            { label: 'Email', value: staff.email, icon: Mail },
            { label: 'Smeta', value: staff.shift, icon: Clock },
            { label: 'Haqqında', value: staff.hourly_rate ? `₼${staff.hourly_rate}/saat` : null, icon: Briefcase },
            { label: 'Qeydiyyat', value: formatDate(staff.created_at), icon: Calendar },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between text-sm">
              <span className="text-[var(--theme-text-secondary)] flex items-center gap-2">
                {item.icon && <item.icon size={12} className="text-[var(--theme-text-muted)]" />}
                {item.label}
              </span>
              <span className="text-[var(--theme-text)] font-medium">{item.value || '—'}</span>
            </div>
          ))}
        </div>

        <div className="bg-[var(--theme-surface-muted)] border border-[var(--theme-border)] rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-[var(--theme-text)] flex items-center gap-2">
            <Activity size={14} className="text-gold" />
            Bu dövrə statistika
          </h3>
          {[
            { label: 'Sifariş', value: stats?.todayOrders || 0, color: 'text-blue-400' },
            { label: 'Void', value: stats?.todayVoids || 0, color: 'text-red-400' },
            { label: 'İtki', value: stats?.todayWaste || 0, color: 'text-red-400' },
            { label: 'Refund', value: stats?.todayRefunds || 0, color: 'text-rose-400' },
            { label: 'Endirim', value: stats?.todayDiscounts || 0, color: 'text-amber-400' },
            { label: 'Smena', value: stats?.totalShifts || 0, color: 'text-emerald-400' },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between text-sm">
              <span className="text-[var(--theme-text-secondary)]">{item.label}</span>
              <span className={`text-sm font-bold tabular-nums ${item.color}`}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="bg-[var(--theme-surface-muted)] border border-[var(--theme-border)] rounded-2xl p-6">
        <h3 className="text-sm font-bold text-[var(--theme-text)] mb-4">Son əməliyyatlar</h3>
        {actions.length === 0 ? (
          <p className="text-sm text-[var(--theme-text-muted)] text-center py-4">Bu dövrdə əməliyyat yoxdur</p>
        ) : (
          <div className="space-y-2">
            {actions.slice(0, 20).map(action => {
              const meta = getActionMeta(action.action);
              const Icon = meta.icon;
              return (
                <div
                  key={action.id}
                  className="flex items-start gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-white/5 ${meta.color}`}>
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-[var(--theme-text)]">{meta.label}</span>
                      {action.table_number && (
                        <span className="text-[10px] text-[var(--theme-text-muted)] bg-white/5 px-2 py-0.5 rounded-lg">
                          Masa {action.table_number}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-[var(--theme-text-muted)]">{formatDate(action.created_at)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Shift History */}
      <div className="bg-[var(--theme-surface-muted)] border border-[var(--theme-border)] rounded-2xl p-6">
        <h3 className="text-sm font-bold text-[var(--theme-text)] mb-4">Smena tarixçəsi</h3>
        {shifts.length === 0 ? (
          <p className="text-sm text-[var(--theme-text-muted)] text-center py-4">Smeta tarixçəsi yoxdur</p>
        ) : (
          <div className="space-y-2">
            {shifts.slice(0, 10).map(shift => {
              const duration = shift.closed_at
                ? (new Date(shift.closed_at).getTime() - new Date(shift.opened_at).getTime()) / (1000 * 60 * 60)
                : null;
              return (
                <div
                  key={shift.id}
                  className="flex items-center justify-between p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--theme-text)]">
                      {formatDate(shift.opened_at)}
                    </p>
                    <p className="text-xs text-[var(--theme-text-muted)] mt-1">
                      Başladı: {formatTime(shift.opened_at)}
                      {shift.closed_at && ` · Bitdi: ${formatTime(shift.closed_at)}`}
                    </p>
                  </div>
                  <div className="text-right">
                    {duration !== null ? (
                      <p className="text-sm font-bold text-[var(--theme-text)] tabular-nums">
                        {formatHours(duration)}
                      </p>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Aktiv
                      </span>
                    )}
                    {shift.difference !== undefined && shift.difference !== null && (
                      <p className={`text-xs font-bold ${shift.difference >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {shift.difference >= 0 ? '+' : ''}{shift.difference.toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Sheet */}
      <AnimatePresence>
        {showEditSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-xl"
              onClick={() => setShowEditSheet(false)}
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
                  <h2 className="text-lg font-black text-[var(--theme-text)]">İşçi Redaktə</h2>
                  <p className="text-xs text-[var(--theme-text-muted)] mt-1">Məlumatları dəyişdir</p>
                </div>
                <button
                  onClick={() => setShowEditSheet(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--theme-surface-soft)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleUpdate} className="flex-1 overflow-y-auto p-6 space-y-5">
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-semibold">
                    Ad Soyad *
                  </label>
                  <input
                    required
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
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
                    className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] px-4 py-2.5 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none rounded-xl transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-semibold">
                    <KeyRound size={10} className="text-gold/70" /> Yeni PIN (boş qoysanız dəyişməz)
                  </label>
                  <input
                    maxLength={4}
                    value={form.pin}
                    onChange={e => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                    placeholder="0000"
                    className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] px-4 py-2.5 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none rounded-xl transition-all tracking-widest"
                  />
                </div>

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

              <div className="p-6 border-t border-[var(--theme-border)] flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleDeactivate}
                  disabled={!staff.is_active}
                  className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-red-400 hover:bg-red-500/10 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 size={14} />
                  Deaktiv et
                </button>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowEditSheet(false)}
                    className="px-5 py-2.5 text-xs text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-colors rounded-lg hover:bg-[var(--theme-surface-muted)]"
                  >
                    Ləğv Et
                  </button>
                  <button
                    onClick={handleUpdate}
                    disabled={saving || !form.name.trim()}
                    className="flex items-center gap-2 bg-[var(--theme-surface)] text-[var(--theme-text)] px-6 py-2.5 rounded-2xl font-bold text-xs tracking-wide transition-all disabled:opacity-40 shadow-[0_10px_28px_rgba(0,0,0,0.12)] hover:bg-[var(--theme-panel)]"
                  >
                    {saving ? (
                      <div className="w-3.5 h-3.5 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <RefreshCw size={12} />
                    )}
                    Yadda Saxla
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
