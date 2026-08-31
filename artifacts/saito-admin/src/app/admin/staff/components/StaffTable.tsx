'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, Edit, Clock, BarChart3,
  MoreHorizontal, ShieldCheck
} from 'lucide-react';
import type { StaffMember } from '../types';

interface StaffTableProps {
  staff: StaffMember[];
  loading: boolean;
  onSelect: (member: StaffMember) => void;
}

const ROLE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  cashier: { bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-400' },
  waiter: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  bartender: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' },
  kitchen: { bg: 'bg-rose-500/10', text: 'text-rose-400', dot: 'bg-rose-400' },
  manager: { bg: 'bg-purple-500/10', text: 'text-purple-400', dot: 'bg-purple-400' },
  host: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', dot: 'bg-cyan-400' },
  stock: { bg: 'bg-orange-500/10', text: 'text-orange-400', dot: 'bg-orange-400' },
  accountant: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', dot: 'bg-indigo-400' },
  admin: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400' },
  owner: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', dot: 'bg-yellow-400' },
  superadmin: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400' },
};

export function StaffTable({ staff, loading, onSelect }: StaffTableProps) {
  if (loading) {
    return (
      <div className="rounded-2xl overflow-hidden" style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div className="p-6 space-y-4">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.03)' }} />
          ))}
        </div>
      </div>
    );
  }

  if (staff.length === 0) {
    return (
      <div className="rounded-2xl p-12 text-center" style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <p className="text-sm text-[var(--theme-text-muted)]">No staff found</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
    }}>
      {/* Table Header */}
      <div className="grid grid-cols-[2fr_1fr_1.2fr_1fr_0.8fr_1fr_0.8fr_0.4fr] gap-4 px-5 py-3.5 border-b border-white/[0.06]">
        <span className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">Staff</span>
        <span className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">Role</span>
        <span className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">Status</span>
        <span className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">Shift</span>
        <span className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase text-right">Orders</span>
        <span className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase text-right">Revenue</span>
        <span className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">Risk</span>
        <span></span>
      </div>

      {/* Table Body */}
      <div className="divide-y divide-white/[0.04]">
        {staff.map((member, index) => (
          <StaffRow key={member.id} member={member} index={index} onClick={() => onSelect(member)} />
        ))}
      </div>
    </div>
  );
}

interface StaffRowProps {
  member: StaffMember;
  index: number;
  onClick: () => void;
}

function StaffRow({ member, index, onClick }: StaffRowProps) {
  const [showActions, setShowActions] = useState(false);
  const isOnShift = member.shift_status === 'active';
  const roleColor = ROLE_COLORS[member.role_name?.toLowerCase()] || {
    bg: 'bg-zinc-500/10',
    text: 'text-zinc-400',
    dot: 'bg-zinc-400',
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  const getAvatarGradient = (role: string) => {
    const gradients: Record<string, string> = {
      cashier: 'from-blue-600 to-blue-400',
      waiter: 'from-emerald-600 to-emerald-400',
      bartender: 'from-amber-600 to-amber-400',
      kitchen: 'from-rose-600 to-rose-400',
      manager: 'from-purple-600 to-purple-400',
      host: 'from-cyan-600 to-cyan-400',
    };
    return gradients[role?.toLowerCase()] || 'from-zinc-700 to-zinc-600';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.03, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="grid grid-cols-[2fr_1fr_1.2fr_1fr_0.8fr_1fr_0.8fr_0.4fr] gap-4 px-5 py-3.5 items-center cursor-pointer transition-all duration-200 group hover:bg-white/[0.03] relative"
      onClick={onClick}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Staff Info */}
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-full bg-gradient-to-tr ${getAvatarGradient(member.role_name)} border border-white/10 flex items-center justify-center text-xs font-bold text-white shadow-inner flex-shrink-0`}>
          {getInitials(member.full_name || member.name)}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--theme-text)] truncate">{member.full_name || member.name}</p>
          {member.email && <p className="text-[10px] text-[var(--theme-text-muted)] truncate opacity-60">{member.email}</p>}
        </div>
      </div>

      {/* Role */}
      <span className={`inline-flex items-center gap-1.5 w-fit px-3 py-1 rounded-full text-xs font-medium backdrop-blur-sm ${roleColor.bg} ${roleColor.text} border border-white/5`}>
        <span className={`w-1.5 h-1.5 rounded-full ${roleColor.dot}`} />
        {member.role_name}
      </span>

      {/* Status */}
      <div className="flex items-center gap-2">
        {isOnShift ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-xs text-emerald-400 font-medium">On shift</span>
          </>
        ) : member.is_active ? (
          <>
            <span className="w-2 h-2 rounded-full bg-zinc-500" />
            <span className="text-xs text-zinc-500">Off shift</span>
          </>
        ) : (
          <>
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span className="text-xs text-rose-400">Inactive</span>
          </>
        )}
      </div>

      {/* Shift */}
      <span className="text-xs text-[var(--theme-text-muted)] opacity-70">
        {member.shift || '—'}
      </span>

      {/* Orders */}
      <span className="text-sm font-medium text-[var(--theme-text)] text-right tabular-nums">
        {member.total_orders}
      </span>

      {/* Revenue */}
      <span className="text-sm font-medium text-[var(--theme-text)] text-right tabular-nums">
        {formatCurrency(member.total_revenue)}
      </span>

      {/* Risk */}
      <RiskBadge level={member.risk_level} flags={member.risk_flags} />

      {/* Actions */}
      <div className="flex justify-end relative">
        <AnimatePresence>
          {showActions && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-1 rounded-xl z-10"
              style={{
                background: 'rgba(15,15,18,0.95)',
                border: '1px solid rgba(255,255,255,0.1)',
                backdropFilter: 'blur(20px)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              }}
            >
              <button className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-zinc-400 hover:text-white">
                <Edit size={14} />
              </button>
              <button className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-zinc-400 hover:text-white">
                <Clock size={14} />
              </button>
              <button className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-zinc-400 hover:text-white">
                <BarChart3 size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <ChevronRight size={14} className="text-[var(--theme-text-muted)] opacity-0 group-hover:opacity-60 transition-opacity" />
      </div>
    </motion.div>
  );
}

function RiskBadge({ level, flags }: { level: string; flags: number }) {
  if (level === 'HIGH') {
    return <span className="text-xs text-rose-400 font-medium">HIGH · {flags}</span>;
  }
  if (level === 'MEDIUM') {
    return <span className="text-xs text-amber-400 font-medium">MED · {flags}</span>;
  }
  return <span className="text-xs text-zinc-500">Normal</span>;
}

function formatCurrency(value: number): string {
  if (value >= 1000) {
    return `₼${(value / 1000).toFixed(1)}k`;
  }
  return `₼${value.toFixed(0)}`;
}
