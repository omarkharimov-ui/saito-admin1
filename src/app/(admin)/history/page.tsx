'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Loader2, History, ShoppingCart, FileText, Package, Plus, Trash2, RotateCcw, Clock } from 'lucide-react';

interface HistoryEvent {
  id: string;
  type: 'stock' | 'order' | 'recipe';
  subType: string;
  label: string;
  entityName: string;
  quantity: string | null;
  detail: string | null;
  cost: number | null;
  date: string;
  icon: string;
}

const iconMap: Record<string, { icon: React.ElementType; color: string; bg: string; border: string }> = {
  plus:   { icon: Plus,       color: '#34D399', bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.2)' },
  trash:  { icon: Trash2,     color: '#F87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)' },
  adjust: { icon: RotateCcw,  color: '#FBBF24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.2)' },
  cart:   { icon: ShoppingCart, color: '#60A5FA', bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.2)' },
  shopping: { icon: ShoppingCart, color: '#60A5FA', bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.2)' },
  file:   { icon: FileText,   color: '#A78BFA', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.2)' },
};

const typeFilters = [
  { id: 'all', label: 'Hamısı' },
  { id: 'stock', label: 'Stok' },
  { id: 'order', label: 'Sifariş' },
  { id: 'recipe', label: 'Resept' },
];

function fmtDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return `Bu gün ${d.toLocaleTimeString('az', { hour: '2-digit', minute: '2-digit' })}`;
  if (diffDays === 1) return 'Dünən';
  if (diffDays < 7) return `${diffDays} gün əvvəl`;
  return d.toLocaleDateString('az', { day: 'numeric', month: 'short', year: 'numeric' });
}

function groupByDate(events: HistoryEvent[]) {
  const groups: { date: string; items: HistoryEvent[] }[] = [];
  let currentDate = '';
  let currentGroup: HistoryEvent[] = [];

  events.forEach((ev) => {
    const d = new Date(ev.date);
    const dateKey = d.toLocaleDateString('az', { day: 'numeric', month: 'long', year: 'numeric' });
    if (dateKey !== currentDate) {
      if (currentGroup.length > 0) groups.push({ date: currentDate, items: currentGroup });
      currentDate = dateKey;
      currentGroup = [];
    }
    currentGroup.push(ev);
  });
  if (currentGroup.length > 0) groups.push({ date: currentDate, items: currentGroup });

  return groups;
}

export default function HistoryPage() {
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/history?limit=200');
        const data = await res.json();
        setEvents(data.events || []);
      } catch { setEvents([]); }
      finally { setLoading(false); }
    })();
  }, []);

  const filtered = useMemo(() => {
    let result = events;
    if (filter !== 'all') result = result.filter(e => e.type === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(e =>
        e.entityName.toLowerCase().includes(q) ||
        e.label.toLowerCase().includes(q) ||
        (e.detail?.toLowerCase() || '').includes(q)
      );
    }
    return result;
  }, [events, filter, search]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  return (
    <div className="min-h-screen bg-[#080808] text-white pb-20 relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-15%] right-[-10%] w-[50%] h-[50%] rounded-full opacity-[0.015]"
          style={{ background: 'radial-gradient(circle, #6366F1, transparent)' }} />
      </div>

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 space-y-6">
        {/* ── Header ── */}
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold mb-2"
            style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', color: '#818CF8' }}>
            <History size={10} /> Tarixçə
          </span>
          <h1 className="text-xl sm:text-2xl font-bold">Tarixçə</h1>
          <p className="text-[11px] text-white/30 mt-1">Bütün hadisələr — stok, sifariş, resept dəyişiklikləri</p>
        </div>

        {/* ── Filters ── */}
        <div className="flex items-center gap-2 flex-wrap">
          {typeFilters.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className="px-3.5 py-1.5 rounded-lg text-[10px] font-bold tracking-wide transition-all active:scale-95"
              style={{
                background: filter === f.id ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                border: filter === f.id ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(255,255,255,0.06)',
                color: filter === f.id ? '#818CF8' : 'rgba(255,255,255,0.35)',
              }}
            >
              {f.label}
            </button>
          ))}
          <div className="relative ml-auto max-w-[200px]">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/20" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Axtar..."
              className="w-full pl-8 pr-2.5 py-1.5 rounded-lg text-xs bg-white/[0.04] border border-white/[0.07] text-white placeholder:text-white/20 outline-none focus:border-indigo-400/30 transition-colors"
            />
          </div>
        </div>

        {/* ── Timeline ── */}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 size={28} className="animate-spin text-white/15" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24 text-white/20">
            <History size={44} className="mx-auto mb-4 opacity-20" />
            <p className="text-sm font-medium">Hadisə tapılmadı</p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map((group) => (
              <div key={group.date}>
                <div className="flex items-center gap-2 mb-3">
                  <Clock size={12} className="text-white/20" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/20">{group.date}</span>
                  <div className="flex-1 h-px bg-white/[0.04]" />
                  <span className="text-[9px] text-white/10 tabular-nums">{group.items.length} hadisə</span>
                </div>

                <div className="relative">
                  <div className="absolute left-[15px] top-2 bottom-2 w-px bg-white/[0.06]" />

                  <div className="space-y-2">
                    {group.items.map((ev) => {
                      const cfg = iconMap[ev.icon] || iconMap.shopping;
                      const Icon = cfg.icon;
                      return (
                        <motion.div
                          key={ev.id}
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.2 }}
                          className="flex items-start gap-3 pl-1"
                        >
                          <div className="relative z-10 flex-shrink-0 w-[30px] h-[30px] rounded-full flex items-center justify-center"
                            style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
                          >
                            <Icon size={13} style={{ color: cfg.color }} />
                          </div>

                          <div className="flex-1 min-w-0 py-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs font-semibold text-white/80 truncate">{ev.label}</span>
                                <span className="text-[10px] text-white/25 font-medium truncate">{ev.entityName}</span>
                              </div>
                              <span className="text-[9px] text-white/20 whitespace-nowrap tabular-nums flex-shrink-0" suppressHydrationWarning>
                                {fmtDate(ev.date)}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                              {ev.quantity && (
                                <span className={`text-[10px] font-semibold tabular-nums ${
                                  ev.quantity.startsWith('+') ? 'text-emerald-400/70' : 'text-red-400/70'
                                }`}>
                                  {ev.quantity} əd.
                                </span>
                              )}
                              {ev.cost !== null && ev.cost !== undefined && (
                                <span className="text-[9px] text-white/20 tabular-nums">
                                  ₼{Number(ev.cost).toFixed(2)}
                                </span>
                              )}
                              {ev.detail && (
                                <span className="text-[10px] text-white/25 truncate">{ev.detail}</span>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
