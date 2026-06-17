'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, CheckCircle, AlertTriangle, X, RefreshCw, Package, ArrowRight, Image, Scale, Search } from 'lucide-react';
import { PageTransition } from '@/components/PageTransition';

type Step = 'select' | 'upload' | 'review' | 'confirm';
type Tab = 'receive' | 'reviews';

interface LineItem {
  id: string;
  product_name: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
  po_quantity?: number;
  po_unit?: string;
  po_unit_cost?: number;
  matched_ingredient?: { id: string; name: string; confidence: number };
  variance_qty?: number;
  status: 'matched' | 'adjusted' | 'missing' | 'extra';
}

const unitConversions: Record<string, Record<string, number>> = {
  kg: { gram: 1000, g: 1000 },
  gram: { kg: 0.001 },
  liter: { ml: 1000, l: 1000 },
  ml: { liter: 0.001, l: 0.001 },
};

function convertUnit(value: number, from: string, to: string): number {
  const key = from.toLowerCase();
  const target = to.toLowerCase();
  if (key === target) return value;
  const factor = unitConversions[key]?.[target] || unitConversions[target]?.[key];
  if (factor) return factor > 1 ? value * factor : value / (1 / factor);
  return value;
}

export default function ReceivingPage() {
  const [tab, setTab] = useState<Tab>('receive');
  const [pos, setPos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPo, setSelectedPo] = useState<any | null>(null);
  const [step, setStep] = useState<Step>('select');
  const [invoiceImage, setInvoiceImage] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [matching, setMatching] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [poItems, setPoItems] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchPos(); fetchReviews(); }, []);

  const fetchPos = async () => {
    try {
      const res = await fetch('/api/purchase-orders?status=sent,partial');
      const data = await res.json();
      setPos(data.filter((p: any) => p.status === 'sent' || p.status === 'partial'));
    } catch { /* ignore */ }
    setLoading(false);
  };

  const fetchReviews = async () => {
    try {
      const res = await fetch('/api/procurement/reviews');
      setReviews(await res.json());
    } catch { /* ignore */ }
  };

  const handleSelectPo = async (po: any) => {
    setSelectedPo(po);
    setStep('upload');
    setInvoiceImage(null);
    setOcrResult(null);
    setLineItems([]);
    setResult(null);

    try {
      const res = await fetch(`/api/purchase-orders/${po.id}`);
      const data = await res.json();
      setPoItems(data.items || []);
    } catch { /* ignore */ }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      setInvoiceImage(base64);
      setOcrLoading(true);

      try {
        const res = await fetch('/api/invoice-ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: base64, language: 'az' }),
        });
        if (res.ok) {
          const data = await res.json();
          setOcrResult(data);
          const lines: LineItem[] = (data.lines || []).map((l: any) => {
            const poMatch = poItems.find((p: any) =>
              p.product_name.toLowerCase().trim() === (l.name || '').toLowerCase().trim()
            );
            const qty = l.quantity || 0;
            const poQty = poMatch?.quantity || 0;
            return {
              id: `inv-${Math.random().toString(36).slice(2)}`,
              product_name: l.name || 'Unknown',
              quantity: qty,
              unit: l.unit || 'gram',
              unit_cost: l.unit_cost || 0,
              total_cost: l.total_cost || 0,
              po_quantity: poQty,
              po_unit: poMatch?.unit,
              po_unit_cost: poMatch?.unit_cost,
              variance_qty: poQty ? qty - poQty : undefined,
              status: !poQty ? 'extra' : Math.abs(qty - poQty) / poQty > 0.05 ? 'adjusted' : 'matched',
            };
          });

          if (lines.length === 0 && poItems.length > 0) {
            for (const p of poItems) {
              lines.push({
                id: `po-${p.id}`,
                product_name: p.product_name,
                quantity: 0,
                unit: p.unit,
                unit_cost: p.unit_cost,
                total_cost: 0,
                po_quantity: p.quantity,
                po_unit: p.unit,
                po_unit_cost: p.unit_cost,
                variance_qty: -p.quantity,
                status: 'missing',
              });
            }
          }

          setLineItems(lines);
          setStep('review');
        }
      } catch { /* ignore */ }
      setOcrLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleMatchAll = async () => {
    setMatching(true);
    const updated = await Promise.all(lineItems.map(async (item) => {
      const res = await fetch('/api/procurement/match-ingredient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName: item.product_name }),
      });
      const data = await res.json();
      if (data.match && data.match.confidence > 0.5) {
        return { ...item, matched_ingredient: { id: data.match.id, name: data.match.name, confidence: data.match.confidence } };
      }
      return item;
    }));
    setLineItems(updated);
    setMatching(false);
  };

  const updateLineItem = (id: string, updates: Partial<LineItem>) => {
    setLineItems(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const manualItems = lineItems
        .filter(l => l.matched_ingredient)
        .map(l => ({
          product_name: l.product_name,
          quantity: l.quantity,
          unit: l.unit,
          unit_cost: l.unit_cost,
          total_cost: l.total_cost,
          ingredient_id: l.matched_ingredient!.id,
        }));

      const res = await fetch('/api/procurement/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchaseOrderId: selectedPo.id,
          invoiceImage,
          manualItems,
        }),
      });
      const data = await res.json();
      setResult(data);
      setStep('confirm');
      fetchPos();
      fetchReviews();
    } catch { /* ignore */ }
    setConfirming(false);
  };

  const handleApproveReview = async (id: string, ingredientId?: string) => {
    await fetch('/api/procurement/reviews', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'approved', suggested_ingredient_id: ingredientId }),
    });
    fetchReviews();
  };

  const handleRejectReview = async (id: string) => {
    await fetch('/api/procurement/reviews', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'rejected' }),
    });
    fetchReviews();
  };

  const pendingReviews = reviews.filter((r: any) => r.status === 'pending');
  const matchedCount = lineItems.filter(l => l.matched_ingredient).length;
  const missingCount = lineItems.filter(l => l.status === 'missing').length;
  const extraCount = lineItems.filter(l => l.status === 'extra').length;

  return (
    <PageTransition>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Tədarük Qəbulu</h1>
            <p className="text-sm text-white/40 mt-1">Goods Receiving — Invoice OCR → AI Match → Stock Update</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setTab('receive')}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${tab === 'receive' ? 'text-black' : 'text-white/50 hover:text-white'}`}
              style={{ background: tab === 'receive' ? '#D4AF37' : 'rgba(255,255,255,0.05)' }}>
              Qəbul
            </button>
            <button onClick={() => setTab('reviews')}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all relative ${tab === 'reviews' ? 'text-black' : 'text-white/50 hover:text-white'}`}
              style={{ background: tab === 'reviews' ? '#D4AF37' : 'rgba(255,255,255,0.05)' }}>
              Review
              {pendingReviews.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">{pendingReviews.length}</span>
              )}
            </button>
          </div>
        </div>

        {tab === 'receive' && (
          <>
            {loading ? (
              <div className="text-center py-16 text-white/30">Yüklənir...</div>
            ) : !selectedPo || step === 'select' ? (
              <div className="grid gap-3 md:grid-cols-2">
                {pos.map((po, i) => (
                  <motion.div key={po.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                    className="rounded-2xl border p-5 cursor-pointer hover:bg-white/[0.018] transition-all"
                    style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.06))' }}
                    onClick={() => handleSelectPo(po)}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-semibold text-white">{po.order_number}</h3>
                        <p className="text-xs text-white/40 mt-0.5">{po.supplier?.name || '—'}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${po.status === 'sent' ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20' : 'bg-orange-500/15 text-orange-400 border border-orange-500/20'}`}>
                        {po.status === 'sent' ? 'Göndərilib' : 'Qismən'}
                      </span>
                    </div>
                    <div className="text-xs text-white/30">{po.total_amount?.toFixed(2)} ₼ • {new Date(po.ordered_at).toLocaleDateString('az')}</div>
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-[#D4AF37]">
                      <ArrowRight size={12} /> Davam et
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center gap-3 text-xs text-white/30 mb-2">
                  <span className={step === 'upload' ? 'text-[#D4AF37] font-bold' : ''}>1. Faktura Yüklə</span>
                  <span>→</span>
                  <span className={step === 'review' ? 'text-[#D4AF37] font-bold' : ''}>2. Xətləri Yoxla</span>
                  <span>→</span>
                  <span className={step === 'confirm' ? 'text-[#D4AF37] font-bold' : ''}>3. Təsdiq Et</span>
                </div>

                <div className="flex items-center justify-between">
                  <button onClick={() => { setSelectedPo(null); setStep('select'); }}
                    className="text-xs text-white/30 hover:text-white transition-colors">← Geri</button>
                  <span className="text-sm font-semibold text-white">{selectedPo.order_number} — {selectedPo.supplier?.name}</span>
                  <div />
                </div>

                {step === 'upload' && (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer hover:bg-white/[0.01] transition-all"
                    style={{ borderColor: 'rgba(255,255,255,0.1)' }}
                  >
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                    {ocrLoading ? (
                      <div className="space-y-3">
                        <RefreshCw size={32} className="mx-auto text-[#D4AF37] animate-spin" />
                        <p className="text-sm text-white/50">Faktura oxunur...</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <Image size={32} className="mx-auto text-white/20" />
                        <p className="text-sm text-white/50">Faktura şəklini yükləyin və ya sürüşdürün</p>
                        <p className="text-xs text-white/20">AI OCR avtomatik məhsul adlarını, miqdarları və qiymətləri çıxaracaq</p>
                      </div>
                    )}
                    {invoiceImage && (
                      <img src={invoiceImage} alt="Invoice" className="mt-4 max-h-48 mx-auto rounded-xl object-contain" />
                    )}
                  </div>
                )}

                {step === 'review' && (
                  <>
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="text-xs text-white/40">{lineItems.length} xətt tapıldı</p>
                      <span className="text-xs text-white/20">|</span>
                      <p className="text-xs text-emerald-400">{matchedCount} match</p>
                      {missingCount > 0 && <p className="text-xs text-yellow-400">{missingCount} çatışmayan</p>}
                      {extraCount > 0 && <p className="text-xs text-orange-400">{extraCount} artıq</p>}
                      <button onClick={handleMatchAll} disabled={matching}
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
                              <span className={`w-2 h-2 rounded-full ${item.status === 'matched' ? 'bg-emerald-400' : item.status === 'adjusted' ? 'bg-yellow-400' : item.status === 'missing' ? 'bg-red-400' : 'bg-orange-400'}`} />
                              <span className="text-sm font-medium text-white">{item.product_name}</span>
                              {item.status === 'missing' && <span className="text-[9px] text-red-400 font-bold px-1.5 py-0.5 rounded bg-red-500/10">Çatışmır</span>}
                              {item.status === 'extra' && <span className="text-[9px] text-orange-400 font-bold px-1.5 py-0.5 rounded bg-orange-500/10">Artıq</span>}
                              {item.status === 'adjusted' && <span className="text-[9px] text-yellow-400 font-bold px-1.5 py-0.5 rounded bg-yellow-500/10">Dəyişib</span>}
                            </div>
                            {item.matched_ingredient && (
                              <span className="text-[10px] text-emerald-400">
                                {item.matched_ingredient.name} ({(item.matched_ingredient.confidence * 100).toFixed(0)}%)
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                            <div className="p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                              <p className="text-white/30 mb-0.5">Faktura</p>
                              <input value={item.quantity} onChange={e => updateLineItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                                className="w-20 bg-transparent text-white font-semibold outline-none border-b border-white/10" type="number" step="0.001" />
                              <select value={item.unit} onChange={e => updateLineItem(item.id, { unit: e.target.value })}
                                className="ml-1 bg-transparent text-white/60 outline-none text-[10px]">
                                <option value="gram">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="liter">l</option><option value="piece">əd</option>
                              </select>
                              <span className="ml-1 text-white/40">× {item.unit_cost.toFixed(2)} ₼</span>
                            </div>
                            {item.po_quantity !== undefined && (
                              <div className="p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                                <p className="text-white/30 mb-0.5">Sifariş</p>
                                <p className="text-white font-semibold">
                                  {convertUnit(item.po_quantity, item.po_unit || 'gram', item.unit).toFixed(1)} {item.unit}
                                </p>
                                <p className="text-white/30">{item.po_unit_cost?.toFixed(2)} ₼/vahid</p>
                              </div>
                            )}
                            {item.variance_qty !== undefined && (
                              <div className="p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                                <p className="text-white/30 mb-0.5">Fərq</p>
                                <p className={`font-semibold ${(item.variance_qty || 0) > 0 ? 'text-orange-400' : (item.variance_qty || 0) < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                  {item.variance_qty > 0 ? '+' : ''}{item.variance_qty?.toFixed(1)} {item.unit}
                                </p>
                              </div>
                            )}
                            {item.matched_ingredient ? (
                              <div className="p-2 rounded-lg" style={{ background: 'rgba(16,185,129,0.05)' }}>
                                <p className="text-emerald-400/70 mb-0.5">AI Match</p>
                                <p className="text-emerald-400 font-semibold">Təsdiqləndi</p>
                              </div>
                            ) : (
                              <div className="p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                                <p className="text-white/30 mb-0.5">Match</p>
                                <p className="text-white/30">Gözləyir</p>
                              </div>
                            )}
                          </div>

                          {item.po_unit && item.unit !== item.po_unit && (
                            <div className="mt-2 text-[10px] text-yellow-400/60 flex items-center gap-1">
                              <Scale size={10} /> Vahid fərqi: {item.po_unit} → {item.unit} (konvertasiya: {convertUnit(1, item.po_unit, item.unit).toFixed(3)})
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <button onClick={handleConfirm} disabled={confirming || !selectedPo}
                      className="w-full py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                      style={{ background: '#D4AF37', color: '#000' }}>
                      {confirming ? 'Stok yenilənir...' : <><CheckCircle size={16} /> Təsdiq Et və Stoku Artır</>}
                    </button>
                  </>
                )}

                {step === 'confirm' && result && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border p-8 text-center space-y-4"
                    style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.06))' }}>
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
                    <button onClick={() => { setSelectedPo(null); setStep('select'); setResult(null); }}
                      className="px-6 py-2.5 rounded-xl text-sm font-bold transition-all"
                      style={{ background: '#D4AF37', color: '#000' }}>
                      Yeni Qəbul
                    </button>
                  </motion.div>
                )}
              </div>
            )}
          </>
        )}

        {tab === 'reviews' && (
          <>
            {reviews.length === 0 ? (
              <div className="text-center py-16 text-white/20">
                <CheckCircle size={40} className="mx-auto mb-3 text-emerald-400/50" />
                <p className="text-sm">Review tələb edən maddə yoxdur</p>
              </div>
            ) : (
              <div className="space-y-3">
                {(reviews as any[]).map((r: any, i: number) => (
                  <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                    className="rounded-2xl border p-5" style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.06))' }}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${r.status === 'pending' ? 'bg-yellow-500/15' : r.status === 'approved' ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}>
                          {r.status === 'pending' ? <AlertTriangle size={18} className="text-yellow-400" /> :
                           r.status === 'approved' ? <CheckCircle size={18} className="text-emerald-400" /> : <X size={18} className="text-red-400" />}
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-white">{r.product_name}</h3>
                          <p className="text-xs text-white/30">{r.quantity} {r.unit} × {r.unit_cost?.toFixed(2)} ₼{r.suggested_ingredient_id ? ` → AI: ${r.match_confidence ? Math.round(r.match_confidence * 100) : '?'}%` : ''}</p>
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.status === 'pending' ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20' : r.status === 'approved' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/15 text-red-400 border border-red-500/20'}`}>
                        {r.status === 'pending' ? 'Gözləyir' : r.status === 'approved' ? 'Təsdiqləndi' : 'Rədd edildi'}
                      </span>
                    </div>
                    {r.status === 'pending' && (
                      <div className="flex gap-2">
                        <button onClick={() => handleApproveReview(r.id, r.suggested_ingredient_id)}
                          className="flex-1 py-2 rounded-xl text-xs font-bold transition-all" style={{ background: 'rgba(16,185,129,0.15)', color: '#34D399' }}>
                          <CheckCircle size={12} className="inline mr-1" /> Təsdiq Et
                        </button>
                        <button onClick={() => handleRejectReview(r.id)}
                          className="flex-1 py-2 rounded-xl text-xs font-bold transition-all" style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444' }}>
                          <X size={12} className="inline mr-1" /> Rədd Et
                        </button>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </PageTransition>
  );
}
