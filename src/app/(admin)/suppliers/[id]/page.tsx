'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Truck, PackageCheck, AlertTriangle, TrendingUp,
  TrendingDown, Clock, DollarSign, BarChart3, X, ChevronRight,
  Loader2, ShoppingCart,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import type { Supplier, PurchaseOrderStatus } from '@/types/inventory';
import { PageTransition } from '@/components/PageTransition';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft:    { label: 'Qaralama',  cls: 'text-amber-400/80 bg-amber-500/10 border-amber-500/20' },
  sent:     { label: 'Göndərildi', cls: 'text-blue-400 bg-blue-500/15 border-blue-500/30' },
  partial:  { label: 'Qismən',    cls: 'text-violet-400 bg-violet-500/15 border-violet-500/30' },
  received: { label: 'Alındı',    cls: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' },
  cancelled:{ label: 'Ləğv edildi', cls: 'text-red-400/80 bg-red-500/10 border-red-500/20' },
};

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('az-AZ', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function fmtCurrency(n: number) {
  return Number(n).toLocaleString('az-AZ', { minimumFractionDigits: 2 });
}

function ScoreGauge({ value, label, subtitle, color }: { value: number | null; label: string; subtitle?: string; color?: string }) {
  if (value === null) return null;
  const hue = value >= 80 ? '142' : value >= 50 ? '38' : '0';
  return (
    <div className="flex flex-col items-center gap-1.5 p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="relative w-14 h-14 flex items-center justify-center">
        <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2.5" />
          <circle cx="18" cy="18" r="15" fill="none" stroke={`hsl(${hue},70%,${value >= 50 ? 45 : 55}%)`}
            strokeWidth="2.5" strokeDasharray={`${value * 0.942}, 100`} strokeLinecap="round" />
        </svg>
        <span className="absolute text-sm font-black tabular-nums">{value}<span className="text-[9px] font-medium">%</span></span>
      </div>
      <span className="text-[10px] font-bold text-[var(--theme-text-secondary)] text-center leading-tight">{label}</span>
      {subtitle && <span className="text-[8px] text-[var(--theme-text-muted)]">{subtitle}</span>}
    </div>
  );
}

export default function SupplierDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useLanguage();
  const id = params.id as string;

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [supRes, statsRes] = await Promise.all([
          fetch(`/api/suppliers/${id}`),
          fetch(`/api/suppliers/${id}/stats`),
        ]);
        if (supRes.ok) setSupplier(await supRes.json());
        if (statsRes.ok) setStats(await statsRes.json());
      } catch {
        toast.error('Məlumat yüklənərkən xəta');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const scoreItems = useMemo(() => [
    { value: stats?.onTimeRate, label: 'Vaxtında\nçatdırılma', subtitle: `${stats?.receivedOrders || 0}/${stats?.totalOrders || 0} sifariş`, color: 'emerald' },
    { value: stats?.priceStability, label: 'Qiymət\nstabilliyi', subtitle: 'Təchizat sabitliyi', color: 'blue' },
    { value: stats?.discrepancyRate !== null ? Math.max(0, 100 - stats.discrepancyRate) : null, label: 'Faktura\nuyğunluğu', subtitle: `${stats?.partialOrders || 0} qismən`, color: 'violet' },
    { value: stats?.delayRate !== null ? Math.max(0, 100 - stats.delayRate) : null, label: 'Gecikmə\nreytinqi', subtitle: `${stats?.cancelledOrders || 0} ləğv`, color: 'amber' },
  ], [stats]);

  if (loading) {
    return (
      <PageTransition className="min-h-screen bg-[var(--theme-bg)] flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-white/15" />
      </PageTransition>
    );
  }

  if (!supplier) {
    return (
      <PageTransition className="min-h-screen bg-[var(--theme-bg)] flex items-center justify-center">
        <p className="text-[var(--theme-text-muted)]">Təchizatçı tapılmadı</p>
      </PageTransition>
    );
  }

  const score = stats?.compositeScore;

  return (
    <PageTransition className="min-h-screen bg-[var(--theme-bg)] text-[var(--theme-text)] pb-20">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-48 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full opacity-[0.04]"
          style={{ background: 'radial-gradient(ellipse,#D4AF37,transparent 70%)' }} />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 space-y-6">

        {/* Back + header */}
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => router.push('/suppliers')}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:bg-white/[0.06] text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]">
            <ArrowLeft size={17} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#1e1600,#140f00)', border: '1px solid rgba(212,175,55,0.2)' }}>
              <Truck size={18} className="text-[#D4AF37]" />
            </div>
            <div>
              <h1 className="text-xl font-bold leading-tight">{supplier.name}</h1>
              <p className="text-[11px] text-[var(--theme-text-muted)] uppercase tracking-wider mt-0.5">
                {supplier.status === 'active' ? 'Aktiv təchizatçı' : 'Deaktiv'}
              </p>
            </div>
          </div>
          {score !== null && (
            <div className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl"
              style={{
                background: score >= 80 ? 'rgba(16,185,129,0.08)' : score >= 50 ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)',
                border: `1px solid ${score >= 80 ? 'rgba(16,185,129,0.2)' : score >= 50 ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)'}`,
              }}>
              <span className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: score >= 80 ? '#34d399' : score >= 50 ? '#fbbf24' : '#f87171' }}>
                Ümumi Score
              </span>
              <span className="text-lg font-black tabular-nums"
                style={{ color: score >= 80 ? '#34d399' : score >= 50 ? '#fbbf24' : '#f87171' }}>
                {score}
              </span>
            </div>
          )}
        </div>

        {/* Contact info */}
        {(supplier.contact_person || supplier.phone || supplier.email || supplier.address) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {supplier.contact_person && (
              <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-[9px] uppercase tracking-wider text-[var(--theme-text-muted)] mb-1">Əlaqə şəxs</p>
                <p className="text-sm font-medium">{supplier.contact_person}</p>
              </div>
            )}
            {supplier.phone && (
              <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-[9px] uppercase tracking-wider text-[var(--theme-text-muted)] mb-1">Telefon</p>
                <p className="text-sm font-medium">{supplier.phone}</p>
              </div>
            )}
            {supplier.email && (
              <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-[9px] uppercase tracking-wider text-[var(--theme-text-muted)] mb-1">Email</p>
                <p className="text-sm font-medium truncate">{supplier.email}</p>
              </div>
            )}
            {supplier.address && (
              <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-[9px] uppercase tracking-wider text-[var(--theme-text-muted)] mb-1">Ünvan</p>
                <p className="text-sm font-medium truncate">{supplier.address}</p>
              </div>
            )}
          </div>
        )}

        {/* Score grid */}
        <div>
          <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
            <BarChart3 size={14} className="text-[var(--theme-text-muted)]" />
            Təchizatçı Performansı
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {scoreItems.map((item, i) => (
              <ScoreGauge key={i} {...item} />
            ))}
          </div>
          {stats?.priceHistory && stats.priceHistory.length > 0 && (
            <div className="mt-4 p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--theme-text-muted)] mb-3">Son Qiymətlər</h3>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {stats.priceHistory.slice(-10).reverse().map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 flex-shrink-0" />
                      <span className="truncate text-[var(--theme-text-secondary)]">{p.product}</span>
                    </div>
                    <span className="tabular-nums font-medium">₼{fmtCurrency(p.cost)}/{p.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Recent POs */}
        {stats?.recentOrders && stats.recentOrders.length > 0 && (
          <div>
            <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
              <ShoppingCart size={14} className="text-[var(--theme-text-muted)]" />
              Son Sifarişlər
            </h2>
            <div className="space-y-1">
              {stats.recentOrders.map((o: any) => (
                <div key={o.id}
                  className="flex items-center justify-between p-3 rounded-xl transition-colors hover:bg-white/[0.02] cursor-pointer"
                  style={{ border: '1px solid rgba(255,255,255,0.05)' }}
                  onClick={() => router.push('/purchase-orders')}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div>
                      <p className="text-sm font-semibold">{o.order_number}</p>
                      <p className="text-[10px] text-[var(--theme-text-muted)] mt-0.5">{fmtDate(o.ordered_at)} · {o.items_count} məhsul</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold border ${STATUS_META[o.status]?.cls || ''}`}>
                      {STATUS_META[o.status]?.label || o.status}
                    </span>
                    <span className="text-sm font-bold tabular-nums">₼{fmtCurrency(o.total_amount)}</span>
                    <ChevronRight size={14} className="text-[var(--theme-text-muted)]" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {supplier.notes && (
          <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--theme-text-muted)] mb-2">Qeydlər</p>
            <p className="text-sm text-[var(--theme-text-secondary)]">{supplier.notes}</p>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
