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
import StatsFinancePanel from './components/StatsFinancePanel';
import StatsCancellationChart from './components/StatsCancellationChart';
import StatsMobileView from './components/StatsMobileView';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useMinimumLoadingTime } from '@/hooks/useMinimumLoadingTime';
import { StatSkeleton } from '@/components/SkeletonLoader';

const interpolateTemplate = (template: string, variables: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (match, key) => String(variables[key] ?? match));

const StatsPage = () => {
  const { t, language, getCategoryTranslation } = useLanguage();

  /* ─── Filter state ─── */
  const [rawLoading, setLoading] = useState(true);
  const loading = useMinimumLoadingTime(rawLoading, 600);
  const [timeFilter, setTimeFilter] = useState('today');
  const [categories, setCategories] = useState<{ id: string; name: string; translations?: any }[]>([]);
  const [selectedCancellationReason, setSelectedCancellationReason] = useState<string | null>(null);
  const [cancellationDetails, setCancellationDetails] = useState<any[]>([]);
  
  const [stats, setStats] = useState(() => {
    return {
      totalRevenue: 0, totalOrders: 0, aov: 0, peakHour: '—', topProduct: '—',
      missedRevenue: 0, peakHours: [] as { hour: number; count: number }[],
      activeTables: 0, chartData: [] as any[], productPerformance: [] as any[],
      cancellationReasons: [] as { key: string; name: string; value: number; color: string }[],
      tableChurn: null as any,
      haloProducts: [] as any[],
      cancelPeakHours: {} as Record<string, { hour: number; count: number }[]>,
      totalFoodCost: 0, totalWasteCost: 0, grossProfit: 0, netProfit: 0,
      foodCostPct: 0, topProfitableItems: [] as any[], financeChartData: [] as any[],
    };
  });

  /* ─── AI state ─── */
  const [forecast, setForecast] = useState<any>(null);
  const [anomalies, setAnomalies] = useState<any[]>([]);
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
  const [workHours, setWorkHours] = useState<{ open: number; close: number } | null>(null);
  const [restaurantCity, setRestaurantCity] = useState<string>('Baku,AZ');

  /* ─── Fetch categories ─── */
  useEffect(() => {
    supabase.from('categories').select('id, name, translations').order('name')
      .then(({ data }) => { if (data) setCategories(data); });
  }, []);

  const fetchDetailedStats = useCallback(async (isStale?: () => boolean) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/stats?timeFilter=${timeFilter}`);
      if (!res.ok) throw new Error('Stats API xətası');
      const data = await res.json();
      
      const { data: settingsData } = await supabase.from('settings').select('opening_hours, city, address').single();
      if (settingsData?.city) setRestaurantCity(settingsData.city.includes(',') ? settingsData.city : `${settingsData.city},AZ`);

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
        totalFoodCost: data.totalFoodCost ?? 0,
        totalWasteCost: data.totalWasteCost ?? 0,
        grossProfit: data.grossProfit ?? 0,
        netProfit: data.netProfit ?? 0,
        foodCostPct: data.foodCostPct ?? 0,
        topProfitableItems: data.topProfitableItems ?? [],
        financeChartData: data.financeChartData ?? [],
      };
      
      setStats(statsData as any);
      setCancellationDetails(formattedReasons);
    } catch (err) { 
      console.error(err); 
    } finally {
      if (!isStale || !isStale()) setLoading(false);
    }
  }, [timeFilter, t]);

  useEffect(() => {
    let stale = false;
    fetchDetailedStats(() => stale);
    const ch = createRealtimeChannel('stats_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        if (!stale) fetchDetailedStats(() => false);
      })
      .subscribe();
    return () => { stale = true; removeRealtimeChannel(ch); };
  }, [fetchDetailedStats]);

  const handleFetchAiAnalysis = async () => {
    setAiLoading(true);
    try {
      const res = await fetch('/api/sensei/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stats, timeFilter, language }),
      });
      const data = await res.json();
      setAiAnalysis(data.analysis || null);
      setAiDisplayed(data.analysis || null);
    } catch {
      setAiAnalysis('AI analysis temporarily unavailable.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="relative overflow-x-hidden">
      <div className="lg:hidden">
        <StatsMobileView
          stats={stats}
          forecast={forecast}
          anomalies={anomalies}
          timeFilter={timeFilter}
          loading={loading}
          onTimeFilterChange={setTimeFilter}
          aiAnalysis={aiAnalysis}
          aiDisplayed={aiDisplayed}
          aiLoading={aiLoading}
          aiClosing={aiClosing}
          logoFlash={logoFlash}
          onFetchAiAnalysis={handleFetchAiAnalysis}
          onCloseAiAnalysis={() => setAiAnalysis(null)}
        />
      </div>

      <div className="hidden lg:block space-y-10 pb-20">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 bg-gold/10 text-gold rounded-xl flex-shrink-0"><BarChart3 size={18} /></div>
            <h2 className="text-xl md:text-3xl font-serif font-bold text-white truncate">{t('statistics_title')}</h2>
          </div>
          <div className="flex items-center gap-1 bg-card border border-white/8 p-1 rounded-xl">
            {['today', 'week', 'month', 'year'].map(f => (
              <button key={f} onClick={() => setTimeFilter(f)}
                className={`px-4 py-2 text-[10px] uppercase tracking-widest font-bold rounded-lg transition-colors ${timeFilter === f ? 'bg-white/10 text-gold' : 'text-white/35'}`}>
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-10">
          <StatsTopCards
            totalRevenue={stats.totalRevenue}
            totalOrders={stats.totalOrders}
            aov={stats.aov}
            missedRevenue={stats.missedRevenue}
            netProfit={stats.netProfit}
            foodCostPct={stats.foodCostPct}
          />
          
          <StatsRevenueChart chartData={stats.chartData} />

          <StatsSenseiPanel
            stats={stats}
            aiAnalysis={aiAnalysis}
            aiDisplayed={aiDisplayed}
            aiLoading={aiLoading}
            aiClosing={aiClosing}
            logoFlash={logoFlash}
            chatMessages={chatMessages}
            chatLoading={chatLoading}
            whatIfProduct={whatIfProduct}
            whatIfChange={whatIfChange}
            whatIfResult={whatIfResult}
            whatIfLoading={whatIfLoading}
            onFetchAiAnalysis={handleFetchAiAnalysis}
            onCloseAiAnalysis={() => setAiAnalysis(null)}
            onSendChat={handleSendChat}
            onWhatIfProductChange={setWhatIfProduct}
            onWhatIfChangeChange={setWhatIfChange}
            onFetchWhatIf={handleFetchWhatIf}
            restaurantCity={restaurantCity}
            orderItems={stats.productPerformance}
            senseiStatsAdvice={null}
          />

          <StatsFinancePanel
            totalRevenue={stats.totalRevenue}
            totalFoodCost={stats.totalFoodCost}
            totalWasteCost={stats.totalWasteCost}
            grossProfit={stats.grossProfit}
            netProfit={stats.netProfit}
            foodCostPct={stats.foodCostPct}
            topProfitableItems={stats.topProfitableItems}
            financeChartData={stats.financeChartData}
            loading={loading}
          />

          <StatsProductTable
            productPerformance={stats.productPerformance}
            categories={categories}
            getCategoryTranslation={getCategoryTranslation}
          />
        </div>
      </div>
    </div>
  );
};

export default StatsPage;
