'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Users, ChefHat, ShoppingBag, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface PreOrderItem {
  product_name: string;
  quantity: number;
  unit_price: number;
}

interface Reservation {
  id: string;
  name: string | null;
  phone: string | null;
  guests: number | null;
  date: string;
  time: string;
  status: string;
  table_number: number | null;
  pre_order_items: PreOrderItem[] | string | null;
  pre_order_total: number | null;
}

function preOrderSummary(items: PreOrderItem[] | string | null): string {
  if (!items) return '';
  const parsed: PreOrderItem[] = typeof items === 'string' ? JSON.parse(items) : items;
  if (!Array.isArray(parsed) || parsed.length === 0) return '';
  return parsed.slice(0, 3).map(i => `${i.quantity}x ${i.product_name}`).join(', ') + (parsed.length > 3 ? ` +${parsed.length - 3}` : '');
}

export function UpcomingReservations() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  const fetchReservations = useCallback(async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .eq('status', 'confirmed')
        .gte('date', today)
        .order('date', { ascending: true })
        .order('time', { ascending: true });

      if (!error && data) {
        setReservations(data as Reservation[]);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReservations();
    const interval = setInterval(fetchReservations, 60_000);
    return () => clearInterval(interval);
  }, [fetchReservations]);

  if (reservations.length === 0 && !loading) return null;

  return (
    <div className="mb-4">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all bg-gradient-to-r from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20 w-full"
      >
        <ChefHat size={16} className="text-emerald-400" />
        <span>Gözlənilən Rezervlər</span>
        {reservations.length > 0 && (
          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-black bg-emerald-500/20 text-emerald-300">
            {reservations.length}
          </span>
        )}
        <span className="ml-auto">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="mt-2 rounded-2xl border bg-[#151515] border-emerald-500/20 shadow-2xl overflow-hidden"
          >
            {loading ? (
              <div className="p-6 text-center text-white/30 text-sm">Yüklənir...</div>
            ) : reservations.length === 0 ? (
              <div className="p-6 text-center text-white/20 text-sm">
                <ChefHat size={32} className="mx-auto mb-2 opacity-30" />
                Gözlənilən rezerv yoxdur
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto p-3 space-y-2">
                {reservations.map(r => (
                  <motion.div
                    key={r.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border bg-emerald-500/5 border-emerald-500/15 p-3.5 transition-all hover:bg-emerald-500/10"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-white font-bold text-sm truncate">{r.name || 'Adsız'}</span>
                          {r.table_number && (
                            <span className="flex-shrink-0 px-2 py-0.5 rounded text-[9px] font-black bg-emerald-500/15 border border-emerald-500/25 text-emerald-400">
                              Masa {r.table_number}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-white/40 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Clock size={10} />
                            {r.date === new Date().toISOString().slice(0, 10)
                              ? `Bugün ${r.time}`
                              : `${r.date} ${r.time}`}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users size={10} />
                            {r.guests || '?'} nəfər
                          </span>
                          {r.pre_order_total != null && (
                            <span className="flex items-center gap-1">
                              <ShoppingBag size={10} />
                              {Number(r.pre_order_total).toFixed(2)} ₼
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {(() => {
                      const summary = preOrderSummary(r.pre_order_items);
                      if (!summary) return null;
                      return (
                        <div className="px-2.5 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                          <p className="text-[11px] text-emerald-300/80 leading-relaxed">
                            <span className="font-semibold text-emerald-400/60 text-[10px] uppercase tracking-wider mr-1.5">Pre-order:</span>
                            {summary}
                          </p>
                        </div>
                      );
                    })()}
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
