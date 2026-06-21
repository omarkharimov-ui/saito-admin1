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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {/* 1. Main Monolith: Revenue & Profit */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="col-span-1 md:col-span-2 lg:col-span-2 relative overflow-hidden rounded-[40px] bg-white p-10 shadow-[0_20px_50px_rgba(0,0,0,0.04)] border border-gray-50"
      >
        <div className="absolute top-0 right-0 p-8 opacity-10">
           <TrendingUp size={120} className="text-gold" strokeWidth={1} />
        </div>
        
        <div className="relative z-10 space-y-8">
          <div>
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-gold mb-3 block">
              GÜNLÜK ÜMUMİ GƏLİR
            </span>
            <div className="flex items-baseline gap-4">
              <h2 className="text-6xl md:text-7xl font-serif font-black tracking-tighter text-gray-900">
                {revenueValue}
              </h2>
              {stats.dailyNetProfit !== 0 && (
                <div className={`flex items-center gap-1 text-sm font-black ${stats.dailyNetProfit > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                   {stats.dailyNetProfit > 0 ? '+' : ''}{((stats.dailyNetProfit / (stats.dailyRevenue || 1)) * 100).toFixed(1)}%
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-4 pt-4">
            <div className="bg-gray-50 px-5 py-3 rounded-2xl border border-gray-100">
               <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Xalis Qazanc</span>
               <span className="text-lg font-bold text-gray-900">₼ {stats.dailyNetProfit.toLocaleString()}</span>
            </div>
            <div className="bg-gray-50 px-5 py-3 rounded-2xl border border-gray-100">
               <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Food Cost %</span>
               <span className="text-lg font-bold text-gray-900">{stats.foodCostPct.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 2. Today's Orders Bento */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-[40px] bg-gray-900 p-8 flex flex-col justify-between text-white shadow-xl relative overflow-hidden"
      >
        <div className="absolute bottom-0 right-0 p-6 opacity-20">
           <Zap size={60} className="text-gold" />
        </div>
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-gold/60 mb-1 block">SİFARİŞLƏR</span>
          <h3 className="text-5xl font-black">{stats.todayOrders}</h3>
        </div>
        <div className="text-sm font-medium text-white/50">
          Bu gün daxil olan ümumi sifariş sayı
        </div>
      </motion.div>

      {/* 3. Favorite Product Bento */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-[40px] bg-white p-8 border border-gray-100 shadow-sm flex flex-col justify-between"
      >
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400 mb-2 block">ƏN ÇOX SATILAN</span>
          <h3 className="text-xl font-black text-gray-900 line-clamp-2 leading-tight uppercase tracking-tight">
            {stats.topProduct}
          </h3>
        </div>
        <div className="flex items-center gap-2 text-gold">
          <Sparkles size={16} />
          <span className="text-[10px] font-black uppercase tracking-widest">Günün Trendi</span>
        </div>
      </motion.div>

      {/* 4. Active Tables Bento */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-[40px] bg-gold p-8 text-black shadow-lg shadow-gold/20 flex flex-col justify-between"
      >
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-black/40 mb-1 block">AKTİV MASALAR</span>
          <h3 className="text-5xl font-black">{stats.activeTables}</h3>
        </div>
        <Link href="/admin/pos" className="text-[10px] font-black uppercase tracking-widest border-b border-black/20 pb-1 self-start hover:border-black transition-all">
          Pola Bax
        </Link>
      </motion.div>

      {/* 5. Inventory Status Bento */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className={`rounded-[40px] p-8 border shadow-sm flex flex-col justify-between ${
          stats.criticalStockCount > 0 ? 'bg-rose-50 border-rose-100' : 'bg-gray-50 border-gray-100'
        }`}
      >
        <div>
          <span className={`text-[10px] font-black uppercase tracking-[0.3em] mb-2 block ${
            stats.criticalStockCount > 0 ? 'text-rose-400' : 'text-gray-400'
          }`}>STOK VƏZİYYƏTİ</span>
          <h3 className={`text-xl font-black ${stats.criticalStockCount > 0 ? 'text-rose-600' : 'text-gray-900'}`}>
            {stats.criticalStockCount > 0 ? `${stats.criticalStockCount} Kritik Maddə` : 'Hər şey Qaydasında'}
          </h3>
        </div>
        {stats.criticalStockCount > 0 && (
          <Link href="/admin/stock" className="flex items-center gap-2 text-rose-500 font-black text-[10px] uppercase tracking-widest">
            <AlertTriangle size={14} /> Tədbir Gör
          </Link>
        )}
      </motion.div>
    </div>
  );
}

