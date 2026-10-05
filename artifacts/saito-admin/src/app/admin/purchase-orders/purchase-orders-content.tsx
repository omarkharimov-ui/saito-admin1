'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trash2, Loader2, ShoppingCart, PackageCheck,
} from '@/components/ui/saito-icons';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import type {
  PurchaseOrder, PurchaseOrderStatus, CreatePurchaseOrderPayload,
  PurchaseOrderItem, Supplier,
} from '@/types/inventory';
import { PageTransition } from '@/components/PageTransition';
// 13j: design system (one visual language across the inventory module)
import { Btn, Chip, DataTable, SearchInput, IconBtn, SpinnerBlock, Modal, Field, fieldCls } from '../stock/stock-ui';

const PO_CHIP_TONE: Record<string, 'ok' | 'warn' | 'crit' | 'info' | 'neutral'> = {
  draft: 'warn', sent: 'info', partial: 'neutral', received: 'ok', cancelled: 'crit',
};

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
  // 13h (Apple minimalizm): the Stok hub frame provides the page chrome —
  // no full-screen wrapper, no ambient glow, no own hero. Slim toolbar only.
  return (
    <PageTransition className="">
      <div className="space-y-5">

        {/* ── Toolbar (13j: design system) ── */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Sifariş axtar..." className="flex-1 max-w-sm" />
          <div className="sm:ml-auto flex items-center justify-end">
            <Btn variant="solid" icon={Plus} onClick={() => setShowCreate(true)}>Yeni Sifariş</Btn>
          </div>
        </div>

        {/* ── Table (13j: DataTable — one design language) ── */}
        {loading ? (
          <SpinnerBlock height={240} />
        ) : (
          <DataTable
            rows={filteredOrders.map(order => ({
              ...order,
              supplier_name: supplierMap.get(order.supplier_id) || 'Naməlum',
              __actions: (
                <>
                  {(order.status === 'sent' || order.status === 'partial') && (
                    <IconBtn icon={PackageCheck} title="Qəbul et" tone="emerald" onClick={() => openReceive(order.id)} />
                  )}
                  <select
                    value={order.status}
                    onClick={e => e.stopPropagation()}
                    onChange={e => handleStatusUpdate(order.id, e.target.value as PurchaseOrderStatus)}
                    className="h-8 px-1.5 rounded-lg text-[10px] font-bold bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-[var(--theme-text-secondary)] outline-none hover:text-[var(--theme-text)] transition-colors cursor-pointer"
                    title="Status dəyiş"
                  >
                    {STATUS_OPTIONS.map(s => (
                      <option key={s} value={s}>{STATUS_META[s].label}</option>
                    ))}
                  </select>
                  <IconBtn icon={Trash2} title="Sil" tone="rose" onClick={() => setDeleteConfirm(order.id)} />
                </>
              ),
            }))}
            rowKey={r => r.id}
            actionsWidth={120}
            cols={[
              {
                key: 'num', label: 'Sifariş №', width: '1.5fr',
                render: r => (
                  <div className="min-w-0 flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-bold text-[var(--theme-text)] truncate tabular-nums">{r.order_number}</span>
                    {r.recurring_weekly && <Chip tone="info" dot={false}>Həftəlik</Chip>}
                    {r.order_number?.startsWith('RECUR-') && <Chip tone="neutral" dot={false}>cron</Chip>}
                  </div>
                ),
              },
              { key: 'supplier', label: 'Təchizatçı', width: '1.2fr', render: r => <span className="text-[13px] text-[var(--theme-text-secondary)] truncate">{r.supplier_name}</span> },
              {
                key: 'status', label: 'Status', width: '110px',
                render: r => <Chip tone={PO_CHIP_TONE[r.status] || 'neutral'}>{STATUS_META[r.status]?.label || r.status}</Chip>,
              },
              {
                key: 'amount', label: 'Məbləğ', width: '90px', align: 'right',
                render: r => <span className="text-[13px] font-black tabular-nums text-[var(--theme-text)]">₼{fmtCurrency(r.total_amount)}</span>,
              },
              {
                key: 'dates', label: 'Tarixlər', width: '150px', hide: 'md',
                render: r => (
                  <div className="text-[11px] text-[var(--theme-text-muted)] tabular-nums leading-relaxed">
                    <p>Sif: {fmtDate(r.ordered_at)}</p>
                    <p>Qəb: {fmtDate(r.received_at)}</p>
                  </div>
                ),
              },
            ]}
            empty={
              <div className="py-12 text-center">
                <ShoppingCart size={36} className="mx-auto mb-3 opacity-25 text-[var(--theme-text-muted)]" />
                <p className="text-sm font-medium text-[var(--theme-text-secondary)]">
                  {search ? 'Axtarış nəticəsi tapılmadı' : 'Hələ sifariş yaradılmayıb'}
                </p>
                {!search && <p className="text-xs text-[var(--theme-text-muted)] mt-2">&ldquo;Yeni Sifariş&rdquo; düyməsi ilə ilk satınalma sifarişini yaradın</p>}
              </div>
            }
          />
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════
          CREATE MODAL (13j: design-system Modal)
      ════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showCreate && (
          <Modal title="Satınalma sifarişi yarat" subtitle="Yeni sifariş" onClose={() => setShowCreate(false)}>
            <div className="space-y-4">
              <Field label="Təchizatçı *">
                <select value={formSupplier} onChange={e => setFormSupplier(e.target.value)} className={fieldCls}>
                  <option value="">Təchizatçı seçin</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="block text-[9px] font-black uppercase tracking-[0.18em] text-[var(--theme-text-muted)] ml-1">Məhsullar *</span>
                  <Btn variant="ghost" small icon={Plus} onClick={addItem}>Əlavə et</Btn>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {formItems.map((item, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="p-3 rounded-xl space-y-2 bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          value={item.product_name}
                          onChange={e => updateItem(idx, 'product_name', e.target.value)}
                          placeholder="Məhsul adı"
                          className={`${fieldCls} flex-1 min-w-0`}
                        />
                        <button
                          onClick={() => removeItem(idx)}
                          disabled={formItems.length === 1}
                          className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-[var(--theme-text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-all active:scale-90 disabled:opacity-20"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <input type="number" min="0" step="0.001" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} placeholder="Miqdar" className={fieldCls} />
                        <select value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} className={fieldCls}>
                          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                        <input type="number" min="0" step="0.01" value={item.unit_cost} onChange={e => updateItem(idx, 'unit_cost', e.target.value)} placeholder="Vahid qiymət" className={fieldCls} />
                      </div>
                      {parseFloat(item.quantity) > 0 && parseFloat(item.unit_cost) > 0 && (
                        <p className="text-[10px] text-[var(--theme-text-muted)] text-right">
                          Cəmi: <span className="font-bold text-[var(--theme-text-secondary)]">₼{fmtCurrency(parseFloat(item.quantity) * parseFloat(item.unit_cost))}</span>
                        </p>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
                <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--theme-text-muted)]">Ümumi Məbləğ</span>
                <span className="text-lg font-black tabular-nums text-[var(--theme-text)]">₼{fmtCurrency(formTotal)}</span>
              </div>

              <Field label="Qeyd — istəyə görə">
                <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Məs: Çatdırılma qeydləri..." rows={3} className={`${fieldCls} resize-none`} />
              </Field>

              <Btn variant="solid" icon={saving ? Loader2 : ShoppingCart} onClick={handleCreate} disabled={saving} className="w-full">
                Sifarişi Yarat
              </Btn>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* 13j: design-system confirm */}
      <AnimatePresence>
        {deleteConfirm && (
          <Modal title="Sifariş silinsin?" subtitle="Bu əməliyyat geri alına bilməz" onClose={() => setDeleteConfirm(null)}>
            <div className="space-y-5">
              <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center bg-rose-500/10 border border-rose-500/25">
                <Trash2 size={20} className="text-rose-500" />
              </div>
              <div className="flex gap-3">
                <Btn variant="ghost" className="flex-1" onClick={() => setDeleteConfirm(null)}>Ləğv et</Btn>
                <Btn variant="danger" className="flex-1" onClick={() => handleDelete(deleteConfirm)}>Sil</Btn>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════
          RECEIVE MODAL (13j: design-system Modal)
      ════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showReceive && (
          <Modal title="Tədarükün qəbulu" subtitle="Qəbul edilən miqdarları daxil edin" onClose={() => setShowReceive(null)}>
            <div className="space-y-4">
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {receiveItems.map((item) => (
                  <div key={item.id} className="p-3 rounded-xl flex items-center gap-3 bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[var(--theme-text)] truncate">{item.product_name}</p>
                      <p className="text-[10px] text-[var(--theme-text-muted)] mt-0.5">Sifariş: {item.quantity} {item.unit}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-bold text-[var(--theme-text-muted)]">Qəbul:</span>
                      <input
                        type="number" min="0" step="0.001"
                        value={item.received}
                        onChange={e => setReceiveItems(prev =>
                          prev.map(i => i.id === item.id ? { ...i, received: e.target.value } : i)
                        )}
                        className="w-20 px-2.5 py-2 rounded-lg text-sm text-[var(--theme-text)] bg-[var(--theme-bg)] border border-[var(--theme-border)] outline-none focus:border-emerald-500/50 transition-colors text-right tabular-nums"
                      />
                      <span className="text-[10px] text-[var(--theme-text-muted)]">{item.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
              <Btn variant="success" icon={receiving ? Loader2 : PackageCheck} onClick={handleReceive} disabled={receiving} className="w-full">
                Qəbulu Təsdiq Et
              </Btn>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
