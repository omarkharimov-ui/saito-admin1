'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Users, UserCheck, DollarSign, AlertTriangle, TrendingUp, Clock } from 'lucide-react';

interface KpiData {
  totalStaff: number;
  activeStaff: number;
  onShift: number;
  todayOrders: number;
  todayRevenue: number;
  openDrawers: number;
  riskAlerts: number;
}

interface StaffKpiStripProps {
  data: KpiData;
}

export function StaffKpiStrip({ data }: StaffKpiStripProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <KpiCard
        icon={Users}
        label="Total Staff"
        value={data.totalStaff}
        delay={0}
      />
      <KpiCard
        icon={UserCheck}
        label="Active On Shift"
        value={data.onShift}
        accent="emerald"
        pulse
        delay={0.05}
      />
      <KpiCard
        icon={DollarSign}
        label="Today Revenue"
        value={formatCurrency(data.todayRevenue)}
        delay={0.1}
      />
      <KpiCard
        icon={AlertTriangle}
        label="Attention"
        value={data.riskAlerts}
        accent={data.riskAlerts > 0 ? 'amber' : undefined}
        delay={0.15}
      />
    </div>
  );
}

interface KpiCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  accent?: 'emerald' | 'amber' | 'rose';
  pulse?: boolean;
  delay?: number;
}

function KpiCard({ icon: Icon, label, value, accent, pulse, delay = 0 }: KpiCardProps) {
  const accentColors = {
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    rose: 'text-rose-400',
  };

  const valueColor = accent ? accentColors[accent] : 'text-[var(--theme-text)]';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="group relative rounded-2xl p-4 transition-all duration-200 hover:scale-[1.02]"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <Icon size={16} className="text-[var(--theme-text-muted)] opacity-60" />
        {pulse && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
        )}
      </div>
      <p className={`text-2xl font-bold tabular-nums ${valueColor}`}>{value}</p>
      <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--theme-text-muted)] mt-1 opacity-60">
        {label}
      </p>
    </motion.div>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('az-AZ', {
    style: 'currency',
    currency: 'AZN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}
