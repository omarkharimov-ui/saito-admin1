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
      // Get table count from settings
      const { data: settings } = await supabase.from('settings').select('qr_table_count').maybeSingle();
      const count = settings?.qr_table_count || 12;
      setTableCount(count);

      // Get active orders with table info
      const { data: orders } = await supabase
        .from('orders')
        .select('table_number, status, kitchen_status, created_at, total_amount')
        .in('status', ['new', 'confirmed'])
        .order('created_at', { ascending: false });

      // Build table status map
      const tableMap = new Map<number, TableStatus>();
      
      // Initialize all tables as empty
      for (let i = 1; i <= count; i++) {
        tableMap.set(i, { tableNumber: i, status: 'empty' });
      }

      // Update based on orders
      orders?.forEach(order => {
        const tableNum = order.table_number;
        if (!tableNum) return;

        const existing = tableMap.get(tableNum);
        let status: TableStatus['status'] = 'occupied';
        
        if (order.status === 'new') {
          status = 'new';
        } else if (order.kitchen_status === 'ready') {
          status = 'payment_pending';
        } else {
          status = 'order_placed';
        }

        const waitTime = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000);

        tableMap.set(tableNum, {
          tableNumber: tableNum,
          status,
          orderCount: (existing?.orderCount || 0) + 1,
          waitTime,
        });
      });

      setTables(Array.from(tableMap.values()));
      setLoading(false);
    };

    fetchFloorStatus();
    const interval = setInterval(fetchFloorStatus, 15000); // 15s refresh
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: TableStatus['status']) => {
    switch (status) {
      case 'empty': return 'bg-white/[0.03] text-white/30';
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
      className="relative overflow-hidden rounded-[34px] border border-white/[0.10] bg-[linear-gradient(180deg,rgba(255,255,255,0.075),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.16)] backdrop-blur-2xl ring-1 ring-white/[0.03]"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center shadow-[0_10px_28px_rgba(0,0,0,0.12)] backdrop-blur-xl">
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

      {/* Compact Stats Row - No Table Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] shadow-[0_10px_28px_rgba(0,0,0,0.08)] backdrop-blur-xl transition-transform duration-300 hover:-translate-y-0.5">
          <p className="text-xl font-bold text-[var(--theme-text)]">{occupiedCount}<span className="text-[var(--theme-text-muted)] text-sm">/{tableCount}</span></p>
          <p className="text-[9px] text-[var(--theme-text-muted)] uppercase tracking-wider mt-0.5">{t('occupied')}</p>
        </div>
        <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] shadow-[0_10px_28px_rgba(0,0,0,0.08)] backdrop-blur-xl transition-transform duration-300 hover:-translate-y-0.5">
          <p className="text-xl font-bold text-emerald-500">{newCount}</p>
          <p className="text-[9px] text-emerald-500 uppercase tracking-wider mt-0.5">{t('new_arrivals')}</p>
        </div>
        <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] shadow-[0_10px_28px_rgba(0,0,0,0.08)] backdrop-blur-xl transition-transform duration-300 hover:-translate-y-0.5">
          <p className="text-xl font-bold text-amber-500">{cookingCount}</p>
          <p className="text-[9px] text-amber-500 uppercase tracking-wider mt-0.5">{t('in_kitchen')}</p>
        </div>
      </div>
    </motion.div>
  );
}
