'use client';

import { motion } from 'framer-motion';
import {
  TrendingUp, TrendingDown, DollarSign,
  AlertTriangle, BarChart2, Award, Percent,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useTheme } from '@/lib/theme/ThemeContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProfitableItem {
  id: string;
  name: string;
  sold: number;
  revenue: number;
  food_cost: number;
  net_profit: number;
  markup_pct: number | null;
}

interface FinanceChartPoint { date: string; revenue: number }

interface Props {
  totalRevenue: number;
  totalFoodCost: number;
  totalWasteCost: number;
  grossProfit: number;
  netProfit: number;
  foodCostPct: number;
  topProfitableItems: ProfitableItem[];
  financeChartData: FinanceChartPoint[];
  loading?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const az = (n: number, dec = 2) =>
  Number(n).toLocaleString('az-AZ', { minimumFractionDigits: dec, maximumFractionDigits: dec });

function foodCostHealth(pct: number): { label: string; color: string; bg: string; border: string } {
  if (pct === 0)    return { label: 'Resept yoxdur', color: 'text-white/30', bg: 'bg-white/5',       border: 'border-white/10' };
  if (pct <= 25)    return { label: 'Əla',            color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25' };
  if (pct <= 32)    return { label: 'Normal',          color: 'text-[#D4AF37]',   bg: 'bg-amber-500/10',  border: 'border-amber-500/20' };
  if (pct <= 40)    return { label: 'Diqqət',          color: 'text-orange-400',  bg: 'bg-orange-500/10', border: 'border-orange-500/20' };
  return              { label: 'Kritik',          color: 'text-red-400',     bg: 'bg-red-500/10',    border: 'border-red-500/25' };
}

// ─── Stat Card ─────────────────────────────────────────────────────────────────

function FinCard({
  label, value, sub, icon, accent, big, delay = 0,
}: {
  label: string; value: string; sub?: string; icon: React.ReactNode;
  accent: string; big?: boolean; delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="relative overflow-hidden rounded-2xl p-5 flex flex-col gap-3"
      style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {big && (
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 80% 20%,#D4AF37,transparent 60%)' }} />
      )}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/30">{label}</span>
        <span className={accent}>{icon}</span>
      </div>
      <div>
        <p className={`${big ? 'text-4xl' : 'text-2xl'} font-black tabular-nums leading-none`}>{value}</p>
        {sub && <p className="text-[11px] text-white/35 mt-1.5">{sub}</p>}
      </div>
    </motion.div>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-3 py-2.5 text-xs shadow-xl"
      style={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)' }}>
      <p className="text-white/40 mb-1.5 font-semibold">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }} className="font-bold">
          {p.name}: ₼{az(p.value)}
        </p>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StatsFinancePanel({
  totalRevenue, totalFoodCost, totalWasteCost,
  grossProfit, netProfit, foodCostPct,
  topProfitableItems, financeChartData, loading,
}: Props) {
  const { lightMode } = useTheme();
  const health = foodCostHealth(foodCostPct);
  const markupOverall = totalFoodCost > 0
    ? Math.round(((totalRevenue - totalFoodCost) / totalFoodCost) * 100)
    : null;

  // Enrich chart with gross profit line (simplified: revenue * (1 - foodCostPct/100))
  const chartEnriched = financeChartData.map(d => ({
    ...d,
    net_profit: totalRevenue > 0
      ? Math.round(d.revenue * (netProfit / totalRevenue) * 100) / 100
      : 0,
  }));

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-6 w-48 rounded-xl bg-white/5" />
        <div className="grid grid-cols-4 gap-3">
          {[0,1,2,3].map(i => <div key={i} className="h-32 rounded-2xl bg-white/[0.03]" />)}
        </div>
        <div className="h-64 rounded-2xl bg-white/[0.03]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Section header ── */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#1e1600,#140f00)', border: '1px solid rgba(212,175,55,0.2)' }}>
          <DollarSign size={17} className="text-[#D4AF37]" />
        </div>
        <div>
          <h3 className="text-lg font-serif font-bold text-white leading-none">Maliyyə Analitikası</h3>
          <p className="text-[10px] text-white/25 uppercase tracking-[0.2em] mt-0.5">Revenue · Food Cost · Net Profit</p>
        </div>
      </div>

      {/* ── 4 stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <FinCard
          label="Dövriyyə" value={`₼${az(totalRevenue)}`}
          sub={`${totalRevenue > 0 ? az(totalRevenue / Math.max(1, topProfitableItems.length), 2) : '0.00'} orta/məhsul`}
          icon={<TrendingUp size={18} />} accent="text-[#D4AF37]/70"
          delay={0}
        />
        <FinCard
          label="Maya Dəyəri" value={`₼${az(totalFoodCost)}`}
          sub={
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${health.bg} border ${health.border} ${health.color}`}>
              <Percent size={9} /> {foodCostPct > 0 ? `${az(foodCostPct, 1)}% — ${health.label}` : 'Resept yoxdur'}
            </span> as any
          }
          icon={<BarChart2 size={18} />} accent="text-amber-400/70"
          delay={0.06}
        />
        <FinCard
          label="İtki Xərci" value={`₼${az(totalWasteCost)}`}
          sub="bu dövrdə waste + adjustment"
          icon={<AlertTriangle size={18} />} accent={totalWasteCost > 0 ? 'text-rose-400/70' : 'text-white/20'}
          delay={0.12}
        />
        <FinCard
          label="Təmiz Qazanc" value={`₼${az(netProfit)}`}
          big
          sub={markupOverall !== null
            ? `Markup: +${markupOverall}% · Brutto ₼${az(grossProfit)}`
            : `Brutto ₼${az(grossProfit)}`
          }
          icon={<DollarSign size={20} />}
          accent={netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}
          delay={0.18}
        />
      </div>

      {/* ── Food cost health bar ── */}
      {foodCostPct > 0 && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.22 }}
          className="rounded-2xl px-5 py-4"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-bold text-white/40 uppercase tracking-wider">Food Cost %</span>
            <span className={`text-[11px] font-bold ${health.color}`}>{health.label} — ideal: 25–35%</span>
          </div>
          <div className="relative h-2 bg-white/[0.06] rounded-full overflow-hidden">
            {/* Reference zones */}
            <div className="absolute inset-y-0 left-0 w-[25%] bg-emerald-500/20 rounded-full" />
            <div className="absolute inset-y-0 left-[25%] w-[10%] bg-amber-400/20" />
            <div className="absolute inset-y-0 left-[35%] w-[5%] bg-orange-400/20" />
            <motion.div
              className={`absolute inset-y-0 left-0 rounded-full ${
                foodCostPct <= 25 ? 'bg-emerald-400' :
                foodCostPct <= 32 ? 'bg-amber-400' :
                foodCostPct <= 40 ? 'bg-orange-400' : 'bg-red-500'
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(foodCostPct, 100)}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5 text-[9px] text-white/20 font-medium">
            <span>0%</span><span>25%</span><span>35%</span><span>50%</span><span>100%</span>
          </div>
        </motion.div>
      )}

      {/* ── Revenue vs Net Profit Area Chart ── */}
      {chartEnriched.length > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="rounded-2xl p-5"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="text-[11px] font-bold text-white/30 uppercase tracking-widest mb-5">
            Dövriyyə vs Təmiz Qazanc
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartEnriched} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#D4AF37" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="profGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#34d399" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `₼${v}`} />
              <Tooltip content={<ChartTooltip />} />
              <Legend
                formatter={(val) => <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{val}</span>}
                wrapperStyle={{ paddingTop: 12 }}
              />
              <Area
                type="monotone" dataKey="revenue" name="Dövriyyə"
                stroke="#D4AF37" strokeWidth={2} fill="url(#revGrad)" dot={false}
              />
              <Area
                type="monotone" dataKey="net_profit" name="Təmiz Qazanc"
                stroke="#34d399" strokeWidth={2} fill="url(#profGrad)" dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {/* ── Top Profitable Items ── */}
      {topProfitableItems.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="rounded-2xl overflow-hidden"
          style={{ border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 px-5 py-4"
            style={{ background: 'rgba(255,255,255,0.018)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <Award size={15} className="text-[#D4AF37]/70" />
            <p className="text-[11px] font-bold text-white/40 uppercase tracking-widest">
              Ən Çox Qazandıran Yeməklər
            </p>
          </div>

          {/* Table head */}
          <div
            className="grid gap-3 px-5 py-2.5 text-[10px] font-bold tracking-[0.14em] uppercase text-white/20"
            style={{ gridTemplateColumns: '1fr 70px 90px 90px 80px 90px' }}
          >
            <span>Məhsul</span>
            <span className="text-center">Satış</span>
            <span className="text-right">Dövriyyə</span>
            <span className="text-right">Maya</span>
            <span className="text-right">Markup</span>
            <span className="text-right">Qazanc</span>
          </div>

          {topProfitableItems.map((item, i) => {
            const isLoss = item.net_profit < 0;
            const markupColor = item.markup_pct === null ? 'text-white/25'
              : item.markup_pct >= 200 ? 'text-emerald-400'
              : item.markup_pct >= 100 ? 'text-[#D4AF37]'
              : item.markup_pct >= 50  ? 'text-amber-400'
              : 'text-orange-400';

            return (
              <div
                key={item.id}
                className="grid gap-3 px-5 py-3.5 items-center transition-colors hover:bg-white/[0.018]"
                style={{
                  gridTemplateColumns: '1fr 70px 90px 90px 80px 90px',
                  borderTop: '1px solid rgba(255,255,255,0.04)',
                }}
              >
                {/* Rank + Name */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black flex-shrink-0"
                    style={{ background: i < 3 ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.04)', color: i < 3 ? '#D4AF37' : 'rgba(255,255,255,0.2)' }}>
                    {i + 1}
                  </span>
                  <span className="text-sm font-semibold truncate">{item.name}</span>
                </div>

                {/* Sold */}
                <span className="text-center text-sm text-white/50 tabular-nums font-semibold">{item.sold}</span>

                {/* Revenue */}
                <span className="text-right text-sm text-white/70 tabular-nums">₼{az(item.revenue)}</span>

                {/* Food Cost */}
                <span className="text-right text-sm text-amber-400/70 tabular-nums">
                  {item.food_cost > 0 ? `₼${az(item.food_cost)}` : <span className="text-white/20">—</span>}
                </span>

                {/* Markup */}
                <span className={`text-right text-sm tabular-nums font-bold ${markupColor}`}>
                  {item.markup_pct !== null ? `+${item.markup_pct}%` : '—'}
                </span>

                {/* Net Profit */}
                <span className={`text-right text-sm tabular-nums font-black ${isLoss ? 'text-red-400' : 'text-emerald-400'}`}>
                  {isLoss ? '−' : '+'}₼{az(Math.abs(item.net_profit))}
                </span>
              </div>
            );
          })}
        </motion.div>
      )}

      {/* Empty state — no recipes configured */}
      {topProfitableItems.length === 0 && totalRevenue > 0 && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="rounded-2xl px-6 py-8 text-center"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <Award size={32} className="mx-auto mb-3 text-white/10" />
          <p className="text-sm font-semibold text-white/30">Resept məlumatı tapılmadı</p>
          <p className="text-xs text-white/20 mt-1">
            Məhsullar üçün <code className="text-[#D4AF37]/60">recipes</code> cədvəlinə inqredientlər əlavə edin
          </p>
        </motion.div>
      )}
    </div>
  );
}
