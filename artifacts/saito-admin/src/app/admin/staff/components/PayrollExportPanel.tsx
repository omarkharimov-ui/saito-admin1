'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, FileText, Download, History, CalendarDays, Users } from '@/components/ui/saito-icons';
import { toast } from '@/lib/toast';

interface PayrollEntry {
  staff_id: string;
  staff_name: string;
  role_name: string;
  period_start: string;
  period_end: string;
  hours_worked: number;
  hourly_rate: number;
  overtime_hours: number;
  overtime_rate: number;
  tips_earned: number;
  tip_shortfall: number;
  gross_pay: number;
  deductions: number;
  net_pay: number;
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const manat = (v: number) => `${r2(v).toFixed(2)} ₼`;

// Local-calendar date (toISOString() shifts the day in UTC+4 — Baku 00:00 = prev day UTC).
function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function PayrollExportPanel({ onClose }: { onClose: () => void }) {
  // Default period = current month
  const now = new Date();
  const [periodStart, setPeriodStart] = useState<string>(fmtDate(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [periodEnd, setPeriodEnd] = useState<string>(fmtDate(now));
  const [preset, setPreset] = useState<'this_month' | 'last_month' | 'custom'>('this_month');
  const [entries, setEntries] = useState<PayrollEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [history, setHistory] = useState<any[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const applyPreset = (p: 'this_month' | 'last_month') => {
    setPreset(p);
    const d = new Date();
    if (p === 'this_month') {
      setPeriodStart(fmtDate(new Date(d.getFullYear(), d.getMonth(), 1)));
      setPeriodEnd(fmtDate(d));
    } else {
      setPeriodStart(fmtDate(new Date(d.getFullYear(), d.getMonth() - 1, 1)));
      setPeriodEnd(fmtDate(new Date(d.getFullYear(), d.getMonth(), 0)));
    }
  };

  const loadPreview = useCallback(async () => {
    if (!periodStart || !periodEnd || periodStart > periodEnd) {
      toast.error('Dövri yoxlayın — başlanğıc bitiməndən əvvəl olmalıdır');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/payroll/export?period_start=${periodStart}&period_end=${periodEnd}&format=json`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Maaş hesabatı yüklənə bilmədi');
        setEntries(null);
      } else {
        setEntries(data.entries || []);
      }
    } catch {
      toast.error('Əlaqə xətası');
    } finally {
      setLoading(false);
    }
  }, [periodStart, periodEnd]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/payroll/export/history');
      if (res.ok) {
        const data = await res.json();
        setHistory(data.exports || []);
      }
    } catch { /* non-critical */ }
    finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleCsvExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/payroll/export?period_start=${periodStart}&period_end=${periodEnd}&format=csv`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'CSV yüklənə bilmədi');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payroll-${periodStart}_${periodEnd}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Maaş eksportu yükləndi (${periodStart} → ${periodEnd})`);
      loadHistory();
    } catch {
      toast.error('CSV yüklənə bilmədi');
    } finally {
      setExporting(false);
    }
  };

  const totals = entries
    ? {
        hours: r2(entries.reduce((a, e) => a + Number(e.hours_worked || 0), 0)),
        ot: r2(entries.reduce((a, e) => a + Number(e.overtime_hours || 0), 0)),
        tips: r2(entries.reduce((a, e) => a + Number(e.tips_earned || 0), 0)),
        gross: r2(entries.reduce((a, e) => a + Number(e.gross_pay || 0), 0)),
        net: r2(entries.reduce((a, e) => a + Number(e.net_pay || 0), 0)),
      }
    : null;

  return (
    <>
      <div
        className="fixed inset-0 z-[100] bg-black/50"
        style={{ backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />
      <motion.div
        initial={{ x: '100%', opacity: 0.8 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0.8 }}
        transition={{ type: 'spring', stiffness: 400, damping: 35, mass: 0.9 }}
        className="fixed right-0 top-0 bottom-0 z-[101] w-full max-w-[780px] ml-auto bg-[var(--theme-surface)] border-l border-[var(--theme-border)] shadow-2xl flex flex-col rounded-l-3xl"
      >
        {/* Header */}
        <div className="p-6 border-b border-[var(--theme-border)] flex items-start justify-between">
          <div>
            <h2 className="text-base font-black text-[var(--theme-text)]">MAAŞ EKSPORTU</h2>
            <p className="text-[10px] text-[var(--theme-text-muted)] mt-1 uppercase tracking-widest">
              Vaxt qeydiyyatı (punch) əsasında hesabat · CSV
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Period picker */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays size={14} className="text-[var(--theme-text-muted)]" />
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--theme-text-muted)]">Hesabat dövrü</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => applyPreset('this_month')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                  preset === 'this_month'
                    ? 'bg-emerald-500 text-neutral-950'
                    : 'bg-white/[0.04] border border-white/[0.08] text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]'
                }`}
              >
                Bu ay
              </button>
              <button
                onClick={() => applyPreset('last_month')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                  preset === 'last_month'
                    ? 'bg-emerald-500 text-neutral-950'
                    : 'bg-white/[0.04] border border-white/[0.08] text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]'
                }`}
              >
                Keçən ay
              </button>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={periodStart}
                  onChange={(e) => { setPeriodStart(e.target.value); setPreset('custom'); }}
                  className="rounded-xl px-3 py-2 text-xs text-[var(--theme-text)] outline-none [color-scheme:dark]"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
                />
                <span className="text-[var(--theme-text-muted)] text-xs">→</span>
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => { setPeriodEnd(e.target.value); setPreset('custom'); }}
                  className="rounded-xl px-3 py-2 text-xs text-[var(--theme-text)] outline-none [color-scheme:dark]"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
                />
              </div>
              <button
                onClick={loadPreview}
                disabled={loading}
                className="ml-auto flex items-center gap-2 px-4 py-2.5 bg-white/[0.04] border border-white/[0.10] rounded-xl text-xs font-bold text-[var(--theme-text)] hover:bg-white/[0.08] transition-all disabled:opacity-50"
              >
                {loading ? (
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white/20 border-t-emerald-400 animate-spin" />
                ) : (
                  <Users size={14} />
                )}
                Hesabatı yüklə
              </button>
            </div>
          </section>

          {/* Preview table */}
          {entries && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--theme-text-muted)]">
                  {entries.length} işçi · {periodStart} → {periodEnd}
                </h3>
                <button
                  onClick={handleCsvExport}
                  disabled={exporting}
                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-neutral-950 rounded-xl text-xs font-bold hover:opacity-90 transition-all active:scale-95 disabled:opacity-50"
                >
                  {exporting ? (
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-neutral-900/30 border-t-neutral-900 animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  CSV EKSORTU
                </button>
              </div>
              <div className="rounded-2xl border border-white/[0.08] overflow-hidden overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-white/[0.03] text-[var(--theme-text-muted)]">
                      <th className="text-left font-bold uppercase tracking-wider text-[9px] px-3 py-2.5">İşçi</th>
                      <th className="text-left font-bold uppercase tracking-wider text-[9px] px-3 py-2.5">Roll</th>
                      <th className="text-right font-bold uppercase tracking-wider text-[9px] px-3 py-2.5">Saat</th>
                      <th className="text-right font-bold uppercase tracking-wider text-[9px] px-3 py-2.5">Əlavə</th>
                      <th className="text-right font-bold uppercase tracking-wider text-[9px] px-3 py-2.5">Tarif</th>
                      <th className="text-right font-bold uppercase tracking-wider text-[9px] px-3 py-2.5">Ucma</th>
                      <th className="text-right font-bold uppercase tracking-wider text-[9px] px-3 py-2.5">Brutto</th>
                      <th className="text-right font-bold uppercase tracking-wider text-[9px] px-3 py-2.5">Netto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(e => (
                      <tr key={e.staff_id} className="border-t border-white/[0.05] hover:bg-white/[0.02]">
                        <td className="px-3 py-2.5 font-medium text-[var(--theme-text)] whitespace-nowrap">{e.staff_name}</td>
                        <td className="px-3 py-2.5 text-[var(--theme-text-muted)] capitalize whitespace-nowrap">{e.role_name}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[var(--theme-text)]">{Number(e.hours_worked).toFixed(2)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[var(--theme-text-muted)]">{Number(e.overtime_hours).toFixed(2)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[var(--theme-text-muted)]">{Number(e.hourly_rate).toFixed(2)} ₼</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[var(--theme-text-muted)]">{Number(e.tips_earned).toFixed(2)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-medium text-[var(--theme-text)]">{manat(Number(e.gross_pay))}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-bold text-emerald-400">{manat(Number(e.net_pay))}</td>
                      </tr>
                    ))}
                  </tbody>
                  {totals && (
                    <tfoot>
                      <tr className="border-t border-white/[0.10] bg-white/[0.03]">
                        <td colSpan={2} className="px-3 py-2.5 font-black uppercase tracking-wider text-[10px] text-[var(--theme-text)]">Cəmi</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-bold text-[var(--theme-text)]">{totals.hours.toFixed(2)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-bold text-[var(--theme-text)]">{totals.ot.toFixed(2)}</td>
                        <td className="px-3 py-2.5" />
                        <td className="px-3 py-2.5 text-right tabular-nums font-bold text-[var(--theme-text)]">{totals.tips.toFixed(2)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-black text-[var(--theme-text)]">{manat(totals.gross)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-black text-emerald-400">{manat(totals.net)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              <p className="text-[10px] text-[var(--theme-text-muted)] mt-2">
                Saatlar = vaxt qeydiyyatı (clock in/out cütləri); əlavə = təsdiqlənmiş overtime qeydləri; ucma = dövr içi ucma payları.
              </p>
            </section>
          )}

          {/* History */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <History size={14} className="text-[var(--theme-text-muted)]" />
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--theme-text-muted)]">Eksport tarixçəsi</h3>
            </div>
            {historyLoading ? (
              <p className="text-[11px] text-[var(--theme-text-muted)]">Yüklənir...</p>
            ) : history && history.length > 0 ? (
              <div className="space-y-1.5">
                {history.map((h: any) => (
                  <div key={h.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                    <div className="flex items-center gap-2.5">
                      <FileText size={13} className="text-[var(--theme-text-muted)]" />
                      <div>
                        <p className="text-xs font-medium text-[var(--theme-text)]">
                          {h.period?.period_start} → {h.period?.period_end}
                        </p>
                        <p className="text-[10px] text-[var(--theme-text-muted)]">
                          {h.exporter?.name || '—'} · {h.exported_at ? new Date(h.exported_at).toLocaleString() : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${
                        h.export_format === 'csv'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-blue-500/10 text-blue-400'
                      }`}>
                        {h.export_format}
                      </span>
                      {h.period?.status && (
                        <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-white/[0.05] text-[var(--theme-text-muted)]">
                          {h.period.status}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-[var(--theme-text-muted)]">Hələ eksport yoxdur</p>
            )}
          </section>
        </div>
      </motion.div>
    </>
  );
}
