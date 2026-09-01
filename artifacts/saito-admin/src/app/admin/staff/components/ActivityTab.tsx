'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Activity, ShoppingBag, DollarSign, Clock, Edit, Trash2, CheckCircle, XCircle, AlertTriangle, Filter } from 'lucide-react';

interface ActivityItem {
  id: string;
  event_type: string;
  description: string;
  amount?: number;
  order_id?: string;
  created_at: string;
  metadata?: any;
}

interface ActivityTabProps {
  staffId: string;
}

export function ActivityTab({ staffId }: ActivityTabProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('today');

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/staff/${staffId}/activity?range=${dateRange}`);
      if (res.ok) {
        const data = await res.json();
        setActivities(Array.isArray(data) ? data : []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [staffId, dateRange]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  const filteredActivities = filter === 'all'
    ? activities
    : activities.filter(a => a.event_type === filter);

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'order_created': return <ShoppingBag size={14} />;
      case 'order_completed': return <CheckCircle size={14} />;
      case 'payment': return <DollarSign size={14} />;
      case 'void': return <XCircle size={14} />;
      case 'refund': return <AlertTriangle size={14} />;
      case 'discount': return <Edit size={14} />;
      case 'clock_in': return <Clock size={14} />;
      case 'clock_out': return <Clock size={14} />;
      default: return <Activity size={14} />;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'order_created': return 'text-blue-400 bg-blue-500/10';
      case 'order_completed': return 'text-emerald-400 bg-emerald-500/10';
      case 'payment': return 'text-emerald-400 bg-emerald-500/10';
      case 'void': return 'text-rose-400 bg-rose-500/10';
      case 'refund': return 'text-amber-400 bg-amber-500/10';
      case 'discount': return 'text-purple-400 bg-purple-500/10';
      case 'clock_in': return 'text-blue-400 bg-blue-500/10';
      case 'clock_out': return 'text-zinc-400 bg-zinc-500/10';
      default: return 'text-zinc-400 bg-zinc-500/10';
    }
  };

  const formatCurrency = (amount: number) => `₼${amount.toFixed(2)}`;

  // Calculate summary stats
  const totalOrders = activities.filter(a => a.event_type === 'order_created').length;
  const totalRevenue = activities.filter(a => a.event_type === 'payment').reduce((sum, a) => sum + (a.amount || 0), 0);
  const totalVoids = activities.filter(a => a.event_type === 'void').length;
  const totalRefunds = activities.filter(a => a.event_type === 'refund').length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <ShoppingBag size={14} className="text-blue-400 mb-1" />
          <p className="text-sm font-bold text-[var(--theme-text)]">{totalOrders}</p>
          <p className="text-[9px] text-[var(--theme-text-muted)]">Orders</p>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <DollarSign size={14} className="text-emerald-400 mb-1" />
          <p className="text-sm font-bold text-emerald-400">{formatCurrency(totalRevenue)}</p>
          <p className="text-[9px] text-[var(--theme-text-muted)]">Revenue</p>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <XCircle size={14} className="text-rose-400 mb-1" />
          <p className="text-sm font-bold text-rose-400">{totalVoids}</p>
          <p className="text-[9px] text-[var(--theme-text-muted)]">Voids</p>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <AlertTriangle size={14} className="text-amber-400 mb-1" />
          <p className="text-sm font-bold text-amber-400">{totalRefunds}</p>
          <p className="text-[9px] text-[var(--theme-text-muted)]">Refunds</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {['today', 'week', 'month'].map((range) => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${
                dateRange === range
                  ? 'bg-blue-500 text-white'
                  : 'bg-white/[0.03] border border-white/[0.08] text-[var(--theme-text-muted)]'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {['all', 'order_created', 'void', 'refund', 'clock_in'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-1 rounded text-[10px] font-medium ${
                filter === f
                  ? 'bg-emerald-500 text-white'
                  : 'bg-white/[0.03] text-[var(--theme-text-muted)]'
              }`}
            >
              {f === 'all' ? 'All' : f.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Activity List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-14 rounded-xl animate-pulse bg-white/[0.02]" />
          ))}
        </div>
      ) : filteredActivities.length === 0 ? (
        <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center">
          <Activity size={48} className="mx-auto text-[var(--theme-text-muted)] mb-4" />
          <p className="text-sm text-[var(--theme-text-secondary)]">No activity found</p>
          <p className="text-xs text-[var(--theme-text-muted)] mt-1">Activity will appear here as actions are performed</p>
        </div>
      ) : (
        <div className="space-y-1">
          {filteredActivities.map((activity, index) => (
            <motion.div
              key={activity.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.02 }}
              className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/10 transition-colors"
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getEventColor(activity.event_type)}`}>
                {getEventIcon(activity.event_type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[var(--theme-text)] truncate">{activity.description}</p>
                <p className="text-[9px] text-[var(--theme-text-muted)]">
                  {new Date(activity.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              {activity.amount !== undefined && activity.amount !== null && (
                <span className={`text-xs font-medium ${
                  activity.event_type === 'void' || activity.event_type === 'refund'
                    ? 'text-rose-400'
                    : 'text-emerald-400'
                }`}>
                  {activity.event_type === 'void' || activity.event_type === 'refund' ? '-' : '+'}
                  {formatCurrency(activity.amount)}
                </span>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
