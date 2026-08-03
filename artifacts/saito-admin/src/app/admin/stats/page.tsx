'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { TrendingUp, BarChart3, Sparkles } from 'lucide-react';
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
import { useFirstLoad } from '@/hooks/useFirstLoad';

const interpolateTemplate = (template: string, variables: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (match, key) => String(variables[key] ?? match));

const fmt = (n: number) => n.toLocaleString('az-AZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const StatsPage = () => {
  const { t, language, getCategoryTranslation } = useLanguage();

  /* ─── Filter state ─── */
  const [rawLoading, setLoading] = useState(true);
  const loading = rawLoading;
  const isFirstLoad = useFirstLoad(600, loading);
  const [timeFilter, setTimeFilter] = useState('today');
  const [categories, setCategories] = useState<{ id: string; name: string; translations?: any }[]>([]);
  const [selectedCancellationReason, setSelectedCancellationReason] = useState<string | null>(null);
  const [cancellationDetails, setCancellationDetails] = useState<any[]>([]);
  
  const [stats, setStats] = useState<any>({
    totalRevenue: 0, totalOrders: 0, aov: 0, peakHour: '—', topProduct: '—',
    missedRevenue: 0, peakHours: [], activeTables: 0, chartData: [], productPerformance: [],
    cancellationReasons: [], totalFoodCost: 0, totalWasteCost: 0, laborCost: 0, utilityCost: 0, 
    grossProfit: 0, netProfit: 0,
    foodCostPct: 0, topProfitableItems: [], financeChartData: [], staffPerformance: [],
  });

  /* ─── AI state ─── */
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

  /* ─── Logic ─── */
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
    } finally { setChatLoading(false); }
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
    } catch { } finally { setWhatIfLoading(false); }
  };

  const fetchDetailedStats = useCallback(async (isStale?: () => boolean) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/stats?timeFilter=${timeFilter}`);
      if (!res.ok) throw new Error('Stats API xətası');
      const data = await res.json();
      
      const { data: settingsData } = await supabase.from('settings').select('opening_hours, city, address').single();
      if (settingsData?.city) setRestaurantCity(settingsData.city.includes(',') ? settingsData.city : `${settingsData.city},AZ`);

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
        laborCost: data.laborCost ?? 0,
        utilityCost: data.utilityCost ?? 0,
        grossProfit: data.grossProfit ?? 0,
        netProfit: data.netProfit ?? 0,
        foodCostPct: data.foodCostPct ?? 0,
        topProfitableItems: data.topProfitableItems ?? [],
        financeChartData: data.financeChartData ?? [],
        staffPerformance: data.staffPerformance ?? [],
      };
      
      setStats(statsData);
      setCancellationDetails(formattedReasons);
    } catch (err) { 
      console.error(err); 
    } finally {
      if (!isStale || !isStale()) setLoading(false);
    }
  }, [timeFilter, t]);

  useEffect(() => {
    supabase.from('categories').select('id, name, translations').order('name')
      .then(({ data }) => { if (data) setCategories(data); });
  }, []);

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

  return (
    <div className="relative overflow-x-hidden">
      <div className="lg:hidden">
        <StatsMobileView
          stats={stats}
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gold/10 text-gold rounded-2xl"><BarChart3 size={20} /></div>
            <h2 className="text-2xl md:text-3xl font-serif font-bold text-white tracking-tight">{t('statistics_title')}</h2>
          </div>
          <div className="flex items-center gap-1 bg-[var(--theme-surface-muted)] border border-[var(--theme-border)] p-1 rounded-2xl w-fit">
            {['today', 'week', 'month', 'year'].map(f => (
              <button key={f} onClick={() => setTimeFilter(f)}
                className={`px-5 py-2.5 text-[10px] uppercase tracking-widest font-bold rounded-xl transition-all ${timeFilter === f ? 'bg-[var(--theme-surface)] text-[var(--theme-text)] shadow-sm' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]'}`}>
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-10 w-full">
          <StatsTopCards
            totalRevenue={stats.totalRevenue}
            totalOrders={stats.totalOrders}
            aov={stats.aov}
            missedRevenue={stats.missedRevenue}
            netProfit={stats.netProfit}
            foodCostPct={stats.foodCostPct}
            totalFoodCost={stats.totalFoodCost}
            totalWasteCost={stats.totalWasteCost}
            laborCost={stats.laborCost}
            utilityCost={stats.utilityCost}
          />

          {stats.staffPerformance?.length > 0 && (
            <div className="bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-3xl p-6 sm:p-8">
              <h3 className="text-white font-bold text-lg mb-6">Komanda Performansı</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {stats.staffPerformance.map((s: any) => (
                  <div key={s.id} className="bg-[var(--theme-surface-soft)] rounded-2xl p-5 border border-[var(--theme-border)]">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-gold/15 text-gold flex items-center justify-center font-bold text-sm">
                        {s.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-white font-semibold text-sm">{s.name}</p>
                        <p className="text-white/40 text-xs">{s.role}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="bg-[var(--theme-bg)] rounded-xl p-3">
                        <p className="text-white font-bold text-sm">{s.orders}</p>
                        <p className="text-white/30 text-[10px] uppercase tracking-wider mt-1">Sifariş</p>
                      </div>
                      <div className="bg-[var(--theme-bg)] rounded-xl p-3">
                        <p className="text-white font-bold text-sm">₼{fmt(s.revenue)}</p>
                        <p className="text-white/30 text-[10px] uppercase tracking-wider mt-1">Gəlir</p>
                      </div>
                      <div className="bg-[var(--theme-bg)] rounded-xl p-3">
                        <p className="text-white font-bold text-sm">₼{fmt(s.avgCheck)}</p>
                        <p className="text-white/30 text-[10px] uppercase tracking-wider mt-1">Orta çek</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <StatsPeakHours peakHours={stats.peakHours || []} timeFilter={timeFilter} />

          <StatsCancellationChart
            cancellationReasons={cancellationDetails}
            cancellationDetails={cancellationDetails}
            selectedReason={selectedCancellationReason}
            onSelectReason={setSelectedCancellationReason}
          />

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
          
          <div className="grid grid-cols-1 gap-10">
             <StatsRevenueChart 
            chartData={stats.chartData} 
            financeChartData={stats.financeChartData} 
          />

             <StatsFinancePanel
               totalRevenue={stats.totalRevenue}
               totalFoodCost={stats.totalFoodCost}
               totalWasteCost={stats.totalWasteCost}
               laborCost={stats.laborCost}
               utilityCost={stats.utilityCost}
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
    </div>
  );
};

export default StatsPage;
