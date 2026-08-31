'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Edit3, KeyRound, Trash2, UserCheck,
  Mail, Phone, Clock, CalendarDays, ShoppingBag, DollarSign,
  TrendingUp, Ban, RotateCcw, Tag, Activity, Timer,
  HandPlatter, ChefHat, Martini, ConciergeBell, Package, ReceiptText, Briefcase, ShieldCheck, Crown, Bike, Sparkles, AlertTriangle
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { toast } from '@/lib/toast';
import { getRoleColor, getRoleIcon, getRoleName } from '@/lib/staff-utils';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PinInputDialog } from '../components/PinInputDialog';

type StaffMember = {
  id: string; name: string; role: string; role_id?: string;
  shift: string | null; phone: string | null; email?: string | null;
  is_active: boolean; created_at: string;
  hourly_rate?: number;
};

type Stats = {
  period: string; totalOrders: number; totalRevenue: number; avgCheck: number;
  todayOrders: number; todayVoids: number; todayWaste: number;
  todayRefunds: number; todayDiscounts: number; totalShifts: number; totalHours: number;
};

type ActionLog = {
  id: string; action: string; created_at: string;
  table_number?: number; order_id?: string;
};

type Shift = {
  id: string; opened_at: string; closed_at?: string | null;
  expected_cash?: number; actual_cash?: number | null;
  difference?: number | null; notes?: string | null;
};

const PERIODS = [
  { value: 'today', label: 'TODAY' },
  { value: 'week', label: 'WEEK' },
  { value: 'month', label: 'MONTH' },
  { value: 'all', label: 'ALL' },
];

const ACTION_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  place_order: { label: 'Order', color: 'text-blue-400', icon: ShoppingBag },
  send_to_kitchen: { label: 'Kitchen', color: 'text-orange-400', icon: Activity },
  complete_payment: { label: 'Payment', color: 'text-emerald-400', icon: DollarSign },
  create_order: { label: 'Order', color: 'text-blue-400', icon: ShoppingBag },
  void_order: { label: 'Void', color: 'text-red-400', icon: Ban },
  waste: { label: 'Waste', color: 'text-red-400', icon: Ban },
  refund: { label: 'Refund', color: 'text-rose-400', icon: RotateCcw },
  discount: { label: 'Discount', color: 'text-amber-400', icon: Tag },
  cancel: { label: 'Cancel', color: 'text-red-400', icon: Ban },
  clock_in: { label: 'Clock in', color: 'text-emerald-400', icon: Clock },
  clock_out: { label: 'Clock out', color: 'text-purple-400', icon: Clock },
};

export default function StaffDetailPage() {
  const params = useParams();
  const router = useRouter();
  const staffId = params.id as string;

  const [staff, setStaff] = useState<StaffMember | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [actions, setActions] = useState<ActionLog[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', role_id: '', shift: '', is_active: true, pin: '', hourly_rate: undefined as number | undefined });
  const [roles, setRoles] = useState<any[]>([]);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);

  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch('/api/staff/roles');
      if (res.ok) { const data = await res.json(); setRoles(data.roles || []); }
    } catch { /* ignore */ }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [staffRes, shiftsRes, anomalyRes] = await Promise.all([
        fetch(`/api/staff/${staffId}?period=${period}`),
        fetch(`/api/shifts?staff_id=${staffId}&period=all`),
        fetch(`/api/analytics/anomalies?period=month&staff_id=${staffId}`),
      ]);

      if (staffRes.ok) {
        const data = await staffRes.json();
        setStaff(data.staff);
        setStats(data.stats);
        setActions(data.recentActions || []);
        setActiveShift(data.activeShift || null);
      }
      if (shiftsRes.ok) {
        const data = await shiftsRes.json();
        setShifts(Array.isArray(data) ? data : []);
      }
      if (anomalyRes.ok) {
        const data = await anomalyRes.json();
        setAnomalies(data.anomalies || []);
      }
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [staffId, period]);

  useEffect(() => {
    fetchData();
    fetchRoles();
  }, [fetchData, fetchRoles]);

  const openEditSheet = () => {
    if (!staff) return;
    setForm({
      name: staff.name,
      email: staff.email || '',
      phone: staff.phone || '',
      role_id: staff.role_id || '',
      shift: staff.shift || '',
      is_active: staff.is_active,
      pin: '',
      hourly_rate: staff.hourly_rate,
    });
    setShowEditSheet(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body: any = {
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        role_id: form.role_id || null,
        shift: form.shift.trim() || null,
        is_active: form.is_active,
        hourly_rate: form.hourly_rate ?? null,
      };
      if (form.pin && form.pin.length === 4) body.pin = form.pin;

      const res = await fetch(`/api/staff/${staffId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success('Staff updated');
        setShowEditSheet(false);
        fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to update');
      }
    } catch {
      toast.error('Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/staff/${staffId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      });
      if (res.ok) {
        toast.success('Staff deactivated');
        setShowDeactivateConfirm(false);
        router.push('/admin/staff');
      } else {
        toast.error('Failed to deactivate');
      }
    } catch {
      toast.error('Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleResetPin = async (pin: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/staff/${staffId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        toast.success('PIN reset');
        setShowPinDialog(false);
      } else {
        toast.error('Failed to reset PIN');
      }
    } catch {
      toast.error('Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '—';
    return `₼${Number(val).toLocaleString('az-AZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const monthlySalary = useMemo(() => {
    if (!staff?.hourly_rate) return null;
    const hoursPerMonth = 160;
    return staff.hourly_rate * hoursPerMonth;
  }, [staff?.hourly_rate]);

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('az-AZ', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' });
  };

  const getActionIcon = (action: string) => {
    const found = Object.entries(ACTION_LABELS).find(([key]) => key === action);
    if (found) {
      const Icon = found[1].icon;
      return <Icon size={14} className={found[1].color} />;
    }
    return <Activity size={14} className="text-white/40" />;
  };

  const formatDuration = (openedAt: string) => {
    const diff = Date.now() - new Date(openedAt).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    if (hours > 0) return `${hours}s ${mins % 60}dc`;
    return `${mins} dəq`;
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="h-8 w-48 bg-[var(--theme-surface-soft)] rounded-xl animate-pulse" />
        <div className="h-32 bg-[var(--theme-surface-soft)] rounded-2xl animate-pulse" />
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-[var(--theme-surface-soft)] rounded-2xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!staff) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="text-center py-20">
          <p className="text-sm font-bold text-[var(--theme-text-muted)]">Staff member not found</p>
        </div>
      </div>
    );
  }

  const roleName = getRoleName(staff.role_id, roles);
  const roleColor = getRoleColor(roleName);

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Back + Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          Back to Team
        </button>

        <div className="flex items-start gap-5">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center border ${roleColor.bg} ${roleColor.border}`}>
            {(() => {
              const RoleIcon = getRoleIcon(roleName);
              return <RoleIcon size={28} className={roleColor.text} />;
            })()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-black text-[var(--theme-text)] tracking-tight">{staff.name}</h1>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${roleColor.bg} ${roleColor.text} ${roleColor.border}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${roleColor.dot}`} />
                {roleName}
              </span>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${staff.is_active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${staff.is_active ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                {staff.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <p className="text-[10px] text-[var(--theme-text-muted)] mt-1.5 uppercase tracking-widest">
              {staff.email || staff.phone || 'No contact info'}
              {staff.hourly_rate != null && ` · ${formatCurrency(staff.hourly_rate)}/saat`}
            </p>
            {monthlySalary != null && (
              <p className="text-[10px] text-gold/80 mt-1 uppercase tracking-widest font-bold">
                Təxmini ayliq: {formatCurrency(monthlySalary)}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={openEditSheet}
              className="px-4 py-2 bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] rounded-xl text-xs font-bold text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface)] transition-all active:scale-95"
            >
              <Edit3 size={14} className="inline mr-1.5" />
              Edit
            </button>
            <button
              onClick={() => { setResettingId(staff.id); setShowPinDialog(true); }}
              className="px-4 py-2 bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] rounded-xl text-xs font-bold text-[var(--theme-text-secondary)] hover:text-gold hover:bg-gold/10 transition-all active:scale-95"
            >
              <KeyRound size={14} className="inline mr-1.5" />
              PIN
            </button>
          </div>
        </div>
      </motion.div>

      {/* Active Shift Banner */}
      <AnimatePresence>
        {activeShift && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-emerald-500/[0.07] border border-emerald-500/20 rounded-2xl p-5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                  <UserCheck size={16} className="text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-emerald-400 uppercase tracking-wider">On Shift</h3>
                  <p className="text-[10px] text-emerald-400/60 uppercase tracking-widest mt-0.5">
                    Started {formatTime(activeShift.opened_at)} · {formatDuration(activeShift.opened_at)}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-black text-[var(--theme-text)] tabular-nums">
                  {formatCurrency(activeShift.expected_cash)}
                </p>
                <p className="text-[10px] text-[var(--theme-text-muted)]">expected cash</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Risk / Anomalies Section */}
      {anomalies.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl border p-5 ${
            anomalies[0].level === 'critical' ? 'bg-rose-500/[0.07] border-rose-500/20' :
            anomalies[0].level === 'high' ? 'bg-orange-500/[0.07] border-orange-500/20' :
            anomalies[0].level === 'medium' ? 'bg-amber-500/[0.07] border-amber-500/20' :
            'bg-blue-500/[0.07] border-blue-500/20'
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${
                anomalies[0].level === 'critical' ? 'bg-rose-500/20 border-rose-500/30' :
                anomalies[0].level === 'high' ? 'bg-orange-500/20 border-orange-500/30' :
                anomalies[0].level === 'medium' ? 'bg-amber-500/20 border-amber-500/30' :
                'bg-blue-500/20 border-blue-500/30'
              }`}>
                <AlertTriangle size={16} className={
                  anomalies[0].level === 'critical' ? 'text-rose-400' :
                  anomalies[0].level === 'high' ? 'text-orange-400' :
                  anomalies[0].level === 'medium' ? 'text-amber-400' : 'text-blue-400'
                } />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-white">Risk Score</h3>
                <p className="text-[10px] text-white/40 uppercase tracking-widest">
                  {anomalies[0].level === 'critical' ? 'Critical' : anomalies[0].level === 'high' ? 'High' : anomalies[0].level === 'medium' ? 'Medium' : 'Low'} risk
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black tabular-nums text-white">{anomalies[0].risk_score}</p>
              <p className="text-[10px] text-white/40">/ 100</p>
            </div>
          </div>
          <div className="space-y-2">
            {anomalies[0].anomalies.map((anomaly: any, idx: number) => (
              <div key={idx} className={`flex items-center justify-between p-3 rounded-xl border ${
                anomaly.severity === 'danger' ? 'bg-rose-500/10 border-rose-500/20' :
                anomaly.severity === 'warning' ? 'bg-amber-500/10 border-amber-500/20' :
                'bg-blue-500/10 border-blue-500/20'
              }`}>
                <div>
                  <p className="text-xs font-bold text-white">{anomaly.label}</p>
                  <p className="text-[10px] text-white/50">{anomaly.description}</p>
                </div>
                <div className="text-right">
                  <p className={`text-xs font-black tabular-nums ${
                    anomaly.severity === 'danger' ? 'text-rose-400' :
                    anomaly.severity === 'warning' ? 'text-amber-400' : 'text-blue-400'
                  }`}>{anomaly.value}</p>
                  <p className="text-[10px] text-white/40">vs {anomaly.baseline}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Performance Section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h2 className="text-xs uppercase tracking-widest text-[var(--theme-text-muted)] font-bold mb-4">Performance</h2>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'SALES', value: formatCurrency(stats?.totalRevenue), color: 'text-[var(--theme-text)]' },
            { label: 'ORDERS', value: stats?.totalOrders || 0, color: 'text-[var(--theme-text)]' },
            { label: 'AVG CHECK', value: formatCurrency(stats?.avgCheck), color: 'text-gold' },
          ].map((stat, i) => (
            <div key={stat.label} className="p-5 rounded-2xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
              <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-wider font-bold mb-1">{stat.label}</p>
              <p className={`text-xl font-black tabular-nums ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Period Selector */}
        <div className="flex items-center gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                period === p.value
                  ? 'bg-white text-black shadow-lg'
                  : 'bg-[var(--theme-surface-soft)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface)]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Activity + Shift History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] rounded-2xl p-5"
        >
          <h3 className="text-xs uppercase tracking-widest text-[var(--theme-text-muted)] font-bold mb-4">Activity</h3>
          {actions.length === 0 ? (
            <p className="text-xs text-[var(--theme-text-muted)] text-center py-8">No activity</p>
          ) : (
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {actions.slice(0, 20).map((action, idx) => {
                  const actionMeta = ACTION_LABELS[action.action] || { label: action.action, color: 'text-white/40', icon: Activity };
                  const Icon = actionMeta.icon;
                  return (
                    <motion.div
                      key={action.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.02 }}
                      className="flex items-center justify-between p-3 rounded-xl bg-[var(--theme-surface)] border border-[var(--theme-border)]"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${actionMeta.color.replace('text-', 'bg-').replace('400', '500/10')}`}>
                          <Icon size={14} className={actionMeta.color} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-[var(--theme-text)]">{actionMeta.label}</p>
                          {action.table_number && (
                            <p className="text-[10px] text-[var(--theme-text-muted)]">Table #{action.table_number}</p>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-[var(--theme-text-muted)] tabular-nums">
                        {formatTime(action.created_at)}
                      </span>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </motion.div>

        {/* Shift History */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] rounded-2xl p-5"
        >
          <h3 className="text-xs uppercase tracking-widest text-[var(--theme-text-muted)] font-bold mb-4">Shift History</h3>
          {shifts.length === 0 ? (
            <p className="text-xs text-[var(--theme-text-muted)] text-center py-8">No shifts</p>
          ) : (
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {shifts.slice(0, 10).map((shift, idx) => {
                  const isOpen = !shift.closed_at;
                  return (
                    <motion.div
                      key={shift.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className="flex items-center justify-between p-3 rounded-xl bg-[var(--theme-surface)] border border-[var(--theme-border)]"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${isOpen ? 'bg-emerald-400 animate-pulse' : 'bg-[var(--theme-text-muted)]'}`} />
                        <div>
                          <p className="text-xs font-bold text-[var(--theme-text)]">
                            {formatDate(shift.opened_at)}
                          </p>
                          <p className="text-[10px] text-[var(--theme-text-muted)]">
                            {formatTime(shift.opened_at)}
                            {shift.closed_at && ` → ${formatTime(shift.closed_at)}`}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-[var(--theme-text-secondary)] tabular-nums">
                          {isOpen ? 'Active' : formatCurrency(shift.actual_cash)}
                        </p>
                        {shift.difference !== null && shift.difference !== undefined && (
                          <p className={`text-[10px] tabular-nums ${shift.difference === 0 ? 'text-emerald-400' : shift.difference > 0 ? 'text-blue-400' : 'text-amber-400'}`}>
                            {formatCurrency(shift.difference)}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      </div>

      {/* Edit Sheet */}
      <AnimatePresence>
        {showEditSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md"
              onClick={() => setShowEditSheet(false)}
            />
            <motion.div
              initial={{ x: '100%', opacity: 0.8 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0.8 }}
              transition={{ type: 'spring', stiffness: 400, damping: 35, mass: 0.9 }}
              className="fixed right-0 top-0 bottom-0 z-[101] w-full max-w-md bg-[var(--theme-surface)] border-l border-[var(--theme-border)] shadow-2xl flex flex-col rounded-l-[3.5rem]"
            >
              <div className="p-6 border-b border-[var(--theme-border)]">
                <h2 className="text-base font-black text-[var(--theme-text)]">Edit Staff</h2>
                <p className="text-[10px] text-[var(--theme-text-muted)] mt-1 uppercase tracking-widest">{staff.name}</p>
              </div>

              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-bold">Name *</label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none rounded-2xl transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-bold">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none rounded-2xl transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-bold">Phone</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none rounded-2xl transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-bold">Role</label>
                  <select
                    value={form.role_id}
                    onChange={(e) => setForm({ ...form, role_id: e.target.value })}
                    className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none rounded-2xl transition-all appearance-none cursor-pointer"
                  >
                    <option value="">Select role</option>
                    {roles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-bold">Shift</label>
                  <input
                    value={form.shift}
                    onChange={(e) => setForm({ ...form, shift: e.target.value })}
                    className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none rounded-2xl transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-bold">Hourly Rate (₼)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.hourly_rate ?? ''}
                    onChange={(e) => setForm({ ...form, hourly_rate: e.target.value ? parseFloat(e.target.value) : undefined })}
                    placeholder="0.00"
                    className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] px-4 py-3 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none rounded-2xl transition-all"
                  />
                </div>

                <div className="flex items-center justify-between p-4 rounded-2xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
                  <div>
                    <p className="text-xs font-bold text-[var(--theme-text)]">Status</p>
                    <p className="text-[10px] text-[var(--theme-text-muted)] mt-0.5">
                      {form.is_active ? 'Active' : 'Inactive'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, is_active: !form.is_active })}
                    className={`w-12 h-6 rounded-full transition-all duration-300 ${
                      form.is_active ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30' : 'bg-[var(--theme-surface-soft)]'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white shadow-md transition-transform duration-300 ${
                        form.is_active ? 'translate-x-7' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </form>

              <div className="p-6 border-t border-[var(--theme-border)] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowEditSheet(false)}
                  className="px-5 py-2.5 text-xs font-bold text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-colors rounded-xl hover:bg-[var(--theme-surface-soft)]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={saving || !form.name.trim()}
                  className="flex items-center gap-2 bg-white text-black px-6 py-2.5 rounded-2xl font-bold text-xs tracking-wide transition-all disabled:opacity-40 shadow-lg hover:bg-white/90 active:scale-95"
                >
                  {saving ? (
                    <span className="w-3.5 h-3.5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                  ) : (
                    <Edit3 size={12} />
                  )}
                  Save
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={showDeactivateConfirm}
        onClose={() => setShowDeactivateConfirm(false)}
        onConfirm={handleDeactivate}
        title="Deactivate"
        description="Deactivate this staff member? Historical records will be preserved."
        confirmLabel="Deactivate"
        destructive
        loading={saving}
      />

      <PinInputDialog
        open={showPinDialog}
        onClose={() => setShowPinDialog(false)}
        onConfirm={handleResetPin}
        title="Reset PIN"
        description="Enter new 4-digit PIN"
        loading={saving}
      />
    </div>
  );
}
