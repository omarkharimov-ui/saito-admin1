'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DollarSign, Calendar, Lock, CheckCircle, Clock, Users, Plus, ChevronRight } from 'lucide-react';
import { toast } from '@/lib/toast';

type PayrollPeriod = {
  id: string;
  period_start: string;
  period_end: string;
  status: 'open' | 'reviewing' | 'approved' | 'locked';
  total_gross_pay: number;
  total_hours: number;
  staff_count: number;
};

type PayrollEntry = {
  id: string;
  staff_id: string;
  staff_name: string;
  role: string;
  regular_hours: number;
  overtime_hours: number;
  regular_pay: number;
  overtime_pay: number;
  tips: number;
  gross_pay: number;
};

export default function PayrollPage() {
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<PayrollPeriod | null>(null);
  const [entries, setEntries] = useState<PayrollEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPeriods = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/staff/payroll/periods');
      if (res.ok) {
        const data = await res.json();
        setPeriods(data.periods || []);
        if (data.periods?.length > 0 && !selectedPeriod) {
          setSelectedPeriod(data.periods[0]);
        }
      }
    } catch { toast.error('Failed to load payroll periods'); }
    finally { setLoading(false); }
  }, [selectedPeriod]);

  useEffect(() => { fetchPeriods(); }, []);

  useEffect(() => {
    if (selectedPeriod) {
      fetch(`${api/staff/payroll/entries}?period_id=${selectedPeriod.id}`)
        .then(res => res.ok ? res.json() : { entries: [] })
        .then(data => setEntries(data.entries || []))
        .catch(() => setEntries([]));
    }
  }, [selectedPeriod]);

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-black text-[var(--theme-text)] tracking-tight">PAYROLL</h1>
          <p className="text-[10px] text-[var(--theme-text-muted)] mt-0.5 uppercase tracking-widest">
            Payroll Periods
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.02)' }} />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {periods.map(period => (
              <div key={period.id} onClick={() => setSelectedPeriod(period)}
                className={`p-4 rounded-xl cursor-pointer transition-all ${selectedPeriod?.id === period.id ? 'ring-2 ring-emerald-500/50' : ''}`}
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[var(--theme-text)]">
                      {new Date(period.period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(period.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                    <p className="text-[10px] text-[var(--theme-text-muted)] mt-0.5">
                      {period.staff_count} staff · {period.total_hours.toFixed(1)} hours
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-bold text-[var(--theme-text)]">₼{period.total_gross_pay.toFixed(2)}</p>
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-medium ${
                      period.status === 'locked' ? 'bg-zinc-500/10 text-zinc-400' :
                      period.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400' :
                      period.status === 'reviewing' ? 'bg-amber-500/10 text-amber-400' :
                      'bg-blue-500/10 text-blue-400'
                    }`}>
                      {period.status.toUpperCase()}
                    </span>
                  </div>
                </div>

                {selectedPeriod?.id === period.id && entries.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <div className="space-y-2">
                      {entries.map(entry => (
                        <div key={entry.id} className="p-3 rounded-lg flex items-center gap-4"
                          style={{ background: 'rgba(255,255,255,0.02)' }}>
                          <div className="min-w-[120px]">
                            <p className="text-xs font-medium text-[var(--theme-text)]">{entry.staff_name}</p>
                            <p className="text-[10px] text-[var(--theme-text-muted)]">{entry.role}</p>
                          </div>
                          <div className="min-w-[80px]">
                            <p className="text-xs text-[var(--theme-text)]">{entry.regular_hours.toFixed(1)}h</p>
                            <p className="text-[10px] text-[var(--theme-text-muted)]">regular</p>
                          </div>
                          <div className="min-w-[80px]">
                            <p className="text-xs text-[var(--theme-text)]">{entry.overtime_hours.toFixed(1)}h</p>
                            <p className="text-[10px] text-[var(--theme-text-muted)]">overtime</p>
                          </div>
                          <div className="min-w-[80px]">
                            <p className="text-xs text-[var(--theme-text)]">₼{entry.tips.toFixed(2)}</p>
                            <p className="text-[10px] text-[var(--theme-text-muted)]">tips</p>
                          </div>
                          <div className="ml-auto">
                            <p className="text-sm font-bold text-[var(--theme-text)]">₼{entry.gross_pay.toFixed(2)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
