'use client';

import React from 'react';
import { Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface PeakHour {
  hour: number;
  count: number;
}

interface Props {
  peakHours: PeakHour[];
  timeFilter: string;
}

const StatsPeakHours = ({ peakHours, timeFilter }: Props) => {
  const { t } = useLanguage();

  const periodLabel =
    timeFilter === 'today' ? t('period_label_today') :
    timeFilter === 'week' ? t('period_label_week') :
    timeFilter === 'month' ? t('period_label_month') :
    timeFilter === '3months' ? t('period_label_3months') :
    t('period_label_year');

  return (
    <div className="bg-card border border-white/5 p-4 md:p-8 rounded-2xl">
      <div className="flex items-center gap-2 md:gap-3 mb-4 md:mb-6">
        <div className="p-1.5 md:p-2 bg-white/5 text-orange-400 rounded-xl">
          <Clock size={15} className="md:w-5 md:h-5" />
        </div>
        <h3 className="text-base md:text-xl font-serif font-bold text-white">{t('peak_hours')}</h3>
        <span className="text-[9px] md:text-[10px] text-white/30 uppercase tracking-widest ml-auto">{periodLabel}</span>
      </div>
      {peakHours.length === 0 ? (
        <p className="text-white/20 text-sm text-center py-8">{t('no_data_for_period')}</p>
      ) : (
        <div className="space-y-3">
          {peakHours.map((h, i) => {
            const maxVal = peakHours[0]?.count || 1;
            const pct = Math.round((h.count / maxVal) * 100);
            return (
              <div key={h.hour} className="flex items-center gap-4">
                <span className="text-white/40 text-xs w-16 flex-shrink-0 font-mono">{String(h.hour).padStart(2, '0')}:00</span>
                <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, delay: i * 0.05 }}
                    className={`h-full rounded-full ${i === 0 ? 'bg-gold shadow-[0_0_8px_rgba(212,175,55,0.5)]' : 'bg-gold/40'}`}
                  />
                </div>
                <span className="text-xs font-bold text-white/60 w-10 text-right tabular-nums">{h.count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StatsPeakHours;
