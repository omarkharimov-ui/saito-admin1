'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, TrendingUp } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface DashboardStats {
  dailyRevenue: number;
  todayOrders: number;
  activeTables: number;
  topProduct: string;
}

export default function HeroBanner() {
  const { t, language } = useLanguage();
  const [greeting, setGreeting] = useState('');
  const [userName, setUserName] = useState('');
  const [isRushHour, setIsRushHour] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    dailyRevenue: 0,
    todayOrders: 0,
    activeTables: 0,
    topProduct: '—',
  });
  const [loading, setLoading] = useState(true);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 80);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const hour = new Date().getHours();
    let g = '';
    if (hour >= 5 && hour < 12) g = t('good_morning');
    else if (hour >= 12 && hour < 17) g = t('good_afternoon');
    else if (hour >= 17 && hour < 22) g = t('good_evening');
    else g = t('good_night');
    setGreeting(g);

    setIsRushHour((hour >= 12 && hour <= 14) || (hour >= 18 && hour <= 21));

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
        topProduct: data.topProduct || '—'
      });
    } catch {
      // Silent fail - show zeros
      setStats({ dailyRevenue: 0, todayOrders: 0, activeTables: 0, topProduct: '—' });
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
      className="relative overflow-hidden rounded-xl sm:rounded-2xl lg:rounded-3xl bg-[#0a0a0a] p-4 sm:p-6 lg:p-8"
    >
      {/* Animated gradient backgrounds */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          animate={{ x: [0, 30, 0], y: [0, -20, 0], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-20 -right-20 w-96 h-96 bg-gold/5 rounded-full blur-[100px]"
        />
        <motion.div
          animate={{ x: [0, -20, 0], y: [0, 30, 0], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          className="absolute -bottom-20 -left-20 w-80 h-80 bg-white/[0.02] rounded-full blur-[80px]"
        />
      </div>

      <div className="relative z-10 p-4 md:p-8">
        {/* Minimal Header - Always visible */}
        <div className="flex items-center justify-between mb-4">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="flex items-center gap-2"
          >
            <span className="text-[10px] font-bold tracking-[0.3em] uppercase text-gold/60">
              {t('dashboard')}
            </span>
            <Sparkles size={12} className="text-gold/40" />
          </motion.div>
          <div>
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="text-2xl md:text-3xl font-serif font-bold text-white"
            >
              {greeting}{userName ? `, ${userName}` : ''}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="text-white/40 text-sm mt-1"
            >
              {t('restaurant_running_smoothly')}
            </motion.p>
          </div>
        </div>

        {/* Revenue Section - Monolith - Always visible */}
        <div className="mt-8 pt-6">
          {/* Top: Revenue + sparkline */}
          <div className="relative mb-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-white/40">
                {t('today_revenue')}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400/80 bg-emerald-500/10 px-2 py-1 rounded-full">
                <TrendingUp size={12} />
                +12%
              </span>
            </div>
            
            <div className="flex items-end justify-between">
              <h2 className="font-serif font-bold text-white leading-none tracking-tight relative z-10">
                <AnimatePresence mode="wait">
                  {loading ? (
                    <motion.span
                      key="loading-revenue"
                      initial={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="block h-14 w-48 rounded-xl bg-white/[0.05] animate-pulse"
                    />
                  ) : (
                    <motion.span
                      key="loaded-revenue"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                      className="text-5xl md:text-6xl"
                    >
                      {revenueValue}
                    </motion.span>
                  )}
                </AnimatePresence>
              </h2>
              
              {/* Decorative sparkline SVG */}
              <svg className="opacity-[0.15] absolute right-0 bottom-0" width="140" height="50" viewBox="0 0 140 50" fill="none">
                <path 
                  d="M0 45 C 25 42, 35 30, 60 32 C 85 34, 95 15, 120 18 C 130 19, 135 8, 140 5" 
                  stroke="white" 
                  strokeWidth="2" 
                  fill="none" 
                  strokeLinecap="round" 
                />
                <path 
                  d="M0 45 C 25 42, 35 30, 60 32 C 85 34, 95 15, 120 18 C 130 19, 135 8, 140 5 V 50 H 0 Z" 
                  fill="url(#sparkGradHero)" 
                  opacity="0.3" 
                />
                <defs>
                  <linearGradient id="sparkGradHero" x1="0" y1="0" x2="0" y2="1">
                    <stop stopColor="white" stopOpacity="0.5"/>
                    <stop offset="1" stopColor="white" stopOpacity="0"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>

          {/* Bottom: 3-col Stats */}
          <div className="grid grid-cols-3">
            <div className="p-4">
              <span className="text-[9px] uppercase tracking-[0.3em] font-medium text-white/30 block mb-2 leading-relaxed">
                {t('today_orders')}
              </span>
              <div className="flex items-end gap-2">
                <AnimatePresence mode="wait">
                  {loading ? (
                    <motion.span
                      key="loading"
                      initial={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="block h-8 w-10 rounded-md bg-white/[0.05] animate-pulse"
                    />
                  ) : (
                    <motion.span
                      key="loaded"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                      className="font-serif font-bold text-2xl md:text-3xl text-white leading-none"
                    >
                      {stats.todayOrders}
                    </motion.span>
                  )}
                </AnimatePresence>
                {!loading && stats.todayOrders > 0 && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.15, duration: 0.2 }}
                    className="text-[10px] font-medium text-emerald-400/70 mb-1"
                  >
                    ↑
                  </motion.span>
                )}
              </div>
            </div>
            
            <div className="p-4">
              <span className="text-[9px] uppercase tracking-[0.3em] font-medium text-white/30 block mb-2 leading-relaxed">
                {t('active_tables')}
              </span>
              <div className="flex items-end gap-2">
                <AnimatePresence mode="wait">
                  {loading ? (
                    <motion.span
                      key="loading"
                      initial={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="block h-8 w-10 rounded-md bg-white/[0.05] animate-pulse"
                    />
                  ) : (
                    <motion.span
                      key="loaded"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                      className="font-serif font-bold text-2xl md:text-3xl text-white leading-none"
                    >
                      {stats.activeTables}
                    </motion.span>
                  )}
                </AnimatePresence>
                {!loading && stats.activeTables > 0 && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.15, duration: 0.2 }}
                    className="text-[10px] font-medium text-emerald-400/70 mb-1"
                  >
                    ↑
                  </motion.span>
                )}
              </div>
            </div>
            
            <div className="p-4">
              <span className="text-[9px] uppercase tracking-[0.3em] font-medium text-white/30 block mb-2 leading-relaxed">
                {t('todays_favorite')}
              </span>
              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.span
                    key="loading"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="block h-8 w-24 rounded-md bg-white/[0.05] animate-pulse"
                  />
                ) : (
                  <motion.span
                    key="loaded"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    className="font-serif font-bold text-lg md:text-xl text-white truncate block leading-tight"
                  >
                    {stats.topProduct}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
