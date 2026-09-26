'use client';

/**
 * 2026-09-26 (Task 53 P1-3): owner mobile dashboard content (route /owner).
 *
 * Read-only, phone-first ("Toast Now" style): live sales, "now" operations
 * snapshot, top dishes, alerts and the last 10 orders. All data comes from the
 * single aggregation endpoint /api/owner/dashboard (see
 * src/app/api/owner/dashboard/route.ts) — no per-card fetches.
 *
 * Live updates: useCrossTableRefresh('owner-dash', [orders, order_items], …, 3000)
 * plus a 60 s interval fallback (house pattern) and an online/offline badge.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  Bike,
  ChefHat,
  Clock,
  LayoutGrid,
  PackageCheck,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Utensils,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import type { TranslationKey } from '@/lib/i18n/translations';
import { useCrossTableRefresh } from '@/hooks/useCrossTableRefresh';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from '@/lib/toast';

const SPRING = { type: 'spring', stiffness: 500, damping: 26 } as const;
const FALLBACK_POLL_MS = 60_000;

interface LowStockRow {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  critical_limit: number;
  status: string;
}

interface OverdueKdsRow {
  id: string;
  order_number: string | null;
  table_number: number | null;
  order_type: string | null;
  kitchen_status: string;
  created_at: string;
  minutes: number;
}

interface LastOrderRow {
  id: string;
  order_number: string | null;
  table_number: number | null;
  order_type: string;
  total_amount: number;
  status: string;
  kitchen_status: string | null;
  delivery_status: string | null;
  created_at: string;
}

interface OwnerDashboardData {
  generated_at: string;
  day_start: string;
  venue_name: string;
  sales: { revenue: number; orders: number; avg_ticket: number; items_sold: number };
  hourly: { hour: number; revenue: number; orders: number }[];
  max_hour_revenue: number;
  now: {
    open_tables: number;
    kds_active: number;
    delivery_in_progress: number;
    takeaway_waiting: number;
  };
  top_dishes: { name: string; qty: number; revenue: number }[];
  alerts: {
    low_stock: LowStockRow[];
    overdue_kds: OverdueKdsRow[];
    order_delay_minutes: number;
  };
  last_orders: LastOrderRow[];
}

const money = (n: number) =>
  `₼${(Number.isFinite(n) ? n : 0).toLocaleString('az-AZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const cardClass = 'rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)]';

// Order status / type → i18n key maps (added 2026-09-26 with the owner_* block).
const STATUS_LABEL_KEYS: Record<string, TranslationKey> = {
  new: 'owner_status_new',
  confirmed: 'owner_status_confirmed',
  pending: 'owner_status_pending',
  preparing: 'owner_status_preparing',
  cooking: 'owner_status_cooking',
  ready: 'owner_status_ready',
  served: 'owner_status_served',
  paid: 'owner_status_paid',
  cancelled: 'owner_status_cancelled',
  delivered: 'owner_status_delivered',
  in_transit: 'owner_status_in_transit',
  picked_up: 'owner_status_picked_up',
};

const ORDER_TYPE_LABEL_KEYS: Record<string, TranslationKey> = {
  dine_in: 'owner_type_dine_in',
  takeaway: 'owner_type_takeaway',
  delivery: 'owner_type_delivery',
};

/** Locale tag for date/time rendering, mirroring the i18n language. */
function localeTag(language: string): string {
  if (language === 'ru') return 'ru-RU';
  if (language === 'en') return 'en-GB';
  return 'az-AZ';
}

function SectionTitle({
  icon,
  label,
  right,
  lightMode,
}: {
  icon: React.ReactNode;
  label: string;
  right?: React.ReactNode;
  lightMode: boolean;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2 px-1">
      <div className="flex items-center gap-2">
        <span className={lightMode ? 'text-zinc-400' : 'text-[var(--theme-text-muted)]'}>{icon}</span>
        <h2
          className={`text-[11px] font-black uppercase tracking-[0.18em] ${
            lightMode ? 'text-zinc-500' : 'text-[var(--theme-text-muted)]'
          }`}
        >
          {label}
        </h2>
      </div>
      {right}
    </div>
  );
}

function MetricTile({
  label,
  value,
  icon,
  tone,
  lightMode,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tone: string;
  lightMode: boolean;
}) {
  return (
    <div className={`${cardClass} flex flex-col gap-2 p-3`}>
      <span className={`w-fit rounded-xl p-1.5 ${tone}`}>{icon}</span>
      <span className={`text-2xl font-black leading-none ${lightMode ? 'text-zinc-900' : 'text-white'}`}>
        {value}
      </span>
      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--theme-text-muted)]">
        {label}
      </span>
    </div>
  );
}

export default function OwnerDashboard() {
  const { lightMode } = useTheme();
  const { t, language } = useLanguage();

  const [data, setData] = useState<OwnerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const inflightRef = useRef(false);

  /* ── Data ──────────────────────────────────────────────────────────────── */
  const fetchDashboard = useCallback(async () => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    try {
      const res = await apiFetch('/api/owner/dashboard');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as OwnerDashboardData;
      setData(json);
      setError(null);
    } catch (e: any) {
      setError(e?.message || t('owner_error') || 'Məlumat yüklənmədi');
    } finally {
      inflightRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Live: orders/order_items row changes push a debounced refetch (3 s coalescing).
  useCrossTableRefresh('owner-dash', ['orders', 'order_items'], fetchDashboard, 3000);

  // Fallback poll — realtime kanalı itsə də data təzə qalır (house pattern).
  useEffect(() => {
    const id = setInterval(fetchDashboard, FALLBACK_POLL_MS);
    return () => clearInterval(id);
  }, [fetchDashboard]);

  /* ── Online / offline ──────────────────────────────────────────────────── */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => setOnline(window.navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await fetchDashboard();
    toast.success(t('owner_updated') || 'Yeniləndi');
  };

  const dateLabel = useMemo(
    () =>
      new Date().toLocaleDateString(localeTag(language), {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    [language],
  );

  if (loading && !data) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-gold/20 border-t-gold/80" />
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[var(--theme-text-muted)]">
            {t('owner_loading') || 'Yüklənir...'}
          </p>
        </div>
      </div>
    );
  }

  const statusLabel = (status: string): string => {
    const key = STATUS_LABEL_KEYS[status];
    return key ? t(key) : status;
  };

  const typeMeta = (orderType: string) => {
    if (orderType === 'delivery') return { Icon: Bike, tint: 'text-sky-400' };
    if (orderType === 'takeaway') return { Icon: ShoppingBag, tint: 'text-amber-400' };
    return { Icon: Utensils, tint: 'text-[var(--theme-text-muted)]' };
  };

  const onlineDot = online ? 'bg-emerald-400' : 'bg-red-500';
  const alerts = data?.alerts;
  const hasAlerts = Boolean(alerts && (alerts.low_stock.length > 0 || alerts.overdue_kds.length > 0));

  return (
    <div className={`min-h-[100dvh] ${lightMode ? 'bg-zinc-100' : 'bg-[#07070b]'}`}>
      <div className="mx-auto w-full max-w-md px-4 pb-16 pt-3">
        {/* ── a. Header ─────────────────────────────────────────────────── */}
        <header className="mb-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href="/admin"
              aria-label={t('owner_back') || 'Geri'}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${cardClass}`}
            >
              <ArrowLeft size={16} className={lightMode ? 'text-zinc-600' : 'text-white/70'} />
            </Link>
            <div className="min-w-0">
              <h1
                className={`truncate text-lg font-black leading-tight ${
                  lightMode ? 'text-zinc-900' : 'text-white'
                }`}
              >
                {data?.venue_name || 'Saito'}
              </h1>
              <p className="truncate text-[11px] font-medium capitalize text-[var(--theme-text-muted)]">
                {dateLabel}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${cardClass} ${
                online ? 'text-emerald-500' : 'text-red-500'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${onlineDot} ${online ? 'animate-pulse' : ''}`} />
              {online ? t('owner_online') || 'Online' : t('owner_offline') || 'Offline'}
            </span>
            <button
              type="button"
              onClick={handleManualRefresh}
              aria-label={t('owner_retry') || 'Yenilə'}
              className={`flex h-9 w-9 items-center justify-center rounded-full border ${cardClass}`}
            >
              <RefreshCw
                size={15}
                className={`${refreshing ? 'animate-spin' : ''} ${
                  lightMode ? 'text-zinc-600' : 'text-white/70'
                }`}
              />
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-3 flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] font-semibold text-red-400">
            <AlertTriangle size={14} />
            {error}
          </div>
        )}

        {/* ── b. Today sales ────────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING}
          className={`${cardClass} mb-4 overflow-hidden p-4`}
        >
          <div className="flex items-center gap-2 text-[var(--theme-text-muted)]">
            <TrendingUp size={14} className="text-gold" />
            <span className="text-[10px] font-black uppercase tracking-[0.18em]">
              {t('owner_today_sales') || 'Bugünkü satışlar'}
            </span>
          </div>
          <p className={`mt-2 text-4xl font-black tracking-tight ${lightMode ? 'text-zinc-900' : 'text-white'}`}>
            {money(data?.sales.revenue ?? 0)}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-[var(--theme-surface-soft)] p-2.5">
              <p className={`text-base font-black ${lightMode ? 'text-zinc-900' : 'text-white'}`}>
                {data?.sales.orders ?? 0}
              </p>
              <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--theme-text-muted)]">
                {t('owner_orders_count') || 'Sifariş'}
              </p>
            </div>
            <div className="rounded-xl bg-[var(--theme-surface-soft)] p-2.5">
              <p className={`text-base font-black ${lightMode ? 'text-zinc-900' : 'text-white'}`}>
                {money(data?.sales.avg_ticket ?? 0)}
              </p>
              <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--theme-text-muted)]">
                {t('owner_avg_ticket') || 'Orta çek'}
              </p>
            </div>
            <div className="rounded-xl bg-[var(--theme-surface-soft)] p-2.5">
              <p className={`text-base font-black ${lightMode ? 'text-zinc-900' : 'text-white'}`}>
                {data?.sales.items_sold ?? 0}
              </p>
              <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--theme-text-muted)]">
                {t('owner_items_sold') || 'Məhsul'}
              </p>
            </div>
          </div>
        </motion.section>

        {/* ── c. Hourly sales (10:00–23:00) ─────────────────────────────── */}
        <section className="mb-4">
          <SectionTitle
            icon={<Clock size={13} />}
            label={t('owner_hourly') || 'Saatlıq satış'}
            lightMode={lightMode}
          />
          <div className={`${cardClass} p-3`}>
            <div className="h-32 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.hourly ?? []} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <XAxis
                    dataKey="hour"
                    interval={1}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 9, fill: lightMode ? '#71717a' : 'rgba(255,255,255,0.45)' }}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(212,175,55,0.08)' }}
                    contentStyle={{
                      background: lightMode ? '#ffffff' : '#1C1C1E',
                      border: `1px solid ${lightMode ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)'}`,
                      borderRadius: 12,
                      fontSize: 11,
                      color: lightMode ? '#18181b' : '#f4f4f5',
                    }}
                    labelFormatter={(hour: any) => `${hour}:00`}
                    formatter={(value: any) => [money(Number(value)), t('owner_revenue') || 'Gəlir']}
                  />
                  <Bar dataKey="revenue" fill="var(--gold, #d4af37)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* ── d. "Now" card ─────────────────────────────────────────────── */}
        <section className="mb-4">
          <SectionTitle icon={<LayoutGrid size={13} />} label={t('owner_now') || 'İndi'} lightMode={lightMode} />
          <div className="grid grid-cols-2 gap-2">
            <MetricTile
              label={t('owner_open_tables') || 'Açıq masalar'}
              value={data?.now.open_tables ?? 0}
              icon={<Utensils size={14} className="text-emerald-400" />}
              tone="bg-emerald-500/10"
              lightMode={lightMode}
            />
            <MetricTile
              label={t('owner_kds_active') || 'Mətbəxdə'}
              value={data?.now.kds_active ?? 0}
              icon={<ChefHat size={14} className="text-orange-400" />}
              tone="bg-orange-500/10"
              lightMode={lightMode}
            />
            <MetricTile
              label={t('owner_delivery_active') || 'Çatdırılmada'}
              value={data?.now.delivery_in_progress ?? 0}
              icon={<Bike size={14} className="text-sky-400" />}
              tone="bg-sky-500/10"
              lightMode={lightMode}
            />
            <MetricTile
              label={t('owner_takeaway_waiting') || 'Təhvili gözləyir'}
              value={data?.now.takeaway_waiting ?? 0}
              icon={<PackageCheck size={14} className="text-amber-400" />}
              tone="bg-amber-500/10"
              lightMode={lightMode}
            />
          </div>
        </section>

        {/* ── e. Top 5 dishes ───────────────────────────────────────────── */}
        <section className="mb-4">
          <SectionTitle
            icon={<TrendingUp size={13} />}
            label={t('owner_top_dishes') || 'Günün top 5-i'}
            lightMode={lightMode}
          />
          <div className={`${cardClass} divide-y divide-[var(--theme-border)]`}>
            {(data?.top_dishes ?? []).length === 0 ? (
              <p className="p-4 text-center text-[12px] text-[var(--theme-text-muted)]">
                {t('owner_no_orders') || 'Sifariş yoxdur'}
              </p>
            ) : (
              (data?.top_dishes ?? []).map((dish, idx) => {
                const max = Math.max(1, data?.top_dishes?.[0]?.qty ?? 1);
                return (
                  <div key={`${dish.name}-${idx}`} className="flex items-center gap-3 p-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold/15 text-[11px] font-black text-gold">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-[13px] font-bold ${lightMode ? 'text-zinc-900' : 'text-white'}`}>
                        {dish.name}
                      </p>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--theme-surface-soft)]">
                        <div
                          className="h-full rounded-full bg-gold"
                          style={{ width: `${Math.round((dish.qty / max) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-[13px] font-black ${lightMode ? 'text-zinc-900' : 'text-white'}`}>
                        {dish.qty}
                      </p>
                      <p className="text-[10px] text-[var(--theme-text-muted)]">{money(dish.revenue)}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* ── f. Alerts ─────────────────────────────────────────────────── */}
        <section className="mb-4">
          <SectionTitle
            icon={<AlertTriangle size={13} />}
            label={t('owner_alerts') || 'Xəbərdarlıqlar'}
            lightMode={lightMode}
            right={
              hasAlerts ? (
                <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-black text-red-400">
                  {(alerts?.low_stock.length ?? 0) + (alerts?.overdue_kds.length ?? 0)}
                </span>
              ) : undefined
            }
          />
          <div className={`${cardClass} p-3`}>
            {!hasAlerts ? (
              <p className="py-2 text-center text-[12px] text-[var(--theme-text-muted)]">
                {t('owner_no_alerts') || 'Xəbərdarlıq yoxdur'}
              </p>
            ) : (
              <div className="space-y-3">
                {alerts && alerts.overdue_kds.length > 0 && (
                  <div>
                    <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-red-400">
                      <Clock size={12} />
                      {t('owner_overdue_kds') || 'Gecikən sifarişlər'} · {alerts.order_delay_minutes}{' '}
                      {t('owner_minutes_short') || 'dəq'}+
                    </p>
                    <div className="space-y-1.5">
                      {alerts.overdue_kds.slice(0, 5).map((row) => (
                        <div
                          key={row.id}
                          className="flex items-center justify-between gap-2 rounded-xl bg-red-500/10 px-2.5 py-2"
                        >
                          <span className="truncate text-[12px] font-bold text-red-400">
                            {row.order_number ? `#${row.order_number}` : `#${row.id.slice(-4).toUpperCase()}`}
                            {row.table_number != null && (
                              <span className="ml-1.5 text-[10px] font-medium text-[var(--theme-text-muted)]">
                                {row.table_number}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-[11px] font-black text-red-400">
                            {row.minutes} {t('owner_minutes_short') || 'dəq'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {alerts && alerts.low_stock.length > 0 && (
                  <div>
                    <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-400">
                      <AlertTriangle size={12} />
                      {t('owner_low_stock') || 'Az qalıb'}
                    </p>
                    <div className="space-y-1.5">
                      {alerts.low_stock.slice(0, 6).map((row) => (
                        <div
                          key={row.id}
                          className="flex items-center justify-between gap-2 rounded-xl bg-amber-500/10 px-2.5 py-2"
                        >
                          <span className="truncate text-[12px] font-bold text-amber-400">{row.name}</span>
                          <span className="shrink-0 text-[11px] font-black text-amber-400">
                            {row.current_stock} {row.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── g. Last 10 orders ─────────────────────────────────────────── */}
        <section className="mb-4">
          <SectionTitle
            icon={<ShoppingBag size={13} />}
            label={t('owner_last_orders') || 'Son sifarişlər'}
            lightMode={lightMode}
          />
          <div className={`${cardClass} divide-y divide-[var(--theme-border)]`}>
            {(data?.last_orders ?? []).length === 0 ? (
              <p className="p-4 text-center text-[12px] text-[var(--theme-text-muted)]">
                {t('owner_no_orders') || 'Sifariş yoxdur'}
              </p>
            ) : (
              (data?.last_orders ?? []).map((order) => {
                const { Icon, tint } = typeMeta(order.order_type);
                const ref = order.order_number
                  ? `#${order.order_number}`
                  : `#${order.id.slice(-4).toUpperCase()}`;
                return (
                  <div key={order.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--theme-surface-soft)]">
                      <Icon size={14} className={tint} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-[13px] font-bold ${lightMode ? 'text-zinc-900' : 'text-white'}`}>
                        {ref}
                        {order.table_number != null && (
                          <span className="ml-1.5 text-[10px] font-medium text-[var(--theme-text-muted)]">
                            {order.table_number}
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-[var(--theme-text-muted)]">
                        {new Date(order.created_at).toLocaleTimeString(localeTag(language), {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {' · '}
                        {t(ORDER_TYPE_LABEL_KEYS[order.order_type] || 'owner_type_dine_in')}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-[13px] font-black ${lightMode ? 'text-zinc-900' : 'text-white'}`}>
                        {money(order.total_amount)}
                      </p>
                      <p className="text-[10px] font-semibold text-[var(--theme-text-muted)]">
                        {statusLabel(order.status)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <p className="mt-2 text-center text-[10px] text-[var(--theme-text-muted)]">
          {t('owner_updated') || 'Yeniləndi'}:{' '}
          {data?.generated_at
            ? new Date(data.generated_at).toLocaleTimeString(localeTag(language), {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })
            : '—'}
        </p>
      </div>
    </div>
  );
}
