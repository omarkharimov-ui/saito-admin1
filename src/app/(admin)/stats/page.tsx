'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { TrendingUp, BarChart3 } from 'lucide-react';
import { motion } from 'framer-motion';
import StatsTopCards from './components/StatsTopCards';
import StatsAIForecast from './components/StatsAIForecast';
import StatsRevenueChart from './components/StatsRevenueChart';
import StatsPeakHours from './components/StatsPeakHours';
import StatsProductTable from './components/StatsProductTable';
import StatsSenseiPanel from './components/StatsSenseiPanel';
import StatsCancellationChart from './components/StatsCancellationChart';
import StatsMobileView from './components/StatsMobileView';
import { toast } from 'react-hot-toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { StatSkeleton } from '@/components/SkeletonLoader';

const interpolateTemplate = (template: string, variables: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (match, key) => String(variables[key] ?? match));

const StatsPage = () => {
  const { t, language, getCategoryTranslation } = useLanguage();

  /* ─── Filter state ─── */
  const [loading, setLoading] = useState(false);
  const [timeFilter, setTimeFilter] = useState('today');
  const [categories, setCategories] = useState<{ id: string; name: string; translations?: any }[]>([]);
  const [selectedCancellationReason, setSelectedCancellationReason] = useState<string | null>(null);
  const [cancellationDetails, setCancellationDetails] = useState<{
    id: string; reason: string; reasonText: string; orderId: string;
    tableNumber: number | null; createdAt: string; totalAmount: number;
    items: { name: string; quantity: number; price: number }[];
  }[]>([]);
  const [stats, setStats] = useState(() => {
    const empty = {
      totalRevenue: 0, totalOrders: 0, aov: 0, peakHour: '—', topProduct: '—',
      missedRevenue: 0, peakHours: [] as { hour: number; count: number }[],
      activeTables: 0, chartData: [] as any[], productPerformance: [] as any[],
      cancellationReasons: [] as { key: string; name: string; value: number; color: string }[],
      tableChurn: null as any,
      haloProducts: [] as any[],
      cancelPeakHours: {} as Record<string, { hour: number; count: number }[]>,
    };
    try {
      const r = localStorage.getItem('saito_stats_cache_v4_today');
      if (!r) return empty;
      const parsed = JSON.parse(r);
      if (!Array.isArray(parsed.peakHours)) return empty;
      return parsed;
    } catch {
      return empty;
    }
  });

  /* ─── AI state ─── */
  const [forecast, setForecast] = useState<{ predictedRevenue: number; trend: number; confidence: 'high' | 'medium' | 'low' } | null>(null);
  const [anomalies, setAnomalies] = useState<{ type: string; message: string; severity: 'warning' | 'critical' }[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiDisplayed, setAiDisplayed] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiClosing, setAiClosing] = useState(false);
  const [logoFlash, setLogoFlash] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [whatIfProduct, setWhatIfProduct] = useState('');
  const [whatIfChange, setWhatIfChange] = useState(0);
  const [whatIfResult, setWhatIfResult] = useState<string | null>(null);
  const [whatIfLoading, setWhatIfLoading] = useState(false);
  const senseiStatsAdvice = null;

  const handleFetchAiAnalysis = async () => {
    if (aiLoading) return;
    setAiLoading(true);
    try {
      const res = await fetch('/api/sensei/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stats, timeFilter, language }),
      });
      const data = await res.json();
      const text = data.analysis || data.text || data.message || null;
      setAiAnalysis(text);
      setAiDisplayed(text);
    } catch { /* silent */ }
    finally { setAiLoading(false); }
  };

  const handleCloseAiAnalysis = () => {
    setAiClosing(true);
    setTimeout(() => { setAiAnalysis(null); setAiDisplayed(null); setAiClosing(false); }, 300);
  };

  const handleSendChat = async (msg: string) => {
    if (!msg.trim() || chatLoading) return;
    setChatMessages(prev => [...prev, { role: 'user', text: msg }]);
    setChatLoading(true);
    try {
      const res = await fetch('/api/sensei/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, stats }),
      });
      const data = await res.json();
      setChatMessages(prev => [...prev, { role: 'ai', text: data.reply || '...' }]);
    } catch {
      setChatMessages(prev => [...prev, { role: 'ai', text: '...' }]);
    }
    finally { setChatLoading(false); }
  };

  const handleFetchWhatIf = async () => {
    if (!whatIfProduct || whatIfLoading) return;
    setWhatIfLoading(true);
    try {
      const res = await fetch('/api/sensei/whatif', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: whatIfProduct, priceChange: whatIfChange, stats }),
      });
      const data = await res.json();
      setWhatIfResult(data.result || null);
    } catch { /* silent */ }
    finally { setWhatIfLoading(false); }
  };

  const [workHours, setWorkHours] = useState<{ open: number; close: number } | null>(null);

  const [restaurantCity, setRestaurantCity] = useState<string>('Baku,AZ');

  /* ─── Fetch categories once on mount ─── */
  useEffect(() => {
    supabase.from('categories').select('id, name, translations').order('name')
      .then(({ data }) => { if (data) setCategories(data); });
  }, []);

  useEffect(() => {
    let stale = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      await fetchDetailedStats(() => stale);
    })();
    const ch = createRealtimeChannel('stats_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { if (!stale) fetchDetailedStats(() => false); }, 2000);
      })
      .subscribe();
    return () => {
      stale = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      removeRealtimeChannel(ch);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeFilter, language]);

  /* ─── One-time cache invalidation: clear caches with empty peakHours ─── */
  useEffect(() => {
    try {
      ['today','week','month','3months','year'].forEach(f => {
        const key = `saito_stats_cache_v4_${f}`;
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const firstDate = parsed.chartData?.[0]?.date ?? '';
        const badDate = f !== 'today' && !String(firstDate).includes(' ');
        if (!Array.isArray(parsed.peakHours) || parsed.peakHours.length === 0 || badDate) {
          localStorage.removeItem(key);
        }
      });
    } catch {}
  }, []);

  /* ─── Data fetching ─── */
  const fetchDetailedStats = async (isStale?: () => boolean) => {
    const cacheKey = `saito_stats_cache_v4_${timeFilter}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const firstDate = parsed.chartData?.[0]?.date ?? '';
        const validDate = timeFilter === 'today' || String(firstDate).includes(' ');
        if (Array.isArray(parsed.peakHours) && parsed.peakHours.length > 0 && validDate) {
          setStats(parsed);
          if (!isStale || !isStale()) setLoading(false);
          return;
        }
        localStorage.removeItem(cacheKey);
      }
    } catch {}
    setLoading(true);
    const start2 = Date.now();
    try {
      // API route istifadə edirik (RLS recursion-dan qaçmaq üçün)
      const res = await fetch(`/api/stats?timeFilter=${timeFilter}`);
      if (!res.ok) throw new Error('Stats API xətası');
      
      const data = await res.json();
      
      // Settings üçün ayrıca fetch
      const { data: settingsData } = await supabase.from('settings').select('opening_hours, city, address').single();
      if (settingsData?.city) {
        setRestaurantCity(settingsData.city.includes(',') ? settingsData.city : `${settingsData.city},AZ`);
      } else {
        setRestaurantCity('Baku,AZ');
      }
      let openHour = 0, closeHour = 24;
      if (settingsData?.opening_hours) {
        try {
          const parts = settingsData.opening_hours.split(/[–\-]/).map((p: string) => p.trim());
          if (parts.length === 2) {
            openHour = parseInt(parts[0].split(':')[0], 10);
            const parsedClose = parseInt(parts[1].split(':')[0], 10);
            closeHour = parsedClose === 0 ? 24 : parsedClose;
          }
        } catch {}
      }
      setWorkHours({ open: openHour, close: closeHour });

      // Format cancellation reasons
      const reasonColors: Record<string, string> = { delay: '#ef4444', wrong_order: '#f59e0b', customer_refused: '#8b5cf6', quality_issue: '#06b6d4', other: '#6b7280' };
      const reasonLabels: Record<string, string> = { customer_refused: t('reason_customer_refused'), quality_issue: t('reason_quality_issue'), delay: t('reason_delay'), wrong_order: t('reason_wrong_order'), other: t('reason_other') };
      const formattedReasons = (data.cancellationReasons || []).map((r: any) => ({
        key: r.reason || 'other',
        name: reasonLabels[r.reason || 'other'] || r.reason || 'other',
        value: r.count || 0,
        color: reasonColors[r.reason || 'other'] || '#6B7280'
      }));

      const statsData = {
        totalRevenue: data.totalRevenue ?? 0,
        totalOrders: data.totalOrders ?? 0,
        aov: data.aov ?? 0,
        peakHours: data.peakHours ?? [],
        productPerformance: data.productPerformance ?? [],
        cancellationReasons: formattedReasons,
        chartData: data.chartData ?? [],
        missedRevenue: data.missedRevenue ?? 0,
        peakHour: data.peakHour ?? '—',
        topProduct: data.topProduct ?? '—',
        activeTables: data.activeTables ?? 0,
        tableChurn: data.tableChurn ?? null,
        haloProducts: data.haloProducts ?? [],
        cancelPeakHours: data.cancelPeakHours ?? {},
      };
      
      setStats(statsData);
      setCancellationDetails(formattedReasons);
      try { localStorage.setItem(cacheKey, JSON.stringify(statsData)); } catch {}

      // Only show anomaly if there are actual cancellations
      const detectedAnomalies: { type: string; message: string; severity: 'warning' | 'critical' }[] = [];
      const totalCancellations = (data.cancellationReasons || []).reduce((a: number, b: any) => a + (b.count || 0), 0);
      if (totalCancellations > 0)
        detectedAnomalies.push({ type: 'cancellation_spike', message: interpolateTemplate(t('anomaly_cancellation_spike'), { count: totalCancellations }), severity: 'warning' });
      setAnomalies(detectedAnomalies);

      /* ─── Table Churn Analysis ─── */
      const tableOrders: Record<number, Date[]> = {};
      data.chartData?.forEach((o: any) => {
        const tn = o.table_number;
        if (!tn) return;
        if (!tableOrders[tn]) tableOrders[tn] = [];
        tableOrders[tn].push(new Date(o.created_at));
      });
      const allTableNums = Object.keys(tableOrders).map(Number);
      const repeatTables = allTableNums.filter(tn => tableOrders[tn].length > 1).length;
      const sortedTables = allTableNums.map(tn => ({ tn, dates: tableOrders[tn].sort((a, b) => a.getTime() - b.getTime()) }));
      const nowTs = Date.now();
      const churnedTables = sortedTables.filter(({ dates }) => {
        const lastOrder = dates[dates.length - 1];
        const daysSince = (nowTs - lastOrder.getTime()) / (1000 * 60 * 60 * 24);
        return daysSince > 14; // not ordered in last 14 days
      }).length;
      const avgDaysBetween = sortedTables.filter(s => s.dates.length > 1).reduce((sum, s) => {
        let totalDays = 0;
        for (let i = 1; i < s.dates.length; i++) totalDays += (s.dates[i].getTime() - s.dates[i-1].getTime()) / (1000 * 60 * 60 * 24);
        return sum + totalDays / (s.dates.length - 1);
      }, 0) / (repeatTables || 1);
      const tableChurn = allTableNums.length > 0 ? {
        totalTables: allTableNums.length,
        repeatTables,
        churnedTables,
        churnRate: Math.round((churnedTables / allTableNums.length) * 100),
        avgDaysBetween: Math.round(avgDaysBetween * 10) / 10,
      } : null;

      // Use API data directly - already set in statsData above
      try { localStorage.setItem(`saito_stats_cache_v4_${timeFilter}`, JSON.stringify(statsData)); } catch {}
    } catch (err) { console.error(err); toast.error(t('stats_error'), { id: 'action-toast' }); }
    finally {
      if (!isStale || !isStale()) setLoading(false);
    }
  };

  return (
    <div className="relative">

      {/* ══ MOBILE VIEW ══ */}
      <div className="lg:hidden">
        <StatsMobileView
          stats={stats}
          forecast={forecast}
          anomalies={anomalies}
          timeFilter={timeFilter}
          loading={loading}
          onTimeFilterChange={(f) => { setSelectedCancellationReason(null); setTimeFilter(f); }}
          aiAnalysis={aiAnalysis}
          aiDisplayed={aiDisplayed}
          aiLoading={aiLoading}
          aiClosing={aiClosing}
          logoFlash={logoFlash}
          onFetchAiAnalysis={handleFetchAiAnalysis}
          onCloseAiAnalysis={handleCloseAiAnalysis}
        />
      </div>

      {/* ══ DESKTOP VIEW ══ */}
      <div className="hidden lg:block space-y-10 pb-20">

      {/* Header & Filter */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 bg-gold/10 text-gold rounded-xl flex-shrink-0"><BarChart3 size={18} className="md:w-6 md:h-6" /></div>
          <h2 className="text-xl md:text-3xl font-serif font-bold text-white truncate">{t('statistics_title')}</h2>
        </div>
        <div className="flex items-center gap-1 bg-card border border-white/5 p-1 rounded-xl overflow-x-auto scrollbar-none flex-shrink-0 max-w-[60vw] md:max-w-none">
          {[{ id: 'today', label: t('filter_today') }, { id: 'week', label: t('filter_week') }, { id: 'month', label: t('filter_month') }, { id: '3months', label: t('filter_3months') }, { id: 'year', label: t('filter_year') }].map(f => (
            <button key={f.id} onClick={() => { setSelectedCancellationReason(null); setTimeFilter(f.id); }}
              className={`relative px-3 py-1.5 md:px-4 md:py-2 text-[9px] md:text-[10px] uppercase tracking-widest font-bold rounded-lg transition-all whitespace-nowrap ${timeFilter === f.id ? 'text-gold bg-gold/10 border border-gold/25' : 'text-white/35 hover:text-white/70 border border-transparent'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-10">
      <StatsTopCards totalRevenue={stats.totalRevenue} totalOrders={stats.totalOrders} aov={stats.aov} missedRevenue={stats.missedRevenue} />
      <StatsAIForecast forecast={forecast} anomalies={anomalies} />
      <StatsRevenueChart chartData={stats.chartData} />

      <StatsSenseiPanel
        stats={stats}
        aiAnalysis={aiAnalysis}
        aiDisplayed={aiDisplayed}
        aiLoading={aiLoading}
        aiClosing={aiClosing}
        logoFlash={logoFlash}
        senseiStatsAdvice={senseiStatsAdvice}
        chatMessages={chatMessages}
        chatLoading={chatLoading}
        whatIfProduct={whatIfProduct}
        whatIfChange={whatIfChange}
        whatIfResult={whatIfResult}
        whatIfLoading={whatIfLoading}
        onFetchAiAnalysis={handleFetchAiAnalysis}
        onCloseAiAnalysis={handleCloseAiAnalysis}
        onSendChat={handleSendChat}
        onWhatIfProductChange={setWhatIfProduct}
        onWhatIfChangeChange={setWhatIfChange}
        onFetchWhatIf={handleFetchWhatIf}
        restaurantCity={restaurantCity}
      />

      <StatsPeakHours peakHours={stats.peakHours} timeFilter={timeFilter} />

      <StatsCancellationChart
        cancellationReasons={stats.cancellationReasons}
        cancellationDetails={cancellationDetails}
        selectedReason={selectedCancellationReason}
        onSelectReason={setSelectedCancellationReason}
      />

      <StatsProductTable
        productPerformance={stats.productPerformance}
        categories={categories}
        getCategoryTranslation={getCategoryTranslation}
      />
      </div>
      </div>{/* end desktop */}
    </div>
  );
};

export default StatsPage;
