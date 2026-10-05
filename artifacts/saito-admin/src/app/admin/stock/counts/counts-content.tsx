'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardCheck, Plus, Loader2, ChevronDown,
  Play, CheckCircle2, Ban, Save,
} from '@/components/ui/saito-icons';
import { toast } from '@/lib/toast';
import type { StockCount, StockCountItem } from '@/types/inventory';
import { PageTransition } from '@/components/PageTransition';
import { useCountOfflineQueue } from './useCountOfflineQueue';
// 13j: design system (one visual language across the inventory module)
import { Btn, Chip, DataTable, SearchInput, SpinnerBlock, Card, SectionHead, Field, fieldCls, Modal } from '../stock-ui';

// ─── Constants ───────────────────────────────────────────────────────────────

type StockCountStatus = 'draft' | 'in_progress' | 'completed' | 'cancelled';

const COUNT_LABELS: Record<StockCountStatus, string> = {
  draft: 'Qaralama', in_progress: 'Davam edir', completed: 'Tamamlandı', cancelled: 'Ləğv edildi',
};
const COUNT_CHIP_TONE: Record<StockCountStatus, 'neutral' | 'info' | 'ok' | 'crit' | 'warn'> = {
  draft: 'neutral', in_progress: 'info', completed: 'ok', cancelled: 'crit',
};

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

export default function StockCountsPage() {
  const [counts, setCounts] = useState<StockCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  // Expanded detail state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<{
    count: StockCount;
    items: (StockCountItem & { ingredient_name?: string; unit?: string })[];
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Create form
  const [formCountNumber, setFormCountNumber] = useState('');
  const [formNotes, setFormNotes] = useState('');
  // 13c: staff assignment (Toast parity) — who physically runs the count.
  const [formAssignedTo, setFormAssignedTo] = useState('');

  // 13c: offline stocktake buffer — entries recorded offline are replayed
  // on reconnect (KDS offline-queue pattern, 12u).
  const { queued, replaying, enqueue, replay } = useCountOfflineQueue();

  // Add-item form (inside detail)
  const [addIngredientId, setAddIngredientId] = useState('');
  const [addActualQty, setAddActualQty] = useState('');
  const [ingredients, setIngredients] = useState<{ id: string; name: string; unit: string }[]>([]);
  const [ingredientsLoading, setIngredientsLoading] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const ingredientMap = useMemo(() => {
    const m = new Map<string, string>();
    ingredients.forEach(i => m.set(i.id, i.name));
    return m;
  }, [ingredients]);

  // ── Data fetching ────────────────────────────────────────────────────────
  const fetchCounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/stock/counts');
      if (res.ok) setCounts(await res.json());
    } catch {
      toast.error('Sayımlar yüklənərkən xəta baş verdi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailData(null);
    try {
      const res = await fetch(`/api/stock/counts/${id}`);
      if (res.ok) {
        const data = await res.json();
        setDetailData({
          count: data,
          items: data.items || [],
        });
      }
    } catch {
      toast.error('Sayım detalları yüklənərkən xəta');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const fetchIngredients = useCallback(async () => {
    setIngredientsLoading(true);
    try {
      const res = await fetch('/api/stock/ingredients');
      if (res.ok) setIngredients(await res.json());
    } catch {
      toast.error('İnqrediyentlər yüklənərkən xəta');
    } finally {
      setIngredientsLoading(false);
    }
  }, []);

  const handleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetailData(null);
    } else {
      setExpandedId(id);
      fetchDetail(id);
      if (ingredients.length === 0) fetchIngredients();
    }
  };

  // ── Filter ───────────────────────────────────────────────────────────────
  const filteredCounts = useMemo(() => {
    if (!search.trim()) return counts;
    const q = search.toLowerCase();
    return counts.filter(c =>
      c.count_number.toLowerCase().includes(q) ||
       COUNT_LABELS[c.status]?.toLowerCase().includes(q) ||
      (c.counted_by && c.counted_by.toLowerCase().includes(q)),
    );
  }, [counts, search]);

  // 13j: the single expanded row (detail panel below the table)
  const expandedCount = useMemo(() => counts.find(c => c.id === expandedId) ?? null, [counts, expandedId]);

  // ── Create Count ─────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!formCountNumber.trim()) { toast.error('Sayım nömrəsi daxil edin'); return; }
    setSaving(true);
    try {
       const res = await fetch('/api/stock/counts', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           count_number: formCountNumber.trim(),
           notes: formNotes.trim() || undefined,
           assigned_to: formAssignedTo.trim() || undefined,
         }),
       });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('Sayım yaradıldı');
      setShowCreate(false);
      setFormCountNumber('');
      setFormNotes('');
      setFormAssignedTo('');
      fetchCounts();
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi');
    } finally {
      setSaving(false);
    }
  };

  // ── Status Update ────────────────────────────────────────────────────────
  const handleStatusUpdate = async (id: string, status: StockCountStatus) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/stock/counts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('Status yeniləndi');
      fetchCounts();
      if (expandedId === id) fetchDetail(id);
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi');
    } finally {
      setActionLoading(null);
    }
  };

  // ── Apply Count ──────────────────────────────────────────────────────────
  const handleApply = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch('/api/stock/apply-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count_id: id }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('Sayım tətbiq edildi');
      fetchCounts();
      if (expandedId === id) fetchDetail(id);
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi');
    } finally {
      setActionLoading(null);
    }
  };

  // ── Add Item ─────────────────────────────────────────────────────────────
  // 13c: network failure (fetch throws / device offline) → the entry is
  // buffered in the offline queue instead of being lost. A server-level
  // rejection (4xx) is still surfaced as an error.
  const handleAddItem = async () => {
    if (!expandedId || !addIngredientId) { toast.error('İnqrediyent seçin'); return; }
    const qty = parseFloat(addActualQty);
    if (isNaN(qty)) { toast.error('Faktiki miqdar daxil edin'); return; }
    setAddingItem(true);
    try {
      const res = await fetch(`/api/stock/counts/${expandedId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredient_id: addIngredientId,
          actual_qty: qty,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      toast.success('Məhsul əlavə edildi');
      setAddIngredientId('');
      setAddActualQty('');
      fetchDetail(expandedId);
    } catch (e: any) {
      const offline = e instanceof TypeError || navigator.onLine === false;
      if (offline) {
        enqueue(expandedId, addIngredientId, qty);
        toast.success('Offline: sayım lokal yadda saxlanıldı — bağlantı qayıdanda avtomatik göndərıləcək');
        setAddIngredientId('');
        setAddActualQty('');
      } else {
        toast.error(e.message || 'Xəta baş verdi');
      }
    } finally {
      setAddingItem(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  // 13h: hub frame provides page chrome — slim toolbar only.
  return (
    <PageTransition className="">
      <div className="space-y-5">

        {/* ── Toolbar (13j: design system) ── */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Sayım axtar..." className="flex-1 max-w-sm" />
          <div className="sm:ml-auto flex items-center justify-end">
            <Btn variant="solid" icon={Plus} onClick={() => setShowCreate(true)}>Yeni Sayım</Btn>
          </div>
        </div>

        {/* 13c: offline stocktake queue banner (13j: theme-var restyle) */}
        {queued.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-500/[0.06] border border-amber-500/25">
            <p className="text-xs font-medium text-amber-500 light:text-amber-700">
              {queued.length} sayım elementi çəkdən gözləyir (offline)
            </p>
            <Btn variant="soft" small icon={replaying ? Loader2 : Play} onClick={() => void replay()} disabled={replaying}>
              İndi göndər
            </Btn>
          </div>
        )}

        {/* ── List (13j: DataTable + single detail panel below) ── */}
        {loading ? (
          <SpinnerBlock height={240} />
        ) : (
          <>
            <DataTable
              rows={filteredCounts.map(count => ({
                ...count,
                __actions: null as unknown as React.ReactNode,
              }))}
              rowKey={r => r.id}
              onRow={r => handleExpand(r.id)}
              rowClass={r => (expandedId === r.id ? 'bg-[var(--theme-surface-soft)]/60' : '')}
              actionsWidth={0}
              cols={[
                {
                  key: 'num', label: 'Sayım №', width: '1.6fr',
                  render: r => (
                    <div className="min-w-0 flex items-center gap-2.5 flex-wrap">
                      <ChevronDown size={13} className={`shrink-0 text-[var(--theme-text-muted)] transition-transform duration-200 ${expandedId === r.id ? 'rotate-180' : ''}`} />
                      <span className="text-[13px] font-bold text-[var(--theme-text)] truncate">{r.count_number}</span>
                      {r.assigned_to && <Chip tone="info" dot={false}>Təyin: {r.assigned_to}</Chip>}
                    </div>
                  ),
                },
                {
                  key: 'status', label: 'Status', width: '120px',
                  render: r => <Chip tone={COUNT_CHIP_TONE[r.status] || 'neutral'}>{COUNT_LABELS[r.status] || r.status}</Chip>,
                },
                {
                  key: 'variance', label: 'Fərq', width: '110px', align: 'right',
                  render: r => r.total_variance !== 0 ? (
                    <span className={`text-[13px] font-black tabular-nums ${r.total_variance > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {r.total_variance > 0 ? '+' : ''}₼{fmtCurrency(r.total_variance)}
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--theme-text-muted)] tabular-nums">₼0.00</span>
                  ),
                },
                { key: 'date', label: 'Tarix', width: '150px', hide: 'md', align: 'right', render: r => <span className="text-xs text-[var(--theme-text-secondary)] tabular-nums">{fmtDate(r.counted_at)}</span> },
                { key: 'by', label: 'Sayyan', width: '110px', hide: 'lg', align: 'right', render: r => <span className="text-xs text-[var(--theme-text-secondary)]">{r.counted_by || '—'}</span> },
              ]}
              empty={
                <div className="py-12 text-center">
                  <ClipboardCheck size={36} className="mx-auto mb-3 opacity-25 text-[var(--theme-text-muted)]" />
                  <p className="text-sm font-medium text-[var(--theme-text-secondary)]">
                    {search ? 'Axtarış nəticəsi tapılmadı' : 'Hələ sayım yaradılmayıb'}
                  </p>
                  {!search && <p className="text-xs text-[var(--theme-text-muted)] mt-2">&ldquo;Yeni Sayım&rdquo; düyməsi ilə ilk fiziki sayımı yaradın</p>}
                </div>
              }
            />

            {/* single detail panel (click a row) */}
            <AnimatePresence>
              {expandedCount && (
                <motion.div
                  key={`detail-${expandedCount.id}`}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <Card pad="md" className="mt-3">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <SectionHead overline="Sayım detalları" title={expandedCount.count_number} />
                        <div className="flex items-center gap-2 flex-wrap">
                          {expandedCount.status === 'draft' && (
                            <Btn variant="soft" small icon={actionLoading === expandedCount.id ? Loader2 : Play}
                              onClick={() => handleStatusUpdate(expandedCount.id, 'in_progress')} disabled={actionLoading === expandedCount.id}>
                              Sayıma Başla
                            </Btn>
                          )}
                          {expandedCount.status === 'in_progress' && (
                            <Btn variant="success" small icon={actionLoading === expandedCount.id ? Loader2 : CheckCircle2}
                              onClick={() => handleStatusUpdate(expandedCount.id, 'completed')} disabled={actionLoading === expandedCount.id}>
                              Tamamla
                            </Btn>
                          )}
                          {expandedCount.status === 'completed' && (
                            <Btn variant="solid" small icon={actionLoading === expandedCount.id ? Loader2 : Save}
                              onClick={() => handleApply(expandedCount.id)} disabled={actionLoading === expandedCount.id}>
                              Tətbiq Et
                            </Btn>
                          )}
                          {(expandedCount.status === 'draft' || expandedCount.status === 'in_progress') && (
                            <Btn variant="danger" small icon={actionLoading === expandedCount.id ? Loader2 : Ban}
                              onClick={() => handleStatusUpdate(expandedCount.id, 'cancelled')} disabled={actionLoading === expandedCount.id}>
                              Ləğv Et
                            </Btn>
                          )}
                        </div>
                      </div>

                      {expandedCount.notes && (
                        <p className="text-xs text-[var(--theme-text-muted)]">Qeyd: {expandedCount.notes}</p>
                      )}

                      {detailLoading ? (
                        <SpinnerBlock height={120} />
                      ) : detailData && detailData.items.length > 0 ? (
                        <DataTable
                          rows={detailData.items.map(item => ({ ...item, __actions: null as unknown as React.ReactNode }))}
                          rowKey={r => r.id}
                          actionsWidth={0}
                          cols={[
                            {
                              key: 'name', label: 'İnqrediyent', width: '2fr',
                              render: r => (
                                <div className="min-w-0">
                                  <p className="text-[13px] font-semibold text-[var(--theme-text)] truncate">{r.ingredient_name || ingredientMap.get(r.ingredient_id) || 'Naməlum'}</p>
                                  <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--theme-text-muted)]">{r.unit || 'əd'}</p>
                                </div>
                              ),
                            },
                            { key: 'system', label: 'Sistem', width: '90px', align: 'right', render: r => <span className="text-xs font-semibold tabular-nums text-[var(--theme-text-secondary)]">{r.system_qty.toFixed(2)}</span> },
                            { key: 'actual', label: 'Faktiki', width: '90px', align: 'right', render: r => <span className="text-xs font-black tabular-nums text-[var(--theme-text)]">{r.actual_qty.toFixed(2)}</span> },
                            {
                              key: 'var', label: 'Fərq', width: '90px', align: 'right',
                              render: r => <span className={`text-xs font-bold tabular-nums ${r.variance > 0 ? 'text-emerald-500' : r.variance < 0 ? 'text-red-500' : 'text-[var(--theme-text-muted)]'}`}>{r.variance > 0 ? '+' : ''}{r.variance.toFixed(2)}</span>,
                            },
                            {
                              key: 'vart', label: 'Fərq (₼)', width: '100px', align: 'right',
                              render: r => <span className={`text-xs font-bold tabular-nums ${r.variance_cost > 0 ? 'text-emerald-500' : r.variance_cost < 0 ? 'text-red-500' : 'text-[var(--theme-text-muted)]'}`}>{r.variance_cost > 0 ? '+' : ''}{fmtCurrency(r.variance_cost)}</span>,
                            },
                          ]}
                        />
                      ) : (
                        <p className="text-sm text-[var(--theme-text-muted)] text-center py-3">Hələ məhsul əlavə edilməyib</p>
                      )}

                      {/* add item (draft / in_progress only) */}
                      {detailData && (expandedCount.status === 'draft' || expandedCount.status === 'in_progress') && (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 p-4 rounded-xl bg-[var(--theme-surface-soft)]/50 border border-[var(--theme-border)]">
                          <Field label="İnqrediyent" className="flex-1">
                            <select value={addIngredientId} onChange={e => setAddIngredientId(e.target.value)} disabled={ingredientsLoading} className={fieldCls}>
                              <option value="">Seçin</option>
                              {ingredients.map(ig => (
                                <option key={ig.id} value={ig.id}>{ig.name} ({ig.unit})</option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Faktiki miqdar" className="w-full sm:w-32">
                            <input type="number" min="0" step="0.001" value={addActualQty} onChange={e => setAddActualQty(e.target.value)} placeholder="0.00" className={fieldCls} />
                          </Field>
                          <Btn variant="ghost" icon={addingItem ? Loader2 : Plus} onClick={() => handleAddItem()} disabled={addingItem}>Əlavə et</Btn>
                        </div>
                      )}
                    </div>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════
          CREATE MODAL (13j: design-system Modal)
      ════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showCreate && (
          <Modal title="Fiziki sayım yarat" subtitle="Yeni sayım" onClose={() => setShowCreate(false)}>
            <div className="space-y-4">
              <Field label="Sayım nömrəsi *">
                <input value={formCountNumber} onChange={e => setFormCountNumber(e.target.value)} placeholder="Məs: SAY-2026-001" className={fieldCls} />
              </Field>
              <Field label="Sayımı edən — istəyə görə">
                <input value={formAssignedTo} onChange={e => setFormAssignedTo(e.target.value)} placeholder="Məs: Nigar" className={fieldCls} />
              </Field>
              <Field label="Qeyd — istəyə görə">
                <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Məs: Aylıq inventar..." rows={3} className={`${fieldCls} resize-none`} />
              </Field>
              <Btn variant="solid" icon={saving ? Loader2 : ClipboardCheck} onClick={handleCreate} disabled={saving} className="w-full">
                Sayımı Yarat
              </Btn>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
