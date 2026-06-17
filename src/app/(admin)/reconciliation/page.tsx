'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, FileText, CheckCircle, AlertTriangle, RefreshCw, DollarSign, ArrowUpDown } from 'lucide-react';
import { PageTransition } from '@/components/PageTransition';
import { GlassCard } from '@/components/GlassCard';
import type { Invoice, InvoiceItem, PriceAnomaly } from '@/types/inventory';

type Tab = 'invoices' | 'anomalies';

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Gözləyir', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  matched: { label: 'Uyğun', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  partial: { label: 'Qismən', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
  discrepancy: { label: 'Uyğunsuzluq', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  reconciled: { label: 'Təsdiqləndi', color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20' },
};

export default function ReconciliationPage() {
  const [tab, setTab] = useState<Tab>('invoices');
  const [invoices, setInvoices] = useState<(Invoice & { invoice_items?: InvoiceItem[] })[]>([]);
  const [anomalies, setAnomalies] = useState<PriceAnomaly[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState<string | null>(null);
  const [reconciliationResult, setReconciliationResult] = useState<any>(null);
  const [reconModal, setReconModal] = useState(false);

  useEffect(() => {
    fetchInvoices();
    fetchAnomalies();
  }, []);

  const fetchInvoices = async () => {
    try {
      const res = await fetch('/api/invoices');
      const data = await res.json();
      setInvoices(data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const fetchAnomalies = async () => {
    try {
      const res = await fetch('/api/invoices');
      const allInvoices: any[] = await res.json();
      const supplierIds = [...new Set(allInvoices.map(i => i.supplier_id))];
      const allAnomalies: PriceAnomaly[] = [];
      for (const sid of supplierIds) {
        const aRes = await fetch(`/api/suppliers/${sid}/price-anomalies`);
        const aData = await aRes.json();
        if (aData.anomalies) allAnomalies.push(...aData.anomalies);
      }
      setAnomalies(allAnomalies);
    } catch { /* ignore */ }
  };

  const handleReconcile = async (invoiceId: string) => {
    setReconciling(invoiceId);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/reconcile`, { method: 'POST' });
      const data = await res.json();
      setReconciliationResult(data);
      setReconModal(true);
      fetchInvoices();
    } catch { /* ignore */ }
    setReconciling(null);
  };

  const filteredInvoices = invoices.filter(inv =>
    inv.invoice_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatMoney = (n: number) => `${n.toFixed(2)} ₼`;

  return (
    <PageTransition>
      <div className="p-6 max-w-7xl mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Faktura Uyğunlaşdırma</h1>
            <p className="text-sm text-white/40 mt-1">Invoice Reconciliation & Price Intelligence</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setTab('invoices'); }}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${tab === 'invoices' ? 'text-black' : 'text-white/50 hover:text-white'}`}
              style={{ background: tab === 'invoices' ? '#D4AF37' : 'rgba(255,255,255,0.05)' }}
            >
              <FileText size={14} className="inline mr-1.5" />
              Fakturalar
            </button>
            <button
              onClick={() => { setTab('anomalies'); }}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${tab === 'anomalies' ? 'text-black' : 'text-white/50 hover:text-white'}`}
              style={{ background: tab === 'anomalies' ? '#D4AF37' : 'rgba(255,255,255,0.05)' }}
            >
              <AlertTriangle size={14} className="inline mr-1.5" />
              Anomaliyalar
            </button>
          </div>
        </div>

        {tab === 'invoices' && (
          <>
            <div className="relative max-w-md">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/20 outline-none focus:border-[#D4AF37]/30 transition-colors"
                placeholder="Faktura nömrəsi..."
              />
            </div>

            <div className="space-y-3">
              {loading ? (
                <div className="text-center py-12 text-white/30">Yüklənir...</div>
              ) : filteredInvoices.length === 0 ? (
                <div className="text-center py-12 text-white/20">Faktura tapılmadı</div>
              ) : (
                filteredInvoices.map((inv, i) => {
                  const cfg = statusConfig[inv.status] || statusConfig.pending;
                  return (
                    <motion.div
                      key={inv.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="rounded-2xl border p-5 cursor-pointer transition-all hover:bg-white/[0.018]"
                      style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.06))' }}
                      onClick={() => setSelectedInvoice(selectedInvoice === inv.id ? null : inv.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${inv.status === 'discrepancy' ? 'bg-red-500/15' : 'bg-white/[0.04]'}`}>
                            {inv.status === 'discrepancy' ? <AlertTriangle size={18} className="text-red-400" /> :
                             inv.status === 'reconciled' ? <CheckCircle size={18} className="text-sky-400" /> :
                             <FileText size={18} className="text-white/30" />}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">{inv.invoice_number}</p>
                            <p className="text-xs text-white/30 mt-0.5">
                              {inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString('az') : '—'} 
                              {inv.purchase_order_id ? ' • Sifarişə bağlı' : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-white/80">{formatMoney(inv.total_amount)}</span>
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${cfg.bg} ${cfg.color}`}>
                            {cfg.label}
                          </span>
                        </div>
                      </div>

                      {selectedInvoice === inv.id && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mt-4 pt-4 space-y-3"
                          style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
                        >
                          {inv.invoice_items?.length ? (
                            <div className="space-y-1.5">
                              {inv.invoice_items.map((item: InvoiceItem) => (
                                <div key={item.id} className="flex items-center justify-between text-xs py-1.5 px-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                                  <div className="flex items-center gap-2">
                                    <span className="text-white/70">{item.product_name}</span>
                                    {item.matched && <CheckCircle size={10} className="text-emerald-400" />}
                                    {!item.matched && item.purchase_order_item_id && (
                                      <ArrowUpDown size={10} className="text-red-400" />
                                    )}
                                  </div>
                                  <span className="text-white/40">
                                    {item.quantity} {item.unit} × {item.unit_cost.toFixed(2)} = {item.total_cost.toFixed(2)} ₼
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-white/20">Maddə yoxdur</p>
                          )}

                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={e => { e.stopPropagation(); handleReconcile(inv.id); }}
                              disabled={reconciling === inv.id || !inv.purchase_order_id}
                              className="px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-30"
                              style={{ background: '#D4AF37', color: '#000' }}
                            >
                              {reconciling === inv.id ? (
                                <>Uyğunlaşdırılır...</>
                              ) : (
                                <><RefreshCw size={12} /> Uyğunlaşdır</>
                              )}
                            </button>
                            {!inv.purchase_order_id && (
                              <span className="text-[10px] text-white/20 self-center">Sifarişə bağlı deyil</span>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </motion.div>
                  );
                })
              )}
            </div>
          </>
        )}

        {tab === 'anomalies' && (
          <>
            {anomalies.length === 0 ? (
              <div className="text-center py-16 text-white/20">
                <CheckCircle size={40} className="mx-auto mb-3 text-emerald-400/50" />
                <p className="text-sm">Heç bir qiymət anomaliyası tapılmadı</p>
              </div>
            ) : (
              <div className="space-y-3">
                {anomalies.map((a, i) => (
                  <motion.div
                    key={`${a.product_name}-${i}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="rounded-2xl border p-5"
                    style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.06))' }}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-white">{a.product_name}</h3>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            a.severity === 'high' ? 'bg-red-500/15 text-red-400 border border-red-500/20' :
                            a.severity === 'medium' ? 'bg-orange-500/15 text-orange-400 border border-orange-500/20' :
                            'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20'
                          }`}>
                            {a.severity === 'high' ? 'Yüksək' : a.severity === 'medium' ? 'Orta' : 'Aşağı'}
                          </span>
                        </div>
                        <p className="text-xs text-white/30 mt-1">
                          {a.occurrences} dəfə • Son: {new Date(a.last_occurrence).toLocaleDateString('az')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-white">{a.variance_pct > 0 ? '+' : ''}{a.variance_pct.toFixed(1)}%</p>
                        <p className="text-xs text-white/30">dəyişmə</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-4 text-xs">
                      <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <p className="text-white/30 mb-1">Cari</p>
                        <p className="text-white font-semibold">{a.current_unit_cost.toFixed(4)} ₼</p>
                      </div>
                      <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <p className="text-white/30 mb-1">Orta</p>
                        <p className="text-white/70">{a.avg_unit_cost.toFixed(4)} ₼</p>
                      </div>
                      <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <p className="text-white/30 mb-1">Aralıq</p>
                        <p className="text-white/70">{a.min_unit_cost.toFixed(2)} – {a.max_unit_cost.toFixed(2)} ₼</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <AnimatePresence>
        {reconModal && reconciliationResult && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={() => setReconModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            >
              <div
                className="w-full max-w-lg rounded-2xl border pointer-events-auto p-6 max-h-[80vh] overflow-y-auto"
                style={{
                  background: 'var(--theme-panel, #111)',
                  borderColor: 'var(--theme-border, rgba(255,255,255,0.08))',
                  boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white">Uyğunlaşdırma Nəticəsi</h3>
                  <button onClick={() => setReconModal(false)} className="p-1 rounded-lg text-white/30 hover:text-white">
                    <X size={18} />
                  </button>
                </div>

                {reconciliationResult.summary && (
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="p-3 rounded-xl text-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <p className="text-xs text-white/30">Varyans</p>
                      <p className={`text-lg font-bold ${reconciliationResult.summary.total_variance !== 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {reconciliationResult.summary.total_variance > 0 ? '+' : ''}{reconciliationResult.summary.total_variance.toFixed(2)} ₼
                      </p>
                    </div>
                    <div className="p-3 rounded-xl text-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <p className="text-xs text-white/30">Uyğunsuzluq</p>
                      <p className="text-lg font-bold text-white">{reconciliationResult.summary.item_discrepancies}</p>
                    </div>
                    <div className="p-3 rounded-xl text-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <p className="text-xs text-white/30">Anomaliya</p>
                      <p className="text-lg font-bold text-white">{reconciliationResult.summary.price_anomalies?.length || 0}</p>
                    </div>
                  </div>
                )}

                {reconciliationResult.summary?.price_anomalies?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-white/40 tracking-wider uppercase">Qiymət Anomaliyaları</p>
                    {reconciliationResult.summary.price_anomalies.map((a: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-xl text-xs" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <div>
                          <p className="text-white font-medium">{a.product_name}</p>
                          <p className="text-white/30 mt-0.5">{a.invoice_unit_cost.toFixed(4)} ₼ / {a.expected_unit_cost.toFixed(4)} ₼ (gözlənilən)</p>
                        </div>
                        <span className={`font-bold ${a.variance_pct > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                          {a.variance_pct > 0 ? '+' : ''}{a.variance_pct}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {reconciliationResult.summary?.margin_impact?.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-bold text-white/40 tracking-wider uppercase">Marja Təsiri</p>
                    {reconciliationResult.summary.margin_impact.map((m: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-xl text-xs" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <span className="text-white/70">{m.product_name}</span>
                        <span className="text-red-400 font-bold">-{Math.abs(m.estimated_margin_impact_pct)}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
