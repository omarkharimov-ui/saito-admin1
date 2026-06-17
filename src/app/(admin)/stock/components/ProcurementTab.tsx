'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Upload, FileText, CheckCircle, AlertTriangle, X, RefreshCw,
  Package, Image, Scale, PackageCheck, DollarSign, TrendingDown,
  Truck, Plus, Pencil, Trash2,
} from 'lucide-react';
import { TableActionBar } from '@/components/TableActionBar';
import { EmptyState, LoadingState } from '@/components/ProcurementEmptyState';
import { SummaryCards } from '@/components/ProcurementSummaryCards';
import { StockStatusBadge } from '@/components/StockStatusBadge';
import { toast } from '@/lib/toast';
import type { DiscrepancyAlert, Supplier, CreateSupplierPayload } from '@/types/inventory';

type ProcTab = 'receive' | 'anomalies' | 'suppliers';
type Step = 'upload' | 'review' | 'confirm';

interface LineItem {
  id: string; product_name: string; quantity: number; unit: string;
  unit_cost: number; total_cost: number;
  matched_ingredient?: { id: string; name: string; confidence: number };
  status: 'matched' | 'extra';
}

const severityConfig: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: 'Kritik', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  high: { label: 'Yüksək', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
  medium: { label: 'Orta', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  low: { label: 'Aşağı', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
};

const alertTypeIcons: Record<string, any> = {
  invoice_amount: DollarSign, received_qty: Package,
  stock_vs_sales: TrendingDown, recipe_vs_actual: TrendingDown,
  supplier_price: DollarSign, waste_vs_norm: AlertTriangle, margin_drop: TrendingDown,
};
const alertTypeLabels: Record<string, string> = {
  invoice_amount: 'Faktura Məbləği', received_qty: 'Qəbul Miqdarı',
  stock_vs_sales: 'Stok vs Satış', recipe_vs_actual: 'Resept vs Faktiki',
  supplier_price: 'Tədarükçü Qiyməti', waste_vs_norm: 'Tullantı Norması',
  margin_drop: 'Marja Düşməsi',
};

export default function ProcurementTab() {
  const [tab, setTab] = useState<ProcTab>('receive');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {(['receive', 'anomalies', 'suppliers'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="relative px-4 py-2 rounded-lg text-xs font-bold tracking-wide transition-colors"
            style={{ color: tab === t ? '#ffffff' : 'rgba(255,255,255,0.3)' }}>
            {tab === t && (
              <motion.div
                layoutId="proc-tab-indicator"
                transition={{ type: 'spring', stiffness: 500, damping: 35, mass: 0.8 }}
                className="absolute inset-0 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            )}
            <span className="relative z-10">{t === 'receive' ? 'Faktura' : t === 'anomalies' ? 'Anomaliyalar' : 'Tədarükçülər'}</span>
          </button>
        ))}
      </div>

      {tab === 'receive' && <InvoiceUploadSection />}
      {tab === 'anomalies' && <AnomaliesSection />}
      {tab === 'suppliers' && <SuppliersSection />}
    </div>
  );
}

function InvoiceUploadSection() {
  const [pos, setPos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>('upload');
  const [invoiceImage, setInvoiceImage] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [matching, setMatching] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchPos(); fetchReviews(); }, []);

  const fetchPos = async () => {
    try { const r = await fetch('/api/purchase-orders?status=sent,partial'); setPos((await r.json()).filter((p: any) => p.status === 'sent' || p.status === 'partial')); } catch {}
    setLoading(false);
  };
  const fetchReviews = async () => {
    try { setReviews(await (await fetch('/api/procurement/reviews')).json()); } catch {}
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      setInvoiceImage(base64); setOcrLoading(true);
      try {
        const res = await fetch('/api/invoice-ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageUrl: base64, language: 'az' }) });
        if (res.ok) {
          const data = await res.json();
          const lines: LineItem[] = (data.lines || []).map((l: any) => ({
            id: `inv-${Math.random().toString(36).slice(2)}`,
            product_name: l.name || 'Unknown', quantity: l.quantity || 0, unit: l.unit || 'gram',
            unit_cost: l.unit_cost || 0, total_cost: l.total_cost || 0,
            status: 'matched',
          }));
          setLineItems(lines); setStep('review');
        }
      } catch {}
      setOcrLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const matchAll = async () => {
    setMatching(true);
    const updated = await Promise.all(lineItems.map(async (item) => {
      const r = await fetch('/api/procurement/match-ingredient', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productName: item.product_name }) });
      const d = await r.json();
      if (d.match && d.match.confidence > 0.5) return { ...item, matched_ingredient: { id: d.match.id, name: d.match.name, confidence: d.match.confidence } };
      return item;
    }));
    setLineItems(updated);
    setMatching(false);
  };

  const confirm = async () => {
    setConfirming(true);
    try {
      const manualItems = lineItems.filter(l => l.matched_ingredient).map(l => ({
        product_name: l.product_name, quantity: l.quantity, unit: l.unit,
        unit_cost: l.unit_cost, total_cost: l.total_cost, ingredient_id: l.matched_ingredient!.id,
      }));
      const r = await fetch('/api/procurement/receive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purchaseOrderId: null, invoiceImage, manualItems }) });
      setResult(await r.json()); setStep('confirm'); fetchPos(); fetchReviews();
    } catch {}
    setConfirming(false);
  };

  const approveReview = async (id: string, ingId?: string) => {
    await fetch('/api/procurement/reviews', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [id], status: 'approved', suggested_ingredient_id: ingId }) });
    fetchReviews();
  };
  const rejectReview = async (id: string) => {
    await fetch('/api/procurement/reviews', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [id], status: 'rejected' }) });
    fetchReviews();
  };

  const pendingReviewItems = reviews.filter((r: any) => r.status === 'pending');
  const matchedCount = lineItems.filter(l => l.matched_ingredient).length;

  if (loading) return <LoadingState />;

  if (step === 'upload') {
    return (
      <div className="space-y-4">
        <div onClick={() => fileRef.current?.click()} className="rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer hover:bg-white/[0.01] transition-all" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
          {ocrLoading ? (
            <div className="space-y-3">
              <RefreshCw size={32} className="mx-auto text-[#D4AF37] animate-spin" />
              <p className="text-sm text-white/50">Faktura oxunur...</p>
            </div>
          ) : (
            <div className="space-y-3">
              <Image size={32} className="mx-auto text-white/20" />
              <p className="text-sm text-white/50">Faktura şəklini yükləyin</p>
              <p className="text-xs text-white/20">AI OCR avtomatik məhsul adlarını, miqdarları və qiymətləri çıxaracaq</p>
            </div>
          )}
          {invoiceImage && <img src={invoiceImage} alt="Invoice" className="mt-4 max-h-48 mx-auto rounded-xl object-contain" />}
        </div>

        {pos.length > 0 && (
          <>
            <div className="border-t pt-4" style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.06))' }}>
              <p className="text-xs text-white/30 mb-3">Bu faktura hansı sifarişə aiddir? (köməkçi)</p>
              <div className="grid gap-2 md:grid-cols-2">
                {pos.map((po, i) => (
                  <div key={po.id}
                    className="rounded-2xl border p-4 cursor-pointer hover:bg-white/[0.018] transition-all"
                    style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.06))' }}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="text-sm font-semibold text-white">{po.order_number}</h3>
                        <p className="text-xs text-white/40 mt-0.5">{po.supplier?.name || '—'}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${po.status === 'sent' ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20' : 'bg-orange-500/15 text-orange-400 border border-orange-500/20'}`}>
                        {po.status === 'sent' ? 'Göndərilib' : 'Qismən'}
                      </span>
                    </div>
                    <div className="text-xs text-white/30">{po.total_amount?.toFixed(2)} ₼ • {new Date(po.ordered_at).toLocaleDateString('az')}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {pendingReviewItems.length > 0 && (
          <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.06))' }}>
            <p className="text-sm font-semibold text-white mb-3">{pendingReviewItems.length} review gözləyir</p>
            <div className="space-y-2">
              {pendingReviewItems.slice(0, 5).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <span className="text-xs text-white/80">{r.product_name}</span>
                  <div className="flex gap-2">
                    <button onClick={() => approveReview(r.id, r.suggested_ingredient_id)} className="text-[10px] text-emerald-400 font-bold">Təsdiq</button>
                    <button onClick={() => rejectReview(r.id)} className="text-[10px] text-red-400 font-bold">Rədd</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-xs text-white/30 mb-2">
        <span className="text-[#D4AF37] font-bold">1. Faktura Yüklə</span>
        <span>→</span>
        <span className={step === 'review' ? 'text-[#D4AF37] font-bold' : ''}>2. Xətləri Yoxla</span>
        <span>→</span>
        <span className={step === 'confirm' ? 'text-[#D4AF37] font-bold' : ''}>3. Təsdiq Et</span>
      </div>

      <button onClick={() => { setStep('upload'); setLineItems([]); setResult(null); }} className="text-xs text-white/30 hover:text-white transition-colors">← Geri</button>

      {step === 'review' && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-xs text-white/40">{lineItems.length} xətt tapıldı</p>
            <span className="text-xs text-white/20">|</span>
            <p className="text-xs text-emerald-400">{matchedCount} match</p>
            <button onClick={matchAll} disabled={matching}
              className="ml-auto px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all disabled:opacity-40 flex items-center gap-1"
              style={{ background: '#D4AF37', color: '#000' }}>
              {matching ? 'Match edilir...' : 'AI Match Et'}
            </button>
          </div>
          <div className="space-y-2">
            {lineItems.map((item) => (
              <div key={item.id} className="rounded-xl border p-4" style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.06))' }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${item.status === 'extra' ? 'bg-orange-400' : 'bg-emerald-400'}`} />
                    <span className="text-sm font-medium text-white">{item.product_name}</span>
                  </div>
                  {item.matched_ingredient && (
                    <span className="text-[10px] text-emerald-400">{item.matched_ingredient.name} ({(item.matched_ingredient.confidence * 100).toFixed(0)}%)</span>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <p className="text-white/30 mb-0.5">Faktura</p>
                    <span className="text-white font-semibold">{item.quantity} {item.unit}</span>
                    <span className="ml-1 text-white/40">× {item.unit_cost.toFixed(2)} ₼</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={confirm} disabled={confirming}
            className="w-full py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ background: '#D4AF37', color: '#000' }}>
            {confirming ? 'Stok yenilənir...' : <><CheckCircle size={16} /> Təsdiq Et və Stoku Artır</>}
          </button>
        </>
      )}

      {step === 'confirm' && result && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border p-8 text-center space-y-4" style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.06))' }}>
          <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
            <CheckCircle size={32} className="text-emerald-400" />
          </div>
          <h2 className="text-lg font-bold text-white">Stok yeniləndi</h2>
          <p className="text-sm text-white/50">{result.auto_matched}/{result.total_items} maddə uğurla match edildi</p>
          <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto text-xs">
            <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-emerald-400 font-bold text-lg">{result.auto_matched}</p>
              <p className="text-white/30">Match</p>
            </div>
            <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-yellow-400 font-bold text-lg">{result.review_items}</p>
              <p className="text-white/30">Review</p>
            </div>
            <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-white font-bold text-lg capitalize">{result.po_status}</p>
              <p className="text-white/30">Status</p>
            </div>
          </div>
          <button onClick={() => { setStep('upload'); setLineItems([]); setResult(null); setInvoiceImage(null); }}
            className="px-6 py-2.5 rounded-xl text-sm font-bold transition-all" style={{ background: '#D4AF37', color: '#000' }}>
            Yeni Qəbul
          </button>
        </motion.div>
      )}
    </div>
  );
}

function AnomaliesSection() {
  const [alerts, setAlerts] = useState<DiscrepancyAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => { fetchAlerts(); }, []);

  const fetchAlerts = async () => {
    try { const r = await fetch('/api/discrepancies'); setAlerts(Array.isArray(await r.json()) ? await r.json() : []); } catch {}
    setLoading(false);
  };

  const runCheck = async () => {
    setRunning(true);
    try { await fetch('/api/discrepancies', { method: 'POST' }); await fetchAlerts(); } catch {}
    setRunning(false);
  };

  const handleStatus = async (id: string, status: string) => {
    try { await fetch('/api/discrepancies', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) }); fetchAlerts(); } catch {}
  };

  const filtered = alerts.filter(a => {
    const ms = a.title.toLowerCase().includes(search.toLowerCase());
    const sf = !severityFilter || a.severity === severityFilter;
    return ms && sf;
  });

  const openAlerts = alerts.filter(a => a.status === 'open').length;
  const criticalAlerts = alerts.filter(a => a.severity === 'critical' && a.status === 'open').length;

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SummaryCards items={[
          { key: 'open', icon: <AlertTriangle size={16} className="text-white/60" />, label: 'Açıq Alert', value: openAlerts },
          { key: 'critical', icon: <AlertTriangle size={16} className="text-red-400" />, label: 'Kritik', value: criticalAlerts, accent: criticalAlerts > 0 ? 'text-red-400/70' : 'text-emerald-400' },
          { key: 'ack', icon: <CheckCircle size={16} className="text-white/60" />, label: 'Təsdiqlənmiş', value: alerts.filter(a => a.status === 'acknowledged').length },
          { key: 'resolved', icon: <CheckCircle size={16} className="text-white/60" />, label: 'Həll Edilmiş', value: alerts.filter(a => a.status === 'resolved').length },
        ]} />
        <button onClick={runCheck} disabled={running}
          className="px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-40 flex items-center gap-2"
          style={{ background: '#D4AF37', color: '#000' }}>
          <RefreshCw size={14} className={running ? 'animate-spin' : ''} />
          {running ? 'Yoxlanılır...' : 'Yoxla'}
        </button>
      </div>

      <TableActionBar search={search} onSearchChange={setSearch} searchPlaceholder="Alert axtar..."
        filter={severityFilter}
        filters={[{ key: 'critical', label: 'Kritik' }, { key: 'high', label: 'Yüksək' }, { key: 'medium', label: 'Orta' }, { key: 'low', label: 'Aşağı' }]}
        onFilterChange={setSeverityFilter} />

      {filtered.length === 0 ? (
        <EmptyState icon={<CheckCircle size={40} className="text-emerald-400/50" />} title="Heç bir uyğunsuzluq tapılmadı" />
      ) : (
        <div className="space-y-3">
          {filtered.map((a, i) => {
            const cfg = severityConfig[a.severity] || severityConfig.medium;
            const Icon = alertTypeIcons[a.type] || AlertTriangle;
            return (
              <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                className="rounded-2xl border p-5" style={{
                  borderColor: a.status === 'open' ? 'var(--theme-border, rgba(255,255,255,0.06))' : 'rgba(255,255,255,0.03)',
                  opacity: a.status === 'resolved' ? 0.5 : 1,
                }}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${a.severity === 'critical' ? 'bg-red-500/15' : a.severity === 'high' ? 'bg-orange-500/15' : 'bg-white/[0.04]'}`}>
                      <Icon size={18} className={cfg.color} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-white">{a.title}</h3>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                      </div>
                      <p className="text-xs text-white/40 mt-0.5">{alertTypeLabels[a.type] || a.type}{a.source_table && ` • ${a.source_table}`}</p>
                    </div>
                  </div>
                  <p className={`text-lg font-bold ${a.variance_pct > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{a.variance_pct > 0 ? '+' : ''}{a.variance_pct}%</p>
                </div>
                {a.description && <p className="text-xs text-white/50 mb-3">{a.description}</p>}
                <div className="grid grid-cols-3 gap-3 text-xs mb-3">
                  <div className="p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <p className="text-white/30">Faktiki</p>
                    <p className="text-white font-semibold">{a.value?.toFixed(2)}</p>
                  </div>
                  <div className="p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <p className="text-white/30">Gözlənilən</p>
                    <p className="text-white font-semibold">{a.expected_value?.toFixed(2)}</p>
                  </div>
                  <div className="p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <p className="text-white/30">Fərq</p>
                    <p className={`font-semibold ${a.variance_pct > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{a.variance_pct > 0 ? '+' : ''}{a.variance_pct}%</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {a.status === 'open' && (
                    <>
                      <button onClick={() => handleStatus(a.id, 'acknowledged')} className="px-3 py-1.5 rounded-lg text-[11px] font-bold" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)' }}><CheckCircle size={11} className="inline mr-1" /> Təsdiq Et</button>
                      <button onClick={() => handleStatus(a.id, 'resolved')} className="px-3 py-1.5 rounded-lg text-[11px] font-bold" style={{ background: 'rgba(16,185,129,0.15)', color: '#34D399' }}><CheckCircle size={11} className="inline mr-1" /> Həll Et</button>
                    </>
                  )}
                  {a.status === 'acknowledged' && (
                    <button onClick={() => handleStatus(a.id, 'resolved')} className="px-3 py-1.5 rounded-lg text-[11px] font-bold" style={{ background: 'rgba(16,185,129,0.15)', color: '#34D399' }}><CheckCircle size={11} className="inline mr-1" /> Həll Et</button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SuppliersSection() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [detailSupplier, setDetailSupplier] = useState<Supplier | null>(null);

  const [form, setForm] = useState<CreateSupplierPayload>({ name: '', contact_person: '', phone: '', email: '', address: '', tax_id: '', notes: '' });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/suppliers');
    if (res.ok) setSuppliers(await res.json());
    setLoading(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', contact_person: '', phone: '', email: '', address: '', tax_id: '', notes: '' });
    setShowModal(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({ name: s.name, contact_person: s.contact_person || '', phone: s.phone || '', email: s.email || '', address: s.address || '', tax_id: s.tax_id || '', notes: s.notes || '' });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast('Ad tələb olunur');
    const url = editing ? `/api/suppliers/${editing.id}` : '/api/suppliers';
    const method = editing ? 'PATCH' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    if (!res.ok) return toast('Xəta baş verdi');
    toast(editing ? 'Yeniləndi' : 'Əlavə edildi');
    setShowModal(false);
    load();
  };

  const remove = async () => {
    if (!confirmDelete) return;
    const res = await fetch(`/api/suppliers/${confirmDelete}`, { method: 'DELETE' });
    if (!res.ok) return toast('Silinmədi');
    toast('Silindi');
    setConfirmDelete(null);
    load();
  };

  const filtered = suppliers.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 max-w-sm">
          <TableActionBar search={search} onSearchChange={setSearch} searchPlaceholder="Tədarükçü axtar..." />
        </div>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 text-white/80 hover:text-white transition-all border border-white/10">
          <Plus size={14} /> Yeni
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Truck size={32} className="text-white/30" />} title="Tədarükçü tapılmadı" description="Hələ heç bir tədarükçü əlavə edilməyib" />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {filtered.map(s => (
            <motion.div key={s.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              onClick={() => setDetailSupplier(s)}
              className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white/90 truncate">{s.name}</div>
                  <div className="mt-1 text-[11px] text-white/30 space-y-0.5">
                    {s.contact_person && <div> 👤 {s.contact_person}</div>}
                    {s.phone && <div> 📞 {s.phone}</div>}
                    {s.email && <div> ✉️ {s.email}</div>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-white/70 transition-colors"><Pencil size={13} /></button>
                  <button onClick={() => setConfirmDelete(s.id)} className="p-1.5 rounded-lg hover:bg-white/10 text-red-400/50 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {s.score !== null && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${s.score >= 80 ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : s.score >= 50 ? 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10' : 'text-red-400 border-red-500/30 bg-red-500/10'}`}>
                    {s.score}/100
                  </span>
                )}
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${s.status === 'active' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-white/30 border-white/[0.07] bg-white/[0.03]'}`}>
                  {s.status === 'active' ? 'Aktiv' : 'Deaktiv'}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full text-white/30 border border-white/[0.07]">
                  {s.total_orders} sifariş
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg mx-4 rounded-2xl border border-white/[0.08] bg-[#0C0C0E] p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-white/90 mb-4">{editing ? 'Redaktə Et' : 'Yeni Tədarükçü'}</h3>
            <div className="space-y-3">
              {(['name', 'contact_person', 'phone', 'email', 'address', 'tax_id', 'notes'] as const).map(f => (
                <div key={f}>
                  <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1 block">
                    {f === 'name' ? 'Ad' : f === 'contact_person' ? 'Əlaqə Şəxs' : f === 'phone' ? 'Telefon' : f === 'email' ? 'Email' : f === 'address' ? 'Ünvan' : f === 'tax_id' ? 'VÖEN' : 'Qeyd'}
                  </label>
                  <input type={f === 'email' ? 'email' : 'text'} value={form[f] || ''} onChange={e => setForm(p => ({ ...p, [f]: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-white/50 hover:text-white/70 transition-colors">Ləğv Et</button>
              <button onClick={save} className="px-5 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 text-white/80 hover:text-white transition-all border border-white/10">{editing ? 'Yadda Saxla' : 'Əlavə Et'}</button>
            </div>
          </motion.div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setConfirmDelete(null)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm mx-4 rounded-2xl border border-white/[0.08] bg-[#0C0C0E] p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-white/90 mb-2">Tədarükçünü Sil</h3>
            <p className="text-sm text-white/50 mb-4">Bu tədarükçünü silmək istədiyinizə əminsiniz?</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 rounded-xl text-xs font-bold text-white/50 hover:text-white/70 transition-colors">İmtina</button>
              <button onClick={remove} className="px-5 py-2 rounded-xl text-xs font-bold bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30">Sil</button>
            </div>
          </motion.div>
        </div>
      )}

      {detailSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setDetailSupplier(null)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg mx-4 rounded-2xl border border-white/[0.08] bg-[#0C0C0E] p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="text-base font-semibold text-white/90">{detailSupplier.name}</h3>
                <p className="text-xs text-white/30 mt-0.5">{detailSupplier.email || detailSupplier.phone || '—'}</p>
              </div>
              <button onClick={() => setDetailSupplier(null)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-white/70 transition-colors"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">Ümumi Bal</p>
                <p className={`text-lg font-bold mt-1 ${detailSupplier.score !== null && detailSupplier.score >= 80 ? 'text-emerald-400' : detailSupplier.score !== null && detailSupplier.score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {detailSupplier.score !== null ? `${detailSupplier.score}/100` : 'Hesablanmayıb'}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">Vaxtında Təhvil</p>
                <p className="text-lg font-bold mt-1 text-white">{detailSupplier.on_time_delivery_rate !== null ? `${detailSupplier.on_time_delivery_rate}%` : '—'}</p>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">Qiymət Stabililiyi</p>
                <p className="text-lg font-bold mt-1 text-white">{detailSupplier.avg_price_stability !== null ? `${detailSupplier.avg_price_stability}%` : '—'}</p>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">Sifariş Sayı</p>
                <p className="text-lg font-bold mt-1 text-white">{detailSupplier.total_orders}</p>
              </div>
            </div>
            <div className="space-y-1.5 text-xs text-white/40">
              {detailSupplier.contact_person && <div>👤 {detailSupplier.contact_person}</div>}
              {detailSupplier.phone && <div>📞 {detailSupplier.phone}</div>}
              {detailSupplier.email && <div>✉️ {detailSupplier.email}</div>}
              {detailSupplier.address && <div>📍 {detailSupplier.address}</div>}
              {detailSupplier.tax_id && <div>🏛️ VÖEN: {detailSupplier.tax_id}</div>}
              {detailSupplier.notes && <div className="mt-2 p-2 rounded-lg bg-white/[0.03] text-white/50">{detailSupplier.notes}</div>}
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={() => { setDetailSupplier(null); openEdit(detailSupplier); }} className="px-4 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 text-white/80 hover:text-white transition-all border border-white/10">Redaktə Et</button>
              <button onClick={() => setDetailSupplier(null)} className="px-4 py-2 rounded-xl text-xs font-bold text-white/50 hover:text-white/70 transition-colors">Bağla</button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
