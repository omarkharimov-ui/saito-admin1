'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Edit, Clock, ShieldCheck, AlertTriangle,
  Mail, Phone, UserCheck, UserX, KeyRound, LogOut
} from 'lucide-react';

interface StaffMember {
  id: string;
  name: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  role_name: string;
  shift: string | null;
  shift_status: 'active' | 'off';
  total_orders: number;
  total_revenue: number;
  risk_level: string;
  risk_flags: number;
  active_shift?: any;
}

interface StaffDrawerProps {
  staff: StaffMember | null;
  open: boolean;
  onClose: () => void;
  onEdit: (staff: StaffMember) => void;
  onClockIn: () => void;
  onClockOut: () => void;
}

const ROLE_COLORS: Record<string, { bg: string; text: string; gradient: string }> = {
  cashier: { bg: 'bg-blue-500/10', text: 'text-blue-400', gradient: 'from-blue-600 to-blue-400' },
  waiter: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', gradient: 'from-emerald-600 to-emerald-400' },
  bartender: { bg: 'bg-amber-500/10', text: 'text-amber-400', gradient: 'from-amber-600 to-amber-400' },
  kitchen: { bg: 'bg-rose-500/10', text: 'text-rose-400', gradient: 'from-rose-600 to-rose-400' },
  manager: { bg: 'bg-purple-500/10', text: 'text-purple-400', gradient: 'from-purple-600 to-purple-400' },
  host: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', gradient: 'from-cyan-600 to-cyan-400' },
};

export function StaffDrawer({ staff, open, onClose, onEdit, onClockIn, onClockOut }: StaffDrawerProps) {
  const [performance, setPerformance] = useState<any>(null);

  useEffect(() => {
    if (open && staff?.id) {
      fetch(`/api/staff/${staff.id}/performance?period=week`)
        .then(res => res.json())
        .then(data => setPerformance(data))
        .catch(() => setPerformance(null));
    }
  }, [open, staff?.id]);

  if (!staff) return null;

  const roleColor = ROLE_COLORS[staff.role_name?.toLowerCase()] || {
    bg: 'bg-zinc-500/10',
    text: 'text-zinc-400',
    gradient: 'from-zinc-700 to-zinc-600',
  };

  const isOnShift = staff.shift_status === 'active';
  const initials = (staff.full_name || staff.name).split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[100]"
            style={{
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
            }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 35, mass: 0.8 }}
            className="fixed right-0 top-0 bottom-0 z-[101] w-full max-w-lg flex flex-col"
            style={{
              background: 'rgba(15,15,18,0.98)',
              borderLeft: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 0 80px rgba(0,0,0,0.9)',
            }}
          >
            {/* Header */}
            <div className="p-6 border-b border-white/[0.06] flex-shrink-0">
              <div className="flex items-center justify-between mb-5">
                <button onClick={onClose} className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white transition-colors">
                  <X size={16} />
                  Close
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onEdit(staff)}
                    className="p-2 rounded-xl hover:bg-white/10 transition-colors text-zinc-400 hover:text-white"
                  >
                    <Edit size={16} />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-tr ${roleColor.gradient} border border-white/10 flex items-center justify-center text-xl font-bold text-white shadow-lg`}>
                  {initials}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{staff.full_name || staff.name}</h2>
                  <div className="flex items-center gap-3 mt-1">
                    <span className={`text-xs font-medium ${roleColor.text}`}>{staff.role_name?.toUpperCase()}</span>
                    {isOnShift ? (
                      <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                        </span>
                        On shift
                      </span>
                    ) : staff.is_active ? (
                      <span className="text-xs text-zinc-500">Off shift</span>
                    ) : (
                      <span className="text-xs text-rose-400">Inactive</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-3">
                <ActionButton
                  icon={isOnShift ? LogOut : Clock}
                  label={isOnShift ? 'Clock Out' : 'Clock In'}
                  onClick={isOnShift ? onClockOut : onClockIn}
                  primary
                />
                <ActionButton
                  icon={KeyRound}
                  label="Reset PIN"
                  onClick={() => {}}
                />
              </div>

              {/* Today Stats */}
              <div>
                <h3 className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase mb-3">Today</h3>
                <div className="grid grid-cols-2 gap-3">
                  <StatCard label="Orders" value={staff.total_orders} />
                  <StatCard label="Revenue" value={formatCurrency(staff.total_revenue)} />
                  <StatCard label="Voids" value={0} />
                  <StatCard label="Discounts" value={0} />
                </div>
              </div>

              {/* Contact Info */}
              <div>
                <h3 className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase mb-3">Contact</h3>
                <div className="space-y-2">
                  {staff.email && (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                      <Mail size={14} className="text-zinc-500" />
                      <span className="text-sm text-zinc-300">{staff.email}</span>
                    </div>
                  )}
                  {staff.phone && (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                      <Phone size={14} className="text-zinc-500" />
                      <span className="text-sm text-zinc-300">{staff.phone}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Risk Assessment */}
              {staff.risk_level !== 'LOW' && (
                <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={14} className="text-amber-400" />
                    <span className="text-xs font-medium text-amber-400">Attention Required</span>
                  </div>
                  <p className="text-xs text-zinc-400">
                    {staff.risk_flags} flags detected. Review activity for details.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ActionButton({ icon: Icon, label, onClick, primary }: { icon: any; label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-medium transition-all active:scale-95 ${
        primary
          ? 'bg-white text-black hover:bg-zinc-200 shadow-xl shadow-white/10'
          : 'bg-zinc-900/90 border border-white/10 text-white hover:bg-zinc-800'
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
      <p className="text-lg font-bold text-white tabular-nums">{value}</p>
      <p className="text-[10px] text-zinc-500 uppercase tracking-wider mt-1">{label}</p>
    </div>
  );
}

function formatCurrency(value: number): string {
  if (value >= 1000) {
    return `₼${(value / 1000).toFixed(1)}k`;
  }
  return `₼${value.toFixed(0)}`;
}
