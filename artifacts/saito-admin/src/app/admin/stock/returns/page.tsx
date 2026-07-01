'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Plus, Trash2, ChevronDown, Loader2, Search, ArrowLeftRight, Package,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import type {
  SupplierReturn, SupplierReturnItem, Ingredient, Supplier,
} from '@/types/inventory';
import { PageTransition } from '@/components/PageTransition';
import { GlassCard } from '@/components/GlassCard';

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Qaralama',  cls: 'text-zinc-400/80 bg-zinc-500/10 border-zinc-500/20' },
  sent:      { label: 'Göndərildi', cls: 'text-blue-400 bg-blue-500/15 border-blue-500/30' },
  completed: { label: 'Tamamlandı', cls: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' },
  cancelled: { label: 'Ləğv edildi', cls: 'text-red-400/80 bg-red-500/10 border-red-500/20' },
};

const STATUS_OPTIONS = ['draft', 'sent', 'completed', 'cancelled'] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('az-AZ', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function fmtCurrency(n: number) {
  return Number(n).toLocaleString('az-AZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Modal variants ──────────────────────────────────────────────────────────

const modalV = {
  hidden: { opacity: 0, scale: 0.96, y: 14 },
  show:   { opacity: 1, scale: 1, y: 0, transition: { type: 'spring' as const, stiffness: 400, damping: 32 } },
  exit:   { opacity: 0, scale: 0.95, y: 8, transition: { duration: 0.14 } },
};

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] || STATUS_META.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border ${m.cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
      {m.label}
    </span>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SupplierReturnsPage() {
  const { t } = useLanguage();
  const [returns, setReturns] = useState<SupplierReturn[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  // Detail view
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<{
    return: SupplierReturn;
    items: (SupplierReturnItem & { ingredient_name?: string; ingredient_unit?: string })[];
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Cancel confirm
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Process
  const [processingId, setProcessingId] = useState<string | null>(null);

  const supplierMap = useMemo(() => {
    const m = new Map<string, string>();
    suppliers.forEach(s => m.set(s.id, s.name));
    return m;
  }, [suppliers]);

  const ingredientMap = useMemo(() => {
    const m = new Map<string, { name: string; unit: string }>();
    ingredients.forEach(i => m.set(i.id, { name: i.name, unit: i.unit }));
    return m;
  }, [ingredients]);

  // ── Create form state ────────────────────────────────────────────────────
  const [formSupplier, setFormSupplier] = useState('');
  const [formReturnNumber, setFormReturnNumber] = useState('');
  const [formReason, setFormReason] = useState('');
  const [formItems, setFormItems] = useState<{
    ingredient_id: string; quantity: string; unit_cost: string;
  }[]>([
    { ingredient_id: '', quantity: '', unit_cost: '' },
  ]);

  const formTotal = useMemo(() =>
    formItems.reduce((s, item) => {
      const q = parseFloat(item.quantity) || 0;
      const c = parseFloat(item.unit_cost) || 0;
      return s + q * c;
    }, 0),
    [formItems],
  );

  // ── Data fetching ────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [returnsRes, suppliersRes, ingredientsRes] = await Promise.all([
        fetch('/api/stock/returns'),
        fetch('/api/suppliers'),
        fetch('/api/ingredients'),
      ]);
      if (returnsRes.ok) setReturns(await returnsRes.json());
      if (suppliersRes.ok) setSuppliers(await suppliersRes.json());
      if (ingredientsRes.ok) setIngredients(await ingredientsRes.json());
    } catch {
      toast.error('Məlumatlar yüklənərkən xəta baş verdi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Filter ───────────────────────────────────────────────────────────────
  const filteredReturns = useMemo(() => {
    if (!search.trim()) return returns;
    const q = search.toLowerCase();
    return returns.filter(r =>
      r.return_number.toLowerCase().includes(q) ||
      supplierMap.get(r.supplier_id)?.toLowerCase().includes(q) ||
      STATUS_META[r.status]?.label.toLowerCase().includes(q),
    );
  }, [returns, search, supplierMap]);

  // ── Detail ───────────────────────────────────────────────────────────────
  const openDetail = async (id: string) => {
    setDetailId(id);
    setDetailLoading(true);
    setDetailData(null);
    try {
      const res = await fetch(`/api/stock/returns/${id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setDetailData(data);
    } catch {
      toast.error('Qaytarma detalları yüklənərkən xəta baş verdi');
      setDetailId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailId(null);
    setDetailData(null);
  };

  // ── Create Return ────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!formSupplier) { toast.error('Təchizatçı seçin'); return; }
    if (!formReturnNumber.trim()) { toast.error('Qaytarma nömrəsi daxil edin'); return; }
    const validItems = formItems.filter(i => i.ingredient_id && parseFloat(i.quantity) > 0);
    if (validItems.length === 0) { toast.error('Ən azı bir məhsul əlavə edin'); return; }

    setSaving(true);
    try {
      const payload = {
        supplier_id: formSupplier,
        return_number: formReturnNumber.trim(),
        reason: formReason.trim() || undefined,
        items: validItems.map(i => ({
          ingredient_id: i.ingredient_id,
          quantity: parseFloat(i.quantity),
          unit_cost: parseFloat(i.unit_cost) || 0,
        })),
      };
      const res = await fetch('/api/stock/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('Qaytarma yaradıldı');
      setShowCreate(false);
      resetForm();
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormSupplier('');
    setFormReturnNumber('');
    setFormReason('');
    setFormItems([{ ingredient_id: '', quantity: '', unit_cost: '' }]);
  };

  const addItem = () => {
    setFormItems(prev => [...prev, { ingredient_id: '', quantity: '', unit_cost: '' }]);
  };

  const removeItem = (idx: number) => {
    setFormItems(prev => prev.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: string, value: string) => {
    setFormItems(prev => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  };

  // ── Process Return ───────────────────────────────────────────────────────
  const handleProcess = async (id: string) => {
    setProcessingId(id);
    try {
      const res = await fetch('/api/stock/process-return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ return_id: id }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('Qaytarma emal edildi');
      setProcessingId(null);
      closeDetail();
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi');
      setProcessingId(null);
    }
  };

  // ── Cancel Return ────────────────────────────────────────────────────────
  const handleCancel = async (id: string) => {
    setCancelling(true);
    try {
      const res = await fetch(`/api/stock/returns/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('Qaytarma ləğv edildi');
      setCancelConfirm(null);
      closeDetail();
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi');
    } finally {
      setCancelling(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <PageTransition className="min-h-screen bg-[var(--theme-bg)] text-[var(--theme-text)] pb-20">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-48 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full opacity-[0.04]"
          style={{ background: 'radial-gradient(ellipse,#D4AF37,transparent 70%)' }} />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 space-y-6">

        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#1e1600,#140f00)', border: '1px solid rgba(212,175,55,0.2)' }}>
              <ArrowLeftRight size={20} className="text-[#D4AF37]" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-serif font-bold tracking-tight leading-none">
                Təchizatçı Qaytarmaları
              </h1>
              <p className="text-[11px] text-[var(--theme-text-muted)] uppercase tracking-[0.2em] mt-1">
                Supplier Returns
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold tracking-wide transition-all active:scale-[0.97]"
            style={{ background: '#111111', color: '#ffffff', border: '1px solid rgba(255,255,255,0.16)' }}
          >
            <Plus size={15} /> Yeni Qaytarma
          </button>
        </motion.div>

        {/* ── Search ── */}
        <div className="relative max-w-xs">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)] pointer-events-none" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Qaytarma axtar..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm bg-white/[0.04] border border-white/[0.08] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none focus:border-[#D4AF37]/30 transition-colors"
          />
        </div>

        {/* ── Table ── */}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 size={28} className="animate-spin text-white/15" />
          </div>
        ) : filteredReturns.length === 0 ? (
          <GlassCard intensity="light" padding="xl" className="text-center">
            <ArrowLeftRight size={44} className="mx-auto mb-4 opacity-20 text-[var(--theme-text-muted)]" />
            <p className="text-sm font-medium text-[var(--theme-text-secondary)]">
              {search ? 'Axtarış nəticəsi tapılmadı' : 'Hələ qaytarma yaradılmayıb'}
            </p>
            {!search && (
              <div className="mt-4 space-y-2 text-xs text-[var(--theme-text-muted)]">
                <p>"Yeni Qaytarma" düyməsi ilə ilk təchizatçı qaytarmasını yaradın</p>
              </div>
            )}
          </GlassCard>
        ) : (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="rounded-2xl overflow-hidden"
            style={{ border: '1px solid rgba(255,255,255,0.06)' }}
          >
            {/* Table head */}
            <div
              className="hidden lg:grid gap-4 px-6 py-3 text-[10px] font-bold tracking-[0.15em] uppercase text-[var(--theme-text-muted)]"
              style={{
                gridTemplateColumns: '1fr 1fr 100px 130px 150px 100px',
                background: 'rgba(255,255,255,0.018)',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <span>Qaytarma №</span>
              <span>Təchizatçı</span>
              <span>Status</span>
              <span className="text-right">Məbləğ</span>
              <span className="text-right">Tarix</span>
              <span className="text-right">Əməliyyat</span>
            </div>

            {filteredReturns.map((r, i) => {
              const supplierName = supplierMap.get(r.supplier_id) || 'Naməlum';
              return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="group px-4 lg:px-6 py-4 transition-colors hover:bg-white/[0.018] cursor-pointer"
                  style={{ borderBottom: i < filteredReturns.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                  onClick={() => openDetail(r.id)}
                >
                  {/* Desktop row */}
                  <div
                    className="hidden lg:grid gap-4 items-center"
                    style={{ gridTemplateColumns: '1fr 1fr 100px 130px 150px 100px' }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{r.return_number}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-[var(--theme-text-secondary)] truncate">{supplierName}</p>
                    </div>
                    <div>
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold tabular-nums">₼{fmtCurrency(r.total_amount)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-[var(--theme-text-secondary)]">{fmtDate(r.created_at)}</span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                      {r.status === 'draft' && (
                        <>
                          <button
                            onClick={() => handleProcess(r.id)}
                            disabled={processingId === r.id}
                            className="w-7 h-7 rounded-lg hover:bg-emerald-500/10 transition-all flex items-center justify-center text-[var(--theme-text-muted)] hover:text-emerald-400"
                            title="Emal et"
                          >
                            {processingId === r.id ? <Loader2 size={13} className="animate-spin" /> : <Package size={13} />}
                          </button>
                          <button
                            onClick={() => setCancelConfirm(r.id)}
                            className="w-7 h-7 rounded-lg hover:bg-red-500/10 transition-all flex items-center justify-center text-[var(--theme-text-muted)] hover:text-red-400"
                            title="Ləğv et"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                      <button className="w-7 h-7 rounded-lg hover:bg-white/[0.06] transition-all flex items-center justify-center text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]">
                        <ChevronDown size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Mobile card */}
                  <div className="lg:hidden space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{r.return_number}</p>
                        <p className="text-xs text-[var(--theme-text-secondary)] mt-0.5">{supplierName}</p>
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-[var(--theme-text-muted)]">
                        <p>Tarix: {fmtDate(r.created_at)}</p>
                      </div>
                      <span className="text-sm font-bold tabular-nums">₼{fmtCurrency(r.total_amount)}</span>
                    </div>
                    <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                      {r.status === 'draft' && (
                        <>
                          <button
                            onClick={() => handleProcess(r.id)}
                            disabled={processingId === r.id}
                            className="flex-1 px-3 py-2 rounded-xl text-xs font-bold transition-all bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                          >
                            {processingId === r.id ? <Loader2 size={13} className="animate-spin" /> : 'Emal et'}
                          </button>
                          <button
                            onClick={() => setCancelConfirm(r.id)}
                            className="flex-1 px-3 py-2 rounded-xl text-xs font-bold transition-all bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
                          >
                            Ləğv et
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => openDetail(r.id)}
                        className="px-3 py-2 rounded-xl text-xs font-bold bg-white/[0.04] border border-white/[0.08] text-[var(--theme-text-secondary)]"
                      >
                        Detal
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════
          DETAIL MODAL
      ════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {detailId && (
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              className="absolute inset-0 bg-black/75 backdrop-blur-sm"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={closeDetail}
            />
            <motion.div
              variants={modalV} initial="hidden" animate="show" exit="exit"
              className="relative z-10 w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl flex flex-col gap-0"
              style={{ background: '#0e0e0e', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="sm:hidden flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-white/15" />
              </div>

              <div className="p-6 space-y-5">
                {detailLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 size={24} className="animate-spin text-white/15" />
                  </div>
                ) : detailData ? (
                  <>
                    {/* Modal header */}
                    <div className="flex items-start justify-between">
                      <div>
                        <StatusBadge status={detailData.return.status} />
                        <h2 className="text-xl font-bold mt-2">{detailData.return.return_number}</h2>
                        <p className="text-sm text-[var(--theme-text-secondary)] mt-1">
                          {supplierMap.get(detailData.return.supplier_id) || 'Naməlum Təchizatçı'}
                        </p>
                      </div>
                      <button onClick={closeDetail} className="text-white/25 hover:text-white transition-colors mt-1">
                        <X size={18} />
                      </button>
                    </div>

                    {/* Info */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-wider font-semibold">Tarix</p>
                        <p className="text-sm font-medium mt-1">{fmtDate(detailData.return.created_at)}</p>
                      </div>
                      <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-wider font-semibold">Ümumi Məbləğ</p>
                        <p className="text-sm font-bold text-[#D4AF37] mt-1">₼{fmtCurrency(detailData.return.total_amount)}</p>
                      </div>
                    </div>

                    {/* Reason */}
                    {detailData.return.reason && (
                      <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-wider font-semibold">Səbəb</p>
                        <p className="text-sm mt-1">{detailData.return.reason}</p>
                      </div>
                    )}

                    {/* Items */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider">
                          Məhsullar ({detailData.items.length})
                        </label>
                      </div>

                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {detailData.items.map((item, idx) => {
                          const ingName = (item as any).ingredient_name || ingredientMap.get(item.ingredient_id)?.name || 'Naməlum';
                          const ingUnit = (item as any).ingredient_unit || ingredientMap.get(item.ingredient_id)?.unit || 'ədəd';
                          return (
                            <div key={item.id || idx}
                              className="p-3 rounded-xl flex items-center gap-3"
                              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{ingName}</p>
                                <p className="text-[10px] text-[var(--theme-text-muted)] mt-0.5">
                                  Miqdar: {item.quantity} {ingUnit} × ₼{fmtCurrency(item.unit_cost)}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-bold tabular-nums">₼{fmtCurrency(item.total_cost)}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Returned at */}
                    {detailData.return.returned_at && (
                      <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-wider font-semibold">Qaytarılma Tarixi</p>
                        <p className="text-sm mt-1">{fmtDate(detailData.return.returned_at)}</p>
                      </div>
                    )}

                    {/* Actions */}
                    {detailData.return.status === 'draft' && (
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleProcess(detailData.return.id)}
                          disabled={processingId === detailData.return.id}
                          className="flex-1 py-3 rounded-xl text-sm font-bold tracking-wide flex items-center justify-center gap-2 transition-all disabled:opacity-40 active:scale-[0.98]"
                          style={{ background: '#111111', color: '#ffffff', border: '1px solid rgba(255,255,255,0.16)' }}
                        >
                          {processingId === detailData.return.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <><Package size={15} /> Qaytarmanı Emal Et</>
                          )}
                        </button>
                        <button
                          onClick={() => setCancelConfirm(detailData.return.id)}
                          className="px-4 py-3 rounded-xl text-sm font-bold transition-all bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
                        >
                          Ləğv et
                        </button>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════
          CREATE MODAL
      ════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showCreate && (
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              className="absolute inset-0 bg-black/75 backdrop-blur-sm"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowCreate(false)}
            />
            <motion.div
              variants={modalV} initial="hidden" animate="show" exit="exit"
              className="relative z-10 w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl flex flex-col gap-0"
              style={{ background: '#0e0e0e', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="sm:hidden flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-white/15" />
              </div>

              <div className="p-6 space-y-5">
                {/* Modal header */}
                <div className="flex items-start justify-between">
                  <div>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold mb-2.5"
                      style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)', color: '#D4AF37' }}>
                      <Plus size={10} /> Yeni Qaytarma
                    </span>
                    <h2 className="text-xl font-bold">Təchizatçı qaytarması yarat</h2>
                  </div>
                  <button onClick={() => setShowCreate(false)} className="text-white/25 hover:text-white transition-colors mt-1">
                    <X size={18} />
                  </button>
                </div>

                {/* Supplier */}
                <div>
                  <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block">
                    Təchizatçı <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={formSupplier}
                    onChange={e => setFormSupplier(e.target.value)}
                    className="w-full px-4 py-3.5 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm"
                  >
                    <option value="" style={{ background: '#111' }}>Təchizatçı seçin</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id} style={{ background: '#111' }}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {/* Return Number */}
                <div>
                  <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block">
                    Qaytarma Nömrəsi <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={formReturnNumber}
                    onChange={e => setFormReturnNumber(e.target.value)}
                    placeholder="R-001"
                    className="w-full px-4 py-3.5 rounded-xl text-sm text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors"
                  />
                </div>

                {/* Items */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider">
                      Məhsullar <span className="text-red-400">*</span>
                    </label>
                    <button
                      onClick={addItem}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all active:scale-95"
                      style={{ background: 'rgba(212,175,55,0.1)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.2)' }}
                    >
                      <Plus size={11} /> Əlavə et
                    </button>
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {formItems.map((item, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="p-3 rounded-xl space-y-2"
                        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <select
                              value={item.ingredient_id}
                              onChange={e => updateItem(idx, 'ingredient_id', e.target.value)}
                              className="w-full px-3 py-2 rounded-lg text-sm text-white bg-white/[0.04] border border-white/[0.08] outline-none focus:border-[#D4AF37]/30 transition-colors"
                            >
                              <option value="" style={{ background: '#111' }}>İnqrediyent seçin</option>
                              {ingredients.map(ing => (
                                <option key={ing.id} value={ing.id} style={{ background: '#111' }}>
                                  {ing.name} ({ing.unit})
                                </option>
                              ))}
                            </select>
                          </div>
                          <button
                            onClick={() => removeItem(idx)}
                            disabled={formItems.length === 1}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-20"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <input
                              type="number" min="0" step="0.001"
                              value={item.quantity}
                              onChange={e => updateItem(idx, 'quantity', e.target.value)}
                              placeholder="Miqdar"
                              className="w-full px-3 py-2 rounded-lg text-sm text-white bg-white/[0.04] border border-white/[0.08] outline-none focus:border-[#D4AF37]/30 transition-colors"
                            />
                          </div>
                          <div>
                            <input
                              type="number" min="0" step="0.01"
                              value={item.unit_cost}
                              onChange={e => updateItem(idx, 'unit_cost', e.target.value)}
                              placeholder="Vahid qiymət"
                              className="w-full px-3 py-2 rounded-lg text-sm text-white bg-white/[0.04] border border-white/[0.08] outline-none focus:border-[#D4AF37]/30 transition-colors"
                            />
                          </div>
                        </div>
                        {parseFloat(item.quantity) > 0 && parseFloat(item.unit_cost) > 0 && (
                          <p className="text-[10px] text-[var(--theme-text-muted)] text-right">
                            Cəmi: <span className="text-white/60 font-bold">₼{fmtCurrency(parseFloat(item.quantity) * parseFloat(item.unit_cost))}</span>
                          </p>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Total */}
                <div
                  className="flex items-center justify-between px-4 py-3 rounded-xl"
                  style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.15)' }}
                >
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--theme-text-muted)]">Ümumi Məbləğ</span>
                  <span className="text-lg font-black text-[#D4AF37] tabular-nums">₼{fmtCurrency(formTotal)}</span>
                </div>

                {/* Reason */}
                <div>
                  <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block">
                    Səbəb <span className="text-white/20">— istəyə görə</span>
                  </label>
                  <textarea
                    value={formReason}
                    onChange={e => setFormReason(e.target.value)}
                    placeholder="Qaytarma səbəbi..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl text-sm text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors resize-none"
                  />
                </div>

                <button
                  onClick={handleCreate}
                  disabled={saving}
                  className="w-full py-3.5 rounded-xl text-sm font-bold tracking-wide flex items-center justify-center gap-2 transition-all disabled:opacity-40 active:scale-[0.98]"
                  style={{ background: '#111111', color: '#ffffff', border: '1px solid rgba(255,255,255,0.16)' }}
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <><ArrowLeftRight size={15} /> Qaytarmanı Yarat</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════
          CANCEL CONFIRM
      ════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {cancelConfirm && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div
              className="absolute inset-0 bg-black/75 backdrop-blur-sm"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setCancelConfirm(null)}
            />
            <motion.div
              variants={modalV} initial="hidden" animate="show" exit="exit"
              className="relative z-10 w-full max-w-sm rounded-2xl p-6 text-center space-y-4"
              style={{ background: '#0e0e0e', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center bg-red-500/10 border border-red-500/20">
                <Trash2 size={20} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Qaytarma ləğv edilsin?</h3>
                <p className="text-sm text-[var(--theme-text-secondary)] mt-1">Bu əməliyyat geri alına bilməz.</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setCancelConfirm(null)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-white/[0.08] text-[var(--theme-text-secondary)] hover:bg-white/[0.04] transition-all"
                >
                  İmtina et
                </button>
                <button
                  onClick={() => handleCancel(cancelConfirm)}
                  disabled={cancelling}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all disabled:opacity-40"
                >
                  {cancelling ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Ləğv et'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
