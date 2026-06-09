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
      className="relative overflow-hidden rounded-3xl bg-[#0a0a0a] p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
            <Armchair size={20} className="text-gold" />
          </div>
          <div>
            <h3 className="text-white font-semibold">{t('live_floor')}</h3>
            <p className="text-white/40 text-xs">{t('real_time_tables')}</p>
          </div>
        </div>
        
        {/* Legend */}
        <div className="hidden sm:flex items-center gap-3 text-[10px] text-white/40">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {t('new')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            {t('cooking')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            DOLU
          </span>
        </div>
      </div>

      {/* Compact Stats Row - No Table Grid */}
      <div className="flex gap-3">
        <div className="flex-1 p-3 rounded-xl bg-white/[0.02]">
          <p className="text-xl font-bold text-white">{occupiedCount}<span className="text-white/30 text-sm">/{tableCount}</span></p>
          <p className="text-[9px] text-white/40 uppercase tracking-wider mt-0.5">{t('occupied')}</p>
        </div>
        <div className="flex-1 p-3 rounded-xl bg-white/[0.02] border-l-4 border-emerald-500">
          <p className="text-xl font-bold text-emerald-400">{newCount}</p>
          <p className="text-[9px] text-emerald-400/70 uppercase tracking-wider mt-0.5">{t('new_arrivals')}</p>
        </div>
        <div className="flex-1 p-3 rounded-xl bg-white/[0.02] border-l-4 border-amber-500">
          <p className="text-xl font-bold text-amber-400">{cookingCount}</p>
          <p className="text-[9px] text-amber-400/70 uppercase tracking-wider mt-0.5">{t('in_kitchen')}</p>
        </div>
      </div>
    </motion.div>
  );
}
