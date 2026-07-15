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
  totalFoodCost?: number;
  totalWasteCost?: number;
  laborCost?: number;
  utilityCost?: number;
}

const fmt = (n: number) =>
  n.toLocaleString('az-AZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const StatsTopCards = ({ 
    totalRevenue, 
    totalOrders, 
    aov, 
    missedRevenue, 
    netProfit = 0, 
    foodCostPct = 0,
    totalFoodCost = 0,
    totalWasteCost = 0,
    laborCost = 0,
    utilityCost = 0
}: Props) => {
  const { t } = useLanguage();
  const isProfit = netProfit >= 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">

      {/* 1 — Dövriyyə */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl p-5 md:p-6 bg-white/[0.03] border border-white/[0.06]"
      >
        <div className="mb-4 text-[#D4AF37]/70"><DollarSign size={18} /></div>
        <p className="text-[10px] uppercase tracking-[0.15em] text-white/40 mb-2 font-medium">Ümumi Dövriyyə</p>
        <h3 className="font-serif font-bold text-white text-2xl md:text-[1.7rem] leading-tight tracking-tight">₼ {fmt(totalRevenue)}</h3>
        <p className="text-[11px] text-white/25 mt-2 font-medium">{totalOrders} sifariş</p>
      </motion.div>

      {/* 2 — Maya Dəyəri */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="relative overflow-hidden rounded-3xl p-5 md:p-6 bg-white/[0.03] border border-white/[0.06]"
      >
        <div className="mb-4 text-orange-400/70"><Percent size={18} /></div>
        <p className="text-[10px] uppercase tracking-[0.15em] text-white/40 mb-2 font-medium">Maya Dəyəri</p>
        <h3 className="font-serif font-bold text-white text-2xl md:text-[1.7rem] leading-tight tracking-tight">₼ {fmt(totalFoodCost)}</h3>
        <p className="text-[11px] text-white/25 mt-2 font-medium">{foodCostPct.toFixed(1)}% Food Cost</p>
      </motion.div>

      {/* 3 — İtki Xərci */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="relative overflow-hidden rounded-3xl p-5 md:p-6 bg-white/[0.03] border border-white/[0.06]"
      >
        <div className="mb-4 text-rose-400/70"><XCircle size={18} /></div>
        <p className="text-[10px] uppercase tracking-[0.15em] text-white/40 mb-2 font-medium">İtki Xərci</p>
        <h3 className="font-serif font-bold text-white text-2xl md:text-[1.7rem] leading-tight tracking-tight">₼ {fmt(totalWasteCost)}</h3>
        <p className="text-[11px] text-white/25 mt-2 font-medium">israf və tənzimləmə</p>
      </motion.div>

      {/* 4 — Təmiz Qazanc */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className={`relative overflow-hidden rounded-3xl p-5 md:p-6 border transition-all duration-500 ${
            isProfit ? 'bg-emerald-500/[0.04] border-emerald-500/20' : 'bg-rose-500/[0.04] border-rose-500/20'
        }`}
      >
        <div className={`mb-4 ${isProfit ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>
          {isProfit ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
        </div>
        <p className="text-[10px] uppercase tracking-[0.15em] text-white/40 mb-2 font-medium">Təmiz Qazanc</p>
        <h3 className={`font-serif font-bold text-2xl md:text-[1.7rem] leading-tight tracking-tight ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
          {isProfit ? '' : '−'}₼ {fmt(Math.abs(netProfit))}
        </h3>
        <p className="text-[11px] text-white/25 mt-2 font-medium">{isProfit ? 'mənfəət' : 'ziyan'}</p>
      </motion.div>

    </div>
  );
};

export default StatsTopCards;
