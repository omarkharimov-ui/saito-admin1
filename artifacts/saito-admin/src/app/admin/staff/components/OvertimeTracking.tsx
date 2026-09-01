'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Clock, AlertTriangle } from 'lucide-react';

interface OvertimeTrackingProps {
  staffId: string;
}

export function OvertimeTracking({ staffId }: OvertimeTrackingProps) {
  const [overtime, setOvertime] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchOvertime = useCallback(async () => {
    try {
      const res = await fetch(`/api/overtime?staff=${staffId}`);
      if (res.ok) {
        const data = await res.json();
        setOvertime(data);
      }
    } catch {
      // ignore
    }
  }, [staffId]);

  useEffect(() => {
    fetchOvertime();
  }, [fetchOvertime]);

  return (
    <div className="space-y-4">
      {/* Overtime Warning */}
      {(overtime?.daily_overtime > 0 || overtime?.weekly_overtime > 0) && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
          <AlertTriangle size={20} className="text-amber-400" />
          <span className="text-sm text-amber-400">Overtime recorded this period</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <TrendingUp size={14} className="text-rose-400 mb-1" />
          <p className="text-sm font-bold text-rose-400">{overtime?.daily_overtime?.toFixed(1) || 0}h</p>
          <p className="text-[9px] text-[var(--theme-text-muted)]">Daily OT</p>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <Clock size={14} className="text-amber-400 mb-1" />
          <p className="text-sm font-bold text-amber-400">{overtime?.weekly_overtime?.toFixed(1) || 0}h</p>
          <p className="text-[9px] text-[var(--theme-text-muted)]">Weekly OT</p>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <TrendingUp size={14} className="text-purple-400 mb-1" />
          <p className="text-sm font-bold text-purple-400">{overtime?.total_overtime?.toFixed(1) || 0}h</p>
          <p className="text-[9px] text-[var(--theme-text-muted)]">Total OT</p>
        </div>
      </div>
    </div>
  );
}
