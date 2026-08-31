'use client';

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, UserCheck, UserX, KeyRound, Edit3, Trash2,
  Clock, AlertTriangle, Shield, Mail, Phone, Timer,
  ChevronRight
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getRoleColor, getRoleIcon, getRoleName } from '@/lib/staff-utils';
import { PinInputDialog } from './PinInputDialog';
import { ConfirmDialog } from './ConfirmDialog';

type StaffMember = {
  id: string; name: string; role: string; role_id?: string;
  shift: string | null; phone: string | null; email?: string | null;
  is_active: boolean; created_at: string;
  hourly_rate?: number;
  activeShift?: { id: string; opened_at: string; staff_id: string; starting_cash?: number; expected_cash?: number; notes?: string | null } | null;
  risk_score?: number;
  risk_level?: 'low' | 'medium' | 'high' | 'critical';
  anomaly_count?: number;
};

interface StaffDrawerProps {
  staff: StaffMember | null;
  open: boolean;
  onClose: () => void;
  onEdit: (staff: StaffMember) => void;
  onResetPin: (id: string) => void;
  onDeactivate: (id: string) => void;
  onClockIn: () => void;
  onClockOut: () => void;
  clockingIn: boolean;
  clockingOut: boolean;
}

export function StaffDrawer({
  staff, open, onClose, onEdit, onResetPin, onDeactivate,
  onClockIn, onClockOut, clockingIn, clockingOut
}: StaffDrawerProps) {
  const { t } = useLanguage();
  const [showPinDialog, setShowPinDialog] = React.useState(false);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = React.useState(false);
  const [resettingId, setResettingId] = React.useState<string | null>(null);
  const [deactivatingId, setDeactivatingId] = React.useState<string | null>(null);
  const [performance, setPerformance] = React.useState<any>(null);
  const [loadingPerformance, setLoadingPerformance] = React.useState(false);

  useEffect(() => {
    if (!open) {
      setShowPinDialog(false);
      setShowDeactivateConfirm(false);
      setResettingId(null);
      setDeactivatingId(null);
      setPerformance(null);
    }
  }, [open]);

  useEffect(() => {
    if (open && staff?.id) {
      setLoadingPerformance(true);
      fetch(`/api/staff/${staff.id}/performance?period=week`)
        .then(res => res.json())
        .then(data => {
          setPerformance(data);
          setLoadingPerformance(false);
        })
        .catch(() => setLoadingPerformance(false));
    }
  }, [open, staff?.id]);

  if (!staff) return null;

  const roleName = getRoleName(staff.role_id);
  const roleColor = getRoleColor(roleName);
  const isOnShift = !!staff.activeShift;
  const RoleIcon = getRoleIcon(roleName);

  const handleResetPin = () => {
    setResettingId(staff.id);
    setShowPinDialog(true);
  };

  const handleDeactivate = () => {
    setDeactivatingId(staff.id);
    setShowDeactivateConfirm(true);
  };

  const confirmDeactivate = () => {
    if (deactivatingId) {
      onDeactivate(deactivatingId);
      setShowDeactivateConfirm(false);
      setDeactivatingId(null);
    }
  };

  const formatDuration = (openedAt: string) => {
    const diff = Date.now() - new Date(openedAt).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    if (hours > 0) return `${hours}s ${mins % 60}dc`;
    return `${mins} dəq`;
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />

          {/* Drawer Panel */}
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="absolute right-0 top-0 h-full w-full max-w-md bg-[var(--theme-surface)] border-l border-[var(--theme-border)] shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-[var(--theme-border)]">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${roleColor.bg} ${roleColor.border}`}>
                  <RoleIcon size={20} className={roleColor.text} />
                </div>
                <div>
                  <h2 className="text-sm font-black text-[var(--theme-text)]">{staff.name}</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${roleColor.bg} ${roleColor.text} ${roleColor.border}`}>
                      {roleName}
                    </span>
                    {staff.is_active ? (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-rose-400 font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                        Inactive
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)] transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Risk Badge */}
              {staff.anomaly_count && staff.anomaly_count > 0 && (
                <div className={`p-4 rounded-2xl border ${
                  staff.risk_level === 'critical' ? 'bg-rose-500/10 border-rose-500/20' :
                  staff.risk_level === 'high' ? 'bg-orange-500/10 border-orange-500/20' :
                  staff.risk_level === 'medium' ? 'bg-amber-500/10 border-amber-500/20' :
                  'bg-blue-500/10 border-blue-500/20'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={16} className={
                        staff.risk_level === 'critical' ? 'text-rose-400' :
                        staff.risk_level === 'high' ? 'text-orange-400' :
                        staff.risk_level === 'medium' ? 'text-amber-400' : 'text-blue-400'
                      } />
                      <span className="text-xs font-bold text-[var(--theme-text)]">Risk Score</span>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-black tabular-nums text-[var(--theme-text)]">{staff.risk_score}</span>
                      <span className="text-[10px] text-[var(--theme-text-muted)]">/100</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Contact Info */}
              <div className="space-y-3">
                <h3 className="text-[10px] font-black uppercase tracking-wider text-[var(--theme-text-muted)]">Contact</h3>
                <div className="space-y-2">
                  {staff.phone && (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
                      <Phone size={14} className="text-[var(--theme-text-muted)]" />
                      <span className="text-xs text-[var(--theme-text)]">{staff.phone}</span>
                    </div>
                  )}
                  {staff.email && (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
                      <Mail size={14} className="text-[var(--theme-text-muted)]" />
                      <span className="text-xs text-[var(--theme-text)]">{staff.email}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Shift Actions */}
              <div className="space-y-3">
                <h3 className="text-[10px] font-black uppercase tracking-wider text-[var(--theme-text-muted)]">Shift</h3>
                <div className="grid grid-cols-2 gap-3">
                  {!isOnShift ? (
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={onClockIn}
                      disabled={clockingIn}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 hover:bg-emerald-500/20 transition-all disabled:opacity-50"
                    >
                      <UserCheck size={16} />
                      <span className="text-xs font-bold">{clockingIn ? '...' : 'Giriş'}</span>
                    </motion.button>
                  ) : (
                    <div className="col-span-2 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-emerald-400">Aktiv smena</span>
                        <span className="text-[10px] text-emerald-400/60 font-mono">
                          {formatDuration(staff.activeShift!.opened_at)}
                        </span>
                      </div>
                      <div className="text-[10px] text-emerald-400/60 space-y-1">
                        <p>Başlanğıc: {new Date(staff.activeShift!.opened_at).toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' })}</p>
                        {staff.activeShift!.starting_cash !== undefined && (
                          <p>Nağd pul: ₼{Number(staff.activeShift!.starting_cash).toFixed(2)}</p>
                        )}
                      </div>
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={onClockOut}
                        disabled={clockingOut}
                        className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 hover:bg-rose-500/20 transition-all disabled:opacity-50"
                      >
                        <UserX size={16} />
                        <span className="text-xs font-bold">{clockingOut ? '...' : 'Çıxış'}</span>
                      </motion.button>
                    </div>
                  )}
                </div>
              </div>

              {/* Role-Specific Performance KPIs */}
              {loadingPerformance ? (
                <div className="space-y-3">
                  <div className="h-4 w-24 bg-[var(--theme-surface-soft)] rounded animate-pulse" />
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-16 bg-[var(--theme-surface-soft)] rounded-xl animate-pulse" />
                    ))}
                  </div>
                </div>
              ) : performance?.kpis && (
                <div className="space-y-3">
                  <h3 className="text-[10px] font-black uppercase tracking-wider text-[var(--theme-text-muted)]">
                    {performance.role === 'kitchen' || performance.role === 'bartender' ? 'Kitchen Performance' :
                     performance.role === 'waiter' || performance.role === 'host' ? 'Service Performance' :
                     performance.role === 'cashier' ? 'Cashier Performance' :
                     performance.role === 'manager' ? 'Manager Performance' :
                     performance.role === 'admin' || performance.role === 'superadmin' ? 'Admin Activity' :
                     'Performance'}
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(performance.kpis).slice(0, 6).map(([key, value]: [string, any]) => (
                      <div key={key} className="p-3 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
                        <p className="text-lg font-black tabular-nums text-[var(--theme-text)]">
                          {typeof value === 'number' ? value.toLocaleString() : value}
                        </p>
                        <p className="text-[9px] text-[var(--theme-text-muted)] uppercase tracking-wider mt-0.5">
                          {key.replace(/_/g, ' ')}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div className="space-y-3">
                <h3 className="text-[10px] font-black uppercase tracking-wider text-[var(--theme-text-muted)]">Actions</h3>
                <div className="space-y-2">
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => { onEdit(staff); onClose(); }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] hover:border-[var(--theme-border-strong)] transition-all"
                  >
                    <Edit3 size={16} className="text-[var(--theme-text-muted)]" />
                    <span className="text-xs font-bold text-[var(--theme-text)]">Redaktə et</span>
                    <ChevronRight size={14} className="ml-auto text-[var(--theme-text-muted)]" />
                  </motion.button>

                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => { handleResetPin(); }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] hover:border-[var(--theme-border-strong)] transition-all"
                  >
                    <KeyRound size={16} className="text-[var(--theme-text-muted)]" />
                    <span className="text-xs font-bold text-[var(--theme-text)]">PIN sıfırla</span>
                    <ChevronRight size={14} className="ml-auto text-[var(--theme-text-muted)]" />
                  </motion.button>

                  {staff.is_active && (
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      onClick={handleDeactivate}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-rose-500/5 border border-rose-500/10 hover:border-rose-500/20 transition-all"
                    >
                      <Trash2 size={16} className="text-rose-400" />
                      <span className="text-xs font-bold text-rose-400">Deaktiv et</span>
                    </motion.button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Pin Input Dialog */}
          <PinInputDialog
            open={showPinDialog}
            onClose={() => { setShowPinDialog(false); setResettingId(null); }}
            onConfirm={(pin) => { if (resettingId) onResetPin(resettingId); }}
            loading={false}
            title="PIN sıfırla"
            description="Yeni PIN daxil edin"
          />

          {/* Deactivate Confirm Dialog */}
          <ConfirmDialog
            open={showDeactivateConfirm}
            onClose={() => { setShowDeactivateConfirm(false); setDeactivatingId(null); }}
            onConfirm={confirmDeactivate}
            title="İşçini deaktiv et"
            description={`${staff.name} adlı işçini deaktiv etmək istədiyinizdən əminsiniz?`}
            confirmText="Deaktiv et"
            variant="danger"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
