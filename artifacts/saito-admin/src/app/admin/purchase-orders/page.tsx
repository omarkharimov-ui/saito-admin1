'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Plus, Trash2, ChevronDown, Loader2, Search, ShoppingCart, PackageCheck,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import type {
  PurchaseOrder, PurchaseOrderStatus, CreatePurchaseOrderPayload,
  PurchaseOrderItem, Supplier,
} from '@/types/inventory';
import { PageTransition } from '@/components/PageTransition';
import { GlassCard } from '@/components/GlassCard';

// ─── Constants ───────────────────────────────────────────────────────────────

const UNITS = ['kg', 'gram', 'l', 'piece'] as const;

const STATUS_META: Record<PurchaseOrderStatus, { label: string; cls: string }> = {
  draft:    { label: 'Qaralama',  cls: 'text-amber-400/80 bg-amber-500/10 border-amber-500/20' },
  sent:     { label: 'Göndərildi', cls: 'text-blue-400 bg-blue-500/15 border-blue-500/30' },
  partial:  { label: 'Qismən',    cls: 'text-violet-400 bg-violet-500/15 border-violet-500/30' },
  received: { label: 'Alındı',    cls: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' },
  cancelled:{ label: 'Ləğv edildi', cls: 'text-red-400/80 bg-red-500/10 border-red-500/20' },
};

const STATUS_OPTIONS: PurchaseOrderStatus[] = ['draft', 'sent', 'partial', 'received', 'cancelled'];

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

function StatusBadge({ status }: { status: PurchaseOrderStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border ${m.cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
      {m.label}
    </span>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function PurchaseOrdersPage() {
  const { t } = useLanguage();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showReceive, setShowReceive] = useState<string | null>(null);
  const [receiveItems, setReceiveItems] = useState<{ id: string; product_name: string; quantity: number; unit: string; received: string }[]>([]);
  const [receiving, setReceiving] = useState(false);

  const supplierMap = useMemo(() => {
    const m = new Map<string, string>();
    suppliers.forEach(s => m.set(s.id, s.name));
    return m;
  }, [suppliers]);

  // ── Create form state ────────────────────────────────────────────────────
  const [formSupplier, setFormSupplier] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formItems, setFormItems] = useState<{
    product_name: string; quantity: string; unit: string; unit_cost: string;
  }[]>([
    { product_name: '', quantity: '', unit: 'kg', unit_cost: '' },
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
      const [ordersRes, suppliersRes] = await Promise.all([
        fetch('/api/purchase-orders'),
        fetch('/api/suppliers'),
      ]);
      if (ordersRes.ok) setOrders(await ordersRes.json());
      if (suppliersRes.ok) setSuppliers(await suppliersRes.json());
    } catch {
      toast.error('Məlumatlar yüklənərkən xəta baş verdi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Filter ───────────────────────────────────────────────────────────────
  const filteredOrders = useMemo(() => {
    if (!search.trim()) return orders;
    const q = search.toLowerCase();
    return orders.filter(o =>
      o.order_number.toLowerCase().includes(q) ||
      supplierMap.get(o.supplier_id)?.toLowerCase().includes(q) ||
      STATUS_META[o.status]?.label.toLowerCase().includes(q),
    );
  }, [orders, search, supplierMap]);

  // ── Create Order ─────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!formSupplier) { toast.error('Təchizatçı seçin'); return; }
    const validItems = formItems.filter(i => i.product_name.trim() && parseFloat(i.quantity) > 0);
    if (validItems.length === 0) { toast.error('Ən azı bir məhsul əlavə edin'); return; }

    setSaving(true);
    try {
      const payload: CreatePurchaseOrderPayload = {
        supplier_id: formSupplier,
        notes: formNotes.trim() || undefined,
        items: validItems.map(i => ({
          product_name: i.product_name.trim(),
          quantity: parseFloat(i.quantity),
          unit: i.unit,
          unit_cost: parseFloat(i.unit_cost) || 0,
        })),
      };
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('Sifariş yaradıldı');
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
    setFormNotes('');
    setFormItems([{ product_name: '', quantity: '', unit: 'kg', unit_cost: '' }]);
  };

  const addItem = () => {
    setFormItems(prev => [...prev, { product_name: '', quantity: '', unit: 'kg', unit_cost: '' }]);
  };

  const removeItem = (idx: number) => {
    setFormItems(prev => prev.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: string, value: string) => {
    setFormItems(prev => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  };

  // ── Status Update ────────────────────────────────────────────────────────
  const handleStatusUpdate = async (id: string, status: PurchaseOrderStatus) => {
    try {
      const res = await fetch(`/api/purchase-orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('Status yeniləndi');
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi');
    }
  };

  // ── Receive (Goods Receipt) ───────────────────────────────────────────────
  const openReceive = async (orderId: string) => {
    try {
      const res = await fetch(`/api/purchase-orders/${orderId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const items: PurchaseOrderItem[] = data.items || [];
      setReceiveItems(items.map(i => ({
        id: i.id,
        product_name: i.product_name,
        quantity: i.quantity,
        unit: i.unit,
        received: String(i.received_quantity || 0),
      })));
      setShowReceive(orderId);
    } catch {
      toast.error('Məhsullar yüklənərkən xəta');
    }
  };

  const handleReceive = async () => {
    if (!showReceive) return;
    setReceiving(true);
    try {
      const items = receiveItems.map(i => ({
        id: i.id,
        received_quantity: parseFloat(i.received) || 0,
      }));
      const res = await fetch('/api/goods-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchaseOrderId: showReceive, items }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('Mallar qəbul edildi');
      setShowReceive(null);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Xəta');
    } finally {
      setReceiving(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/purchase-orders/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('Sifariş silindi');
      setDeleteConfirm(null);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi');
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
              <ShoppingCart size={20} className="text-[#D4AF37]" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-serif font-bold tracking-tight leading-none">
                Satınalma Sifarişləri
              </h1>
              <p className="text-[11px] text-[var(--theme-text-muted)] uppercase tracking-[0.2em] mt-1">
                Purchase Orders
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold tracking-wide transition-all active:scale-[0.97]"
            style={{ background: '#111111', color: '#ffffff', border: '1px solid rgba(255,255,255,0.16)' }}
          >
            <Plus size={15} /> Yeni Sifariş
          </button>
        </motion.div>

        {/* ── Search ── */}
        <div className="relative max-w-xs">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)] pointer-events-none" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Sifariş axtar..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm bg-white/[0.04] border border-white/[0.08] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none focus:border-[#D4AF37]/30 transition-colors"
          />
        </div>

        {/* ── Table ── */}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 size={28} className="animate-spin text-white/15" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <GlassCard intensity="light" padding="xl" className="text-center">
            <ShoppingCart size={44} className="mx-auto mb-4 opacity-20 text-[var(--theme-text-muted)]" />
            <p className="text-sm font-medium text-[var(--theme-text-secondary)]">
              {search ? 'Axtarış nəticəsi tapılmadı' : 'Hələ sifariş yaradılmayıb'}
            </p>
            {!search && (
              <div className="mt-4 space-y-2 text-xs text-[var(--theme-text-muted)]">
                <p>"Yeni Sifariş" düyməsi ilə ilk satınalma sifarişini yaradın</p>
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
                gridTemplateColumns: '1fr 1fr 100px 110px 140px 140px 100px',
                background: 'rgba(255,255,255,0.018)',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <span>Sifariş №</span>
              <span>Təchizatçı</span>
              <span>Status</span>
              <span className="text-right">Məbləğ</span>
              <span className="text-right">Sifariş Tarixi</span>
              <span className="text-right">Qəbul Tarixi</span>
              <span className="text-right">Əməliyyat</span>
            </div>

            {filteredOrders.map((order, i) => {
              const supplierName = supplierMap.get(order.supplier_id) || 'Naməlum';
              return (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="group px-4 lg:px-6 py-4 transition-colors hover:bg-white/[0.018]"
                  style={{ borderBottom: i < filteredOrders.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                >
                  {/* Desktop row */}
                  <div
                    className="hidden lg:grid gap-4 items-center"
                    style={{ gridTemplateColumns: '1fr 1fr 100px 110px 140px 140px 100px' }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{order.order_number}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-[var(--theme-text-secondary)] truncate">{supplierName}</p>
                    </div>
                    <div>
                      <StatusBadge status={order.status} />
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold tabular-nums">₼{fmtCurrency(order.total_amount)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-[var(--theme-text-secondary)]">{fmtDate(order.ordered_at)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-[var(--theme-text-secondary)]">{fmtDate(order.received_at)}</span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-1">
                      {(order.status === 'sent' || order.status === 'partial') && (
                        <button
                          onClick={() => openReceive(order.id)}
                          className="w-7 h-7 rounded-lg hover:bg-emerald-500/10 transition-all flex items-center justify-center text-[var(--theme-text-muted)] hover:text-emerald-400"
                          title="Qəbul et"
                        >
                          <PackageCheck size={13} />
                        </button>
                      )}
                      <div className="relative group/drop">
                        <button className="w-7 h-7 rounded-lg hover:bg-white/[0.06] transition-all flex items-center justify-center text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]">
                          <ChevronDown size={13} />
                        </button>
                        <div className="absolute right-0 top-full mt-1 z-50 min-w-[150px] rounded-xl overflow-hidden opacity-0 invisible group-hover/drop:opacity-100 group-hover/drop:visible transition-all duration-150"
                          style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 12px 40px rgba(0,0,0,0.6)' }}
                        >
                          {STATUS_OPTIONS.map(s => (
                            <button
                              key={s}
                              onClick={() => handleStatusUpdate(order.id, s)}
                              className={`w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-left transition-colors hover:bg-white/[0.05] ${s === order.status ? STATUS_META[s].cls : 'text-white/60'}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full bg-current opacity-60`} />
                              {STATUS_META[s].label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={() => setDeleteConfirm(order.id)}
                        className="w-7 h-7 rounded-lg hover:bg-red-500/10 transition-all flex items-center justify-center text-[var(--theme-text-muted)] hover:text-red-400"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Mobile card */}
                  <div className="lg:hidden space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{order.order_number}</p>
                        <p className="text-xs text-[var(--theme-text-secondary)] mt-0.5">{supplierName}</p>
                      </div>
                      <StatusBadge status={order.status} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-[var(--theme-text-muted)]">
                        <p>Sifariş: {fmtDate(order.ordered_at)}</p>
                        {order.received_at && <p>Qəbul: {fmtDate(order.received_at)}</p>}
                      </div>
                      <span className="text-sm font-bold tabular-nums">₼{fmtCurrency(order.total_amount)}</span>
                    </div>
                    <div className="flex gap-2">
                      {(order.status === 'sent' || order.status === 'partial') && (
                        <button
                          onClick={() => openReceive(order.id)}
                          className="px-3 py-2 rounded-xl text-xs font-bold transition-all bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                        >
                          <PackageCheck size={13} />
                        </button>
                      )}
                      {/* Status dropdown (mobile: inline select) */}{' '}
                      <select
                        value={order.status}
                        onChange={e => handleStatusUpdate(order.id, e.target.value as PurchaseOrderStatus)}
                        className="flex-1 px-3 py-2 rounded-xl text-xs font-bold bg-white/[0.04] border border-white/[0.08] text-[var(--theme-text)] outline-none"
                      >
                        {STATUS_OPTIONS.map(s => (
                          <option key={s} value={s}>{STATUS_META[s].label}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => setDeleteConfirm(order.id)}
                        className="px-3 py-2 rounded-xl text-xs font-bold transition-all bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
                      >
                        <Trash2 size={13} />
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
                      <Plus size={10} /> Yeni Sifariş
                    </span>
                    <h2 className="text-xl font-bold">Satınalma sifarişi yarat</h2>
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
                            <input
                              value={item.product_name}
                              onChange={e => updateItem(idx, 'product_name', e.target.value)}
                              placeholder="Məhsul adı"
                              className="w-full px-3 py-2 rounded-lg text-sm text-white bg-white/[0.04] border border-white/[0.08] outline-none focus:border-[#D4AF37]/30 transition-colors"
                            />
                          </div>
                          <button
                            onClick={() => removeItem(idx)}
                            disabled={formItems.length === 1}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-20"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
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
                            <select
                              value={item.unit}
                              onChange={e => updateItem(idx, 'unit', e.target.value)}
                              className="w-full px-3 py-2 rounded-lg text-sm text-white bg-white/[0.04] border border-white/[0.08] outline-none focus:border-[#D4AF37]/30 transition-colors"
                            >
                              {UNITS.map(u => (
                                <option key={u} value={u} style={{ background: '#111' }}>{u}</option>
                              ))}
                            </select>
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

                {/* Notes */}
                <div>
                  <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block">
                    Qeyd <span className="text-white/20">— istəyə görə</span>
                  </label>
                  <textarea
                    value={formNotes}
                    onChange={e => setFormNotes(e.target.value)}
                    placeholder="Məs: Çatdırılma qeydləri..."
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
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <><ShoppingCart size={15} /> Sifarişi Yarat</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════
          DELETE CONFIRM
      ════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div
              className="absolute inset-0 bg-black/75 backdrop-blur-sm"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirm(null)}
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
                <h3 className="text-lg font-bold">Sifariş silinsin?</h3>
                <p className="text-sm text-[var(--theme-text-secondary)] mt-1">Bu əməliyyat geri alına bilməz.</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-white/[0.08] text-[var(--theme-text-secondary)] hover:bg-white/[0.04] transition-all"
                >
                  Ləğv et
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all"
                >
                  Sil
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════
          RECEIVE MODAL (Goods Receipt Note)
      ════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showReceive && (
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              className="absolute inset-0 bg-black/75 backdrop-blur-sm"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowReceive(null)}
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
                <div className="flex items-start justify-between">
                  <div>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold mb-2.5"
                      style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981' }}>
                      <PackageCheck size={10} /> Mal Qəbulu
                    </span>
                    <h2 className="text-xl font-bold">Tədarükün qəbulu</h2>
                    <p className="text-sm text-[var(--theme-text-muted)] mt-1">Qəbul edilən miqdarları daxil edin</p>
                  </div>
                  <button onClick={() => setShowReceive(null)} className="text-white/25 hover:text-white transition-colors mt-1">
                    <X size={18} />
                  </button>
                </div>

                {/* Items */}
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {receiveItems.map((item) => (
                    <div key={item.id}
                      className="p-3 rounded-xl flex items-center gap-3"
                      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.product_name}</p>
                        <p className="text-[10px] text-[var(--theme-text-muted)] mt-0.5">
                          Sifariş: {item.quantity} {item.unit}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[var(--theme-text-muted)] whitespace-nowrap">Qəbul:</span>
                        <input
                          type="number" min="0" step="0.001"
                          value={item.received}
                          onChange={e => setReceiveItems(prev =>
                            prev.map(i => i.id === item.id ? { ...i, received: e.target.value } : i)
                          )}
                          className="w-20 px-3 py-2 rounded-lg text-sm text-white bg-white/[0.04] border border-white/[0.08] outline-none focus:border-emerald-500/40 transition-colors text-right tabular-nums"
                        />
                        <span className="text-[10px] text-[var(--theme-text-muted)]">{item.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleReceive}
                  disabled={receiving}
                  className="w-full py-3.5 rounded-xl text-sm font-bold tracking-wide flex items-center justify-center gap-2 transition-all disabled:opacity-40 active:scale-[0.98]"
                  style={{ background: '#065f46', color: '#ffffff' }}
                >
                  {receiving ? <Loader2 size={16} className="animate-spin" /> : <><PackageCheck size={15} /> Qəbulu Təsdiq Et</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
