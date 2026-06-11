'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Loader2, CheckCircle, AlertCircle, Trash2, Plus, Save } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { InvoiceDropzone, type OCRResult, type OCRLine } from '../../purchase/components/InvoiceDropzone';

export function PurchaseTab() {
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
    results: { name: string; status: string; error?: string }[];
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

  const handleImport = async () => {
    if (!ocrResult || ocrResult.lines.length === 0) return;
    setImporting(true);
    setImportResult(null);

    try {
      const res = await fetch('/api/inventory/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierName: ocrResult.supplierName,
          invoiceNumber: ocrResult.invoiceNumber,
          totalAmount: ocrResult.totalAmount,
          lines: ocrResult.lines,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import xətası');

      setImportResult(data);
      if (data.imported > 0) {
        toast.success(`${data.imported} ingredient uğurla import edildi`);
      }
      if (data.skipped > 0) {
        toast.error(`${data.skipped} ingredient skip edildi`);
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
                onClick={handleImport}
                disabled={importing || ocrResult.lines.length === 0}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-xs font-bold tracking-wider uppercase hover:brightness-110 transition-all disabled:opacity-40 shadow-lg shadow-emerald-500/20"
              >
                {importing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                Stoka əlavə et
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
  );
}
