'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, ChefHat, CheckCircle2, AlertTriangle, Volume2, VolumeX,
  Package, Truck, Utensils, Flame, Timer, Bell
} from 'lucide-react';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { apiFetch } from '@/lib/api-fetch';
import { supabase } from '@/lib/supabase';

interface KDSItem {
  id: string;
  name: string;
  quantity: number;
  prepared_quantity: number;
  kitchen_status: string;
  modifiers?: { id: string; name: string; price: number; quantity: number }[];
  special_notes?: string;
}

interface KDSOrder {
  id: string;
  table_number: number;
  order_source: string;
  order_type?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_note?: string;
  items: KDSItem[];
  created_at: string;
  kitchen_status: string;
}

function getItemTimerStatus(createdAt: string, criticalMin: number, delayMin: number): { color: 'green' | 'yellow' | 'red' | 'purple'; text: string; elapsed: number } {
  const elapsed = (Date.now() - new Date(createdAt).getTime()) / 60000;
  if (elapsed < criticalMin) return { color: 'green', text: `${Math.floor(elapsed)}d`, elapsed };
  if (elapsed < delayMin) return { color: 'red', text: 'KRİTİK', elapsed };
  return { color: 'purple', text: 'GEÇİKME', elapsed };
}

function getTimerStyles(color: 'green' | 'yellow' | 'red' | 'purple', lightMode: boolean) {
  switch (color) {
    case 'green':
      return lightMode
        ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
        : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
    case 'yellow':
      return lightMode
        ? 'bg-amber-100 text-amber-700 border-amber-200'
        : 'bg-amber-500/10 text-amber-300 border-amber-500/20';
    case 'red':
      return lightMode
        ? 'bg-red-100 text-red-700 border-red-200'
        : 'bg-red-500/10 text-red-300 border-red-500/20';
    case 'purple':
      return lightMode
        ? 'bg-purple-100 text-purple-700 border-purple-200'
        : 'bg-purple-500/10 text-purple-300 border-purple-500/20';
  }
}

function getOrderBadge(order: KDSOrder, lightMode: boolean) {
  if (order.order_source === 'takeaway') {
    return (
      <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-bold tracking-wider ${lightMode ? 'bg-amber-100 text-amber-700' : 'bg-amber-500/10 text-amber-300'}`}>
        <Package size={10} /> GEL-AL
      </span>
    );
  }
  if (order.order_source === 'delivery') {
    return (
      <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-bold tracking-wider ${lightMode ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/10 text-blue-300'}`}>
        <Truck size={10} /> ÇATDIR
      </span>
    );
  }
  return (
    <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-bold tracking-wider ${lightMode ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-500/10 text-emerald-300'}`}>
      <Utensils size={10} /> İCƏRİDƏ
    </span>
  );
}

export function KDSView({ onBack }: { onBack: () => void }) {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  const [orders, setOrders] = useState<KDSOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [delayMin, setDelayMin] = useState(30);
  const prevOrderCountRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    supabase.from('settings').select('order_delay_minutes').limit(1).then(({ data }) => {
      const val = Number(data?.[0]?.order_delay_minutes);
      if (!isNaN(val) && val >= 1) setDelayMin(val);
    });
  }, []);

  const playSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.value = 880;
      const gain1 = ctx.createGain();
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.3);

      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = 1100;
      const gain2 = ctx.createGain();
      gain2.gain.setValueAtTime(0.15, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.4);
    } catch {}
  }, [soundEnabled]);

  useEffect(() => {
    const fetchKDS = async () => {
      try {
        const res = await apiFetch('/api/orders');
        if (!res.ok) return;
        const data = await res.json();
        const kdsOrders: KDSOrder[] = (data.orders || [])
          .filter((o: any) => o.status !== 'paid' && o.status !== 'cancelled' && o.kitchen_status !== null && o.kitchen_status !== 'completed' && o.kitchen_status !== 'cancelled')
          .map((o: any) => ({
            id: o.id,
            table_number: o.table_number,
            order_source: o.order_source || 'dine_in',
            order_type: o.order_type,
            customer_name: o.customer_name,
            customer_phone: o.customer_phone,
            customer_note: o.customer_note,
            items: (o.order_items || []).map((i: any) => ({
              id: i.id,
              name: i.product_name || i.product_id,
              quantity: i.quantity,
              prepared_quantity: i.prepared_quantity || 0,
              kitchen_status: i.kitchen_status || 'pending',
              modifiers: i.modifiers,
              special_notes: i.special_notes,
            })),
            created_at: o.created_at,
            kitchen_status: o.kitchen_status || 'pending',
          }));

        if (kdsOrders.length > prevOrderCountRef.current && prevOrderCountRef.current > 0) {
          playSound();
          toast(`${kdsOrders.length - prevOrderCountRef.current} yeni sifariş!`, { id: 'kds-toast' });
        }
        prevOrderCountRef.current = kdsOrders.length;
        setOrders(kdsOrders);
      } catch {
        toast.error('Mətbəx sifarişləri yüklənərkən xəta', { id: 'kds-toast' });
      } finally {
        setLoading(false);
      }
    };
    fetchKDS();
    const interval = setInterval(fetchKDS, 5000);
    return () => clearInterval(interval);
  }, [playSound]);

  const handleItemStatus = async (itemId: string, status: string) => {
    try {
      await apiFetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateItemStatus', item_id: itemId, status }),
      });
      setOrders(prev => prev.map(o => ({
        ...o,
        items: o.items.map(i => i.id === itemId ? { ...i, kitchen_status: status } : i),
      })));
    } catch {
      toast.error('Status yenilənərkən xəta', { id: 'kds-toast' });
    }
  };

  const handleMarkReady = async (orderId: string) => {
    try {
      await apiFetch('/api/orders/mark-ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      });
      setOrders(prev => prev.filter(o => o.id !== orderId));
      toast.success('Sifariş hazır!', { id: 'kds-toast' });
    } catch {
      toast.error('Status yenilənərkən xəta', { id: 'kds-toast' });
    }
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all ${lightMode ? 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50' : 'bg-white/[0.04] border-white/[0.08] text-white/40 hover:bg-white/[0.08]'}`}
          >
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <button onClick={onBack} className={`h-9 px-3.5 rounded-2xl text-xs font-semibold transition-all border ${lightMode ? 'text-gray-500 hover:text-gray-700 bg-white border-gray-200' : 'text-white/35 hover:text-white/65 bg-white/[0.04] border-white/[0.08]'}`}>
            Geri
          </button>
        </div>
      </div>

      {/* Orders Grid */}
      <div className="flex-1 overflow-y-auto py-3">
        {orders.length === 0 ? (
          <div className={`flex flex-col items-center justify-center h-full ${lightMode ? 'text-gray-400' : 'text-white/15'}`}>
            <CheckCircle2 size={40} className="mb-3 opacity-30" />
            <p className="text-sm">Bütün sifarişlər hazırdır</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <AnimatePresence>
              {orders.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).map(order => {
                const criticalMin = Math.max(1, Math.round(delayMin / 2));
                const timer = getItemTimerStatus(order.created_at, criticalMin, delayMin);
                const allItemsReady = order.items.every(i => i.kitchen_status === 'ready' || i.kitchen_status === 'completed');
                return (
                  <div
                    key={order.id}
                    className={`rounded-3xl border p-4 transition-all duration-200 ${
                      allItemsReady
                        ? (lightMode ? 'border-emerald-300 bg-emerald-50' : 'border-emerald-500/30 bg-emerald-500/5')
                        : timer.color === 'red' || timer.color === 'purple'
                          ? (lightMode ? 'border-red-300 bg-red-50 shadow-sm' : 'border-red-500/30 bg-red-500/5 shadow-sm')
                          : (lightMode ? 'border-gray-200 bg-white shadow-sm' : 'border-white/[0.08] bg-white/[0.02]')
                    }`}
                  >
                    {/* Order Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-xl font-black tracking-tight ${lightMode ? 'text-gray-900' : 'text-white'}`}>
                          {order.order_source === 'dine_in' ? `Masa ${order.table_number ?? '?'}` : order.customer_name || (order.order_source === 'takeaway' ? 'Gel-Al' : 'Çatdırma')}
                        </span>
                        {getOrderBadge(order, lightMode)}
                        {(timer.color === 'red' || timer.color === 'purple') && (
                          <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-bold tracking-wider border ${getTimerStyles(timer.color, lightMode)}`}>
                            <AlertTriangle size={10} />
                            {timer.text}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[9px] font-bold tracking-[0.18em] border ${getTimerStyles(timer.color, lightMode)}`}>
                          <Timer size={10} />
                          {Math.floor(timer.elapsed)}d
                        </span>
                        {(timer.color === 'red' || timer.color === 'purple') && <AlertTriangle size={14} className="animate-pulse text-red-500" />}
                      </div>
                    </div>

                    {/* Customer info for takeaway/delivery */}
                    {order.order_source !== 'dine_in' && order.customer_phone && (
                      <p className={`text-[10px] mb-2 ${lightMode ? 'text-gray-500' : 'text-white/40'}`}>
                        {order.customer_phone}
                      </p>
                    )}

                    {/* Items */}
                    <div className="space-y-1.5 mb-3">
                      {order.items.map(item => {
                        const itemReady = item.kitchen_status === 'ready' || item.kitchen_status === 'completed';
                        return (
                          <div key={item.id} className={`flex items-center justify-between gap-2 rounded-2xl px-2 py-1.5 transition-all ${itemReady ? (lightMode ? 'bg-emerald-50' : 'bg-emerald-500/5') : ''}`}>
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className={`text-sm font-medium truncate ${itemReady ? (lightMode ? 'text-emerald-600 line-through' : 'text-emerald-400 line-through') : (lightMode ? 'text-gray-800' : 'text-white/85')}`}>
                                {item.name}
                              </span>
                              {item.modifiers?.length ? (
                                <span className={`text-[9px] shrink-0 ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>
                                  {(item.modifiers ?? []).map(m => m.name).join(', ')}
                                </span>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={`text-xs font-bold ${lightMode ? 'text-gray-500' : 'text-white/50'}`}>×{item.quantity}</span>
                              {!itemReady ? (
                                <button
                                  onClick={() => handleItemStatus(item.id, 'ready')}
                                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all active:scale-90 ${lightMode ? 'bg-white border-gray-200 text-gray-500 hover:border-emerald-300 hover:text-emerald-500' : 'bg-white/5 border-white/10 text-white/40 hover:border-emerald-500/30 hover:text-emerald-400'}`}
                                >
                                  ✓
                                </button>
                              ) : (
                                <CheckCircle2 size={14} className="text-emerald-500" />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Customer note */}
                    {order.customer_note && (
                      <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-xl mb-2 ${lightMode ? 'bg-amber-50 border border-amber-200' : 'bg-amber-500/5 border border-amber-500/10'}`}>
                        <Bell size={10} className={lightMode ? 'text-amber-600' : 'text-amber-400'} />
                        <span className={`text-[10px] font-medium ${lightMode ? 'text-amber-700' : 'text-amber-300'}`}>{order.customer_note}</span>
                      </div>
                    )}

                    {/* Action */}
                    {allItemsReady && (
                      <button
                        onClick={() => handleMarkReady(order.id)}
                        className={`w-full py-2.5 rounded-2xl text-xs font-bold transition-all ${lightMode ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-emerald-500 text-white hover:bg-emerald-400'}`}
                      >
                        Sifarişi Tamamla
                      </button>
                    )}
                  </div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
