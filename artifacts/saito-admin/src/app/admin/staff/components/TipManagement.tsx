'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DollarSign, Users, PieChart, Settings, Check, AlertTriangle } from 'lucide-react';

interface TipPool {
  id: string;
  pool_date: string;
  total_amount: number;
  status: string;
  distributed_at: string;
}

interface TipDistribution {
  staff_id: string;
  staff_name: string;
  role_name: string;
  percentage: number;
  amount: number;
  hours_worked: number;
}

interface TipRule {
  id: string;
  role_id: string;
  role_name: string;
  percentage: number;
}

interface TipManagementProps {
  staffId?: string;
}

export function TipManagement({ staffId }: TipManagementProps) {
  const [pool, setPool] = useState<TipPool | null>(null);
  const [distributions, setDistributions] = useState<TipDistribution[]>([]);
  const [rules, setRules] = useState<TipRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [shortfall, setShortfall] = useState<{ hours_worked: number; tips_earned: number; shortfall_amount: number; minimum_wage: number } | null>(null);
  const [shortfallLoading, setShortfallLoading] = useState(false);

  const fetchPool = useCallback(async () => {
    try {
      const res = await fetch('/api/tips');
      if (res.ok) {
        const data = await res.json();
        setPool(data);
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchDistributions = useCallback(async () => {
    if (!pool?.id) return;
    try {
      const res = await fetch(`/api/tips/${pool.id}`);
      if (res.ok) {
        const data = await res.json();
        setDistributions(data.distributions || []);
      }
    } catch {
      // ignore
    }
  }, [pool?.id]);

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch('/api/tips/rules');
      if (res.ok) {
        const data = await res.json();
        setRules(Array.isArray(data) ? data : []);
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchShortfall = useCallback(async () => {
    if (!staffId) return;
    setShortfallLoading(true);
    try {
      const periodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const periodEnd = new Date().toISOString().split('T')[0];
      const res = await fetch(`/api/tips/shortfall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: staffId, period_start: periodStart, period_end: periodEnd }),
      });
      if (res.ok) {
        const data = await res.json();
        setShortfall(data);
      }
    } catch {
      // ignore
    } finally {
      setShortfallLoading(false);
    }
  }, [staffId]);

  useEffect(() => {
    fetchPool();
    fetchRules();
    fetchShortfall();
  }, [fetchPool, fetchRules, fetchShortfall]);

  useEffect(() => {
    fetchDistributions();
  }, [fetchDistributions]);

  const handleCreatePool = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: new Date().toISOString().split('T')[0] }),
      });
      if (res.ok) {
        fetchPool();
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleDistribute = async () => {
    if (!pool?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tips/${pool.id}`, { method: 'POST' });
      if (res.ok) {
        fetchPool();
        fetchDistributions();
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `₼${amount.toFixed(2)}`;
  };

  return (
    <div className="space-y-4">
      {/* Pool Status */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <DollarSign size={16} className="text-emerald-400 mb-2" />
          <p className="text-lg font-bold text-[var(--theme-text)]">
            {pool ? formatCurrency(pool.total_amount) : '₼0.00'}
          </p>
          <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-wider">Total Pool</p>
        </div>
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <Users size={16} className="text-blue-400 mb-2" />
          <p className="text-lg font-bold text-[var(--theme-text)]">{distributions.length}</p>
          <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-wider">Staff</p>
        </div>
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <PieChart size={16} className="text-purple-400 mb-2" />
          <p className="text-lg font-bold text-[var(--theme-text)] capitalize">
            {pool?.status || 'No Pool'}
          </p>
          <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-wider">Status</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        {!pool || pool.status === 'open' ? (
          <button
            onClick={handleCreatePool}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 text-white font-bold text-sm disabled:opacity-50"
          >
            <DollarSign size={16} />
            {pool ? 'Recalculate Pool' : 'Create Pool'}
          </button>
        ) : null}
        {pool && pool.status === 'open' && (
          <button
            onClick={handleDistribute}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-500 text-white font-bold text-sm disabled:opacity-50"
          >
            <PieChart size={16} />
            Distribute Tips
          </button>
        )}
        <button
          onClick={() => setShowRules(!showRules)}
          className="px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-[var(--theme-text)] text-sm"
        >
          <Settings size={16} />
        </button>
      </div>

      {/* Rules Editor */}
      <AnimatePresence>
        {showRules && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]"
          >
            <h4 className="text-xs font-bold text-[var(--theme-text)] mb-3">TipOut Configuration</h4>
            <div className="space-y-2">
              {rules.map((rule) => (
                <div key={rule.id} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02]">
                  <span className="text-xs text-[var(--theme-text)]">{rule.role_name}</span>
                  <span className="text-xs font-medium text-emerald-400">{rule.percentage}%</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-white/[0.06]">
              <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-wider mb-2">Add New Rule</p>
              <div className="flex gap-2">
                <select className="flex-1 rounded-lg px-3 py-2 text-xs bg-white/[0.03] border border-white/[0.08] text-[var(--theme-text)]">
                  <option value="">Select Role</option>
                  {rules.map(r => <option key={r.id} value={r.role_id}>{r.role_name}</option>)}
                </select>
                <input type="number" placeholder="%" className="w-20 rounded-lg px-3 py-2 text-xs bg-white/[0.03] border border-white/[0.08] text-[var(--theme-text)]" />
                <button className="px-3 py-2 rounded-lg bg-emerald-500 text-white text-xs font-bold">Add</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tip Shortfall */}
      {shortfall && (
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={14} className="text-amber-400" />
            <h4 className="text-xs font-bold text-[var(--theme-text)] uppercase tracking-wider">Tip Shortfall Check</h4>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-wider">Hours Worked</p>
              <p className="text-sm font-bold text-[var(--theme-text)]">{shortfall.hours_worked?.toFixed(1) || 0}h</p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-wider">Tips Earned</p>
              <p className="text-sm font-bold text-emerald-400">{formatCurrency(shortfall.tips_earned || 0)}</p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-wider">Shortfall</p>
              <p className={`text-sm font-bold ${shortfall.shortfall_amount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {formatCurrency(shortfall.shortfall_amount || 0)}
              </p>
            </div>
          </div>
          {shortfall.shortfall_amount > 0 && (
            <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-[10px] text-amber-400">
                Tips + tipped wage is below minimum wage. Shortfall: {formatCurrency(shortfall.shortfall_amount)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Distributions */}
      {distributions.length > 0 && (
        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold mb-2">
            Distributions
          </h4>
          <div className="space-y-2">
            {distributions.map((dist) => (
              <div
                key={dist.staff_id}
                className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between"
              >
                <div>
                  <p className="text-xs font-medium text-[var(--theme-text)]">{dist.staff_name}</p>
                  <p className="text-[10px] text-[var(--theme-text-muted)]">
                    {dist.role_name} - {dist.hours_worked?.toFixed(1)}h
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-emerald-400">{formatCurrency(dist.amount)}</p>
                  <p className="text-[10px] text-[var(--theme-text-muted)]">{dist.percentage}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
