'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Armchair, Users, Clock, CheckCircle2, Utensils } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { supabase } from '@/lib/supabase';

interface TableStatus {
  tableNumber: number;
  status: 'empty' | 'occupied' | 'new' | 'order_placed' | 'payment_pending';
  orderCount?: number;
  waitTime?: number;
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
        const { data: settings, error: settingsError } = await supabase.from('settings').select('qr_table_count').maybeSingle();
        const count = settings?.qr_table_count || 12;
        setTableCount(count);

        const { data: orders, error: ordersError } = await supabase
          .from('orders')
          .select('table_number, status, kitchen_status, created_at, total_amount')
          .in('status', ['new', 'confirmed'])
          .order('created_at', { ascending: false });

        const tableMap = new Map<number, TableStatus>();
        for (let i = 1; i <= count; i++) {
          tableMap.set(i, { tableNumber: i, status: 'empty' });
        }

        if (Array.isArray(orders)) {
            orders.forEach(order => {
                if (!order || !order.table_number) return;
                const tableNum = order.table_number;
                const existing = tableMap.get(tableNum);
                let status: TableStatus['status'] = 'occupied';
                if (order.status === 'new') status = 'new';
                else if (order.kitchen_status === 'ready') status = 'payment_pending';
                else status = 'order_placed';

                const waitTime = order.created_at ? Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000) : 0;
                tableMap.set(tableNum, {
                  tableNumber: tableNum,
                  status,
                  orderCount: (existing?.orderCount || 0) + 1,
                  waitTime,
                });
            });
        }
        setTables(Array.from(tableMap.values()));
      } catch (error) {
        console.error("An unexpected error occurred in fetchFloorStatus:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchFloorStatus();
    const interval = setInterval(fetchFloorStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const occupiedCount = tables.filter(t => t.status !== 'empty').length;
  const newCount = tables.filter(t => t.status === 'new').length;
  const cookingCount = tables.filter(t => t.status === 'order_placed').length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-[32px] bg-[var(--theme-surface)] p-8 shadow-[var(--theme-shadow)] border border-[var(--theme-border)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-[18px] bg-[var(--theme-bg)] flex items-center justify-center border border-[var(--theme-border)] shadow-sm text-gold">
            <Armchair size={24} />
          </div>
          <div>
            <h3 className="text-lg font-black text-[var(--theme-text)] uppercase tracking-tight">{t('live_floor' as any)}</h3>
            <p className="text-[var(--theme-text-muted)] text-[11px] font-bold uppercase tracking-widest">{t('real_time_tables' as any)}</p>
          </div>
        </div>
        
        <div className="hidden sm:flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-[var(--theme-text-muted)]">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.1)]" />
            {t('new' as any)}
          </span>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.1)]" />
            {t('cooking' as any)}
          </span>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_0_4px_rgba(0,122,255,0.1)]" />
            DOLU
          </span>
        </div>
      </div>

      {/* Summary Grid */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: t('occupied' as any), value: occupiedCount, total: `/${tableCount}`, color: 'text-[var(--theme-text)]' },
          { label: t('new_arrivals' as any), value: newCount, color: 'text-emerald-500' },
          { label: t('in_kitchen' as any), value: cookingCount, color: 'text-amber-500' }
        ].map((item, idx) => (
          <div key={idx} className="p-6 rounded-[24px] bg-[var(--theme-bg)] border border-[var(--theme-border)] flex flex-col justify-between">
            <div>
               <p className="text-[10px] font-black text-[var(--theme-text-muted)] uppercase tracking-widest mb-1">{item.label}</p>
               <p className={`text-4xl font-black ${item.color}`}>
                  {item.value}
                  {item.total && <span className="text-sm font-bold text-[var(--theme-text-muted)] ml-1">{item.total}</span>}
               </p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
