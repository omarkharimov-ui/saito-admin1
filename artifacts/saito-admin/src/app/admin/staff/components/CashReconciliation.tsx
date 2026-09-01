'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DollarSign, Plus, Minus, CheckCircle, AlertTriangle, X } from 'lucide-react';

interface Denomination {
  value: number;
  label: string;
  count: number;
}

interface CashReconciliationProps {
  shiftId: string;
  staffId: string;
  startingCash: number;
  expectedCash: number;
  onComplete?: () => void;
}

export function CashReconciliation({
  shiftId,
  staffId,
  startingCash,
  expectedCash,
  onComplete,
}: CashReconciliationProps) {
  const [denominations, setDenominations] = useState<Denomination[]>([
    { value: 100, label: '₼100', count: 0 },
    { value: 50, label: '₼50', count: 0 },
    { value: 20, label: '₼20', count: 0 },
    { value: 10, label: '₼10', count: 0 },
    { value: 5, label: '₼5', count: 0 },
    { value: 1, label: '₼1', count: 0 },
    { value: 0.5, label: '50p', count: 0 },
    { value: 0.2, label: '20p', count: 0 },
    { value: 0.1, label: '10p', count: 0 },
    { value: 0.05, label: '5p', count: 0 },
  ]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const actualCash = denominations.reduce((sum, d) => sum + d.value * d.count, 0);
  const difference = actualCash - expectedCash;
  const isOver = difference > 0;
  const isShort = difference < 0;
  const isBalanced = Math.abs(difference) < 0.01;

  const updateCount = (index: number, delta: number) => {
    setDenominations((prev) =>
      prev.map((d, i) => (i === index ? { ...d, count: Math.max(0, d.count + delta) } : d))
    );
  };

  const setCount = (index: number, count: number) => {
    setDenominations((prev) =>
      prev.map((d, i) => (i === index ? { ...d, count: Math.max(0, count) } : d))
    );
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cash/reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shiftId,
          staffId,
          denominations: denominations.map((d) => ({
            denomination: d.value,
            count: d.count,
          })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setResult(data);
        onComplete?.();
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `₼${Math.abs(amount).toFixed(2)}`;
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-wider mb-1">Starting</p>
          <p className="text-sm font-bold text-[var(--theme-text)]">{formatCurrency(startingCash)}</p>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-wider mb-1">Expected</p>
          <p className="text-sm font-bold text-[var(--theme-text)]">{formatCurrency(expectedCash)}</p>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-wider mb-1">Actual</p>
          <p className="text-sm font-bold text-blue-400">{formatCurrency(actualCash)}</p>
        </div>
      </div>

      {/* Difference Indicator */}
      <div
        className={`p-4 rounded-xl border ${
          isBalanced
            ? 'bg-emerald-500/10 border-emerald-500/20'
            : isOver
            ? 'bg-blue-500/10 border-blue-500/20'
            : 'bg-rose-500/10 border-rose-500/20'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isBalanced ? (
              <CheckCircle size={20} className="text-emerald-400" />
            ) : (
              <AlertTriangle size={20} className={isOver ? 'text-blue-400' : 'text-rose-400'} />
            )}
            <div>
              <p className={`text-sm font-bold ${isBalanced ? 'text-emerald-400' : isOver ? 'text-blue-400' : 'text-rose-400'}`}>
                {isBalanced ? 'Balanced' : isOver ? 'Over' : 'Short'}
              </p>
              <p className="text-xs text-[var(--theme-text-muted)]">Difference</p>
            </div>
          </div>
          <p className={`text-xl font-bold ${isBalanced ? 'text-emerald-400' : isOver ? 'text-blue-400' : 'text-rose-400'}`}>
            {isOver ? 'isShort' : ''}
            {formatCurrency(difference)}
          </p>
        </div>
      </div>

      {/* Denomination Counter */}
      <div>
        <h4 className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold mb-3">
          Count Cash
        </h4>
        <div className="space-y-2">
          {denominations.map((denom, index) => (
            <div
              key={denom.value}
              className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]"
            >
              <div className="flex items-center gap-3">
                <span className="w-12 text-sm font-bold text-[var(--theme-text)]">{denom.label}</span>
                <span className="text-xs text-[var(--theme-text-muted)]">
                  {denom.count > 0 ? `= ${formatCurrency(denom.value * denom.count)}` : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateCount(index, -1)}
                  className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]"
                >
                  <Minus size={14} />
                </button>
                <input
                  type="number"
                  min="0"
                  value={denom.count || ''}
                  onChange={(e) => setCount(index, parseInt(e.target.value) || 0)}
                  className="w-16 px-2 py-1 rounded-lg bg-white/[0.03] border border-white/[0.08] text-center text-sm text-[var(--theme-text)] focus:outline-none focus:border-[var(--theme-text)]"
                />
                <button
                  onClick={() => updateCount(index, 1)}
                  className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold mb-2 block">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add any notes about the reconciliation..."
          className="w-full px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-[var(--theme-text)] text-sm focus:outline-none focus:border-[var(--theme-text)] resize-none"
          rows={3}
        />
      </div>

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full py-3 rounded-xl bg-emerald-500 text-white font-bold text-sm disabled:opacity-50"
      >
        Submit Reconciliation
      </button>
    </div>
  );
}
