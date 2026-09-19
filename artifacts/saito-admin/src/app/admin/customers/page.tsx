'use client';

// /admin/customers — v4 "Apple senior pass" (user-ratified 2026-09-19):
// SURFACES, not cards: vibrant sidebar (backdrop blur + single divider) |
// containerless workspace (content on the window, border-b header only).
// Motion = state, never decoration: selection pill morph (layoutId, the only
// spring), row->header name morph, layout reflow on filter, fade-in on data
// arrival, bar width reveal (spatial magnitude), error shake. No count-up,
// no hover-fly, no stagger beyond 8. tabular-nums everywhere. One semantic
// accent: 30-day spend delta (soft emerald up / dim down). prefers-reduced-
// motion kills all of it. Data layer FROZEN (W-A3 timeline RPC); "Duzenle /
// Sifaris yarat" header actions still omitted (no contract — frozen, W-A4
// candidate).

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

const MONTHS_AZ = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'İyn', 'İyl', 'Avq', 'Sen', 'Okt', 'Noy', 'Dek'];
const STATUS_AZ: Record<string, string> = {
  new: 'Yeni', confirmed: 'Qəbul', in_kitchen: 'Hazırlanır', ready: 'Hazır',
  paid: 'Ödənilib', closed: 'Bağlanıb', cancelled: 'Ləğv', voided: 'Ləğv',
};
const DAY = 86400000;

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
const LIVE = (s: string) => s !== 'cancelled' && s !== 'voided' && s !== 'closed';

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

const IconSearch = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></svg>
);
const IconX = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M18 6L6 18M6 6l12 12" /></svg>
);

export default function CustomersPage() {
  const reduce = useReducedMotion() ?? false;
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [rowsErr, setRowsErr] = useState(false);
  const [rowStats, setRowStats] = useState<Record<string, RowStats>>({});
  const [selected, setSelected] = useState<CustomerRow | null>(null);
  const [tl, setTl] = useState<Timeline | null>(null);
  const [tlErr, setTlErr] = useState(false);

  const loadList = useCallback(async (q: string) => {
    setRows(null);
    setRowsErr(false);
    setRowStats({});
    try {
      const res = await fetch(`/api/customers?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      // Contract: /api/customers returns a RAW ARRAY (verified live 2026-09-19).
      const list: CustomerRow[] = Array.isArray(d) ? d : (Array.isArray(d?.customers) ? d.customers : []);
      // Route orders by the dead total_visits column (all zeros -> arbitrary);
      // sort by name client-side for a deterministic list.
      list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'az'));
      setRows(list);
    } catch { setRows([]); setRowsErr(true); }
  }, []);

  useEffect(() => { const t = setTimeout(() => loadList(query), 250); return () => clearTimeout(t); }, [query, loadList]);

  // Master-Detail: first customer auto-selected (workspace never empty).
  useEffect(() => {
    if (rows && rows.length > 0 && !selected) setSelected(rows[0]);
  }, [rows, selected]);

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
    setTlErr(false);
    try {
      const res = await fetch(`/api/customers/${c.id}/timeline?limit=50`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      setTl(await res.json());
    } catch { setTlErr(true); }
  }, []);

  // Timeline day-groups
  const groups: Array<{ label: string; items: NonNullable<typeof tl>['orders'] }> = [];
  if (tl) {
    for (const o of tl.orders) {
      const label = dayLabel(o.created_at);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(o);
      else groups.push({ label, items: [o] });
    }
  }
  // 30-day delta (the page's single semantic accent) — computed from the
  // frozen contract's orders (display metric, approx over last 50 orders).
  let spend30 = 0, spendPrev30 = 0;
  if (tl) for (const o of tl.orders) {
    if (!LIVE(o.status)) continue;
    const age = Date.now() - new Date(o.created_at).getTime();
    if (age <= 30 * DAY) spend30 += o.total_amount;
    else if (age <= 60 * DAY) spendPrev30 += o.total_amount;
  }
  const delta = spend30 - spendPrev30;
  const showDelta = (spend30 > 0 || spendPrev30 > 0) && tl;
  const favTotal = tl ? tl.favorites.reduce((s, f) => s + f.qty, 0) : 0;

  // Durations (0 under reduced motion)
  const d1 = reduce ? 0 : 0.15, d2 = reduce ? 0 : 0.25, d3 = reduce ? 0 : 0.4;

  return (
    <div className="h-full min-h-0 flex w-full overflow-hidden">
      {/* ── LEFT: vibrant sidebar (material, not card) ───────────────────── */}
      <aside className="w-80 shrink-0 border-r border-white/10 bg-white/[0.02] backdrop-blur-2xl flex flex-col min-h-0">
        <div className="p-4 border-b border-white/5">
          <h1 className="text-lg font-bold text-white tracking-tight">Müştərilər</h1>
          {/* Spotlight-style search */}
          <div className="relative group mt-3">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 transition-colors duration-150 group-focus-within:text-white/50" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Axtar…"
              className="w-full bg-white/[0.04] border border-white/10 rounded-lg pl-8 pr-8 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:bg-white/[0.08] focus-visible:ring-1 focus-visible:ring-white/40 transition-all duration-150"
            />
            <AnimatePresence>
              {query && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: d1 }}
                  onClick={() => setQuery('')}
                  aria-label="Axtarışı təmizlə"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors duration-150">
                  <IconX className="w-3.5 h-3.5" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Native rows — selection pill morphs between rows (the only spring) */}
        <motion.div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-0.5 [scrollbar-width:thin]"
          animate={rowsErr ? { x: [0, -4, 4, -3, 3, 0] } : {}} transition={{ duration: reduce ? 0 : 0.3 }}>
          {rows === null && <p className="text-xs text-white/40 py-3 px-2">Yüklənir…</p>}
          {rows !== null && rows.length === 0 && (
            <div className="py-3 px-2">
              {rowsErr ? (
                <p className="text-xs text-white/40">Yüklənə bilmədi ·{' '}
                  <button onClick={() => loadList(query)} className="text-white/70 underline underline-offset-2 hover:text-white transition-colors duration-150">yenidən</button>
                </p>
              ) : (
                <p className="text-xs text-white/40">{query ? 'Tapılmadı.' : 'Customers yoxdur.'}</p>
              )}
            </div>
          )}
          <AnimatePresence mode="popLayout">
            {rows?.map((c, i) => {
              const s = rowStats[c.id];
              const active = selected?.id === c.id;
              return (
                <motion.button
                  key={c.id}
                  layout
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: d1, delay: reduce ? 0 : Math.min(i * 0.02, 0.16) }}
                  whileTap={reduce ? undefined : { scale: 0.98 }}
                  onClick={() => openCustomer(c)}
                  className={`relative w-full text-left px-3 py-2.5 rounded-xl transition-colors duration-150 text-xs ${
                    active ? 'text-white' : 'text-white/60 hover:bg-white/[0.04] hover:text-white'
                  }`}>
                  {active && (
                    <motion.span layoutId="cust-row-pill"
                      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 32 }}
                      className="absolute inset-0 rounded-xl bg-white/10" />
                  )}
                  <span className="relative flex items-center justify-between gap-3">
                    <span className="truncate pr-2 min-w-0">
                      <span className={`block truncate font-semibold ${active ? 'text-white' : ''}`}>
                        {active && <motion.span layoutId={`cust-name-${c.id}`}>{c.name || 'Customer'}</motion.span>}
                        {!active && (c.name || 'Customer')}
                      </span>
                      {c.phone && <span className="block text-[10px] font-mono text-white/40 tabular-nums truncate">{c.phone}</span>}
                    </span>
                    <span className="text-right shrink-0">
                      {s && (
                        <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: d2 }} className="block">
                          {s.spent > 0 && <span className="block font-mono tabular-nums text-white/90 font-medium">{money(s.spent)}</span>}
                          <span className="block text-[9px] text-white/40 tabular-nums">{s.visits} ziyarət</span>
                        </motion.span>
                      )}
                    </span>
                  </span>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </motion.div>
      </aside>

      {/* ── RIGHT: containerless workspace (content on the window) ───────── */}
      <main className="flex-1 min-w-0 overflow-y-auto p-8 [scrollbar-width:thin]">
        {!selected && (
          <div className="h-full flex items-center justify-center text-white/30 text-sm">
            Müştəri seçilməyib
          </div>
        )}
        {selected && (
          <div className="max-w-5xl w-full mx-auto">
            <AnimatePresence mode="wait">
              <motion.div key={selected.id}
                initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }} transition={{ duration: d2, ease: 'easeOut' }}>
                {/* error shake (state feedback, not decoration) */}
                <motion.div animate={tlErr ? { x: [0, -4, 4, -3, 3, 0] } : { x: 0 }}
                  transition={{ duration: reduce ? 0 : 0.3 }}>
                {(() => {
                  const c = tl?.customer || selected;
                  const s = tl?.stats;
                  return (
                    <>
                      {/* Header — the row's name morphs into this headline */}
                      <div className="flex items-start justify-between gap-6 border-b border-white/10 pb-6">
                        <div className="min-w-0">
                          <h2 className="text-3xl font-bold text-white tracking-tight truncate">
                            <motion.span layoutId={`cust-name-${selected.id}`}>{c.name || 'Customer'}</motion.span>
                          </h2>
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            {c.phone && <p className="text-sm font-mono text-white/40 tabular-nums">{c.phone}</p>}
                            {s && (
                              <p className="text-xs text-white/30 tabular-nums">
                                ilk ziyarət {s.first_visit ? dayLabel(s.first_visit) : '—'}
                                <span className="mx-1.5 text-white/20">·</span>
                                {s.items_ordered} mövqe
                              </p>
                            )}
                            {showDelta && (
                              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: d2, delay: reduce ? 0 : 0.1 }}
                                className="text-xs tabular-nums text-white/50">
                                Son 30 gün: <span className="text-white/80 font-medium">{money(spend30)}</span>
                                {Math.abs(delta) >= 0.005 && (
                                  <span className={`ml-2 font-medium ${delta > 0 ? 'text-emerald-400/80' : 'text-white/40'}`}>
                                    {delta > 0 ? '▲ +' : '▼ −'}{money(Math.abs(delta)).replace('₼', '₼')}
                                  </span>
                                )}
                              </motion.p>
                            )}
                          </div>
                        </div>
                        {/* Executive Metric Bar — the single glass surface */}
                        {s && (
                          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: d2 }}
                            className="flex items-center gap-6 bg-white/[0.03] border border-white/10 px-6 py-3 rounded-2xl backdrop-blur-md shrink-0">
                            <div>
                              <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Ziyarət</p>
                              <p className="text-lg font-bold text-white tabular-nums">{s.visit_count}</p>
                            </div>
                            <div className="h-8 w-[1px] bg-white/10" />
                            <div>
                              <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Ümumi Xərc</p>
                              <p className="text-lg font-bold text-white font-mono tabular-nums">{money(s.total_spent)}</p>
                            </div>
                            <div className="h-8 w-[1px] bg-white/10" />
                            <div>
                              <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Ortalama</p>
                              <p className="text-lg font-bold text-white/80 font-mono tabular-nums">{money(s.avg_order)}</p>
                            </div>
                          </motion.div>
                        )}
                      </div>

                      {tlErr && (
                        <p className="mt-4 text-xs text-white/40">
                          Yüklənə bilmədi ·{' '}
                          <button onClick={() => openCustomer(selected)} className="text-white/70 underline underline-offset-2 hover:text-white transition-colors duration-150">yenidən dene</button>
                        </p>
                      )}

                      {/* Body: activity stream (2/3) | product visualizer (1/3) */}
                      <div className="grid grid-cols-3 gap-8 mt-8">
                        <div className="col-span-2">
                          <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest">Sifariş Tarixçəsi</h3>
                          {!tl && !tlErr && <p className="text-sm text-white/40 py-6">Yüklənir…</p>}
                          {tl && tl.orders.length === 0 && <p className="text-sm text-white/40 py-6">Hələ sifariş yoxdur.</p>}
                          {tl && tl.orders.length > 0 && (
                            <div className="relative mt-5 pl-6">
                              <div className="absolute left-[3px] top-1.5 bottom-1.5 w-px bg-white/10" />
                              <div className="space-y-6">
                                {groups.map(g => (
                                  <div key={g.label} className="relative">
                                    <span className="absolute -left-6 top-[3px] w-[7px] h-[7px] rounded-full bg-white/40 ring-4 ring-white/[0.04]" />
                                    <p className="text-[11px] font-bold tracking-wider uppercase text-white/50">{g.label}</p>
                                    <div className="mt-2.5 space-y-4">
                                      {g.items.map(o => {
                                        const items = o.items.map(i => `${i.qty}× ${i.name}`).join(', ');
                                        const pay = o.payments.filter(p => !p.is_refund).map(p => p.method).join('+');
                                        return (
                                          <div key={o.id}>
                                            <div className="flex items-baseline justify-between gap-4">
                                              <p className="text-xs text-white/40 tabular-nums">
                                                <span className="font-mono text-white/60">{hm(o.created_at)}</span>
                                                <span className="text-white/20 mx-1.5">·</span>
                                                {STATUS_AZ[o.status] || o.status}
                                                {o.table_number ? <span> · cədvəl {o.table_number}</span> : null}
                                              </p>
                                              <p className="text-sm font-mono font-semibold text-white tabular-nums whitespace-nowrap">{money(o.total_amount)}</p>
                                            </div>
                                            {items && <p className="text-sm text-white/55 mt-1 leading-relaxed">{items}</p>}
                                            {pay && <p className="text-[11px] text-white/25 mt-0.5">{pay}</p>}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div>
                          <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest">Çox Sifariş Edilənlər</h3>
                          {!tl || tl.favorites.length === 0
                            ? <p className="text-sm text-white/40 py-6">Yoxdur.</p>
                            : (
                              <div className="mt-4 space-y-4">
                                {tl.favorites.slice(0, 5).map((f, i) => {
                                  const pct = favTotal ? Math.round((f.qty / favTotal) * 100) : 0;
                                  return (
                                    <div key={f.name} className="flex items-center gap-3">
                                      <span className="w-9 h-9 rounded-lg bg-white/[0.06] border border-white/[0.06] flex items-center justify-center text-sm font-semibold text-white/70 shrink-0">
                                        {(f.name || '?').charAt(0).toUpperCase()}
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline justify-between gap-2">
                                          <p className="text-xs font-medium text-white/70 truncate" title={f.name}>{f.name}</p>
                                          <p className="text-[10px] font-mono text-white/40 tabular-nums shrink-0">%{pct}</p>
                                        </div>
                                        <div className="flex items-center gap-2 mt-1.5">
                                          <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
                                            <motion.div
                                              initial={{ width: 0 }}
                                              animate={{ width: `${Math.max(8, pct)}%` }}
                                              transition={{ duration: d3, delay: reduce ? 0 : 0.15 + i * 0.05, ease: 'easeOut' }}
                                              className="h-full rounded-full bg-white/50" />
                                          </div>
                                          <p className="text-[10px] font-mono text-white/35 tabular-nums shrink-0">×{f.qty}</p>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                        </div>
                      </div>
                    </>
                  );
                })()}
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
}
