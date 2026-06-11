'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, ChefHat, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';

interface KDSOrder {
  id: string;
  table_number: number;
  items: { name: string; quantity: number; modifiers?: { id: string; name: string; price: number; quantity: number }[]; special_notes?: string }[];
  created_at: string;
  status: string;
  elapsed: number;
}

function timeElapsed(dateStr: string): { text: string; urgent: boolean } {
  const mins = (Date.now() - new Date(dateStr).getTime()) / 60000;
  if (mins < 60) return { text: `${Math.floor(mins)}d`, urgent: mins > 20 };
  const h = Math.floor(mins / 60);
  return { text: `${h}s ${Math.floor(mins % 60)}d`, urgent: mins > 30 };
}

export function KDSView({ onBack }: { onBack: () => void }) {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  const [orders, setOrders] = useState<KDSOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchKDS = async () => {
      try {
        const res = await fetch('/api/orders?status=active');
        if (!res.ok) return;
        const data = await res.json();
        const kdsOrders: KDSOrder[] = (data.orders || [])
          .filter((o: any) => o.kitchen_status !== 'ready' && o.kitchen_status !== 'delivered' && o.status !== 'paid')
          .map((o: any) => ({
            id: o.id,
            table_number: o.table_number,
            items: (o.order_items || []).map((i: any) => ({
              name: i.product_name || i.product_id,
              quantity: i.quantity,
              modifiers: i.modifiers,
              special_notes: i.special_notes,
            })),
            created_at: o.created_at,
            status: o.kitchen_status || 'pending',
            elapsed: Date.now() - new Date(o.created_at).getTime(),
          }));
        setOrders(kdsOrders);
      } catch {} finally {
        setLoading(false);
      }
    };
    fetchKDS();
    const interval = setInterval(fetchKDS, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleStatusUpdate = async (orderId: string, status: string) => {
    try {
      await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: orderId, data: { kitchen_status: status } }),
      });
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
    } catch {}
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={`flex items-center justify-between flex-shrink-0 pb-4 border-b ${lightMode ? 'border-gray-200' : 'border-white/[0.06]'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${lightMode ? 'bg-white border-gray-200 text-gray-500' : 'bg-white/[0.04] border-white/[0.08] text-white/45'}`}>
            <ChefHat size={18} />
          </div>
          <div>
            <p className={`text-lg font-bold tracking-tight ${lightMode ? 'text-gray-900' : 'text-white'}`}>Mətbəx Ekranı</p>
            <p className={`text-xs ${lightMode ? 'text-gray-500' : 'text-white/40'}`}>{orders.length} aktiv sifariş</p>
          </div>
        </div>
        <button onClick={onBack} className={`h-10 px-3.5 rounded-2xl text-xs font-semibold transition-all border ${lightMode ? 'text-gray-500 hover:text-gray-700 bg-white border-gray-200' : 'text-white/35 hover:text-white/65 bg-white/[0.04] border-white/[0.08]'}`}>
          Geri
        </button>
      </div>

      {/* Orders */}
      <div className="flex-1 overflow-y-auto py-3 space-y-3">
        {loading ? (
          <div className={`flex items-center justify-center h-full ${lightMode ? 'text-gray-400' : 'text-white/15'}`}>
            <p className="text-sm">Yüklənir...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className={`flex flex-col items-center justify-center h-full ${lightMode ? 'text-gray-400' : 'text-white/15'}`}>
            <CheckCircle2 size={40} className="mb-3 opacity-30" />
            <p className="text-sm">Bütün sifarişlər hazırdır</p>
          </div>
        ) : (
          <AnimatePresence>
            {orders.map(order => {
              const elapsed = timeElapsed(order.created_at);
              return (
                <motion.div
                  key={order.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`rounded-3xl border p-4 transition-all duration-200 ${
                    elapsed.urgent
                      ? (lightMode ? 'border-red-300 bg-red-50 shadow-sm' : 'border-red-500/30 bg-red-500/5')
                      : (lightMode ? 'border-gray-200 bg-white shadow-sm' : 'border-white/[0.08] bg-white/[0.02]')
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3 gap-3">
                    <div className="flex items-center gap-3">
                      <span className={`text-xl font-black tracking-tight ${lightMode ? 'text-gray-900' : 'text-white'}`}>Masa {order.table_number}</span>
                      <span className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[9px] font-bold tracking-[0.18em] ${
                        elapsed.urgent
                          ? (lightMode ? 'bg-red-100 text-red-700' : 'bg-red-500/10 text-red-300')
                          : 'bg-[var(--theme-surface-soft)] text-[var(--theme-text-muted)]'
                      }`}>
                        <Clock size={10} />
                        {elapsed.text}
                      </span>
                    </div>
                    {elapsed.urgent && <AlertTriangle size={16} className={`animate-pulse ${lightMode ? 'text-red-500' : 'text-red-400'}`} />}
                  </div>

                  {/* Items */}
                  <div className="space-y-1.5 mb-3">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-3 rounded-2xl px-2 py-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-sm font-medium truncate ${lightMode ? 'text-gray-800' : 'text-white/85'}`}>{item.name}</span>
                          {item.modifiers?.length ? (
                            <span className={`text-[9px] shrink-0 ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>
                              {(item.modifiers ?? []).map(modifier => modifier.name).join(', ')}
                            </span>
                          ) : null}
                        </div>
                        <span className={`text-sm font-bold shrink-0 ${lightMode ? 'text-gray-600' : 'text-white/60'}`}>×{item.quantity}</span>
                      </div>
                    ))}
                    {order.items.some(i => i.special_notes) && (
                      <p className={`text-[10px] italic mt-1 px-2 ${lightMode ? 'text-amber-600/70' : 'text-amber-400/60'}`}>
                        Qeyd: {order.items.filter(i => i.special_notes).map(i => i.special_notes).join(', ')}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    {order.status === 'pending' && (
                      <button onClick={() => handleStatusUpdate(order.id, 'cooking')}
                        className={`flex-1 py-2.5 rounded-2xl text-xs font-bold transition-all ${lightMode ? 'bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100' : 'bg-blue-500/10 border border-blue-500/20 text-blue-300 hover:bg-blue-500/20'}`}>
                        Qəbul et
                      </button>
                    )}
                    {order.status === 'cooking' && (
                      <button onClick={() => handleStatusUpdate(order.id, 'ready')}
                        className={`flex-1 py-2.5 rounded-2xl text-xs font-bold transition-all ${lightMode ? 'bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20'}`}>
                        Hazırdır
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
