'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { Package, Clock, Utensils, CheckCircle2, X } from 'lucide-react';

const OrderTracker = () => {
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check for an active order in localStorage or session
    const checkOrder = async () => {
      const orderId = localStorage.getItem('saito_active_order_id');
      if (orderId) {
        const { data } = await supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .single();

        if (data && data.status !== 'completed' && data.status !== 'cancelled') {
          setActiveOrder(data);
          setIsVisible(true);
        } else {
          localStorage.removeItem('saito_active_order_id');
          setIsVisible(false);
        }
      }
    };

    checkOrder();

    // Subscribe to changes on the specific order
    const orderId = localStorage.getItem('saito_active_order_id');
    if (orderId) {
      const channel = createRealtimeChannel(`order_tracker_${orderId}`)
        .on('postgres_changes' as any, { 
          event: 'UPDATE', 
          table: 'orders', 
          schema: 'public',
          filter: `id=eq.${orderId}`
        }, (payload: any) => {
          if (payload.new.status === 'completed' || payload.new.status === 'cancelled') {
            setIsVisible(false);
            localStorage.removeItem('saito_active_order_id');
          } else {
            setActiveOrder(payload.new);
          }
        })
        .subscribe();

      return () => {
        removeRealtimeChannel(channel);
      };
    }
  }, []);

  if (!isVisible || !activeOrder) return null;

  const statuses = [
    { key: 'pending', label: 'Gözləyir', icon: Clock },
    { key: 'preparing', label: 'Hazırlanır', icon: Utensils },
    { key: 'serving', label: 'Süfrəyə verilir', icon: Package },
    { key: 'completed', label: 'Tamamlandı', icon: CheckCircle2 },
  ];

  const currentStatusIndex = statuses.findIndex(s => s.key === activeOrder.status);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-28 left-8 z-[80] w-[320px] bg-card border border-gold/20 p-6 shadow-2xl backdrop-blur-xl"
      >
        <div className="flex justify-between items-start mb-6">
          <div>
            <h4 className="text-sm font-bold tracking-widest uppercase mb-1">Sifariş Statusu</h4>
            <span className="text-[10px] text-white/30 uppercase tracking-tighter">ID: #{activeOrder.id.slice(0, 8)}</span>
          </div>
          <button onClick={() => setIsVisible(false)} className="text-white/40 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-6">
          {statuses.slice(0, 3).map((status, index) => {
            const Icon = status.icon;
            const isCompleted = index <= currentStatusIndex;
            const isCurrent = index === currentStatusIndex;

            return (
              <div key={status.key} className="flex items-center gap-4 relative">
                {/* Connector Line */}
                {index < 2 && (
                  <div className={`absolute left-3 top-8 w-[1px] h-6 ${isCompleted ? 'bg-gold' : 'bg-white/10'}`} />
                )}
                
                <div className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all duration-500 ${
                  isCompleted ? 'bg-gold border-gold text-black' : 'border-white/10 text-white/20'
                }`}>
                  {isCompleted ? <CheckCircle2 size={12} /> : <div className="w-1.5 h-1.5 bg-current rounded-full" />}
                </div>

                <div className="flex flex-col">
                  <span className={`text-xs font-bold uppercase tracking-widest ${isCompleted ? 'text-white' : 'text-white/20'}`}>
                    {status.label}
                  </span>
                  {isCurrent && (
                    <motion.span 
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                      className="text-[9px] text-gold uppercase tracking-tighter font-medium"
                    >
                      Canlı izlənilir...
                    </motion.span>
                  )}
                </div>

                {isCurrent && (
                  <div className="ml-auto">
                    <Icon size={16} className="text-gold animate-pulse" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default OrderTracker;
