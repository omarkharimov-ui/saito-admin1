'use client';

// 13i — extracted from the old ProcurementTab (13c), restyled fully
// theme-var based (was hardcoded white/gold inline styles — light-mode bug).
// Flow: upload invoice image → AI OCR lines → review/match → confirm
// (stock in, tied to an open PO) OR create a DRAFT PO (bare invoice, human gate).

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { FileText, CheckCircle, RefreshCw, Image } from '@/components/ui/saito-icons';
import { EmptyState, LoadingState } from '@/components/ProcurementEmptyState';
import { toast } from '@/lib/toast';

type Step = 'upload' | 'review' | 'confirm';

interface LineItem {
  id: string; product_name: string; quantity: number; unit: string;
  unit_cost: number; total_cost: number;
  matched_ingredient?: { id: string; name: string; confidence: number };
  status: 'matched' | 'extra';
}

const solidBtn = 'bg-[var(--theme-text)] text-[var(--theme-bg)]';
const softBg = 'bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]';

export default function InvoiceUploadSection() {
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
            // 13e: OCR reads the supplier name too — attributes the invoice.
            setSupplierName(data.supplierName || null);
            const lines: LineItem[] = (data.lines || []).map((l: any) => ({
              id: `inv-${Math.random().toString(36).slice(2)}`,
              product_name: l.name || 'Unknown', quantity: l.quantity || 0, unit: l.unit || 'gram',
              unit_cost: l.unit_cost || 0, total_cost: l.total_cost || 0,
              status: 'matched',
            }));
            setLineItems(lines); setStep('review');
          } else {
            // 13k: E2E r34 — the OCR 500 was SILENT (no toast, UI looked hung).
            const d = await res.json().catch(() => ({}));
            toast.error(d.error === 'GROQ_API_KEY not configured'
              ? 'Faktura OCR işləmir: AI ərsaşi (GROQ_API_KEY) yoxdur — .env-ə əlavə edin'
              : (d.error || 'Faktura oxuna bilmədi (OCR xətası)'));
          }
        } catch {
          toast.error('Faktura oxuna bilmədi (əlaqə xətası)');
        }
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
    if (pos.length > 0 && !selectedPoId) { toast.error('Faktura üçün sifariş seçin'); return; }
    setConfirming(true);
    try {
      const manualItems = lineItems.filter(l => l.matched_ingredient).map(l => ({
        product_name: l.product_name, quantity: l.quantity, unit: l.unit,
        unit_cost: l.unit_cost, total_cost: l.total_cost, ingredient_id: l.matched_ingredient!.id,
      }));
      const r = await fetch('/api/procurement/receive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purchaseOrderId: selectedPoId, invoiceImage, manualItems }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.success) { toast.error(data.error || 'Qəbul alınmadı'); return; }
      setResult(data); setStep('confirm'); setSelectedPoId(null); fetchPos(); fetchReviews();
    } catch {
      toast.error('Əlaqə xətası');
    }
    setConfirming(false);
  };

  // 13e: bare-invoice → DRAFT PO (human gate: no stock, no auto-send).
  const createDraftPo = async () => {
    if (lineItems.length === 0) return;
    setConfirming(true);
    try {
      const items = lineItems.map(l => ({ product_name: l.product_name, quantity: l.quantity, unit: l.unit, unit_cost: l.unit_cost }));
      const r = await fetch('/api/procurement/from-invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ supplier_name: supplierName, items, source: 'faktura OCR' }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(data.error || 'DRAFT PO yaradılmadı'); return; }
      toast.success('DRAFT PO yaradıldı — Sifarişlər siyahısında review et');
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
        <div onClick={() => fileRef.current?.click()} className="rounded-2xl border-2 border-dashed border-[var(--theme-border)] p-12 text-center cursor-pointer hover:bg-[var(--theme-surface-soft)] transition-all">
          <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
          {ocrLoading ? (
            <div className="space-y-3">
              <RefreshCw size={32} className="mx-auto text-[var(--theme-text-muted)] animate-spin" />
              <p className="text-sm text-[var(--theme-text-muted)]">Faktura oxunur...</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] flex items-center justify-center">
                <Image size={26} className="text-[var(--theme-text-muted)]" />
              </div>
              <p className="text-sm font-bold text-[var(--theme-text)]">Faktura şəklini yükləyin</p>
              <p className="text-xs text-[var(--theme-text-muted)]">AI OCR avtomatik məhsul adlarını, miqdarları və qiymətləri çıxaracaq</p>
            </div>
          )}
          {invoiceImage && <img src={invoiceImage} alt="Invoice" className="mt-4 max-h-48 mx-auto rounded-xl object-contain" />}
        </div>

        {pos.length > 0 && (
          <div className="border-t border-[var(--theme-border)] pt-4">
            <p className="text-xs text-[var(--theme-text-muted)] mb-3">Bu faktura hansı sifarişə aiddir? (köməkçi)</p>
            <div className="grid gap-2 md:grid-cols-2">
              {pos.map((po) => {
                const selected = selectedPoId === po.id;
                return (
                  <div key={po.id}
                    onClick={() => setSelectedPoId(selected ? null : po.id)}
                    className={`rounded-2xl border p-4 cursor-pointer transition-all hover:bg-[var(--theme-surface-soft)] ${selected ? 'border-[var(--theme-text)]/60 bg-[var(--theme-surface-soft)]' : 'border-[var(--theme-border)]'}`}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="text-sm font-semibold text-[var(--theme-text)] flex items-center gap-2">
                          {po.order_number}
                          {selected && <CheckCircle size={14} className="text-[var(--theme-text)]" />}
                        </h3>
                        <p className="text-xs text-[var(--theme-text-muted)] mt-0.5">{po.supplier?.name || '—'}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${po.status === 'sent' ? 'bg-blue-500/15 text-blue-500 border-blue-500/20' : 'bg-orange-500/15 text-orange-500 border-orange-500/20'}`}>
                        {po.status === 'sent' ? 'Göndərilib' : 'Qismən'}
                      </span>
                    </div>
                    <div className="text-xs text-[var(--theme-text-muted)]">{po.total_amount?.toFixed(2)} ₼ • {new Date(po.ordered_at).toLocaleDateString('az')}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {pendingReviewItems.length > 0 && (
          <div className="rounded-2xl border border-[var(--theme-border)] p-4">
            <p className="text-sm font-semibold text-[var(--theme-text)] mb-3">{pendingReviewItems.length} review gözləyir</p>
            <div className="space-y-2">
              {pendingReviewItems.slice(0, 5).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between p-2 rounded-lg bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
                  <span className="text-xs text-[var(--theme-text-secondary)]">{r.product_name}</span>
                  <div className="flex gap-2">
                    <button onClick={() => approveReview(r.id, r.suggested_ingredient_id)} className="text-[10px] text-emerald-500 font-bold hover:opacity-70 transition-opacity">Təsdiq</button>
                    <button onClick={() => rejectReview(r.id)} className="text-[10px] text-rose-500 font-bold hover:opacity-70 transition-opacity">Rədd</button>
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
      <div className="flex items-center gap-3 text-xs text-[var(--theme-text-muted)]">
        {/* this branch only renders for review/confirm (upload returns earlier) */}
        <span>1. Faktura Yüklə</span>
        <span>→</span>
        <span className={step === 'review' ? 'text-[var(--theme-text)] font-bold' : ''}>2. Xətləri Yoxla</span>
        <span>→</span>
        <span className={step === 'confirm' ? 'text-[var(--theme-text)] font-bold' : ''}>3. Təsdiq Et</span>
      </div>

      <button onClick={() => { setStep('upload'); setLineItems([]); setResult(null); }} className="text-xs text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-colors">← Geri</button>

      {step === 'review' && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-xs text-[var(--theme-text-muted)]">{lineItems.length} xətt tapıldı</p>
            <span className="text-xs text-[var(--theme-text-muted)]">|</span>
            <p className="text-xs text-emerald-500">{matchedCount} match</p>
            <button onClick={matchAll} disabled={matching}
              className={`ml-auto px-3.5 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all disabled:opacity-40 flex items-center gap-1.5 active:scale-[0.97] ${solidBtn}`}>
              {matching ? <><RefreshCw size={12} className="animate-spin" /> Match edilir...</> : 'AI Match Et'}
            </button>
          </div>
          <div className="space-y-2">
            {lineItems.map((item) => (
              <div key={item.id} className="rounded-xl border border-[var(--theme-border)] p-4 bg-[var(--theme-surface)]">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${item.status === 'extra' ? 'bg-orange-400' : 'bg-emerald-400'}`} />
                    <span className="text-sm font-medium text-[var(--theme-text)]">{item.product_name}</span>
                  </div>
                  {item.matched_ingredient && (
                    <span className="text-[10px] text-emerald-500">{item.matched_ingredient.name} ({(item.matched_ingredient.confidence * 100).toFixed(0)}%)</span>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className={`p-2 rounded-lg ${softBg}`}>
                    <p className="text-[var(--theme-text-muted)] mb-0.5">Faktura</p>
                    <span className="text-[var(--theme-text)] font-semibold">{item.quantity} {item.unit}</span>
                    <span className="ml-1 text-[var(--theme-text-muted)]">× {item.unit_cost.toFixed(2)} ₼</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={confirm} disabled={confirming}
            className={`w-full py-3 rounded-xl text-sm font-black uppercase tracking-wider transition-all disabled:opacity-40 flex items-center justify-center gap-2 active:scale-[0.99] ${solidBtn}`}>
            {confirming ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle size={16} />} Təsdiq Et və Stoku Artır
          </button>
          {pos.length === 0 && (
            <button onClick={createDraftPo} disabled={confirming}
              className="w-full mt-2 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-2 border border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)]">
              <FileText size={14} /> DRAFT PO yarat (stok daxil etmir · auto-send YOX)
            </button>
          )}
        </>
      )}

      {step === 'confirm' && result && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
            <CheckCircle size={32} className="text-emerald-500" />
          </div>
          <h2 className="text-lg font-black text-[var(--theme-text)] tracking-tight">Stok yeniləndi</h2>
          <p className="text-sm text-[var(--theme-text-muted)]">{result.auto_matched}/{result.total_items} maddə uğurla match edildi</p>
          <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto text-xs">
            <div className={`p-3 rounded-xl ${softBg}`}>
              <p className="text-emerald-500 font-bold text-lg">{result.auto_matched}</p>
              <p className="text-[var(--theme-text-muted)]">Match</p>
            </div>
            <div className={`p-3 rounded-xl ${softBg}`}>
              <p className="text-amber-500 font-bold text-lg">{result.review_items}</p>
              <p className="text-[var(--theme-text-muted)]">Review</p>
            </div>
            <div className={`p-3 rounded-xl ${softBg}`}>
              <p className="text-[var(--theme-text)] font-bold text-lg capitalize">{result.po_status}</p>
              <p className="text-[var(--theme-text-muted)]">Status</p>
            </div>
          </div>
          <button onClick={() => { setStep('upload'); setLineItems([]); setResult(null); setInvoiceImage(null); }}
            className={`px-6 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider transition-all active:scale-[0.97] ${solidBtn}`}>
            Yeni Qəbul
          </button>
        </motion.div>
      )}
    </div>
  );
}
