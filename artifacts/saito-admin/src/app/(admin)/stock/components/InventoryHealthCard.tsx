'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

const spring = { type: 'spring', stiffness: 280, damping: 28 };

function fmtCost(n: number) {
    return Number(n).toLocaleString('az-AZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function InventoryHealthCard({ stats, loading }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (loading || !stats) {
    return <div className="h-[88px] rounded-2xl bg-white/5 animate-pulse" />;
  }

  const { total, normal, critical, out_of_stock, monthly_waste_cost } = stats;
  const healthScore = total > 0 ? Math.round((normal / total) * 100) : 100;

  const normalPct = total > 0 ? (normal / total) * 100 : 0;
  const criticalPct = total > 0 ? (critical / total) * 100 : 0;
  const outOfStockPct = total > 0 ? (out_of_stock / total) * 100 : 0;

  return (
    <motion.div
      layout // This prop enables the automatic layout animation
      transition={spring}
      className="relative rounded-2xl border border-white/10 bg-white/[0.07] p-4 overflow-hidden"
    >
      <motion.div layout transition={spring} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500/30 to-emerald-500/10">
                <span className="font-bold text-white text-lg">{healthScore}</span>
            </div>
            <div>
                <h3 className="font-bold text-white">Inventory Health</h3>
                <p className="text-xs text-white/50">
                    {normal} normal · {critical} kritik · {total} cəmi
                </p>
            </div>
        </div>
        <button onClick={() => setIsExpanded(!isExpanded)} className="flex items-center gap-1 text-xs font-semibold text-white/60 hover:text-white transition-colors">
          Ətraflı
          <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronRight size={14} />
          </motion.div>
        </button>
      </motion.div>

      {/* Health Bar */}
      <motion.div layout transition={spring} className="mt-3 h-2 w-full rounded-full bg-white/10 overflow-hidden flex">
        <motion.div 
            className="bg-emerald-500 h-full"
            initial={{ width: '0%' }}
            animate={{ width: `${normalPct}%`, transition: { ...spring, delay: 0.2, duration: 0.5 }}}
         />
        <motion.div 
            className="bg-amber-500 h-full"
            initial={{ width: '0%' }}
            animate={{ width: `${criticalPct}%`, transition: { ...spring, delay: 0.3, duration: 0.5 }}}
        />
        <motion.div 
            className="bg-red-500 h-full"
            initial={{ width: `${outOfStockPct}%`, transition: { ...spring, delay: 0.4, duration: 0.5 }}}
        />
      </motion.div>

      {/* Expanded Content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0, transition: { ...spring, delay: 0.1 } }}
            exit={{ opacity: 0, y: -10, transition: { duration: 0.15 } }}
            className="mt-4 pt-4 border-t border-white/10"
          >
            <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                    <p className="text-xs text-white/50">Normal</p>
                    <p className="font-bold text-lg text-white mt-1">{normal}</p>
                </div>
                <div>
                    <p className="text-xs text-white/50">Kritik</p>
                    <p className="font-bold text-lg text-amber-400 mt-1">{critical}</p>
                </div>
                <div>
                    <p className="text-xs text-white/50">Bitib</p>
                    <p className="font-bold text-lg text-red-400 mt-1">{out_of_stock}</p>
                </div>
                <div>
                    <p className="text-xs text-white/50">İtki</p>
                    <p className="font-bold text-lg text-red-400 mt-1">₼{fmtCost(monthly_waste_cost)}</p>
                </div>
            </div>
            {critical > 0 && (
                 <div className="mt-4 text-center text-xs text-amber-400/80 bg-amber-500/10 p-2 rounded-lg">
                    ⚠ {critical} xammal təcili diqqət tələb edir.
                </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
