'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Armchair, Users, Clock, CheckCircle2, Utensils } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { supabase } from '@/lib/supabase';

function TableTimer({ startTime, status }: { startTime: number, status: string }) {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (status === 'empty' || !startTime) {
            setElapsed(0);
            return;
        }
        const update = () => setElapsed(Math.floor((Date.now() - startTime) / 60000));
        update();
        const interval = setInterval(update, 10000); // Update minute display every 10s
        return () => clearInterval(interval);
    }, [startTime, status]);

    if (status === 'empty' || elapsed <= 0) return null;
    return <span className="text-[8px] font-bold opacity-60">{elapsed}d</span>;
}

export default function LiveFloorSnapshot() {
  const { t } = useLanguage();
  const [tableCount, setTableCount] = useState(12);
  const [tables, setTables] = useState<TableStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFloorStatus = async () => {
      setLoading(true);
      try {
        // Get table count from settings
        const { data: settings, error: settingsError } = await supabase.from('settings').select('qr_table_count').maybeSingle();
        if (settingsError) {
          console.error("Error fetching settings:", settingsError);
        }
        const count = settings?.qr_table_count || 12;
        setTableCount(count);

        // Get active orders with table info
        const { data: orders, error: ordersError } = await supabase
          .from('orders')
          .select('table_number, status, kitchen_status, created_at, total_amount, is_draft')
          .in('status', ['new', 'confirmed'])
          .order('created_at', { ascending: false });

        if (ordersError) {
          console.error("Error fetching orders:", ordersError);
        }

        // Get table floor statuses (reserved backup)
        const { data: floorData } = await supabase.from('table_floors').select('table_number, status');
        const floorStatusMap: Record<number, string> = {};
        if (Array.isArray(floorData)) {
          floorData.forEach(f => { floorStatusMap[f.table_number] = f.status; });
        }

        // Build table status map
        const tableMap = new Map<number, TableStatus>();
        
        // Initialize all tables as empty
        for (let i = 1; i <= count; i++) {
          const dbStatus = floorStatusMap[i];
          tableMap.set(i, { tableNumber: i, status: dbStatus === 'reserved' ? 'reserved' : 'empty' });
        }

        // Update based on orders, only if orders is a valid array
        if (Array.isArray(orders)) {
            orders.forEach(order => {
                if (!order || !order.table_number) return;

                const tableNum = order.table_number;
                const existing = tableMap.get(tableNum);
                let status: TableStatus['status'] = 'occupied';
                
                if (order.is_draft || order.kitchen_status === 'reserved') {
                  status = 'reserved';
                } else if (order.status === 'new') {
                  status = 'new';
                } else if (order.kitchen_status === 'ready') {
                  status = 'payment_pending';
                } else {
                  status = 'order_placed';
                }

                const startTime = order.created_at ? new Date(order.created_at).getTime() : 0;

                tableMap.set(tableNum, {
                tableNumber: tableNum,
                status,
                orderCount: (existing?.orderCount || 0) + 1,
                startTime,
                } as any);
            });
        }

        setTables(Array.from(tableMap.values()));
      } catch (error) {
        console.error("An unexpected error occurred in fetchFloorStatus:", error);
        // In case of a major error, set a default safe state
        const defaultTables: TableStatus[] = [];
        for (let i = 1; i <= tableCount; i++) {
          defaultTables.push({ tableNumber: i, status: 'empty' } as any);
        }
        setTables(defaultTables);
      } finally {
        setLoading(false);
      }
    };

    fetchFloorStatus();
    const interval = setInterval(fetchFloorStatus, 15000); // 15s refresh
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: TableStatus['status']) => {
    switch (status) {
      case 'empty': return 'bg-white/[0.03] text-white/30';
      case 'reserved': return 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30';
      case 'new': return 'bg-emerald-500/10 text-emerald-400';
      case 'order_placed': return 'bg-amber-500/10 text-amber-400';
      case 'payment_pending': return 'bg-blue-500/10 text-blue-400';
      case 'occupied': return 'bg-white/[0.06] text-white/50';
      default: return 'bg-white/[0.03] text-white/30';
    }
  };

  const getStatusIcon = (status: TableStatus['status']) => {
    switch (status) {
      case 'empty': return <Armchair size={14} />;
      case 'new': return <Users size={14} />;
      case 'order_placed': return <Utensils size={14} />;
      case 'payment_pending': return <CheckCircle2 size={14} />;
      case 'occupied': return <Clock size={14} />;
      default: return <Armchair size={14} />;
    }
  };

  const getStatusLabel = (status: TableStatus['status']) => {
    switch (status) {
      case 'empty': return t('empty');
      case 'reserved': return 'Bron edilib';
      case 'new': return t('new_guests');
      case 'order_placed': return t('cooking');
      case 'payment_pending': return t('payment_pending');
      case 'occupied': return t('occupied');
      default: return t('empty');
    }
  };

  const occupiedCount = tables.filter(t => t.status !== 'empty').length;
  const newCount = tables.filter(t => t.status === 'new').length;
  const cookingCount = tables.filter(t => t.status === 'order_placed').length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-3xl bg-[var(--theme-surface)] p-6 shadow-[0_12px_40px_rgba(0,0,0,0.08)] border border-[var(--theme-border)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[var(--theme-nested)] flex items-center justify-center shadow-[0_8px_24px_rgba(0,122,255,0.10)]">
            <Armchair size={20} className="text-gold" />
          </div>
          <div>
            <h3 className="text-[var(--theme-text)] font-semibold">{t('live_floor')}</h3>
            <p className="text-[var(--theme-text-muted)] text-xs">{t('real_time_tables')}</p>
          </div>
        </div>
        
        {/* Legend */}
        <div className="hidden sm:flex items-center gap-3 text-[10px] text-[var(--theme-text-muted)]">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(0,208,132,0.12)] animate-pulse" />
            {t('new')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.12)]" />
            {t('cooking')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_0_4px_rgba(0,122,255,0.12)]" />
            DOLU
          </span>
        </div>
      </div>

      {/* Compact Stats Row */}
      <div className="flex gap-3 mb-6">
        <div className="flex-1 p-4 rounded-2xl bg-[var(--theme-nested)] border border-[var(--theme-border)] border-l-[6px] border-l-blue-500">
          <p className="text-xl font-black text-[var(--theme-text)]">{occupiedCount}<span className="text-[var(--theme-text-muted)] text-sm font-bold">/{tableCount}</span></p>
          <p className="text-[10px] text-[var(--theme-text-muted)] font-black uppercase tracking-widest mt-1">{t('occupied' as any)}</p>
        </div>
        <div className="flex-1 p-4 rounded-2xl bg-[var(--theme-nested)] border border-[var(--theme-border)] border-l-[6px] border-l-emerald-500">
          <p className="text-xl font-black text-emerald-500">{newCount}</p>
          <p className="text-[10px] text-emerald-500 font-black uppercase tracking-widest mt-1">{t('new_arrivals' as any)}</p>
        </div>
        <div className="flex-1 p-4 rounded-2xl bg-[var(--theme-nested)] border border-[var(--theme-border)] border-l-[6px] border-l-amber-500">
          <p className="text-xl font-black text-amber-500">{cookingCount}</p>
          <p className="text-[10px] text-amber-500 font-black uppercase tracking-widest mt-1">{t('in_kitchen' as any)}</p>
        </div>
      </div>

      {/* Table Grid */}
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
        {tables.map((table) => (
          <motion.div
            key={table.tableNumber}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`relative flex flex-col items-center justify-center rounded-2xl p-3 transition-all ${getStatusColor(table.status)}`}
          >
            <div className="flex items-center gap-1 mb-1">
              {getStatusIcon(table.status)}
              <span className="text-[9px] font-black tabular-nums">{table.tableNumber}</span>
            </div>
            <TableTimer startTime={(table as any).startTime} status={table.status} />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
