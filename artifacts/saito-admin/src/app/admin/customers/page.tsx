'use client';

// /admin/customers — focused customer workspace (SAITO UI VISUAL DIRECTION,
// ratified 2026-09-19 + Apple-level polish spec 2026-09-19: KPI cards, stat
// pills, chip favorites, carded list rows, search bar, framer-motion
// list<->profile transitions). No dashboard syndrome; no dead data — live
// stats come from the FROZEN timeline RPC (W-A3); backend unchanged.

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const MONTHS_AZ = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'İyn', 'İyl', 'Avq', 'Sen', 'Okt', 'Noy', 'Dek'];
const STATUS_AZ: Record<string, string> = {
  new: 'Yeni', confirmed: 'Qəbul', in_kitchen: 'Hazırlanır', ready: 'Hazır',
  paid: 'Ödənilib', closed: 'Bağlanıb', cancelled: 'Ləğv', voided: 'Ləğv',
};

function dayLabel(iso: string): string {
  const d = new Date(iso); const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return 'Bu gün';
  if (same(d, yest)) return 'Dünən';
  return `${d.getDate()} ${MONTHS_AZ[d.getMonth()]}`;
}
function hm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
const money = (n: number) => `₼${Number(n).toFixed(2)}`;

interface CustomerRow { id: string; name: string; phone?: string | null; }
interface Timeline {
  customer: { id: string; name: string; phone?: string | null; created_at: string };
  stats: { visit_count: number; total_spent: number; avg_order: number; first_visit: string | null; last_visit: string | null; items_ordered: number };
  orders: Array<{
    id: string; table_number: number | null; order_type: string; status: string;
    total_amount: number; paid_amount: number; created_at: string;
    items: Array<{ name: string; qty: number; unit_price: number; total_price: number }>;
    payments: Array<{ method: string; amount: number; status: string; is_refund: boolean }>;
  }>;
  favorites: Array<{ name: string; qty: number }>;
}
interface RowStats { visits: number; spent: number; last: string | null; }

const ChevronRight = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M9 18l6-6-6-6" /></svg>
);
const ChevronLeft = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M15 18l-6-6 6-6" /></svg>
);
const Magnifier = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></svg>
);

export default function CustomersPage() {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [rowStats, setRowStats] = useState<Record<string, RowStats>>({});
  const [selected, setSelected] = useState<CustomerRow | null>(null);
  const [tl, setTl] = useState<Timeline | null>(null);

  const loadList = useCallback(async (q: string) => {
    setRows(null);
    setRowStats({});
    try {
      const res = await fetch(`/api/customers?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      if (!res.ok) return;
      const d = await res.json();
      // Contract: /api/customers returns a RAW ARRAY (verified live 2026-09-19);
      // the object shape is tolerated for forward compatibility.
      const list: CustomerRow[] = Array.isArray(d) ? d : (Array.isArray(d?.customers) ? d.customers : []);
      // The route orders by the dead total_visits column (all zeros ->
      // arbitrary order); sort by name client-side for a deterministic list.
      list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'az'));
      setRows(list);
    } catch { setRows([]); }
  }, []);

  useEffect(() => { const t = setTimeout(() => loadList(query), 250); return () => clearTimeout(t); }, [query, loadList]);

  // Live list stats via the frozen timeline contract (limit=1 keeps payloads
  // small; stats are computed server-side regardless of limit).
  useEffect(() => {
    if (!rows || rows.length === 0) return;
    let cancelled = false;
    (async () => {
      const target = rows.slice(0, 50);
      for (let i = 0; i < target.length; i += 5) {
        const chunk = target.slice(i, i + 5);
        const out: Record<string, RowStats> = {};
        await Promise.all(chunk.map(async c => {
          try {
            const r = await fetch(`/api/customers/${c.id}/timeline?limit=1`, { cache: 'no-store' });
            if (!r.ok) return;
            const d = await r.json();
            if (d?.stats) out[c.id] = { visits: d.stats.visit_count, spent: Number(d.stats.total_spent), last: d.stats.last_visit };
          } catch { /* row stats stay empty — quiet */ }
        }));
        if (!cancelled) setRowStats(prev => ({ ...prev, ...out }));
      }
    })();
    return () => { cancelled = true; };
  }, [rows]);

  const openCustomer = useCallback(async (c: CustomerRow) => {
    setSelected(c);
    setTl(null);
    try {
      const res = await fetch(`/api/customers/${c.id}/timeline?limit=50`, { cache: 'no-store' });
      if (res.ok) setTl(await res.json());
    } catch { /* profile falls back to basic info */ }
  }, []);

  const closeCustomer = () => { setSelected(null); setTl(null); };

  // Timeline day-groups (computed for the detail view)
  const groups: Array<{ label: string; items: NonNullable<typeof tl>['orders'] }> = [];
  if (tl) {
    for (const o of tl.orders) {
      const label = dayLabel(o.created_at);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(o);
      else groups.push({ label, items: [o] });
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-5 py-8">
      <AnimatePresence mode="wait">
        {/* ── PROFILE VIEW ─────────────────────────────────────────────── */}
        {selected && (
          <motion.div key="detail"
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.25, ease: 'easeOut' }}>
            <button onClick={closeCustomer}
              className="group flex items-center gap-1.5 text-sm text-white/40 hover:text-white transition-colors">
              <span className="transition-transform duration-200 group-hover:-translate-x-1 inline-flex"><ChevronLeft className="w-4 h-4" /></span>
              Customers
            </button>

            {(() => { const c = tl?.customer || selected; const s = tl?.stats; return (
              <>
                <h1 className="text-2xl font-semibold text-white mt-7">{c.name || 'Customer'}</h1>
                {c.phone && <p className="text-sm font-mono text-white/40 mt-1">{c.phone}</p>}

                {/* KPI cards */}
                {s && (
                  <div className="grid grid-cols-3 gap-2 mt-6">
                    <div className="rounded-2xl bg-white/[0.03] border border-white/[0.04] px-4 py-3">
                      <p className="text-[11px] uppercase tracking-wider text-white/40">Ziyarət</p>
                      <p className="text-xl font-semibold text-white mt-1">{s.visit_count}</p>
                    </div>
                    <div className="rounded-2xl bg-white/[0.03] border border-white/[0.04] px-4 py-3">
                      <p className="text-[11px] uppercase tracking-wider text-white/40">Xərçəy</p>
                      <p className="text-xl font-semibold text-white mt-1 font-mono">{money(s.total_spent)}</p>
                    </div>
                    <div className="rounded-2xl bg-white/[0.03] border border-white/[0.04] px-4 py-3">
                      <p className="text-[11px] uppercase tracking-wider text-white/40">Orta adisyon</p>
                      <p className="text-xl font-semibold text-white mt-1 font-mono">{money(s.avg_order)}</p>
                    </div>
                  </div>
                )}
                {s && (
                  <p className="text-xs text-white/40 mt-3">
                    Son ziyarət <span className="text-white/70">{s.last_visit ? dayLabel(s.last_visit) : '—'}</span>
                    <span className="text-white/25 mx-2">·</span>
                    İlk ziyarət <span className="text-white/70">{s.first_visit ? dayLabel(s.first_visit) : '—'}</span>
                    <span className="text-white/25 mx-2">·</span>
                    <span className="text-white/70">{s.items_ordered} mövqe</span>
                  </p>
                )}

                {/* Favorites — chips */}
                {tl && tl.favorites.length > 0 && (
                  <div className="mt-6">
                    <p className="text-xs font-bold tracking-wider uppercase text-white/40 mb-2.5">Sevimlilər</p>
                    <div className="flex flex-wrap gap-2">
                      {tl.favorites.map(f => (
                        <span key={f.name} className="bg-white/10 px-3 py-1.5 rounded-lg">
                          <span className="text-sm text-white/70">{f.name}</span>
                          <span className="text-sm font-semibold text-white ml-1.5">×{f.qty}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Timeline */}
                <p className="text-xs font-bold tracking-wider uppercase text-white/40 mt-10 mb-3">Tarixçə</p>
                {!tl && <p className="text-sm text-white/40 py-4">Yüklənir…</p>}
                {tl && tl.orders.length === 0 && <p className="text-sm text-white/40 py-4">Hələ sifariş yoxdur.</p>}
                <div className="space-y-6">
                  {groups.map(g => (
                    <div key={g.label}>
                      <p className="text-xs font-bold tracking-wider uppercase text-white/40 mb-2">{g.label}</p>
                      <div className="space-y-2">
                        {g.items.map(o => {
                          const items = o.items.map(i => `${i.qty}× ${i.name}`).join(', ');
                          const pay = o.payments.filter(p => !p.is_refund).map(p => p.method).join('+');
                          return (
                            <div key={o.id} className="rounded-2xl bg-white/[0.02] border border-white/[0.04] px-4 py-3 flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <p className="text-xs text-white/40">
                                  <span className="font-mono">{hm(o.created_at)}</span>
                                  <span className="text-white/25 mx-1.5">·</span>
                                  {STATUS_AZ[o.status] || o.status}
                                  {o.table_number ? <span> · cədvəl {o.table_number}</span> : null}
                                </p>
                                {items && <p className="text-sm text-white/60 mt-1.5 truncate" title={items}>{items}</p>}
                                {pay && <p className="text-[11px] text-white/30 mt-1">{pay}</p>}
                              </div>
                              <p className="text-sm font-mono font-semibold text-white whitespace-nowrap pt-0.5">{money(o.total_amount)}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ); })()}
          </motion.div>
        )}

        {/* ── LIST VIEW ────────────────────────────────────────────────── */}
        {!selected && (
          <motion.div key="list"
            initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.25, ease: 'easeOut' }}>
            <h1 className="text-2xl font-semibold text-white">Customers</h1>

            {/* Search bar */}
            <div className="relative mt-6">
              <Magnifier className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Axtar (ad və ya telefon)…"
                className="w-full rounded-xl bg-white/[0.06] pl-10 pr-4 py-3 text-[15px] text-white placeholder:text-white/30 outline-none focus:ring-1 focus:ring-white/20 transition"
              />
            </div>

            <div className="mt-4 space-y-2">
              {rows === null && <p className="text-sm text-white/40 py-6">Yüklənir…</p>}
              {rows !== null && rows.length === 0 && (
                <p className="text-sm text-white/40 py-6">{query ? 'Tapılmadı.' : 'Customers yoxdur.'}</p>
              )}
              {rows?.map(c => {
                const s = rowStats[c.id];
                return (
                  <button key={c.id} onClick={() => openCustomer(c)}
                    className="group w-full flex items-center justify-between gap-4 px-4 py-3.5 rounded-2xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] transition-all duration-200 cursor-pointer active:scale-[0.99] text-left">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-base font-semibold text-white truncate">{c.name || 'Customer'}</span>
                        {c.phone && <span className="text-xs font-mono text-white/40 shrink-0">{c.phone}</span>}
                      </div>
                      {s && (
                        <div className="flex items-center gap-2 text-xs mt-2">
                          <span className="px-2 py-0.5 rounded-md bg-white/5 text-white/70 font-medium">{s.visits} ziyarət</span>
                          <span className="text-white/25">·</span>
                          <span className="text-emerald-400/90 font-medium font-mono">{money(s.spent)}</span>
                          <span className="text-white/25">·</span>
                          <span className="text-white/50">Son ziyarət: {s.last ? dayLabel(s.last) : '—'}</span>
                        </div>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/80 group-hover:translate-x-1 transition-all duration-200 shrink-0" />
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
