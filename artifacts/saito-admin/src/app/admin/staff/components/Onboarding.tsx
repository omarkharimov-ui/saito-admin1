'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, Circle, Play } from 'lucide-react';

interface OnboardingProps {
  staffId: string;
  roleId?: string;
}

export function Onboarding({ staffId, roleId }: OnboardingProps) {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/onboarding?staff=${staffId}`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // ignore
    }
  }, [staffId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleStart = async () => {
    if (!roleId) return;
    setLoading(true);
    try {
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId, roleId }),
      });
      fetchStatus();
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  if (!status || status.error) {
    return (
      <div className="space-y-4">
        <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center">
          <Play size={48} className="mx-auto text-[var(--theme-text-muted)] mb-4" />
          <p className="text-sm text-[var(--theme-text-secondary)]">No onboarding started</p>
          {roleId && (
            <button
              onClick={handleStart}
              disabled={loading}
              className="mt-4 px-6 py-2 rounded-xl bg-emerald-500 text-white font-bold text-sm"
            >
              Start Onboarding
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-[var(--theme-text-muted)]">Progress</span>
          <span className="text-xs font-bold text-emerald-400">{status.progress?.toFixed(0) || 0}%</span>
        </div>
        <div className="h-2 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${status.progress || 0}%` }}
          />
        </div>
        <p className="text-[10px] text-[var(--theme-text-muted)] mt-2">
          {status.completed_tasks} of {status.total_tasks} tasks completed
        </p>
      </div>

      {/* Status */}
      <div className={`p-3 rounded-xl ${
        status.status === 'completed' ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-blue-500/10 border border-blue-500/20'
      }`}>
        <div className="flex items-center gap-2">
          {status.status === 'completed' ? (
            <CheckCircle size={16} className="text-emerald-400" />
          ) : (
            <Circle size={16} className="text-blue-400" />
          )}
          <span className={`text-sm font-medium capitalize ${
            status.status === 'completed' ? 'text-emerald-400' : 'text-blue-400'
          }`}>
            {status.status?.replace('_', ' ')}
          </span>
        </div>
      </div>
    </div>
  );
}
