'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trash2, ChevronDown, Loader2, ArrowLeftRight, Package,
} from '@/components/ui/saito-icons';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import type {
  SupplierReturn, SupplierReturnItem, Ingredient, Supplier,
} from '@/types/inventory';
import { PageTransition } from '@/components/PageTransition';
// 13j: design system (one visual language across the inventory module)
import { Btn, Chip, DataTable, SearchInput, IconBtn, SpinnerBlock, Modal, Field, fieldCls } from '../stock-ui';

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Qaralama',  cls: 'text-zinc-400/80 bg-zinc-500/10 border-zinc-500/20' },
  sent:      { label: 'Göndərildi', cls: 'text-blue-400 bg-blue-500/15 border-blue-500/30' },
  completed: { label: 'Tamamlandı', cls: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' },
  cancelled: { label: 'Ləğv edildi', cls: 'text-red-400/80 bg-red-500/10 border-red-500/20' },
};
const RET_CHIP_TONE: Record<string, 'ok' | 'warn' | 'crit' | 'info' | 'neutral'> = {
  draft: 'neutral', sent: 'info', completed: 'ok', cancelled: 'crit',
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
  // 13h: hub frame provides page chrome — slim toolbar only.
  return (
    <PageTransition className="">
      <div className="space-y-5">

        {/* ── Toolbar (13j: design system) ── */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Qaytarma axtar..." className="flex-1 max-w-sm" />
          <div className="sm:ml-auto flex items-center justify-end">
            <Btn variant="solid" icon={Plus} onClick={() => setShowCreate(true)}>Yeni Qaytarma</Btn>
          </div>
        </div>

        {/* ── Table (13j: DataTable) ── */}
        {loading ? (
          <SpinnerBlock height={240} />
        ) : (
          <DataTable
            rows={filteredReturns.map(r => ({
              ...r,
              supplier_name: supplierMap.get(r.supplier_id) || 'Naməlum',
              __actions: (
                <>
                  {r.status === 'draft' && (
                    <>
                      <IconBtn icon={processingId === r.id ? Loader2 : Package} title="Emal et" tone="emerald" onClick={() => handleProcess(r.id)} />
                      <IconBtn icon={Trash2} title="Ləğv et" tone="rose" onClick={() => setCancelConfirm(r.id)} />
                    </>
                  )}
                  <IconBtn icon={ChevronDown} title="Detal" tone="neutral" onClick={() => openDetail(r.id)} />
                </>
              ),
            }))}
            rowKey={r => r.id}
            onRow={r => openDetail(r.id)}
            actionsWidth={100}
            cols={[
              { key: 'num', label: 'Qaytarma №', width: '1.4fr', render: r => <span className="text-[13px] font-bold text-[var(--theme-text)] truncate">{r.return_number}</span> },
              { key: 'supplier', label: 'Təchizatçı', width: '1.2fr', render: r => <span className="text-[13px] text-[var(--theme-text-secondary)] truncate">{r.supplier_name}</span> },
              { key: 'status', label: 'Status', width: '120px', render: r => <Chip tone={RET_CHIP_TONE[r.status] || 'neutral'}>{STATUS_META[r.status]?.label || r.status}</Chip> },
              { key: 'amount', label: 'Məbləğ', width: '90px', align: 'right', render: r => <span className="text-[13px] font-black tabular-nums text-[var(--theme-text)]">₼{fmtCurrency(r.total_amount)}</span> },
              { key: 'date', label: 'Tarix', width: '150px', hide: 'md', align: 'right', render: r => <span className="text-xs text-[var(--theme-text-secondary)] tabular-nums">{fmtDate(r.created_at)}</span> },
            ]}
            empty={
              <div className="py-12 text-center">
                <ArrowLeftRight size={36} className="mx-auto mb-3 opacity-25 text-[var(--theme-text-muted)]" />
                <p className="text-sm font-medium text-[var(--theme-text-secondary)]">
                  {search ? 'Axtarış nəticəsi tapılmadı' : 'Hələ qaytarma yaradılmayıb'}
                </p>
                {!search && <p className="text-xs text-[var(--theme-text-muted)] mt-2">&ldquo;Yeni Qaytarma&rdquo; düyməsi ilə ilk təchizatçı qaytarmasını yaradın</p>}
              </div>
            }
          />
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════
          DETAIL MODAL (13j: design-system Modal)
      ════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {detailId && (
          <Modal
            title={detailData ? detailData.return.return_number : 'Qaytarma detalı'}
            subtitle={detailData ? (supplierMap.get(detailData.return.supplier_id) || 'Naməlum Təchizatçı') : 'Yüklənir...'}
            onClose={closeDetail}
          >
            {detailLoading ? (
              <SpinnerBlock height={160} />
            ) : detailData ? (
              <div className="space-y-4">
                <Chip tone={RET_CHIP_TONE[detailData.return.status] || 'neutral'}>
                  {STATUS_META[detailData.return.status]?.label || detailData.return.status}
                </Chip>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--theme-text-muted)]">Tarix</p>
                    <p className="text-sm font-semibold text-[var(--theme-text)] mt-1">{fmtDate(detailData.return.created_at)}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--theme-text-muted)]">Ümumi Məbləğ</p>
                    <p className="text-sm font-black tabular-nums text-[var(--theme-text)] mt-1">₼{fmtCurrency(detailData.return.total_amount)}</p>
                  </div>
                </div>

                {detailData.return.reason && (
                  <div className="p-3 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--theme-text-muted)]">Səbəb</p>
                    <p className="text-sm text-[var(--theme-text-secondary)] mt-1">{detailData.return.reason}</p>
                  </div>
                )}

                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--theme-text-muted)] mb-2">
                    Məhsullar ({detailData.items.length})
                  </p>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {detailData.items.map((item, idx) => {
                      const ingName = (item as any).ingredient_name || ingredientMap.get(item.ingredient_id)?.name || 'Naməlum';
                      const ingUnit = (item as any).ingredient_unit || ingredientMap.get(item.ingredient_id)?.unit || 'ədəd';
                      return (
                        <div key={item.id || idx} className="p-3 rounded-xl flex items-center gap-3 bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-[var(--theme-text)] truncate">{ingName}</p>
                            <p className="text-[10px] text-[var(--theme-text-muted)] mt-0.5">
                              Miqdar: {item.quantity} {ingUnit} × ₼{fmtCurrency(item.unit_cost)}
                            </p>
                          </div>
                          <p className="shrink-0 text-[13px] font-black tabular-nums text-[var(--theme-text)]">₼{fmtCurrency(item.total_cost)}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {detailData.return.returned_at && (
                  <div className="p-3 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--theme-text-muted)]">Qaytarılma Tarixi</p>
                    <p className="text-sm text-[var(--theme-text-secondary)] mt-1">{fmtDate(detailData.return.returned_at)}</p>
                  </div>
                )}

                {detailData.return.status === 'draft' && (
                  <div className="flex gap-3 pt-1">
                    <Btn variant="solid" className="flex-1" icon={processingId === detailData.return.id ? Loader2 : Package}
                      onClick={() => handleProcess(detailData.return.id)} disabled={processingId === detailData.return.id}>
                      Qaytarmanı Emal Et
                    </Btn>
                    <Btn variant="danger" onClick={() => setCancelConfirm(detailData.return.id)}>Ləğv et</Btn>
                  </div>
                )}
              </div>
            ) : null}
          </Modal>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════
          CREATE MODAL (13j: design-system Modal)
      ════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showCreate && (
          <Modal title="Təchizatçı qaytarması yarat" subtitle="Yeni qaytarma" onClose={() => setShowCreate(false)}>
            <div className="space-y-4">
              <Field label="Təchizatçı *">
                <select value={formSupplier} onChange={e => setFormSupplier(e.target.value)} className={fieldCls}>
                  <option value="">Təchizatçı seçin</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>

              <Field label="Qaytarma Nömrəsi *">
                <input value={formReturnNumber} onChange={e => setFormReturnNumber(e.target.value)} placeholder="R-001" className={fieldCls} />
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
                        <select value={item.ingredient_id} onChange={e => updateItem(idx, 'ingredient_id', e.target.value)} className={`${fieldCls} flex-1 min-w-0`}>
                          <option value="">İnqrediyent seçin</option>
                          {ingredients.map(ing => <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>)}
                        </select>
                        <button
                          onClick={() => removeItem(idx)}
                          disabled={formItems.length === 1}
                          className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-[var(--theme-text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-all active:scale-90 disabled:opacity-20"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="number" min="0" step="0.001" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} placeholder="Miqdar" className={fieldCls} />
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

              <Field label="Səbəb — istəyə görə">
                <textarea value={formReason} onChange={e => setFormReason(e.target.value)} placeholder="Qaytarma səbəbi..." rows={3} className={`${fieldCls} resize-none`} />
              </Field>

              <Btn variant="solid" icon={saving ? Loader2 : ArrowLeftRight} onClick={handleCreate} disabled={saving} className="w-full">
                Qaytarmanı Yarat
              </Btn>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* 13j: design-system confirm */}
      <AnimatePresence>
        {cancelConfirm && (
          <Modal title="Qaytarma ləğv edilsin?" subtitle="Bu əməliyyat geri alına bilməz" onClose={() => setCancelConfirm(null)}>
            <div className="space-y-5">
              <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center bg-rose-500/10 border border-rose-500/25">
                <Trash2 size={20} className="text-rose-500" />
              </div>
              <div className="flex gap-3">
                <Btn variant="ghost" className="flex-1" onClick={() => setCancelConfirm(null)}>İmtina et</Btn>
                <Btn variant="danger" className="flex-1" icon={cancelling ? Loader2 : undefined} onClick={() => handleCancel(cancelConfirm)} disabled={cancelling}>
                  Ləğv et
                </Btn>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
