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

  useEffect(() => {
    fetchPool();
    fetchRules();
  }, [fetchPool, fetchRules]);

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
            <h4 className="text-xs font-bold text-[var(--theme-text)] mb-3">Distribution Rules</h4>
            <div className="space-y-2">
              {rules.map((rule) => (
                <div key={rule.id} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02]">
                  <span className="text-xs text-[var(--theme-text)]">{rule.role_name}</span>
                  <span className="text-xs font-medium text-emerald-400">{rule.percentage}%</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
