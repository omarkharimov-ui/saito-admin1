'use client';

import { useState, useEffect } from 'react';
import { toast } from '@/lib/toast';
import { useTheme } from '@/lib/theme/ThemeContext';

interface Analytics {
  id: string;
  order_id: string;
  order_item_id: string;
  station: string;
  prep_time_seconds: number | null;
  delay_seconds: number | null;
  rush: boolean;
  created_at: string;
}

export default function KitchenAnalyticsPage() {
  const { lightMode } = useTheme();
  const [analytics, setAnalytics] = useState<Analytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [stationFilter, setStationFilter] = useState<string>('all');

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const url = stationFilter === 'all' 
        ? '/api/kitchen/analytics' 
        : `/api/kitchen/analytics?station=${stationFilter}`;
      const res = await fetch(url);
      const data = await res.json();
      setAnalytics(data.analytics || []);
    } catch {
      setAnalytics([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAnalytics(); }, [stationFilter]);

  const avgPrepTime = analytics.length > 0
    ? Math.round(analytics.reduce((s, a) => s + (a.prep_time_seconds || 0), 0) / analytics.length / 60)
    : 0;

  const stationStats = analytics.reduce((acc, a) => {
    if (!acc[a.station]) acc[a.station] = { count: 0, totalPrep: 0, delays: 0 };
    acc[a.station].count++;
    acc[a.station].totalPrep += a.prep_time_seconds || 0;
    if (a.delay_seconds && a.delay_seconds > 0) acc[a.station].delays++;
    return acc;
  }, {} as Record<string, { count: number; totalPrep: number; delays: number }>);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-black tracking-tighter">Mətbəx Analitika</h1>
        <select
          value={stationFilter}
          onChange={e => setStationFilter(e.target.value)}
          className={`px-4 py-2 rounded-xl text-sm font-bold outline-none border ${lightMode ? 'bg-white border-black/10 text-black' : 'bg-white/5 border-white/10 text-white'}`}
        >
          <option value="all">Hamısı</option>
          <option value="grill">Şirə</option>
          <option value="pizza">Pizza</option>
          <option value="bar">Bar</option>
          <option value="dessert">Şirniyyat</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className={`p-6 rounded-2xl border ${lightMode ? 'bg-white border-zinc-200' : 'bg-white/5 border-white/10'}`}>
          <p className="text-xs text-[var(--theme-text-secondary)] mb-1">Orta Hazırlama Vaxtı</p>
          <p className="text-3xl font-black">{avgPrepTime} dəq</p>
        </div>
        <div className={`p-6 rounded-2xl border ${lightMode ? 'bg-white border-zinc-200' : 'bg-white/5 border-white/10'}`}>
          <p className="text-xs text-[var(--theme-text-secondary)] mb-1">Ümumi Sifariş</p>
          <p className="text-3xl font-black">{analytics.length}</p>
        </div>
        <div className={`p-6 rounded-2xl border ${lightMode ? 'bg-white border-zinc-200' : 'bg-white/5 border-white/10'}`}>
          <p className="text-xs text-[var(--theme-text-secondary)] mb-1">Gecikmələr</p>
          <p className="text-3xl font-black text-rose-400">{analytics.filter(a => a.delay_seconds && a.delay_seconds > 0).length}</p>
        </div>
      </div>

      <div className={`rounded-2xl border overflow-hidden ${lightMode ? 'bg-white border-zinc-200' : 'bg-white/5 border-white/10'}`}>
        <div className="px-6 py-4 border-b border-white/5">
          <h2 className="text-sm font-black uppercase tracking-widest">Stansiya Yükü</h2>
        </div>
        <div className="p-6 space-y-4">
          {Object.entries(stationStats).map(([station, stats]) => (
            <div key={station} className="flex items-center justify-between">
              <span className="text-sm font-bold capitalize">{station}</span>
              <div className="flex items-center gap-4">
                <span className="text-xs text-white/40">{stats.count} sifariş</span>
                <span className="text-xs font-black">{Math.round(stats.totalPrep / 60)} dəq</span>
                {stats.delays > 0 && <span className="text-xs font-black text-rose-400">{stats.delays} gecikmə</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
