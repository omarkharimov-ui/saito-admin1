'use client';

import React from 'react';
import { DollarSign, TrendingUp, TrendingDown, XCircle, Percent } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface Props {
  totalRevenue: number;
  totalOrders: number;
  aov: number;
  missedRevenue: number;
  netProfit?: number;
  foodCostPct?: number;
}

const fmt = (n: number) =>
  n.toLocaleString('az-AZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const StatsTopCards = ({ totalRevenue, totalOrders, aov, missedRevenue, netProfit = 0, foodCostPct = 0 }: Props) => {
  const { t } = useLanguage();
  const isProfit = netProfit >= 0;

  const fcHealth =
    foodCostPct === 0   ? { label: '—',       color: 'text-white/25' } :
    foodCostPct <= 25   ? { label: 'Əla',      color: 'text-emerald-400' } :
    foodCostPct <= 32   ? { label: 'Normal',   color: 'text-[#D4AF37]' } :
    foodCostPct <= 40   ? { label: 'Diqqət',   color: 'text-orange-400' } :
                          { label: 'Kritik',   color: 'text-red-400' };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">

      {/* 1 — Dövriyyə */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0, duration: 0.4, ease: 'easeOut' }}
        className="relative overflow-hidden rounded-2xl p-4 md:p-5 bg-card border border-white/5"
      >
        <div className="absolute top-0 left-0 w-32 h-32 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle at top left,rgba(212,175,55,0.07),transparent 70%)' }} />
        <div className="mb-3 text-[#D4AF37]/70"><DollarSign size={16} /></div>
        <p className="text-[9px] md:text-[10px] uppercase tracking-widest text-white/35 mb-1">{t('stats_total_revenue')}</p>
        <h3 className="font-serif font-bold text-white text-xl md:text-2xl leading-tight">₼ {fmt(totalRevenue)}</h3>
        <p className="text-[10px] text-white/20 mt-1">{totalOrders} sifariş</p>
      </motion.div>

      {/* 2 — Təmiz Qazanc (qabarıq) */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06, duration: 0.4, ease: 'easeOut' }}
        className="relative overflow-hidden rounded-2xl p-4 md:p-5 col-span-1"
        style={{
          background: isProfit
            ? 'linear-gradient(135deg,rgba(52,211,153,0.07) 0%,rgba(255,255,255,0.02) 100%)'
            : 'linear-gradient(135deg,rgba(239,68,68,0.07) 0%,rgba(255,255,255,0.02) 100%)',
          border: isProfit ? '1px solid rgba(52,211,153,0.18)' : '1px solid rgba(239,68,68,0.18)',
        }}
      >
        <div className={`mb-3 ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
          {isProfit ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
        </div>
        <p className="text-[9px] md:text-[10px] uppercase tracking-widest text-white/35 mb-1">Təmiz Qazanc</p>
        <h3 className={`font-serif font-bold text-xl md:text-2xl leading-tight ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
          {isProfit ? '' : '−'}₼ {fmt(Math.abs(netProfit))}
        </h3>
        <p className={`text-[10px] mt-1 font-semibold ${fcHealth.color}`}>
          {foodCostPct > 0 ? `Food cost: ${foodCostPct.toFixed(1)}% · ${fcHealth.label}` : ''}
        </p>
      </motion.div>

      {/* 3 — Ortalama Sifariş */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.4, ease: 'easeOut' }}
        className="relative overflow-hidden rounded-2xl p-4 md:p-5 bg-card border border-white/5"
      >
        <div className="mb-3 text-blue-400/70"><Percent size={16} /></div>
        <p className="text-[9px] md:text-[10px] uppercase tracking-widest text-white/35 mb-1">{t('stats_aov_label')}</p>
        <h3 className="font-serif font-bold text-white text-xl md:text-2xl leading-tight">₼ {fmt(aov)}</h3>
        <p className="text-[10px] text-white/20 mt-1">hər sifariş üzrə</p>
      </motion.div>

      {/* 4 — İtki / Ləğv edilən */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18, duration: 0.4, ease: 'easeOut' }}
        className="relative overflow-hidden rounded-2xl p-4 md:p-5 bg-card border border-white/5"
      >
        <div className="mb-3 text-rose-400/70"><XCircle size={16} /></div>
        <p className="text-[9px] md:text-[10px] uppercase tracking-widest text-white/35 mb-1">{t('stats_cancelled_loss')}</p>
        <h3 className="font-serif font-bold text-white text-xl md:text-2xl leading-tight">₼ {fmt(missedRevenue)}</h3>
        <p className="text-[10px] text-white/20 mt-1">ləğv edilən sifarişlər</p>
      </motion.div>

    </div>
  );
};

export default StatsTopCards;
