'use client';

import React from 'react';
import { TrendingUp, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';

interface Forecast {
  predictedRevenue: number;
  trend: number;
  confidence: 'high' | 'medium' | 'low';
}

interface Anomaly {
  type: string;
  severity: 'critical' | 'warning';
  message: string;
}

interface Props {
  forecast: Forecast | null;
  anomalies: Anomaly[];
}

const StatsAIForecast = ({ forecast, anomalies }: Props) => {
  const { t } = useLanguage();
  const { lightMode } = useTheme();

  if (!forecast && anomalies.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {forecast && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="border border-gold/20 p-6 rounded-2xl relative overflow-hidden"
          style={{ background: lightMode ? 'radial-gradient(ellipse at 20% 20%, rgba(184,134,11,0.06) 0%, rgba(184,134,11,0.02) 40%, transparent 70%), #f9fafb' : 'radial-gradient(ellipse at 20% 20%, rgba(212,175,55,0.12) 0%, rgba(212,175,55,0.04) 40%, transparent 70%), radial-gradient(ellipse at 80% 80%, rgba(212,175,55,0.06) 0%, transparent 50%), #0d0d0d' }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-gold/20 rounded-lg">
              <TrendingUp size={18} className="text-gold" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gold">{t('stats_forecast_title')}</h3>
              <p className="text-[10px] text-white/40 uppercase tracking-wider">{t('stats_forecast_subtitle')}</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-serif font-bold text-white">₼{forecast.predictedRevenue.toLocaleString()}</span>
              <span className={`text-xs font-bold ${forecast.trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {forecast.trend >= 0 ? '+' : ''}{forecast.trend.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${forecast.confidence === 'high' ? 'bg-green-500' : forecast.confidence === 'medium' ? 'bg-yellow-500' : 'bg-red-500'}`} />
              <span className="text-xs text-white/50">
                {t('stats_confidence')}: {forecast.confidence === 'high' ? t('stats_confidence_high') : forecast.confidence === 'medium' ? t('stats_confidence_medium') : t('stats_confidence_low')}
              </span>
            </div>
            <p className="text-xs text-white/40">{t('stats_forecast_desc')}</p>
          </div>
        </motion.div>
      )}

      {anomalies.map((anomaly, idx) => (
        <motion.div
          key={anomaly.type}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.1 }}
          className={`p-6 rounded-2xl border ${anomaly.severity === 'critical' ? 'bg-red-500/10 border-red-500/30' : 'bg-orange-500/10 border-orange-500/30'}`}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className={anomaly.severity === 'critical' ? 'text-red-500' : 'text-orange-500'} />
            <div>
              <h3 className={`text-sm font-bold ${anomaly.severity === 'critical' ? 'text-red-400' : 'text-orange-400'}`}>
                {anomaly.severity === 'critical' ? t('stats_alert_critical') : t('stats_alert_warning')}
              </h3>
              <p className="text-xs text-white/60 mt-2 leading-relaxed">{anomaly.message}</p>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
};

export default StatsAIForecast;
