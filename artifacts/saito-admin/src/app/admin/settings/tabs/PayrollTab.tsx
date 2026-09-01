'use client';

import React, { useState, useEffect } from 'react';
import { toast } from '@/lib/toast';
import { Wallet, Send, Download, Check, X, Loader2 } from 'lucide-react';

type WebhookConfig = {
  id: string;
  provider: string;
  webhook_url: string;
  webhook_secret?: string;
  is_active: boolean;
  last_export_at?: string;
};

type ExportRecord = {
  id: string;
  provider: string;
  period_start: string;
  period_end: string;
  status: string;
  sent_at?: string;
  entries_count: number;
  error_message?: string;
};

export default function PayrollTab() {
  const [configs, setConfigs] = useState<WebhookConfig[]>([]);
  const [exports, setExports] = useState<ExportRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProvider, setNewProvider] = useState('custom');
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [newWebhookSecret, setNewWebhookSecret] = useState('');
  const [periodStart, setPeriodStart] = useState(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().split('T')[0]);

  const fetchConfigs = async () => {
    try {
      const res = await fetch('/api/settings/payroll');
      if (res.ok) {
        const data = await res.json();
        setConfigs(data.configs || []);
      }
    } catch {
      // ignore
    }
  };

  const fetchExports = async () => {
    try {
      const res = await fetch('/api/payroll/export');
      if (res.ok) {
        const data = await res.json();
        setExports(data.exports || []);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchConfigs();
    fetchExports();
  }, []);

  const handleAddConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/settings/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: newProvider,
          webhook_url: newWebhookUrl,
          webhook_secret: newWebhookSecret || null,
        }),
      });
      if (res.ok) {
        toast.success('Webhook config saved');
        setShowAddForm(false);
        setNewWebhookUrl('');
        setNewWebhookSecret('');
        fetchConfigs();
      } else {
        toast.error('Failed to save config');
      }
    } catch {
      toast.error('Error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setLoading(true);
    try {
      const activeConfig = configs.find(c => c.is_active);
      if (!activeConfig) {
        toast.error('No active webhook config');
        return;
      }

      const res = await fetch('/api/payroll/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhook_url: activeConfig.webhook_url,
          webhook_secret: activeConfig.webhook_secret,
          provider: activeConfig.provider,
          period_start: periodStart,
          period_end: periodEnd,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(`Exported ${data.entries} entries`);
        fetchExports();
      } else {
        toast.error('Export failed');
      }
    } catch {
      toast.error('Error occurred');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `₼${amount.toFixed(2)}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black text-[var(--theme-text)]">Payroll & Webhooks</h3>
          <p className="text-[10px] text-[var(--theme-text-muted)] mt-1">
            Configure external payroll integrations and automate tip shortfall calculations
          </p>
        </div>
      </div>

      {/* Webhook Configs */}
      <div className="bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-[var(--theme-border)] flex items-center justify-between">
          <h4 className="text-xs font-bold text-[var(--theme-text)] uppercase tracking-wider">Webhook Configurations</h4>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3 py-1.5 rounded-lg bg-white text-black text-xs font-bold hover:bg-white/90 transition-all"
          >
            Add Config
          </button>
        </div>

        {showAddForm && (
          <form onSubmit={handleAddConfig} className="p-4 border-b border-[var(--theme-border)] space-y-3 bg-white/[0.02]">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold mb-1 block">Provider</label>
                <select
                  value={newProvider}
                  onChange={(e) => setNewProvider(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 text-xs bg-white/[0.03] border border-white/[0.08] text-[var(--theme-text)]"
                >
                  <option value="custom">Custom Webhook</option>
                  <option value="gusto">Gusto</option>
                  <option value="deel">Deel</option>
                  <option value="paychex">Paychex</option>
                  <option value="adp">ADP</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold mb-1 block">Webhook URL</label>
                <input
                  type="url"
                  value={newWebhookUrl}
                  onChange={(e) => setNewWebhookUrl(e.target.value)}
                  placeholder="https://api.example.com/payroll"
                  className="w-full rounded-xl px-3 py-2 text-xs bg-white/[0.03] border border-white/[0.08] text-[var(--theme-text)]"
                  required
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold mb-1 block">Webhook Secret (optional)</label>
              <input
                type="text"
                value={newWebhookSecret}
                onChange={(e) => setNewWebhookSecret(e.target.value)}
                placeholder="Optional signing secret"
                className="w-full rounded-xl px-3 py-2 text-xs bg-white/[0.03] border border-white/[0.08] text-[var(--theme-text)]"
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={loading} className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-xs font-bold disabled:opacity-50">
                {loading ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
              </button>
              <button type="button" onClick={() => setShowAddForm(false)} className="px-4 py-2 rounded-xl bg-white/5 text-[var(--theme-text-muted)] text-xs font-bold hover:bg-white/10">
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="divide-y divide-white/[0.04]">
          {configs.length === 0 ? (
            <p className="text-xs text-[var(--theme-text-muted)] text-center py-8">No webhook configurations</p>
          ) : (
            configs.map(config => (
              <div key={config.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-[var(--theme-text)]">{config.provider}</p>
                  <p className="text-[10px] text-[var(--theme-text-muted)]">{config.webhook_url}</p>
                  {config.last_export_at && (
                    <p className="text-[10px] text-[var(--theme-text-muted)]">Last export: {new Date(config.last_export_at).toLocaleString()}</p>
                  )}
                </div>
                <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${config.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-[var(--theme-text-muted)]'}`}>
                  {config.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Export */}
      <div className="bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-[var(--theme-border)]">
          <h4 className="text-xs font-bold text-[var(--theme-text)] uppercase tracking-wider">Payroll Export</h4>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold mb-1 block">Period Start</label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-xs bg-white/[0.03] border border-white/[0.08] text-[var(--theme-text)]"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold mb-1 block">Period End</label>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-xs bg-white/[0.03] border border-white/[0.08] text-[var(--theme-text)]"
              />
            </div>
          </div>
          <button
            onClick={handleExport}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 text-white font-bold text-sm disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Export Payroll Data
          </button>
        </div>
      </div>

      {/* Export History */}
      {exports.length > 0 && (
        <div className="bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-[var(--theme-border)]">
            <h4 className="text-xs font-bold text-[var(--theme-text)] uppercase tracking-wider">Export History</h4>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {exports.map(exp => (
              <div key={exp.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-[var(--theme-text)]">{exp.provider}</p>
                  <p className="text-[10px] text-[var(--theme-text-muted)]">
                    {exp.period_start} — {exp.period_end} · {exp.entries_count} entries
                  </p>
                  {exp.sent_at && (
                    <p className="text-[10px] text-[var(--theme-text-muted)]">Sent: {new Date(exp.sent_at).toLocaleString()}</p>
                  )}
                  {exp.error_message && (
                    <p className="text-[10px] text-rose-400">{exp.error_message}</p>
                  )}
                </div>
                <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                  exp.status === 'sent' ? 'bg-emerald-500/20 text-emerald-400' :
                  exp.status === 'failed' ? 'bg-rose-500/20 text-rose-400' :
                  'bg-amber-500/20 text-amber-400'
                }`}>
                  {exp.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
