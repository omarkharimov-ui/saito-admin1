'use client';

// 13c — AI Inventory Advisor (the "our AI is better" flagship): a compact
// premium card of LLM-narrated cards (severity-ranked) over deterministic
// 30-day stats. Falls back to raw stats when the LLM is unavailable —
// the feed is never silently empty.
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, RefreshCw, Loader2 } from '@/components/ui/saito-icons';
import { toast } from '@/lib/toast';

interface AdvisorCard { severity: 'high' | 'medium' | 'info'; title: string; body: string; }
interface Advisor { cards: AdvisorCard[]; data_only: boolean; stats: any; generated_at: string; }

const SEV_STYLE: Record<string, { ring: string; dot: string; label: string }> = {
  high: { ring: 'border-rose-500/30 bg-rose-500/[0.05]', dot: 'bg-rose-500', label: 'Təcili' },
  medium: { ring: 'border-amber-500/30 bg-amber-500/[0.05]', dot: 'bg-amber-500', label: 'Diqqət' },
  info: { ring: 'border-[var(--theme-border)] bg-[var(--theme-surface)]', dot: 'bg-sky-500', label: 'Info' },
};

export default function AdvisorCard() {
  const [data, setData] = useState<Advisor | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (manual = false) => {
    setLoading(true);
    try {
      const res = await fetch('/api/inventory/advisor', { cache: 'no-store' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setData(d);
    } catch (e: any) {
      if (manual) toast.error(e.message || 'Advisor yüklənə bilmədi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // 13m D4: reserved-height skeleton while loading — without this the card
  // pops in AFTER the table rendered and pushes it 154px (layout shift).
  if (loading && !data) {
    return (
      <div className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-xl bg-[var(--theme-surface-soft)] animate-pulse" />
          <div className="h-3 w-40 rounded bg-[var(--theme-surface-soft)] animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-[88px] rounded-2xl bg-[var(--theme-surface-soft)] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-xl bg-gradient-to-br from-emerald-500/25 to-sky-500/25 border border-emerald-500/30 flex items-center justify-center">
            <Sparkles size={14} className="text-emerald-400" />
          </span>
          <div>
            <h3 className="text-[12px] font-black text-[var(--theme-text)]">AI Inventory Advisor</h3>
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--theme-text-muted)]">30 günlük statistika üzrə · {new Date(data?.generated_at || Date.now()).toLocaleTimeString('az', { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        </div>
        <button onClick={() => load(true)} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold bg-[var(--theme-panel)] hover:bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)] transition-all border border-[var(--theme-border)]">
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Yenilə
        </button>
      </div>

      {loading && !data ? (
        <div className="flex items-center gap-2 text-[12px] text-[var(--theme-text-muted)] py-4"><Loader2 size={14} className="animate-spin" /> Analiz edilir…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {(data?.cards || []).map((c, i) => {
            const s = SEV_STYLE[c.severity] || SEV_STYLE.info;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`rounded-2xl border p-3.5 ${s.ring}`}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                  <span className="text-[9px] font-black uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">{s.label}</span>
                </div>
                <p className="text-[12px] font-bold text-[var(--theme-text)] leading-snug">{c.title}</p>
                <p className="text-[11px] text-[var(--theme-text-muted)] leading-relaxed mt-1">{c.body}</p>
              </motion.div>
            );
          })}
          {data && data.cards.length === 0 && (
            <div className="col-span-full py-1 space-y-1.5">
              {data.data_only ? (
                // 13k: honest fallback — "hamı normaldır" was misleading while
                // the LLM key was missing (5 negative stocks went unmentioned).
                <>
                  <p className="text-[12px] font-semibold text-[var(--theme-text-secondary)]">
                    AI analizi aktiv deyil — GROQ_API_KEY konfiqurasiya olunmayıb. Ana statistikalar:
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--theme-text-muted)]">
                    <span>tükənən: <b className="text-[var(--theme-text)] tabular-nums">{data.stats?.depleting?.length || 0}</b></span>
                    <span>nəfs stok: <b className="text-rose-500 tabular-nums">{data.stats?.negative?.length || 0}</b></span>
                    <span>tazəlik (≤3g): <b className="text-amber-500 light:text-amber-600 tabular-nums">{data.stats?.freshness?.length || 0}</b></span>
                    <span>itki: <b className="text-[var(--theme-text)] tabular-nums">{data.stats?.shrinkage?.length || 0}</b></span>
                    <span>qiymət sürüşməsi: <b className="text-[var(--theme-text)] tabular-nums">{data.stats?.price_drift?.length || 0}</b></span>
                  </div>
                </>
              ) : (
                <p className="text-[12px] text-[var(--theme-text-muted)]">
                  AI kartı yoxdur — hamı normaldadır. Xam statistikalar Report tab-da.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
