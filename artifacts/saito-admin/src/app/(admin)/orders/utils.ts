import type { Order } from './types';

export const DEFAULT_TABLE_COUNT = 30;
export const CACHE_KEY = 'saito_orders_cache';
export const SETTINGS_CACHE_KEY = 'saito_settings_cache';

export const getStatusConfig = (t: (k: any) => string): Record<Order['status'], { label: string; color: string; border: string }> => ({
  new:       { label: t('status_new'),       color: 'text-yellow-400 bg-yellow-400/10',  border: 'border-yellow-400/30' },
  confirmed: { label: t('status_confirmed'), color: 'text-emerald-400 bg-emerald-400/10', border: 'border-emerald-400/30' },
  paid:      { label: t('status_paid'),      color: 'text-green-400  bg-green-400/10',   border: 'border-green-400/30'  },
});

export const getKitchenStatusConfig = (kitchenStatus: Order['kitchen_status'], ageMin: number, t?: (k: string) => string) => {
  const label = (key: string, fallback: string) => t ? t(key) : fallback;
  switch (kitchenStatus) {
    case 'cooking':
    case 'preparing':
      return { label: label('badge_preparing', 'Hazırlanır'), color: 'text-[var(--theme-blue)]',    bg: 'bg-[var(--theme-blue-soft)]',  border: 'border-[var(--theme-blue-border)]',   glow: 'shadow-[0_0_12px_var(--theme-blue-border)]',  flash: false };
    case 'ready':
      return { label: label('badge_ready', 'Hazırdır'),   color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', glow: 'shadow-[0_0_20px_rgba(16,185,129,0.5)]', flash: true  };
    case 'pending':
    default:
      return {
        label:  label('badge_waiting', 'Gözləyir'),
        color:  ageMin > 30 ? 'text-red-400'    : 'text-amber-400',
        bg:     ageMin > 30 ? 'bg-red-500/15'   : 'bg-amber-500/15',
        border: ageMin > 30 ? 'border-red-500/30' : 'border-amber-500/30',
        glow:   ageMin > 30 ? 'shadow-[0_0_12px_rgba(239,68,68,0.3)]' : 'shadow-[0_0_12px_rgba(245,158,11,0.2)]',
        flash:  false,
      };
  }
};

export function timeAgo(dateStr: string, t: (k: any) => string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)    return `${diff} ${t('seconds_ago')}`;
  if (diff < 3600)  return `${Math.floor(diff / 60)} ${t('minutes_ago')}`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ${t('hours_ago')}`;
  return `${Math.floor(diff / 86400)} ${t('days_ago')}`;
}

export function getOrderAgeMinutes(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
}

export function getProgressProps(minutes: number, cap = 30, _kitchenStatus?: Order['kitchen_status']): { pct: number; from: string; to: string; glow: string } {
  const pct = Math.min(100, (minutes / cap) * 100);
  const s = cap / 6; // each stage = 1/6 of cap
  if (minutes < s)     return { pct, from: '#10b981', to: '#34d399', glow: '0 0 8px rgba(16,185,129,0.7)' };
  if (minutes < s * 2) return { pct, from: '#14b8a6', to: '#2dd4bf', glow: '0 0 8px rgba(20,184,166,0.7)' };
  if (minutes < s * 3) return { pct, from: '#2563eb', to: '#3b82f6', glow: '0 0 8px rgba(37,99,235,0.6)' };
  if (minutes < s * 4) return { pct, from: '#eab308', to: '#fbbf24', glow: '0 0 8px rgba(234,179,8,0.7)'  };
  if (minutes < s * 5) return { pct, from: '#f97316', to: '#fb923c', glow: '0 0 8px rgba(249,115,22,0.7)' };
  return                      { pct, from: '#ef4444', to: '#f87171', glow: '0 0 10px rgba(239,68,68,0.9)' };
}
