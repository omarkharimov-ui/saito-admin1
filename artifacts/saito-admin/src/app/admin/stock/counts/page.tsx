'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardCheck, Package, Plus, X, Loader2, Search, ChevronDown,
  Play, CheckCircle2, Ban, Save,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import type { StockCount, StockCountItem } from '@/types/inventory';
import { PageTransition } from '@/components/PageTransition';
import { GlassCard } from '@/components/GlassCard';

// ─── Constants ───────────────────────────────────────────────────────────────

type StockCountStatus = 'draft' | 'in_progress' | 'completed' | 'cancelled';

const STATUS_META: Record<StockCountStatus, { label: string; cls: string }> = {
  draft:       { label: 'Qaralama',     cls: 'text-zinc-400/80 bg-zinc-500/10 border-zinc-500/20' },
  in_progress: { label: 'Davam edir',   cls: 'text-yellow-400/80 bg-yellow-500/10 border-yellow-500/20' },
  completed:   { label: 'Tamamlandı',   cls: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' },
  cancelled:   { label: 'Ləğv edildi',  cls: 'text-red-400/80 bg-red-500/10 border-red-500/20' },
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

// ─── Modal variants ──────────────────────────────────────────────────────────

const modalV = {
  hidden: { opacity: 0, scale: 0.96, y: 14 },
  show:   { opacity: 1, scale: 1, y: 0, transition: { type: 'spring' as const, stiffness: 400, damping: 32 } },
  exit:   { opacity: 0, scale: 0.95, y: 8, transition: { duration: 0.14 } },
};

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: StockCountStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border ${m.cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
      {m.label}
    </span>
  );
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
      STATUS_META[c.status]?.label.toLowerCase().includes(q) ||
      (c.counted_by && c.counted_by.toLowerCase().includes(q)),
    );
  }, [counts, search]);

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
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('Sayım yaradıldı');
      setShowCreate(false);
      setFormCountNumber('');
      setFormNotes('');
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
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('Məhsul əlavə edildi');
      setAddIngredientId('');
      setAddActualQty('');
      fetchDetail(expandedId);
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi');
    } finally {
      setAddingItem(false);
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
              <ClipboardCheck size={20} className="text-[#D4AF37]" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-serif font-bold tracking-tight leading-none">
                Fiziki Sayımlar
              </h1>
              <p className="text-[11px] text-[var(--theme-text-muted)] uppercase tracking-[0.2em] mt-1">
                Stock Counts
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold tracking-wide transition-all active:scale-[0.97]"
            style={{ background: '#111111', color: '#ffffff', border: '1px solid rgba(255,255,255,0.16)' }}
          >
            <Plus size={15} /> Yeni Sayım
          </button>
        </motion.div>

        {/* ── Search ── */}
        <div className="relative max-w-xs">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)] pointer-events-none" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Sayım axtar..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm bg-white/[0.04] border border-white/[0.08] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none focus:border-[#D4AF37]/30 transition-colors"
          />
        </div>

        {/* ── List ── */}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 size={28} className="animate-spin text-white/15" />
          </div>
        ) : filteredCounts.length === 0 ? (
          <GlassCard intensity="light" padding="xl" className="text-center">
            <ClipboardCheck size={44} className="mx-auto mb-4 opacity-20 text-[var(--theme-text-muted)]" />
            <p className="text-sm font-medium text-[var(--theme-text-secondary)]">
              {search ? 'Axtarış nəticəsi tapılmadı' : 'Hələ sayım yaradılmayıb'}
            </p>
            {!search && (
              <div className="mt-4 space-y-2 text-xs text-[var(--theme-text-muted)]">
                <p>"Yeni Sayım" düyməsi ilə ilk fiziki sayımı yaradın</p>
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
                gridTemplateColumns: '1fr 100px 120px 140px 100px',
                background: 'rgba(255,255,255,0.018)',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <span>Sayım №</span>
              <span>Status</span>
              <span className="text-right">Fərq (₼)</span>
              <span className="text-right">Sayılma Tarixi</span>
              <span className="text-right">Sayyan</span>
            </div>

            {filteredCounts.map((count, i) => {
              const isExpanded = expandedId === count.id;
              return (
                <motion.div
                  key={count.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  {/* Main row */}
                  <div
                    onClick={() => handleExpand(count.id)}
                    className="group px-4 lg:px-6 py-4 transition-colors hover:bg-white/[0.018] cursor-pointer"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <div
                      className="hidden lg:grid gap-4 items-center"
                      style={{ gridTemplateColumns: '1fr 100px 120px 140px 100px' }}
                    >
                      <div className="min-w-0 flex items-center gap-3">
                        <ChevronDown
                          size={13}
                          className={`text-[var(--theme-text-muted)] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        />
                        <p className="text-sm font-semibold truncate">{count.count_number}</p>
                      </div>
                      <div>
                        <StatusBadge status={count.status} />
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold tabular-nums">
                          {count.total_variance !== 0 ? (
                            <span className={count.total_variance > 0 ? 'text-emerald-400' : 'text-red-400'}>
                              {count.total_variance > 0 ? '+' : ''}{fmtCurrency(count.total_variance)}
                            </span>
                          ) : (
                            <span className="text-[var(--theme-text-muted)]">₼0.00</span>
                          )}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-[var(--theme-text-secondary)]">{fmtDate(count.counted_at)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-[var(--theme-text-secondary)]">{count.counted_by || '—'}</span>
                      </div>
                    </div>

                    {/* Mobile card */}
                    <div className="lg:hidden space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 flex items-center gap-2">
                          <ChevronDown
                            size={13}
                            className={`text-[var(--theme-text-muted)] transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                          />
                          <p className="text-sm font-semibold">{count.count_number}</p>
                        </div>
                        <StatusBadge status={count.status} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-[var(--theme-text-muted)]">
                          <p>Sayılma: {fmtDate(count.counted_at)}</p>
                          {count.counted_by && <p>Sayyan: {count.counted_by}</p>}
                        </div>
                        <span className="text-sm font-bold tabular-nums">
                          {count.total_variance !== 0 ? (
                            <span className={count.total_variance > 0 ? 'text-emerald-400' : 'text-red-400'}>
                              {count.total_variance > 0 ? '+' : ''}{fmtCurrency(count.total_variance)}
                            </span>
                          ) : (
                            <span className="text-[var(--theme-text-muted)]">₼0.00</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ── Expanded Detail ── */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        key="detail"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="overflow-hidden"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                      >
                        <div className="px-4 lg:px-6 py-5 space-y-5" style={{ background: 'rgba(255,255,255,0.015)' }}>
                          {/* Quick actions */}
                          <div className="flex flex-wrap items-center gap-2">
                            {count.status === 'draft' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleStatusUpdate(count.id, 'in_progress'); }}
                                disabled={actionLoading === count.id}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 hover:bg-yellow-500/20 disabled:opacity-40"
                              >
                                {actionLoading === count.id ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                                Sayıma Başla
                              </button>
                            )}
                            {count.status === 'in_progress' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleStatusUpdate(count.id, 'completed'); }}
                                disabled={actionLoading === count.id}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-40"
                              >
                                {actionLoading === count.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                                Tamamla
                              </button>
                            )}
                            {count.status === 'completed' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleApply(count.id); }}
                                disabled={actionLoading === count.id}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 disabled:opacity-40"
                              >
                                {actionLoading === count.id ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                Tətbiq Et
                              </button>
                            )}
                            {(count.status === 'draft' || count.status === 'in_progress') && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleStatusUpdate(count.id, 'cancelled'); }}
                                disabled={actionLoading === count.id}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 disabled:opacity-40"
                              >
                                {actionLoading === count.id ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
                                Ləğv Et
                              </button>
                            )}
                            {count.notes && (
                              <span className="text-[11px] text-[var(--theme-text-muted)] ml-auto">
                                Qeyd: {count.notes}
                              </span>
                            )}
                          </div>

                          {/* Items table */}
                          {detailLoading ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 size={20} className="animate-spin text-white/15" />
                            </div>
                          ) : detailData ? (
                            <>
                              {detailData.items.length > 0 ? (
                                <div className="overflow-x-auto">
                                  <div
                                    className="hidden lg:grid gap-3 px-4 py-2 text-[10px] font-bold tracking-[0.1em] uppercase text-[var(--theme-text-muted)]"
                                    style={{
                                      gridTemplateColumns: '2fr 80px 80px 80px 100px',
                                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                                    }}
                                  >
                                    <span>İnqrediyent</span>
                                    <span className="text-right">Sistem</span>
                                    <span className="text-right">Faktiki</span>
                                    <span className="text-right">Fərq</span>
                                    <span className="text-right">Fərq (₼)</span>
                                  </div>
                                  {detailData.items.map((item) => {
                                    const name = item.ingredient_name || ingredientMap.get(item.ingredient_id) || 'Naməlum';
                                    const unit = item.unit || 'əd';
                                    return (
                                      <div
                                        key={item.id}
                                        className="hidden lg:grid gap-3 px-4 py-3 items-center text-sm"
                                        style={{
                                          gridTemplateColumns: '2fr 80px 80px 80px 100px',
                                          borderBottom: '1px solid rgba(255,255,255,0.03)',
                                        }}
                                      >
                                        <div className="min-w-0">
                                          <p className="text-sm font-medium truncate">{name}</p>
                                          <p className="text-[10px] text-[var(--theme-text-muted)]">{unit}</p>
                                        </div>
                                        <div className="text-right tabular-nums">
                                          {item.system_qty.toFixed(2)}
                                        </div>
                                        <div className="text-right tabular-nums">
                                          {item.actual_qty.toFixed(2)}
                                        </div>
                                        <div className={`text-right tabular-nums font-bold ${item.variance > 0 ? 'text-emerald-400' : item.variance < 0 ? 'text-red-400' : ''}`}>
                                          {item.variance > 0 ? '+' : ''}{item.variance.toFixed(2)}
                                        </div>
                                        <div className={`text-right tabular-nums font-bold ${item.variance_cost > 0 ? 'text-emerald-400' : item.variance_cost < 0 ? 'text-red-400' : ''}`}>
                                          {item.variance_cost > 0 ? '+' : ''}{fmtCurrency(item.variance_cost)}
                                        </div>
                                      </div>
                                    );
                                  })}

                                  {/* Mobile items */}
                                  <div className="lg:hidden space-y-2">
                                    {detailData.items.map((item) => {
                                      const name = item.ingredient_name || ingredientMap.get(item.ingredient_id) || 'Naməlum';
                                      const unit = item.unit || 'əd';
                                      return (
                                        <div
                                          key={item.id}
                                          className="p-3 rounded-xl space-y-2"
                                          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
                                        >
                                          <div className="flex items-start justify-between">
                                            <div className="min-w-0 flex-1">
                                              <p className="text-sm font-medium">{name}</p>
                                              <p className="text-[10px] text-[var(--theme-text-muted)]">{unit}</p>
                                            </div>
                                            <div className={`text-xs font-bold tabular-nums ${item.variance > 0 ? 'text-emerald-400' : item.variance < 0 ? 'text-red-400' : ''}`}>
                                              {item.variance > 0 ? '+' : ''}{item.variance.toFixed(2)}
                                            </div>
                                          </div>
                                          <div className="grid grid-cols-3 gap-2 text-[11px] text-[var(--theme-text-muted)]">
                                            <div>Sistem: <span className="text-white/70 tabular-nums">{item.system_qty.toFixed(2)}</span></div>
                                            <div>Faktiki: <span className="text-white/70 tabular-nums">{item.actual_qty.toFixed(2)}</span></div>
                                            <div className="text-right">₼ {fmtCurrency(item.variance_cost)}</div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <p className="text-sm text-[var(--theme-text-muted)] text-center py-4">
                                  Hələ məhsul əlavə edilməyib
                                </p>
                              )}

                              {/* Add item form */}
                              {(count.status === 'draft' || count.status === 'in_progress') && (
                                <div
                                  className="p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-end gap-3"
                                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
                                >
                                  <div className="flex-1 w-full sm:w-auto">
                                    <label className="text-[10px] text-white/35 font-semibold uppercase tracking-wider mb-1 block">
                                      İnqrediyent
                                    </label>
                                    <select
                                      value={addIngredientId}
                                      onChange={e => setAddIngredientId(e.target.value)}
                                      disabled={ingredientsLoading}
                                      className="w-full px-3 py-2.5 rounded-lg text-sm text-white bg-white/[0.04] border border-white/[0.08] outline-none focus:border-[#D4AF37]/30 transition-colors"
                                    >
                                      <option value="" style={{ background: '#111' }}>Seçin</option>
                                      {ingredients.map(ig => (
                                        <option key={ig.id} value={ig.id} style={{ background: '#111' }}>
                                          {ig.name} ({ig.unit})
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="w-full sm:w-28">
                                    <label className="text-[10px] text-white/35 font-semibold uppercase tracking-wider mb-1 block">
                                      Faktiki miqdar
                                    </label>
                                    <input
                                      type="number" min="0" step="0.001"
                                      value={addActualQty}
                                      onChange={e => setAddActualQty(e.target.value)}
                                      placeholder="0.00"
                                      className="w-full px-3 py-2.5 rounded-lg text-sm text-white bg-white/[0.04] border border-white/[0.08] outline-none focus:border-[#D4AF37]/30 transition-colors"
                                    />
                                  </div>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleAddItem(); }}
                                    disabled={addingItem}
                                    className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-[11px] font-bold transition-all disabled:opacity-40 active:scale-95"
                                    style={{ background: 'rgba(212,175,55,0.1)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.2)' }}
                                  >
                                    {addingItem ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                                    Əlavə et
                                  </button>
                                </div>
                              )}
                            </>
                          ) : null}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
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
                      <ClipboardCheck size={10} /> Yeni Sayım
                    </span>
                    <h2 className="text-xl font-bold">Fiziki sayım yarat</h2>
                  </div>
                  <button onClick={() => setShowCreate(false)} className="text-white/25 hover:text-white transition-colors mt-1">
                    <X size={18} />
                  </button>
                </div>

                {/* Count Number */}
                <div>
                  <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block">
                    Sayım nömrəsi <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={formCountNumber}
                    onChange={e => setFormCountNumber(e.target.value)}
                    placeholder="Məs: SAY-2026-001"
                    className="w-full px-4 py-3.5 rounded-xl text-sm text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block">
                    Qeyd <span className="text-white/20">— istəyə görə</span>
                  </label>
                  <textarea
                    value={formNotes}
                    onChange={e => setFormNotes(e.target.value)}
                    placeholder="Məs: Aylıq inventar..."
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
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <><ClipboardCheck size={15} /> Sayımı Yarat</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
