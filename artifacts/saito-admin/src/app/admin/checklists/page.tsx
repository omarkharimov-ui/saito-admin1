'use client';

// /admin/checklists — Daily operating checklists (Wave A #5, map §21 J,
// 2026-09-20). House DNA = /admin/gift-cards (v8.5 frozen language):
// PageHeaderCard + Spotlight + report strip + status pill segments +
// flat hairline ledger + full-width iOS-push detail (portal to body,
// LayoutContext.mainEdge/mainBottom — sidebar-aware, live toggle).
//
// DATA contract (checklists vertical, 20260920000007/000008/000009):
//   GET  /api/checklists/board?date=      → array of runs {id,title,category,
//        run_date,source,template_id,status,assigned_to,assigned_name,due_at,
//        started_at,completed_at,skipped_reason,items_total,items_done,overdue}
//        (side effect: lazy materialization of due daily templates — idempotent)
//   GET  /api/checklists/runs/:id         → run + checklist_run_items[]
//        (sorted) + assigned_staff{name}
//   GET  /api/checklists/templates        → array (manager+)
//   POST /api/checklists/templates        → upsert (manager+)
//        {id?,title,category,items:[{title,note?}],scheduled_at?,recurring,
//         is_active?}
//   POST /api/checklists/runs             → manual run (manager+)
//   PATCH /api/checklists/runs/:id        → {action:'assign',staff_id?} |
//        {action:'skip',reason?} | {action:'unskip'} (manager+)
//   PATCH /api/checklists/runs/:id/items/:itemId → {completed:boolean,note?}
//        (any staff)
// Statuses: pending / in_progress / completed / skipped.
// Categories: opening / closing / cleaning / manager / maintenance.
//
// Colors: --theme-* tokens only; rose/amber = overdue/status semantics
// (house precedent). Motion = state only: accent bar morph (layoutId),
// row→headline title morph, iOS push 320ms [0.32,0.72,0,1], check morph,
// pill morph (420/34), first-load stagger, chevron on hover, sticky header
// shadow. prefers-reduced-motion kills all.
// / = focus search · ↑/↓ = row nav · Enter = open · Esc = close/clear.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Search, X, ChevronRight, ClipboardCheck, Plus, Loader2, Pencil, UserPlus, Ban, RotateCcw,
} from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLayout } from '../context/LayoutContext';
import { cachedFetch, cachePeek } from '@/lib/data-cache';
import { toast } from '@/lib/toast';
import PageHeaderCard from '../components/ui/PageHeaderCard';
import Monobtn from '../components/ui/Monobtn';

const CAT_AZ: Record<string, string> = {
  opening: 'Açılış', closing: 'Bağlanma', cleaning: 'Təmizlik', manager: 'Menecer', maintenance: 'Texnik',
};
const STATUS_AZ: Record<string, string> = {
  pending: 'Açıq', in_progress: 'Yarımçıq', completed: 'Bitib', skipped: 'Buraxılıb',
};
const RECURRING_AZ: Record<string, string> = { daily: 'Hər gün', manual: 'Əl ilə' };
const DAY = 86400000;

interface CkRun {
  id: string; title: string; category: string; run_date: string;
  source: 'template' | 'manual'; template_id: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  assigned_to: string | null; assigned_name: string;
  due_at: string | null; started_at: string | null; completed_at: string | null;
  skipped_reason: string | null;
  items_total: number; items_done: number; overdue: boolean;
}
interface CkItem {
  id: string; title: string; sort_order: number;
  completed: boolean; completed_by: string | null; completed_at: string | null;
  note: string | null;
}
interface CkDetail {
  id: string; title: string; category: string; run_date: string;
  source: string; status: string;
  assigned_to: string | null; assigned_staff: { name: string } | null;
  due_at: string | null; started_at: string | null; completed_at: string | null;
  skipped_reason: string | null;
  checklist_run_items: CkItem[];
}
interface CkTemplate {
  id: string; title: string; category: string;
  items: Array<{ title: string; note: string }>;
  scheduled_at: string | null; recurring: 'daily' | 'manual'; is_active: boolean;
}
interface StaffOpt { id: string; name: string }

function hm(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function isToday(iso: string | null): boolean {
  return !!iso && new Date(iso).toDateString() === new Date().toDateString();
}
function dueLabel(run: CkRun): string {
  if (!run.due_at) return '—';
  return isToday(run.due_at) ? hm(run.due_at) : `${new Date(run.due_at).getDate()}.${String(new Date(run.due_at).getMonth() + 1).padStart(2, '0')} ${hm(run.due_at)}`;
}

const statusDot = (s: string, overdue: boolean) =>
  s === 'completed' ? 'bg-[var(--theme-accent)]'
  : s === 'in_progress' ? 'bg-amber-500'
  : s === 'skipped' ? 'bg-[var(--theme-text-muted)]'
  : overdue ? 'bg-rose-500' : 'bg-[var(--theme-accent)]';

const catTint = (c: string) =>
  c === 'opening' ? 'text-sky-500 dark:text-sky-400'
  : c === 'closing' ? 'text-violet-500 dark:text-violet-400'
  : c === 'cleaning' ? 'text-emerald-600 dark:text-emerald-400'
  : c === 'manager' ? 'text-amber-600 dark:text-amber-400'
  : 'text-[var(--theme-text-muted)]';

// ── Hero count-up (rAF ease-out-cubic — house primitive) ────────────────────
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

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="px-1.5 py-px rounded-[5px] border border-[var(--theme-border)] bg-[var(--theme-surface-soft)] text-[10px] font-semibold leading-4">
    {children}
  </kbd>
);

// ── Search match highlight ──────────────────────────────────────────────────
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

// ── Mini progress bar (row) ─────────────────────────────────────────────────
function MiniBar({ done, total, reduce }: { done: number; total: number; reduce: boolean }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1 rounded-full bg-[var(--theme-surface-soft)] overflow-hidden">
        <motion.div
          animate={{ width: `${pct}%` }}
          transition={reduce ? { duration: 0 } : { duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
          className={`h-full rounded-full ${pct === 100 ? 'bg-[var(--theme-accent)]' : 'bg-[var(--theme-text-secondary)]'}`}
        />
      </div>
      <span className="text-[12px] tabular-nums text-[var(--theme-text-muted)] w-8 text-right">{done}/{total}</span>
    </div>
  );
}

// ── Ledger row ──────────────────────────────────────────────────────────────
function RunRow({
  r, i, active, panelOpen, q, onOpen, reduce, booted, onHover,
}: {
  r: CkRun; i: number;
  active: boolean; panelOpen: boolean; q: string;
  onOpen: (r: CkRun) => void; reduce: boolean;
  booted: boolean; onHover: (r: CkRun) => void;
}) {
  const nameId = `ck-name-${r.id}`;
  const stagger = reduce || booted ? 0 : Math.min(i * 0.022, 0.18);
  return (
    <motion.div
      layout
      data-ck-row={active ? '1' : undefined}
      initial={booted ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={{ duration: reduce ? 0 : 0.22, delay: stagger, layout: { duration: reduce ? 0 : 0.25, delay: 0, ease: 'easeOut' } }}
      onMouseEnter={() => onHover(r)}
      onClick={() => onOpen(r)}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(r); } }}
      className={`group relative flex items-center gap-4 px-4 sm:px-6 h-16 cursor-pointer select-none
        outline-none transition-colors duration-150
        ${active ? 'bg-[var(--theme-accent-soft)]' : 'hover:bg-[var(--theme-surface-soft)] active:bg-[var(--theme-accent-soft)]'}
        focus-visible:bg-[var(--theme-accent-soft)]`}>
      {active && (
        <motion.span
          layoutId="ck-bar"
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 36 }}
          className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-[3px] rounded-full bg-[var(--theme-accent)]" />
      )}

      {/* Başlıq (+ kategoriya · mənbə) — stacked, one visual unit */}
      <div className="flex-1 min-w-0 leading-tight">
        {active && !panelOpen ? (
          <motion.span layoutId={nameId}
            transition={{ duration: reduce ? 0 : 0.32, ease: [0.32, 0.72, 0, 1] }}
            className="block truncate text-[14px] font-bold text-[var(--theme-text)]">
            <Highlight text={r.title} q={q} />
          </motion.span>
        ) : (
          <span className="block truncate text-[14px] font-bold text-[var(--theme-text)]" title={r.title}>
            <Highlight text={r.title} q={q} />
          </span>
        )}
        <p className={`mt-0.5 truncate text-[12px] transition-colors duration-150 group-hover:text-[var(--theme-text-secondary)] ${catTint(r.category)}`}>
          {CAT_AZ[r.category] || r.category}
          <span className="text-[var(--theme-text-muted)]"> · {r.source === 'template' ? 'şablon' : 'əl ilə'}</span>
        </p>
      </div>

      {/* Tapşırılandığı */}
      <div className="hidden md:block w-32 shrink-0 text-right">
        <span className="text-[13px] text-[var(--theme-text-secondary)] truncate inline-block max-w-full">{r.assigned_name || '—'}</span>
      </div>

      {/* Deadline */}
      <div className="hidden sm:block w-24 shrink-0 text-right">
        <span className={`text-[13px] tabular-nums ${r.overdue ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-[var(--theme-text-muted)]'}`}>
          {dueLabel(r)}
        </span>
      </div>

      {/* Progress */}
      <div className="hidden lg:flex w-28 shrink-0 justify-end">
        <MiniBar done={r.items_done} total={r.items_total} reduce={reduce} />
      </div>

      {/* Status */}
      <div className="flex w-24 shrink-0 items-center justify-end gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot(r.status, r.overdue)}`} />
        <span className={`text-[12px] font-semibold ${r.overdue ? 'text-rose-600 dark:text-rose-400' : 'text-[var(--theme-text-secondary)]'}`}>
          {STATUS_AZ[r.status] || r.status}
        </span>
      </div>

      {/* chevron */}
      <div className={`w-6 shrink-0 flex justify-center transition-all duration-200 ${active ? 'opacity-100 translate-x-0 text-[var(--theme-accent)]' : 'opacity-0 -translate-x-1.5 group-hover:opacity-100 group-hover:translate-x-0 text-[var(--theme-text-muted)]'}`}>
        <ChevronRight size={15} strokeWidth={2.5} />
      </div>
    </motion.div>
  );
}

// ── Run detail (full-width view content) ────────────────────────────────────
type CkAction = 'assign' | 'skip' | 'unskip';

function RunDetail({
  detail, onItemToggle, onAction, busyItem, busyAction, staff, onRetry, reduce,
}: {
  detail: CkDetail;
  onItemToggle: (item: CkItem, completed: boolean, note?: string) => void;
  onAction: (kind: CkAction, payload: { staffId?: string; reason?: string }) => void;
  busyItem: string | null;
  busyAction: CkAction | null;
  staff: StaffOpt[];
  onRetry: () => void;
  reduce: boolean;
}) {
  const [action, setAction] = useState<CkAction | null>(null);
  const [reason, setReason] = useState('');
  const [assignId, setAssignId] = useState('');
  const [editNote, setEditNote] = useState<string | null>(null); // item id being noted
  const [noteVal, setNoteVal] = useState('');
  const d = (delay: number) => (reduce ? 0 : delay);

  const done = detail.checklist_run_items.filter(it => it.completed).length;
  const total = detail.checklist_run_items.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const openAction = (k: CkAction) => { setAction(k); setReason(''); setAssignId(detail.assigned_to || ''); };
  const closeAction = () => { setAction(null); setReason(''); setAssignId(''); };
  const submit = () => {
    const k = action; if (!k) return;
    closeAction();
    onAction(k, k === 'assign' ? { staffId: assignId || undefined } : { reason: reason || undefined });
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 14 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.12 } }}
      transition={{ duration: reduce ? 0 : 0.24, ease: [0.4, 0, 0.2, 1] }}
      className="mr-auto flex h-full w-full max-w-[920px] min-h-0 flex-col pl-7">

      {/* ── header ── */}
      <div className="px-7 pt-7 pb-5 border-b border-[var(--theme-border)]">
        <motion.div
          initial={{ opacity: 0, y: 10, filter: reduce ? 'blur(0px)' : 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: reduce ? 0 : 0.4, delay: d(0.08), ease: [0.32, 0.72, 0, 1] }}
          className="flex items-center gap-4 min-w-0">
          <span className="w-[46px] h-[46px] rounded-full bg-[var(--theme-accent-soft)] border border-[var(--theme-accent-border)] text-[var(--theme-accent)] flex items-center justify-center shrink-0">
            <ClipboardCheck size={19} strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[26px] font-black tracking-tighter text-[var(--theme-text)] leading-tight truncate">
              <motion.span layoutId={`ck-name-${detail.id}`}
                transition={{ duration: reduce ? 0 : 0.32, ease: [0.32, 0.72, 0, 1] }}>
                {detail.title}
              </motion.span>
            </h2>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--theme-text-secondary)]">
                <span className={`w-1.5 h-1.5 rounded-full ${statusDot(detail.status, !!detail.due_at && detail.due_at < new Date().toISOString() && detail.status !== 'completed')}`} />
                {STATUS_AZ[detail.status] || detail.status}
              </span>
              <span className={`text-[12px] font-medium ${catTint(detail.category)}`}>{CAT_AZ[detail.category] || detail.category}</span>
              <span className="text-[11px] text-[var(--theme-text-muted)]">{detail.source === 'template' ? 'şablondan' : 'əl ilə yaradılıb'}</span>
              {detail.assigned_staff && (
                <span className="inline-flex items-center gap-1 text-[11px] text-[var(--theme-text-muted)]">
                  <UserPlus size={11} /> {detail.assigned_staff.name}
                </span>
              )}
            </div>
            {detail.status === 'skipped' && detail.skipped_reason && (
              <p className="mt-1.5 text-[12px] text-[var(--theme-text-muted)]">Səbəb: {detail.skipped_reason}</p>
            )}
          </div>
        </motion.div>
      </div>

      {/* ── body (scrolls) ── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-7 pb-12">
        {/* KPI strip */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.4, delay: d(0.14), ease: [0.32, 0.72, 0, 1] }}
          className="grid grid-cols-3 divide-x divide-[var(--theme-border)] py-6 border-b border-[var(--theme-border)]">
          <div className="pr-5">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">Mövqe</p>
            <p className="mt-2 text-[22px] font-black tabular-nums text-[var(--theme-text)] leading-none">{done}<span className="text-[15px] text-[var(--theme-text-muted)]">/{total}</span></p>
            <div className="mt-2.5 w-full h-1 rounded-full bg-[var(--theme-surface-soft)] overflow-hidden">
              <motion.div
                animate={{ width: `${pct}%` }}
                transition={reduce ? { duration: 0 } : { duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
                className={`h-full rounded-full ${pct === 100 ? 'bg-[var(--theme-accent)]' : 'bg-[var(--theme-text-secondary)]'}`}
              />
            </div>
          </div>
          <div className="px-5">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">Deadline</p>
            <p className={`mt-2 text-[17px] font-black tabular-nums leading-none ${detail.due_at && detail.due_at < new Date().toISOString() && detail.status !== 'completed' ? 'text-rose-600 dark:text-rose-400' : 'text-[var(--theme-text-secondary)]'}`}>
              {dueLabel(detail as unknown as CkRun)}
            </p>
            {detail.completed_at && (
              <p className="mt-1 text-[11px] tabular-nums text-[var(--theme-text-muted)]">bitti {hm(detail.completed_at)}</p>
            )}
          </div>
          <div className="pl-5">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">Başlanğıc</p>
            <p className="mt-2 text-[17px] font-black tabular-nums text-[var(--theme-text-secondary)] leading-none">
              {detail.started_at ? hm(detail.started_at) : '—'}
            </p>
            <p className="mt-1 text-[11px] tabular-nums text-[var(--theme-text-muted)]">
              {detail.source === 'template' ? 'hər gün materiallaşır' : 'dərhal icra'}
            </p>
          </div>
        </motion.div>

        {/* action bar (state-only: forms open inline, no empty motion) */}
        <div className="flex items-center gap-2 pt-5 pb-1 flex-wrap">
          {detail.status !== 'completed' && detail.status !== 'skipped' && (
            <>
              <Monobtn size="sm" label="Tapşır" icon={<UserPlus size={12} strokeWidth={2.5} />}
                busy={busyAction === 'assign'} onClick={() => openAction('assign')} disabled={staff.length === 0} />
              <button
                onClick={() => openAction('skip')}
                disabled={busyAction !== null}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--theme-border)] px-3.5 py-2 text-[10.5px] font-black uppercase tracking-wider
                  text-[var(--theme-text-secondary)] hover:bg-[var(--theme-surface-soft)] transition-all duration-150 active:scale-[0.97] disabled:opacity-40">
                <Ban size={11} strokeWidth={2.5} /> Burax
              </button>
            </>
          )}
          {detail.status === 'skipped' && (
            <Monobtn size="sm" label="Yenidən Aç" icon={<RotateCcw size={12} strokeWidth={2.5} />}
              busy={busyAction === 'unskip'} onClick={() => { setAction(null); onAction('unskip', {}); }} />
          )}
          {detail.status === 'completed' && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--theme-accent)]">
              <ClipboardCheck size={13} strokeWidth={2.5} /> Tam icra olundu
            </span>
          )}
        </div>

        {/* inline action forms */}
        <AnimatePresence>
          {action && (
            <motion.div
              key="act"
              initial={{ opacity: 0, y: 6, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -4, height: 0 }}
              transition={{ duration: reduce ? 0 : 0.2, ease: 'easeOut' }}
              className="overflow-hidden">
              <div className="mt-3 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface-soft)] p-4 space-y-3">
                {action === 'assign' && (
                  <>
                    <label className="block text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">İşçiyə tapşır</label>
                    <select
                      value={assignId}
                      onChange={e => setAssignId(e.target.value)}
                      className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3.5 py-2.5 text-[13px] font-medium
                        text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent-border)] focus:ring-2 focus:ring-[var(--theme-accent-soft)]">
                      <option value="">— tapşırılmamış —</option>
                      {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <div className="flex justify-end gap-2">
                      <button onClick={closeAction}
                        className="rounded-xl border border-[var(--theme-border)] px-3.5 py-2 text-[10.5px] font-black uppercase tracking-wider text-[var(--theme-text-secondary)] hover:bg-[var(--theme-surface)] transition-colors duration-150">
                        Vazgeç
                      </button>
                      <Monobtn size="sm" label="Tapşır" busy={busyAction === 'assign'} onClick={submit} />
                    </div>
                  </>
                )}
                {action === 'skip' && (
                  <>
                    <label className="block text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">Səbəb (opsional)</label>
                    <input
                      value={reason} onChange={e => setReason(e.target.value)}
                      placeholder="məs. erkən bağlandıq"
                      className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3.5 py-2.5 text-[13px] font-medium
                        text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none focus:border-[var(--theme-accent-border)] focus:ring-2 focus:ring-[var(--theme-accent-soft)]"
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={closeAction}
                        className="rounded-xl border border-[var(--theme-border)] px-3.5 py-2 text-[10.5px] font-black uppercase tracking-wider text-[var(--theme-text-secondary)] hover:bg-[var(--theme-surface)] transition-colors duration-150">
                        Vazgeç
                      </button>
                      <Monobtn size="sm" label="Burax" busy={busyAction === 'skip'} onClick={submit} />
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── items — flat hairline list, tap = toggle ── */}
        <h3 className="mt-6 mb-1 text-[11px] font-black uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">
          Mövqelər
        </h3>
        <div className="rounded-2xl border border-[var(--theme-border)] divide-y divide-[var(--theme-border)] overflow-hidden">
          {detail.checklist_run_items.map((it, i) => (
            <motion.div
              key={it.id}
              initial={reduce ? false : { opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0 : 0.2, delay: d(0.18 + Math.min(i, 8) * 0.03) }}
              className={`group flex items-start gap-3.5 px-4 py-3.5 transition-colors duration-150 ${busyItem === it.id ? 'bg-[var(--theme-accent-soft)]/40' : 'hover:bg-[var(--theme-surface-soft)] cursor-pointer'}`}
              onClick={() => { if (editNote !== it.id && busyItem !== it.id && detail.status !== 'skipped') onItemToggle(it, !it.completed); }}
              role="button" tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (editNote !== it.id && detail.status !== 'skipped') onItemToggle(it, !it.completed); } }}>
              {/* checkbox morph */}
              <motion.span
                animate={{ scale: it.completed ? 1 : 0.92 }}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 32 }}
                className={`mt-0.5 w-[22px] h-[22px] rounded-[7px] border-2 flex items-center justify-center shrink-0 transition-colors duration-200
                  ${it.completed ? 'bg-[var(--theme-accent)] border-[var(--theme-accent)] text-[var(--theme-bg)]' : 'border-[var(--theme-border-strong)] text-transparent group-hover:border-[var(--theme-text-muted)]'}`}>
                {busyItem === it.id ? (
                  <Loader2 size={12} className="animate-spin text-[var(--theme-text-secondary)]" />
                ) : (
                  <motion.svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
                    initial={false}
                    animate={it.completed ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                    transition={reduce ? { duration: 0 } : { duration: 0.22, ease: 'easeOut' }}>
                    <path d="M20 6L9 17l-5-5" />
                  </motion.svg>
                )}
              </motion.span>

              <div className="flex-1 min-w-0">
                <p className={`text-[14px] font-medium leading-snug transition-all duration-200 ${it.completed ? 'line-through text-[var(--theme-text-muted)]' : 'text-[var(--theme-text)]'}`}>
                  {it.title}
                </p>
                {it.note && editNote !== it.id && (
                  <p className="mt-0.5 text-[12px] text-[var(--theme-text-muted)] flex items-start gap-1.5">
                    <Pencil size={10} className="mt-1 shrink-0" /> {it.note}
                  </p>
                )}
                {it.completed && it.completed_at && (
                  <p className="mt-0.5 text-[11px] tabular-nums text-[var(--theme-text-muted)]">{hm(it.completed_at)} icra olundu</p>
                )}
              </div>

              {/* note edit toggle (state: pencil → inline input) */}
              {editNote === it.id ? (
                <div className="w-44 shrink-0" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={noteVal}
                      onChange={e => setNoteVal(e.target.value)}
                      placeholder="qeyd / sübut…"
                      onKeyDown={e => { if (e.key === 'Enter') { onItemToggle(it, it.completed, noteVal); setEditNote(null); } if (e.key === 'Escape') setEditNote(null); }}
                      className="flex-1 min-w-0 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] px-2.5 py-1.5 text-[12px] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none focus:border-[var(--theme-accent-border)]"
                    />
                    <button
                      onClick={() => { onItemToggle(it, it.completed, noteVal); setEditNote(null); }}
                      aria-label="Saxla"
                      className="w-7 h-7 rounded-lg bg-[var(--theme-accent)] text-[var(--theme-bg)] flex items-center justify-center transition-transform duration-150 active:scale-[0.88]">
                      <motion.svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </motion.svg>
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={e => { e.stopPropagation(); setEditNote(it.id); setNoteVal(it.note || ''); }}
                  aria-label="Qeyd əlavə et"
                  className="mt-0.5 w-7 h-7 -mr-1 rounded-lg text-[var(--theme-text-muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--theme-accent)] hover:bg-[var(--theme-accent-soft)] transition-all duration-150 active:scale-[0.88]">
                  <Pencil size={12} strokeWidth={2.2} />
                </button>
              )}
            </motion.div>
          ))}
          {detail.checklist_run_items.length === 0 && (
            <p className="px-4 py-8 text-center text-[13px] text-[var(--theme-text-muted)]">Mövqe yoxdur.</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Shared: items editor (templates + manual run) ───────────────────────────
function ItemsEditor({
  items, setItems, reduce,
}: {
  items: Array<{ title: string; note: string }>;
  setItems: (v: Array<{ title: string; note: string }>) => void;
  reduce: boolean;
}) {
  const set = (i: number, patch: Partial<{ title: string; note: string }>) =>
    setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">Mövqelər ({items.length})</label>
        <button
          type="button"
          onClick={() => items.length < 50 && setItems([...items, { title: '', note: '' }])}
          className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-[var(--theme-accent)] hover:opacity-75 transition-opacity duration-150 active:scale-[0.95]">
          <Plus size={11} strokeWidth={3} /> əlavə et
        </button>
      </div>
      {items.map((it, i) => (
        <motion.div
          key={i}
          initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.15 }}
          className="flex items-center gap-2">
          <span className="w-5 text-right text-[11px] tabular-nums text-[var(--theme-text-muted)] shrink-0">{i + 1}</span>
          <input
            value={it.title}
            onChange={e => set(i, { title: e.target.value })}
            placeholder={`Mövqe ${i + 1}`}
            className="flex-1 min-w-0 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-soft)] px-3 py-2 text-[13px] font-medium
              text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none transition-[border-color,box-shadow] duration-200 focus:border-[var(--theme-accent-border)] focus:ring-2 focus:ring-[var(--theme-accent-soft)]"
          />
          <input
            value={it.note}
            onChange={e => set(i, { note: e.target.value })}
            placeholder="qeyd (ops.)"
            className="w-28 shrink-0 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-soft)] px-3 py-2 text-[12px]
              text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none transition-[border-color,box-shadow] duration-200 focus:border-[var(--theme-accent-border)] focus:ring-2 focus:ring-[var(--theme-accent-soft)]"
          />
          <button
            type="button"
            onClick={() => items.length > 1 && setItems(items.filter((_, j) => j !== i))}
            disabled={items.length <= 1}
            aria-label="Sil"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--theme-text-muted)] hover:text-rose-500 disabled:opacity-30 transition-colors duration-150 active:scale-[0.88]">
            <X size={13} strokeWidth={2.5} />
          </button>
        </motion.div>
      ))}
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-soft)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none transition-[border-color,box-shadow] duration-200 focus:border-[var(--theme-accent-border)] focus:ring-2 focus:ring-[var(--theme-accent-soft)]";
const labelCls = "block text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)] mb-1.5";
const CATS: Array<[string, string]> = [
  ['opening', 'Açılış'], ['closing', 'Bağlanma'], ['cleaning', 'Təmizlik'], ['manager', 'Menecer'], ['maintenance', 'Texnik'],
];

function ModalShell({ open, onClose, title, icon, children, reduce, wide }: {
  open: boolean; onClose: () => void; title: string;
  icon: React.ReactNode; children: React.ReactNode; reduce: boolean; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
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
            role="dialog" aria-modal="true" aria-label={title}
            initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6, transition: { duration: reduce ? 0 : 0.12 } }}
            transition={{ duration: reduce ? 0 : 0.22, ease: [0.32, 0.72, 0, 1] }}
            className={`relative w-[min(92vw,${wide ? '640px' : '440px'})] max-h-[86vh] overflow-y-auto rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-6 shadow-2xl`}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-full bg-[var(--theme-accent-soft)] border border-[var(--theme-accent-border)] text-[var(--theme-accent)] flex items-center justify-center">
                  {icon}
                </span>
                <h3 className="text-[15px] font-black tracking-tight">{title}</h3>
              </div>
              <button onClick={onClose} aria-label="Bağla"
                className="w-7 h-7 rounded-full border border-[var(--theme-border)] flex items-center justify-center text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-colors duration-150 active:scale-[0.88]">
                <X size={13} strokeWidth={2.5} />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ── New manual run modal ────────────────────────────────────────────────────
function NewRunModal({ open, onClose, staff, onCreated, reduce }: {
  open: boolean; onClose: () => void; staff: StaffOpt[]; onCreated: () => void; reduce: boolean;
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('opening');
  const [items, setItems] = useState<Array<{ title: string; note: string }>>([{ title: '', note: '' }]);
  const [assignId, setAssignId] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);

  const valid = title.trim().length > 0 && items.some(it => it.title.trim());
  const submit = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/checklists/runs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(), category,
          items: items.filter(it => it.title.trim()).map(it => ({ title: it.title.trim(), note: it.note.trim() || undefined })),
          assigned_to: assignId || null,
          due_at: due ? new Date(due).toISOString() : null,
        }),
      });
      const d = await res.json();
      if (res.ok && d?.success) {
        toast.success('Yeni run yaradıldı');
        setTitle(''); setItems([{ title: '', note: '' }]); setAssignId(''); setDue('');
        onCreated(); onClose();
      } else toast.error(d?.error || 'Yaradıla bilmədi');
    } catch { toast.error('Şəbəkə xətası'); }
    finally { setBusy(false); }
  };

  return (
    <ModalShell open={open} onClose={onClose} title="Yeni Run" icon={<Plus size={14} strokeWidth={2.5} />} reduce={reduce} wide>
      <div className="space-y-3.5">
        <div>
          <label className={labelCls}>Başlıq</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="məs. Həftəsonu yoxlama" className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Kateqoriya</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls}>
              {CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Deadline (ops.)</label>
            <input type="datetime-local" value={due} onChange={e => setDue(e.target.value)} className={inputCls} />
          </div>
        </div>
        <ItemsEditor items={items} setItems={setItems} reduce={reduce} />
        <div>
          <label className={labelCls}>Tapşır (ops.)</label>
          <select value={assignId} onChange={e => setAssignId(e.target.value)} className={inputCls}>
            <option value="">— tapşırılmamış —</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-6 flex gap-2.5">
        <button onClick={onClose}
          className="flex-1 rounded-xl border border-[var(--theme-border)] py-2.5 text-[11px] font-black uppercase tracking-widest text-[var(--theme-text-secondary)] hover:bg-[var(--theme-surface-soft)] transition-all duration-150 active:scale-[0.97]">
          Vazgeç
        </button>
        <Monobtn label="Yarad" busy={busy} disabled={!valid} onClick={submit} className="flex-1 !py-2.5" />
      </div>
    </ModalShell>
  );
}

// ── Templates modal ─────────────────────────────────────────────────────────
function TemplatesModal({ open, onClose, onChanged, reduce }: {
  open: boolean; onClose: () => void; onChanged: () => void; reduce: boolean;
}) {
  const [templates, setTemplates] = useState<CkTemplate[] | null>(null);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState<CkTemplate | null | 'new' | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('opening');
  const [recurring, setRecurring] = useState<'manual' | 'daily'>('daily');
  const [time, setTime] = useState('');
  const [items, setItems] = useState<Array<{ title: string; note: string }>>([{ title: '', note: '' }]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr('');
    try {
      const res = await fetch('/api/checklists/templates', { cache: 'no-store' });
      const d = await res.json();
      if (res.ok) setTemplates(Array.isArray(d) ? d : []);
      else setErr(d?.error || 'Yüklənə bilmədi');
    } catch { setErr('Şəbəkə xətası'); }
  }, []);

  useEffect(() => { if (open) { setTemplates(null); load(); } }, [open, load]);

  const openNew = () => { setEditing('new'); setTitle(''); setCategory('opening'); setRecurring('daily'); setTime(''); setItems([{ title: '', note: '' }]); };
  const openEdit = (t: CkTemplate) => {
    setEditing(t); setTitle(t.title); setCategory(t.category);
    setRecurring(t.recurring); setTime(t.scheduled_at ? t.scheduled_at.slice(0, 5) : '');
    setItems(t.items.map(it => ({ title: it.title, note: it.note || '' })));
  };
  const closeEdit = () => { setEditing(null); setTitle(''); setItems([{ title: '', note: '' }]); };

  const valid = title.trim().length > 0 && items.some(it => it.title.trim());
  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/checklists/templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing && editing !== 'new' ? editing.id : null,
          title: title.trim(), category,
          recurring,
          scheduled_at: recurring === 'daily' ? (time || '00:00') : null,
          items: items.filter(it => it.title.trim()).map(it => ({ title: it.title.trim(), note: it.note.trim() || undefined })),
        }),
      });
      const d = await res.json();
      if (res.ok && d?.success) { toast.success('Şablon yadda saxlandı'); closeEdit(); load(); onChanged(); }
      else toast.error(d?.error || 'Yadda saxlanmadı');
    } catch { toast.error('Şəbəkə xətası'); }
    finally { setBusy(false); }
  };

  const toggleActive = async (t: CkTemplate) => {
    try {
      const res = await fetch('/api/checklists/templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: t.id, title: t.title, category: t.category,
          items: t.items.map(it => ({ title: it.title, note: it.note || undefined })),
          scheduled_at: t.scheduled_at, recurring: t.recurring,
          is_active: !t.is_active,
        }),
      });
      const d = await res.json();
      if (res.ok && d?.success) { load(); onChanged(); }
      else toast.error(d?.error || 'Dəyişdirilmədi');
    } catch { toast.error('Şəbəkə xətası'); }
  };

  return (
    <ModalShell open={open} onClose={onClose} title="Şablonlar" icon={<ClipboardCheck size={14} strokeWidth={2.2} />} reduce={reduce} wide>
      {editing !== null ? (
        <div className="space-y-3.5">
          <div>
            <label className={labelCls}>Başlıq</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="məs. Səhər açılış" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Kateqoriya</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls}>
                {CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Təkrar</label>
              <select value={recurring} onChange={e => setRecurring(e.target.value as 'manual' | 'daily')} className={inputCls}>
                <option value="daily">Hər gün</option>
                <option value="manual">Əl ilə</option>
              </select>
            </div>
          </div>
          {recurring === 'daily' && (
            <div>
              <label className={labelCls}>Materiallaşma vaxtı</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} className={inputCls} />
            </div>
          )}
          <ItemsEditor items={items} setItems={setItems} reduce={reduce} />
          <div className="flex gap-2.5 pt-1">
            <button onClick={closeEdit}
              className="flex-1 rounded-xl border border-[var(--theme-border)] py-2.5 text-[11px] font-black uppercase tracking-widest text-[var(--theme-text-secondary)] hover:bg-[var(--theme-surface-soft)] transition-all duration-150 active:scale-[0.97]">
              Vazgeç
            </button>
            <Monobtn label={editing === 'new' ? 'Yarad' : 'Yadda saxla'} busy={busy} disabled={!valid} onClick={save} className="flex-1 !py-2.5" />
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[12px] text-[var(--theme-text-muted)]">{templates ? `${templates.length} şablon` : '…'}</p>
            <Monobtn size="sm" label="Yeni Şablon" icon={<Plus size={11} strokeWidth={3} />} onClick={openNew} />
          </div>
          {err && <p className="text-[13px] text-rose-500 mb-3">{err} <span className="text-[var(--theme-text-muted)]">(şablon idarəetməsi manager+ rol tələb edir)</span></p>}
          {templates === null && !err && (
            <div className="space-y-2">{[0, 1, 2].map(i => <Ghost key={i} w="100%" h={44} className="rounded-xl" />)}</div>
          )}
          <div className="space-y-2">
            {templates?.map(t => (
              <div key={t.id} className="flex items-center gap-3 rounded-xl border border-[var(--theme-border)] px-3.5 py-3 hover:bg-[var(--theme-surface-soft)] transition-colors duration-150">
                <div className="flex-1 min-w-0">
                  <p className={`text-[13.5px] font-bold truncate ${t.is_active ? 'text-[var(--theme-text)]' : 'text-[var(--theme-text-muted)] line-through'}`}>{t.title}</p>
                  <p className="mt-0.5 text-[11.5px] text-[var(--theme-text-muted)]">
                    <span className={catTint(t.category)}>{CAT_AZ[t.category] || t.category}</span>
                    {' · '}{t.items.length} mövqe{' · '}{RECURRING_AZ[t.recurring]}
                    {t.recurring === 'daily' && t.scheduled_at ? ` ${t.scheduled_at.slice(0, 5)}` : ''}
                  </p>
                </div>
                <button onClick={() => toggleActive(t)}
                  className={`relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0 ${t.is_active ? 'bg-[var(--theme-accent)]' : 'bg-[var(--theme-border-strong)]'}`}
                  aria-label={t.is_active ? 'Pasivləşdir' : 'Aktivləşdir'}>
                  <motion.span
                    animate={{ x: t.is_active ? 18 : 2 }}
                    transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 34 }}
                    className="absolute top-0.5 w-4 h-4 rounded-full bg-[var(--theme-bg)] shadow"
                  />
                </button>
                <button onClick={() => openEdit(t)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--theme-text-muted)] hover:text-[var(--theme-accent)] hover:bg-[var(--theme-accent-soft)] transition-all duration-150 active:scale-[0.88]"
                  aria-label="Düzəliş et">
                  <Pencil size={12} strokeWidth={2.2} />
                </button>
              </div>
            ))}
            {templates?.length === 0 && (
              <p className="py-8 text-center text-[13px] text-[var(--theme-text-muted)]">Şablon yoxdur — ilkini yarat.</p>
            )}
          </div>
        </>
      )}
    </ModalShell>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
const CHIPS: Array<[string, string]> = [
  ['all', 'Bütün'], ['pending', 'Açıq'], ['in_progress', 'Yarımçıq'], ['completed', 'Bitib'], ['skipped', 'Buraxılıb'],
];

export default function ChecklistsPage() {
  const { lightMode } = useTheme();
  const reduce = useReducedMotion() ?? false;
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [runs, setRuns] = useState<CkRun[] | null>(null);
  const [runsErr, setRunsErr] = useState(false);
  const [selected, setSelected] = useState<CkRun | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [detail, setDetail] = useState<CkDetail | null>(null);
  const [detailErr, setDetailErr] = useState(false);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<CkAction | null>(null);
  const [staff, setStaff] = useState<StaffOpt[]>([]);
  const [runOpen, setRunOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { mainEdge, mainBottom } = useLayout();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const bootedRef = useRef(false);
  const [booted, setBooted] = useState(false);
  const staffLoadedRef = useRef(false);

  const loadStaff = useCallback(async (force = false) => {
    if (staffLoadedRef.current && !force) return;
    try {
      const res = await fetch('/api/staff', { cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        if (Array.isArray(d)) {
          setStaff(d.filter((s: any) => s.is_active !== false).map((s: any) => ({ id: s.id, name: s.full_name || s.name || s.id.slice(0, 6) })));
          staffLoadedRef.current = true;
        }
      }
    } catch { /* picker stays empty — assign remains possible later */ }
  }, []);

  const BOARD_URL = '/api/checklists/board';
  const loadBoard = useCallback(async (force = false) => {
    if (!bootedRef.current) setRuns(null);
    setRunsErr(false);
    try {
      const d = force
        ? await (async () => { const r = await fetch(BOARD_URL, { cache: 'no-store' }); if (!r.ok) throw new Error(String(r.status)); return r.json(); })()
        : await cachedFetch<unknown>(BOARD_URL);
      const list: CkRun[] = Array.isArray(d) ? (d as CkRun[]) : [];
      setRuns(list);
      if (!bootedRef.current) { bootedRef.current = true; setBooted(true); }
    } catch { if (!bootedRef.current) { setRuns([]); setRunsErr(true); } }
  }, []);

  const displayRows = React.useMemo(() => {
    if (!runs) return null;
    let list = runs;
    if (status !== 'all') list = list.filter(r => r.status === status);
    if (query) list = list.filter(r => r.title.toLowerCase().includes(query.toLowerCase()) || (r.assigned_name || '').toLowerCase().includes(query.toLowerCase()));
    return list;
  }, [runs, status, query]);

  const detailUrl = (id: string) => `/api/checklists/runs/${id}`;
  const loadDetail = useCallback(async (id: string, force = false) => {
    if (!force) {
      const hit = cachePeek<CkDetail>(detailUrl(id), 10000);
      if (hit?.id) { setDetail(hit); setDetailErr(false); return; }
    }
    setDetail(null);
    setDetailErr(false);
    try {
      const res = await fetch(detailUrl(id), { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      if (d?.id) setDetail(d);
      else setDetailErr(true);
    } catch { setDetailErr(true); }
  }, []);
  const prefetchDetail = useCallback((r: CkRun) => {
    void cachedFetch<CkDetail>(detailUrl(r.id), 10000).catch(() => {});
  }, []);

  useEffect(() => { const t = setTimeout(() => loadBoard(), 200); return () => clearTimeout(t); }, [loadBoard]);

  const openRun = useCallback((r: CkRun) => {
    setSelected(r);
    setPanelOpen(true);
    void loadStaff();
    const hit = cachePeek<CkDetail>(detailUrl(r.id), 10000);
    if (hit?.id) { setDetail(hit); setDetailErr(false); }
    else loadDetail(r.id);
  }, [loadDetail, loadStaff]);

  const selectRow = useCallback((r: CkRun) => {
    setSelected(r);
    prefetchDetail(r);
    if (panelOpen) loadDetail(r.id);
  }, [panelOpen, loadDetail, prefetchDetail]);

  const closePanel = useCallback(() => { setPanelOpen(false); setDetail(null); setDetailErr(false); setBusyItem(null); }, []);

  const refreshAll = useCallback(() => {
    loadBoard(true);
    if (selected) loadDetail(selected.id, true);
  }, [loadBoard, loadDetail, selected]);

  // item toggle — optimistic flip + server confirm (rollback on error)
  const toggleItem = useCallback(async (item: CkItem, completed: boolean, note?: string) => {
    if (!detail) return;
    const prev = item;
    setDetail(d => d && ({ ...d, checklist_run_items: d.checklist_run_items.map(it =>
      it.id === item.id ? { ...it, completed, note: note !== undefined ? (note.trim() || null) : it.note } : it
    ) }));
    setBusyItem(item.id);
    try {
      const res = await fetch(`/api/checklists/runs/${detail.id}/items/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed, note: note !== undefined ? note : undefined }),
      });
      const d = await res.json();
      if (!res.ok || !d?.success) {
        setDetail(dd => dd && ({ ...dd, checklist_run_items: dd.checklist_run_items.map(it =>
          it.id === item.id ? prev : it
        ) }));
        toast.error(d?.error || 'Yenilənə bilmədi');
      } else {
        const run = d.run;
        if (run?.status === 'completed' && !prev.completed) toast.success('Checklist tam icra olundu');
        refreshAll();
      }
    } catch {
      setDetail(dd => dd && ({ ...dd, checklist_run_items: dd.checklist_run_items.map(it =>
        it.id === item.id ? prev : it
      ) }));
      toast.error('Şəbəkə xətası');
    } finally {
      setBusyItem(null);
    }
  }, [detail, refreshAll]);

  const doAction = useCallback(async (kind: CkAction, payload: { staffId?: string; reason?: string }) => {
    if (!selected) return;
    setBusyAction(kind);
    try {
      const body = kind === 'assign'
        ? { action: 'assign', staff_id: payload.staffId || null }
        : kind === 'skip'
          ? { action: 'skip', reason: payload.reason || undefined }
          : { action: 'unskip' };
      const res = await fetch(`/api/checklists/runs/${selected.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (res.ok && d?.success) {
        toast.success(kind === 'assign' ? (payload.staffId ? 'Tapşırıldı' : 'Tapşırılma ləğv olundu')
          : kind === 'skip' ? 'Run buraxıldı' : 'Yenidən açıldı');
      } else {
        toast.error(d?.error || 'Əməliyyat uğursuz oldu');
      }
      refreshAll();
    } catch { toast.error('Şəbəkə xətası'); }
    finally { setBusyAction(null); }
  }, [selected, refreshAll]);

  const scrollToActive = useCallback(() => {
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector('[data-ck-row="1"]');
      el?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    });
  }, [reduce]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inSearch = e.target === searchRef.current;
      if (runOpen || tplOpen) return;
      if (e.key === '/' && !isTypingTarget(e.target)) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && (inSearch || !isTypingTarget(e.target)) && displayRows?.length) {
        e.preventDefault();
        const idx = selected ? displayRows.findIndex(r => r.id === selected.id) : -1;
        const next = e.key === 'ArrowDown'
          ? Math.min(idx + 1, displayRows.length - 1)
          : (idx < 0 ? 0 : Math.max(idx - 1, 0));
        selectRow(displayRows[next]);
        scrollToActive();
        return;
      }
      if (e.key === 'Enter' && inSearch && displayRows?.length) {
        const r = selected && displayRows.some(x => x.id === selected.id) ? selected : displayRows[0];
        openRun(r);
        return;
      }
      if (e.key === 'Escape') {
        if (panelOpen) closePanel();
        else if (query) { setQuery(''); searchRef.current?.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [displayRows, query, panelOpen, selected, runOpen, tplOpen, closePanel, openRun, selectRow, scrollToActive]);

  useEffect(() => {
    if (!panelOpen) return;
    const el = listRef.current?.querySelector('[data-ck-row="1"]');
    el?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [displayRows, panelOpen, reduce]);

  const d = (delay: number) => (reduce ? 0 : delay);
  const dOpen = reduce ? 0 : 0.32;
  const detailRun = detail || (selected as CkDetail | null);
  const stats = runs ? {
    pending: runs.filter(r => r.status === 'pending').length,
    in_progress: runs.filter(r => r.status === 'in_progress').length,
    completed: runs.filter(r => r.status === 'completed').length,
    overdue: runs.filter(r => r.overdue).length,
  } : null;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : 0.3 }}
      className="relative h-full min-h-0 w-full flex flex-col overflow-hidden bg-[var(--theme-bg)] text-[var(--theme-text)]">

      {/* ── page header (products-card language) ── */}
      <div className="px-4 sm:px-6 pt-4 pb-3">
        <PageHeaderCard
          title="Növbə Checklist"
          subtitle="Günlük operasiya · İcra · Sübut"
          count={{ pillId: 'ck-count-pill', label: displayRows ? `${displayRows.length} run` : '…', searching: !!query }}>

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
              placeholder="Başlıq və ya işçi…"
              aria-label="Checklist axtar"
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

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTplOpen(true)}
              className="rounded-xl border border-[var(--theme-border)] px-3.5 py-2 text-[10.5px] font-black uppercase tracking-wider
                text-[var(--theme-text-secondary)] hover:bg-[var(--theme-surface-soft)] transition-all duration-150 active:scale-[0.97]">
              Şablonlar
            </button>
            <Monobtn label="Yeni Run" icon={<Plus size={13} strokeWidth={3} />} onClick={() => { void loadStaff(); setRunOpen(true); }} />
          </div>
        </PageHeaderCard>
      </div>

      {/* ── content card — report strip + segments + ledger ── */}
      <div className="px-4 sm:px-6 pb-4 flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 rounded-[32px] border border-[var(--theme-border)] bg-[var(--theme-surface)] shadow-[var(--theme-shadow)] overflow-hidden flex flex-col">
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-[var(--theme-border)] px-6 pt-5 pb-4">
            <div className="pr-5">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">Açıq</p>
              <p className="mt-1 text-[20px] font-black tabular-nums text-[var(--theme-text)] tracking-tight leading-none">{stats ? stats.pending : '—'}</p>
              <p className="mt-1 text-[11px] tabular-nums text-[var(--theme-text-muted)]">gözləyir</p>
            </div>
            <div className="px-5">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">Yarımçıq</p>
              <p className="mt-1 text-[17px] font-black tabular-nums text-[var(--theme-text-secondary)] leading-none">{stats ? stats.in_progress : '—'}</p>
              <p className="mt-1 text-[11px] tabular-nums text-[var(--theme-text-muted)]">icra olunur</p>
            </div>
            <div className="hidden lg:block px-5">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">Bitən</p>
              <p className="mt-1 text-[17px] font-black tabular-nums text-[var(--theme-text-secondary)] leading-none">{stats ? stats.completed : '—'}</p>
              <p className="mt-1 text-[11px] tabular-nums text-[var(--theme-text-muted)]">tam icra</p>
            </div>
            <div className="hidden lg:block pl-5">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">Keçmiş</p>
              <p className={`mt-1 text-[17px] font-black tabular-nums leading-none ${stats && stats.overdue > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-[var(--theme-text-secondary)]'}`}>
                {stats ? stats.overdue : '—'}
              </p>
              <p className="mt-1 text-[11px] tabular-nums text-[var(--theme-text-muted)]">deadline keçib</p>
            </div>
          </div>

          {/* status segments (pill morph) */}
          <div className="px-6 pb-4">
            <div className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full p-0.5">
              {CHIPS.map(([st, label]) => {
                const on = status === st;
                return (
                  <button
                    key={st}
                    onClick={() => { setStatus(st); setQuery(''); }}
                    aria-pressed={on}
                    className={`relative shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-colors duration-150 active:scale-[0.95]
                      ${on ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)]'}`}>
                    {on && (
                      <motion.span
                        layoutId="ck-status-pill"
                        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
                        className="absolute inset-0 rounded-full bg-[var(--theme-accent-soft)] border border-[var(--theme-accent-border)]"
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
          <div ref={listRef} onScroll={e => setScrolled(e.currentTarget.scrollTop > 4)} className="flex-1 min-h-0 overflow-y-auto">
            <div className={`sticky top-0 z-10 bg-[var(--theme-surface)]/95 backdrop-blur-sm border-b border-[var(--theme-border)] transition-[box-shadow] duration-200
              ${scrolled ? 'shadow-[0_12px_28px_-20px_rgba(0,0,0,0.35)]' : ''}`}>
              <div className="flex items-center gap-4 px-4 sm:px-6 h-9 select-none">
                <span className="flex-1 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">Başlıq</span>
                <span className="hidden md:block w-32 text-right text-[10px] font-black uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">Tapşırılandığı</span>
                <span className="hidden sm:block w-24 text-right text-[10px] font-black uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">Deadline</span>
                <span className="hidden lg:block w-28 text-right text-[10px] font-black uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">İrəliləmə</span>
                <span className="w-24 text-right text-[10px] font-black uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">Status</span>
                <span className="w-6" />
              </div>
            </div>

            <motion.div
              animate={runsErr ? { x: [0, -5, 5, -3, 3, 0] } : {}}
              transition={{ duration: reduce ? 0 : 0.3 }}
              className="divide-y divide-[var(--theme-border)]">
              {displayRows === null && !runsErr && (
                <div className="divide-y divide-[var(--theme-border)]">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 px-4 sm:px-6 h-16">
                      <div className="flex-1 space-y-2">
                        <Ghost w={`${38 - (i % 3) * 8}%`} h={13} />
                        <Ghost w={`${22 - (i % 3) * 4}%`} h={10} />
                      </div>
                      <div className="hidden md:block w-32 flex justify-end"><Ghost w="60px" h={11} /></div>
                      <div className="hidden sm:block w-24 flex justify-end"><Ghost w="40px" h={11} /></div>
                      <div className="hidden lg:flex w-28 justify-end"><Ghost w="56px" h={8} /></div>
                      <div className="w-24 flex justify-end"><Ghost w="44px" h={10} /></div>
                      <div className="w-6" />
                    </div>
                  ))}
                </div>
              )}

              {displayRows !== null && displayRows.length === 0 && (
                <div className="py-24 flex flex-col items-center text-center">
                  {runsErr ? (
                    <>
                      <p className="text-sm text-[var(--theme-text-muted)]">Yüklənə bilmədi ·</p>
                      <button onClick={() => loadBoard()}
                        className="mt-2 rounded-full border border-[var(--theme-border)] px-4 py-1.5 text-xs font-black uppercase tracking-wider text-[var(--theme-text-secondary)] hover:bg-[var(--theme-surface-soft)] hover:text-[var(--theme-text)] transition-all duration-150 active:scale-[0.95]">
                        Yenidən
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="w-12 h-12 rounded-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] flex items-center justify-center text-[var(--theme-text-muted)]">
                        <ClipboardCheck size={20} />
                      </span>
                      <p className="mt-4 text-sm font-medium text-[var(--theme-text-secondary)]">
                        {query ? `“${query}” üçün nəticə yoxdur.` : status === 'all' ? 'Bu gün üçün run yoxdur.' : `${STATUS_AZ[status]} run yoxdur.`}
                      </p>
                      {!query && status === 'all' && (
                        <button onClick={() => setRunOpen(true)}
                          className="mt-3 text-xs font-semibold text-[var(--theme-accent)] underline underline-offset-2 hover:opacity-75 transition-opacity duration-150">
                          Yeni run yarat
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              <AnimatePresence mode="popLayout">
                {displayRows?.map((r, i) => (
                  <RunRow
                    key={r.id}
                    r={r} i={i}
                    active={selected?.id === r.id}
                    panelOpen={panelOpen}
                    q={query}
                    onOpen={openRun}
                    reduce={reduce}
                    booted={booted}
                    onHover={prefetchDetail}
                  />
                ))}
              </AnimatePresence>
            </motion.div>

            {displayRows !== null && displayRows.length > 0 && (
              <div className="flex items-center justify-between px-4 sm:px-6 h-11 border-t border-[var(--theme-border)]">
                <span className="text-[11px] tabular-nums text-[var(--theme-text-muted)]">
                  {displayRows.length} run · bu gün · data canlı (checklist_runs)
                </span>
                <span className="hidden sm:flex items-center gap-1 text-[10px] text-[var(--theme-text-muted)]">
                  <Kbd>↑</Kbd><Kbd>↓</Kbd><span className="mx-1.5">seç</span>
                  <Kbd>↵</Kbd><span className="mx-1.5">aç</span>
                  <Kbd>/</Kbd><span className="ml-1.5">axtar</span>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── modals ── */}
      <NewRunModal open={runOpen} onClose={() => setRunOpen(false)} staff={staff} onCreated={refreshAll} reduce={reduce} />
      <TemplatesModal open={tplOpen} onClose={() => setTplOpen(false)} onChanged={refreshAll} reduce={reduce} />

      {/* ── full-width detail view (portal, mainEdge/mainBottom) ── */}
      {mounted && createPortal(
        <div
          data-ck-overlay
          className="fixed right-0 bottom-0 z-40 pointer-events-none"
          style={{ left: mainEdge, top: mainBottom, transition: reduce ? undefined : 'left 0.25s ease' }}
          aria-hidden={!panelOpen}
        >
          <AnimatePresence>
            {panelOpen && detailRun && (
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
                  role="dialog" aria-modal="true" aria-label={detailRun.title}
                  initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                  transition={{ duration: dOpen, ease: [0.32, 0.72, 0, 1] }}
                  className="absolute inset-0 z-40 flex flex-col pointer-events-auto bg-[var(--theme-bg)]">
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
                  {detailErr && !detail ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3">
                      <p className="text-sm text-[var(--theme-text-muted)]">Yüklənə bilmədi</p>
                      <button onClick={() => selected && openRun(selected)}
                        className="rounded-full border border-[var(--theme-border)] px-4 py-1.5 text-xs font-black uppercase tracking-wider text-[var(--theme-text-secondary)] hover:bg-[var(--theme-surface-soft)] transition-all duration-150 active:scale-[0.95]">
                        Yenidən
                      </button>
                    </div>
                  ) : detail ? (
                    <AnimatePresence mode="wait" initial={false}>
                      <RunDetail
                        key={detail.id}
                        detail={detail}
                        onItemToggle={toggleItem}
                        onAction={doAction}
                        busyItem={busyItem}
                        busyAction={busyAction}
                        staff={staff}
                        onRetry={() => selected && openRun(selected)}
                        reduce={reduce}
                      />
                    </AnimatePresence>
                  ) : (
                    <div className="flex-1 px-7">
                      <div className="pt-7 space-y-8">
                        <Ghost w="40%" h={26} />
                        <div className="grid grid-cols-3 gap-4">{[0, 1, 2].map(i => <Ghost key={i} w="100%" h={64} className="rounded-2xl" />)}</div>
                        {[0, 1, 2, 3].map(i => <Ghost key={i} w="100%" h={52} className="rounded-xl" />)}
                      </div>
                    </div>
                  )}
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
