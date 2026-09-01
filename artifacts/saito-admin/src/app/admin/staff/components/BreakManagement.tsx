'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Coffee, CheckCircle, AlertTriangle, Clock } from 'lucide-react';

interface BreakManagementProps {
  staffId: string;
  activeShiftId?: string;
}

export function BreakManagement({ staffId, activeShiftId }: BreakManagementProps) {
  const [compliance, setCompliance] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchCompliance = useCallback(async () => {
    try {
      const res = await fetch(`/api/breaks?staff=${staffId}`);
      if (res.ok) {
        const data = await res.json();
        setCompliance(data);
      }
    } catch {
      // ignore
    }
  }, [staffId]);

  useEffect(() => {
    fetchCompliance();
  }, [fetchCompliance]);

  return (
    <div className="space-y-4">
      {/* Compliance Status */}
      <div className={`p-4 rounded-xl border ${
        compliance?.compliant
          ? 'bg-emerald-500/10 border-emerald-500/20'
          : 'bg-amber-500/10 border-amber-500/20'
      }`}>
        <div className="flex items-center gap-3">
          {compliance?.compliant ? (
            <CheckCircle size={20} className="text-emerald-400" />
          ) : (
            <AlertTriangle size={20} className="text-amber-400" />
          )}
          <div>
            <p className={`text-sm font-bold ${compliance?.compliant ? 'text-emerald-400' : 'text-amber-400'}`}>
              {compliance?.compliant ? 'Compliant' : 'Action Required'}
            </p>
            <p className="text-xs text-[var(--theme-text-muted)]">Break Compliance</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <Clock size={14} className="text-blue-400 mb-1" />
          <p className="text-sm font-bold text-[var(--theme-text)]">{compliance?.total_minutes || 0}m</p>
          <p className="text-[9px] text-[var(--theme-text-muted)]">Work Time</p>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <Coffee size={14} className="text-emerald-400 mb-1" />
          <p className="text-sm font-bold text-[var(--theme-text)]">{compliance?.taken_breaks || 0}</p>
          <p className="text-[9px] text-[var(--theme-text-muted)]">Taken</p>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <AlertTriangle size={14} className="text-amber-400 mb-1" />
          <p className="text-sm font-bold text-[var(--theme-text)]">{compliance?.required_breaks || 0}</p>
          <p className="text-[9px] text-[var(--theme-text-muted)]">Required</p>
        </div>
      </div>
    </div>
  );
}
