'use client';

// /admin/customers — v5 "Concept B" (user-directed 2026-09-19):
// Full-width LEDGER (Ad | Telefon | Ziyarət | Xərçəy | Orta | Son) +
// right slide-over GLASS INSPECTOR (profile · KPIs · timeline · favorites).
//
// POS-inspired but token-clean: every color flows from --theme-* tokens
// (dark accent gold #D4AF37 / light accent blue #007aff) — no legacy
// white/xx bridge classes. Motion = state, never decoration:
//   • selection accent bar morphs between rows (layoutId, the only spring)
//   • row name → inspector headline continuity (layoutId crossfade morph)
//   • panel slide 320ms [0.32,0.72,0,1] + list dim behind
//   • hero spend count-up (the page's single one) + 30-day delta fade
//   • favorites bar reveal, today-dot ping, row stagger (≤8), chevron
//     slide-in on hover, sticky column-header shadow on scroll
// / = focus search · Esc = close inspector / clear search.
// prefers-reduced-motion kills everything.
//
// DATA (frozen W-A3 contract — zero backend changes):
//   GET /api/customers?q=&limit=50   → raw array {id,name,phone} (dead
//       total_visits/total_spent columns are NEVER displayed; list sorted
//       by name client-side for determinism)
//   GET /api/customers/:id/timeline?limit=1  → per-row live stats
//       (bounded N+1: 50 rows, chunks of 5)
//   GET /api/customers/:id/timeline?limit=50 → inspector payload
// All stats live from orders (SSOT); 30-day delta mirrors the RPC's
// exclusion rule (cancelled/voided only).

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Search, X, Sun, Moon, ChevronRight, Users, Phone } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';

const MONTHS_AZ = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'İyn', 'İyl', 'Avq', 'Sen', 'Okt', 'Noy', 'Dek'];
const STATUS_AZ: Record<string, string> = {
  new: 'Yeni', confirmed: 'Qəbul', in_kitchen: 'Hazırlanır', ready: 'Hazır',
  paid: 'Ödənilib', closed: 'Bağlanıb', cancelled: 'Ləğv', voided: 'Ləğv',
};
const METHOD_AZ: Record<string, string> = { card: 'Kart', cash: 'Nəqd' };
const DAY = 86400000;
const PANEL_W = 560;

function dayLabel(iso: string): string {
  const d = new Date(iso); const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return 'Bu gün';
  if (same(d, yest)) return 'Dünən';
  return `${d.getDate()} ${MONTHS_AZ[d.getMonth()]}`;
}
function relLabel(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso); const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return `Bu gün ${hm(iso)}`;
  if (same(d, yest)) return `Dünən ${hm(iso)}`;
  const y = d.getFullYear() !== today.getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${d.getDate()} ${MONTHS_AZ[d.getMonth()]}${y}`;
}
function isToday(iso: string): boolean {
  return !!iso && new Date(iso).toDateString() === new Date().toDateString();
}
function hm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
const money = (n: number) => `₼${Number(n).toFixed(2)}`;
const LIVE = (s: string) => s !== 'cancelled' && s !== 'voided';
const methodAZ = (m: string) => METHOD_AZ[m] || m.charAt(0).toUpperCase() + m.slice(1);

interface CustomerRow { id: string; name: string; phone?: string | null; }
interface RowStats { visits: number; spent: number; avg: number; last: string | null; }
interface Timeline {
  customer: { id: string; name: string; phone?: string | null; created_at: string };
  stats: {
    visit_count: number; total_spent: number; avg_order: number;
    first_visit: string | null; last_visit: string | null; items_ordered: number;
  };
  orders: Array<{
    id: string; table_number: number | null; order_type: string; status: string;
    total_amount: number; paid_amount: number; created_at: string;
    items: Array<{ name: string; qty: number; unit_price: number; total_price: number }>;
    payments: Array<{ method: string; amount: number; status: string; is_refund: boolean }>;
  }>;
  favorites: Array<{ name: string; qty: number }>;
}

// ── Hero count-up (rAF, ease-out-cubic; the page's single one) ──────────────
function useCountUp(target: number, enabled: boolean, dur = 600): number {
  const [v, setV] = useState(enabled ? 0 : target);
  useEffect(() => {
    if (!enabled || target <= 0) { setV(target); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setV(target * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled, dur]);
  return v;
}

const isTypingTarget = (t: EventTarget | null) =>
  t instanceof HTMLElement && !!t.closest('input, textarea, select, [contenteditable="true"]');

// ── Ghost bar (skeleton primitive) ──────────────────────────────────────────
const Ghost = ({ w, h = 12, className = '' }: { w: string; h?: number; className?: string }) => (
  <div className={`animate-pulse rounded-full bg-[var(--theme-surface-soft)] ${className}`}
    style={{ width: w, height: h }} />
);

// ── Search match highlight (first occurrence, accent pill) ─────────────────
function Highlight({ text, q }: { text: string; q: string }) {
  if (!q || !text) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[3px] bg-[var(--theme-accent-soft)] px-[2px] text-[var(--theme-accent)]">
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  );
}

// ── Ledger row ──────────────────────────────────────────────────────────────
function LedgerRow({
  c, i, stats, statsReady, active, panelOpen, q, onOpen, reduce,
}: {
  c: CustomerRow; i: number;
  stats: RowStats | undefined; statsReady: boolean;
  active: boolean; panelOpen: boolean; q: string;
  onOpen: (c: CustomerRow) => void; reduce: boolean;
}) {
  const nameId = `cust-name-${c.id}`;
  const name = c.name || c.phone || 'Customer';
  const stagger = reduce ? 0 : Math.min(i * 0.022, 0.18);
  const hasS = !!stats;

  return (
    <motion.div
      layout
      data-cust-row={active ? '1' : undefined}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={{ duration: reduce ? 0 : 0.22, delay: stagger, layout: { duration: reduce ? 0 : 0.25, delay: 0, ease: 'easeOut' } }}
      onClick={() => onOpen(c)}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(c); } }}
      className={`group relative flex items-center gap-3 px-4 sm:px-6 h-[58px] cursor-pointer select-none
        outline-none transition-colors duration-150
        ${active ? 'bg-[var(--theme-accent-soft)]' : 'hover:bg-[var(--theme-surface-soft)] active:bg-[var(--theme-accent-soft)]'}
        focus-visible:bg-[var(--theme-accent-soft)]`}>
      {/* selection accent bar — morphs between rows (layoutId) */}
      {active && (
        <motion.span
          layoutId="cust-bar"
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 36 }}
          className="absolute left-0 top-1/2 -translate-y-1/2 h-7 w-[3px] rounded-full bg-[var(--theme-accent)]" />
      )}

      {/* Ad */}
      <div className="flex-1 min-w-0">
        {active && !panelOpen ? (
          <motion.span layoutId={nameId}
            transition={{ duration: reduce ? 0 : 0.32, ease: [0.32, 0.72, 0, 1] }}
            className="block truncate text-[15px] font-semibold text-[var(--theme-text)]">
            <Highlight text={name} q={q} />
          </motion.span>
        ) : (
          <span className="block truncate text-[15px] font-semibold text-[var(--theme-text)]" title={name}>
            <Highlight text={name} q={q} />
          </span>
        )}
      </div>

      {/* Telefon */}
      <div className="hidden md:block w-36 shrink-0">
        {c.phone ? (
          <span className="text-[13px] tabular-nums text-[var(--theme-text-secondary)] transition-colors duration-150 group-hover:text-[var(--theme-text)]">
            <Highlight text={c.phone} q={q} />
          </span>
        ) : (
          <span className="text-[13px] text-[var(--theme-text-muted)]">—</span>
        )}
      </div>

      {/* Ziyarət */}
      <div className="hidden sm:block w-16 shrink-0 text-right">
        {!hasS && statsReady ? <span className="text-[13px] text-[var(--theme-text-muted)]">—</span>
          : hasS ? (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : 0.3 }}
              className="inline-block text-[14px] tabular-nums font-medium text-[var(--theme-text-secondary)]">
              {stats!.visits}
            </motion.span>
          ) : <Ghost w="20px" h={10} className="ml-auto" />}
      </div>

      {/* Xərçəy */}
      <div className="w-28 shrink-0 text-right">
        {!hasS && statsReady ? <span className="text-[13px] text-[var(--theme-text-muted)]">—</span>
          : hasS ? (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : 0.3 }}
              className={`inline-block text-[14px] tabular-nums font-semibold transition-colors duration-150 group-hover:text-[var(--theme-text)] ${stats!.spent > 0 ? 'text-[var(--theme-text)]' : 'text-[var(--theme-text-muted)]'}`}>
              {stats!.spent > 0 ? money(stats!.spent) : '—'}
            </motion.span>
          ) : <Ghost w="56px" h={10} className="ml-auto" />}
      </div>

      {/* Orta */}
      <div className="hidden lg:block w-24 shrink-0 text-right">
        {!hasS && statsReady ? <span className="text-[13px] text-[var(--theme-text-muted)]">—</span>
          : hasS ? (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : 0.3 }}
              className="inline-block text-[13px] tabular-nums text-[var(--theme-text-secondary)]">
              {stats!.visits > 0 ? money(stats!.avg) : '—'}
            </motion.span>
          ) : <Ghost w="44px" h={10} className="ml-auto" />}
      </div>

      {/* Son */}
      <div className="hidden sm:block w-32 shrink-0 text-right">
        {!hasS && statsReady ? <span className="text-[13px] text-[var(--theme-text-muted)]">—</span>
          : hasS ? (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : 0.3 }}
              className={`inline-flex items-center justify-end gap-1.5 text-[13px] tabular-nums transition-colors duration-150 group-hover:text-[var(--theme-text)] ${stats!.last ? 'text-[var(--theme-text-secondary)]' : 'text-[var(--theme-text-muted)]'}`}>
              {stats!.last && isToday(stats!.last) && (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-accent)] shrink-0" />
              )}
              {relLabel(stats!.last || '')}
            </motion.span>
          ) : <Ghost w="64px" h={10} className="ml-auto" />}
      </div>

      {/* chevron — slides in on hover */}
      <div className={`w-6 shrink-0 flex justify-center transition-all duration-200 ${active ? 'opacity-100 translate-x-0 text-[var(--theme-accent)]' : 'opacity-0 -translate-x-1.5 group-hover:opacity-100 group-hover:translate-x-0 text-[var(--theme-text-muted)]'}`}>
        <ChevronRight size={15} strokeWidth={2.5} />
      </div>
    </motion.div>
  );
}

// ── Inspector content ───────────────────────────────────────────────────────
function Inspector({
  customer, tl, tlErr, onRetry, reduce,
}: {
  customer: CustomerRow; tl: Timeline | null; tlErr: boolean;
  onRetry: () => void; reduce: boolean;
}) {
  const { lightMode } = useTheme();
  const s = tl?.stats;
  const spent = useCountUp(s ? Number(s.total_spent) : 0, !reduce && !!s);
  const name = tl?.customer?.name || customer.name || customer.phone || 'Customer';

  // 30-day delta — mirrors the frozen RPC exclusion (cancelled/voided only)
  let spend30 = 0, spendPrev30 = 0;
  if (tl) for (const o of tl.orders) {
    if (!LIVE(o.status)) continue;
    const age = Date.now() - new Date(o.created_at).getTime();
    if (age <= 30 * DAY) spend30 += o.total_amount;
    else if (age <= 60 * DAY) spendPrev30 += o.total_amount;
  }
  const delta = spend30 - spendPrev30;
  const showDelta = !!tl && (spend30 > 0 || spendPrev30 > 0);

  // day groups
  const groups: Array<{ label: string; today: boolean; items: Timeline['orders'] }> = [];
  if (tl) {
    for (const o of tl.orders) {
      const label = dayLabel(o.created_at);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(o);
      else groups.push({ label, today: label === 'Bu gün', items: [o] });
    }
  }
  const favTotal = tl ? tl.favorites.reduce((a, f) => a + f.qty, 0) : 0;
  const d = (delay: number) => (reduce ? 0 : delay);

  return (
    <motion.div
      initial={{ opacity: 0, x: 14 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.12 } }}
      transition={{ duration: reduce ? 0 : 0.24, ease: [0.4, 0, 0.2, 1] }}
      className="flex h-full min-h-0 flex-col">
      {/* ── header ── */}
      <div className="px-6 pt-6 pb-4 border-b border-[var(--theme-border)]">
        <div className="flex items-start justify-between gap-4">
          <motion.div
            initial={{ opacity: 0, y: 10, filter: reduce ? 'blur(0px)' : 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: reduce ? 0 : 0.4, delay: d(0.08), ease: [0.32, 0.72, 0, 1] }}
            className="flex items-center gap-3.5 min-w-0">
            <span className="w-11 h-11 rounded-full bg-[var(--theme-accent-soft)] border border-[var(--theme-accent-border)] text-[var(--theme-accent)] flex items-center justify-center text-base font-black shrink-0">
              {name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h2 className="text-2xl font-black tracking-tighter text-[var(--theme-text)] leading-tight truncate">
                <motion.span layoutId={`cust-name-${customer.id}`}
                  transition={{ duration: reduce ? 0 : 0.32, ease: [0.32, 0.72, 0, 1] }}>
                  {name}
                </motion.span>
              </h2>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {customer.phone && (
                  <span className="inline-flex items-center gap-1.5 text-[13px] tabular-nums text-[var(--theme-text-secondary)]">
                    <Phone size={11} className="text-[var(--theme-text-muted)]" />
                    {customer.phone}
                  </span>
                )}
                {s && s.first_visit && (
                  <span className="text-[11px] tabular-nums text-[var(--theme-text-muted)]">
                    ilk ziyarət {relLabel(s.first_visit)}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── body (scrolls) ── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-10">
        {/* KPI strip — containerless, hairline-separated, hero = total spend */}
        {s ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.4, delay: d(0.14), ease: [0.32, 0.72, 0, 1] }}
            className="grid grid-cols-3 divide-x divide-[var(--theme-border)] py-5 border-b border-[var(--theme-border)]">
            <div className="pr-4">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">Ziyarət</p>
              <p className="mt-1.5 text-xl font-black tabular-nums text-[var(--theme-text)]">{s.visit_count}</p>
              <p className="mt-0.5 text-[11px] tabular-nums text-[var(--theme-text-muted)]">{s.items_ordered} mövqe</p>
            </div>
            <div className="px-4">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">Ümumi Xərçəy</p>
              <p className="mt-1.5 text-2xl font-black tabular-nums text-[var(--theme-text)] tracking-tight">
                {s.total_spent > 0 ? money(spent) : '—'}
              </p>
              {showDelta && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : 0.35, delay: d(0.5) }}
                  className="mt-1 text-[11px] tabular-nums text-[var(--theme-text-muted)]">
                  30 gün <span className="font-semibold text-[var(--theme-text-secondary)]">{money(spend30)}</span>
                  {/* arrow only when the previous 30d had spend — otherwise delta ≡ spend30 (noise) */}
                  {spendPrev30 > 0 && Math.abs(delta) >= 0.005 && (
                    <span className={`ml-1.5 font-bold ${delta > 0
                      ? (lightMode ? 'text-emerald-600' : 'text-emerald-400')
                      : 'text-[var(--theme-text-muted)]'}`}>
                      {delta > 0 ? '▲ +' : '▼ −'}{money(Math.abs(delta))}
                    </span>
                  )}
                </motion.p>
              )}
            </div>
            <div className="pl-4">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">Orta Sifariş</p>
              <p className="mt-1.5 text-xl font-black tabular-nums text-[var(--theme-text-secondary)]">
                {s.visit_count > 0 ? money(s.avg_order) : '—'}
              </p>
            </div>
          </motion.div>
        ) : (
          !tlErr && (
            <div className="grid grid-cols-3 divide-x divide-[var(--theme-border)] py-5 border-b border-[var(--theme-border)]">
              {[0, 1, 2].map(i => (
                <div key={i} className={`${i === 0 ? 'pr-4' : i === 2 ? 'pl-4' : 'px-4'}`}>
                  <Ghost w="52px" h={9} />
                  <Ghost w="72px" h={18} className="mt-2.5" />
                </div>
              ))}
            </div>
          )
        )}

        {tlErr && (
          <p className="mt-4 text-xs text-[var(--theme-text-muted)]">
            Yüklənə bilmədi ·{' '}
            <button onClick={onRetry}
              className="font-semibold text-[var(--theme-text-secondary)] underline underline-offset-2 hover:text-[var(--theme-text)] transition-colors duration-150">
              yenidən
            </button>
          </p>
        )}

        {/* Timeline */}
        <section className="mt-6">
          <motion.h3
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ duration: reduce ? 0 : 0.3, delay: d(0.2) }}
            className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">
            Sifariş Tarixçəsi
          </motion.h3>

          {!tl && !tlErr && (
            <div className="mt-5 space-y-5">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-3">
                  <Ghost w="7px" h={7} className="rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Ghost w="90px" h={9} />
                    <Ghost w={`${70 - i * 8}%`} h={11} />
                  </div>
                  <Ghost w="48px" h={11} />
                </div>
              ))}
            </div>
          )}
          {tl && tl.orders.length === 0 && (
            <p className="mt-5 text-sm text-[var(--theme-text-muted)]">Hələ sifariş yoxdur.</p>
          )}
          {tl && tl.orders.length > 0 && (
            <div className="relative mt-5 pl-6">
              <div className="absolute left-[3px] top-2 bottom-2 w-px bg-[var(--theme-border)]" />
              <div className="space-y-7">
                {groups.map((g, gi) => (
                  <motion.div key={g.label}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reduce ? 0 : 0.3, delay: d(0.24 + Math.min(gi, 5) * 0.05) }}
                    className="relative">
                    {/* day dot on the spine — today pings */}
                    <span className="absolute -left-6 top-[3px]">
                      {g.today && !reduce && (
                        <span className="absolute inset-0 w-[7px] h-[7px] rounded-full bg-[var(--theme-accent)] opacity-40 animate-ping [animation-duration:2.4s]" />
                      )}
                      <span className={`block w-[7px] h-[7px] rounded-full ${g.today ? 'bg-[var(--theme-accent)]' : 'bg-[var(--theme-text-muted)]'}`} />
                    </span>
                    <p className={`text-[11px] font-black tracking-[0.12em] uppercase ${g.today ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-text-secondary)]'}`}>
                      {g.label}
                    </p>
                    <div className="mt-3 space-y-4">
                      {g.items.map(o => {
                        const items = o.items.map(it => `${it.qty}× ${it.name}`).join(', ');
                        const pay = o.payments.filter(p => !p.is_refund).map(p => methodAZ(p.method)).join(' + ');
                        const dead = o.status === 'cancelled' || o.status === 'voided';
                        return (
                          <div key={o.id}>
                            <div className="flex items-baseline justify-between gap-4">
                              <p className="text-[12px] tabular-nums text-[var(--theme-text-muted)]">
                                <span className="font-semibold text-[var(--theme-text-secondary)]">{hm(o.created_at)}</span>
                                <span className="mx-1.5 opacity-50">·</span>
                                <span className={dead ? (lightMode ? 'text-rose-600' : 'text-rose-400') : ''}>
                                  {STATUS_AZ[o.status] || o.status}
                                </span>
                                {o.table_number ? <span> · Cədvəl {o.table_number}</span> : null}
                              </p>
                              <p className={`text-[15px] font-bold tabular-nums whitespace-nowrap ${dead ? 'text-[var(--theme-text-muted)] line-through' : 'text-[var(--theme-text)]'}`}>
                                {money(o.total_amount)}
                              </p>
                            </div>
                            {items && (
                              <p className="mt-1 text-[13px] leading-relaxed text-[var(--theme-text-secondary)]">{items}</p>
                            )}
                            {pay && <p className="mt-0.5 text-[11px] tabular-nums text-[var(--theme-text-muted)]">{pay}</p>}
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Favorites */}
        <section className="mt-9">
          <motion.h3
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ duration: reduce ? 0 : 0.3, delay: d(0.26) }}
            className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">
            Sevimlilər
          </motion.h3>
          {!tl || tl.favorites.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--theme-text-muted)]">Yoxdur.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {tl.favorites.slice(0, 5).map((f, i) => {
                const pct = favTotal ? Math.round((f.qty / favTotal) * 100) : 0;
                return (
                  <motion.div key={f.name}
                    initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: reduce ? 0 : 0.3, delay: d(0.3 + i * 0.05) }}
                    className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] flex items-center justify-center text-[13px] font-bold text-[var(--theme-text-secondary)] shrink-0">
                      {(f.name || '?').charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[13px] font-medium text-[var(--theme-text-secondary)] truncate" title={f.name}>{f.name}</p>
                        <p className="text-[11px] font-mono tabular-nums text-[var(--theme-text-muted)] shrink-0">%{pct}</p>
                      </div>
                      <div className="flex items-center gap-2.5 mt-1.5">
                        <div className="flex-1 h-1 rounded-full bg-[var(--theme-surface-soft)] overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.max(8, pct)}%` }}
                            transition={{ duration: reduce ? 0 : 0.55, delay: d(0.4 + i * 0.06), ease: [0.32, 0.72, 0, 1] }}
                            className="h-full rounded-full bg-gradient-to-r from-[var(--theme-accent)] to-[var(--theme-accent)]/30" />
                        </div>
                        <p className="text-[11px] font-mono tabular-nums text-[var(--theme-text-muted)] shrink-0">×{f.qty}</p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </motion.div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function CustomersPage() {
  const { lightMode, setLightMode } = useTheme();
  const reduce = useReducedMotion() ?? false;
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [rowsErr, setRowsErr] = useState(false);
  const [rowStats, setRowStats] = useState<Record<string, RowStats>>({});
  const [statsReady, setStatsReady] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<CustomerRow | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [tl, setTl] = useState<Timeline | null>(null);
  const [tlErr, setTlErr] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async (q: string) => {
    setRows(null);
    setRowsErr(false);
    setRowStats({});
    setStatsReady({});
    try {
      const res = await fetch(`/api/customers?q=${encodeURIComponent(q)}&limit=50`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      // Contract: raw array (verified live 2026-09-19). Name sort = deterministic ledger.
      const list: CustomerRow[] = Array.isArray(d) ? d : (Array.isArray(d?.customers) ? d.customers : []);
      list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'az'));
      setRows(list);
    } catch { setRows([]); setRowsErr(true); }
  }, []);

  useEffect(() => { const t = setTimeout(() => loadList(query), 250); return () => clearTimeout(t); }, [query, loadList]);

  // Live row stats — bounded N+1 over the frozen timeline contract (50 rows, chunks of 5).
  useEffect(() => {
    if (!rows || rows.length === 0) return;
    let cancelled = false;
    (async () => {
      const target = rows.slice(0, 50);
      for (let i = 0; i < target.length; i += 5) {
        const chunk = target.slice(i, i + 5);
        const out: Record<string, RowStats> = {};
        const done: Record<string, boolean> = {};
        await Promise.all(chunk.map(async c => {
          try {
            const r = await fetch(`/api/customers/${c.id}/timeline?limit=1`, { cache: 'no-store' });
            if (r.ok) {
              const d = await r.json();
              if (d?.stats) out[c.id] = {
                visits: d.stats.visit_count,
                spent: Number(d.stats.total_spent),
                avg: Number(d.stats.avg_order),
                last: d.stats.last_visit,
              };
            }
          } catch { /* quiet — cell shows — */ }
          done[c.id] = true;
        }));
        if (!cancelled) {
          setRowStats(prev => ({ ...prev, ...out }));
          setStatsReady(prev => ({ ...prev, ...done }));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [rows]);

  const loadTimeline = useCallback(async (c: CustomerRow) => {
    setTl(null);
    setTlErr(false);
    try {
      const res = await fetch(`/api/customers/${c.id}/timeline?limit=50`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      if (d?.customer) setTl(d);
      else setTlErr(true);
    } catch { setTlErr(true); }
  }, []);

  // click / Enter — select AND open the inspector
  const openCustomer = useCallback((c: CustomerRow) => {
    setSelected(c);
    setPanelOpen(true);
    loadTimeline(c);
  }, [loadTimeline]);

  // keyboard ↑/↓ — select only (panel content swaps if already open)
  const selectRow = useCallback((c: CustomerRow) => {
    setSelected(c);
    if (panelOpen) loadTimeline(c);
  }, [panelOpen, loadTimeline]);

  const closePanel = useCallback(() => setPanelOpen(false), []);

  const scrollToActive = useCallback(() => {
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector('[data-cust-row="1"]');
      el?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    });
  }, [reduce]);

  // Keyboard: / = focus search · ↑/↓ = row navigation (accent bar glides)
  // · Enter = open highlighted · Esc = close panel / clear search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inSearch = e.target === searchRef.current;
      if (e.key === '/' && !isTypingTarget(e.target)) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && (inSearch || !isTypingTarget(e.target)) && rows?.length) {
        e.preventDefault();
        const idx = selected ? rows.findIndex(r => r.id === selected.id) : -1;
        const next = e.key === 'ArrowDown'
          ? Math.min(idx + 1, rows.length - 1)
          : (idx < 0 ? 0 : Math.max(idx - 1, 0));
        selectRow(rows[next]);
        scrollToActive();
        return;
      }
      if (e.key === 'Enter' && inSearch && rows?.length) {
        const c = selected && rows.some(r => r.id === selected.id) ? selected : rows[0];
        openCustomer(c);
        return;
      }
      if (e.key === 'Escape') {
        if (panelOpen) closePanel();
        else if (query) { setQuery(''); searchRef.current?.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rows, query, panelOpen, selected, closePanel, openCustomer, selectRow, scrollToActive]);

  // keep the selected row in view when the list re-sorts under the open panel
  useEffect(() => {
    if (!panelOpen) return;
    const el = listRef.current?.querySelector('[data-cust-row="1"]');
    el?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [rows, panelOpen, reduce]);

  const d = (delay: number) => (reduce ? 0 : delay);
  const dOpen = reduce ? 0 : 0.32;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : 0.3 }}
      className="relative h-full min-h-0 w-full flex flex-col overflow-hidden bg-[var(--theme-bg)] text-[var(--theme-text)]">

      {/* ── page header ── */}
      <div className="flex items-center gap-3 sm:gap-4 px-4 sm:px-6 pt-4 pb-3">
        <h1 className="text-2xl font-black tracking-tighter shrink-0">Müştərilər</h1>
        {/* live count — ticks as the filter narrows (accent while searching) */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={rows ? (query ? `q${rows.length}` : `a${rows.length}`) : 'w'}
            initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: reduce ? 0 : 0.16, ease: 'easeOut' }}
            className={`text-[11px] font-bold tabular-nums shrink-0 ${query ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-text-muted)]'}`}>
            {rows ? (query ? `${rows.length} nəticə` : `${rows.length} müştəri`) : ''}
          </motion.span>
        </AnimatePresence>
        <div className="flex-1" />

        {/* Spotlight search — expands on focus, Search↔X icon morph, live kbd hint */}
        <div className="relative group w-44 sm:w-60 lg:w-64 transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus-within:w-52 sm:focus-within:w-72 lg:focus-within:w-80">
          <button
            tabIndex={-1}
            aria-label={query ? 'Axtarışı təmizlə' : 'Axtar'}
            onClick={() => { if (query) { setQuery(''); searchRef.current?.focus(); } }}
            className={`absolute left-3 top-1/2 -translate-y-1/2 z-10 p-0.5 transition-colors duration-150
              ${query ? 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-accent)] cursor-pointer'
                      : 'text-[var(--theme-text-muted)] group-focus-within:text-[var(--theme-accent)] cursor-default'}`}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={query ? 'x' : 's'}
                initial={{ rotate: -70, opacity: 0, scale: 0.6 }}
                animate={{ rotate: 0, opacity: 1, scale: 1 }}
                exit={{ rotate: 70, opacity: 0, scale: 0.6 }}
                transition={{ duration: reduce ? 0 : 0.16, ease: 'easeOut' }}
                className="flex">
                {query ? <X size={14} strokeWidth={2.5} /> : <Search size={14} />}
              </motion.span>
            </AnimatePresence>
          </button>
          <input
            ref={searchRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Ad və ya telefon…"
            aria-label="Müştəri axtar"
            className="w-full rounded-full border border-[var(--theme-border)] bg-[var(--theme-surface-soft)] pl-9 pr-11 py-2 text-[13px] font-medium
              text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none
              transition-[border-color,box-shadow] duration-200 focus:border-[var(--theme-accent-border)] focus:ring-2 focus:ring-[var(--theme-accent-soft)]"
          />
          <kbd
            key={query ? 'esc' : 'slash'}
            className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex text-[10px] font-semibold
              text-[var(--theme-text-muted)] border border-[var(--theme-border)] rounded-md px-1.5 py-px bg-[var(--theme-bg)]"
            aria-hidden>
            {query ? 'esc' : '/'}
          </kbd>
        </div>

        {/* theme toggle (POS capsule) */}
        <button
          onClick={() => setLightMode(!lightMode)}
          aria-label="Mövzu dəyiş"
          className="w-9 h-9 rounded-full border border-[var(--theme-border)] bg-[var(--theme-surface-soft)] flex items-center justify-center text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:border-[var(--theme-border-strong)] transition-all duration-150 active:scale-[0.92] shrink-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={lightMode ? 'sun' : 'moon'}
              initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
              animate={{ rotate: 0, opacity: 1, scale: 1 }}
              exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
              transition={{ duration: reduce ? 0 : 0.22, ease: 'easeOut' }}
              className="flex">
              {lightMode ? <Sun size={16} /> : <Moon size={16} />}
            </motion.span>
          </AnimatePresence>
        </button>
      </div>

      {/* ── ledger ── */}
      <div ref={listRef} onScroll={e => setScrolled(e.currentTarget.scrollTop > 4)} className="flex-1 min-h-0 overflow-y-auto pb-10">
        {/* column header — sticky, gains a shadow once scrolled */}
        <div className={`sticky top-0 z-10 bg-[var(--theme-bg)]/95 backdrop-blur-sm border-b transition-[border-color,box-shadow] duration-200
          ${scrolled ? 'border-[var(--theme-border)] shadow-[0_12px_28px_-20px_rgba(0,0,0,0.35)]' : 'border-transparent'}`}>
          <div className="flex items-center gap-3 px-4 sm:px-6 h-10 select-none">
            <span className="flex-1 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">Ad</span>
            <span className="hidden md:block w-36 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">Telefon</span>
            <span className="hidden sm:block w-16 text-right text-[10px] font-black uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">Ziyarət</span>
            <span className="w-28 text-right text-[10px] font-black uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">Xərçəy</span>
            <span className="hidden lg:block w-24 text-right text-[10px] font-black uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">Orta</span>
            <span className="hidden sm:block w-32 text-right text-[10px] font-black uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">Son</span>
            <span className="w-6" />
          </div>
        </div>

        <motion.div
          animate={rowsErr ? { x: [0, -5, 5, -3, 3, 0] } : {}}
          transition={{ duration: reduce ? 0 : 0.3 }}
          className="divide-y divide-[var(--theme-border)]">
          {/* loading */}
          {rows === null && !rowsErr && (
            <div className="divide-y divide-[var(--theme-border)]">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 sm:px-6 h-[58px]">
                  <div className="flex-1"><Ghost w={`${42 - (i % 3) * 8}%`} h={13} /></div>
                  <div className="hidden md:block w-36"><Ghost w="70%" h={11} /></div>
                  <div className="hidden sm:block w-16 flex justify-end"><Ghost w="18px" h={11} /></div>
                  <div className="w-28 flex justify-end"><Ghost w="52px" h={11} /></div>
                  <div className="hidden lg:block w-24 flex justify-end"><Ghost w="40px" h={11} /></div>
                  <div className="hidden sm:block w-32 flex justify-end"><Ghost w="60%" h={11} /></div>
                  <div className="w-6" />
                </div>
              ))}
            </div>
          )}

          {/* errors / empty */}
          {rows !== null && rows.length === 0 && (
            <div className="py-24 flex flex-col items-center text-center">
              {rowsErr ? (
                <>
                  <p className="text-sm text-[var(--theme-text-muted)]">Yüklənə bilmədi ·</p>
                  <button onClick={() => loadList(query)}
                    className="mt-2 rounded-full border border-[var(--theme-border)] px-4 py-1.5 text-xs font-black uppercase tracking-wider text-[var(--theme-text-secondary)] hover:bg-[var(--theme-surface-soft)] hover:text-[var(--theme-text)] transition-all duration-150 active:scale-[0.95]">
                    Yenidən
                  </button>
                </>
              ) : (
                <>
                  <span className="w-12 h-12 rounded-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] flex items-center justify-center text-[var(--theme-text-muted)]">
                    <Users size={20} />
                  </span>
                  <p className="mt-4 text-sm font-medium text-[var(--theme-text-secondary)]">
                    {query ? `“${query}” üçün nəticə yoxdur.` : 'Müştəri yoxdur.'}
                  </p>
                  {query && (
                    <button onClick={() => setQuery('')}
                      className="mt-2 text-xs text-[var(--theme-text-muted)] underline underline-offset-2 hover:text-[var(--theme-text)] transition-colors duration-150">
                      Axtarışı təmizlə
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* rows */}
          <AnimatePresence mode="popLayout">
            {rows?.map((c, i) => (
              <LedgerRow
                key={c.id}
                c={c} i={i}
                stats={rowStats[c.id]}
                statsReady={!!statsReady[c.id]}
                active={selected?.id === c.id}
                panelOpen={panelOpen}
                q={query}
                onOpen={openCustomer}
                reduce={reduce}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* ── slide-over inspector ── */}
      <AnimatePresence>
        {panelOpen && selected && (
          <>
            <motion.div
              key="bd"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.25, ease: 'easeOut' }}
              onClick={closePanel}
              aria-hidden
              className={`absolute inset-0 z-30 ${lightMode ? 'bg-black/20' : 'bg-black/45'} backdrop-blur-[2px]`}
            />
            <motion.aside
              key="panel"
              role="dialog" aria-modal="true" aria-label={selected.name || 'Müştəri'}
              initial={{ x: PANEL_W }} animate={{ x: 0 }} exit={{ x: PANEL_W }}
              transition={{ duration: dOpen, ease: [0.32, 0.72, 0, 1] }}
              className={`absolute top-0 right-0 bottom-0 z-40 w-full max-w-[560px] flex flex-col
                bg-[var(--theme-surface)]/95 backdrop-blur-2xl border-l border-[var(--theme-border)]
                ${lightMode ? 'shadow-[-24px_0_60px_-30px_rgba(0,0,0,0.18)]' : 'shadow-[-24px_0_60px_-30px_rgba(0,0,0,0.55)]'}`}>
              {/* panel top bar: close */}
              <div className="absolute top-5 right-5 z-10">
                <motion.button
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ duration: reduce ? 0 : 0.2, delay: d(0.15) }}
                  onClick={closePanel}
                  aria-label="Bağla"
                  className="w-8 h-8 rounded-full border border-[var(--theme-border)] bg-[var(--theme-bg)]/60 flex items-center justify-center
                    text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] hover:border-[var(--theme-border-strong)] transition-all duration-150 active:scale-[0.88]">
                  <X size={14} strokeWidth={2.5} />
                </motion.button>
              </div>
              <AnimatePresence mode="wait" initial={false}>
                <Inspector
                  key={selected.id}
                  customer={selected}
                  tl={tl}
                  tlErr={tlErr}
                  onRetry={() => selected && openCustomer(selected)}
                  reduce={reduce}
                />
              </AnimatePresence>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
