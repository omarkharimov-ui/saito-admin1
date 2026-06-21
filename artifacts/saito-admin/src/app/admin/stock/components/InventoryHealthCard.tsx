'use client';

import { useState } from 'react';
import { motion, AnimatePresence, Transition } from 'framer-motion';
import { ChevronRight, TrendingDown } from 'lucide-react';

interface HealthStats {
  total: number;
  normal: number;
  critical: number;
  out_of_stock: number;
  monthly_waste_cost: number;
}

interface Props {
  stats: HealthStats | null | undefined;
  loading: boolean;
}

const spring: Transition = { type: 'spring', stiffness: 280, damping: 28 };

function fmtCost(n: number) {
    return Number(n).toLocaleString('az-AZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function InventoryHealthCard({ stats, loading }: Props) {
  if (loading || !stats) {
    return <div className="h-[88px] rounded-2xl bg-white/5 animate-pulse" />;
  }

  const { total, normal, critical, out_of_stock, monthly_waste_cost } = stats;
  const healthScore = total > 0 ? Math.round((normal / total) * 100) : 100;

  const normalPct = total > 0 ? (normal / total) * 100 : 0;
  const criticalPct = total > 0 ? (critical / total) * 100 : 0;
  const outOfStockPct = total > 0 ? (out_of_stock / total) * 100 : 0;

  return (
    <div className="relative rounded-3xl border border-white/[0.08] bg-[#1c1c1e] p-5 overflow-hidden w-full max-w-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                <span className="font-black text-emerald-400 text-xl">{healthScore}</span>
            </div>
            <div>
                <h3 className="font-black text-white text-sm tracking-tight">Inventory Health</h3>
                <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest mt-0.5">
                    {normal} normal · {critical} kritik · {total} cəmi
                </p>
            </div>
        </div>
      </div>

      {/* Health Bar with Live Animation */}
      <div className="relative h-2.5 w-full rounded-full bg-white/5 overflow-hidden flex">
        {/* Shimmer Effect */}
        <motion.div 
          animate={{ x: ['-100%', '100%'] }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent z-10"
        />
        
        <motion.div 
            className="bg-emerald-500 h-full relative"
            initial={{ width: '0%' }}
            animate={{ width: `${normalPct}%` }}
            transition={{ type: 'spring', stiffness: 50, damping: 20 }}
         />
        <motion.div 
            className="bg-amber-500 h-full relative"
            initial={{ width: '0%' }}
            animate={{ width: `${criticalPct}%` }}
            transition={{ type: 'spring', stiffness: 50, damping: 20 }}
        />
        <motion.div 
            className="bg-red-500 h-full relative"
            initial={{ width: '0%' }}
            animate={{ width: `${outOfStockPct}%` }}
            transition={{ type: 'spring', stiffness: 50, damping: 20 }}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 mt-5 pt-4 border-t border-white/[0.05]">
          <div className="flex flex-col">
              <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Aylıq İtki</span>
              <span className="text-sm font-bold text-rose-400 mt-1">₼{fmtCost(monthly_waste_cost)}</span>
          </div>
          <div className="flex flex-col items-end">
              <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Status</span>
              <span className={`text-[10px] font-black mt-1 px-2 py-0.5 rounded-lg ${healthScore > 80 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                {healthScore > 80 ? 'SAĞLAM' : 'RİSKLİ'}
              </span>
          </div>
      </div>
    </div>
  );
}
