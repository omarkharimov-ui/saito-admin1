'use client';

import React from 'react';
import { DollarSign, ShoppingBag, TrendingUp, XCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface Props {
  totalRevenue: number;
  totalOrders: number;
  aov: number;
  missedRevenue: number;
}

const StatsTopCards = ({ totalRevenue, totalOrders, aov, missedRevenue }: Props) => {
  const { t } = useLanguage();

  const cards = [
    { label: t('stats_total_revenue'), value: `₼ ${(totalRevenue || 0).toLocaleString()}`, icon: DollarSign, color: 'text-gold' },
    { label: t('stats_total_orders'), value: totalOrders || 0, icon: ShoppingBag, color: 'text-blue-400' },
    { label: t('stats_aov_label'), value: `₼ ${(aov || 0).toFixed(2)}`, icon: TrendingUp, color: 'text-green-400' },
    { label: t('stats_cancelled_loss'), value: `₼ ${(missedRevenue || 0).toFixed(2)}`, icon: XCircle, color: 'text-red-400' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
      {cards.map((s, i) => (
        <motion.div
          key={s.label}
          initial={{ opacity: 0.3, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.4, ease: 'easeOut' }}
          className="p-4 md:p-6 bg-card border border-white/5 transition-all group relative overflow-hidden rounded-2xl"
        >
          <div className="absolute top-0 left-0 w-32 h-32 rounded-full bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.07),transparent_70%)] pointer-events-none" />
          <div className={`mb-2 md:mb-4 relative z-10 ${s.color}`}>
            <s.icon size={16} className="md:w-5 md:h-5" />
          </div>
          <p className="text-white/35 text-[9px] md:text-[10px] uppercase tracking-widest mb-1 relative z-10 leading-tight">{s.label}</p>
          <h3 className={`font-serif font-bold text-white leading-tight relative z-10 ${String(s.value).length > 10 ? 'text-lg md:text-2xl' : 'text-xl md:text-2xl'}`}>{s.value}</h3>
          <div className="absolute top-0 right-0 w-16 h-16 bg-gold/5 -skew-x-12 translate-x-8 -translate-y-8" />
        </motion.div>
      ))}
    </div>
  );
};

export default StatsTopCards;
