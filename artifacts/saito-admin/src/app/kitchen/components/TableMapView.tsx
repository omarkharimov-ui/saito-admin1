'use client';

import { motion } from 'framer-motion';
import { useTheme } from '@/lib/theme/ThemeContext';

function statusColor(status: string, isRush?: boolean, isDelayed?: boolean, lightMode = false): string {
  if (isRush) return lightMode ? 'bg-black border-black text-white' : 'bg-orange-500 border-orange-400 text-white';
  if (isDelayed) return lightMode ? 'bg-black border-black text-white' : 'bg-red-500 border-red-400 text-white';
  if (status === 'ready') return lightMode ? 'bg-black border-black text-white' : 'bg-emerald-500 border-emerald-400 text-white';
  if (status === 'preparing') return lightMode ? 'bg-black border-black text-white' : 'bg-blue-500 border-blue-400 text-white';
  if (status === 'pending' || status === 'reserved') return lightMode ? 'bg-black/80 border-black text-white' : 'bg-amber-500 border-amber-400 text-white';
  return lightMode ? 'bg-black/5 border-black/10 text-black/40' : 'bg-zinc-700 border-zinc-600 text-white/50';
}

export function TableMapView({ orders, tables }: { orders: any[]; tables: { table_number: number; status?: string }[] }) {
  const { lightMode } = useTheme();

  const occupied = new Map<number, any>();
  orders.forEach(o => {
    if (o.kitchen_status === 'completed') return;
    occupied.set(o.table_number, o);
  });

  return (
    <div className={`p-4 rounded-2xl border ${lightMode ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-white/10'}`}>
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
        {tables.map(t => {
          const order = occupied.get(t.table_number);
          const isDelayed = order ? (() => {
            if (!order.kitchen_accepted_at) return false;
            return (Date.now() - new Date(order.kitchen_accepted_at).getTime()) >= 15 * 60_000;
          })() : false;
          const color = statusColor(order?.kitchen_status || t.status || 'empty', order?.is_rush, isDelayed, lightMode);
          return (
            <motion.div
              key={t.table_number}
              whileHover={{ scale: 1.05 }}
              className={`aspect-square rounded-xl border flex flex-col items-center justify-center gap-0.5 cursor-default ${color}`}
            >
              <span className="text-xs font-black">{t.table_number}</span>
              {order && (
                <span className="text-[9px] font-bold opacity-80 truncate max-w-full px-1">
                  {order.kitchen_status === 'ready' ? 'Hazır' : order.kitchen_status === 'preparing' ? 'Hazırlanır' : 'Yeni'}
                </span>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
