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

  const getStatusStyle = (status: TableStatus['status']) => {
    switch (status) {
      case 'empty': return { bar: 'bg-[var(--theme-border)]', dot: 'bg-[var(--theme-text-muted)]', text: 'text-[var(--theme-text-muted)]' };
      case 'new': return { bar: 'bg-[#16a34a]', dot: 'bg-[#16a34a]', text: 'text-[#15803d]' };
      case 'order_placed': return { bar: 'bg-[#d97706]', dot: 'bg-[#d97706]', text: 'text-[#b45309]' };
      case 'payment_pending': return { bar: 'bg-[#1f2937]', dot: 'bg-[#1f2937]', text: 'text-[#374151]' };
      case 'occupied': return { bar: 'bg-[var(--theme-text)]', dot: 'bg-[var(--theme-text)]', text: 'text-[var(--theme-text)]' };
      default: return { bar: 'bg-[var(--theme-border)]', dot: 'bg-[var(--theme-text-muted)]', text: 'text-[var(--theme-text-muted)]' };
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
      className="relative overflow-hidden rounded-3xl bg-[var(--theme-surface)] p-6 shadow-[0_12px_40px_rgba(0,0,0,0.08)] border border-[var(--theme-border)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-4">
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
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.10)]" />
            {t('new')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.10)]" />
            {t('cooking')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[var(--theme-text)] shadow-[0_0_0_4px_rgba(15,23,42,0.08)]" />
            DOLU
          </span>
        </div>
      </div>

      {/* Compact Stats Row - No Table Grid */}
      <div className="grid grid-cols-3 gap-3">
        <div className="relative overflow-hidden p-3 rounded-2xl bg-[var(--theme-nested)] border border-[var(--theme-border)] shadow-[0_8px_24px_rgba(0,0,0,0.03)] before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-[var(--theme-border)] before:content-['']">
          <p className="text-xl font-bold text-[var(--theme-text)]">{occupiedCount}<span className="text-[var(--theme-text-muted)] text-sm">/{tableCount}</span></p>
          <p className="text-[9px] text-[var(--theme-text-muted)] uppercase tracking-wider mt-0.5">{t('occupied')}</p>
        </div>
        <div className="relative overflow-hidden p-3 rounded-2xl bg-[var(--theme-nested)] border border-[var(--theme-border)] shadow-[0_8px_24px_rgba(0,0,0,0.03)] before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-emerald-500 before:content-['']">
          <p className="text-xl font-bold text-emerald-500">{newCount}</p>
          <p className="text-[9px] text-emerald-500 uppercase tracking-wider mt-0.5">{t('new_arrivals')}</p>
        </div>
        <div className="relative overflow-hidden p-3 rounded-2xl bg-[var(--theme-surface)] border border-[var(--theme-border)] shadow-[0_8px_24px_rgba(0,0,0,0.03)] before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-amber-500 before:content-['']">
          <p className="text-xl font-bold text-amber-500">{cookingCount}</p>
          <p className="text-[9px] text-amber-500 uppercase tracking-wider mt-0.5">{t('in_kitchen')}</p>
        </div>
      </div>
    </motion.div>
  );
}
