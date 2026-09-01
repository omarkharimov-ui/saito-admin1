'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { MapPin, CheckCircle, AlertTriangle, Clock } from 'lucide-react';

interface ComplianceProps {
  staffId: string;
}

export function Compliance({ staffId }: ComplianceProps) {
  const [compliance, setCompliance] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchCompliance = useCallback(async () => {
    try {
      const res = await fetch(`/api/compliance?staff=${staffId}`);
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
          : 'bg-rose-500/10 border-rose-500/20'
      }`}>
        <div className="flex items-center gap-3">
          {compliance?.compliant ? (
            <CheckCircle size={20} className="text-emerald-400" />
          ) : (
            <AlertTriangle size={20} className="text-rose-400" />
          )}
          <div>
            <p className={`text-sm font-bold ${compliance?.compliant ? 'text-emerald-400' : 'text-rose-400'}`}>
              {compliance?.compliant ? 'Compliant' : 'Violations Found'}
            </p>
            <p className="text-xs text-[var(--theme-text-muted)]">Labor Compliance</p>
          </div>
        </div>
      </div>

      {/* Hours */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <Clock size={14} className="text-blue-400 mb-1" />
          <p className="text-sm font-bold text-[var(--theme-text)]">{compliance?.daily_hours?.toFixed(1) || 0}h</p>
          <p className="text-[9px] text-[var(--theme-text-muted)]">Daily Hours</p>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <Clock size={14} className="text-purple-400 mb-1" />
          <p className="text-sm font-bold text-[var(--theme-text)]">{compliance?.weekly_hours?.toFixed(1) || 0}h</p>
          <p className="text-[9px] text-[var(--theme-text-muted)]">Weekly Hours</p>
        </div>
      </div>

      {/* Violations */}
      {compliance?.violations && compliance.violations.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold">Violations</p>
          {compliance.violations.map((v: any, i: number) => (
            <div key={i} className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <p className="text-xs text-rose-400">{v.type}: {v.hours.toFixed(1)}h</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
