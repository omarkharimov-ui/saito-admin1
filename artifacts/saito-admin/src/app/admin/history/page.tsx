'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, Loader2, History, ShoppingCart, FileText,
  Plus, Trash2, RotateCcw, ChevronDown, Clock,
} from 'lucide-react';
import { EmptyState, LoadingSkeleton } from '@/components/ui/primitives';

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

const iconCfg: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  plus:     { icon: Plus,       color: '#34D399', label: 'Stoka giriş' },
  trash:    { icon: Trash2,     color: '#F87171', label: 'İtki' },
  adjust:   { icon: RotateCcw,  color: '#FBBF24', label: 'Tənzimləmə' },
  cart:     { icon: ShoppingCart, color: '#60A5FA', label: 'Sifariş sərfiyyatı' },
  shopping: { icon: ShoppingCart, color: '#818CF8', label: 'Satış' },
  file:     { icon: FileText,   color: '#A78BFA', label: 'Resept' },
};

const filters = [
  { id: 'all',   label: 'Hamısı' },
  { id: 'stock', label: 'Stok' },
  { id: 'order', label: 'Sifariş' },
  { id: 'recipe',label: 'Resept' },
];

function timeAgo(iso: string) {
  const d = new Date(iso);
  const n = new Date();
  const diff = n.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);

  if (days === 0) {
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `Bu gün ${h}:${m}`;
  }
  if (days === 1) return 'Dünən';
  if (days < 7) return `${days} gün əvvəl`;
  if (days < 30) return `${Math.floor(days / 7)} həftə əvvəl`;
  return d.toLocaleDateString('az', { day: 'numeric', month: 'short' });
}

function dateLabel(iso: string) {
  const d = new Date(iso);
  const n = new Date();
  const diff = n.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);

  if (days === 0) return 'Bu gün';
  if (days === 1) return 'Dünən';
  if (days < 7) {
    const names = ['Bazar', 'Bazar ertəsi', 'Çərşənbə axşamı', 'Çərşənbə', 'Cümə axşamı', 'Cümə', 'Şənbə'];
    return names[d.getDay()];
  }
  return d.toLocaleDateString('az', { day: 'numeric', month: 'long', year: 'numeric' });
}

function groupByDay(events: HistoryEvent[]) {
  const map = new Map<string, HistoryEvent[]>();
  events.forEach(ev => {
    const key = new Date(ev.date).toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(ev);
  });
  return Array.from(map.entries()).map(([_, items]) => ({ date: items[0].date, items }));
}

export default function HistoryPage() {
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;
  const searchRef = useRef<HTMLInputElement>(null);

  const fetchEvents = useCallback(async (isLoadMore = false) => {
    if (isLoadMore) setLoadingMore(true);
    else setLoading(true);

    try {
      const currentOffset = isLoadMore ? offset + LIMIT : 0;
      const res = await fetch(`/api/history?type=${filter}&limit=${LIMIT}&offset=${currentOffset}`);
      const data = await res.json();
      
      if (isLoadMore) {
        setEvents(prev => [...prev, ...(data.events || [])]);
        setOffset(currentOffset);
      } else {
        setEvents(data.events || []);
        setOffset(0);
      }
    } catch {
      if (!isLoadMore) setEvents([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filter, offset]);

  useEffect(() => {
    fetchEvents(false);
  }, [filter]);

  // Task 9: Real-time Polling (30s)
  useEffect(() => {
    const interval = setInterval(() => fetchEvents(false), 30000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  const filtered = useMemo(() => {
    try {
      const mapL: Record<string, string> = { ə:'e', ü:'u', ö:'o', ı:'i', ş:'s', ç:'c' };
      const n = (s: any) => String(s||'').toLowerCase().replace(/[əüöışç]/g, c => mapL[c]||c);
      let r = events;
      const q = n(search).trim();
      if (q) r = r.filter(e => n(e.entityName).includes(q) || n(e.label).includes(q) || (e.detail && n(e.detail).includes(q)));
      return r;
    } catch { return events; }
  }, [events, search]);

  const days = useMemo(() => groupByDay(filtered), [filtered]);
  const count = filtered.length;
  const hasFilter = search.trim() || filter !== 'all';

  return (
    <div className="min-h-screen bg-[#080808] text-white pb-32 relative">
      {/* Ambient */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full opacity-[0.012]"
          style={{ background: 'radial-gradient(circle, #6366F1, transparent)' }} />
        <div className="absolute bottom-[-15%] left-[-10%] w-[40%] h-[40%] rounded-full opacity-[0.008]"
          style={{ background: 'radial-gradient(circle, #D4AF37, transparent)' }} />
      </div>

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12">
        {/* ── Header ── */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <History size={16} style={{ color: '#818CF8' }} />
                </div>
                <div>
                <h1 className="text-lg sm:text-xl font-bold tracking-tight">Tarixçə</h1>
                <p className="text-[11px] text-white/25">Stok, sifariş və resept hərəkətləri</p>
                </div>
            </div>
            {loading && <Loader2 size={16} className="animate-spin text-white/20" />}
          </div>
        </div>

        {/* ── Search + Filter bar ── */}
        <div className="mb-6 space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/15 pointer-events-none" />
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Hadisə və ya məhsul axtar..."
              className="w-full pl-10 pr-9 py-3 rounded-xl text-sm bg-white/[0.03] border border-white/[0.08] text-white placeholder:text-white/20 outline-none focus:border-white/20 transition-all duration-300"
            />
            {search && (
              <button onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/60 transition-colors">
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {filters.map(f => (
                <button key={f.id} onClick={() => setFilter(f.id)}
                  className={`px-4 py-1.5 rounded-full text-[11px] font-bold tracking-wide transition-all whitespace-nowrap border ${
                    filter === f.id ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' : 'bg-white/5 border-white/5 text-white/30 hover:text-white/50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Timeline ── */}
        {loading && events.length === 0 ? (
          <div className="space-y-6 pt-10">
             {[1,2,3].map(i => (
                 <div key={i} className="flex gap-4">
                     <div className="w-10 h-10 rounded-xl bg-white/5 animate-pulse" />
                     <div className="flex-1 space-y-2">
                        <div className="h-4 w-32 bg-white/5 rounded animate-pulse" />
                        <div className="h-3 w-full bg-white/5 rounded animate-pulse" />
                     </div>
                 </div>
             ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<History size={20} />}
            title="Heç bir tarixçə qeydi yoxdur"
            description="Hələ ki, heç bir inventar hərəkəti qeydə alınmayıb."
          />
        ) : (
          <div className="space-y-8">
            {days.map((day) => (
              <div key={day.date}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">
                    {dateLabel(day.date)}
                  </span>
                  <div className="flex-1 h-px bg-white/[0.05]" />
                </div>

                <div className="space-y-3">
                  {day.items.map((ev) => {
                    const cfg = iconCfg[ev.icon] || iconCfg.shopping;
                    const Icon = cfg.icon;
                    return (
                      <motion.div key={ev.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-4 items-start group">
                        <div className="mt-1 w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border transition-all"
                          style={{ background: cfg.color + '10', borderColor: cfg.color + '20' }}>
                          <Icon size={14} style={{ color: cfg.color }} />
                        </div>
                        <div className="flex-1 min-w-0 py-2 border-b border-white/[0.04] group-last:border-0">
                           <div className="flex justify-between items-start gap-2">
                                <div className="min-w-0">
                                    <p className="text-[13px] font-bold text-white/90 truncate">{ev.label} — <span className="text-white/40">{ev.entityName}</span></p>
                                    <div className="flex items-center gap-3 mt-1">
                                        {ev.quantity && <span className={`text-[10px] font-black ${ev.quantity.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'}`}>{ev.quantity}</span>}
                                        {ev.cost !== null && <span className="text-[10px] text-white/20 font-bold">₼{Number(ev.cost).toFixed(2)}</span>}
                                        {ev.detail && <span className="text-[10px] text-white/20 truncate italic">"{ev.detail}"</span>}
                                    </div>
                                </div>
                                <span className="text-[9px] text-white/10 font-mono mt-1 whitespace-nowrap">{timeAgo(ev.date)}</span>
                           </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Load More Button */}
            <div className="pt-8 flex justify-center">
                <button 
                    onClick={() => fetchEvents(true)}
                    disabled={loadingMore}
                    className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-white/5 border border-white/10 text-white/40 text-xs font-black uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
                >
                    {loadingMore ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} />}
                    Daha çox yüklə
                </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
