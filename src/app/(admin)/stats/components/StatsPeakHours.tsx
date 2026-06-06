'use client';

import React from 'react';
import { Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';

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
  const { lightMode } = useTheme();

  const periodLabel =
    timeFilter === 'today' ? t('period_label_today') :
    timeFilter === 'week' ? t('period_label_week') :
    timeFilter === 'month' ? t('period_label_month') :
    timeFilter === '3months' ? t('period_label_3months') :
    t('period_label_year');

  return (
    <div className={`bg-card border p-4 md:p-8 rounded-2xl ${lightMode ? 'border-gray-100' : 'border-white/5'}`}>
      <div className="flex items-center gap-2 md:gap-3 mb-4 md:mb-6">
        <div className={`p-1.5 md:p-2 text-orange-400 rounded-xl ${lightMode ? 'bg-gray-100' : 'bg-white/5'}`}>
          <Clock size={15} className="md:w-5 md:h-5" />
        </div>
        <h3 className={`text-base md:text-xl font-serif font-bold ${lightMode ? 'text-gray-900' : 'text-white'}`}>{t('peak_hours')}</h3>
        <span className={`text-[9px] md:text-[10px] uppercase tracking-widest ml-auto ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>{periodLabel}</span>
      </div>
      {peakHours.length === 0 ? (
        <p className={`text-sm text-center py-8 ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>{t('no_data_for_period')}</p>
      ) : (
        <div className="space-y-3">
          {peakHours.map((h, i) => {
            const maxVal = peakHours[0]?.count || 1;
            const pct = Math.round((h.count / maxVal) * 100);
            return (
              <div key={h.hour} className="flex items-center gap-4">
                <span className={`text-xs w-16 flex-shrink-0 font-mono ${lightMode ? 'text-gray-400' : 'text-white/40'}`}>{String(h.hour).padStart(2, '0')}:00</span>
                <div className={`flex-1 h-2 rounded-full overflow-hidden ${lightMode ? 'bg-gray-100' : 'bg-white/5'}`}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, delay: i * 0.05 }}
                    className={`h-full rounded-full ${i === 0 ? 'bg-gold shadow-[0_0_8px_rgba(212,175,55,0.5)]' : 'bg-gold/40'}`}
                  />
                </div>
                <span className={`text-xs font-bold w-10 text-right tabular-nums ${lightMode ? 'text-gray-500' : 'text-white/60'}`}>{h.count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StatsPeakHours;
