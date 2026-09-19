'use client';

// /admin/customers — Master-Detail (macOS Mail/Notes pattern, user spec
// 2026-09-19 v2): left = customer list + search (380px), right = full-width
// profile detail (KPI cards, favorites with progress bars, timeline).
// Subtle monochrome palette: bg-white/[0.02] panels, border-white/[0.06],
// rounded-2xl panels / rounded-xl cards, no saturated accents (amounts =
// white semibold mono). Data layer FROZEN (W-A3 timeline RPC) — backend
// unchanged. Note: "Düzənlə / Sifariş yarat" header actions are OMITTED —
// no edit-customer / create-order-for-customer contract exists (frozen);
// reported as contract gap, not silently faked.

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

const IconSearch = ({ className = '' }: { className?: string }) => (
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
      // Contract: /api/customers returns a RAW ARRAY (verified live 2026-09-19).
      const list: CustomerRow[] = Array.isArray(d) ? d : (Array.isArray(d?.customers) ? d.customers : []);
      // Route orders by the dead total_visits column (all zeros -> arbitrary);
      // sort by name client-side for a deterministic list.
      list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'az'));
      setRows(list);
    } catch { setRows([]); }
  }, []);

  useEffect(() => { const t = setTimeout(() => loadList(query), 250); return () => clearTimeout(t); }, [query, loadList]);

  // Master-Detail: first customer auto-selected (detail is never empty).
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
    try {
      const res = await fetch(`/api/customers/${c.id}/timeline?limit=50`, { cache: 'no-store' });
      if (res.ok) setTl(await res.json());
    } catch { /* profile falls back to basic info */ }
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
  const maxFav = tl && tl.favorites.length > 0 ? Math.max(...tl.favorites.map(f => f.qty)) : 0;

  return (
    <div className="h-full min-h-0 flex gap-4 items-stretch py-1">
      {/* ── LEFT: master list (macOS Mail/Notes pattern) ─────────────────── */}
      <div className="w-[380px] shrink-0 flex flex-col rounded-2xl bg-white/[0.02] border border-white/[0.06] p-4 min-h-0">
        <div className="flex items-center justify-between px-1">
          <h1 className="text-xl font-bold text-white tracking-tight">Müştərilər</h1>
          <span className="text-xs text-white/40 font-mono">{rows ? `${rows.length} kişi` : ''}</span>
        </div>

        {/* Search */}
        <div className="relative mt-3">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Axtar (ad və ya telefon)…"
            className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-all"
          />
        </div>

        {/* List */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1 mt-3 [scrollbar-width:thin]">
          {rows === null && <p className="text-sm text-white/40 py-4">Yüklənir…</p>}
          {rows !== null && rows.length === 0 && (
            <p className="text-sm text-white/40 py-4">{query ? 'Tapılmadı.' : 'Customers yoxdur.'}</p>
          )}
          {rows?.map(c => {
            const s = rowStats[c.id];
            const active = selected?.id === c.id;
            return (
              <button key={c.id} onClick={() => openCustomer(c)}
                className={`w-full p-3.5 rounded-xl transition-all cursor-pointer text-left border ${
                  active
                    ? 'bg-white/[0.08] border-white/20'
                    : 'bg-transparent border-transparent hover:bg-white/[0.04]'
                }`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{c.name || 'Customer'}</p>
                    {c.phone && <p className="text-xs font-mono text-white/40 mt-0.5 truncate">{c.phone}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    {s && s.spent > 0 && <p className="text-xs font-mono font-semibold text-white/90">{money(s.spent)}</p>}
                    {s && <p className="text-[10px] text-white/40 mt-0.5">{s.visits} ziyarət</p>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── RIGHT: detail panel (full remaining width) ───────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col rounded-2xl bg-white/[0.02] border border-white/[0.06] min-h-0">
        {!selected && (
          <div className="flex-1 flex items-center justify-center text-white/30 text-sm">
            Müştəri seçilməyib
          </div>
        )}
        {selected && (
          <div className="flex-1 min-h-0 overflow-y-auto p-6 [scrollbar-width:thin]">
            <AnimatePresence mode="wait">
              <motion.div key={selected.id}
                initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
                {(() => {
                  const c = tl?.customer || selected;
                  const s = tl?.stats;
                  return (
                    <>
                      {/* Profile header */}
                      <div className="flex items-end justify-between gap-4">
                        <div className="min-w-0">
                          <h2 className="text-2xl font-semibold text-white tracking-tight truncate">{c.name || 'Customer'}</h2>
                          {c.phone && <p className="text-sm font-mono text-white/40 mt-1">{c.phone}</p>}
                        </div>
                        {s && (
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="px-2.5 py-1 rounded-lg bg-white/5 text-xs text-white/70 font-medium">{s.visit_count} ziyarət</span>
                            <span className="px-2.5 py-1 rounded-lg bg-white/5 text-xs text-white/70 font-medium">ilk: {s.first_visit ? dayLabel(s.first_visit) : '—'}</span>
                          </div>
                        )}
                      </div>

                      {/* Two-column body: stats+favorites | timeline */}
                      <div className="grid grid-cols-5 gap-4 mt-6 items-start">
                        {/* Middle-left: KPI + favorites */}
                        <div className="col-span-2 space-y-5">
                          {s && (
                            <div className="grid grid-cols-3 gap-2">
                              <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] px-3 py-3">
                                <p className="text-[10px] uppercase tracking-wider text-white/40">Xərçəy</p>
                                <p className="text-lg font-mono font-semibold text-white mt-1 whitespace-nowrap">{money(s.total_spent)}</p>
                              </div>
                              <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] px-3 py-3">
                                <p className="text-[10px] uppercase tracking-wider text-white/40">Orta</p>
                                <p className="text-lg font-mono font-semibold text-white mt-1 whitespace-nowrap">{money(s.avg_order)}</p>
                              </div>
                              <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] px-3 py-3">
                                <p className="text-[10px] uppercase tracking-wider text-white/40">Mövqe</p>
                                <p className="text-lg font-mono font-semibold text-white mt-1">{s.items_ordered}</p>
                              </div>
                            </div>
                          )}

                          {/* Favorites with quiet progress bars */}
                          {tl && tl.favorites.length > 0 && (
                            <div>
                              <p className="text-xs font-bold tracking-wider uppercase text-white/40 mb-3">Ən çox aldığı məhsullar</p>
                              <div className="space-y-2.5">
                                {tl.favorites.slice(0, 5).map(f => (
                                  <div key={f.name} className="flex items-center gap-3">
                                    <p className="text-sm text-white/60 truncate w-[55%]" title={f.name}>{f.name}</p>
                                    <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
                                      <div className="h-full rounded-full bg-white/50" style={{ width: `${maxFav ? Math.max(8, Math.round((f.qty / maxFav) * 100)) : 8}%` }} />
                                    </div>
                                    <p className="text-xs font-mono text-white/40 w-7 text-right shrink-0">×{f.qty}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Right: timeline */}
                        <div className="col-span-3">
                          <p className="text-xs font-bold tracking-wider uppercase text-white/40 mb-3">Tarixçə</p>
                          {!tl && <p className="text-sm text-white/40 py-4">Yüklənir…</p>}
                          {tl && tl.orders.length === 0 && <p className="text-sm text-white/40 py-4">Hələ sifariş yoxdur.</p>}
                          <div className="space-y-5">
                            {groups.map(g => (
                              <div key={g.label}>
                                <p className="text-xs font-bold tracking-wider uppercase text-white/40 mb-2">{g.label}</p>
                                <div className="space-y-2">
                                  {g.items.map(o => {
                                    const items = o.items.map(i => `${i.qty}× ${i.name}`).join(', ');
                                    const pay = o.payments.filter(p => !p.is_refund).map(p => p.method).join('+');
                                    return (
                                      <div key={o.id} className="rounded-xl bg-white/[0.02] border border-white/[0.06] px-4 py-3 flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                          <p className="text-xs text-white/40">
                                            <span className="font-mono">{hm(o.created_at)}</span>
                                            <span className="text-white/25 mx-1.5">·</span>
                                            {STATUS_AZ[o.status] || o.status}
                                            {o.table_number ? <span> · cədvəl {o.table_number}</span> : null}
                                          </p>
                                          {items && <p className="text-sm text-white/60 mt-1.5 leading-relaxed">{items}</p>}
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
                        </div>
                      </div>
                    </>
                  );
                })()}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
