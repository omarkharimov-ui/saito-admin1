'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle, XCircle, Clock, DollarSign, Edit, Filter } from 'lucide-react';
import { toast } from '@/lib/toast';

type Approval = {
  id: string;
  request_type: 'void' | 'refund' | 'discount' | 'price_override' | 'other';
  staff_id: string;
  staff_name: string;
  amount: number | null;
  original_amount: number | null;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null;
  created_at: string;
};

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/staff/approvals');
      if (res.ok) {
        const data = await res.json();
        setApprovals(data.approvals || []);
      }
    } catch { toast.error('Failed to load approvals'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchApprovals(); }, [fetchApprovals]);

  const filteredApprovals = approvals.filter(a => filter === 'all' || a.status === filter);
  const pendingCount = approvals.filter(a => a.status === 'pending').length;

  const handleApprove = async (id: string) => {
    try {
      const res = await fetch(`/api/staff/approvals/${id}/approve`, { method: 'POST' });
      if (res.ok) { toast.success('Approved'); fetchApprovals(); }
      else toast.error('Failed');
    } catch { toast.error('Error'); }
  };

  const handleReject = async (id: string) => {
    const reason = prompt('Rejection reason:');
    if (!reason) return;
    try {
      const res = await fetch(`/api/staff/approvals/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) { toast.success('Rejected'); fetchApprovals(); }
      else toast.error('Failed');
    } catch { toast.error('Error'); }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'void': return <XCircle size={14} className="text-rose-400" />;
      case 'refund': return <DollarSign size={14} className="text-amber-400" />;
      case 'discount': return <DollarSign size={14} className="text-blue-400" />;
      case 'price_override': return <Edit size={14} className="text-purple-400" />;
      default: return <AlertTriangle size={14} className="text-zinc-400" />;
    }
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-black text-[var(--theme-text)] tracking-tight">APPROVALS</h1>
          <p className="text-[10px] text-[var(--theme-text-muted)] mt-0.5 uppercase tracking-widest">
            {pendingCount} Pending
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <button onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === 'all' ? 'bg-[var(--theme-text)] text-[var(--theme-surface)]' : 'text-[var(--theme-text-muted)]'}`}>
            All ({approvals.length})
          </button>
          <button onClick={() => setFilter('pending')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === 'pending' ? 'bg-amber-500 text-white' : 'text-[var(--theme-text-muted)]'}`}>
            Pending ({pendingCount})
          </button>
          <button onClick={() => setFilter('approved')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === 'approved' ? 'bg-emerald-500 text-white' : 'text-[var(--theme-text-muted)]'}`}>
            Approved
          </button>
          <button onClick={() => setFilter('rejected')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === 'rejected' ? 'bg-rose-500 text-white' : 'text-[var(--theme-text-muted)]'}`}>
            Rejected
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.02)' }} />
            ))}
          </div>
        ) : filteredApprovals.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <CheckCircle size={48} className="mx-auto text-[var(--theme-text-muted)] mb-4" />
              <p className="text-sm text-[var(--theme-text-secondary)]">No approvals</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredApprovals.map(approval => (
              <div key={approval.id} className="p-4 rounded-xl flex items-center gap-4"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.03)' }}>
                  {getTypeIcon(approval.request_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[var(--theme-text)]">{approval.staff_name}</p>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-white/5 text-[var(--theme-text-muted)]">
                      {approval.request_type.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--theme-text-muted)] truncate">{approval.reason}</p>
                  <p className="text-[10px] text-[var(--theme-text-muted)]">{new Date(approval.created_at).toLocaleString()}</p>
                </div>
                {approval.amount !== null && (
                  <div className="text-right">
                    <p className="text-xs text-[var(--theme-text)]">₼{approval.amount.toFixed(2)}</p>
                    {approval.original_amount !== null && (
                      <p className="text-[10px] text-[var(--theme-text-muted)]">from ₼{approval.original_amount.toFixed(2)}</p>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  {approval.status === 'pending' ? (
                    <>
                      <button onClick={() => handleApprove(approval.id)}
                        className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors">
                        <CheckCircle size={14} />
                      </button>
                      <button onClick={() => handleReject(approval.id)}
                        className="p-2 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors">
                        <XCircle size={14} />
                      </button>
                    </>
                  ) : (
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-medium ${
                      approval.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                    }`}>
                      {approval.status.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
