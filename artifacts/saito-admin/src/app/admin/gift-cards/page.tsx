'use client';

// /admin/gift-cards — Gift Card vertical (user-ratified 2026-09-20, D1/D2/D3 GO).
// House DNA = /admin/customers (v8.1 frozen): flat hairline ledger +
// Spotlight search + report strip + full-width iOS-push detail (portal to
// body, geometry from LayoutContext.mainEdge/mainBottom — sidebar-aware,
// live toggle). No new UX patterns.
//
// DATA (GC engine contract, 2026-09-20):
//   GET /api/gift-cards?status=&code=        → raw array of gift_cards rows
//   GET /api/gift-cards/summary              → {active_balance, active_count,
//                                              total_cards, issued_30d,
//                                              redeemed_30d, by_status}
//   GET /api/gift-cards/:code/ledger?limit=  → {card, entries[]} (newest
//                                              first, performer names)
//   POST /api/gift-cards                     → issue (frozen route)
//   POST /api/gift-cards/:code/block         → {unblock?, reason?} (D3)
// Statuses: active / blocked / used / expired / cancelled. The list route is
// single-status by frozen contract → status segments are individual (no "all").
// Status segments use the products-page pill language (user, 2026-09-20):
// one accent pill in the container background morphs between chips (layoutId).
// Cancel is NOT a v1 operation (engine defines no cancel semantics — D3).
//
// Colors: --theme-* tokens only (dark accent gold #D4AF37 / light blue
// #007aff); rose/amber reserved for status semantics (house precedent).
// Motion = state: accent bar morph (layoutId), row→headline code morph,
// iOS push 320ms [0.32,0.72,0,1], hero balance count-up, row stagger,
// chevron on hover, sticky header shadow. prefers-reduced-motion kills all.
// / = focus search · ↑/↓ = row nav · Enter = open · Esc = close/clear.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Search, X, ChevronRight, Gift, Plus, Lock, Unlock } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLayout } from '../context/LayoutContext';
import { cachedFetch } from '@/lib/data-cache';
import { toast } from '@/lib/toast';

const MONTHS_AZ = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'İyn', 'İyl', 'Avq', 'Sen', 'Okt', 'Noy', 'Dek'];

const STATUS_AZ: Record<string, string> = {
  active: 'Aktiv', blocked: 'Blok', used: 'Tükənib', expired: 'Bitib', cancelled: 'Ləğv',
};
const TYPE_AZ: Record<string, string> = {
  issue: 'Buraxılıb', load: 'Yüklənib', redeem: 'İstifadə',
  refund: 'Qaytarma', adjustment: 'Düzəliş', reversal: 'Aks əməliyyat',
};
const POS_TYPES: Record<string, boolean> = { issue: true, load: true, refund: true };
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

const statusDot = (s: string) =>
  s === 'active' ? 'bg-[var(--theme-accent)]'
  : s === 'blocked' ? 'bg-rose-500'
  : s === 'expired' ? 'bg-amber-500'
  : 'bg-[var(--theme-text-muted)]';

interface GiftCard {
  id: string; code: string; initial_balance: number; current_balance: number;
  status: string; issued_to: string | null; issued_to_name: string | null;
  issued_by: string | null; expires_at: string | null;
  created_at: string; updated_at: string;
}
interface Summary {
  total_cards: number; active_count: number; active_balance: number;
  by_status: Record<string, number>; issued_30d: number; redeemed_30d: number;
}
interface LedgerEntry {
  id: string; type: string; amount: number; balance_after: number;
  reference_type: string | null; reason: string | null;
  performed_by: string | null; performer_name: string | null; created_at: string;
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

// ── Kbd chip (keyboard hint) ────────────────────────────────────────────────
const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="px-1.5 py-px rounded-[5px] border border-[var(--theme-border)] bg-[var(--theme-surface-soft)] text-[10px] font-semibold leading-4">
    {children}
  </kbd>
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
  c, i, active, panelOpen, q, onOpen, reduce,
}: {
  c: GiftCard; i: number;
  active: boolean; panelOpen: boolean; q: string;
  onOpen: (c: GiftCard) => void; reduce: boolean;
}) {
  const nameId = `gc-name-${c.id}`;
  const stagger = reduce ? 0 : Math.min(i * 0.022, 0.18);
  const expired = c.status === 'expired' || (c.expires_at && new Date(c.expires_at).getTime() < Date.now());

  return (
    <motion.div
      layout
      data-gc-row={active ? '1' : undefined}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={{ duration: reduce ? 0 : 0.22, delay: stagger, layout: { duration: reduce ? 0 : 0.25, delay: 0, ease: 'easeOut' } }}
      onClick={() => onOpen(c)}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(c); } }}
      className={`group relative flex items-center gap-4 px-4 sm:px-6 h-16 cursor-pointer select-none
        outline-none transition-colors duration-150
        ${active ? 'bg-[var(--theme-accent-soft)]' : 'hover:bg-[var(--theme-surface-soft)] active:bg-[var(--theme-accent-soft)]'}
        focus-visible:bg-[var(--theme-accent-soft)]`}>
      {/* selection accent bar — morphs between rows (layoutId) */}
      {active && (
        <motion.span
          layoutId="gc-bar"
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 36 }}
          className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-[3px] rounded-full bg-[var(--theme-accent)]" />
      )}

      {/* Kod (+ alıcı) — stacked primary/secondary, one visual unit */}
      <div className="flex-1 min-w-0 leading-tight">
        {active && !panelOpen ? (
          <motion.span layoutId={nameId}
            transition={{ duration: reduce ? 0 : 0.32, ease: [0.32, 0.72, 0, 1] }}
            className="block truncate font-mono text-[14px] font-semibold tracking-[0.06em] text-[var(--theme-text)]">
            <Highlight text={c.code} q={q} />
          </motion.span>
        ) : (
          <span className="block truncate font-mono text-[14px] font-semibold tracking-[0.06em] text-[var(--theme-text)]" title={c.code}>
            <Highlight text={c.code} q={q} />
          </span>
        )}
        <p className="mt-0.5 truncate text-[12px] text-[var(--theme-text-muted)] transition-colors duration-150 group-hover:text-[var(--theme-text-secondary)]">
          {c.issued_to_name || 'adısız'}
        </p>
      </div>

      {/* Balans */}
      <div className="w-28 shrink-0 text-right">
        <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : 0.3 }}
          className={`inline-block text-[14px] tabular-nums font-semibold transition-colors duration-150 group-hover:text-[var(--theme-text)] ${c.current_balance > 0 ? 'text-[var(--theme-text)]' : 'text-[var(--theme-text-muted)]'}`}>
          {c.current_balance > 0 ? money(c.current_balance) : '—'}
        </motion.span>
      </div>

      {/* Status */}
      <div className="hidden sm:flex w-24 shrink-0 items-center justify-end gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot(c.status)}`} />
        <span className="text-[12px] font-semibold text-[var(--theme-text-secondary)]">{STATUS_AZ[c.status] || c.status}</span>
      </div>

      {/* Verilmiş */}
      <div className="hidden lg:block w-28 shrink-0 text-right">
        <span className="text-[13px] tabular-nums text-[var(--theme-text-secondary)]">{relLabel(c.created_at)}</span>
      </div>

      {/* Bitmə */}
      <div className="hidden sm:block w-28 shrink-0 text-right">
        <span className={`text-[13px] tabular-nums ${expired && c.status !== 'used' ? (c.status === 'expired' ? 'text-amber-600 dark:text-amber-400' : '') : 'text-[var(--theme-text-muted)]'}`}>
          {c.expires_at ? relLabel(c.expires_at) : '—'}
        </span>
      </div>

      {/* chevron — slides in on hover */}
      <div className={`w-6 shrink-0 flex justify-center transition-all duration-200 ${active ? 'opacity-100 translate-x-0 text-[var(--theme-accent)]' : 'opacity-0 -translate-x-1.5 group-hover:opacity-100 group-hover:translate-x-0 text-[var(--theme-text-muted)]'}`}>
        <ChevronRight size={15} strokeWidth={2.5} />
      </div>
    </motion.div>
  );
}

// ── Card detail (full-width view content) ───────────────────────────────────
function CardDetail({
  card, entries, entriesErr, onRetry, onBlock, blocking, reduce,
}: {
  card: GiftCard; entries: LedgerEntry[] | null; entriesErr: boolean;
  onRetry: () => void; onBlock: (unblock: boolean, reason: string) => void;
  blocking: boolean; reduce: boolean;
}) {
  const { lightMode } = useTheme();
  const bal = useCountUp(Number(card.current_balance), !reduce);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState('');
  const d = (delay: number) => (reduce ? 0 : delay);
  // close the inline confirm immediately on submit (browser E2E finding:
  // it lingered after a successful block); the page refreshes async.
  const submitBlock = (u: boolean, r: string) => {
    setConfirmOpen(false);
    setReason('');
    onBlock(u, r);
  };

  // day groups (house spine)
  const groups: Array<{ label: string; today: boolean; items: LedgerEntry[] }> = [];
  if (entries) {
    for (const e of entries) {
      const label = dayLabel(e.created_at);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(e);
      else groups.push({ label, today: label === 'Bu gün', items: [e] });
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 14 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.12 } }}
      transition={{ duration: reduce ? 0 : 0.24, ease: [0.4, 0, 0.2, 1] }}
      className="mr-auto flex h-full w-full max-w-[880px] min-h-0 flex-col pl-7">
      {/* ── header ── */}
      <div className="px-7 pt-7 pb-5 border-b border-[var(--theme-border)]">
        <motion.div
          initial={{ opacity: 0, y: 10, filter: reduce ? 'blur(0px)' : 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: reduce ? 0 : 0.4, delay: d(0.08), ease: [0.32, 0.72, 0, 1] }}
          className="flex items-center gap-4 min-w-0">
          <span className="w-[46px] h-[46px] rounded-full bg-[var(--theme-accent-soft)] border border-[var(--theme-accent-border)] text-[var(--theme-accent)] flex items-center justify-center shrink-0">
            <Gift size={19} strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[26px] font-black tracking-tighter text-[var(--theme-text)] leading-tight truncate font-mono tracking-[0.04em]">
              <motion.span layoutId={`gc-name-${card.id}`}
                transition={{ duration: reduce ? 0 : 0.32, ease: [0.32, 0.72, 0, 1] }}>
                {card.code}
              </motion.span>
            </h2>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--theme-text-secondary)]">
                <span className={`w-1.5 h-1.5 rounded-full ${statusDot(card.status)}`} />
                {STATUS_AZ[card.status] || card.status}
              </span>
              {card.issued_to_name && (
                <span className="text-[12px] text-[var(--theme-text-muted)]">{card.issued_to_name}</span>
              )}
              <span className="text-[11px] tabular-nums text-[var(--theme-text-muted)]">
                verilmiş {relLabel(card.created_at)}
              </span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── body (scrolls) ── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-7 pb-12">
        {/* KPI strip — containerless, hairline-separated, hero = current balance */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.4, delay: d(0.14), ease: [0.32, 0.72, 0, 1] }}
          className="grid grid-cols-3 divide-x divide-[var(--theme-border)] py-6 border-b border-[var(--theme-border)]">
          <div className="pr-5">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">Cari Balans</p>
            <p className="mt-2 text-[26px] font-black tabular-nums text-[var(--theme-text)] tracking-tight">
              {card.current_balance > 0 ? money(bal) : '₼0.00'}
            </p>
            <p className="mt-0.5 text-[11px] tabular-nums text-[var(--theme-text-muted)]">
              {card.current_balance > 0 ? `${Math.round((Number(card.current_balance) / Number(card.initial_balance)) * 100)}% qalıb` : 'tükənib'}
            </p>
          </div>
          <div className="px-5">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">Başlanğıc</p>
            <p className="mt-2 text-[20px] font-black tabular-nums text-[var(--theme-text-secondary)]">{money(card.initial_balance)}</p>
            <p className="mt-0.5 text-[11px] tabular-nums text-[var(--theme-text-muted)]">ilk məbləğ</p>
          </div>
          <div className="pl-5">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">Sona Çatma</p>
            <p className={`mt-2 text-[20px] font-black tabular-nums ${card.status === 'expired' ? (lightMode ? 'text-amber-600' : 'text-amber-400') : 'text-[var(--theme-text-secondary)]'}`}>
              {card.expires_at ? relLabel(card.expires_at) : 'Məhdudsuz'}
            </p>
            <p className="mt-0.5 text-[11px] tabular-nums text-[var(--theme-text-muted)]">
              {card.status === 'expired' ? 'bitib' : 'son tarix'}
            </p>
          </div>
        </motion.div>

        {/* lifecycle action — D3: block / unblock (no cancel) */}
        {(card.status === 'active' || card.status === 'blocked') && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ duration: reduce ? 0 : 0.3, delay: d(0.2) }}
            className="mt-5 flex items-center gap-3">
            {!confirmOpen ? (
              card.status === 'active' ? (
                <button
                  onClick={() => setConfirmOpen(true)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[11px] font-black uppercase tracking-wider transition-all duration-150 active:scale-[0.95]
                    ${lightMode ? 'border-rose-300 text-rose-600 hover:bg-rose-50' : 'border-rose-500/40 text-rose-400 hover:bg-rose-500/10'}`}>
                  <Lock size={12} strokeWidth={2.5} /> Bloklama
                </button>
              ) : (
                <button
                  onClick={() => submitBlock(true, reason)}
                  disabled={blocking}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--theme-accent)] text-black border border-[var(--theme-accent-border)] px-3.5 py-1.5 text-[11px] font-black uppercase tracking-wider hover:brightness-95 transition-all duration-150 active:scale-[0.95] disabled:opacity-50">
                  <Unlock size={12} strokeWidth={2.5} /> Blokdan çıxar
                </button>
              )
            ) : (
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <input
                  autoFocus
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submitBlock(false, reason); if (e.key === 'Escape') { setConfirmOpen(false); setReason(''); } }}
                  placeholder="Səbəb (opsional)…"
                  aria-label="Bloklama səbəbi"
                  className="flex-1 min-w-0 rounded-full border border-[var(--theme-border)] bg-[var(--theme-surface-soft)] px-4 py-1.5 text-[12px] font-medium
                    text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none
                    transition-[border-color,box-shadow] duration-200 focus:border-[var(--theme-accent-border)] focus:ring-2 focus:ring-[var(--theme-accent-soft)]"
                />
                <button
                  onClick={() => submitBlock(false, reason)}
                  disabled={blocking}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-black uppercase tracking-wider transition-all duration-150 active:scale-[0.95] disabled:opacity-50
                    ${lightMode ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-rose-500 text-white hover:bg-rose-600'}`}>
                  {blocking ? '…' : 'Blokla'}
                </button>
                <button
                  onClick={() => { setConfirmOpen(false); setReason(''); }}
                  className="shrink-0 rounded-full border border-[var(--theme-border)] px-3.5 py-1.5 text-[11px] font-black uppercase tracking-wider text-[var(--theme-text-secondary)] hover:bg-[var(--theme-surface-soft)] transition-all duration-150 active:scale-[0.95]">
                  Vazgeç
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* Ledger timeline */}
        <section className="mt-6">
          <motion.h3
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ duration: reduce ? 0 : 0.3, delay: d(0.2) }}
            className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">
            Ledger Tarixçəsi
          </motion.h3>

          {!entries && !entriesErr && (
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
          {entriesErr && (
            <p className="mt-4 text-xs text-[var(--theme-text-muted)]">
              Yüklənə bilmədi ·{' '}
              <button onClick={onRetry}
                className="font-semibold text-[var(--theme-text-secondary)] underline underline-offset-2 hover:text-[var(--theme-text)] transition-colors duration-150">
                yenidən
              </button>
            </p>
          )}
          {entries && entries.length === 0 && (
            <p className="mt-5 text-sm text-[var(--theme-text-muted)]">Ledgerdə hələ hərəkət yoxdur.</p>
          )}
          {entries && entries.length > 0 && (
            <div className="relative mt-5 pl-6">
              <div className="absolute left-[3px] top-2 bottom-2 w-px bg-[var(--theme-border)]" />
              <div className="space-y-8">
                {groups.map((g, gi) => (
                  <motion.div key={g.label + gi}
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
                    <div className="mt-4 space-y-5">
                      {g.items.map(e => {
                        const pos = !!POS_TYPES[e.type];
                        const sign = pos ? '+' : '−';
                        return (
                          <div key={e.id}>
                            <div className="flex items-baseline justify-between gap-4">
                              <p className="text-[12.5px] tabular-nums text-[var(--theme-text-muted)]">
                                <span className="font-semibold text-[var(--theme-text-secondary)]">{TYPE_AZ[e.type] || e.type}</span>
                                <span className="mx-1.5 opacity-50">·</span>
                                <span>{hm(e.created_at)}</span>
                                {e.performer_name && <span> · {e.performer_name}</span>}
                              </p>
                              <p className={`text-[15.5px] font-bold tabular-nums whitespace-nowrap ${pos ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-text)]'}`}>
                                {sign}{money(e.amount)}
                              </p>
                            </div>
                            {e.reason && (
                              <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--theme-text-secondary)]">{e.reason}</p>
                            )}
                            <p className="mt-0.5 text-[11px] tabular-nums text-[var(--theme-text-muted)]">
                              balans sonra: {money(e.balance_after)}
                            </p>
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
      </div>
    </motion.div>
  );
}

// ── Issue modal (compact centered dialog — a form, not a detail view) ──────
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const genCode = () => {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return `GC-${s}`;
};

function IssueModal({ open, onClose, onIssued, reduce }: {
  open: boolean; onClose: () => void; onIssued: () => void; reduce: boolean;
}) {
  const [code, setCode] = useState(genCode);
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [expires, setExpires] = useState('');
  const [busy, setBusy] = useState(false);

  // fresh suggested code every open
  useEffect(() => { if (open) { setCode(genCode()); setAmount(''); setName(''); setExpires(''); setBusy(false); } }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const amt = Number(amount);
  const valid = /^[A-Z0-9][A-Z0-9 _-]{2,31}$/i.test(code.trim()) && Number.isFinite(amt) && amt > 0;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/gift-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          initial_balance: amt,
          issued_to_name: name.trim() || null,
          expires_at: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
        }),
      });
      const d = await res.json();
      if (res.ok && d?.success) {
        toast.success(`Kart buraxıldı · ${d.code}`);
        onIssued();
        onClose();
      } else {
        toast.error(d?.error || 'Kart buraxılmadı');
      }
    } catch {
      toast.error('Şəbəkə xətası');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-auto">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.18 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/45 backdrop-blur-[3px]"
            aria-hidden
          />
          <motion.div
            role="dialog" aria-modal="true" aria-label="Yeni hədiyyə kartı"
            initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6, transition: { duration: reduce ? 0 : 0.12 } }}
            transition={{ duration: reduce ? 0 : 0.22, ease: [0.32, 0.72, 0, 1] }}
            className="relative w-[min(92vw,420px)] rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-full bg-[var(--theme-accent-soft)] border border-[var(--theme-accent-border)] text-[var(--theme-accent)] flex items-center justify-center">
                  <Gift size={14} strokeWidth={2.2} />
                </span>
                <h3 className="text-[15px] font-black tracking-tight">Yeni Kart</h3>
              </div>
              <button onClick={onClose} aria-label="Bağla"
                className="w-7 h-7 rounded-full border border-[var(--theme-border)] flex items-center justify-center text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-colors duration-150 active:scale-[0.88]">
                <X size={13} strokeWidth={2.5} />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)] mb-1.5">Kod</label>
                <div className="flex gap-2">
                  <input
                    value={code}
                    onChange={e => setCode(e.target.value.toUpperCase())}
                    className="flex-1 min-w-0 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-soft)] px-3.5 py-2.5 font-mono text-[13px] font-semibold tracking-[0.08em]
                      text-[var(--theme-text)] outline-none transition-[border-color,box-shadow] duration-200 focus:border-[var(--theme-accent-border)] focus:ring-2 focus:ring-[var(--theme-accent-soft)]"
                  />
                  <button
                    onClick={() => setCode(genCode())}
                    className="shrink-0 rounded-xl border border-[var(--theme-border)] px-3 text-[10px] font-black uppercase tracking-wider text-[var(--theme-text-secondary)] hover:bg-[var(--theme-surface-soft)] transition-colors duration-150 active:scale-[0.95]">
                    Yenilə
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)] mb-1.5">Məbləğ (₼)</label>
                <input
                  type="number" min="1" step="0.01" value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="100.00"
                  className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-soft)] px-3.5 py-2.5 text-[15px] font-bold tabular-nums
                    text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none transition-[border-color,box-shadow] duration-200 focus:border-[var(--theme-accent-border)] focus:ring-2 focus:ring-[var(--theme-accent-soft)]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)] mb-1.5">Alıcı (opsional)</label>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Ad"
                    className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-soft)] px-3.5 py-2.5 text-[13px] font-medium
                      text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none transition-[border-color,box-shadow] duration-200 focus:border-[var(--theme-accent-border)] focus:ring-2 focus:ring-[var(--theme-accent-soft)]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)] mb-1.5">Sona çatma (opsional)</label>
                  <input
                    type="date"
                    value={expires}
                    onChange={e => setExpires(e.target.value)}
                    className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-soft)] px-3.5 py-2.5 text-[13px] font-medium tabular-nums
                      text-[var(--theme-text)] outline-none transition-[border-color,box-shadow] duration-200 focus:border-[var(--theme-accent-border)] focus:ring-2 focus:ring-[var(--theme-accent-soft)]"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-2.5">
              <button onClick={onClose}
                className="flex-1 rounded-xl border border-[var(--theme-border)] py-2.5 text-[11px] font-black uppercase tracking-widest text-[var(--theme-text-secondary)] hover:bg-[var(--theme-surface-soft)] transition-all duration-150 active:scale-[0.97]">
                Vazgeç
              </button>
              <button onClick={submit} disabled={!valid || busy}
                className="flex-1 rounded-xl bg-[var(--theme-accent)] text-black border border-[var(--theme-accent-border)] py-2.5 text-[11px] font-black uppercase tracking-widest hover:brightness-95 transition-all duration-150 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed">
                {busy ? 'Buraxılır…' : 'Burax'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
const CHIPS: Array<[string, string]> = [
  ['active', 'Aktiv'], ['blocked', 'Blok'], ['used', 'Tükənib'], ['expired', 'Bitib'], ['cancelled', 'Ləğv'],
];

export default function GiftCardsPage() {
  const { lightMode } = useTheme();
  const reduce = useReducedMotion() ?? false;
  const [status, setStatus] = useState('active');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<GiftCard[] | null>(null);
  const [rowsErr, setRowsErr] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selected, setSelected] = useState<GiftCard | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [detail, setDetail] = useState<{ card: GiftCard; entries: LedgerEntry[] } | null>(null);
  const [detailErr, setDetailErr] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // overlay geometry FROM THE SHELL AS STATE (LayoutContext) — sidebar-aware,
  // live toggle, zero polling (house v7.3 contract).
  const { mainEdge, mainBottom } = useLayout();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const heroBal = useCountUp(summary ? Number(summary.active_balance) : 0, !reduce && !!summary);

  // force=true bypasses the SWR micro-cache — REQUIRED after mutations
  // (block/unblock/issue): back-to-back refreshes would otherwise re-serve
  // the stale cache entry written by the first refresh (browser E2E finding C).
  const loadList = useCallback(async (st: string, q: string, force = false) => {
    setRows(null);
    setRowsErr(false);
    try {
      const url = `/api/gift-cards?status=${st}&code=${encodeURIComponent(q)}`;
      // SWR micro-cache: the shell pre-warms the default URL while idle, so
      // the ledger paints on first frame (stale→instant, background revalidate).
      const d = force
        ? await (async () => { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(String(r.status)); return r.json(); })()
        : await cachedFetch<unknown>(url);
      const list: GiftCard[] = Array.isArray(d) ? (d as GiftCard[]) : [];
      setRows(list);
    } catch { setRows([]); setRowsErr(true); }
  }, []);

  const loadSummary = useCallback(async (force = false) => {
    try {
      const s = force
        ? await (async () => { const r = await fetch('/api/gift-cards/summary', { cache: 'no-store' }); if (!r.ok) throw 0; return r.json(); })()
        : await cachedFetch<Summary>('/api/gift-cards/summary');
      if (s && typeof s === 'object' && 'active_balance' in (s as any)) setSummary(s as Summary);
    } catch { /* strip stays quiet — the ledger is the primary surface */ }
  }, []);

  const loadDetail = useCallback(async (c: GiftCard) => {
    setDetail(null);
    setDetailErr(false);
    try {
      const res = await fetch(`/api/gift-cards/${encodeURIComponent(c.code)}/ledger?limit=50`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      if (d?.card) setDetail({ card: d.card, entries: d.entries || [] });
      else setDetailErr(true);
    } catch { setDetailErr(true); }
  }, []);

  useEffect(() => { const t = setTimeout(() => loadList(status, query), 250); return () => clearTimeout(t); }, [status, query, loadList]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  // click / Enter — select AND open the detail view
  const openCard = useCallback((c: GiftCard) => {
    setSelected(c);
    setPanelOpen(true);
    loadDetail(c);
  }, [loadDetail]);

  // keyboard ↑/↓ — select only (panel content swaps if already open)
  const selectRow = useCallback((c: GiftCard) => {
    setSelected(c);
    if (panelOpen) loadDetail(c);
  }, [panelOpen, loadDetail]);

  const closePanel = useCallback(() => { setPanelOpen(false); setDetail(null); setDetailErr(false); }, []);

  const refreshAll = useCallback(() => {
    loadList(status, query, true); // post-mutation: always fresh from network
    loadSummary(true);
    if (selected) loadDetail(selected);
  }, [loadList, loadSummary, loadDetail, status, query, selected]);

  const doBlock = useCallback(async (unblock: boolean, reason: string) => {
    if (!selected) return;
    setBlocking(true);
    try {
      const res = await fetch(`/api/gift-cards/${encodeURIComponent(selected.code)}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unblock, reason: reason || undefined }),
      });
      const d = await res.json();
      if (res.ok && d?.success) {
        toast.success(unblock ? 'Blokdan çıxarıldı' : 'Kart bloklandı');
      } else {
        toast.error(d?.error || 'Əməliyyat uğursuz oldu');
      }
      refreshAll();
    } catch {
      toast.error('Şəbəkə xətası');
    } finally {
      setBlocking(false);
    }
  }, [selected, refreshAll]);

  const scrollToActive = useCallback(() => {
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector('[data-gc-row="1"]');
      el?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    });
  }, [reduce]);

  // Keyboard: / = focus search · ↑/↓ = row nav · Enter = open · Esc = close/clear
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inSearch = e.target === searchRef.current;
      if (issueOpen) return; // the modal owns the keyboard
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
        openCard(c);
        return;
      }
      if (e.key === 'Escape') {
        if (panelOpen) closePanel();
        else if (query) { setQuery(''); searchRef.current?.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rows, query, panelOpen, selected, issueOpen, closePanel, openCard, selectRow, scrollToActive]);

  // keep the selected row in view when the list re-sorts under the open panel
  useEffect(() => {
    if (!panelOpen) return;
    const el = listRef.current?.querySelector('[data-gc-row="1"]');
    el?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [rows, panelOpen, reduce]);

  const d = (delay: number) => (reduce ? 0 : delay);
  const dOpen = reduce ? 0 : 0.32;
  const detailCard = detail?.card || selected;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : 0.3 }}
      className="relative h-full min-h-0 w-full flex flex-col overflow-hidden bg-[var(--theme-bg)] text-[var(--theme-text)]">

      {/* ── page header ── */}
      <div className="flex items-center gap-3 sm:gap-4 px-4 sm:px-6 pt-4 pb-3">
        <h1 className="text-2xl font-black tracking-tighter shrink-0">Hədiyyə Kartları</h1>
        {/* live count — ticks as the filter narrows (accent while searching) */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={rows ? (query ? `q${rows.length}` : `a${rows.length}`) : 'w'}
            initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: reduce ? 0 : 0.16, ease: 'easeOut' }}
            className={`text-[11px] font-bold tabular-nums shrink-0 ${query ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-text-muted)]'}`}>
            {rows ? `${rows.length} kart` : ''}
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
            onChange={e => setQuery(e.target.value.toUpperCase())}
            placeholder="Kart kodu…"
            aria-label="Kart axtar"
            className="w-full rounded-full border border-[var(--theme-border)] bg-[var(--theme-surface-soft)] pl-9 pr-11 py-2 text-[13px] font-medium font-mono tracking-[0.05em]
              text-[var(--theme-text)] placeholder:font-sans placeholder:tracking-normal placeholder:text-[var(--theme-text-muted)] outline-none
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

        {/* header action — issue */}
        <button
          onClick={() => setIssueOpen(true)}
          className="flex items-center gap-1.5 rounded-full bg-[var(--theme-accent)] text-black border border-[var(--theme-accent-border)] px-4 py-2 text-[11px] font-black uppercase tracking-widest hover:brightness-95 transition-all duration-150 active:scale-[0.96] shrink-0">
          <Plus size={13} strokeWidth={3} /> Yeni Kart
        </button>
      </div>

      {/* ── report strip + status chips ── */}
      <div className="px-4 sm:px-6 pb-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-[var(--theme-border)] border-b border-[var(--theme-border)] py-3.5">
          <div className="pr-5">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">Aktiv Balans</p>
            <p className="mt-1 text-[20px] font-black tabular-nums text-[var(--theme-text)] tracking-tight leading-none">
              {summary ? money(heroBal) : '—'}
            </p>
            <p className="mt-1 text-[11px] tabular-nums text-[var(--theme-text-muted)]">
              {summary ? `${summary.active_count} aktiv kart` : 'yüklənir…'}
            </p>
          </div>
          <div className="px-5">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">Cəmi Kart</p>
            <p className="mt-1 text-[17px] font-black tabular-nums text-[var(--theme-text-secondary)] leading-none">
              {summary ? summary.total_cards : '—'}
            </p>
            <p className="mt-1 text-[11px] tabular-nums text-[var(--theme-text-muted)]">qeydə alınmış</p>
          </div>
          <div className="hidden lg:block px-5">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">30 Gün Verilən</p>
            <p className="mt-1 text-[17px] font-black tabular-nums text-[var(--theme-text-secondary)] leading-none">
              {summary ? money(summary.issued_30d) : '—'}
            </p>
            <p className="mt-1 text-[11px] tabular-nums text-[var(--theme-text-muted)]">buraxılan məbləğ</p>
          </div>
          <div className="hidden lg:block pl-5">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">30 Gün İstifadə</p>
            <p className="mt-1 text-[17px] font-black tabular-nums text-[var(--theme-text-secondary)] leading-none">
              {summary ? money(summary.redeemed_30d) : '—'}
            </p>
            <p className="mt-1 text-[11px] tabular-nums text-[var(--theme-text-muted)]">redeem məbləği</p>
          </div>
        </div>

        {/* status segments — products-page pill language (user, 2026-09-20):
            one accent pill sits IN THE BACKGROUND of the container and
            MORPHS between the selected chips (layoutId spring, house 420/34).
            Frozen list route is single-status (no "all"). */}
        <div className="mt-3 inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface-soft)] p-1">
          {CHIPS.map(([st, label]) => {
            const on = status === st;
            return (
              <button
                key={st}
                onClick={() => { setStatus(st); setQuery(''); }}
                aria-pressed={on}
                className={`relative shrink-0 px-3.5 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-colors duration-150 active:scale-[0.95]
                  ${on ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)]'}`}>
                {on && (
                  <motion.span
                    layoutId="gc-status-pill"
                    transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
                    className="absolute inset-0 rounded-xl bg-[var(--theme-accent-soft)] border border-[var(--theme-accent-border)]"
                    aria-hidden
                  />
                )}
                <span className="relative z-10">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── ledger ── */}
      <div ref={listRef} onScroll={e => setScrolled(e.currentTarget.scrollTop > 4)} className="flex-1 min-h-0 overflow-y-auto pb-10">
        {/* column header — sticky, gains a shadow once scrolled */}
        <div className={`sticky top-0 z-10 bg-[var(--theme-bg)]/95 backdrop-blur-sm border-b transition-[border-color,box-shadow] duration-200
          ${scrolled ? 'border-[var(--theme-border)] shadow-[0_12px_28px_-20px_rgba(0,0,0,0.35)]' : 'border-transparent'}`}>
          <div className="flex items-center gap-4 px-4 sm:px-6 h-9 select-none">
            <span className="flex-1 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">Kod</span>
            <span className="w-28 text-right text-[10px] font-black uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">Balans</span>
            <span className="hidden sm:block w-24 text-right text-[10px] font-black uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">Status</span>
            <span className="hidden lg:block w-28 text-right text-[10px] font-black uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">Verilmiş</span>
            <span className="hidden sm:block w-28 text-right text-[10px] font-black uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">Bitmə</span>
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
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 sm:px-6 h-16">
                  <div className="flex-1 space-y-2">
                    <Ghost w={`${34 - (i % 3) * 7}%`} h={13} />
                    <Ghost w={`${20 - (i % 3) * 4}%`} h={10} />
                  </div>
                  <div className="w-28 flex justify-end"><Ghost w="52px" h={12} /></div>
                  <div className="hidden sm:block w-24 flex justify-end"><Ghost w="40px" h={10} /></div>
                  <div className="hidden lg:block w-28 flex justify-end"><Ghost w="44px" h={11} /></div>
                  <div className="hidden sm:block w-28 flex justify-end"><Ghost w="48px" h={11} /></div>
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
                  <button onClick={() => loadList(status, query)}
                    className="mt-2 rounded-full border border-[var(--theme-border)] px-4 py-1.5 text-xs font-black uppercase tracking-wider text-[var(--theme-text-secondary)] hover:bg-[var(--theme-surface-soft)] hover:text-[var(--theme-text)] transition-all duration-150 active:scale-[0.95]">
                    Yenidən
                  </button>
                </>
              ) : (
                <>
                  <span className="w-12 h-12 rounded-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] flex items-center justify-center text-[var(--theme-text-muted)]">
                    <Gift size={20} />
                  </span>
                  <p className="mt-4 text-sm font-medium text-[var(--theme-text-secondary)]">
                    {query ? `“${query}” üçün nəticə yoxdur.` : `${STATUS_AZ[status]} kart yoxdur.`}
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
                active={selected?.id === c.id}
                panelOpen={panelOpen}
                q={query}
                onOpen={openCard}
                reduce={reduce}
              />
            ))}
          </AnimatePresence>
        </motion.div>

        {/* table end-cap — closes the list, carries the meta (no more void) */}
        {rows !== null && rows.length > 0 && (
          <div className="flex items-center justify-between px-4 sm:px-6 h-11 border-t border-[var(--theme-border)]">
            <span className="text-[11px] tabular-nums text-[var(--theme-text-muted)]">
              {rows.length} kart · {STATUS_AZ[status]} · data canlı (gift_cards)
            </span>
            <span className="hidden sm:flex items-center gap-1 text-[10px] text-[var(--theme-text-muted)]">
              <Kbd>↑</Kbd><Kbd>↓</Kbd><span className="mx-1.5">seç</span>
              <Kbd>↵</Kbd><span className="mx-1.5">aç</span>
              <Kbd>/</Kbd><span className="ml-1.5">axtar</span>
            </span>
          </div>
        )}
      </div>

      {/* ── issue modal ── */}
      <IssueModal open={issueOpen} onClose={() => setIssueOpen(false)} onIssued={refreshAll} reduce={reduce} />

      {/* ── full-width detail view — portaled to <body>, spans the ENTIRE
          main content area (left = live sidebar edge via shell state,
          top = below AdminHeader, bottom edge-to-edge). iOS push at full
          size; header stays visible + clickable (live sidebar toggle). ── */}
      {mounted && createPortal(
        <div
          data-gc-overlay
          // CRITICAL: container is present even while the panel is closed —
          // without pointer-events-none it silently swallows every click.
          className="fixed right-0 bottom-0 z-40 pointer-events-none"
          style={{ left: mainEdge, top: mainBottom, transition: reduce ? undefined : 'left 0.25s ease' }}
          aria-hidden={!panelOpen}
        >
          <AnimatePresence>
            {panelOpen && detailCard && (
              <>
                <motion.div
                  key="bd"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.25, ease: 'easeOut' }}
                  onClick={closePanel}
                  aria-hidden
                  className={`absolute inset-0 z-30 pointer-events-auto ${lightMode ? 'bg-black/25' : 'bg-black/50'} backdrop-blur-[3px]`}
                />
                <motion.aside
                  key="panel"
                  role="dialog" aria-modal="true" aria-label={detailCard.code}
                  initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                  transition={{ duration: dOpen, ease: [0.32, 0.72, 0, 1] }}
                  className="absolute inset-0 z-40 flex flex-col pointer-events-auto bg-[var(--theme-bg)]">
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
                    <CardDetail
                      key={detailCard.id}
                      card={detailCard}
                      entries={detail?.entries || null}
                      entriesErr={detailErr}
                      onRetry={() => detailCard && openCard(detailCard)}
                      onBlock={doBlock}
                      blocking={blocking}
                      reduce={reduce}
                    />
                  </AnimatePresence>
                </motion.aside>
              </>
            )}
          </AnimatePresence>
        </div>,
        document.body
      )}
    </motion.div>
  );
}
