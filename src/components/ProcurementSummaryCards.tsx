'use client';

interface CardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}

function StatCard({ icon, label, value, sub, accent }: CardProps) {
  return (
    <div
      className="rounded-2xl border p-4"
      style={{ borderColor: 'var(--theme-border, rgba(255,255,255,0.06))' }}
    >
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
          {icon}
        </div>
        <p className="text-[11px] text-white/40 uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
      {sub && <p className={`text-[10px] mt-0.5 ${accent || 'text-white/20'}`}>{sub}</p>}
    </div>
  );
}

interface SummaryCardItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}

export function SummaryCards({ items }: { items: SummaryCardItem[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map(({ key, ...item }) => (
        <StatCard key={key} {...item} />
      ))}
    </div>
  );
}
