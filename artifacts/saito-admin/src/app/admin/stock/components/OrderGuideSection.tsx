'use client';

// 13c — Toast par-based order guide, SAITO premium: "one look → draft PO".
// Rows = ingredients below par (or empty/negative), 7-day demand-based
// suggested quantity, supplier-catalog price pre-filled. Select lines →
// "DRAFT PO Yarat" groups by supplier and creates draft POs (human sends).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, RefreshCw, FileText, AlertTriangle } from '@/components/ui/saito-icons';
import { toast } from '@/lib/toast';

interface GuideLine {
  ingredient_id: string; name: string; unit: string;
  current_stock: number; par: number; daily_rate: number; suggested_qty: number;
  supplier_id: string | null; supplier_name: string | null; unit_price: number | null;
  estimated_cost: number | null; negative: boolean;
}
interface Supplier { id: string; name: string; }

export default function OrderGuideSection() {
  const [lines, setLines] = useState<GuideLine[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSup, setFilterSup] = useState<string>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [recurring, setRecurring] = useState(false);
  const [creating, setCreating] = useState(false);

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
      // group by supplier (a line without a supplier is grouped under the
      // first real supplier only if there is exactly one — otherwise it is
      // skipped with a toast: a PO without a supplier cannot be sent).
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
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <button onClick={() => setFilterSup('')} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${!filterSup ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60'}`}>Hamısı</button>
            {suppliers.map(s => (
              <button key={s.id} onClick={() => setFilterSup(s.id)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${filterSup === s.id ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60'}`}>{s.name}</button>
            ))}
          </div>
          <button onClick={load} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-white/10 hover:bg-white/15 text-white/80 transition-all border border-white/10">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Yenilə
          </button>
        </div>
        {/* E2E r27 fix: explicit z + shrink-0 so the CDP hit-test can never
            resolve to the wrapping flex parent (the "occluded" click bug). */}
        <div className="relative z-10 flex items-center gap-3 shrink-0">
          <label className="flex items-center gap-2 text-[11px] font-bold text-white/50 cursor-pointer select-none shrink-0">
            <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} className="accent-emerald-500" />
            Həftəlik təkrar (Dü 09:00 draft)
          </label>
          <button
            type="button"
            onClick={createPo}
            disabled={creating || selectedLines.length === 0}
            className="relative z-10 flex items-center gap-2 px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
            Draft PO Yarat {selectedLines.length > 0 && `(${selectedLines.length})`}
          </button>
        </div>
      </div>

      {/* table */}
      <div className="rounded-3xl overflow-hidden border border-[var(--theme-border)] bg-[var(--theme-surface)]">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-white/40"><Loader2 size={22} className="animate-spin" /></div>
        ) : visible.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-sm font-bold text-white/60">Order guide boşdur</p>
            <p className="text-[11px] text-white/35 mt-1">Bütün maddələr par (critical limit) səviyyəsində və ya yuxarısındadır.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[9px] font-black uppercase tracking-[0.18em] text-white/35 border-b border-[var(--theme-border)]">
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
                      className={`border-b border-[var(--theme-border)] last:border-0 transition-colors hover:bg-white/[0.02] ${selected.has(l.ingredient_id) ? 'bg-emerald-500/[0.04]' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => toggle(l.ingredient_id)} className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${selected.has(l.ingredient_id) ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-white/20 text-transparent hover:border-white/50'}`}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M20 6L9 17l-5-5" /></svg>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-bold text-white">{l.name}</span>
                          {l.negative && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-[9px] font-black uppercase tracking-wider">
                              <AlertTriangle size={9} /> Nəfs
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-right text-[12px] font-bold tabular-nums ${l.negative ? 'text-rose-400' : 'text-white/70'}`}>{l.current_stock} {l.unit}</td>
                      <td className="px-4 py-3 text-right text-[12px] tabular-nums text-white/45">{l.par > 0 ? `${l.par} ${l.unit}` : '—'}</td>
                      <td className="px-4 py-3 text-right text-[12px] tabular-nums text-white/45">{l.daily_rate || 0} {l.unit}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[12px] font-black tabular-nums">{l.suggested_qty} {l.unit}</span>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-white/55 font-medium">{l.supplier_name || <span className="text-white/25">—</span>}</td>
                      <td className="px-4 py-3 text-right text-[12px] tabular-nums text-white/55">{l.unit_price != null ? `${l.unit_price} ₼` : '—'}</td>
                      <td className="px-4 py-3 text-right text-[12px] tabular-nums font-bold text-white/80">{l.estimated_cost != null ? `${l.estimated_cost.toLocaleString('az')} ₼` : '—'}</td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-white/30 leading-relaxed">
        Tövsiyə = 7 günlük tələb − cari stok (30 günlük faktiki sərfiyyat üzrə); nəfs stokka par-a qədər bərpa daxil edilir.
        Draft PO yaratdıqdan sonra Tədarükçülər/PO siyahısından baxıb <b>Göndər</b> edin — heç nə avtomatik göndərilmir.
      </p>
    </div>
  );
}
