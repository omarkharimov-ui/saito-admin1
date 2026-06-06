'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, Loader2, History, ShoppingCart, FileText,
  Plus, Trash2, RotateCcw, ChevronDown, Clock,
} from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';

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
  const { lightMode } = useTheme();
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

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
    try {
      const mapL: Record<string, string> = { ə:'e', ü:'u', ö:'o', ı:'i', ş:'s', ç:'c' };
      const n = (s: any) => String(s||'').toLowerCase().replace(/[əüöışç]/g, c => mapL[c]||c);
      let r = events;
      if (filter !== 'all') r = r.filter(e => e.type === filter);
      const q = n(search).trim();
      if (q) r = r.filter(e => n(e.entityName).includes(q) || n(e.label).includes(q) || n(e.detail).includes(q) || n(e.quantity).includes(q));
      return r;
    } catch { return events; }
  }, [events, filter, search]);

  const days = useMemo(() => groupByDay(filtered), [filtered]);
  const count = filtered.length;
  const hasFilter = search.trim() || filter !== 'all';

  return (
    <div className={`min-h-screen pb-24 relative ${lightMode ? 'bg-white text-gray-900' : 'bg-[#080808] text-white'}`}>
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
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <History size={16} style={{ color: '#818CF8' }} />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight">Tarixçə</h1>
              <p className={`text-[11px] ${lightMode ? 'text-gray-300' : 'text-white/25'}`}>
                {events.length > 0 ? `${events.length} hadisə` : 'Stok, sifariş və resept hadisələri'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Search + Filter bar ── */}
        <div className="mb-6 space-y-3">
          <div className="relative">
            <Search size={14} className={`absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none ${lightMode ? 'text-gray-200' : 'text-white/15'}`} />
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Hadisə və ya məhsul axtar..."
              className={`w-full pl-10 pr-9 py-3 rounded-xl text-sm border placeholder:text-white/15 outline-none focus:border-indigo-400/25 transition-all duration-300 ${lightMode ? 'bg-gray-50 border-gray-200 text-gray-900' : 'bg-white/[0.03] border-white/[0.07] text-white'}`}
            />
            {search && (
              <button onClick={() => setSearch('')}
                className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${lightMode ? 'text-gray-300 hover:text-gray-600' : 'text-white/20 hover:text-white/60'}`}>
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {filters.map(f => (
                <button key={f.id} onClick={() => setFilter(f.id)}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-semibold tracking-wide transition-all active:scale-95"
                  style={{
                    background: filter === f.id ? 'rgba(99,102,241,0.12)' : 'transparent',
                    color: filter === f.id ? '#818CF8' : 'rgba(255,255,255,0.25)',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {count > 0 && (
              <span className={`text-[10px] tabular-nums ${lightMode ? 'text-gray-200' : 'text-white/15'}`}>
                {count} hadisə
              </span>
            )}
          </div>
        </div>

        {/* ── Timeline ── */}
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={22} className="animate-spin" style={{ color: '#818CF8' }} />
              <span className={`text-[11px] ${lightMode ? 'text-gray-200' : 'text-white/15'}`}>Yüklənir...</span>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="text-center py-32"
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: lightMode ? '#f3f4f6' : 'rgba(255,255,255,0.03)', border: lightMode ? '1px solid #e5e7eb' : '1px solid rgba(255,255,255,0.06)' }}>
              <History size={24} className={lightMode ? 'text-gray-200' : 'text-white/10'} />
            </div>
            <p className={`text-sm font-medium ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>
              {hasFilter ? 'Heç nə tapılmadı' : 'Hələ hadisə yoxdur'}
            </p>
            {hasFilter && (
              <button onClick={() => { setSearch(''); setFilter('all'); }}
                className="mt-3 text-[11px] text-indigo-400/50 hover:text-indigo-400 transition-colors">
                Filtrləri təmizlə
              </button>
            )}
          </motion.div>
        ) : (
          <div className="space-y-8">
            {days.map((day, di) => (
              <div key={day.date}>
                {/* Day header */}
                <div className="flex items-center gap-3 mb-4">
                  <Clock size={11} className="text-white/[0.08]" />
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/[0.07]">
                    {dateLabel(day.date)}
                  </span>
                  <div className={`flex-1 h-px ${lightMode ? 'bg-gray-50' : 'bg-white/[0.03]'}`} />
                  <span className="text-[8px] text-white/[0.06] tabular-nums">{day.items.length}</span>
                </div>

                {/* Events */}
                <div className="relative">
                  {/* Timeline line */}
                  <div className={`absolute left-[17px] top-3 bottom-3 w-px ${lightMode ? 'bg-gray-50/80' : 'bg-white/[0.04]'}`} />

                  <div className="space-y-2.5">
                    {day.items.map((ev, i) => {
                      const cfg = iconCfg[ev.icon] || iconCfg.shopping;
                      const Icon = cfg.icon;
                      const isPlus = ev.type === 'stock' && ev.subType === 'stock_in';
                      const isWaste = ev.type === 'stock' && ev.subType === 'waste';

                      return (
                        <motion.div
                          key={ev.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25, delay: i * 0.015 }}
                          className="relative pl-10 group"
                        >
                          {/* Icon circle */}
                          <div className="absolute left-0 top-2.5 z-10 w-[34px] h-[34px] rounded-xl flex items-center justify-center
                            transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg"
                            style={{
                              background: cfg.color + '12',
                              border: `1px solid ${cfg.color}22`,
                            }}
                          >
                            <Icon size={14} style={{ color: cfg.color }} />
                          </div>

                          {/* Card */}
                          <div className="rounded-xl px-4 py-3 transition-all duration-200 group-hover:bg-white/[0.015]"
                            style={{
                              background: lightMode ? '#f9fafb' : 'rgba(255,255,255,0.025)',
                              border: lightMode ? '1px solid #e5e7eb' : '1px solid rgba(255,255,255,0.05)',
                            }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-[13px] font-semibold truncate ${lightMode ? 'text-gray-800' : 'text-white/85'}`}>
                                    {ev.label}
                                  </span>
                                  <span className={`text-[11px] font-medium truncate ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>
                                    {ev.entityName}
                                  </span>
                                </div>

                                <div className="flex items-center gap-3 mt-1.5">
                                  {ev.quantity && (
                                    <span className={`text-[11px] font-bold tabular-nums ${
                                      isPlus ? 'text-emerald-400/80' :
                                      isWaste ? 'text-red-400/80' :
                                      ev.quantity.startsWith('+') ? 'text-emerald-400/80' : 'text-red-400/80'
                                    }`}>
                                      {ev.quantity}
                                    </span>
                                  )}
                                  {ev.cost !== null && (
                                    <span className={`text-[10px] tabular-nums ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>
                                      ₼{Number(ev.cost).toFixed(2)}
                                    </span>
                                  )}
                                  {ev.detail && (
                                    <span className={`text-[10px] truncate max-w-[200px] ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>
                                      {ev.detail}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <span className="text-[9px] text-white/[0.07] whitespace-nowrap tabular-nums flex-shrink-0 mt-0.5 font-mono" suppressHydrationWarning>
                                {timeAgo(ev.date)}
                              </span>
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
