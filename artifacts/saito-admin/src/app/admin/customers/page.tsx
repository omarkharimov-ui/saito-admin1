'use client';

// /admin/customers — focused customer workspace (SAITO UI VISUAL DIRECTION,
// ratified 2026-09-19): Search → customer list → customer profile → timeline.
// No dashboard syndrome: lists, typography, subtle separators. No dead data —
// the denormalized list columns (total_visits/total_spent/last_order_at) are
// dead and never displayed. List-row live stats (visits · spent · last visit)
// come from the FROZEN timeline RPC (W-A3) — bounded N+1 by design (first 50
// rows, 5-way chunks); backend unchanged (user rule 2026-09-19: UI adapts to
// the existing contract). Scaling caveat: beyond ~100 customers a list+stats
// RPC becomes a backend decision (FOLLOW-UP).

import React, { useState, useEffect, useCallback } from 'react';

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
      setRows(Array.isArray(d?.customers) ? d.customers : []);
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

  // ── profile view ─────────────────────────────────────────────────────────
  if (selected) {
    const c = tl?.customer || selected;
    const s = tl?.stats;
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
        <button onClick={closeCustomer} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
          ← Customers
        </button>

        <h1 className="text-2xl font-semibold text-gray-900 mt-6">{c.name || 'Customer'}</h1>
        {c.phone && <p className="text-sm text-gray-400 mt-1">{c.phone}</p>}

        {s && (
          <div className="mt-5">
            <p className="text-sm text-gray-700">
              <span className="font-medium">{s.visit_count}</span> ziyarət
              <span className="text-gray-300 mx-2">·</span>
              <span className="font-medium">{money(s.total_spent)}</span> xərçəy
              <span className="text-gray-300 mx-2">·</span>
              son ziyarət {s.last_visit ? dayLabel(s.last_visit) : '—'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              ortalama {money(s.avg_order)} · {s.items_ordered} mövqe · ilk ziyarət {s.first_visit ? dayLabel(s.first_visit) : '—'}
            </p>
          </div>
        )}

        {tl && tl.favorites.length > 0 && (
          <p className="mt-4 text-sm text-gray-500">
            Sevimlilər: <span className="text-gray-700">{tl.favorites.map(f => `${f.name} ×${f.qty}`).join(' · ')}</span>
          </p>
        )}

        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-gray-400 mt-10 mb-2">Tarixçə</h2>
        {!tl && <p className="text-sm text-gray-400">Yüklənir…</p>}
        {tl && tl.orders.length === 0 && <p className="text-sm text-gray-400">Hələ sifariş yoxdur.</p>}
        <div className="divide-y divide-gray-100">
          {groups.map(g => (
            <div key={g.label}>
              <p className="text-xs text-gray-400 font-medium mt-4 mb-1">{g.label}</p>
              {g.items.map(o => {
                const items = o.items.map(i => `${i.qty}× ${i.name}`).join(', ');
                const pay = o.payments.filter(p => !p.is_refund).map(p => p.method).join('+');
                return (
                  <div key={o.id} className="py-3 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800">
                        {hm(o.created_at)}
                        <span className="text-gray-300 mx-1.5">·</span>
                        {STATUS_AZ[o.status] || o.status}
                        {o.table_number ? <span className="text-gray-400"> · cədvəl {o.table_number}</span> : null}
                      </p>
                      {items && <p className="text-xs text-gray-400 mt-1 truncate" title={items}>{items}</p>}
                      {pay && <p className="text-[11px] text-gray-300 mt-0.5">{pay}</p>}
                    </div>
                    <p className="text-sm font-medium text-gray-900 whitespace-nowrap">{money(o.total_amount)}</p>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── list view ────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-5 py-8">
      <h1 className="text-2xl font-semibold text-gray-900">Customers</h1>

      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Axtar (ad və ya telefon)…"
        className="mt-6 w-full bg-transparent outline-none text-[15px] text-gray-800 placeholder:text-gray-300 border-b border-gray-200 focus:border-gray-400 pb-2 transition-colors"
      />

      <div className="mt-4 divide-y divide-gray-100">
        {rows === null && <p className="text-sm text-gray-400 py-6">Yüklənir…</p>}
        {rows !== null && rows.length === 0 && (
          <p className="text-sm text-gray-400 py-6">{query ? 'Tapılmadı.' : 'Customers yoxdur.'}</p>
        )}
        {rows?.map(c => {
          const s = rowStats[c.id];
          return (
            <button key={c.id} onClick={() => openCustomer(c)}
              className="w-full py-3.5 flex items-center justify-between gap-4 text-left group">
              <div className="min-w-0">
                <p className="text-[15px] font-medium text-gray-900 truncate">
                  {c.name || 'Customer'}
                  {c.phone && <span className="text-xs font-normal text-gray-400 ml-2">{c.phone}</span>}
                </p>
                {s && (
                  <p className="text-xs text-gray-500 mt-1">
                    {s.visits} ziyarət · {money(s.spent)} · son ziyarət {s.last ? dayLabel(s.last) : '—'}
                  </p>
                )}
              </div>
              <span className="text-gray-300 group-hover:text-gray-500 transition-colors text-sm">→</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
