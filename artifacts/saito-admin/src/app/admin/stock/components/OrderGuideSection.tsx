'use client';

// 13c — Toast par-based order guide, SAITO premium: "one look → draft PO".
// 13i — restyled fully theme-var based (was hardcoded white — light-mode bug)
// and gains `autoSelectId`: the "Sifariş et" CTA on a stock suggestion
// pre-selects that line here and scrolls to the table (dead-link fix).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, RefreshCw, FileText, AlertTriangle } from '@/components/ui/saito-icons';
import { toast } from '@/lib/toast';
import { useTheme } from '@/lib/theme/ThemeContext';
import { fmtNum, fmtQty, fmtAZN } from '../stock-ui';

interface GuideLine {
  ingredient_id: string; name: string; unit: string;
  current_stock: number; par: number; daily_rate: number; suggested_qty: number;
  supplier_id: string | null; supplier_name: string | null; unit_price: number | null;
  estimated_cost: number | null; negative: boolean;
}
interface Supplier { id: string; name: string; }

export default function OrderGuideSection({ autoSelectId }: { autoSelectId?: string | null }) {
  const { lightMode: light } = useTheme();
  const [lines, setLines] = useState<GuideLine[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSup, setFilterSup] = useState<string>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [recurring, setRecurring] = useState(false);
  const [creating, setCreating] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [gRes, sRes] = await Promise.all([
        fetch('/api/stock/order-guide'),
        fetch('/api/suppliers'),
      ]);
      const g = await gRes.json();
      setLines(g.lines || []);
      const s = await sRes.json();
      setSuppliers(Array.isArray(s) ? s : []);
    } catch {
      toast.error('Order guide yüklənə bilmədi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // 13i dead-link fix: preselect a suggested ingredient + scroll to the table.
  useEffect(() => {
    if (!autoSelectId || loading) return;
    setSelected(prev => { const n = new Set(prev); n.add(autoSelectId); return n; });
    const t = setTimeout(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    return () => clearTimeout(t);
  }, [autoSelectId, loading]);

  const visible = useMemo(
    () => (filterSup ? lines.filter(l => (l.supplier_id ?? '') === filterSup) : lines),
    [lines, filterSup]
  );

  const toggle = (id: string) => {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const selectedLines = visible.filter(l => selected.has(l.ingredient_id));

  const createPo = async () => {
    if (selectedLines.length === 0) { toast.error('Əvvəl sətir seç'); return; }
    setCreating(true);
    try {
      // group by supplier — a line without a supplier is skipped with a toast
      // (a PO without a supplier cannot be sent).
      const bySup = new Map<string, GuideLine[]>();
      for (const l of selectedLines) {
        if (!l.supplier_id) continue;
        bySup.set(l.supplier_id, [...(bySup.get(l.supplier_id) || []), l]);
      }
      const skipped = selectedLines.length - [...bySup.values()].reduce((s, a) => s + a.length, 0);
      if (bySup.size === 0) {
        toast.error('Seçili sətirlərdə heç biri tədarükçü ilə bağlanmayıb — əvvəl Tədarükçülər-də kataloq maddəsi yaradın');
        return;
      }
      let created = 0;
      for (const [supplierId, ls] of bySup) {
        const res = await fetch('/api/purchase-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            supplier_id: supplierId,
            recurring_weekly: recurring,
            notes: `Order guide (${ls.length} maddə)` + (recurring ? ' · həftəlik təkrar' : ''),
            items: ls.map(l => ({
              ingredient_id: l.ingredient_id,
              product_name: l.name,
              quantity: l.suggested_qty,
              unit: l.unit,
              unit_cost: l.unit_price ?? 0,
            })),
          }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
        created += 1;
      }
      toast.success(`${created} draft PO yaradıldı${skipped > 0 ? ` (${skipped} sətir tədarükçüsüz — atlandı)` : ''}`);
      setSelected(new Set());
      setRecurring(false);
      load();
    } catch (e: any) {
      toast.error(e.message || 'PO yaratma xətası');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] flex-wrap">
            <button onClick={() => setFilterSup('')} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${!filterSup ? 'bg-[var(--theme-text)] text-[var(--theme-bg)]' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]'}`}>Hamısı</button>
            {suppliers.map(s => (
              <button key={s.id} onClick={() => setFilterSup(s.id)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${filterSup === s.id ? 'bg-[var(--theme-text)] text-[var(--theme-bg)]' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]'}`}>{s.name}</button>
            ))}
          </div>
          <button onClick={load} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-[var(--theme-surface-soft)] hover:bg-[var(--theme-surface)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-all border border-[var(--theme-border)]">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Yenilə
          </button>
        </div>
        {/* E2E r27: explicit z + shrink-0 so the CDP hit-test can never resolve
            to the wrapping flex parent (the "occluded" click bug). */}
        <div className="relative z-10 flex items-center gap-3 shrink-0 flex-wrap">
          <label className="flex items-center gap-2 text-[11px] font-bold text-[var(--theme-text-muted)] cursor-pointer select-none shrink-0">
            <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} className="accent-emerald-500" />
            Həftəlik təkrar (Dü 09:00 draft)
          </label>
          <button
            type="button"
            onClick={createPo}
            disabled={creating || selectedLines.length === 0}
            // 13m D17: emerald-500 + white looks "disabled" on white (light mode) — deeper 600.
            className="relative z-10 flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-500 light:bg-emerald-600 hover:bg-emerald-600 light:hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 light:shadow-emerald-600/20 transition-all active:scale-[0.97]"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
            Draft PO Yarat {selectedLines.length > 0 && `(${selectedLines.length})`}
          </button>
        </div>
      </div>

      {/* table */}
      <div ref={tableRef} className="rounded-2xl overflow-hidden border border-[var(--theme-border)] bg-[var(--theme-surface)] scroll-mt-24">
        {loading ? (
          // 13m D20: reserved skeleton (was empty + lone spinner — the 2-column
          // "Nə Alım" right side looked broken while loading)
          <div className="divide-y divide-[var(--theme-border)]">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                <div className="w-5 h-5 rounded-md bg-[var(--theme-surface-soft)] animate-pulse" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 rounded bg-[var(--theme-surface-soft)] animate-pulse" style={{ width: `${55 - i * 7}%` }} />
                  <div className="h-2.5 w-1/3 rounded bg-[var(--theme-surface-soft)]/70 animate-pulse" />
                </div>
                <div className="w-16 h-3 rounded bg-[var(--theme-surface-soft)] animate-pulse" />
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-sm font-bold text-[var(--theme-text-secondary)]">Order guide boşdur</p>
            <p className="text-[11px] text-[var(--theme-text-muted)] mt-1">Bütün maddələr par (critical limit) səviyyəsində və ya yuxarısındadır.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--theme-text-muted)] border-b border-[var(--theme-border)]">
                  <th className="px-4 py-3 w-10"></th>
                  <th className="px-4 py-3">Maddə</th>
                  <th className="px-4 py-3 text-right">Cari</th>
                  <th className="px-4 py-3 text-right">Par</th>
                  <th className="px-4 py-3 text-right">Günlük</th>
                  <th className="px-4 py-3 text-right">Tövsiyə</th>
                  <th className="px-4 py-3">Tədarükçü</th>
                  <th className="px-4 py-3 text-right">Qiymət</th>
                  <th className="px-4 py-3 text-right">Məbləğ</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {visible.map(l => (
                    <motion.tr
                      key={l.ingredient_id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className={`border-b border-[var(--theme-border)] last:border-0 transition-colors hover:bg-[var(--theme-surface-soft)]/50 ${selected.has(l.ingredient_id) ? 'bg-emerald-500/[0.06]' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => toggle(l.ingredient_id)} className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all active:scale-90 ${selected.has(l.ingredient_id) ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-[var(--theme-text-muted)]/40 text-transparent hover:border-[var(--theme-text-muted)]'}`}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M20 6L9 17l-5-5" /></svg>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-bold text-[var(--theme-text)]">{l.name}</span>
                          {l.negative && (
                            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wider ${light ? 'bg-rose-500/10 border-rose-500/30 text-rose-600' : ''}`}>
                              <AlertTriangle size={9} /> Nəfs
                            </span>
                          )}
                        </div>
                      </td>
                      {/* 13m D9: one formatter source (grouping + decimals) */}
                      <td className={`px-4 py-3 text-right text-[12px] font-bold tabular-nums ${l.negative ? (light ? 'text-red-600' : 'text-rose-400') : 'text-[var(--theme-text-secondary)]'}`}>{fmtQty(l.current_stock)} {l.unit}</td>
                      <td className="px-4 py-3 text-right text-[12px] tabular-nums text-[var(--theme-text-muted)]">{l.par > 0 ? `${fmtNum(l.par, 1)} ${l.unit}` : '—'}</td>
                      <td className="px-4 py-3 text-right text-[12px] tabular-nums text-[var(--theme-text-muted)]">{fmtNum(l.daily_rate, 1)} {l.unit}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-500 light:text-emerald-700 text-[12px] font-black tabular-nums">{fmtNum(l.suggested_qty, 1)} {l.unit}</span>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-[var(--theme-text-secondary)] font-medium">{l.supplier_name || <span className="text-[var(--theme-text-muted)]/50">—</span>}</td>
                      <td className="px-4 py-3 text-right text-[12px] tabular-nums text-[var(--theme-text-secondary)]">{l.unit_price != null ? fmtAZN(l.unit_price) : '—'}</td>
                      <td className="px-4 py-3 text-right text-[12px] tabular-nums font-bold text-[var(--theme-text)]">{l.estimated_cost != null ? fmtAZN(l.estimated_cost) : '—'}</td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--theme-text-muted)] leading-relaxed">
        Tövsiyə = 7 günlük tələb − cari stok (30 günlük faktiki sərfiyyat üzrə); nəfs stokka par-a qədər bərpa daxil edilir.
        Draft PO yaratdıqdan sonra Sifarişlər siyahısından baxıb <b>Göndər</b> edin — heç nə avtomatik göndərilmir.
      </p>
    </div>
  );
}
