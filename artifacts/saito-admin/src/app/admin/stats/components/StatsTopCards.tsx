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
        className="relative overflow-hidden rounded-2xl p-4 md:p-5 bg-[#1c1c1e] border border-white/5"
      >
        <div className="mb-3 text-[#D4AF37] opacity-60"><DollarSign size={16} /></div>
        <p className="text-[9px] md:text-[10px] uppercase tracking-widest text-white/35 mb-1">Ümumi Dövriyyə</p>
        <h3 className="font-serif font-bold text-white text-xl md:text-2xl leading-tight">₼ {fmt(totalRevenue)}</h3>
        <p className="text-[10px] text-white/20 mt-1">{totalOrders} sifariş</p>
      </motion.div>

      {/* 2 — Maya Dəyəri */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="relative overflow-hidden rounded-2xl p-4 md:p-5 bg-[#1c1c1e] border border-white/5"
      >
        <div className="mb-3 text-orange-400 opacity-60"><Percent size={16} /></div>
        <p className="text-[9px] md:text-[10px] uppercase tracking-widest text-white/35 mb-1">Maya Dəyəri</p>
        <h3 className="font-serif font-bold text-white text-xl md:text-2xl leading-tight">₼ {fmt(totalFoodCost)}</h3>
        <p className="text-[10px] text-white/20 mt-1">{foodCostPct.toFixed(1)}% Food Cost</p>
      </motion.div>

      {/* 3 — İtki Xərci */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="relative overflow-hidden rounded-2xl p-4 md:p-5 bg-[#1c1c1e] border border-white/5"
      >
        <div className="mb-3 text-rose-400 opacity-60"><XCircle size={16} /></div>
        <p className="text-[9px] md:text-[10px] uppercase tracking-widest text-white/35 mb-1">İtki Xərci</p>
        <h3 className="font-serif font-bold text-white text-xl md:text-2xl leading-tight">₼ {fmt(totalWasteCost)}</h3>
        <p className="text-[10px] text-white/20 mt-1">israf və tənzimləmə</p>
      </motion.div>

      {/* 4 — Təmiz Qazanc */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className={`relative overflow-hidden rounded-2xl p-4 md:p-5 border transition-all duration-500 ${
            isProfit ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20'
        }`}
      >
        <div className={`mb-3 ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
          {isProfit ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
        </div>
        <p className="text-[9px] md:text-[10px] uppercase tracking-widest text-white/35 mb-1">Təmiz Qazanc</p>
        <h3 className={`font-serif font-bold text-xl md:text-2xl leading-tight ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
          {isProfit ? '' : '−'}₼ {fmt(Math.abs(netProfit))}
        </h3>
        <div className={`absolute bottom-0 left-0 h-1 bg-current opacity-20 ${isProfit ? 'w-full' : 'w-0'}`} />
      </motion.div>

    </div>
  );
};

export default StatsTopCards;
