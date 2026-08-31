'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DollarSign, Clock, TrendingUp, Users, ShoppingBag } from 'lucide-react';
import { toast } from '@/lib/toast';

type LaborData = {
  total_labor_cost: number;
  total_sales: number;
  labor_percentage: number;
  total_hours: number;
  role_breakdown: {
    role: string;
    cost: number;
    hours: number;
    percentage: number;
  }[];
  staff_breakdown: {
    staff_id: string;
    name: string;
    role: string;
    hours: number;
    cost: number;
    orders: number;
    revenue: number;
  }[];
};

export default function LaborPage() {
  const [data, setData] = useState<LaborData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');

  const fetchLabor = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/staff/labor?period=${period}`);
      if (res.ok) {
        const result = await res.json();
        setData(result);
      }
    } catch { toast.error('Failed to load labor data'); }
    finally { setLoading(false); }
  }, [period]);

  useEffect(() => { fetchLabor(); }, [fetchLabor]);

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-black text-[var(--theme-text)] tracking-tight">LABOR</h1>
          <p className="text-[10px] text-[var(--theme-text-muted)] mt-0.5 uppercase tracking-widest">
            Cost Analysis
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <button onClick={() => setPeriod('today')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${period === 'today' ? 'bg-[var(--theme-text)] text-[var(--theme-surface)]' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]'}`}>
            Today
          </button>
          <button onClick={() => setPeriod('week')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${period === 'week' ? 'bg-[var(--theme-text)] text-[var(--theme-surface)]' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]'}`}>
            Week
          </button>
          <button onClick={() => setPeriod('month')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${period === 'month' ? 'bg-[var(--theme-text)] text-[var(--theme-surface)]' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]'}`}>
            Month
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.02)' }} />
          ))}
        </div>
      ) : data ? (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-4 gap-3 flex-shrink-0">
            <div className="p-4 rounded-2xl border" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
              <DollarSign size={16} className="text-[var(--theme-text-muted)] mb-2" />
              <p className="text-xl font-bold text-[var(--theme-text)]">₼{data.total_labor_cost.toFixed(2)}</p>
              <p className="text-[9px] text-[var(--theme-text-muted)] uppercase tracking-wider">Labor Cost</p>
            </div>
            <div className="p-4 rounded-2xl border" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
              <ShoppingBag size={16} className="text-[var(--theme-text-muted)] mb-2" />
              <p className="text-xl font-bold text-[var(--theme-text)]">₼{data.total_sales.toFixed(2)}</p>
              <p className="text-[9px] text-[var(--theme-text-muted)] uppercase tracking-wider">Sales</p>
            </div>
            <div className="p-4 rounded-2xl border" style={{ background: data.labor_percentage > 30 ? 'rgba(244, 63, 94, 0.05)' : 'rgba(16, 185, 129, 0.05)', borderColor: data.labor_percentage > 30 ? 'rgba(244, 63, 94, 0.15)' : 'rgba(16, 185, 129, 0.15)' }}>
              <TrendingUp size={16} className={data.labor_percentage > 30 ? 'text-rose-400' : 'text-emerald-400'} mb-2" />
              <p className="text-xl font-bold text-[var(--theme-text)]">{data.labor_percentage.toFixed(1)}%</p>
              <p className="text-[9px] text-[var(--theme-text-muted)] uppercase tracking-wider">Labor %</p>
            </div>
            <div className="p-4 rounded-2xl border" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
              <Clock size={16} className="text-[var(--theme-text-muted)] mb-2" />
              <p className="text-xl font-bold text-[var(--theme-text)]">{data.total_hours.toFixed(1)}h</p>
              <p className="text-[9px] text-[var(--theme-text-muted)] uppercase tracking-wider">Total Hours</p>
            </div>
          </div>

          {/* Role Breakdown */}
          <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
            <div>
              <h3 className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold mb-3">By Role</h3>
              <div className="space-y-2">
                {data.role_breakdown.map((role, idx) => (
                  <div key={idx} className="p-3 rounded-xl flex items-center gap-4"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="min-w-[100px]">
                      <p className="text-sm font-medium text-[var(--theme-text)]">{role.role}</p>
                    </div>
                    <div className="flex-1">
                      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(role.percentage, 100)}%` }} />
                      </div>
                    </div>
                    <div className="min-w-[80px] text-right">
                      <p className="text-xs text-[var(--theme-text)]">₼{role.cost.toFixed(2)}</p>
                      <p className="text-[10px] text-[var(--theme-text-muted)]">{role.percentage.toFixed(1)}%</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Staff Breakdown */}
            <div>
              <h3 className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold mb-3">By Staff</h3>
              <div className="space-y-2">
                {data.staff_breakdown.map((staff, idx) => (
                  <div key={idx} className="p-3 rounded-xl flex items-center gap-4"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="min-w-[120px]">
                      <p className="text-sm font-medium text-[var(--theme-text)]">{staff.name}</p>
                      <p className="text-[10px] text-[var(--theme-text-muted)]">{staff.role}</p>
                    </div>
                    <div className="min-w-[60px]">
                      <p className="text-xs text-[var(--theme-text)]">{staff.hours.toFixed(1)}h</p>
                    </div>
                    <div className="min-w-[60px]">
                      <p className="text-xs text-[var(--theme-text)]">{staff.orders} ord</p>
                    </div>
                    <div className="min-w-[80px]">
                      <p className="text-xs text-[var(--theme-text)]">₼{staff.revenue.toFixed(0)}</p>
                    </div>
                    <div className="min-w-[80px] text-right">
                      <p className="text-xs font-medium text-[var(--theme-text)]">₼{staff.cost.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <DollarSign size={48} className="mx-auto text-[var(--theme-text-muted)] mb-4" />
            <p className="text-sm text-[var(--theme-text-secondary)]">No labor data available</p>
          </div>
        </div>
      )}
    </div>
  );
}
