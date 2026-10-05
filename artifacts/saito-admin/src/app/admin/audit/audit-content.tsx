'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, ShoppingBag, Download } from '@/components/ui/saito-icons';
import { toast } from '@/lib/toast';
// 13j: design system (one visual language across the inventory module)
import { Btn, Chip, DataTable, SearchInput, SectionHead, Seg, Stat, fmtDate, fmtClock } from '../stock/stock-ui';

interface AuditEntry {
  id: string;
  created_at: string;
  type: 'stock_in' | 'waste' | 'adjustment' | 'order_consumption';
  quantity: number;
  cost_per_unit: number | null;
  reason: string | null;
  order_id: string | null;
  ingredient_name: string;
  ingredient_unit: string;
  product_name: string | null;
  table_number: string | null;
}

const TYPE_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  order_consumption: { label: 'Sifariş', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  stock_in: { label: 'Stoka Giriş', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  waste: { label: 'İtki', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  adjustment: { label: 'Tənzimləmə', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
};
const TYPE_TONE: Record<string, 'ok' | 'warn' | 'crit' | 'info' | 'neutral'> = {
  order_consumption: 'info', stock_in: 'ok', waste: 'crit', adjustment: 'warn',
};

const FILTER_TABS = [
  { key: 'all', label: 'Hamısı' },
  { key: 'order_consumption', label: 'Sifariş Sərfiyyatı' },
  { key: 'waste', label: 'İtki' },
  { key: 'adjustment', label: 'Tənzimləmə' },
  { key: 'stock_in', label: 'Stoka Giriş' },
];

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'all'>('week');

  const fetchLogs = useCallback(async (background = false) => {
    // Only show global loading on initial mount
    if (!background && entries.length === 0) setLoading(true);
    
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

      let dateFilter: string;
      if (dateRange === 'today') dateFilter = todayStart.toISOString();
      else if (dateRange === 'week') dateFilter = sevenDaysAgo;
      else if (dateRange === 'month') dateFilter = thirtyDaysAgo;
      else dateFilter = new Date(0).toISOString();

       // 13a (E2E r26 S0 root cause): the client read of inventory_logs
       // returned 0 rows — the RLS policy gates manual (non-order) logs on
       // is_superadmin() = current_setting('app.current_role'), which the
       // pooler session does NOT set for user JWTs → the audit feed was
       // silently empty forever. The service-role route serves the same rows
       // and folds in the ingredient + order context in ONE call.
       const res = await fetch(`/api/inventory/logs?since=${encodeURIComponent(dateFilter)}&limit=500`);
       if (!res.ok) throw new Error(`HTTP ${res.status}`);
       const logs = (await res.json()) as any[];
       if (!logs) { setEntries([]); return; }

       const mapped: AuditEntry[] = logs.map(log => ({
         id: log.id,
         created_at: log.created_at,
         type: log.type,
         quantity: log.quantity,
         cost_per_unit: log.cost_per_unit,
         reason: log.reason,
         order_id: log.order_id,
         ingredient_name: log.ingredient_name || 'Naməlum',
         ingredient_unit: log.ingredient_unit || '',
         product_name: log.order_id && (log.product_names?.length ?? 0) > 0 ? log.product_names.join(', ') : null,
         table_number: log.order_id ? (log.table_number ?? null) : null,
       }));

      setEntries(mapped);
    } catch (e) {
      console.error('[Audit] fetch error:', e);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(() => fetchLogs(true), 30000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return entries.filter(e => {
      if (typeFilter !== 'all' && e.type !== typeFilter) return false;
      if (q && !e.ingredient_name.toLowerCase().includes(q) && !(e.reason || '').toLowerCase().includes(q) && !(e.product_name || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entries, typeFilter, search]);

  const summary = useMemo(() => {
    let totalDeductions = 0, totalWaste = 0, totalStockIn = 0, totalAdjustments = 0;
    for (const e of entries) {
      const q = Math.abs(e.quantity);
      if (e.type === 'order_consumption') totalDeductions += q;
      else if (e.type === 'waste') totalWaste += q;
      else if (e.type === 'stock_in') totalStockIn += q;
      else if (e.type === 'adjustment') totalAdjustments += q;
    }
    return { totalDeductions, totalWaste, totalStockIn, totalAdjustments, total: entries.length };
  }, [entries]);

  const exportToCSV = () => {
    if (filtered.length === 0) return;
    
    const headers = ['Tarix', 'Növ', 'Xammal', 'Miqdar', 'Vahid', 'Məhsul', 'Masa', 'Səbəb'];
    const rows = filtered.map(e => [
      new Date(e.created_at).toLocaleString('az-AZ'),
      TYPE_LABELS[e.type]?.label || e.type,
      e.ingredient_name,
      e.quantity.toFixed(2),
      e.ingredient_unit,
      e.product_name || '',
      e.table_number || '',
      e.reason || ''
    ]);

    const csvContent = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `saito_audit_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Audit hesabatı endirildi');
  };

  if (loading && entries.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-[var(--theme-text-muted)]" />
      </div>
    );
  }

  // 13j: design system — Stat + Seg + DataTable (one visual language).
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <SectionHead overline="Audit" title="Stok dəyişikliklərinin tam tarixçəsi" />
        <Btn variant="ghost" icon={Download} onClick={exportToCSV} disabled={filtered.length === 0}>Export</Btn>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Sifariş Sərfiyyatı" value={summary.totalDeductions.toFixed(1)} sub="vahid" tone="blue" />
        <Stat label="İtki" value={summary.totalWaste.toFixed(1)} sub="vahid" tone="red" />
        <Stat label="Tənzimləmə" value={summary.totalAdjustments.toFixed(1)} sub="vahid" tone="amber" />
        <Stat label="Stoka Giriş" value={summary.totalStockIn.toFixed(1)} sub="vahid" tone="emerald" />
      </div>

      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Xammal, səbəb və ya məhsul axtar..." className="flex-1 min-w-56" />
        <div className="flex items-center gap-2 flex-wrap">
          <Seg
            options={FILTER_TABS.map(t => ({ id: t.key as string, label: t.label }))}
            value={typeFilter}
            onChange={setTypeFilter}
          />
          <Seg
            options={[{ id: 'today', label: 'Bugün' }, { id: 'week', label: 'Həftə' }, { id: 'month', label: 'Ay' }, { id: 'all', label: 'Hamısı' }]}
            value={dateRange}
            onChange={v => setDateRange(v as typeof dateRange)}
          />
        </div>
      </div>

      <DataTable
        rows={filtered.map(e => ({ ...e, __actions: null as unknown as React.ReactNode }))}
        rowKey={r => r.id}
        actionsWidth={0}
        cols={[
          {
            key: 'date', label: 'Tarix', width: '110px',
            render: r => {
              return (
                <div className="text-[11px] text-[var(--theme-text-muted)] tabular-nums leading-tight">
                  <p className="font-semibold text-[var(--theme-text-secondary)]">{fmtDate(r.created_at, false)}</p>
                  <p>{fmtClock(r.created_at)}</p>
                </div>
              );
            },
          },
          {
            key: 'type', label: 'Növ', width: '150px',
            render: r => <Chip tone={TYPE_TONE[r.type] || 'neutral'} dot={false}>{TYPE_LABELS[r.type]?.label || r.type}</Chip>,
          },
          {
            key: 'item', label: 'Maddə', width: '1.6fr',
            render: r => (
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-[var(--theme-text)] truncate">{r.ingredient_name}</p>
                {r.type === 'order_consumption' && r.order_id && (
                  <p className="text-[10px] text-[var(--theme-text-muted)] truncate">
                    Sifariş #{r.order_id.slice(0, 8)}{r.table_number ? ` · Masa ${r.table_number}` : ''}{r.product_name ? ` · ${r.product_name}` : ''}
                  </p>
                )}
                {r.reason && r.type !== 'order_consumption' && (
                  <p className="text-[10px] text-[var(--theme-text-muted)] truncate">{r.reason}</p>
                )}
              </div>
            ),
          },
          {
            key: 'qty', label: 'Miqdar', width: '130px', align: 'right',
            render: r => {
              const sign = r.type === 'stock_in' || (r.type === 'adjustment' && r.quantity > 0) ? '+' : '−';
              const tone = r.type === 'stock_in' ? 'text-emerald-500'
                : r.type === 'waste' ? 'text-red-500'
                : r.type === 'order_consumption' ? 'text-[var(--theme-text)]'
                : r.quantity > 0 ? 'text-emerald-500' : 'text-red-500';
              return (
                <span className={`text-[13px] font-black tabular-nums ${tone}`}>
                  {sign}{Math.abs(r.quantity).toFixed(2)}{' '}
                  <span className="text-[9px] font-bold text-[var(--theme-text-muted)]">{r.ingredient_unit}</span>
                </span>
              );
            },
          },
        ]}
        empty={
          <div className="py-12 text-center">
            <ShoppingBag size={32} className="mx-auto mb-3 opacity-25 text-[var(--theme-text-muted)]" />
            <p className="text-sm font-medium text-[var(--theme-text-secondary)]">Heç bir əməliyyat tapılmadı</p>
            <p className="text-xs text-[var(--theme-text-muted)] mt-1">
              {search || typeFilter !== 'all' ? 'Cari filtrlərə uyğun nəticə yoxdur.' : 'Hələ ki, heç bir stok hərəkəti qeydə alınmayıb.'}
            </p>
          </div>
        }
      />
    </div>
  );
}
