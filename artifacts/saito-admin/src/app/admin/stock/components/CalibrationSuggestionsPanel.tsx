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

// Helper functions to manage deferred items in localStorage
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
    const raw = localStorage.getItem(DEFER_KEY) || '{}';
    const map = JSON.parse(raw);
    map[id] = Date.now() + 4 * 60 * 60 * 1000; // Defer for 4 hours
    localStorage.setItem(DEFER_KEY, JSON.stringify(map));
  } catch {}
}

export function CalibrationSuggestionsPanel({ suggestions, onApplied, onApplyStart }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [localRemoved, setLocalRemoved] = useState<Set<string>>(new Set());

  // Memoize deferred IDs to avoid re-calculating on every render
  const deferredIds = useMemo(() => getDeferredIds(), [suggestions]);

  // Filter suggestions to get only the ones that should be visible
  const selectableSuggestions = useMemo(
    () => suggestions.filter(s => s.ingredient_id && !deferredIds.has(s.ingredient_id) && !localRemoved.has(s.ingredient_id)),
    [suggestions, deferredIds, localRemoved]
  );

  const suggestionCount = selectableSuggestions.length;

  const handleApply = useCallback(async (item: CalibrationSuggestion) => {
    setApplyingId(item.ingredient_id);
    try {
      const res = await fetch('/api/inventory/calibration/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredientId: item.ingredient_id, reason: item.reason }),
      });
      if (!res.ok) throw new Error('API call failed');
      toast.success(`${item.ingredient_name} uğurla kalibrasiya olundu.`);
      onApplied?.(item);
    } catch (error) {
      toast.error('Xəta: Kalibrasiya tətbiq edilmədi.');
    } finally {
      setApplyingId(null);
    }
  }, [onApplied]);

  // Do not render the component if there are no suggestions and the panel is closed
  if (suggestionCount === 0 && !isOpen) return null;

  return (
    <AnimatePresence mode="popLayout">
      {!isOpen && suggestionCount > 0 ? (
        // --- The Pill Button --- 
        <motion.button
          key="pill"
          onClick={() => setIsOpen(true)}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 22 } }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.15 }}}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/[0.08] bg-white/[0.03] text-sm font-medium text-white/80 hover:text-white hover:bg-white/[0.06] transition-colors shadow-md"
        >
          <Sparkles size={14} className="text-amber-400" />
          AI Suggestions
          <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-semibold text-amber-300 bg-amber-400/20">
            {suggestionCount}
          </span>
        </motion.button>
      ) : isOpen ? (
        // --- The Main Panel --- 
        <motion.div
          key="panel"
          layoutId="calibration-panel" // Has layoutId, but the pill does not, preventing a morph.
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0, transition: { type: 'spring', stiffness: 320, damping: 28 } }}
          exit={{ opacity: 0, y: -10, transition: { duration: 0.12 } }}
          className="w-full max-w-md rounded-xl border border-white/10 bg-[#0c0c0c] p-4 sm:p-5 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="text-base font-bold text-white">AI Kalibrasiya Təklifləri</h3>
              <p className="mt-1 text-xs text-white/50">AI və stok fərqliliklərini bir kliklə həll edin.</p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold text-white/50 bg-white/5 hover:text-white border border-white/10 transition-colors"
            >
              Bağla
            </button>
          </div>

          {/* --- Staggered Card List --- */}
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {selectableSuggestions.slice(0, 4).map((s, index) => (
                <motion.div
                  key={s.ingredient_id}
                  layout
                  initial={{ opacity: 0, y: 12 }} // Cards slide up from below
                  animate={{ opacity: 1, y: 0, transition: { delay: index * 0.05, type: 'spring', stiffness: 320, damping: 28 } }}
                  exit={{ opacity: 0, y: -5, transition: { duration: 0.15 } }} // Clean exit, no scale morph
                  className="relative w-full rounded-lg border border-white/10 bg-white/5 p-3"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                        <span className="text-sm font-semibold text-white">{s.ingredient_name}</span>
                        <p className="text-xs text-white/40 mt-0.5">{s.reason}</p>
                        </div>
                        <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-emerald-400">{s.suggested_adjustment_pct.toFixed(1)}%</div>
                        </div>
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-2">
                        <button
                            type="button"
                            disabled={applyingId !== null}
                            onClick={() => { setLocalRemoved(prev => new Set(prev).add(s.ingredient_id)); toast.success(`${s.ingredient_name} rədd edildi.`); }}
                            className="px-2.5 py-1 rounded-md text-[10px] font-medium text-red-400/70 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
                        >
                            Rədd et
                        </button>
                        <button
                            type="button"
                            disabled={applyingId !== null}
                            onClick={(e) => {
                                onApplyStart?.(s, e.currentTarget.parentElement?.parentElement as HTMLElement);
                                handleApply(s);
                            }}
                            className="relative flex items-center justify-center px-4 py-1.5 rounded-md text-xs font-bold text-black bg-emerald-400 hover:bg-emerald-300 transition-colors disabled:opacity-50 shadow-sm"
                        >
                        {applyingId === s.ingredient_id ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : (
                            'Tətbiq et'
                        )}
                        </button>
                    </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
