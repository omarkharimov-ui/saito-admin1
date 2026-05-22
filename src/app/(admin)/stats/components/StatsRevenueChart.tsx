'use client';

import React from 'react';
import { TrendingUp, BarChart2 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface ChartPoint {
  date: string;
  value: number;
}

interface Props {
  chartData: ChartPoint[];
  loading?: boolean;
}

const StatsRevenueChart = ({ chartData, loading }: Props) => {
  const { t, language } = useLanguage();
  const isEmpty = !chartData || chartData.length === 0 || chartData.every(d => d.value === 0);

  const emptyMsg = language === 'az'
    ? 'Bu dövr üçün gəlir məlumatı yoxdur'
    : language === 'ru'
      ? 'Нет данных о доходах за этот период'
      : 'No revenue data for this period';

  const emptyHint = language === 'az'
    ? 'Sifariş daxil olduqda dinamika burada görünəcək'
    : language === 'ru'
      ? 'Динамика появится здесь, когда поступят заказы'
      : 'Dynamics will appear here once orders come in';

  return (
    <div className="bg-card border border-white/5 p-4 md:p-8 rounded-2xl">
      <div className="flex items-center justify-between mb-4 md:mb-8">
        <h3 className="text-base md:text-xl font-serif font-bold text-white flex items-center gap-2 md:gap-3">
          <TrendingUp size={16} className="text-gold md:w-5 md:h-5" />
          {t('stats_revenue_dynamics')}
        </h3>
      </div>
      {isEmpty || loading ? (
        <div className="h-[180px] md:h-[350px] w-full flex flex-col items-center justify-center gap-4 select-none">
          <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shadow-[0_0_30px_rgba(212,175,55,0.1)]">
            <BarChart2 size={22} className="text-gold/40 md:w-7 md:h-7" />
          </div>
          <div className="text-center">
            <p className="text-white/50 text-sm font-medium">{emptyMsg}</p>
            <p className="text-white/25 text-xs mt-1 hidden md:block">{emptyHint}</p>
          </div>
        </div>
      ) : (
      <div className="h-[180px] md:h-[350px] w-full" style={{ willChange: 'transform' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#D4AF37" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#D4AF37" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="transparent" />
            <XAxis
              dataKey="date"
              stroke="transparent"
              tick={{ fill: 'rgba(255,255,255,0.18)', fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              dy={10}
              interval={Math.max(0, Math.floor(chartData.length / 7) - 1)}
            />
            <YAxis
              stroke="transparent"
              tick={{ fill: 'rgba(255,255,255,0.15)', fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `₼${v}`}
              width={44}
              tickCount={4}
            />
            <Tooltip
              cursor={{ stroke: 'rgba(184,150,74,0.15)', strokeWidth: 1 }}
              contentStyle={{ background: '#0f0f0f', border: '1px solid rgba(212,175,55,0.25)', borderRadius: '10px', fontSize: '12px', padding: '7px 12px', boxShadow: '0 4px 24px rgba(0,0,0,0.6)' }}
              labelStyle={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 3 }}
              itemStyle={{ color: '#D4AF37', fontWeight: 700 }}
              formatter={(value) => [`₼${Number(value).toFixed(2)}`, '']}
              labelFormatter={(label) => label}
            />
            <Area type="monotone" dataKey="value" stroke="#D4AF37" strokeWidth={2.5} fill="url(#colorValue)" fillOpacity={1} dot={false} activeDot={{ r: 4.5, fill: '#FFD700', stroke: 'rgba(212,175,55,0.35)', strokeWidth: 7 }} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="none"
              fill="none"
              legendType="none"
              tooltipType="none"
              dot={(props: any) => {
                const peak = Math.max(...chartData.map((d) => d.value));
                if (props.value !== peak) return <g key={props.index} />;
                const { cx, cy } = props;
                const r = 5;
                const star = Array.from({ length: 10 }, (_, i) => {
                  const angle = (i * Math.PI) / 5 - Math.PI / 2;
                  const radius = i % 2 === 0 ? r : r * 0.42;
                  return `${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`;
                }).join(' ');
                return (
                  <g key={props.index}>
                    <polygon points={star} fill="#C9A84C" opacity={0.9} />
                    <circle cx={cx} cy={cy} r={10} fill="none" stroke="rgba(201,168,76,0.2)" strokeWidth={1} />
                  </g>
                );
              }}
              activeDot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      )}
    </div>
  );
};

export default StatsRevenueChart;
