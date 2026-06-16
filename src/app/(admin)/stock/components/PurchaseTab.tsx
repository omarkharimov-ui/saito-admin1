'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Loader2, CheckCircle, AlertCircle, Trash2, Plus, Save, ShieldAlert, FileText, Banknote, Users, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { InvoiceDropzone, type OCRResult, type OCRLine } from '../../purchase/components/InvoiceDropzone';
import { ProcurementIntelligencePanel } from './ProcurementIntelligencePanel';

type ProcurementSummary = {
  suppliers: any[];
  invoices: any[];
  receipts: any[];
  anomalies: any[];
  statusSummary?: {
    supplierCount?: number;
    activeSuppliers?: number;
    invoiceCount?: number;
    openInvoiceCount?: number;
    draftInvoiceCount?: number;
    reviewRequiredInvoiceCount?: number;
    receiptCount?: number;
    openAnomalies?: number;
    criticalAnomalies?: number;
    reorderSuggestions?: number;
    anomalyCountsByType?: Record<string, number>;
  };
};

export function PurchaseTab() {
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [summary, setSummary] = useState<ProcurementSummary>({ suppliers: [], invoices: [], receipts: [], anomalies: [] });
  const [importResult, setImportResult] = useState<{
    imported: number;
    drafted: number;
    skipped: number;
    reviewRequired?: number;
    discrepancies?: Array<{ reason: string; severity: string; details: Record<string, any> }>;
    results: { name: string; status: string; error?: string; reviewRequired?: boolean; confidence?: number }[];
  } | null>(null);

  const handleParsed = useCallback((result: OCRResult) => {
    setOcrResult(result);
    setImportResult(null);
    toast.success(`${result.lines.length} məhsul OCR ilə tanındı`);
  }, []);

  const updateLine = (index: number, patch: Partial<OCRLine>) => {
    if (!ocrResult) return;
    setOcrResult({
      ...ocrResult,
      lines: ocrResult.lines.map((line, i) => i === index ? { ...line, ...patch } : line),
    });
  };

  const removeLine = (index: number) => {
    if (!ocrResult) return;
    setOcrResult({
      ...ocrResult,
      lines: ocrResult.lines.filter((_, i) => i !== index),
    });
  };

  const addLine = () => {
    if (!ocrResult) return;
    setOcrResult({
      ...ocrResult,
      lines: [...ocrResult.lines, { name: '', quantity: 1, unit: 'pcs', unit_cost: null, total_cost: null, waste_percentage: null }],
    });
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/inventory/procurement', { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Procurement summary load failed');
        if (alive) setSummary(data);
      } catch (e: any) {
        if (alive) toast.error(e.message || 'Procurement summary yüklənmədi');
      } finally {
        if (alive) setLoadingSummary(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const procurementStats = useMemo(() => ({
    suppliers: summary.statusSummary?.supplierCount ?? summary.suppliers.length,
    invoices: summary.statusSummary?.invoiceCount ?? summary.invoices.length,
    receipts: summary.statusSummary?.receiptCount ?? summary.receipts.length,
    openInvoices: summary.statusSummary?.openInvoiceCount ?? summary.invoices.filter((invoice: any) => invoice.status !== 'applied').length,
    anomalies: summary.statusSummary?.openAnomalies ?? summary.anomalies.length,
    unresolved: summary.statusSummary?.draftInvoiceCount ?? summary.invoices.filter((invoice: any) => invoice.status !== 'applied').length,
  }), [summary]);

  const handleImport = async (action: 'draft' | 'approve' = 'draft') => {
    if (!ocrResult || ocrResult.lines.length === 0) return;
    setImporting(true);
    setImportResult(null);

    try {
      const res = await fetch('/api/inventory/procurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          payload: {
            supplierName: ocrResult.supplierName,
            invoiceNumber: ocrResult.invoiceNumber,
            totalAmount: ocrResult.totalAmount,
            lines: ocrResult.lines,
            reviewMode: action !== 'approve',
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import xətası');

      setImportResult(data);
      if (action === 'approve') {
        toast.success(`${data.imported} ingredient stoka əlavə edildi`);
      } else {
        toast.success(`${data.drafted || 0} sətir review üçün draft saxlandı`);
      }
      if (data.reviewRequired > 0) {
        toast.error(`${data.reviewRequired} sətir manual review tələb edir`);
      }
      if (data.skipped > 0) {
        toast.error(`${data.skipped} sətir avtomatik həll olunmadı`);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setImporting(false);
    }
  };

  const resetAll = () => {
    setOcrResult(null);
    setImportResult(null);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Təchizatçı', value: loadingSummary ? '...' : procurementStats.suppliers, icon: <Users size={16} /> },
          { label: 'Faktura', value: loadingSummary ? '...' : procurementStats.invoices, icon: <FileText size={16} /> },
          { label: 'Qəbul', value: loadingSummary ? '...' : procurementStats.receipts, icon: <RefreshCw size={16} /> },
          { label: 'Açıq faktura', value: loadingSummary ? '...' : procurementStats.openInvoices, icon: <ShieldAlert size={16} /> },
          { label: 'Xəbərdarlıq', value: loadingSummary ? '...' : procurementStats.anomalies, icon: <Banknote size={16} /> },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
            <div className="flex items-center justify-between text-white/35 mb-3 text-[10px] uppercase tracking-[0.2em]">
              <span>{card.label}</span>
              {card.icon}
            </div>
            <div className="text-2xl font-black text-white">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 md:p-5 space-y-4">
        <ProcurementIntelligencePanel />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/30">Procurement review</p>
            <h3 className="text-lg font-bold text-white mt-1">Qəbul et, yoxla, sonra stokda təsdiqlə</h3>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/35">
            <ShieldAlert size={13} />
            Manual review olmadan posting etmə
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-4">
          <div className="space-y-4">
            {!ocrResult && <InvoiceDropzone onParsed={handleParsed} />}

            <AnimatePresence>
              {ocrResult && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[10px] uppercase tracking-widest text-white/30">Təchizatçı</label>
                        <input
                          type="text"
                          value={ocrResult.supplierName || ''}
                          onChange={e => setOcrResult({ ...ocrResult, supplierName: e.target.value })}
                          placeholder="Təchizatçı adı"
                          className="w-full mt-1 bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/25"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-widest text-white/30">Faktura №</label>
                        <input
                          type="text"
                          value={ocrResult.invoiceNumber || ''}
                          onChange={e => setOcrResult({ ...ocrResult, invoiceNumber: e.target.value })}
                          placeholder="Faktura nömrəsi"
                          className="w-full mt-1 bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/25"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-widest text-white/30">Cəmi məbləğ</label>
                        <input
                          type="number"
                          value={ocrResult.totalAmount ?? ''}
                          onChange={e => setOcrResult({ ...ocrResult, totalAmount: e.target.value ? parseFloat(e.target.value) : null })}
                          placeholder="0.00 ₼"
                          className="w-full mt-1 bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/25"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                    <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
                      <span className="text-sm font-medium text-white/70">
                        Məhsullar ({ocrResult.lines.length})
                      </span>
                      <button
                        onClick={addLine}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/10 text-white/50 hover:text-white/80 text-xs transition-all"
                      >
                        <Plus size={12} /> Sətir əlavə et
                      </button>
                    </div>

                    <div className="divide-y divide-white/[0.04]">
                      {ocrResult.lines.map((line, i) => (
                        <div key={i} className="p-3 md:p-4 flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-3">
                          <div className="flex-1 w-full md:w-auto">
                            <input
                              type="text"
                              value={line.name}
                              onChange={e => updateLine(i, { name: e.target.value })}
                              placeholder="Məhsul adı"
                              className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/25"
                            />
                          </div>
                          <div className="flex items-center gap-2 w-full md:w-auto">
                            <input
                              type="number"
                              value={line.quantity || ''}
                              onChange={e => updateLine(i, { quantity: parseFloat(e.target.value) || 0 })}
                              placeholder="Miqdar"
                              className="w-20 bg-white/[0.05] border border-white/10 rounded-lg px-2 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/25"
                            />
                            <select
                              value={line.unit}
                              onChange={e => updateLine(i, { unit: e.target.value })}
                              className="bg-white/[0.05] border border-white/10 rounded-lg px-2 py-2 text-sm text-white outline-none focus:border-white/25"
                            >
                              <option value="pcs" className="bg-[#1a1a1a]">pcs</option>
                              <option value="kg" className="bg-[#1a1a1a]">kg</option>
                              <option value="g" className="bg-[#1a1a1a]">g</option>
                              <option value="l" className="bg-[#1a1a1a]">l</option>
                              <option value="ml" className="bg-[#1a1a1a]">ml</option>
                              <option value="box" className="bg-[#1a1a1a]">box</option>
                              <option value="bag" className="bg-[#1a1a1a]">bag</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-2 w-full md:w-auto">
                            <input
                              type="number"
                              value={line.unit_cost ?? ''}
                              onChange={e => updateLine(i, { unit_cost: e.target.value ? parseFloat(e.target.value) : null })}
                              placeholder="Birim ₼"
                              className="w-24 bg-white/[0.05] border border-white/10 rounded-lg px-2 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/25"
                            />
                            <button
                              onClick={() => removeLine(i)}
                              className="w-8 h-8 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center transition-all"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <AnimatePresence>
                    {importResult && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.05] to-teal-500/[0.03] p-4 overflow-hidden"
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <CheckCircle size={16} className="text-emerald-400" />
                          <span className="text-sm font-bold text-white">Import nəticəsi</span>
                          <span className="text-xs text-emerald-400/60 ml-auto">
                            {importResult.imported} uğurlu · {importResult.skipped} skip
                          </span>
                        </div>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {importResult.results.map((r, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              {r.status === 'created' || r.status === 'updated' ? (
                                <CheckCircle size={10} className="text-emerald-400 shrink-0" />
                              ) : (
                                <AlertCircle size={10} className="text-amber-400 shrink-0" />
                              )}
                              <span className="text-white/70">{r.name}</span>
                              <span className={`text-[10px] ${r.status === 'created' || r.status === 'updated' ? 'text-emerald-400/60' : 'text-amber-400/60'}`}>
                                {r.status === 'created' ? 'yeni' : r.status === 'updated' ? 'artırıldı' : 'skip'}
                              </span>
                              {r.error && <span className="text-red-400/60">({r.error})</span>}
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={() => handleImport('draft')}
                      disabled={importing || ocrResult.lines.length === 0}
                      className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/[0.05] border border-white/10 text-white text-xs font-bold tracking-wider uppercase hover:bg-white/[0.08] transition-all disabled:opacity-40"
                    >
                      {importing ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Save size={14} />
                      )}
                      Draft saxla
                    </button>
                    <button
                      onClick={() => handleImport('approve')}
                      disabled={importing || ocrResult.lines.length === 0}
                      className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-xs font-bold tracking-wider uppercase hover:brightness-110 transition-all disabled:opacity-40 shadow-lg shadow-emerald-500/20"
                    >
                      <CheckCircle size={14} />
                      Təsdiqlə və stoka əlavə et
                    </button>
                    <button
                      onClick={resetAll}
                      disabled={importing}
                      className="px-6 py-3 rounded-xl bg-white/[0.05] border border-white/10 text-white/50 hover:text-white/80 text-xs font-bold tracking-wider uppercase transition-all disabled:opacity-30"
                    >
                      Başqa faktura
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center gap-2 text-white/35 text-[10px] uppercase tracking-[0.2em]">
                <ShieldAlert size={13} /> Review queue
              </div>
              <div className="space-y-2">
                {(importResult?.discrepancies?.length ? importResult.discrepancies : summary.anomalies?.length ? summary.anomalies.map((item: any) => ({ reason: item.title || item.type || 'anomaly', severity: item.severity || 'medium', details: { description: item.description || item.details || 'Manual yoxlama tələb edir.' } })) : [{ reason: 'Hələ anomaly yoxdur', severity: 'ok', details: { description: 'Yeni mismatch görünəndə burada çıxacaq.' } }]).map((item: any, idx: number) => (
                  <div key={idx} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-white">{item.reason || item.title || 'Uyğunsuzluq'}</p>
                      <span className="text-[10px] uppercase tracking-[0.18em] text-amber-400">{item.severity || 'review'}</span>
                    </div>
                    <p className="text-xs text-white/35 mt-1">{item.details?.description || item.description || 'Manual yoxlama tələb edir.'}</p>
                  </div>
                ))}
              </div>
              {importResult?.reviewRequired ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-100">
                  {importResult.reviewRequired} sətir manual təsdiq gözləyir.
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="flex items-center gap-2 text-white/35 text-[10px] uppercase tracking-[0.2em] mb-3">
                <Banknote size={13} /> Son sənədlər
              </div>
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {summary.invoices.length === 0 ? (
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-sm text-white/35">Hələ faktura yoxdur.</div>
                ) : summary.invoices.slice(0, 8).map((invoice: any) => (
                  <div key={invoice.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">{invoice.invoice_number || 'Nömrəsiz faktura'}</p>
                      <p className="text-xs text-white/35">{invoice.status} · {invoice.source_type || 'manual'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-white">{Number(invoice.total_amount || 0).toLocaleString('az-AZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₼</p>
                      <p className="text-xs text-white/35">{invoice.supplier_id ? 'supplier bağlı' : 'supplier yox'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
