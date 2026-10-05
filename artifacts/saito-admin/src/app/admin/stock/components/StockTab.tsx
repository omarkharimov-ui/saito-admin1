'use client';

// 13i — "Stok" tab (default). Owner: "3 saniyədə nə etməlidir".
// Opens with ONE status line (TabHero) computed from live data, then the
// quiet KPI strip (Aşağı / Kritik / Mənfi / Tazelik), the AI advisor (the
// single AI surface), and the Anbar table with row micro-interactions.
// All modals (stock-in / waste / audit / quick-in / new ingredient) + the
// inspector live here — moved from the old monolithic page.tsx.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package, Plus, TrendingDown, TrendingUp,
  Loader2, RefreshCw,
  Search, Pencil, ClipboardCheck,
  Save,
} from '@/components/ui/saito-icons';
import { toast } from '@/lib/toast';
import { useTheme } from '@/lib/theme/ThemeContext';
import {
  InventoryStatusRow, InventoryDashboardData,
  IngredientUnit, LowStockAlert,
  InventoryLog, DisplayUnit,
  Supplier,
} from '@/types/inventory';
import { getStatusMeta } from '@/components/StockStatusBadge';
import AdvisorCard from './AdvisorCard';
import { InspectorPanel } from './InspectorPanel';
import TabHero, { HeroTone } from './TabHero';
import { LiveNumber, ViewContent } from './ViewFrame';
import { useAsyncView } from '../hooks/useAsyncView';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { Btn, Chip, DataTable, SearchInput, Seg, IconBtn, SpinnerBlock, fmtAZN, Drawer } from '../stock-ui';

const UNIT_LABELS: Record<DisplayUnit, string> = {
  gram: 'qram', piece: 'ədəd', ml: 'ml',
  kg: 'kq', liter: 'litr',
};

const LOG_LABELS: Record<string, string> = {
  stock_in: 'Giriş', waste: 'İtki', adjustment: 'Tənzimləmə', order_consumption: 'Sifariş',
};

type ModalMode = 'stock_in' | 'waste' | 'audit' | 'new_ingredient' | null;

interface StockTabProps {
  /** tab-level navigation (3-second CTA jumps) */
  onNavigate: (view: 'procurement' | 'operations', sub?: string) => void;
}

export default function StockTab({ onNavigate }: StockTabProps) {
  const { lightMode } = useTheme();
  const [selectedRow, setSelectedRow] = useState<InventoryStatusRow | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'critical' | 'out_of_stock'>('all');
  const [showQuickStockIn, setShowQuickStockIn] = useState(false);
  const [history, setHistory] = useState<Array<Pick<InventoryLog, 'id' | 'type' | 'quantity' | 'cost_per_unit' | 'reason' | 'created_at'>> | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [newIngredient, setNewIngredient] = useState({ name: '', unit: 'gram' as IngredientUnit, current_stock: 0, critical_limit: 0, average_cost_per_unit: 0, purchase_price: 0, supplier_id: '' });
  const [qtyInput, setQtyInput] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [batches, setBatches] = useState<any[]>([]);

  const { phase, data, reload } = useAsyncView(async () => {
    const [invRes, supRes, batchRes] = await Promise.all([
      fetch('/api/inventory'),
      fetch('/api/suppliers').catch(() => null),
      fetch('/api/stock/batches').catch(() => null),
    ]);
    if (!invRes.ok) {
      const err = await invRes.json().catch(() => ({ error: 'Anbar məlumatları yüklənərkən xəta' }));
      throw new Error(err.error || 'Inventory load failed');
    }
    const d = await invRes.json() as InventoryDashboardData & { alerts: LowStockAlert[] };
    if (supRes && supRes.ok) setSuppliers(await supRes.json());
    if (batchRes && batchRes.ok) setBatches(await batchRes.json());
    return d;
  }, []);

  // realtime: inventory_logs / ingredients changes → refetch (stale-while-revalidate).
  useEffect(() => {
    const ch = createRealtimeChannel('stock_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_logs' }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients' }, () => reload())
      .subscribe();
    return () => { removeRealtimeChannel(ch); };
  }, [reload]);

  const rows = useMemo(() => (data?.items ?? []).filter(r => {
    const matchSearch = r.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || r.status === filter;
    return matchSearch && matchFilter;
  }), [data, search, filter]);

  // 13c: nearest-batch freshness per ingredient (expired OR ≤3 days → chip).
  const freshnessByIngredient = useMemo(() => {
    const m: Record<string, { days: number; expired: boolean }> = {};
    for (const b of batches) {
      if (!b.expiry_date) continue;
      const days = Math.ceil((new Date(b.expiry_date).getTime() - Date.now()) / 86400000);
      const prev = m[b.ingredient_id];
      if (!prev || days < prev.days) m[b.ingredient_id] = { days, expired: days < 0 };
    }
    return m;
  }, [batches]);

  // ── 3-second status (the hero is computed, never static) ──────────────────
  const allItems = data?.items ?? [];
  const criticalCount = allItems.filter(r => r.status === 'critical' || r.status === 'out_of_stock').length;
  // InventoryStatus has no 'low' (the old KPI was hard-0); "aşağı" = normal
  // items whose stock ratio is under half of the normal zone.
  const lowCount = allItems.filter(r => r.status === 'normal' && (r.stock_ratio ?? 100) < 50).length;
  const negativeCount = allItems.filter(r => r.current_stock < 0).length;
  const fresh = Object.values(freshnessByIngredient);
  const expiringCount = fresh.filter(f => !f.expired && f.days <= 3).length;
  const expiredCount = fresh.filter(f => f.expired).length;

  const hero: { tone: HeroTone; title: string; sub: string; cta?: { label: string; onClick: () => void } } =
    criticalCount > 0
      ? {
          tone: 'critical',
          title: `${criticalCount} xammal tədarük tələb edir`,
          sub: 'Stok bitməyə yaxındır — Order Guide ilə DRAFT PO yarat, heç nə avtomatik göndərilmir.',
          cta: { label: 'Nə Alım →', onClick: () => onNavigate('procurement', 'buy') },
        }
      : negativeCount > 0
        ? {
            tone: 'warning',
            title: `${negativeCount} mənfi stok qeydi var`,
            sub: 'Sistemdə qeydiyyat mənfiyə düşüb — fiziki sayım ilə düzəldin.',
            cta: { label: 'Sayım et →', onClick: () => onNavigate('operations', 'counts') },
          }
        : expiredCount + expiringCount > 0
          ? {
              tone: 'warning',
              title: `${expiredCount + expiringCount} partiya 3 günə qədər bitəcək`,
              sub: 'Tazelik chip-lərinə diqqət edin — FEFO: əvvəl bitən, əvvəl gedən.',
            }
          : {
              tone: 'ok',
              title: 'Hamı normaldır',
              sub: 'Stok səviyyələri təhlükəsiz zonadadır.',
            };

  const handleHistory = async (row: InventoryStatusRow) => {
    setSelectedRow(row);
    setHistory(null);
    setHistoryLoading(true);
    try {
      // 13a: service-role route (client RLS read returned 0 rows).
      const res = await fetch(`/api/inventory/logs?ingredient_id=${row.id}&limit=100`);
      if (res.ok) setHistory(await res.json());
      else throw new Error(`HTTP ${res.status}`);
    } catch {
      setHistory([]);
      toast.error('Tarixçə yüklənərkən xəta baş verdi', { id: 'action-toast' });
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleAction = async (type: 'stock_in' | 'waste' | 'adjustment' | 'audit') => {
    if (!selectedRow || !qtyInput) return;
    const amount = parseFloat(qtyInput);
    // 13a: "İnventarizasiya" sets an ABSOLUTE physical count — zero is legal.
    if (isNaN(amount) || (type === 'audit' ? amount < 0 : amount <= 0)) {
      toast.error(type === 'audit' ? 'Fiziki sayım mənfi ola bilməz (0 icazədir)' : 'Məbləğ 0-dan böyük olmalıdır');
      return;
    }
    setSaving(true);
    const unitCost = selectedRow.purchase_price ?? selectedRow.average_cost_per_unit;
    try {
      let res: Response;
      if (type === 'audit') {
        res = await fetch('/api/inventory/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ingredientId: selectedRow.id, actualQty: amount }) });
      } else if (type === 'stock_in') {
        res = await fetch('/api/stock/stock-in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ingredient_id: selectedRow.id, quantity: amount, unit_cost: unitCost, reason: reasonInput || 'Stok artımı' }) });
      } else {
        res = await fetch('/api/stock/waste', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ingredient_id: selectedRow.id, quantity: amount, unit_cost: unitCost, reason: reasonInput || 'İtki qeydi' }) });
      }
      if (res.ok) {
        toast.success('Əməliyyat uğurla tamamlandı');
        setModalMode(null); setQtyInput(''); setReasonInput('');
        reload();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Xəta baş verdi');
      }
    } catch {
      toast.error('Gözlənilməz xəta');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIngredient.name.trim()) { toast.error('Xammal adı tələb olunur'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/ingredients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newIngredient) });
      if (!res.ok) throw new Error((await res.json()).error || 'Xəta');
      toast.success('Xammal əlavə edildi');
      setModalMode(null);
      setNewIngredient({ name: '', unit: 'gram', current_stock: 0, critical_limit: 0, average_cost_per_unit: 0, purchase_price: 0, supplier_id: '' });
      reload();
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <ViewContent id="stock-tab">
      <div className="space-y-5">
        {phase === 'error' ? (
          <div className="rounded-2xl border border-rose-500/25 bg-rose-500/[0.04] p-8 text-center space-y-3">
            <p className="text-sm font-bold text-[var(--theme-text)]">Anbar yüklənə bilmədi</p>
            <button onClick={reload} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--theme-text)] text-[var(--theme-bg)] text-[11px] font-black uppercase tracking-widest transition-all active:scale-[0.97]">
              <RefreshCw size={13} /> Yenidən Cəh Et
            </button>
          </div>
        ) : (
          <TabHero tone={hero.tone} title={hero.title} sub={hero.sub} cta={hero.cta} lightMode={lightMode} />
        )}

        {/* 13k: ONE action row — owner: 2 ayrı button = maneə, 4 KPI kartı = sablon.
            Inline metrics strip (no cards) + single primary CTA + icon ghost. */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {data ? (
            <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap text-[11px] font-bold text-[var(--theme-text-muted)]">
              <span className="text-[var(--theme-text-secondary)]">{allItems.length} xammal</span>
              <span className="flex items-center gap-1.5"><i className="w-1.5 h-1.5 rounded-full bg-blue-500" /><LiveNumber value={lowCount} /> aşağı</span>
              <button onClick={() => setFilter('critical')} className="flex items-center gap-1.5 hover:text-[var(--theme-text)] transition-colors" title="Kritikləri filtrlə">
                <i className="w-1.5 h-1.5 rounded-full bg-rose-500" /><LiveNumber value={criticalCount} /> kritik
              </button>
              <button onClick={() => onNavigate('operations', 'counts')} className="flex items-center gap-1.5 hover:text-[var(--theme-text)] transition-colors" title="Sayıma get">
                <i className="w-1.5 h-1.5 rounded-full bg-red-500" /><LiveNumber value={negativeCount} /> mənfi
              </button>
              <span className="flex items-center gap-1.5" title={`${expiredCount} müddət keçib`}>
                <i className="w-1.5 h-1.5 rounded-full bg-amber-500" /><LiveNumber value={expiredCount + expiringCount} /> ≤3g
              </span>
            </div>
          ) : <span className="text-[11px] font-bold text-[var(--theme-text-muted)]">Yüklənir...</span>}
          <div className="flex items-center gap-2">
            <Btn variant="ghost" small icon={Plus} title="Yeni Xammal" onClick={() => setModalMode('new_ingredient')} className="px-3" />
            <Btn variant="solid" icon={TrendingUp} onClick={() => setShowQuickStockIn(true)}>Xammal Girişi</Btn>
          </div>
        </div>

        {phase === 'loading' && !data ? (
          <SpinnerBlock height={320} />
        ) : data ? (
          <>
            {/* AI advisor — the single AI surface of the inventory module */}
            <AdvisorCard />

            {/* Anbar (13j: DataTable + SearchInput + Seg) */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
              <SearchInput value={search} onChange={setSearch} placeholder="Xammal axtar..." className="flex-1" />
              <Seg
                options={[{ id: 'all', label: 'Hamısı' }, { id: 'critical', label: 'Kritik' }, { id: 'out_of_stock', label: 'Bitənlər' }]}
                value={filter}
                onChange={setFilter}
              />
            </div>

            <DataTable
              rows={rows.map(r => ({
                ...r,
                __actions: (
                  <>
                    <IconBtn icon={Pencil} title="Məlumat / Tarixçə" tone="blue" onClick={() => setSelectedRow(r)} />
                    <IconBtn icon={TrendingUp} title="Stok Girişi" tone="emerald" onClick={() => { setSelectedRow(r); setModalMode('stock_in'); }} />
                    <IconBtn icon={TrendingDown} title="İtki" tone="rose" onClick={() => { setSelectedRow(r); setModalMode('waste'); }} />
                    <IconBtn icon={ClipboardCheck} title="İnventarizasiya" tone="amber" onClick={() => { setSelectedRow(r); setModalMode('audit'); }} />
                  </>
                ),
              }))}
              rowKey={r => r.id}
              onRow={r => setSelectedRow(r)}
              rowClass={r => (selectedRow?.id === r.id ? 'bg-[var(--theme-surface-soft)]/60' : '')}
              cols={[
                {
                  key: 'name', label: 'Xammal', width: '1.7fr',
                  render: r => (
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-[var(--theme-text)] truncate leading-tight">{r.name}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--theme-text-muted)]">{UNIT_LABELS[r.unit]}</span>
                        {(() => {
                          const f = freshnessByIngredient[r.id];
                          if (!f) return null;
                          if (f.expired) return <Chip tone="crit" dot={false}>Müddət keçib</Chip>;
                          if (f.days <= 3) return <Chip tone="warn" dot={false}>{f.days}g qalıb</Chip>;
                          return null;
                        })()}
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'price', label: 'Qiymət', width: '80px', align: 'right', hide: 'sm',
                  render: r => <span className="text-xs font-semibold text-[var(--theme-text-secondary)] tabular-nums">{fmtAZN(r.average_cost_per_unit)}</span>,
                },
                {
                  key: 'stock', label: 'Stok', width: '140px', align: 'right',
                  render: r => (
                    <div className="w-full flex flex-col items-end gap-1.5">
                      <span className={`text-sm font-black tabular-nums leading-none ${r.current_stock < 0 ? 'text-red-500' : 'text-[var(--theme-text)]'}`}>
                        {r.current_stock.toLocaleString('az', { maximumFractionDigits: 1 })}
                      </span>
                      <div className="w-20 h-1 rounded-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]/50 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${r.status === 'normal' ? 'bg-emerald-500' : 'bg-rose-500'}`}
                          style={{ width: `${Math.min(100, Math.max(4, Math.round(r.stock_ratio || 0)))}%` }}
                        />
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'status', label: 'Status', width: '104px', hide: 'md',
                  render: r => (
                    <Chip tone={r.status === 'normal' ? 'ok' : 'crit'}>
                      {r.status === 'normal' ? 'Normal' : r.status === 'critical' ? 'Kritik' : 'Bitib'}
                    </Chip>
                  ),
                },
              ]}
              empty={
                <p className="text-center py-12 text-sm text-[var(--theme-text-muted)]">
                  {search || filter !== 'all' ? 'Axtarış nəticəsi tapılmadı' : 'Hələ xammal əlavə edilməyib'}
                </p>
              }
            />
          </>
        ) : null}
      </div>

      {/* ── Modals ── (moved verbatim from the 13h shell) */}
      <AnimatePresence>
        {modalMode && modalMode !== 'new_ingredient' && selectedRow && (
          <StockActionModal
            key="action-modal"
            mode={modalMode}
            row={selectedRow}
            saving={saving}
            qtyInput={qtyInput} setQtyInput={setQtyInput}
            reasonInput={reasonInput} setReasonInput={setReasonInput}
            onConfirm={() => handleAction(modalMode === 'stock_in' ? 'stock_in' : modalMode === 'audit' ? 'audit' : 'waste')}
            onClose={() => setModalMode(null)}
          />
        )}
      </AnimatePresence>

      <InspectorPanel
        row={selectedRow}
        onClose={() => setSelectedRow(null)}
        UNIT_LABELS={UNIT_LABELS}
        onStockIn={(r: InventoryStatusRow) => { setSelectedRow(r); setModalMode('stock_in'); }}
        onWaste={(r: InventoryStatusRow) => { setSelectedRow(r); setModalMode('waste'); }}
        onAudit={(r: InventoryStatusRow) => { setSelectedRow(r); setModalMode('audit'); }}
        onHistory={handleHistory}
        onDelete={async (r: InventoryStatusRow) => {
          if (!confirm('Bu xammalı silmək istədiyinizə əminsiniz?')) return;
          const res = await fetch('/api/inventory/' + r.id, { method: 'DELETE' });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            toast.error(errData.error || 'Silinmə xətası');
          } else { toast.success('Xammal silindi'); setSelectedRow(null); reload(); }
        }}
        onUpdate={reload}
      />

      <AnimatePresence>
        {history !== null && selectedRow && (
          <StockHistoryModal
            key="history-modal"
            loading={historyLoading}
            history={history}
            name={selectedRow.name}
            onClose={() => setHistory(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showQuickStockIn && (
          <QuickStockInModal
            key="quick-in"
            items={data?.items ?? []}
            onPick={(item) => { setSelectedRow(item); setModalMode('stock_in'); setShowQuickStockIn(false); }}
            onClose={() => setShowQuickStockIn(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {modalMode === 'new_ingredient' && (
          <NewIngredientModal
            key="new-ingredient"
            form={newIngredient}
            setForm={setNewIngredient}
            saving={saving}
            onSubmit={handleCreateIngredient}
            onClose={() => setModalMode(null)}
          />
        )}
      </AnimatePresence>
    </ViewContent>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Modals — 13l: the shared full main-area panel (gift-cards pattern) from
   stock-ui Drawer. Forms are kept narrow (max-w-xl) inside the full panel
   for readability; lists use the full width.
   ═══════════════════════════════════════════════════════════════════════ */

const inputCls = 'w-full bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl px-5 py-3.5 text-[var(--theme-text)] outline-none focus:border-[var(--theme-text)]/40 transition-colors';
const labelCls = 'text-[10px] font-black text-[var(--theme-text-muted)] uppercase tracking-[0.2em] ml-1';

function StockActionModal({ mode, row, saving, qtyInput, setQtyInput, reasonInput, setReasonInput, onConfirm, onClose }: {
  mode: Exclude<ModalMode, null | 'new_ingredient'>;
  row: InventoryStatusRow;
  saving: boolean;
  qtyInput: string; setQtyInput: (v: string) => void;
  reasonInput: string; setReasonInput: (v: string) => void;
  onConfirm: () => void; onClose: () => void;
}) {
  const titles: Record<string, string> = { stock_in: 'Stok Girişi', audit: 'İnventarizasiya', waste: 'İtki Qeydi' };
  const diff = qtyInput ? parseFloat(qtyInput) - row.current_stock : 0;
  const hasDiff = qtyInput && Math.abs(diff) > 0.01;
  return (
    <Drawer title={titles[mode]} subtitle={row.name} onClose={onClose}>
      <div className="max-w-xl mx-auto space-y-5">
        {mode === 'audit' ? (
          <>
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
              <span className="text-xs font-bold text-[var(--theme-text-muted)] uppercase tracking-widest">Sistem stoku</span>
              <span className="text-lg font-black text-[var(--theme-text)] tabular-nums">{row.current_stock.toFixed(1)} {UNIT_LABELS[row.unit]}</span>
            </div>
            <div className="space-y-2">
              <label className={labelCls}>Faktiki say ({UNIT_LABELS[row.unit]})</label>
              <input type="number" autoFocus value={qtyInput} onChange={e => setQtyInput(e.target.value)}
                className={`${inputCls} text-2xl font-black py-4`} placeholder={String(row.current_stock)} />
            </div>
            {qtyInput && (
              <div className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${hasDiff ? 'bg-rose-500/10 border-rose-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                <span className="text-xs font-bold uppercase tracking-widest text-[var(--theme-text-muted)]">Fərq</span>
                <span className={`text-lg font-black tabular-nums ${hasDiff ? 'text-rose-500' : 'text-emerald-500'}`}>
                  {diff > 0 ? '+' : ''}{diff.toFixed(1)} {UNIT_LABELS[row.unit]}
                </span>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="space-y-2">
              <label className={labelCls}>Miqdar ({UNIT_LABELS[row.unit]})</label>
              <input type="number" autoFocus value={qtyInput} onChange={e => setQtyInput(e.target.value)}
                className={`${inputCls} text-2xl font-black py-4`} placeholder="0.0" />
            </div>
            <div className="space-y-2">
              <label className={labelCls}>Qeyd (Səbəb)</label>
              <input type="text" value={reasonInput} onChange={e => setReasonInput(e.target.value)}
                className={inputCls} placeholder="Məs: Təzə mal gəldi" />
            </div>
          </>
        )}
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-3.5 rounded-xl border border-[var(--theme-border)] text-[var(--theme-text-muted)] font-black uppercase tracking-widest text-[10px] hover:bg-[var(--theme-surface-soft)] transition-all active:scale-[0.98]">Ləğv Et</button>
          <button onClick={onConfirm} disabled={saving || !qtyInput}
            className={`flex-1 py-3.5 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40 ${
              mode === 'stock_in' ? 'bg-emerald-500 text-white hover:bg-emerald-600' : mode === 'audit' ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-rose-500 text-white hover:bg-rose-600'
            }`}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Təsdiqlə
          </button>
        </div>
      </div>
    </Drawer>
  );
}

function StockHistoryModal({ loading, history, name, onClose }: {
  loading: boolean;
  history: Array<Pick<InventoryLog, 'id' | 'type' | 'quantity' | 'cost_per_unit' | 'reason' | 'created_at'>>;
  name: string; onClose: () => void;
}) {
  return (
    <Drawer title="Stok Tarixçəsi" subtitle={name} onClose={onClose}>
      <div className="max-w-2xl mx-auto space-y-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-[var(--theme-text-muted)]">
              <Loader2 size={18} className="animate-spin" /> Yüklənir...
            </div>
          ) : history.length === 0 ? (
            <p className="text-center py-12 text-sm text-[var(--theme-text-muted)]">Hələ heç bir stok hərəkəti qeyd edilməyib.</p>
          ) : (
            history.map((log, i) => (
              <motion.div key={log.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }}
                className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--theme-text)]">{LOG_LABELS[log.type] || log.type}</p>
                  <p className="text-[11px] text-[var(--theme-text-muted)] truncate">{log.reason || '—'}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-black tabular-nums ${log.type === 'stock_in' ? 'text-emerald-500' : log.type === 'waste' || log.type === 'adjustment' ? 'text-rose-500' : 'text-[var(--theme-text)]'}`}>
                    {log.type === 'stock_in' ? '+' : ''}{Number(log.quantity).toFixed(1)}
                  </p>
                  <p className="text-[10px] text-[var(--theme-text-muted)]">
                    {new Date(log.created_at).toLocaleString('az-AZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </motion.div>
            ))
          )}
      </div>
    </Drawer>
  );
}

function QuickStockInModal({ items, onPick, onClose }: {
  items: InventoryStatusRow[];
  onPick: (item: InventoryStatusRow) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  return (
    <Drawer title="Təzə Xammal Girişi" subtitle="Stok artırmaq" onClose={onClose}>
      <div className="max-w-xl mx-auto space-y-4">
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)]" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Xammal axtar..." autoFocus className={`${inputCls} pl-10 py-2.5 text-sm`} />
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {items.filter(i => i.name.toLowerCase().includes(q.toLowerCase())).map(item => {
            const meta = getStatusMeta(item.status);
            return (
              <button key={item.id} onClick={() => onPick(item)}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] hover:border-[var(--theme-text)]/40 transition-all text-left active:scale-[0.99]">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${meta.bg}`}>
                    <Package size={16} className={meta.text} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--theme-text)] truncate">{item.name}</p>
                    <p className="text-[10px] text-[var(--theme-text-muted)] font-bold uppercase tracking-widest">{UNIT_LABELS[item.unit]}</p>
                  </div>
                </div>
                <p className="text-sm font-black text-[var(--theme-text)] tabular-nums shrink-0">{item.current_stock.toFixed(1)}</p>
              </button>
            );
          })}
          {items.filter(i => i.name.toLowerCase().includes(q.toLowerCase())).length === 0 && (
            <p className="text-center py-8 text-sm text-[var(--theme-text-muted)]">Xammal tapılmadı</p>
          )}
        </div>
      </div>
    </Drawer>
  );
}

function NewIngredientModal({ form, setForm, saving, onSubmit, onClose }: {
  form: typeof formDefault;
  setForm: (v: any) => void;
  saving: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}) {
  return (
    <Drawer title="Yeni Xammal" subtitle="Yeni ingredient əlavə et" onClose={onClose}>
      <form onSubmit={onSubmit} className="max-w-xl mx-auto space-y-4">
        <div className="space-y-1.5">
          <label className={labelCls}>Xammal Adı *</label>
          <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Məs: Domates" autoFocus required className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={labelCls}>Vahid</label>
            <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className={inputCls}>
              <option value="gram">Gram</option>
              <option value="kg">Kilogram</option>
              <option value="ml">Mililitr</option>
              <option value="liter">Litr</option>
              <option value="piece">Ədəd</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Başlanğıc Stok</label>
            <input type="number" step="0.01" value={form.current_stock} onChange={e => setForm({ ...form, current_stock: parseFloat(e.target.value) || 0 })} className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={labelCls}>Kritik Limit</label>
            <input type="number" step="0.01" value={form.critical_limit} onChange={e => setForm({ ...form, critical_limit: parseFloat(e.target.value) || 0 })} className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Birim Qiymət (₼)</label>
            <input type="number" step="0.01" value={form.average_cost_per_unit} onChange={e => setForm({ ...form, average_cost_per_unit: parseFloat(e.target.value) || 0 })} className={inputCls} />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>Alış Qiyməti (₼)</label>
          <input type="number" step="0.01" value={form.purchase_price} onChange={e => setForm({ ...form, purchase_price: parseFloat(e.target.value) || 0 })} className={inputCls} />
        </div>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-3.5 rounded-xl border border-[var(--theme-border)] text-[var(--theme-text-muted)] font-black uppercase tracking-widest text-[10px] hover:bg-[var(--theme-surface-soft)] transition-all active:scale-[0.98]">Ləğv Et</button>
          <button type="submit" disabled={saving} className="flex-1 py-3.5 rounded-xl bg-[var(--theme-text)] text-[var(--theme-bg)] font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Yadda Saxla
          </button>
        </div>
      </form>
    </Drawer>
  );
}

const formDefault = { name: '', unit: 'gram' as IngredientUnit, current_stock: 0, critical_limit: 0, average_cost_per_unit: 0, purchase_price: 0, supplier_id: '' };
