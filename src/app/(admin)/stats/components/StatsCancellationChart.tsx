'use client';

import React from 'react';
import { XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';

interface CancellationReason {
  key: string;
  name: string;
  value: number;
  color: string;
}

interface CancellationDetail {
  id: string;
  reason: string;
  reasonText: string;
  orderId: string;
  tableNumber: number | null;
  createdAt: string;
  totalAmount: number;
  items: { name: string; quantity: number; price: number }[];
}

interface StatsCancellationChartProps {
  cancellationReasons: CancellationReason[];
  cancellationDetails: CancellationDetail[];
  selectedReason: string | null;
  onSelectReason: (key: string | null) => void;
}

const interpolateTemplate = (template: string, variables: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (match, key) => String(variables[key] ?? match));

export default function StatsCancellationChart({
  cancellationReasons, cancellationDetails, selectedReason, onSelectReason,
}: StatsCancellationChartProps) {
  const { t, language } = useLanguage();
  const { lightMode } = useTheme();

  const selectedReasonMeta = selectedReason ? cancellationReasons.find(r => r.key === selectedReason) ?? null : null;
  const selectedReasonRecords = selectedReason ? cancellationDetails.filter(r => r.reason === selectedReason) : [];
  const selectedReasonLoss = selectedReasonRecords.reduce((sum, rec) => sum + rec.totalAmount, 0);
  const totalCount = cancellationReasons.reduce((a, b) => a + b.value, 0);

  if (cancellationReasons.length === 0) return null;

  return (
    <div className={`bg-card border p-8 ${lightMode ? 'border-gray-100' : 'border-white/5'}`}>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-red-500/10 text-red-400 rounded-xl">
          <XCircle size={20} />
        </div>
        <h3 className={`text-xl font-serif font-bold ${lightMode ? 'text-gray-900' : 'text-white'}`}>{t('stats_cancellation_reasons')}</h3>
        <span className={`text-[10px] uppercase tracking-widest ml-auto ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>
          {interpolateTemplate(t('stats_cancelled_orders_count'), { count: totalCount })}
        </span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        <div className="h-[300px] relative" onClick={() => onSelectReason(null)}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={cancellationReasons}
                cx="50%" cy="50%"
                innerRadius={60} outerRadius={100}
                paddingAngle={5} dataKey="value"
                onClick={(_, index, e) => {
                  e?.stopPropagation?.();
                  const clicked = cancellationReasons[index as number];
                  if (clicked) onSelectReason(selectedReason === clicked.key ? null : clicked.key);
                }}
              >
                {cancellationReasons.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color}
                    stroke={selectedReason === entry.key ? '#ffffff' : 'transparent'}
                    strokeWidth={selectedReason === entry.key ? 2 : 0}
                    style={{ cursor: 'pointer', opacity: selectedReason && selectedReason !== entry.key ? 0.45 : 1 }}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: lightMode ? '#ffffff' : '#0d0d0d', border: '1px solid #ffffff20', borderRadius: '8px', fontSize: '12px' }}
                labelStyle={{ color: '#ffffff60' }}
                formatter={(value: any, name: any) => [`${value || 0} ${t('stats_order_unit')}`, name]}
              />
            </PieChart>
          </ResponsiveContainer>
          <motion.button type="button"
            onClick={(e) => { e.stopPropagation(); onSelectReason(null); }}
            animate={{ opacity: selectedReason ? 1 : 0.5, scale: selectedReason ? 1 : 0.96 }}
            transition={{ duration: 0.2 }}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[120px] h-[120px] rounded-full bg-transparent"
            aria-label="reset" title="reset"
          />
        </div>
        <div className="space-y-3">
          <AnimatePresence mode="wait">
            {!selectedReasonMeta ? (
              <motion.div key="reasons-list" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }} className="space-y-1">
                {cancellationReasons.map((reason, idx) => (
                  <motion.button type="button" key={reason.name}
                    onClick={() => onSelectReason(reason.key)}
                    className={`w-full text-left flex items-center gap-3 p-2 rounded-lg transition-all border border-transparent ${lightMode ? 'hover:bg-gray-50' : 'hover:bg-white/[0.02]'}`}
                    initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: idx * 0.03 }} whileHover={{ x: 2 }}>
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: reason.color }} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm ${lightMode ? 'text-gray-900' : 'text-white'}`}>{reason.name}</span>
                        <span className={`text-sm font-bold ${lightMode ? 'text-gray-500' : 'text-white/60'}`}>{reason.value}</span>
                      </div>
                      <div className={`h-2 rounded-full overflow-hidden ${lightMode ? 'bg-gray-100' : 'bg-white/5'}`}>
                        <motion.div className="h-full rounded-full"
                          initial={{ width: 0 }} animate={{ width: `${(reason.value / totalCount) * 100}%` }}
                          transition={{ duration: 0.35, delay: idx * 0.03 }}
                          style={{ backgroundColor: reason.color }} />
                      </div>
                    </div>
                  </motion.button>
                ))}
                <p className={`text-xs pt-2 ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>{t('stats_tap_to_details')}</p>
              </motion.div>
            ) : (
              <motion.div key="reason-detail" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }} className="mt-1 pt-1 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`text-[10px] uppercase tracking-widest font-bold ${lightMode ? 'text-gray-400' : 'text-white/40'}`}>{t('stats_selected_reason')}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: selectedReasonMeta.color }} />
                      <span className={`font-semibold ${lightMode ? 'text-gray-900' : 'text-white'}`}>{selectedReasonMeta.name}</span>
                    </div>
                    <p className="text-xs text-red-400 mt-1">{t('stats_loss_label')}: -₼{selectedReasonLoss.toFixed(2)} • {selectedReasonMeta.value} {t('stats_order_unit')}</p>
                  </div>
                  <button type="button" onClick={() => onSelectReason(null)}
                    className={`px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold rounded-lg border hover:border-white/35 transition-colors ${lightMode ? 'border-gray-300 text-gray-500 hover:text-gray-900' : 'border-white/15 text-white/60 hover:text-white'}`}>
                    {t('stats_show_all')}
                  </button>
                </div>
                <div className={`max-h-56 overflow-y-auto pr-1 space-y-2 border-t pt-3 ${lightMode ? 'border-gray-200' : 'border-white/10'}`}>
                  {selectedReasonRecords.length === 0 ? (
                    <p className={`text-xs ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>{t('stats_no_records')}</p>
                  ) : selectedReasonRecords.map((rec) => (
                    <motion.div key={rec.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`p-2.5 rounded-lg border ${lightMode ? 'bg-gray-50 border-gray-100' : 'bg-white/[0.02] border-white/5'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs ${lightMode ? 'text-gray-600' : 'text-white/70'}`}>{rec.tableNumber ? `${t('table_label')} ${rec.tableNumber}` : `${t('table_label')} —`}</span>
                        <span className="text-[11px] font-bold text-red-400">-₼{rec.totalAmount.toFixed(2)}</span>
                      </div>
                      <p className={`text-[11px] mb-1 ${lightMode ? 'text-gray-400' : 'text-white/40'}`}>
                        {new Date(rec.createdAt).toLocaleString(language === 'az' ? 'az-AZ' : language === 'ru' ? 'ru-RU' : 'en-US', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <p className={`text-[11px] ${lightMode ? 'text-gray-600' : 'text-white/65'}`}>
                        {(rec.items || []).map((i) => `${i.name} ×${i.quantity}`).join(', ') || t('stats_no_product_detail')}
                      </p>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
