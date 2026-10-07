'use client';

// 13n — "Stok" zone, written from zero. Same API contract as the legacy
// StockTab (endpoints, payloads, optimistic behavior, realtime refresh) —
// new composition, clean code, no patch layers:
//
//   hero (3-second rule, honest loading state)
//   metrics strip (live, clickable)
//   AI advisor (single AI surface, skeleton-reserved)
//   Anbar (search + filter + table, row → inspector push panel)
//   4 xammal push panels (Xammal Girişi / Əməliyyat / Yeni Xammal / Tarixçə)
//
// Push panels = the gift-cards full main-area pattern (stock-ui Drawer).

import { useState, useEffect, useMemo, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  Plus, TrendingUp, RefreshCw,
} from '@/components/ui/saito-icons';
import { toast } from '@/lib/toast';
import {
  InventoryStatusRow, InventoryDashboardData,
  IngredientUnit, InventoryLog, DisplayUnit, Supplier,
} from '@/types/inventory';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import AdvisorCard from '../components/AdvisorCard';
import { InspectorPanel } from '../components/InspectorPanel';
import TabHero, { HeroTone } from '../components/TabHero';
import { LiveNumber } from '../components/ViewFrame';
import { useAsyncView } from '../hooks/useAsyncView';
import {
  Btn, Chip, DataTable, SearchInput, Seg, SpinnerBlock, SectionHead,
  fmtAZN, fmtQty, fmtTime, Drawer,
} from '../stock-ui';

const UNIT_LABELS: Record<DisplayUnit, string> = {
  gram: 'qram', piece: 'ədəd', ml: 'ml', kg: 'kq', liter: 'litr',
};

const LOG_LABELS: Record<string, string> = {
  stock_in: 'Giriş', waste: 'İtki', adjustment: 'Tənzimləmə', order_consumption: 'Sifariş',
};

type ActionMode = 'stock_in' | 'waste' | 'audit' | null;

interface StockZoneProps {
  deepIngredient?: string | null;
  /** navigate to another zone/sub-tab (3-second CTAs) — a tab switch, not a scroll */
  onNavigate: (zone: 'procurement' | 'operations' | 'analytics', sub?: string) => void;
}

export default function StockZone({ deepIngredient, onNavigate }: StockZoneProps) {
  const [selectedRow, setSelectedRow] = useState<InventoryStatusRow | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [showQuickPick, setShowQuickPick] = useState(false);
  const [showNewIngredient, setShowNewIngredient] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'critical' | 'out_of_stock'>('all');
  const [qtyInput, setQtyInput] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [history, setHistory] = useState<Array<Pick<InventoryLog, 'id' | 'type' | 'quantity' | 'cost_per_unit' | 'reason' | 'created_at'>> | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [newIngredient, setNewIngredient] = useState({ name: '', unit: 'gram' as IngredientUnit, current_stock: 0, critical_limit: 0, average_cost_per_unit: 0, purchase_price: 0, supplier_id: '' });

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
    const d = await invRes.json() as InventoryDashboardData;
    if (supRes && supRes.ok) setSuppliers(await supRes.json());
    if (batchRes && batchRes.ok) setBatches(await batchRes.json());
    return d;
  }, []);

  // realtime: any inventory movement (KDS ready-tick consumption, POS, etc.)
  // refetches — stale-while-revalidate, no visible flicker.
  // 13n-2 (r38b root cause): live production KDS ticks fire postgres_changes
  // every 1-2s; an unthrottled reload() re-ran the whole 3-endpoint batch on
  // EVERY event → ~170 req/90s and unstable page height (5k↔19k px jumps).
  // Coalesced: one trailing 1.5s timer — an event burst = a single fetch.
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const scheduleReload = () => {
      if (reloadTimer.current) return; // a fetch is already pending
      reloadTimer.current = setTimeout(() => {
        reloadTimer.current = null;
        reload();
      }, 1500);
    };
    const ch = createRealtimeChannel('stock_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_logs' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients' }, scheduleReload)
      .subscribe();
    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      removeRealtimeChannel(ch);
    };
  }, [reload]);

  // deep link: ?ingredient=<id> opens the inspector push on load.
  useEffect(() => {
    if (!deepIngredient || !data) return;
    const it = data.items.find(x => x.id === deepIngredient);
    if (it) setSelectedRow(it);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, deepIngredient]);

  // ── derived ────────────────────────────────────────────────────────────────
  const allItems = data?.items ?? [];
  const criticalCount = allItems.filter(r => r.status === 'critical' || r.status === 'out_of_stock').length;
  const lowCount = allItems.filter(r => r.status === 'normal' && (r.stock_ratio ?? 100) < 50).length;
  const negativeCount = allItems.filter(r => r.current_stock < 0).length;

  // nearest-batch freshness per ingredient (expired OR ≤3 days → chip).
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
  const fresh = Object.values(freshnessByIngredient);
  const expiringCount = fresh.filter(f => !f.expired && f.days <= 3).length;
  const expiredCount = fresh.filter(f => f.expired).length;

  const rows = useMemo(() => (data?.items ?? []).filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) &&
    (filter === 'all' || r.status === filter),
  ), [data, search, filter]);

  // ── 3-second hero (computed, honest) ───────────────────────────────────────
  const hero: { tone: HeroTone; title: string; sub: string; cta?: { label: string; onClick: () => void } } =
    !data
      ? { tone: 'muted', title: 'Yüklənir…', sub: 'Stok məlumatları gətirilir' }
      : negativeCount > 0
        ? { tone: 'critical', title: `${negativeCount} maddə mənfi stoddadır`, sub: 'Real fiziki sayım lazımdır — nömrələr düzəlməyənə qədər hesabat etibarlı deyil.', cta: { label: 'Sayım et', onClick: () => onNavigate('operations', 'counts') } }
        : criticalCount > 0
          ? { tone: 'critical', title: `${criticalCount} xammal kritik səviyyədə`, sub: 'Order Guide-da DRAFT PO yarat — tədarük yolunu aç.', cta: { label: 'Nə Alım', onClick: () => onNavigate('procurement', 'buy') } }
          : expiredCount > 0
            ? { tone: 'warning', title: `${expiredCount} partiya müddətini keçib`, sub: 'FEFO: bitən partiyalar ilk gedənlərdir — itki qeyd edin və ya silin.', cta: { label: 'İtki', onClick: () => onNavigate('operations', 'waste') } }
            : expiringCount > 0
              ? { tone: 'warning', title: `${expiringCount} partiya 3 günə qədər bitəcək`, sub: 'Tazelik chip-lərinə diqqət edin — FEFO: əvvəl bitən, əvvəl gedən.' }
              : { tone: 'ok', title: 'Hamı normaldır', sub: 'Stok səviyyələri təhlükəsiz zonadadır.' };

  // ── actions (same contract as the legacy zone) ─────────────────────────────
  const openAction = (row: InventoryStatusRow, mode: Exclude<ActionMode, null>) => {
    setSelectedRow(row); setQtyInput(''); setReasonInput(''); setActionMode(mode);
  };

  const submitAction = async (mode: Exclude<ActionMode, null>) => {
    if (!selectedRow || !qtyInput) return;
    const amount = parseFloat(qtyInput);
    // "İnventarizasiya" sets an ABSOLUTE physical count — zero is legal.
    if (isNaN(amount) || (mode === 'audit' ? amount < 0 : amount <= 0)) {
      toast.error(mode === 'audit' ? 'Fiziki sayım mənfi ola bilməz (0 icazədir)' : 'Məbləğ 0-dan böyük olmalıdır');
      return;
    }
    setSaving(true);
    const unitCost = selectedRow.purchase_price ?? selectedRow.average_cost_per_unit;
    try {
      let res: Response;
      if (mode === 'audit') {
        res = await fetch('/api/inventory/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ingredientId: selectedRow.id, actualQty: amount }) });
      } else if (mode === 'stock_in') {
        res = await fetch('/api/stock/stock-in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ingredient_id: selectedRow.id, quantity: amount, unit_cost: unitCost, reason: reasonInput || 'Stok artımı' }) });
      } else {
        res = await fetch('/api/stock/waste', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ingredient_id: selectedRow.id, quantity: amount, unit_cost: unitCost, reason: reasonInput || 'İtki qeydi' }) });
      }
      if (res.ok) {
        toast.success('Əməliyyat uğurla tamamlandı');
        setActionMode(null); setQtyInput(''); setReasonInput('');
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

  const submitNewIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIngredient.name.trim()) { toast.error('Xammal adı tələb olunur'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/ingredients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newIngredient) });
      if (!res.ok) throw new Error((await res.json()).error || 'Xəta');
      toast.success('Xammal əlavə edildi');
      setShowNewIngredient(false);
      setNewIngredient({ name: '', unit: 'gram', current_stock: 0, critical_limit: 0, average_cost_per_unit: 0, purchase_price: 0, supplier_id: '' });
      reload();
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi');
    } finally {
      setSaving(false);
    }
  };

  const openHistory = async (row: InventoryStatusRow) => {
    setSelectedRow(row); setShowHistory(true); setHistory(null); setHistoryLoading(true);
    try {
      // service-role route (client RLS read returned 0 rows — 13a).
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

  const deleteIngredient = async (row: InventoryStatusRow) => {
    if (!confirm('Bu xammalı silmək istədiyinizə əminsiniz?')) return;
    const res = await fetch('/api/inventory/' + row.id, { method: 'DELETE' });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      toast.error(errData.error || 'Silinmə xətası');
    } else {
      toast.success('Xammal silindi');
      setSelectedRow(null);
      reload();
    }
  };

  // ── render ─────────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="rounded-2xl border border-rose-500/25 bg-rose-500/[0.04] p-8 text-center space-y-3">
        <p className="text-sm font-bold text-[var(--theme-text)]">Anbar yüklənə bilmədi</p>
        <Btn variant="solid" icon={RefreshCw} onClick={reload}>Yenidən Cəh Et</Btn>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <TabHero tone={hero.tone} title={hero.title} sub={hero.sub} cta={hero.cta} />

      {/* one action row: live metrics strip + single primary CTA */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {data ? (
          <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap text-[11px] font-bold text-[var(--theme-text-muted)]">
            <span className="text-[var(--theme-text-secondary)]">{allItems.length} xammal</span>
            <span className="flex items-center gap-1.5"><i className="w-1.5 h-1.5 rounded-full bg-blue-500" /><LiveNumber value={lowCount} /> aşağı</span>
            <button onClick={() => setFilter(filter === 'critical' ? 'all' : 'critical')} className="flex items-center gap-1.5 hover:text-[var(--theme-text)] transition-colors active:scale-95" title="Kritikləri filtrlə">
              <i className="w-1.5 h-1.5 rounded-full bg-rose-500" /><LiveNumber value={criticalCount} /> kritik
            </button>
            <button onClick={() => onNavigate('operations', 'counts')} className="flex items-center gap-1.5 hover:text-[var(--theme-text)] transition-colors active:scale-95" title="Sayıma get">
              <i className="w-1.5 h-1.5 rounded-full bg-red-500" /><LiveNumber value={negativeCount} /> mənfi
            </button>
            <span className="flex items-center gap-1.5" title={`${expiredCount} müddət keçib`}>
              <i className="w-1.5 h-1.5 rounded-full bg-amber-500" /><LiveNumber value={expiredCount + expiringCount} /> ≤3g
            </span>
          </div>
        ) : <span className="text-[11px] text-[var(--theme-text-muted)]">Yüklənir…</span>}
        <div className="flex items-center gap-2">
          <Btn variant="ghost" icon={Plus} title="Yeni Xammal" onClick={() => setShowNewIngredient(true)} className="px-3" />
          <Btn variant="solid" icon={TrendingUp} onClick={() => setShowQuickPick(true)}>Xammal Girişi</Btn>
        </div>
      </div>

      <AdvisorCard />

      {/* Anbar */}
      <SectionHead overline="Stok" title="Anbar" />
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Xammal axtar..." className="flex-1 max-w-xs" />
        <div className="flex items-center gap-2">
          <Seg
            value={filter}
            onChange={v => setFilter(v as typeof filter)}
            options={[
              { id: 'all', label: 'Hamısı' },
              { id: 'critical', label: 'Kritik' },
              { id: 'out_of_stock', label: 'Bitən' },
            ]}
          />
          <button onClick={reload} title="Yenilə" className="w-9 h-9 rounded-full flex items-center justify-center bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-all active:scale-90 shrink-0">
            <RefreshCw size={14} className={phase === 'loading' && !data ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {phase === 'loading' && !data ? (
        <SpinnerBlock height={320} />
      ) : (
        <DataTable
          rows={rows}
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
                  <span className={`text-sm font-black tabular-nums leading-none ${r.current_stock < 0 ? 'text-rose-500 light:text-rose-600' : 'text-[var(--theme-text)]'}`}>
                    {fmtQty(r.current_stock)}
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
      )}

      {/* ── push panels (gift-cards full main-area pattern) ─────────────────── */}
      <AnimatePresence>
        {actionMode && selectedRow && actionMode !== 'stock_in' && (
          <ActionPanel
            key="action"
            mode={actionMode}
            row={selectedRow}
            saving={saving}
            qtyInput={qtyInput} setQtyInput={setQtyInput}
            reasonInput={reasonInput} setReasonInput={setReasonInput}
            onConfirm={() => submitAction(actionMode)}
            onClose={() => setActionMode(null)}
          />
        )}
        {showQuickPick && (
          <QuickPickPanel
            key="quick-pick"
            items={allItems}
            onPick={it => { setShowQuickPick(false); openAction(it, 'stock_in'); }}
            onClose={() => setShowQuickPick(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showNewIngredient && (
          <NewIngredientPanel
            key="new"
            form={newIngredient} setForm={setNewIngredient}
            suppliers={suppliers} saving={saving}
            onSubmit={submitNewIngredient}
            onClose={() => setShowNewIngredient(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showHistory && selectedRow && (
          <HistoryPanel
            key="history"
            loading={historyLoading}
            history={history}
            name={selectedRow.name}
            onClose={() => setShowHistory(false)}
          />
        )}
      </AnimatePresence>

      <InspectorPanel
        row={selectedRow}
        onClose={() => setSelectedRow(null)}
        UNIT_LABELS={UNIT_LABELS}
        onStockIn={r => openAction(r, 'stock_in')}
        onWaste={r => openAction(r, 'waste')}
        onAudit={r => openAction(r, 'audit')}
        onHistory={openHistory}
        onDelete={deleteIngredient}
        onUpdate={reload}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Push panels (fresh, 13n)
   ═══════════════════════════════════════════════════════════════════════ */

const inputCls = 'w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] rounded-xl px-3.5 py-2.5 text-sm text-[var(--theme-text)] outline-none focus:border-[var(--theme-text)]/40 transition-colors';
const labelCls = 'text-[10px] font-bold text-[var(--theme-text-muted)] uppercase tracking-wider ml-1';

function ActionPanel({ mode, row, saving, qtyInput, setQtyInput, reasonInput, setReasonInput, onConfirm, onClose }: {
  mode: 'stock_in' | 'waste' | 'audit';
  row: InventoryStatusRow;
  saving: boolean;
  qtyInput: string; setQtyInput: (v: string) => void;
  reasonInput: string; setReasonInput: (v: string) => void;
  onConfirm: () => void; onClose: () => void;
}) {
  const titles = { stock_in: 'Stok Girişi', waste: 'İtki Qeydi', audit: 'İnventarizasiya (Fiziki Sayım)' };
  const unit = UNIT_LABELS[row.unit];
  return (
    <Drawer title={titles[mode]} subtitle={row.name} onClose={onClose}>
      <div className="max-w-xl mx-auto space-y-5">
        <div className="p-4 rounded-2xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] flex items-center justify-between">
          <div>
            <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-wider font-bold">Cari Stok</p>
            <p className="text-xl font-black text-[var(--theme-text)] tabular-nums">{fmtQty(row.current_stock)} {unit}</p>
          </div>
          {mode === 'audit' ? (
            <div className="text-right">
              <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-wider font-bold">Teorik</p>
              <p className="text-xl font-bold text-[var(--theme-text-secondary)] tabular-nums">{fmtQty(row.theoretical_stock)} {unit}</p>
            </div>
          ) : (
            <div className="text-right">
              <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-wider font-bold">Kritik Limit</p>
              <p className="text-xl font-bold text-[var(--theme-text-secondary)] tabular-nums">{row.critical_limit} {unit}</p>
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>
            {mode === 'audit' ? 'Fiziki sayılan miqdar (ABSOLYUT)' : mode === 'stock_in' ? `Miqdar (${unit})` : `İtki miqdarı (${unit})`}
          </label>
          <input type="number" autoFocus value={qtyInput} onChange={e => setQtyInput(e.target.value)} placeholder="0" className={inputCls} />
          {mode === 'audit' && (
            <p className="text-[10px] text-[var(--theme-text-muted)] mt-1">
              Məhsul xamını YENİ cəm dəyəri yazın — fərqi sistem öz hesablayıb qeyd edəcək. 0 icazədir.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>Səbəb (isteğe görə)</label>
          <input value={reasonInput} onChange={e => setReasonInput(e.target.value)} placeholder={mode === 'waste' ? 'Məs: kəsik, batırılma…' : 'Məs: tədarükçü gətirdi…'} className={inputCls} />
        </div>
        <div className="flex gap-2 pt-1">
          <Btn variant="ghost" className="flex-1" onClick={onClose}>Ləğv et</Btn>
          <Btn variant={mode === 'waste' ? 'danger' : 'solid'} disabled={saving} className="flex-1" onClick={onConfirm}>
            {mode === 'audit' ? 'Sayımı Təsdiqlə' : mode === 'stock_in' ? 'Girişi Qeyd Et' : 'İtkini Qeyd Et'}
          </Btn>
        </div>
      </div>
    </Drawer>
  );
}

/** Xammal Girişi: pick an ingredient (critical/low first), then the stock-in form. */
function QuickPickPanel({ items, onPick, onClose }: {
  items: InventoryStatusRow[];
  onPick: (item: InventoryStatusRow) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const ranked = useMemo(() => {
    const rank = (r: InventoryStatusRow) =>
      (r.current_stock < 0 ? 0 : r.status === 'critical' ? 1 : r.status === 'out_of_stock' ? 1 : (r.stock_ratio ?? 100) < 50 ? 2 : 3);
    return [...items]
      .filter(r => r.name.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }, [items, q]);
  return (
    <Drawer title="Xammal Girişi" subtitle="Xammalı seç — miqdarı sonra" onClose={onClose}>
      <div className="max-w-xl mx-auto space-y-3">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Axtar..." className={inputCls} autoFocus />
        <div className="space-y-1.5">
          {ranked.map(r => {
            return (
              <button
                key={r.id}
                onClick={() => onPick(r)}
                className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-soft)] hover:border-[var(--theme-text)]/30 transition-all active:scale-[0.99] text-left"
              >
                <span className="text-[13px] font-bold text-[var(--theme-text)] truncate">{r.name}</span>
                <span className="shrink-0 flex items-center gap-2">
                  <span className={`text-[12px] font-black tabular-nums ${r.current_stock < 0 ? 'text-rose-500 light:text-rose-600' : 'text-[var(--theme-text-secondary)]'}`}>{fmtQty(r.current_stock)} {UNIT_LABELS[r.unit]}</span>
                  <Chip tone={r.status === 'normal' ? 'ok' : 'crit'} dot>
                    {r.status === 'normal' ? 'Normal' : r.status === 'critical' ? 'Kritik' : 'Bitib'}
                  </Chip>
                </span>
              </button>
            );
          })}
          {ranked.length === 0 && <p className="text-xs text-[var(--theme-text-muted)] py-6 text-center">Heç nə tapılmadı.</p>}
        </div>
      </div>
    </Drawer>
  );
}

function NewIngredientPanel({ form, setForm, suppliers, saving, onSubmit, onClose }: {
  form: { name: string; unit: IngredientUnit; current_stock: number; critical_limit: number; average_cost_per_unit: number; purchase_price: number; supplier_id: string };
  setForm: (f: any) => void;
  suppliers: Supplier[];
  saving: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}) {
  return (
    <Drawer title="Yeni Xammal" subtitle="Yeni ingredient əlavə et" onClose={onClose}>
      <form onSubmit={onSubmit} className="max-w-xl mx-auto space-y-4">
        <div className="space-y-1.5">
          <label className={labelCls}>Ad *</label>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Məs: Filadelfiya kremi" className={inputCls} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={labelCls}>Vahid</label>
            <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className={inputCls}>
              <option value="gram">Qram</option>
              <option value="piece">Ədəd</option>
              <option value="ml">ml</option>
              <option value="kg">Kq</option>
              <option value="liter">Litr</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Tədarükçü</label>
            <select value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })} className={inputCls}>
              <option value="">Yoxdur</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={labelCls}>Başlanğıc Stok</label>
            <input type="number" step="0.001" value={form.current_stock} onChange={e => setForm({ ...form, current_stock: parseFloat(e.target.value) || 0 })} className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Kritik Limit</label>
            <input type="number" step="0.001" value={form.critical_limit} onChange={e => setForm({ ...form, critical_limit: parseFloat(e.target.value) || 0 })} className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={labelCls}>Maya Dəyəri (₼/{UNIT_LABELS[form.unit]})</label>
            <input type="number" step="0.01" value={form.average_cost_per_unit} onChange={e => setForm({ ...form, average_cost_per_unit: parseFloat(e.target.value) || 0 })} className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Satınalma Qiyməti (₼/{UNIT_LABELS[form.unit]})</label>
            <input type="number" step="0.01" value={form.purchase_price} onChange={e => setForm({ ...form, purchase_price: parseFloat(e.target.value) || 0 })} className={inputCls} />
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Btn variant="ghost" className="flex-1" type="button" onClick={onClose}>Ləğv et</Btn>
          <Btn variant="solid" type="submit" disabled={saving} className="flex-1">Əlavə et</Btn>
        </div>
      </form>
    </Drawer>
  );
}

function HistoryPanel({ loading, history, name, onClose }: {
  loading: boolean;
  history: Array<Pick<InventoryLog, 'id' | 'type' | 'quantity' | 'cost_per_unit' | 'reason' | 'created_at'>> | null;
  name: string;
  onClose: () => void;
}) {
  return (
    <Drawer title="Stok Tarixçəsi" subtitle={name} onClose={onClose}>
      <div className="max-w-2xl mx-auto space-y-2">
        {loading ? (
          <div className="py-10 text-center text-sm text-[var(--theme-text-muted)]">Yüklenir...</div>
        ) : history && history.length === 0 ? (
          <div className="py-10 text-center text-sm text-[var(--theme-text-muted)]">Bu xammal üçün heç bir log yoxdur.</div>
        ) : (
          history?.map(log => {
            const positive = log.quantity > 0;
            return (
              <div key={log.id} className="flex items-center justify-between p-3 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[var(--theme-text)]">{LOG_LABELS[log.type] || log.type}</p>
                  {log.reason && <p className="text-[10px] text-[var(--theme-text-muted)] truncate">{log.reason}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-black tabular-nums ${positive ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {positive ? '+' : ''}{fmtQty(log.quantity)}
                  </p>
                  <p className="text-[10px] text-[var(--theme-text-muted)] tabular-nums">{fmtTime(log.created_at)}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Drawer>
  );
}
