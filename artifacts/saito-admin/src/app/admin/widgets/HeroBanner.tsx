'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, AlertTriangle, TrendingUp, TrendingDown, Zap } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import Link from 'next/link';

interface DashboardStats {
  dailyRevenue: number;
  todayOrders: number;
  activeTables: number;
  topProduct: string;
  dailyNetProfit: number;
  foodCostPct: number;
  criticalStockCount: number;
  calibrationSuggestions: number;
  marginInsight: {
    revenue: number;
    foodCost: number;
    wasteCost: number;
    grossMarginPct: number;
    netMarginPct: number;
    foodCostPct: number;
    marginPressure: 'healthy' | 'tight' | 'critical';
  };
}

export default function HeroBanner() {
  const { t, language } = useLanguage();
  const [greeting, setGreeting] = useState('');
  const [userName, setUserName] = useState('');
  const [stats, setStats] = useState<DashboardStats>({
    dailyRevenue: 0,
    todayOrders: 0,
    activeTables: 0,
    topProduct: '—',
    dailyNetProfit: 0,
    foodCostPct: 0,
    criticalStockCount: 0,
    calibrationSuggestions: 0,
    marginInsight: {
      revenue: 0,
      foodCost: 0,
      wasteCost: 0,
      grossMarginPct: 0,
      netMarginPct: 0,
      foodCostPct: 0,
      marginPressure: 'healthy',
    },
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const hour = new Date().getHours();
    let g = '';
    if (hour >= 5 && hour < 12) g = t('good_morning');
    else if (hour >= 12 && hour < 17) g = t('good_afternoon');
    else if (hour >= 17 && hour < 22) g = t('good_evening');
    else g = t('good_night');
    setGreeting(g);

    try {
      const session = localStorage.getItem('saito_session');
      if (session) {
        const parsed = JSON.parse(session);
        setUserName(parsed.email?.split('@')[0] || '');
      }
    } catch {}
  }, [t, language]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/stats');
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      setStats({
        dailyRevenue: data.dailyRevenue || 0,
        todayOrders: data.todayOrders || 0,
        activeTables: data.activeTables || 0,
        topProduct: data.topProduct || '—',
        dailyNetProfit: data.dailyNetProfit || 0,
        foodCostPct: data.foodCostPct || 0,
        criticalStockCount: data.criticalStockCount || 0,
        calibrationSuggestions: Array.isArray(data.calibrationSuggestions) ? data.calibrationSuggestions.length : (data.calibrationSuggestions || 0),
        marginInsight: data.marginInsight || { revenue: 0, foodCost: 0, wasteCost: 0, grossMarginPct: 0, netMarginPct: 0, foodCostPct: 0, marginPressure: 'healthy' },
      });
    } catch {
      setStats({ dailyRevenue: 0, todayOrders: 0, activeTables: 0, topProduct: '—', dailyNetProfit: 0, foodCostPct: 0, criticalStockCount: 0, calibrationSuggestions: 0, marginInsight: { revenue: 0, foodCost: 0, wasteCost: 0, grossMarginPct: 0, netMarginPct: 0, foodCostPct: 0, marginPressure: 'healthy' } });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // 30s refresh
    return () => clearInterval(interval);
  }, [fetchStats]);

  const revenueValue = stats.dailyRevenue === 0 && !loading 
    ? '₼ 0.00' 
    : `₼ ${stats.dailyRevenue.toLocaleString('az-AZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-[32px] bg-[var(--theme-surface)] p-6 md:p-10 shadow-[var(--theme-shadow)] border border-[var(--theme-border)]"
    >
      {/* Animated gradient backgrounds - Subtle & Professional */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          animate={{ x: [0, 40, 0], y: [0, -30, 0], opacity: [0.03, 0.08, 0.03] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-gold/10 rounded-full blur-[140px]"
        />
      </div>

      <div className="relative z-10">
        {/* Header - High Contrast */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div>
            <div className="flex items-center gap-2 mb-2">
               <span className="text-[10px] font-black tracking-[0.4em] uppercase text-gold/80">{t('dashboard' as any)}</span>
               <div className="w-1 h-1 bg-gold/40 rounded-full" />
               <span className="text-[10px] font-bold text-[var(--theme-text-muted)] uppercase tracking-widest">{new Date().toLocaleDateString(language === 'az' ? 'az-AZ' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-serif font-black text-[var(--theme-text)] tracking-tight">
              {greeting}{userName ? `, ${userName}` : ''}
            </h1>
          </div>
          <div className="flex items-center gap-3">
             <div className="px-4 py-2 bg-[var(--theme-bg)] rounded-full border border-[var(--theme-border)] shadow-sm">
                <span className="text-[11px] font-bold text-[var(--theme-text)]">{t('restaurant_running_smoothly' as any)}</span>
             </div>
          </div>
        </div>

        {/* Main Stats Row */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Revenue Block */}
          <div className="lg:col-span-7 space-y-6">
            <div>
              <span className="text-[10px] uppercase tracking-[0.3em] font-black text-[var(--theme-text-muted)] mb-3 block">
                {t('today_revenue' as any)}
              </span>
              <div className="flex items-baseline gap-4">
                <h2 className="text-6xl md:text-7xl font-serif font-black text-[var(--theme-text)] tracking-tighter">
                  {revenueValue}
                </h2>
                {stats.dailyNetProfit !== 0 && (
                  <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-black ${stats.dailyNetProfit > 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'}`}>
                     {stats.dailyNetProfit > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                     {((stats.dailyNetProfit / (stats.dailyRevenue || 1)) * 100).toFixed(1)}%
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
               <div className="bg-[var(--theme-bg)] px-5 py-3 rounded-2xl border border-[var(--theme-border)]">
                  <p className="text-[9px] font-black text-[var(--theme-text-muted)] uppercase tracking-widest mb-1">Xalis Qazanc</p>
                  <p className="text-xl font-black text-[var(--theme-text)]">₼ {stats.dailyNetProfit.toLocaleString()}</p>
               </div>
               <div className="bg-[var(--theme-bg)] px-5 py-3 rounded-2xl border border-[var(--theme-border)]">
                  <p className="text-[9px] font-black text-[var(--theme-text-muted)] uppercase tracking-widest mb-1">Müştəri Sayı</p>
                  <p className="text-xl font-black text-[var(--theme-text)]">{stats.todayOrders * 2}</p>
               </div>
            </div>
          </div>

          {/* Secondary Stats Grid */}
          <div className="lg:col-span-5 grid grid-cols-2 gap-4">
             <div className="bg-[var(--theme-bg)] p-6 rounded-[28px] border border-[var(--theme-border)] flex flex-col justify-between">
                <span className="text-[9px] font-black text-[var(--theme-text-muted)] uppercase tracking-widest">{t('today_orders' as any)}</span>
                <p className="text-4xl font-black text-[var(--theme-text)] mt-2">{stats.todayOrders}</p>
             </div>
             <div className="bg-[var(--theme-bg)] p-6 rounded-[28px] border border-[var(--theme-border)] flex flex-col justify-between">
                <span className="text-[9px] font-black text-[var(--theme-text-muted)] uppercase tracking-widest">{t('active_tables' as any)}</span>
                <p className="text-4xl font-black text-[var(--theme-text)] mt-2">{stats.activeTables}</p>
             </div>
             <div className="col-span-2 bg-gold p-6 rounded-[28px] shadow-lg shadow-gold/20 flex items-center justify-between">
                <div>
                   <span className="text-[9px] font-black text-black/40 uppercase tracking-widest">{t('todays_favorite' as any)}</span>
                   <p className="text-lg font-black text-black leading-tight mt-1">{stats.topProduct}</p>
                </div>
                <div className="w-10 h-10 bg-black/10 rounded-full flex items-center justify-center">
                   <Sparkles size={18} className="text-black/60" />
                </div>
             </div>
          </div>
        </div>

        {/* Intelligence Strip */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
           {[
             { label: 'Calibration', value: stats.calibrationSuggestions, sub: 'AI reverse-inventory təklifi' },
             { label: 'Margin Pressure', value: stats.marginInsight.marginPressure, sub: `Gross ${stats.marginInsight.grossMarginPct.toFixed(1)}%` },
             { label: 'Critical Stock', value: stats.criticalStockCount, sub: 'Təcili tədbir lazımdır' }
           ].map((item, idx) => (
             <div key={idx} className="bg-[var(--theme-surface-soft)]/50 border border-[var(--theme-border)] px-6 py-4 rounded-2xl flex items-center justify-between">
                <div>
                   <p className="text-[10px] font-black text-[var(--theme-text-muted)] uppercase tracking-tighter mb-0.5">{item.label}</p>
                   <p className="text-sm font-bold text-[var(--theme-text)] capitalize">{item.value}</p>
                </div>
                <span className="text-[10px] font-medium text-[var(--theme-text-muted)]">{item.sub}</span>
             </div>
           ))}
        </div>
      </div>
    </motion.div>
  );
}
