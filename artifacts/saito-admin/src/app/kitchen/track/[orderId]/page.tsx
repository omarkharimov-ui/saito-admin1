'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Clock, CheckCircle2, ChefHat, AlertTriangle } from 'lucide-react';

interface TrackItem {
  id: string;
  product_name: string;
  quantity: number;
  prepared_quantity: number;
  kitchen_status: string;
  image_url?: string;
}

interface TrackOrder {
  id: string;
  table_number: number;
  kitchen_status: string;
  kitchen_accepted_at?: string | null;
  kitchen_ready_at?: string | null;
  created_at: string;
  total_amount: number;
  items: TrackItem[];
}

function elapsedMinutes(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}

function formatTime(createdAt: string): string {
  const diff = elapsedMinutes(createdAt);
  if (diff < 1) return 'İndi';
  if (diff < 60) return `${diff} dəq`;
  return `${Math.floor(diff / 60)} saat`;
}

export default function TrackPage() {
  const params = useParams();
  const orderId = params.orderId as string;
  const [order, setOrder] = useState<TrackOrder | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    const fetchOrder = async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}/track`);
        if (res.ok) {
          const data = await res.json();
          setOrder(data);
        }
      } catch {}
      setLoading(false);
    };
    fetchOrder();
    const id = setInterval(fetchOrder, 10000);
    return () => clearInterval(id);
  }, [orderId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-white/40">
        Sifariş tapılmadı
      </div>
    );
  }

  const allReady = order.items.length > 0 && order.items.every(it => it.prepared_quantity >= it.quantity);
  const statusLabel = allReady ? 'Hazırdır' : order.kitchen_status === 'preparing' ? 'Hazırlanır' : 'Qəbul edildi';
  const statusColor = allReady ? 'text-emerald-400' : order.kitchen_status === 'preparing' ? 'text-blue-400' : 'text-amber-400';

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/20 flex items-center justify-center">
            <ChefHat size={20} className="text-[#D4AF37]" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-wide">Sifariş İzləmə</h1>
            <p className="text-xs text-white/40">Masa {order.table_number}</p>
          </div>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={`rounded-2xl border p-6 mb-4 ${allReady ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-white/[0.02] border-white/[0.06]'}`}>
          <div className="flex items-center justify-between mb-4">
            <span className={`text-2xl font-black ${statusColor}`}>{statusLabel}</span>
            {allReady && <CheckCircle2 size={28} className="text-emerald-400" />}
          </div>
          <div className="flex items-center gap-2 text-sm text-white/50">
            <Clock size={14} />
            <span>{formatTime(order.created_at)} əvvəl başladı</span>
          </div>
          {order.kitchen_accepted_at && (
            <div className="mt-2 text-xs text-emerald-400/70">
              Mətbəx tərəfindən qəbul edildi • {formatTime(order.kitchen_accepted_at)}
            </div>
          )}
        </motion.div>

        <div className="space-y-2">
          {order.items.map((item, idx) => {
            const pending = item.quantity - item.prepared_quantity;
            const progress = item.quantity > 0 ? (item.prepared_quantity / item.quantity) * 100 : 0;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={`flex items-center gap-3 p-4 rounded-xl border ${item.prepared_quantity >= item.quantity ? 'bg-emerald-500/5 border-emerald-500/15' : 'bg-white/[0.02] border-white/[0.06]'}`}
              >
                <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/8 overflow-hidden flex-shrink-0">
                  {item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-cover" /> : null}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-bold text-sm truncate ${item.prepared_quantity >= item.quantity ? 'text-emerald-300' : 'text-white'}`}>{item.product_name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-[#D4AF37] transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="text-[10px] font-black text-white/50 tabular-nums">{item.prepared_quantity}/{item.quantity}</span>
                  </div>
                </div>
                {pending > 0 && <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />}
              </motion.div>
            );
          })}
        </div>

        <div className="mt-6 text-center text-[10px] text-white/20 font-medium">
          Avtomatik yenilənir • Hər 10 saniyə
        </div>
      </div>
    </div>
  );
}
