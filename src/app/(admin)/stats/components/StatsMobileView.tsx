'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, TrendingDown, ShoppingBag, Clock, BarChart2,
  AlertTriangle, ChevronRight, Zap, Award, Sparkles,
} from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import StatsSenseiPanel from './StatsSenseiPanel';

interface ChartPoint { date: string; value: number; }
interface ProductPerf {
  id: string; name: string; image?: string;
  sold: number; revenue: number; conversion: string;
  views: number;
}
interface PeakHour { hour: number; count: number; }
interface Anomaly { type: string; severity: 'critical' | 'warning'; message: string; }
interface Forecast { predictedRevenue: number; trend: number; confidence: 'high' | 'medium' | 'low'; }
interface Props {
  stats: {
    totalRevenue: number; totalOrders: number; aov: number; missedRevenue: number;
    chartData: ChartPoint[]; productPerformance: ProductPerf[]; peakHours: PeakHour[];
    topProduct: string; peakHour: string;
    [key: string]: any;
  };
  forecast: Forecast | null;
  anomalies: Anomaly[];
  timeFilter: string;
  loading: boolean;
  onTimeFilterChange: (f: string) => void;
  aiAnalysis: string | null;
  aiDisplayed: string | null;
  aiLoading: boolean;
  aiClosing: boolean;
  logoFlash: boolean;
  onFetchAiAnalysis: () => void;
  onCloseAiAnalysis: () => void;
}

const FILTERS = ['today', 'week', 'month', '3months', 'year'] as const;

export default function StatsMobileView({ stats, forecast, anomalies, timeFilter, loading, onTimeFilterChange, aiAnalysis, aiDisplayed, aiLoading, aiClosing, logoFlash, onFetchAiAnalysis, onCloseAiAnalysis }: Props) {
  const { t, language } = useLanguage();
  const { lightMode } = useTheme();
  const [activeSection, setActiveSection] = useState<'overview' | 'products' | 'hours' | 'sensei'>('overview');
  
  // Add missing state for mobile deep scan functionality
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [whatIfProduct, setWhatIfProduct] = useState('');
  const [whatIfChange, setWhatIfChange] = useState(0);
  const [whatIfResult, setWhatIfResult] = useState<string | null>(null);
  const [whatIfLoading, setWhatIfLoading] = useState(false);

  // Add missing handlers for mobile deep scan functionality
  const handleSendChat = async (msg: string) => {
    if (!msg.trim() || chatLoading) return;
    setChatMessages(prev => [...prev, { role: 'user', text: msg }]);
    setChatLoading(true);
    // Mock response for now - in real implementation this would call an API
    setTimeout(() => {
      setChatMessages(prev => [...prev, { role: 'ai', text: 'AI response would appear here.' }]);
      setChatLoading(false);
    }, 1000);
  };

  const handleFetchWhatIf = async () => {
    if (!whatIfProduct || whatIfChange === 0) return;
    setWhatIfLoading(true);
    // Mock implementation - in real implementation this would call an API
    setTimeout(() => {
      setWhatIfResult(`Simulation result for ${whatIfProduct} with ${whatIfChange}% change`);
      setWhatIfLoading(false);
    }, 1500);
  };

  const revDelta = forecast ? forecast.trend : 0;
  const isUp = revDelta >= 0;

  const topProducts = stats.productPerformance.slice(0, 10);
  const maxCount = stats.peakHours[0]?.count || 1;

  const filterLabels: Record<string, string> = {
    today: t('filter_today'),
    week: t('filter_week'),
    month: t('filter_month'),
    '3months': t('filter_3months'),
    year: t('filter_year'),
  };

  /* derive top peak hour label from peakHours array directly */
  const topPeakHour = stats.peakHours[0];
  const peakHourLabel = topPeakHour
    ? `${String(topPeakHour.hour).padStart(2, '0')}:00 – ${String(topPeakHour.hour + 1).padStart(2, '0')}:00`
    : (stats.peakHour && stats.peakHour !== '—' ? stats.peakHour : '—');

  return (
    <div className="flex flex-col pb-24">

      {/* ── STICKY HEADER ── */}
      <div className={`sticky top-0 z-20 backdrop-blur-xl border-b px-4 pt-4 pb-3 ${lightMode ? 'border-gray-200' : 'border-white/[0.06]'}`} style={{ background: lightMode ? 'rgba(255,255,255,0.95)' : 'rgba(10,10,10,0.95)' }}>
        <div className="flex items-center justify-between mb-3">
          <h1 className={`text-2xl font-serif font-bold ${lightMode ? 'text-gray-900' : 'text-white'}`}>{t('statistics_title')}</h1>
        </div>
        {/* Filter pills */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
          {FILTERS.map(f => {
            const isActive = timeFilter === f;
            return (
              <motion.button
                key={f}
                onClick={() => onTimeFilterChange(f)}
                whileTap={{ scale: 0.91 }}
                animate={{
                  scale: isActive ? 1.04 : 1,
                  opacity: isActive ? 1 : 0.45,
                }}
                transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                className="relative flex-shrink-0 px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider whitespace-nowrap overflow-hidden"
                style={{
                  background: isActive
                    ? 'linear-gradient(135deg, #D4AF37 0%, #F5D67B 100%)'
                    : 'rgba(255,255,255,0.04)',
                  color: isActive ? '#000' : 'rgba(255,255,255,0.55)',
                  border: isActive ? 'none' : '1px solid rgba(255,255,255,0.07)',
                  boxShadow: isActive ? '0 0 16px rgba(212,175,55,0.35), 0 2px 8px rgba(0,0,0,0.4)' : 'none',
                }}
              >
                {filterLabels[f]}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ── HERO REVENUE ── */}
      <div className="px-4 pt-6 pb-2">
        <p className={`text-[10px] uppercase tracking-[0.3em] mb-1 ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>{t('stats_total_revenue')}</p>
        <div className="flex items-end gap-3">
          <motion.span
            key={stats.totalRevenue}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl font-serif font-black tracking-tight"
            style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D67B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
          >
            ₼{stats.totalRevenue.toLocaleString()}
          </motion.span>
          {forecast && (
            <span className={`flex items-center gap-0.5 text-sm font-bold mb-1.5 ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
              {isUp ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {isUp ? '+' : ''}{revDelta.toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {/* ── MINI CHART ── */}
      {stats.chartData.length > 0 && (
        <div className="h-[90px] w-full px-0 mt-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats.chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="mobileGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#D4AF37" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#D4AF37" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide />
              <Tooltip
                contentStyle={{ background: lightMode ? '#ffffff' : '#0f0f0f', border: lightMode ? '1px solid #e5e7eb' : '1px solid rgba(212,175,55,0.25)', borderRadius: 10, fontSize: 12, padding: '7px 12px' }}
                itemStyle={{ color: '#D4AF37', fontWeight: 700 }}
                labelStyle={{ color: lightMode ? '#374151' : 'rgba(255,255,255,0.7)', fontSize: 11, marginBottom: 3, fontWeight: 600 }}
                formatter={(v: any) => [`₼${Number(v).toFixed(2)}`, '']}
                labelFormatter={(label: any) => String(label)}
              />
              <Area type="monotone" dataKey="value" stroke="#D4AF37" strokeWidth={1.5} fill="url(#mobileGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── KPI ROW ── */}
      <div className="grid grid-cols-3 gap-2 px-4 mt-4">
        {[
          { label: t('stats_total_orders'), value: stats.totalOrders || 0, color: 'text-white' },
          { label: t('stats_aov_label'), value: `₼${(stats.aov || 0).toFixed(1)}`, color: 'text-white' },
          { label: t('stats_cancelled_loss'), value: `₼${(stats.missedRevenue || 0).toFixed(0)}`, color: 'text-red-400' },
        ].map((k, i) => (
          <motion.div key={k.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className={`border rounded-2xl px-3 py-3 ${lightMode ? 'bg-gray-50/80 border-gray-200' : 'bg-white/[0.04] border-white/[0.06]'}`}>
            <p className={`text-[9px] uppercase tracking-widest mb-1 leading-tight ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>{k.label}</p>
            <p className={`text-lg font-black tabular-nums leading-none ${k.color}`}>{k.value}</p>
          </motion.div>
        ))}
      </div>

      {/* ── ANOMALY ALERTS ── */}
      <AnimatePresence>
        {anomalies.map((a, i) => (
          <motion.div key={a.type} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`mx-4 mt-3 flex items-start gap-2.5 px-4 py-3 rounded-2xl border
              ${a.severity === 'critical' ? 'bg-red-500/[0.08] border-red-500/20' : 'bg-orange-500/[0.08] border-orange-500/20'}`}>
            <AlertTriangle size={14} className={a.severity === 'critical' ? 'text-red-400 flex-shrink-0 mt-0.5' : 'text-orange-400 flex-shrink-0 mt-0.5'} />
            <p className={`text-[11px] leading-snug ${lightMode ? 'text-gray-600' : 'text-white/70'}`}>{a.message}</p>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* ── SECTION TABS ── */}
      <div className="relative mt-6 mx-4">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
          {([
            { key: 'overview', label: t('stats_tab_overview') || 'Baxış' },
            { key: 'products', label: t('stats_tab_products') || 'Məhsullar' },
            { key: 'hours',    label: t('stats_tab_hours') || 'Saatlar' },
            { key: 'sensei',   label: 'Deep Scan' },
          ] as const).map(s => {
            const isActive = activeSection === s.key;
            return (
              <motion.button
                key={s.key}
                onClick={() => setActiveSection(s.key)}
                whileTap={{ scale: 0.94 }}
                className="relative flex-shrink-0 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest whitespace-nowrap transition-all duration-200 overflow-hidden"
                style={{
                  color: s.key === 'sensei' && isActive ? '#D4AF37' : isActive ? '#ffffff' : 'rgba(255,255,255,0.25)',
                  background: s.key === 'sensei' && isActive ? 'rgba(212,175,55,0.1)' : isActive ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
                  border: s.key === 'sensei' && isActive ? '1px solid rgba(212,175,55,0.3)' : isActive ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.05)',
                  transform: isActive ? 'scale(1.05)' : 'scale(1)',
                }}>
                <span className="relative z-10">{s.label}</span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ── SECTION CONTENT ── */}
      <AnimatePresence mode="wait">

        {/* OVERVIEW */}
        {activeSection === 'overview' && (
          <motion.div key="overview"
            initial={{ opacity: 0, x: -18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="px-4 mt-4 space-y-3">

            {/* Forecast card */}
            {forecast && (
              <div className={`border border-gold/15 rounded-2xl px-4 py-4 relative overflow-hidden ${lightMode ? 'bg-gray-50' : 'bg-white/[0.03]'}`}>
                <div className="absolute inset-0 bg-gradient-to-br from-gold/[0.06] via-transparent to-transparent pointer-events-none rounded-2xl" />
                <div className="flex items-center justify-between relative">
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-gold/60 mb-1">{t('stats_forecast_title')}</p>
                    <p className={`text-2xl font-serif font-black ${lightMode ? 'text-gray-900' : 'text-white'}`}>₼{forecast.predictedRevenue.toLocaleString()}</p>
                    <p className={`text-[10px] mt-0.5 ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>{t('stats_forecast_subtitle')}</p>
                  </div>
                  <div className={`flex flex-col items-center gap-1 ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isUp ? <TrendingUp size={22} /> : <TrendingDown size={22} />}
                    <span className="text-xs font-black">{isUp ? '+' : ''}{forecast.trend.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            )}

            {/* Top product + peak hour */}
            <div className="grid grid-cols-2 gap-2">
              <div className={`border rounded-2xl px-3 py-3 ${lightMode ? 'bg-gray-50/80 border-gray-200' : 'bg-white/[0.04] border-white/[0.06]'}`}>
                <div className="flex items-center gap-1.5 mb-2">
                  <Award size={11} className="text-gold" />
                  <p className={`text-[9px] uppercase tracking-widest ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>{t('stats_top_product') || 'Top'}</p>
                </div>
                <p className={`text-[13px] font-bold leading-snug line-clamp-2 ${lightMode ? 'text-gray-900' : 'text-white'}`}>{stats.topProduct}</p>
              </div>
              <div className={`border rounded-2xl px-3 py-3 ${lightMode ? 'bg-gray-50/80 border-gray-200' : 'bg-white/[0.04] border-white/[0.06]'}`}>
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock size={11} className="text-orange-400" />
                  <p className={`text-[9px] uppercase tracking-widest ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>{t('stats_peak_hour') || 'Peak'}</p>
                </div>
                <p className={`text-[13px] font-bold leading-snug ${lightMode ? 'text-gray-900' : 'text-white'}`}>{peakHourLabel}</p>
              </div>
            </div>

            {/* Top 3 products quick view */}
            {topProducts.slice(0, 3).map((p, i) => (
              <div key={p.id} className="flex items-center gap-3">
                <span className={`text-xs font-mono w-4 ${lightMode ? 'text-gray-200' : 'text-white/15'}`}>{i + 1}</span>
                <div className={`w-7 h-7 rounded-lg border overflow-hidden flex items-center justify-center flex-shrink-0 ${lightMode ? 'bg-white border-gray-100' : 'bg-black border-white/5'}`}>
                  {p.image ? <img src={p.image} alt={p.name} loading="lazy" decoding="async" className="w-full h-full object-cover" /> : <ShoppingBag size={10} className={lightMode ? 'text-gray-300' : 'text-white/20'} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[12px] font-medium truncate ${lightMode ? 'text-gray-700' : 'text-white/80'}`}>{p.name}</p>
                  <div className={`mt-0.5 h-[2px] w-full rounded-full overflow-hidden ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min((Number(p.revenue) / (Number(topProducts[0]?.revenue) || 1)) * 100, 100)}%` }}
                      transition={{ duration: 0.6, delay: i * 0.08 }}
                      className="h-full bg-gold/60 rounded-full"
                    />
                  </div>
                </div>
                <span className={`text-[11px] font-bold tabular-nums flex-shrink-0 ${lightMode ? 'text-gray-500' : 'text-white/60'}`}>₼{Number(p.revenue).toFixed(0)}</span>
              </div>
            ))}
            {topProducts.length > 3 && (
              <button onClick={() => setActiveSection('products')}
                className={`flex items-center gap-1 text-[10px] uppercase tracking-widest hover:text-white/50 transition-colors ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>
                {t('stats_see_all') || 'Hamısını gör'} <ChevronRight size={11} />
              </button>
            )}
          </motion.div>
        )}

        {/* PRODUCTS */}
        {activeSection === 'products' && (
          <motion.div key="products"
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="mt-2 divide-y divide-white/[0.04]">
            {topProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <BarChart2 size={28} className={lightMode ? 'text-gray-200' : 'text-white/10'} />
                <p className={`text-xs uppercase tracking-widest ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>{t('stats_no_sales')}</p>
              </div>
            ) : topProducts.map((p, i) => {
              const convNum = Number(p.conversion);
              const isGood = convNum >= 20;
              const maxRev = Number(topProducts[0]?.revenue) || 1;
              const pct = Math.min((Number(p.revenue) / maxRev) * 100, 100);
              return (
                <motion.div key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-3 px-4 py-3.5">
                  <span className={`text-[11px] font-mono w-5 flex-shrink-0 text-right ${lightMode ? 'text-gray-200' : 'text-white/15'}`}>{i + 1}</span>
                  <div className={`w-9 h-9 rounded-xl border overflow-hidden flex items-center justify-center flex-shrink-0 ${lightMode ? 'bg-white border-gray-200' : 'bg-black border-white/[0.07]'}`}>
                    {p.image ? <img src={p.image} alt={p.name} loading="lazy" decoding="async" className="w-full h-full object-cover" /> : <ShoppingBag size={12} className={lightMode ? 'text-gray-300' : 'text-white/20'} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] font-semibold truncate leading-tight ${lightMode ? 'text-gray-900' : 'text-white'}`}>{p.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] ${lightMode ? 'text-gray-300' : 'text-white/25'}`}>{p.sold}×</span>
                      <div className={`flex-1 h-[2px] rounded-full overflow-hidden ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`}>
                        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.5, delay: i * 0.05 }}
                          className={`h-full rounded-full ${i === 0 ? 'bg-gold' : 'bg-gold/40'}`} />
                      </div>
                      <span className={`text-[10px] font-bold ${isGood ? 'text-gold/80' : 'text-white/20'}`}>{p.conversion}%</span>
                    </div>
                  </div>
                  <span className={`font-black text-sm tabular-nums flex-shrink-0 ${lightMode ? 'text-gray-900' : 'text-white'}`}>₼{Number(p.revenue).toFixed(0)}</span>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* PEAK HOURS */}
        {activeSection === 'hours' && (
          <motion.div key="hours"
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="px-4 mt-4 space-y-3 pb-6">

            {stats.peakHours.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Clock size={28} className={lightMode ? 'text-gray-200' : 'text-white/10'} />
                <p className={`text-xs uppercase tracking-widest ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>{t('no_data_for_period')}</p>
              </div>
            ) : (
              <>
                {/* Header explanation */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-[13px] font-bold ${lightMode ? 'text-gray-900' : 'text-white'}`}>Sifariş aktivliyi</p>
                    <p className={`text-[10px] mt-0.5 ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>Hər saat neçə sifariş daxil olub</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-[9px] uppercase tracking-widest mb-0.5 ${lightMode ? 'text-gray-300' : 'text-white/25'}`}>Pik saat</p>
                    <p className="text-gold text-[13px] font-black tabular-nums">
                      {String(stats.peakHours[0].hour).padStart(2,'0')}:00–{String(stats.peakHours[0].hour + 1).padStart(2,'00')}:00
                    </p>
                  </div>
                </div>

                {/* Bars */}
                <div className="space-y-3.5">
                  {stats.peakHours.map((h, i) => {
                    const pct = Math.round((h.count / maxCount) * 100);
                    const isPeak = i === 0;
                    return (
                      <div key={h.hour} className="flex items-center gap-3">
                        {/* Time */}
                        <span className={`text-[11px] font-mono tabular-nums w-11 flex-shrink-0 ${isPeak ? 'text-gold' : 'text-white/30'}`}>
                          {String(h.hour).padStart(2,'0')}:00
                        </span>

                        {/* Slim bar track */}
                        <div className={`flex-1 h-[8px] rounded-full overflow-hidden ${lightMode ? 'bg-gray-100' : 'bg-white/[0.06]'}`}>
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.6, delay: i * 0.05, type: 'spring', stiffness: 180, damping: 26 }}
                            className="h-full rounded-full"
                            style={{
                              background: isPeak
                                ? 'linear-gradient(90deg,#D4AF37,#F5D67B)'
                                : `rgba(255,255,255,${0.12 - i * 0.01})`,
                              boxShadow: isPeak ? '0 0 6px rgba(212,175,55,0.5)' : 'none',
                            }}
                          />
                        </div>

                        {/* Count */}
                        <div className="w-14 flex-shrink-0 flex items-center gap-1 justify-end">
                          {isPeak && <Zap size={8} className="text-gold" />}
                          <span className={`text-[11px] font-bold tabular-nums ${isPeak ? 'text-gold' : 'text-white/35'}`}>{h.count}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </motion.div>
        )}


        {/* DEEP SCAN / SENSEI */}
        {activeSection === 'sensei' && (
          <motion.div key="sensei"
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="px-4 mt-4 pb-6">
            <StatsSenseiPanel
              stats={stats}
              aiAnalysis={aiAnalysis}
              aiDisplayed={aiDisplayed}
              aiLoading={aiLoading}
              aiClosing={aiClosing}
              logoFlash={logoFlash}
              senseiStatsAdvice={null}
              chatMessages={chatMessages}
              chatLoading={chatLoading}
              whatIfProduct={whatIfProduct}
              whatIfChange={whatIfChange}
              whatIfResult={whatIfResult}
              whatIfLoading={whatIfLoading}
              onFetchAiAnalysis={onFetchAiAnalysis}
              onCloseAiAnalysis={onCloseAiAnalysis}
              onSendChat={handleSendChat}
              onWhatIfProductChange={setWhatIfProduct}
              onWhatIfChangeChange={setWhatIfChange}
              onFetchWhatIf={handleFetchWhatIf}
              restaurantCity="Baku,AZ"
            />
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
