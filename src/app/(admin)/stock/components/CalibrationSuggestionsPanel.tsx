'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {   Sparkles, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
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
  onApplied?: () => void;
}

export function CalibrationSuggestionsPanel({ suggestions, onApplied }: Props) {
  const [applying, setApplying] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const selectable = useMemo(() => suggestions.filter(s => s.ingredient_id), [suggestions]);
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
      onApplied?.();
    } catch {
      toast.error('Calibrasiya tətbiq edilə bilmədi');
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 shadow-[0_12px_30px_rgba(0,0,0,0.12)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-white/40">
            <Sparkles size={12} /> Calibration suggestions
          </div>
          <h3 className="mt-2 text-lg font-semibold text-white">Reverse inventory calibration</h3>
          <p className="mt-1 text-sm text-white/55">AI/stock mismatch nəticələrini bir kliklə tətbiq et.</p>
        </div>
        {count > 0 && (
          <div className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-300">
            {count}
          </div>
        )}
      </div>

      {count === 0 ? (
        <div className="mt-4 px-3 py-4 text-center text-white/25 text-xs space-y-2">
          <CheckCircle2 size={20} className="mx-auto mb-2 text-emerald-400/50" />
          <p className="text-sm font-medium text-white/40">Bütün stok göstəriciləri sinxronizə olunub</p>
          <p>Hazırda heç bir calibrasiya təklifi yoxdur.</p>
          <p className="text-white/15">
            Satış məlumatları toplandıqca və stok sayımları aparıldıqca
            <br />AI uyğunsuzluqları aşkarlayaraq burada təkliflər göstərəcək.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {selectable.slice(0, 4).map((s) => (
            <button
              key={s.ingredient_id}
              type="button"
              onClick={() => void apply(s)}
              className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${applyingId === s.ingredient_id ? 'border-emerald-400/30 bg-emerald-400/10' : 'border-white/10 bg-white/[0.03]'}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">{s.ingredient_name}</div>
                  <div className="text-xs text-white/45">{s.reason}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-white">{s.suggested_adjustment_pct.toFixed(1)}%</div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">conf {Math.round(s.confidence * 100)}%</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {count > 0 && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-white/45">
            <AlertTriangle size={14} className="text-amber-300" />
            Aktiv calibrasiya: {count}
          </div>
          <div className="text-xs text-white/35">Hər kartı birbaşa klikləyərək tətbiq et</div>
        </div>
      )}
    </motion.div>
  );
}
