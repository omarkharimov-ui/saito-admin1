'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, LogIn, LogOut, Coffee, Play, Square, AlertTriangle, Timer, TrendingUp, UserX, History, ShieldAlert } from 'lucide-react';

interface TimeClockStatus {
  is_clocked_in: boolean;
  on_break: boolean;
  current_entry_type: string;
  last_entry: string;
  active_shift_id: string;
  active_break_id: string;
  break_started_at: string;
  today_hours: number;
  weekly_hours: number;
  approaching_daily_ot: boolean;
  approaching_weekly_ot: boolean;
}

interface TimeClockPanelProps {
  staffId: string;
  staffName: string;
}

export function TimeClockPanel({ staffId, staffName }: TimeClockPanelProps) {
  const [status, setStatus] = useState<TimeClockStatus | null>(null);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [breakTime, setBreakTime] = useState<number>(0);
  const [breakEligibility, setBreakEligibility] = useState<{ eligible: boolean; reason?: string; hours_worked?: number } | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [forceOpen, setForceOpen] = useState(false);
  const [auditEntries, setAuditEntries] = useState<any[] | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/time-clock/${staffId}/status`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // ignore
    }
  }, [staffId]);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await fetch(`/api/time-clock/${staffId}/audit?limit=10`);
      if (res.ok) {
        const data = await res.json();
        setAuditEntries(data.entries || []);
      }
    } catch {
      // ignore
    } finally {
      setAuditLoading(false);
    }
  }, [staffId]);

  useEffect(() => {
    fetchStatus();
    loadAudit();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus, loadAudit]);

  // Break timer
  useEffect(() => {
    if (!status?.on_break || !status.break_started_at) return;

    const interval = setInterval(() => {
      const started = new Date(status.break_started_at).getTime();
      const now = Date.now();
      setBreakTime(Math.floor((now - started) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [status?.on_break, status?.break_started_at]);

  // Check break eligibility when clocked in
  useEffect(() => {
    if (!status?.is_clocked_in || status?.on_break) {
      setBreakEligibility(null);
      return;
    }

    const checkEligibility = async () => {
      try {
        const res = await fetch(`/api/breaks/adherence`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shift_id: status.active_shift_id, break_type: 'meal' }),
        });
        if (res.ok) {
          const data = await res.json();
          setBreakEligibility(data);
        }
      } catch {
        // ignore
      }
    };

    checkEligibility();
  }, [status?.is_clocked_in, status?.on_break, status?.active_shift_id]);

  const handleClockIn = async () => {
    if (!pin || pin.length < 4) {
      setError('PIN must be 4 digits');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/time-clock/${staffId}/clock-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Clock in successful!');
        setPin('');
        fetchStatus();
      } else {
        setError(data.error || 'Error occurred');
      }
    } catch {
      setError('Error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!pin || pin.length < 4) {
      setError('PIN must be 4 digits');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/time-clock/${staffId}/clock-out`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Clock out successful!');
        setPin('');
        fetchStatus();
      } else {
        setError(data.error || 'Error occurred');
      }
    } catch {
      setError('Error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleStartBreak = async () => {
    if (breakEligibility && !breakEligibility.eligible) {
      setError(breakEligibility.reason || 'Not eligible for break yet');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/time-clock/${staffId}/break`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'meal' }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Break started');
        fetchStatus();
      } else {
        setError(data.error || 'Error occurred');
      }
    } catch {
      setError('Error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleEndBreak = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/time-clock/${staffId}/break`, {
        method: 'PATCH',
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Break ended');
        setBreakTime(0);
        fetchStatus();
      } else {
        setError(data.error || 'Error occurred');
      }
    } catch {
      setError('Error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleForceClockOut = async () => {
    if (!overrideReason.trim()) {
      setError('Reason is required for manager override');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/staff/force-clock-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: staffId, reason: overrideReason.trim() }),
      });
      const data = await res.json();
      if (data.success || data.error === 'NO_ACTIVE_SHIFT') {
        setSuccess(data.error === 'NO_ACTIVE_SHIFT' ? 'No active shift for this staff member' : 'Force clock out successful (override recorded)');
        setOverrideReason('');
        setForceOpen(false);
        fetchStatus();
        loadAudit();
      } else {
        setError(data.error || 'Force clock out failed');
      }
    } catch {
      setError('Error forcibly clocking out');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      {/* Status Cards */}
      <div className="grid grid-cols-3 gap-3">
        <StatusCard
          label="Status"
          value={status?.on_break ? 'Break' : status?.is_clocked_in ? 'Clocked In' : 'Clocked Out'}
          icon={status?.is_clocked_in ? LogIn : LogOut}
          color={status?.is_clocked_in ? 'emerald' : 'zinc'}
        />
        <StatusCard
          label="Today"
          value={`${status?.today_hours?.toFixed(1) || 0}h`}
          icon={Clock}
          color={status?.approaching_daily_ot ? 'amber' : 'blue'}
        />
        <StatusCard
          label="This Week"
          value={`${status?.weekly_hours?.toFixed(1) || 0}h`}
          icon={TrendingUp}
          color={status?.approaching_weekly_ot ? 'amber' : 'purple'}
        />
      </div>

      {/* Overtime Warning */}
      <AnimatePresence>
        {(status?.approaching_daily_ot || status?.approaching_weekly_ot) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3"
          >
            <AlertTriangle size={16} className="text-amber-400" />
            <span className="text-xs text-amber-400">
              {status?.approaching_daily_ot && 'Approaching daily overtime!'}
              {status?.approaching_weekly_ot && 'Approaching weekly overtime!'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Break Eligibility Warning */}
      <AnimatePresence>
        {breakEligibility && !breakEligibility.eligible && status?.is_clocked_in && !status?.on_break && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-3"
          >
            <AlertTriangle size={16} className="text-rose-400" />
            <span className="text-xs text-rose-400">
              {breakEligibility.reason || 'Not eligible for break yet'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active Break Display */}
      <AnimatePresence>
        {status?.on_break && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <Coffee size={20} className="text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-blue-400">Break in Progress</p>
                  <p className="text-xs text-blue-400/70">
                    {status.break_started_at && new Date(status.break_started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-blue-400 tabular-nums">{formatTime(breakTime)}</p>
                <p className="text-[10px] text-blue-400/70">elapsed</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PIN Input */}
      <div className="space-y-3">
        <label className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold">PIN Code</label>
        <div className="flex gap-2">
          <input
            type="password"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="****"
            className="flex-1 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-[var(--theme-text)] text-center text-lg tracking-[0.5em] font-mono focus:outline-none focus:border-[var(--theme-text)] transition-colors"
          />
        </div>
        <div className="grid grid-cols-3 gap-2 justify-items-center">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, null].map((num, idx) => (
            num === null ? <div key={idx} /> : (
              <button
                key={num}
                onClick={() => setPin((p) => (p.length < 4 ? p + num.toString() : p))}
                className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/[0.08] text-[var(--theme-text)] text-sm font-medium hover:bg-white/[0.06] transition-colors"
              >
                {num}
              </button>
            )
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3">
        {!status?.is_clocked_in ? (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleClockIn}
            disabled={loading}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 text-white font-bold text-sm disabled:opacity-50"
          >
            <LogIn size={16} />
            Clock In
          </motion.button>
        ) : (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleClockOut}
            disabled={loading}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-500 text-white font-bold text-sm disabled:opacity-50"
          >
            <LogOut size={16} />
            Clock Out
          </motion.button>
        )}

        {status?.is_clocked_in && !status?.on_break && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleStartBreak}
            disabled={loading}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-500 text-white font-bold text-sm disabled:opacity-50"
          >
            <Coffee size={16} />
            Break
          </motion.button>
        )}

        {status?.on_break && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleEndBreak}
            disabled={loading}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 text-white font-bold text-sm disabled:opacity-50"
          >
            <Square size={16} />
            End Break
          </motion.button>
        )}
      </div>

      {/* Manager Override */}
      <div className="pt-2 border-t border-white/[0.06]">
        {!forceOpen ? (
          <button
            onClick={() => setForceOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/[0.03] border border-dashed border-white/[0.12] text-xs text-amber-400/90 font-semibold hover:border-amber-400/30 hover:bg-amber-500/5 transition-all"
          >
            <UserX size={14} /> Manager Override: Force Clock Out
          </button>
        ) : (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden">
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 space-y-3">
              <div className="flex items-center gap-2 text-rose-400">
                <ShieldAlert size={14} />
                <p className="text-xs font-bold">Force Clock Out — override</p>
              </div>
              <input
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Səbəb (məcburi): məs. növbəni tərk etdi, xəstəlik..."
                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] focus:outline-none focus:border-rose-400/40"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleForceClockOut}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-rose-500 text-white text-xs font-bold disabled:opacity-50"
                >
                  <UserX size={13} /> Confirm Override
                </button>
                <button
                  onClick={() => { setForceOpen(false); setOverrideReason(''); }}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-white/[0.06] text-xs text-[var(--theme-text-muted)] disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Audit Trail */}
      <div className="pt-2 border-t border-white/[0.06]">
        <div className="flex items-center gap-2 mb-2">
          <History size={13} className="text-[var(--theme-text-muted)]" />
          <p className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold">Son hərəkətlər</p>
        </div>
        {auditLoading ? (
          <p className="text-[11px] text-[var(--theme-text-muted)]">Yüklənir...</p>
        ) : auditEntries && auditEntries.length > 0 ? (
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {auditEntries.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${e.entry_type === 'clock_in' || e.entry_type === 'break_end' ? 'bg-emerald-400' : e.entry_type === 'break_start' ? 'bg-blue-400' : 'bg-rose-400'}`} />
                  <span className="text-xs text-[var(--theme-text)] capitalize">{e.entry_type?.replace('_', ' ')}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-[var(--theme-text-muted)]">
                  <span>{e.timestamp ? new Date(e.timestamp).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                  {e.source && <span className="px-1.5 py-0.5 rounded bg-white/[0.05]">{e.source}</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-[var(--theme-text-muted)]">Hələ hərəkət yoxdur</p>
        )}
      </div>

      {/* Messages */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-xs text-rose-400 text-center"
          >
            {error}
          </motion.p>
        )}
        {success && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-xs text-emerald-400 text-center"
          >
            {success}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatusCard({ label, value, icon: Icon, color }: {
  label: string;
  value: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: 'emerald' | 'zinc' | 'amber' | 'blue' | 'purple';
}) {
  const colors = {
    emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', icon: 'text-emerald-400' },
    zinc: { bg: 'bg-zinc-500/10', border: 'border-zinc-500/20', text: 'text-zinc-400', icon: 'text-zinc-400' },
    amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', icon: 'text-amber-400' },
    blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', icon: 'text-blue-400' },
    purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/20', text: 'text-purple-400', icon: 'text-purple-400' },
  };

  const c = colors[color];

  return (
    <div className={`p-3 rounded-xl border ${c.bg} ${c.border}`}>
      <Icon size={14} className={`${c.icon} mb-2`} />
      <p className={`text-sm font-bold ${c.text}`}>{value}</p>
      <p className="text-[9px] text-[var(--theme-text-muted)] uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  );
}
