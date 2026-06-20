'use client';

import { useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader2, AlertTriangle, X, Clock } from 'lucide-react';
import { toast } from '@/lib/toast';

export type CalibrationSuggestion = {
  ingredient_id: string;
  ingredient_name: string;
  suggested_adjustment_pct: number;
  confidence: number;
  reason: string;
  actual_stock: number;
  theoretical_stock: number;
};

interface Props {
  suggestions: CalibrationSuggestion[];
  onApplied?: (item: CalibrationSuggestion) => void;
  onApplyStart?: (item: CalibrationSuggestion, el: HTMLElement) => void;
}

const DEFER_KEY = 'calibration_deferred';

function getDeferredIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DEFER_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    const now = Date.now();
    return new Set(
      Object.entries(parsed)
        .filter(([, t]) => (t as number) > now)
        .map(([id]) => id)
    );
  } catch { return new Set(); }
}

function deferItem(id: string) {
  try {
    const raw = localStorage.getItem(DEFER_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[id] = Date.now() + 4 * 60 * 60 * 1000; // 4 hours
    localStorage.setItem(DEFER_KEY, JSON.stringify(map));
  } catch {}
}

function removeDefer(id: string) {
  try {
    const raw = localStorage.getItem(DEFER_KEY);
    if (!raw) return;
    const map = JSON.parse(raw);
    delete map[id];
    localStorage.setItem(DEFER_KEY, JSON.stringify(map));
  } catch {}
}

export function CalibrationSuggestionsPanel({ suggestions, onApplied, onApplyStart }: Props) {
  const [open, setOpen] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [localRemoved, setLocalRemoved] = useState<Set<string>>(new Set());

  const deferredIds = useMemo(() => getDeferredIds(), [suggestions]);

  const selectable = useMemo(
    () => suggestions.filter(s => s.ingredient_id && !deferredIds.has(s.ingredient_id) && !localRemoved.has(s.ingredient_id)),
    [suggestions, deferredIds, localRemoved]
  );
  const count = selectable.length;

  const apply = async (item: CalibrationSuggestion) => {
    setApplyingId(item.ingredient_id);
    try {
      const res = await fetch('/api/inventory/calibration/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredientId: item.ingredient_id,
          actualStock: item.actual_stock,
          theoreticalStock: item.theoretical_stock,
          reason: item.reason,
        }),
      });
      if (!res.ok) throw new Error('Calibration apply failed');
      toast.success(`${item.ingredient_name} calibrasiya olundu`);
      onApplied?.(item);
    } catch {
      toast.error('Calibrasiya tətbiq edilə bilmədi');
    } finally {
      setApplyingId(null);
    }
  };

  if (count === 0 && !open) return null;

  return (
    <AnimatePresence mode="popLayout">
      {!open && count > 0 ? (
        <motion.button
          key="calibration-pill"
          onClick={() => setOpen(true)}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/[0.08] bg-white/[0.03] text-sm font-medium text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          <Sparkles size={13} className="text-amber-400" />
          AI Suggestions
          <span className="inline-flex items-center justify-center min-w-[18px] h-4.5 px-1.5 rounded-full text-[10px] font-semibold text-amber-300 bg-amber-400/15">
            {count}
          </span>
        </motion.button>
      ) : open ? (
        <motion.div
          key="calibration-panel"
          layoutId="calibration-panel"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10, transition: { duration: 0.12 } }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className="rounded-xl border border-white/10 bg-[#0c0c0c] p-4 sm:p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-white/40 font-bold">
                <Sparkles size={11} /> AI Calibration
              </div>
              <h3 className="mt-1.5 text-base font-bold text-white">Reverse inventory calibration</h3>
              <p className="mt-0.5 text-xs text-white/45">AI/stock mismatch nəticələrini bir kliklə tətbiq et.</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-bold text-white/40 hover:text-white transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              Bağla
            </button>
          </div>

          <div className="mt-4 space-y-2">
            <AnimatePresence mode="popLayout">
              {selectable.slice(0, 4).map((s, index) => (
                <motion.button
                  key={s.ingredient_id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05, type: 'spring', stiffness: 320, damping: 28 }}
                  exit={{ opacity: 0, y: 60, scale: 0.9, filter: 'blur(6px)' }}
                  type="button"
                  disabled={applyingId !== null}
                  onClick={(e) => {
                    onApplyStart?.(s, e.currentTarget);
                    void apply(s);
                  }}
                  className="w-full rounded-lg border px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
                  style={{
                    borderColor: applyingId === s.ingredient_id ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.06)',
                    background: applyingId === s.ingredient_id ? 'rgba(52,211,153,0.08)' : 'rgba(255,255,255,0.02)',
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{s.ingredient_name}</span>
                        {applyingId === s.ingredient_id && <Loader2 size={12} className="animate-spin text-emerald-400" />}
                      </div>
                      <div className="text-[11px] text-white/40 mt-0.5">{s.reason}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-white">{s.suggested_adjustment_pct.toFixed(1)}%</div>
                      <div className="text-[10px] uppercase tracking-[0.15em] text-white/30">conf {Math.round(s.confidence * 100)}%</div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setLocalRemoved(prev => new Set(prev).add(s.ingredient_id)); toast.success(`${s.ingredient_name} rədd edildi`); }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-red-400/60 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                    >
                      <X size={10} /> Rədd et
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); deferItem(s.ingredient_id); setLocalRemoved(prev => new Set(prev).add(s.ingredient_id)); toast.success(`${s.ingredient_name} 4 saat təxirə salındı`); }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors"
                    >
                      <Clock size={10} /> Təxirə sal
                    </button>
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>

          {count > 0 && (
            <div className="mt-3 flex items-center gap-2 text-[11px] text-white/35">
              <AlertTriangle size={12} className="text-amber-400/60" />
              {count} aktiv calibrasiya
            </div>
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
