'use client';

interface BadgeConfig {
  label: string;
  dot: string;
  text: string;
  bg: string;
  border: string;
  bar: string;
}

const STATUS_META: Record<string, BadgeConfig> = {
  out_of_stock: {
    label: 'Bitib', dot: 'bg-red-500', text: 'text-red-400',
    bg: 'bg-red-500/10', border: 'border-red-500/25', bar: 'bg-red-500',
  },
  critical: {
    label: 'Kritik', dot: 'bg-amber-400', text: 'text-amber-400',
    bg: 'bg-amber-500/10', border: 'border-amber-500/25', bar: 'bg-amber-400',
  },
  normal: {
    label: 'Normal', dot: 'bg-emerald-400', text: 'text-emerald-400',
    bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', bar: 'bg-emerald-400',
  },
  in_stock: {
    label: 'Stokda var', dot: 'bg-emerald-400', text: 'text-emerald-400',
    bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', bar: 'bg-emerald-400',
  },
  low: {
    label: 'Aşağı', dot: 'bg-blue-400', text: 'text-blue-400',
    bg: 'bg-blue-500/10', border: 'border-blue-500/25', bar: 'bg-blue-400',
  },
  medium: {
    label: 'Orta', dot: 'bg-yellow-400', text: 'text-yellow-400',
    bg: 'bg-yellow-500/10', border: 'border-yellow-500/25', bar: 'bg-yellow-400',
  },
  high: {
    label: 'Yüksək', dot: 'bg-orange-400', text: 'text-orange-400',
    bg: 'bg-orange-500/10', border: 'border-orange-500/25', bar: 'bg-orange-400',
  },
};

export function getStatusMeta(status: string): BadgeConfig {
  return STATUS_META[status] || STATUS_META.normal;
}

export function StockStatusDot({ status, size = 'md' }: { status: string; size?: 'sm' | 'md' | 'lg' }) {
  const s = getStatusMeta(status);
  const sz = size === 'sm' ? 'w-1.5 h-1.5' : size === 'lg' ? 'w-3 h-3' : 'w-2 h-2';
  return <span className={`inline-block rounded-full ${s.dot} ${sz}`} />;
}

export function StockStatusBadge({ status, size = 'sm' }: { status: string; size?: 'sm' | 'md' }) {
  const s = getStatusMeta(status);
  const px = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2.5 py-1';
  const text = size === 'sm' ? 'text-[10px]' : 'text-xs';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg font-bold ${s.bg} ${s.text} ${s.border} border ${px} ${text}`}>
      <span className={`inline-block rounded-full ${s.dot} ${size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2'}`} />
      {s.label}
    </span>
  );
}

export function StockStatusBar({ status, pct }: { status: string; pct: number }) {
  const s = getStatusMeta(status);
  return (
    <div className="w-full h-1 rounded-full bg-white/[0.03] overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-700 ease-out ${s.bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}
