'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import OrderGuideSection from './OrderGuideSection';
import {
  Upload, FileText, CheckCircle, AlertTriangle, X, RefreshCw,
  Package, Image, Scale, PackageCheck, DollarSign, TrendingDown,
  Truck, Plus, Pencil, Trash2,
} from '@/components/ui/saito-icons';
import { TableActionBar } from '@/components/TableActionBar';
import { EmptyState, LoadingState } from '@/components/ProcurementEmptyState';
import { SummaryCards } from '@/components/ProcurementSummaryCards';
import { StockStatusBadge } from '@/components/StockStatusBadge';
import { toast } from '@/lib/toast';
import type { DiscrepancyAlert, Supplier, CreateSupplierPayload } from '@/types/inventory';

// 13c: + 'order-guide' (Toast par-based order guide parity).
type ProcTab = 'receive' | 'anomalies' | 'suppliers' | 'order-guide';
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
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);

  const loadNotifications = async () => {
    setLoadingNotifs(true);
    try {
      // 13a: the stock-threshold cron writes type='stock' (title "Ehtiyat
      // azalıb: X") — the old 'supplier_auto_order' filter matched nothing,
      // so this feed was always empty even once /api/notifications existed.
      const res = await fetch('/api/notifications?type=stock&limit=20');
      if (res.ok) setNotifications(await res.json());
    } catch {}
    setLoadingNotifs(false);
  };

  useEffect(() => { loadNotifications(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {(['receive', 'anomalies', 'suppliers', 'order-guide'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="relative px-4 py-2 rounded-lg text-xs font-bold tracking-wide transition-colors"
              style={{ color: tab === t ? '#ffffff' : 'rgba(255,255,255,0.3)' }}>
              {tab === t && (
                <motion.div
                  layoutId="proc-tab-indicator"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  className="absolute inset-0 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
              )}
              <span className="relative z-10">{t === 'receive' ? 'Faktura' : t === 'anomalies' ? 'Anomaliyalar' : t === 'suppliers' ? 'Tədarükçülər' : 'Order Guide'}</span>
            </button>
          ))}
        </div>
        <button onClick={loadNotifications} disabled={loadingNotifs} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[var(--theme-panel)] hover:bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-all border border-[var(--theme-border)]">
          <RefreshCw size={14} className={loadingNotifs ? 'animate-spin' : ''} /> Yenilə
        </button>
      </div>

      {notifications.length > 0 && tab === 'receive' && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--theme-text-muted)]">Avto-sifariş Bildirişləri</p>
          {notifications.map((n: any) => (
            <div key={n.id} className="flex items-start justify-between gap-4 p-4 rounded-2xl bg-emerald-500/[0.04] border border-emerald-500/20">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[var(--theme-text)]">{n.title}</p>
                <p className="text-[11px] text-[var(--theme-text-muted)] mt-1">{n.body}</p>
                {n.data?.items?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {n.data.items.map((item: any, idx: number) => (
                      <p key={idx} className="text-[11px] text-[var(--theme-text-muted)]">• {item.name}: {item.current_stock} {item.unit} (min: {item.min_stock_level || 0})</p>
                    ))}
                  </div>
                )}
              </div>
              {n.data?.whatsapp_url && (
                <a href={n.data.whatsapp_url} target="_blank" rel="noopener noreferrer" className="shrink-0 px-4 py-2 rounded-xl bg-emerald-500 text-[var(--theme-text)] text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all">
                  WhatsApp
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'receive' && <InvoiceUploadSection />}
      {tab === 'anomalies' && <AnomaliesSection />}
      {tab === 'suppliers' && <SuppliersSection />}
      {tab === 'order-guide' && <OrderGuideSection />}
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
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState<string | null>(null);
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
          // 13e: OCR also reads the supplier name (header/footer) — passed to
          // from-invoice so a bare invoice is attributed to the right supplier.
          setSupplierName(data.supplierName || null);
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
    // A pending PO exists → the invoice must be tied to one (stock + PO status).
    if (pos.length > 0 && !selectedPoId) {
      toast.error('Faktura üçün sifariş seçin');
      return;
    }
    setConfirming(true);
    try {
      const manualItems = lineItems.filter(l => l.matched_ingredient).map(l => ({
        product_name: l.product_name, quantity: l.quantity, unit: l.unit,
        unit_cost: l.unit_cost, total_cost: l.total_cost, ingredient_id: l.matched_ingredient!.id,
      }));
      const r = await fetch('/api/procurement/receive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purchaseOrderId: selectedPoId, invoiceImage, manualItems }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.success) {
        toast.error(data.error || 'Qəbul alınmadı');
        return;
      }
      setResult(data); setStep('confirm'); setSelectedPoId(null); fetchPos(); fetchReviews();
    } catch {
      toast.error('Əlaqə xətası');
    }
    setConfirming(false);
  };

  // 13e: bare-invoice → DRAFT PO (Toast invoice-automation flagship). Only
  // offered when there is NO open PO to tie the invoice to. Creates a DRAFT
  // the owner reviews/sends — does NOT stock, does NOT auto-send (human gate).
  const createDraftPo = async () => {
    if (lineItems.length === 0) return;
    setConfirming(true);
    try {
      const items = lineItems.map(l => ({ product_name: l.product_name, quantity: l.quantity, unit: l.unit, unit_cost: l.unit_cost }));
      const r = await fetch('/api/procurement/from-invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ supplier_name: supplierName, items, source: 'faktura OCR' }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(data.error || 'DRAFT PO yaradılmadı'); return; }
      toast.success('DRAFT PO yaradıldı — Tədarük siyahısında review et');
      setSelectedPoId(null); setSupplierName(null); setStep('upload'); setLineItems([]);
    } catch {
      toast.error('Əlaqə xətası');
    }
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
        <div onClick={() => fileRef.current?.click()} className="rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer hover:bg-[var(--theme-surface-soft)] transition-all" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
          {ocrLoading ? (
            <div className="space-y-3">
              <RefreshCw size={32} className="mx-auto text-[#D4AF37] animate-spin" />
              <p className="text-sm text-[var(--theme-text-muted)]">Faktura oxunur...</p>
            </div>
          ) : (
            <div className="space-y-3">
              <Image size={32} className="mx-auto text-[var(--theme-text-muted)]" />
              <p className="text-sm text-[var(--theme-text-muted)]">Faktura şəklini yükləyin</p>
              <p className="text-xs text-[var(--theme-text-muted)]">AI OCR avtomatik məhsul adlarını, miqdarları və qiymətləri çıxaracaq</p>
            </div>
          )}
          {invoiceImage && <img src={invoiceImage} alt="Invoice" className="mt-4 max-h-48 mx-auto rounded-xl object-contain" />}
        </div>

        {pos.length > 0 && (
          <>
            <div className="border-t pt-4" style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.06))' }}>
              <p className="text-xs text-[var(--theme-text-muted)] mb-3">Bu faktura hansı sifarişə aiddir? (köməkçi)</p>
              <div className="grid gap-2 md:grid-cols-2">
                {pos.map((po, i) => {
                  const selected = selectedPoId === po.id;
                  return (
                    <div key={po.id}
                      onClick={() => setSelectedPoId(selected ? null : po.id)}
                      className="rounded-2xl border p-4 cursor-pointer hover:bg-[var(--theme-surface-soft)] transition-all"
                      style={{
                        borderColor: selected ? 'rgba(212,175,55,0.5)' : 'var(--theme-border, rgba(255,255,255,0.06))',
                        background: selected ? 'rgba(212,175,55,0.06)' : undefined,
                      }}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="text-sm font-semibold text-[var(--theme-text)] flex items-center gap-2">
                            {po.order_number}
                            {selected && <CheckCircle size={14} className="text-[#D4AF37]" />}
                          </h3>
                          <p className="text-xs text-[var(--theme-text-muted)] mt-0.5">{po.supplier?.name || '—'}</p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${po.status === 'sent' ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20' : 'bg-orange-500/15 text-orange-400 border border-orange-500/20'}`}>
                          {po.status === 'sent' ? 'Göndərilib' : 'Qismən'}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--theme-text-muted)]">{po.total_amount?.toFixed(2)} ₼ • {new Date(po.ordered_at).toLocaleDateString('az')}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {pendingReviewItems.length > 0 && (
          <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.06))' }}>
            <p className="text-sm font-semibold text-[var(--theme-text)] mb-3">{pendingReviewItems.length} review gözləyir</p>
            <div className="space-y-2">
              {pendingReviewItems.slice(0, 5).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <span className="text-xs text-[var(--theme-text-secondary)]">{r.product_name}</span>
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
      <div className="flex items-center gap-3 text-xs text-[var(--theme-text-muted)] mb-2">
        <span className="text-[#D4AF37] font-bold">1. Faktura Yüklə</span>
        <span>→</span>
        <span className={step === 'review' ? 'text-[#D4AF37] font-bold' : ''}>2. Xətləri Yoxla</span>
        <span>→</span>
        <span className={step === 'confirm' ? 'text-[#D4AF37] font-bold' : ''}>3. Təsdiq Et</span>
      </div>

      <button onClick={() => { setStep('upload'); setLineItems([]); setResult(null); }} className="text-xs text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-colors">← Geri</button>

      {step === 'review' && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-xs text-[var(--theme-text-muted)]">{lineItems.length} xətt tapıldı</p>
            <span className="text-xs text-[var(--theme-text-muted)]">|</span>
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
                    <span className="text-sm font-medium text-[var(--theme-text)]">{item.product_name}</span>
                  </div>
                  {item.matched_ingredient && (
                    <span className="text-[10px] text-emerald-400">{item.matched_ingredient.name} ({(item.matched_ingredient.confidence * 100).toFixed(0)}%)</span>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <p className="text-[var(--theme-text-muted)] mb-0.5">Faktura</p>
                    <span className="text-[var(--theme-text)] font-semibold">{item.quantity} {item.unit}</span>
                    <span className="ml-1 text-[var(--theme-text-muted)]">× {item.unit_cost.toFixed(2)} ₼</span>
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
          {pos.length === 0 && (
            <button onClick={createDraftPo} disabled={confirming}
              className="w-full mt-2 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-2 border"
              style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.08))', color: 'rgba(255,255,255,0.6)' }}>
              <FileText size={14} /> DRAFT PO yarat (stok daxil etmir · auto-send YOX)
            </button>
          )}
        </>
      )}

      {step === 'confirm' && result && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border p-8 text-center space-y-4" style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.06))' }}>
          <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
            <CheckCircle size={32} className="text-emerald-400" />
          </div>
          <h2 className="text-lg font-bold text-[var(--theme-text)]">Stok yeniləndi</h2>
          <p className="text-sm text-[var(--theme-text-muted)]">{result.auto_matched}/{result.total_items} maddə uğurla match edildi</p>
          <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto text-xs">
            <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-emerald-400 font-bold text-lg">{result.auto_matched}</p>
              <p className="text-[var(--theme-text-muted)]">Match</p>
            </div>
            <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-yellow-400 font-bold text-lg">{result.review_items}</p>
              <p className="text-[var(--theme-text-muted)]">Review</p>
            </div>
            <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-[var(--theme-text)] font-bold text-lg capitalize">{result.po_status}</p>
              <p className="text-[var(--theme-text-muted)]">Status</p>
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
          { key: 'open', icon: <AlertTriangle size={16} className="text-[var(--theme-text-muted)]" />, label: 'Açıq Alert', value: openAlerts },
          { key: 'critical', icon: <AlertTriangle size={16} className="text-red-400" />, label: 'Kritik', value: criticalAlerts, accent: criticalAlerts > 0 ? 'text-red-400/70' : 'text-emerald-400' },
          { key: 'ack', icon: <CheckCircle size={16} className="text-[var(--theme-text-muted)]" />, label: 'Təsdiqlənmiş', value: alerts.filter(a => a.status === 'acknowledged').length },
          { key: 'resolved', icon: <CheckCircle size={16} className="text-[var(--theme-text-muted)]" />, label: 'Həll Edilmiş', value: alerts.filter(a => a.status === 'resolved').length },
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
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${a.severity === 'critical' ? 'bg-red-500/15' : a.severity === 'high' ? 'bg-orange-500/15' : 'bg-[var(--theme-panel)]'}`}>
                      <Icon size={18} className={cfg.color} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-[var(--theme-text)]">{a.title}</h3>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                      </div>
                      <p className="text-xs text-[var(--theme-text-muted)] mt-0.5">{alertTypeLabels[a.type] || a.type}{a.source_table && ` • ${a.source_table}`}</p>
                    </div>
                  </div>
                  <p className={`text-lg font-bold ${a.variance_pct > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{a.variance_pct > 0 ? '+' : ''}{a.variance_pct}%</p>
                </div>
                {a.description && <p className="text-xs text-[var(--theme-text-muted)] mb-3">{a.description}</p>}
                <div className="grid grid-cols-3 gap-3 text-xs mb-3">
                  <div className="p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <p className="text-[var(--theme-text-muted)]">Faktiki</p>
                    <p className="text-[var(--theme-text)] font-semibold">{a.value?.toFixed(2)}</p>
                  </div>
                  <div className="p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <p className="text-[var(--theme-text-muted)]">Gözlənilən</p>
                    <p className="text-[var(--theme-text)] font-semibold">{a.expected_value?.toFixed(2)}</p>
                  </div>
                  <div className="p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <p className="text-[var(--theme-text-muted)]">Fərq</p>
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

  const [form, setForm] = useState<CreateSupplierPayload>({ name: '', contact_person: '', phone: '', email: '', address: '', tax_id: '', notes: '', auto_order_template: '' });

  // 13c: supplier item catalog — Toast "centralized vendor product catalog"
  // parity. This price list pre-fills Order Guide suggested line prices and
  // anchors the invoice matcher.
  const [catalog, setCatalog] = useState<any[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [catForm, setCatForm] = useState({ name: '', unit: 'gram', unit_price: '' });
  const [catEditing, setCatEditing] = useState<string | null>(null);
  const [catEdit, setCatEdit] = useState({ name: '', unit: 'gram', unit_price: '' });

  const loadCatalog = async (supplierId: string) => {
    setCatLoading(true);
    try {
      const r = await fetch(`/api/suppliers/items?supplier_id=${supplierId}`);
      if (r.ok) setCatalog(await r.json());
    } catch {}
    setCatLoading(false);
  };

  const openDetail = (s: Supplier) => {
    setDetailSupplier(s);
    setCatEditing(null);
    setCatForm({ name: '', unit: 'gram', unit_price: '' });
    loadCatalog(s.id);
  };

  const saveCatalogItem = async (item?: any) => {
    if (!detailSupplier) return;
    const src = item ? catEdit : catForm;
    if (!src.name.trim()) return toast('Ad tələb olunur');
    const payload: any = { name: src.name.trim(), unit: src.unit || null, unit_price: src.unit_price === '' ? null : Number(src.unit_price) };
    if (!item) payload.supplier_id = detailSupplier.id;
    const url = item ? `/api/suppliers/items/${item.id}` : '/api/suppliers/items';
    const res = await fetch(url, { method: item ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); return toast(d.error || 'Xəta baş verdi'); }
    toast(item ? 'Yeniləndi' : 'Kataloğa əlavə edildi');
    setCatForm({ name: '', unit: 'gram', unit_price: '' });
    setCatEditing(null);
    loadCatalog(detailSupplier.id);
  };

  const removeCatalogItem = async (id: string) => {
    if (!detailSupplier) return;
    const res = await fetch(`/api/suppliers/items/${id}`, { method: 'DELETE' });
    if (!res.ok) return toast('Silinmədi');
    toast('Silindi');
    loadCatalog(detailSupplier.id);
  };

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/suppliers');
    if (res.ok) setSuppliers(await res.json());
    setLoading(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', contact_person: '', phone: '', whatsapp_number: '', email: '', address: '', tax_id: '', notes: '', auto_order_template: '' });
    setShowModal(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({ name: s.name, contact_person: s.contact_person || '', phone: s.phone || '', whatsapp_number: (s as any).whatsapp_number || '', email: s.email || '', address: s.address || '', tax_id: s.tax_id || '', notes: s.notes || '', auto_order_template: (s as any).auto_order_template || '' });
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
        <button onClick={openCreate} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[var(--theme-panel)] hover:bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-all border border-[var(--theme-border)]">
          <Plus size={14} /> Yeni
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Truck size={32} className="text-[var(--theme-text-muted)]" />} title="Tədarükçü tapılmadı" description="Hələ heç bir tədarükçü əlavə edilməyib" />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {filtered.map(s => (
            <motion.div key={s.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
               onClick={() => openDetail(s)}
              className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-panel)] p-4 hover:bg-[var(--theme-surface-soft)] transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[var(--theme-text)] truncate">{s.name}</div>
                  <div className="mt-1 text-[11px] text-[var(--theme-text-muted)] space-y-0.5">
                    {s.contact_person && <div> {s.contact_person}</div>}
                    {s.phone && <div> {s.phone}</div>}
                    {s.email && <div> {s.email}</div>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-[var(--theme-surface-soft)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-muted)] transition-colors"><Pencil size={13} /></button>
                  <button onClick={() => setConfirmDelete(s.id)} className="p-1.5 rounded-lg hover:bg-[var(--theme-surface-soft)] text-red-400/50 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {s.score !== null && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${s.score >= 80 ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : s.score >= 50 ? 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10' : 'text-red-400 border-red-500/30 bg-red-500/10'}`}>
                    {s.score}/100
                  </span>
                )}
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${s.status === 'active' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-[var(--theme-text-muted)] border-[var(--theme-border)] bg-[var(--theme-panel)]'}`}>
                  {s.status === 'active' ? 'Aktiv' : 'Deaktiv'}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full text-[var(--theme-text-muted)] border border-[var(--theme-border)]">
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
            className="w-full max-w-lg mx-4 rounded-2xl border border-[var(--theme-border)] bg-[#0C0C0E] p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-[var(--theme-text)] mb-4">{editing ? 'Redaktə Et' : 'Yeni Tədarükçü'}</h3>
            <div className="space-y-3">
              {(['name', 'contact_person', 'phone', 'whatsapp_number', 'email', 'address', 'tax_id', 'notes', 'auto_order_template'] as const).map(f => (
                <div key={f}>
                  <label className="text-[11px] text-[var(--theme-text-muted)] font-semibold uppercase tracking-wider mb-1 block">
                    {f === 'name' ? 'Ad' : f === 'contact_person' ? 'Əlaqə Şəxs' : f === 'phone' ? 'Telefon' : f === 'whatsapp_number' ? 'WhatsApp Nömrəsi' : f === 'email' ? 'Email' : f === 'address' ? 'Ünvan' : f === 'tax_id' ? 'VÖEN' : f === 'auto_order_template' ? 'Avto Sifariş Şablonu (AI)' : 'Qeyd'}
                  </label>
                  <textarea
                    value={form[f] || ''}
                    onChange={e => setForm(p => ({ ...p, [f]: e.target.value }))}
                    rows={f === 'auto_order_template' ? 3 : 1}
                    className={`w-full px-4 py-2.5 rounded-xl text-[var(--theme-text)] bg-[var(--theme-panel)] border border-[var(--theme-border)] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm ${f === 'auto_order_template' ? 'resize-none' : ''}`}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-[var(--theme-text-muted)] hover:text-[var(--theme-text-muted)] transition-colors">Ləğv Et</button>
              <button onClick={save} className="px-5 py-2 rounded-xl text-xs font-bold bg-[var(--theme-panel)] hover:bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-all border border-[var(--theme-border)]">{editing ? 'Yadda Saxla' : 'Əlavə Et'}</button>
            </div>
          </motion.div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setConfirmDelete(null)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm mx-4 rounded-2xl border border-[var(--theme-border)] bg-[#0C0C0E] p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-[var(--theme-text)] mb-2">Tədarükçünü Sil</h3>
            <p className="text-sm text-[var(--theme-text-muted)] mb-4">Bu tədarükçünü silmək istədiyinizə əminsiniz?</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 rounded-xl text-xs font-bold text-[var(--theme-text-muted)] hover:text-[var(--theme-text-muted)] transition-colors">İmtina</button>
              <button onClick={remove} className="px-5 py-2 rounded-xl text-xs font-bold bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30">Sil</button>
            </div>
          </motion.div>
        </div>
      )}

      {detailSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setDetailSupplier(null)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg mx-4 rounded-2xl border border-[var(--theme-border)] bg-[#0C0C0E] p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="text-base font-semibold text-[var(--theme-text)]">{detailSupplier.name}</h3>
                <p className="text-xs text-[var(--theme-text-muted)] mt-0.5">{detailSupplier.email || detailSupplier.phone || '—'}</p>
              </div>
              <button onClick={() => setDetailSupplier(null)} className="p-1.5 rounded-lg hover:bg-[var(--theme-surface-soft)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-muted)] transition-colors"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 rounded-xl bg-[var(--theme-panel)] border border-[var(--theme-border)]">
                <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-wider font-semibold">Ümumi Bal</p>
                <p className={`text-lg font-bold mt-1 ${detailSupplier.score !== null && detailSupplier.score >= 80 ? 'text-emerald-400' : detailSupplier.score !== null && detailSupplier.score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {detailSupplier.score !== null ? `${detailSupplier.score}/100` : 'Hesablanmayıb'}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[var(--theme-panel)] border border-[var(--theme-border)]">
                <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-wider font-semibold">Vaxtında Təhvil</p>
                <p className="text-lg font-bold mt-1 text-[var(--theme-text)]">{detailSupplier.on_time_delivery_rate !== null ? `${detailSupplier.on_time_delivery_rate}%` : '—'}</p>
              </div>
              <div className="p-3 rounded-xl bg-[var(--theme-panel)] border border-[var(--theme-border)]">
                <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-wider font-semibold">Qiymət Stabililiyi</p>
                <p className="text-lg font-bold mt-1 text-[var(--theme-text)]">{detailSupplier.avg_price_stability !== null ? `${detailSupplier.avg_price_stability}%` : '—'}</p>
              </div>
              <div className="p-3 rounded-xl bg-[var(--theme-panel)] border border-[var(--theme-border)]">
                <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-wider font-semibold">Sifariş Sayı</p>
                <p className="text-lg font-bold mt-1 text-[var(--theme-text)]">{detailSupplier.total_orders}</p>
              </div>
            </div>
            <div className="space-y-1.5 text-xs text-[var(--theme-text-muted)]">
              {detailSupplier.contact_person && <div>{detailSupplier.contact_person}</div>}
              {detailSupplier.phone && <div>{detailSupplier.phone}</div>}
              {(detailSupplier as any).whatsapp_number && <div>WhatsApp: {(detailSupplier as any).whatsapp_number}</div>}
              {detailSupplier.email && <div>{detailSupplier.email}</div>}
              {detailSupplier.address && <div>{detailSupplier.address}</div>}
              {detailSupplier.tax_id && <div>VÖEN: {detailSupplier.tax_id}</div>}
              {(detailSupplier as any).auto_order_template && <div className="mt-2 p-2 rounded-lg bg-[var(--theme-panel)] text-[var(--theme-text-muted)]">{(detailSupplier as any).auto_order_template}</div>}
              {detailSupplier.notes && !(detailSupplier as any).auto_order_template && <div className="mt-2 p-2 rounded-lg bg-[var(--theme-panel)] text-[var(--theme-text-muted)]">{detailSupplier.notes}</div>}
            </div>

            {/* 13c: Məhsul kataloğu — vendor price list (Order Guide prefill + invoice anchor). */}
            <div className="mt-5 pt-4 border-t border-[var(--theme-border)]">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-[0.2em] font-bold">Məhsul Kataloqu</p>
                <span className="text-[10px] text-[var(--theme-text-muted)] tabular-nums">{catalog.length} məhsul</span>
              </div>
              {catLoading ? (
                <p className="text-xs text-[var(--theme-text-muted)] py-2">Yüklenir...</p>
              ) : (
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                  {catalog.length === 0 && <p className="text-[11px] text-[var(--theme-text-muted)] py-1">Kataloq boşdur — aşağıdan məhsul əlavə edin.</p>}
                  {catalog.map((it) => (
                    <div key={it.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--theme-panel)] border border-[var(--theme-border)]">
                      {catEditing === it.id ? (
                        <>
                          <input value={catEdit.name} onChange={e => setCatEdit(p => ({ ...p, name: e.target.value }))}
                            className="flex-1 min-w-0 bg-[var(--theme-panel)] border border-[var(--theme-border)] rounded-md px-2 py-1 text-xs text-[var(--theme-text)] outline-none focus:border-[#D4AF37]/40" />
                          <input value={catEdit.unit} onChange={e => setCatEdit(p => ({ ...p, unit: e.target.value }))}
                            className="w-14 bg-[var(--theme-panel)] border border-[var(--theme-border)] rounded-md px-2 py-1 text-xs text-[var(--theme-text)] outline-none" />
                          <input type="number" value={catEdit.unit_price} onChange={e => setCatEdit(p => ({ ...p, unit_price: e.target.value }))}
                            className="w-16 bg-[var(--theme-panel)] border border-[var(--theme-border)] rounded-md px-2 py-1 text-xs text-[var(--theme-text)] outline-none" />
                          <button onClick={() => saveCatalogItem(it)} className="p-1 text-emerald-400 hover:text-emerald-300"><CheckCircle size={13} /></button>
                          <button onClick={() => setCatEditing(null)} className="p-1 text-[var(--theme-text-muted)] hover:text-[var(--theme-text-muted)]"><X size={13} /></button>
                        </>
                      ) : (
                        <>
                          <span className={`flex-1 min-w-0 truncate text-xs ${it.active === false ? 'text-[var(--theme-text-muted)] line-through' : 'text-[var(--theme-text-secondary)]'}`}>{it.name}</span>
                          <span className="text-[10px] text-[var(--theme-text-muted)]">{it.unit || '—'}</span>
                          <span className="text-xs font-semibold text-[var(--theme-text-muted)] tabular-nums">{it.unit_price != null ? `₼${Number(it.unit_price).toFixed(2)}` : '—'}</span>
                          <button onClick={() => { setCatEditing(it.id); setCatEdit({ name: it.name, unit: it.unit || 'gram', unit_price: it.unit_price != null ? String(it.unit_price) : '' }); }}
                            className="p-1 rounded text-[var(--theme-text-muted)] hover:text-[var(--theme-text-muted)] transition-colors"><Pencil size={12} /></button>
                          <button onClick={() => removeCatalogItem(it.id)} className="p-1 rounded text-red-400/40 hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1.5 mt-2">
                <input value={catForm.name} onChange={e => setCatForm(p => ({ ...p, name: e.target.value }))} placeholder="Məhsul adı"
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-[var(--theme-panel)] border border-[var(--theme-border)] text-xs text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none focus:border-[#D4AF37]/40" />
                <input value={catForm.unit} onChange={e => setCatForm(p => ({ ...p, unit: e.target.value }))} placeholder="Birim"
                  className="w-14 px-2.5 py-1.5 rounded-lg bg-[var(--theme-panel)] border border-[var(--theme-border)] text-xs text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none" />
                <input type="number" value={catForm.unit_price} onChange={e => setCatForm(p => ({ ...p, unit_price: e.target.value }))} placeholder="₼/birim"
                  className="w-16 px-2.5 py-1.5 rounded-lg bg-[var(--theme-panel)] border border-[var(--theme-border)] text-xs text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none" />
                <button onClick={() => saveCatalogItem()} disabled={!catForm.name.trim()} title="Kataloğa əlavə et"
                  className="p-1.5 rounded-lg bg-[#D4AF37]/15 text-[#D4AF37] hover:bg-[#D4AF37]/25 disabled:opacity-30 transition-all"><Plus size={14} /></button>
              </div>
            </div>

            <div className="flex gap-2 mt-5 justify-end">
              {(detailSupplier as any).whatsapp_number && (
                <button
                  onClick={() => {
                    const template = (detailSupplier as any).auto_order_template || 'Salam, stok hazırlanması haqqında məlumat verərmi?';
                    const text = encodeURIComponent(template);
                    window.open(`https://wa.me/${(detailSupplier as any).whatsapp_number.replace(/[^0-9]/g, '')}?text=${text}`, '_blank');
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 transition-all flex items-center gap-1.5"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  WhatsApp
                </button>
              )}
              <button onClick={() => { setDetailSupplier(null); openEdit(detailSupplier); }} className="px-4 py-2 rounded-xl text-xs font-bold bg-[var(--theme-panel)] hover:bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-all border border-[var(--theme-border)]">Redaktə Et</button>
              <button onClick={() => setDetailSupplier(null)} className="px-4 py-2 rounded-xl text-xs font-bold text-[var(--theme-text-muted)] hover:text-[var(--theme-text-muted)] transition-colors">Bağla</button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
