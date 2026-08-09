'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Clock, User, Phone, MapPin, Timer, FileText, CreditCard, ChevronRight,
  Package, Truck, CheckCircle2, CircleDot, Utensils, Ban, Car, Plus, Minus,
  Search
} from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from '@/lib/toast';
import type { PosProduct } from '../types/shared';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { useVirtualKeyboard } from './VirtualKeyboard';
import { appleBackdrop, slideUp, fastExit } from '@/lib/modal-transitions';

interface OrderDetailSheetProps {
  order: any | null;
  open: boolean;
  onClose: () => void;
  onPayment?: () => void;
  onStatusChange?: (status: string) => void;
  posMode: 'takeaway' | 'delivery';
  products?: PosProduct[];
  categories?: { id: string; name: string }[];
  onAddToExistingOrder?: (orderId: string, items: any[]) => Promise<boolean>;
}

const DELIVERY_FLOW = ['pending', 'confirmed', 'preparing', 'ready', 'in_transit', 'delivered', 'paid'] as const;
const TAKEAWAY_FLOW = ['confirmed', 'preparing', 'ready', 'paid'] as const;

const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string; labelKey: string; next: string | null }> = {
  pending:    { color: 'text-zinc-500', bg: 'bg-zinc-500/10', border: 'border-zinc-500/20', labelKey: 'status_waiting', next: 'confirmed' },
  confirmed:  { color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20', labelKey: 'status_confirmed', next: 'preparing' },
  preparing:  { color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20', labelKey: 'status_preparing', next: 'ready' },
  ready:      { color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/20', labelKey: 'ready', next: 'in_transit' },
  in_transit:  { color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/20', labelKey: 'status_in_transit', next: 'delivered' },
  delivered:  { color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', labelKey: 'status_delivered', next: 'paid' },
  paid:       { color: 'text-green-500', bg: 'bg-green-500/15', border: 'border-green-500/25', labelKey: 'payment_status', next: null },
  cancelled:  { color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20', labelKey: 'cancelled', next: null },
};

const STATUS_ICONS: Record<string, typeof Clock> = {
  pending: CircleDot,
  confirmed: CheckCircle2,
  preparing: Utensils,
  ready: Package,
  in_transit: Truck,
  delivered: CheckCircle2,
  paid: CreditCard,
  cancelled: Ban,
};

function timeAgo(dateStr: string, t: (key: any) => string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('just_now');
  if (mins < 60) return `${mins} ${t('min_abbrev')} ${t('ago')}`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ${t('hour_abbrev')} ${mins % 60} ${t('min_abbrev')} ${t('ago')}`;
  const days = Math.floor(hrs / 24);
  return `${days} ${t('day_abbrev')}`;
}

type TabKey = 'info' | 'order';

export function OrderDetailSheet({ order, open, onClose, onPayment, onStatusChange, posMode, products = [], categories = [], onAddToExistingOrder }: OrderDetailSheetProps) {
  const { lightMode } = useTheme();
  const keyboardHeight = useKeyboardHeight();
  const { height: vkHeight } = useVirtualKeyboard();
  const bottomOffset = Math.max(keyboardHeight, vkHeight);
  const { t } = useLanguage();
  const [couriers, setCouriers] = useState<any[]>([]);
  const [assigningCourier, setAssigningCourier] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('info');

  // t('order') tab state
  const [additions, setAdditions] = useState<{ product: PosProduct; quantity: number }[]>([]);
  const [addingItems, setAddingItems] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [open]);

  useEffect(() => {
    if (open && posMode === 'delivery') {
      apiFetch('/api/couriers?active=true')
        .then(res => res.ok ? res.json() : { couriers: [] })
        .then(data => setCouriers(data.couriers || []))
        .catch(() => {});
    }
  }, [open, posMode]);

  // Reset tab + additions when modal opens/closes
  useEffect(() => {
    if (open) {
      setActiveTab('info');
      setAdditions([]);
      setProductSearch('');
      setSelectedCategory(null);
    }
  }, [open]);

  const handleAssignCourier = async (courierId: string, courierName: string) => {
    if (!order?.id) return;
    setAssigningCourier(true);
    try {
      await apiFetch('/api/orders/delivery-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: order.id, courier_id: courierId, courier_name: courierName, status: order.status || 'pending' }),
      });
      order.courier_id = courierId;
      order.courier_name = courierName;
    } catch {}
    setAssigningCourier(false);
  };

  const status = order?.status ?? 'pending';
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const StatusIcon = STATUS_ICONS[status] ?? CircleDot;
  const nextStatus = posMode === 'takeaway' && status === 'ready' ? 'paid' : cfg.next;

  const subtotal = useMemo(() => {
    if (!order?.items) return 0;
    return order.items.reduce((sum: number, item: any) => sum + (item.total_price ?? item.unit_price * item.quantity), 0);
  }, [order?.items]);

  // Product grid filtering
  const filteredProducts = useMemo(() => {
    let list = products;
    if (selectedCategory) {
      list = list.filter(p => p.category_id === selectedCategory);
    }
    if (productSearch) {
      const q = productSearch.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [products, selectedCategory, productSearch]);

  const additionsTotal = useMemo(() => {
    return additions.reduce((sum, a) => sum + a.product.price * a.quantity, 0);
  }, [additions]);

  const handleAddProductToSelection = (product: PosProduct) => {
    setAdditions(prev => {
      const existing = prev.find(a => a.product.id === product.id);
      if (existing) {
        return prev.map(a => a.product.id === product.id ? { ...a, quantity: a.quantity + 1 } : a);
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const handleRemoveFromSelection = (productId: string) => {
    setAdditions(prev => {
      const existing = prev.find(a => a.product.id === productId);
      if (!existing) return prev;
      if (existing.quantity <= 1) return prev.filter(a => a.product.id !== productId);
      return prev.map(a => a.product.id === productId ? { ...a, quantity: a.quantity - 1 } : a);
    });
  };

  const handleConfirmAdditions = async () => {
    if (!order?.id || additions.length === 0 || !onAddToExistingOrder) return;
    setAddingItems(true);
    const items = additions.map(a => ({
      product_id: a.product.id,
      product_name: a.product.name,
      unit_price: a.product.price,
      quantity: a.quantity,
      modifiers: [],
      special_notes: '',
    }));
    const ok = await onAddToExistingOrder(order.id, items);
    setAddingItems(false);
    if (ok) {
      setAdditions([]);
      toast.success(`${additions.length} ${t('items_added')}`);
    }
  };

  if (!order) return null;

  const isWide = activeTab === 'order';

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center pointer-events-none" style={{ paddingBottom: bottomOffset > 0 ? bottomOffset + 16 : undefined }}>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={fastExit}
            className="fixed inset-0 z-0 pointer-events-auto bg-black/10 dark:bg-black/30"
            onClick={onClose}
           />

           <motion.div
             {...slideUp}
             className={`relative z-10 pointer-events-auto w-full mx-auto max-h-[92vh] flex flex-col overflow-hidden rounded-t-3xl shadow-[0_30px_60px_rgba(0,0,0,0.3)] border transition-all duration-300 ${
               isWide ? 'max-w-6xl' : 'max-w-lg'
             } ${
               lightMode ? 'bg-white border-zinc-200' : 'bg-zinc-900/95 border-white/10'
             }`}
           >
            {/* Tab Bar */}
            <div className={`flex items-center gap-1 px-5 pt-4 pb-2 border-b ${lightMode ? 'border-zinc-100' : 'border-white/5'}`}>
              {([
                { key: 'info' as TabKey, labelKey: 'info_tab' },
                { key: 'order' as TabKey, labelKey: 'order_tab' },
              ]).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`relative px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                    activeTab === tab.key
                      ? (lightMode ? 'bg-zinc-900 text-white' : 'bg-white text-black')
                      : (lightMode ? 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50' : 'text-white/40 hover:text-white/70 hover:bg-white/5')
                  }`}
                >
                  {t(tab.labelKey as any)}
                </button>
              ))}
              <div className="flex-1" />
              <button
                onClick={onClose}
                className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all shrink-0 ${
                  lightMode ? 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200' : 'bg-white/5 text-white/50 hover:bg-white/10'
                }`}
              >
                <X size={18} />
              </button>
            </div>

            {/* Tab Content */}
            <AnimatePresence mode="wait">
              {activeTab === 'info' && (
                 <motion.div
                   key="info"
                   initial={{ opacity: 0, x: -20 }}
                   animate={{ opacity: 1, x: 0 }}
                   className="overflow-y-auto flex-1 overscroll-contain"
                 >
                  <div className="p-6 space-y-5">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setActiveTab('order')}
                            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${lightMode ? 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}
                          >
                            <ChevronRight size={16} className="rotate-180" />
                          </button>
                          <p className={`text-2xl font-black tracking-tighter ${lightMode ? 'text-black' : 'text-white'}`}>
                             {posMode === 'takeaway' ? `${t('takeaway_short')} #${order.order_number || ''}` : posMode === 'delivery' ? `${t('delivery_short')} #${order.order_number || ''}` : `#${order.order_number || order.id?.slice(0, 8)}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                            <StatusIcon size={12} strokeWidth={3} />
                            {t(cfg.labelKey as any)}
                          </span>
                          <span className={`text-[10px] font-bold tracking-wide ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
                            {timeAgo(order.created_at, t)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Customer Info */}
                    {(order.customer_name || order.customer_phone || order.delivery_district || order.delivery_street || order.delivery_address) && (
                      <div className={`p-4 rounded-2xl border ${lightMode ? 'bg-zinc-50 border-zinc-150' : 'bg-white/[0.03] border-white/[0.06]'}`}>
                        <p className={`text-[9px] font-black uppercase tracking-[0.2em] mb-3 ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
                          t('customer_info')
                        </p>
                        <div className="flex flex-wrap gap-3">
                          {order.customer_name && (
                            <div className="flex items-center gap-3">
                              <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${lightMode ? 'bg-zinc-200' : 'bg-white/5'}`}>
                                <User size={14} className={lightMode ? 'text-zinc-500' : 'text-white/50'} />
                              </div>
                              <span className={`text-sm font-bold ${lightMode ? 'text-black' : 'text-white'}`}>{order.customer_name}</span>
                            </div>
                          )}
                          {order.customer_phone && (
                            <div className="flex items-center gap-3">
                              <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${lightMode ? 'bg-zinc-200' : 'bg-white/5'}`}>
                                <Phone size={14} className={lightMode ? 'text-zinc-500' : 'text-white/50'} />
                              </div>
                              <span className={`text-sm font-bold ${lightMode ? 'text-black' : 'text-white'}`}>{order.customer_phone}</span>
                            </div>
                          )}
                          {order.estimated_delivery_time && (
                            <div className="flex items-center gap-3">
                              <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${lightMode ? 'bg-zinc-200' : 'bg-white/5'}`}>
                                <Timer size={14} className={lightMode ? 'text-zinc-500' : 'text-white/50'} />
                              </div>
                              <span className={`text-sm font-bold ${lightMode ? 'text-black' : 'text-white'}`}>{t('estimated')} {order.estimated_delivery_time}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Delivery Address */}
                    {(order.delivery_street || order.delivery_address || order.delivery_district) && (
                      <div className={`p-4 rounded-2xl border ${lightMode ? 'bg-blue-50/50 border-blue-100' : 'bg-blue-500/5 border-blue-500/10'}`}>
                        <p className={`text-[9px] font-black uppercase tracking-[0.2em] mb-3 ${lightMode ? 'text-blue-400' : 'text-blue-300/60'}`}>
                          t('delivery_address')
                        </p>
                        <div className="space-y-2">
                          {order.delivery_district && (
                            <div className="flex items-center gap-2">
                              <MapPin size={12} className="text-blue-500 shrink-0" />
                              <span className={`text-xs font-bold ${lightMode ? 'text-blue-700' : 'text-blue-300'}`}>Rayon: {order.delivery_district}</span>
                            </div>
                          )}
                          {(order.delivery_street || order.delivery_building) && (
                            <div className="flex items-center gap-2">
                              <MapPin size={12} className="text-blue-500 shrink-0" />
                              <span className={`text-xs font-bold ${lightMode ? 'text-blue-700' : 'text-blue-300'}`}>
                                {order.delivery_street}{order.delivery_building ? `, ${order.delivery_building}` : ''}
                              </span>
                            </div>
                          )}
                          {(order.delivery_floor || order.delivery_apartment || order.delivery_intercom) && (
                            <div className="flex items-center gap-2">
                              <MapPin size={12} className="text-blue-500 shrink-0" />
                              <span className={`text-xs font-bold ${lightMode ? 'text-blue-700' : 'text-blue-300'}`}>
                                {[order.delivery_floor && `${t('floor')} ${order.delivery_floor}`, order.delivery_apartment && `${t('apartment')} ${order.delivery_apartment}`, order.delivery_intercom && `${t('intercom')} ${order.delivery_intercom}`].filter(Boolean).join(' · ')}
                              </span>
                            </div>
                          )}
                          {order.delivery_zone && (
                            <div className="flex items-center gap-2">
                              <MapPin size={12} className="text-blue-500 shrink-0" />
                              <span className={`text-xs font-bold ${lightMode ? 'text-blue-700' : 'text-blue-300'}`}>Zona: {order.delivery_zone}</span>
                            </div>
                          )}
                          {!order.delivery_street && !order.delivery_district && order.delivery_address && (
                            <div className="flex items-center gap-2">
                              <MapPin size={12} className="text-blue-500 shrink-0" />
                              <span className={`text-xs font-bold ${lightMode ? 'text-blue-700' : 'text-blue-300'}`}>{order.delivery_address}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Scheduled Date */}
                    {order.scheduled_date && (
                      <div className={`p-4 rounded-2xl border ${lightMode ? 'bg-amber-50/50 border-amber-100' : 'bg-amber-500/5 border-amber-500/10'}`}>
                        <p className={`text-[9px] font-black uppercase tracking-[0.2em] mb-1 ${lightMode ? 'text-amber-400' : 'text-amber-300/60'}`}>
                          t('scheduled_date')
                        </p>
                        <p className={`text-sm font-bold ${lightMode ? 'text-amber-700' : 'text-amber-300'}`}>{order.scheduled_date}</p>
                      </div>
                    )}

                    {/* Courier (delivery only) */}
                    {posMode === 'delivery' && (
                      <div className={`p-4 rounded-2xl border ${lightMode ? 'bg-zinc-50 border-zinc-150' : 'bg-white/[0.03] border-white/[0.06]'}`}>
                        <p className={`text-[9px] font-black uppercase tracking-[0.2em] mb-3 ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
                          Kuryer
                        </p>
                        {order.courier_name ? (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${lightMode ? 'bg-blue-100' : 'bg-blue-500/10'}`}>
                                <Car size={14} className="text-blue-500" />
                              </div>
                              <span className={`text-sm font-bold ${lightMode ? 'text-black' : 'text-white'}`}>{order.courier_name}</span>
                            </div>
                            <button
                              onClick={() => handleAssignCourier('', '')}
                              className={`text-[10px] font-bold ${lightMode ? 'text-zinc-400 hover:text-red-500' : 'text-white/30 hover:text-red-400'}`}
                            >
                              t('change')
                            </button>
                          </div>
                        ) : couriers.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {couriers.map((c: any) => (
                              <button
                                key={c.id}
                                onClick={() => handleAssignCourier(c.id, c.name)}
                                disabled={assigningCourier}
                                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all active:scale-[0.98] ${
                                  lightMode ? 'bg-white border-zinc-200 text-zinc-700 hover:border-blue-300 hover:bg-blue-50' : 'bg-white/5 border-white/10 text-white/70 hover:border-blue-500/30'
                                }`}
                              >
                                <Car size={12} />
                                {c.name}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className={`text-xs ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>{t('no_courier_found')}</p>
                        )}
                      </div>
                    )}

                    {/* Order Items */}
                    <div>
                      <p className={`text-[9px] font-black uppercase tracking-[0.2em] mb-3 ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
                        t('order') ({order.items?.length ?? 0})
                      </p>
                      <div className="space-y-2">
                        {order.items?.map((item: any, idx: number) => (
                          <div
                            key={idx}
                            className={`flex items-start gap-3 p-3.5 rounded-2xl border ${lightMode ? 'bg-zinc-50/50 border-zinc-100' : 'bg-white/[0.02] border-white/[0.04]'}`}
                          >
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black shrink-0 ${
                              lightMode ? 'bg-zinc-200 text-zinc-600' : 'bg-white/5 text-white/40'
                            }`}>
                              {item.quantity}x
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className={`text-sm font-bold truncate ${lightMode ? 'text-black' : 'text-white'}`}>{item.product_name}</p>
                                <p className={`text-sm font-black shrink-0 tabular-nums ${lightMode ? 'text-black' : 'text-white'}`}>
                                  ₼{(item.total_price ?? item.unit_price * item.quantity).toFixed(2)}
                                </p>
                              </div>
                              <p className={`text-[10px] font-bold mt-0.5 ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
                                ₼{item.unit_price.toFixed(2)} × {item.quantity}
                              </p>
                              {item.modifiers?.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {item.modifiers.map((mod: any, mi: number) => (
                                    <span key={mi} className={`px-2 py-0.5 rounded-md text-[9px] font-bold ${lightMode ? 'bg-zinc-200 text-zinc-600' : 'bg-white/5 text-white/40'}`}>
                                      {mod.name || mod.modifier_name || `Mod ${mi + 1}`}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {item.special_notes && (
                                <div className="flex items-center gap-1.5 mt-1.5">
                                  <FileText size={10} className={lightMode ? 'text-zinc-400' : 'text-white/25'} />
                                  <p className={`text-[10px] font-bold italic ${lightMode ? 'text-zinc-500' : 'text-white/35'}`}>{item.special_notes}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Special Notes */}
                    {order.special_notes && (
                      <div className={`p-4 rounded-2xl border ${lightMode ? 'bg-amber-50/50 border-amber-200/50' : 'bg-amber-500/5 border-amber-500/10'}`}>
                        <div className="flex items-start gap-2.5">
                          <FileText size={14} className="text-amber-500 mt-0.5 shrink-0" />
                          <div>
                            <p className={`text-[9px] font-black uppercase tracking-[0.2em] mb-1 text-amber-500`}>{t('custom_note')}</p>
                            <p className={`text-sm font-bold leading-relaxed ${lightMode ? 'text-amber-800' : 'text-amber-200/80'}`}>{order.special_notes}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Summary */}
                    <div className={`p-4 rounded-2xl border ${lightMode ? 'bg-zinc-50 border-zinc-150' : 'bg-white/[0.03] border-white/[0.06]'}`}>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className={`text-xs font-bold ${lightMode ? 'text-zinc-500' : 'text-white/40'}`}>{t('interval')}</span>
                          <span className={`text-sm font-bold tabular-nums ${lightMode ? 'text-black' : 'text-white'}`}>₼{subtotal.toFixed(2)}</span>
                        </div>
                        {posMode === 'delivery' && order.delivery_fee > 0 && (
                          <div className="flex justify-between items-center">
                            <span className={`text-xs font-bold ${lightMode ? 'text-zinc-500' : 'text-white/40'}`}>{t('delivery_short')}</span>
                            <span className={`text-sm font-bold tabular-nums ${lightMode ? 'text-black' : 'text-white'}`}>₼{order.delivery_fee.toFixed(2)}</span>
                          </div>
                        )}
                        <div className={`flex justify-between items-center pt-2 border-t ${lightMode ? 'border-zinc-200' : 'border-white/10'}`}>
                          <span className={`text-[10px] font-black uppercase tracking-widest ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>{t('total')}</span>
                          <span className={`text-xl font-black tabular-nums ${lightMode ? 'text-black' : 'text-white'}`}>₼{order.total_amount.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Status Flow */}
                    {nextStatus && onStatusChange && (
                      <div>
                        <p className={`text-[9px] font-black uppercase tracking-[0.2em] mb-3 ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
                          t('next_step')
                        </p>
                        <button
                          onClick={() => onStatusChange(nextStatus)}
                          className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl border font-black text-sm uppercase tracking-wider transition-all active:scale-[0.98] ${
                            lightMode
                              ? 'bg-zinc-900 text-white border-zinc-900 hover:bg-zinc-800'
                              : 'bg-white text-black border-white hover:bg-white/90'
                          }`}
                        >
                          <span>{t(STATUS_CONFIG[nextStatus]?.labelKey as any) || nextStatus}</span>
                          <ChevronRight size={18} strokeWidth={3} />
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {activeTab === 'order' && (
                 <motion.div
                   key="order"
                   initial={{ opacity: 0, x: 20 }}
                   animate={{ opacity: 1, x: 0 }}
                   className="flex-1 flex flex-col overflow-hidden min-h-0"
                 >
                  {/* Existing order items */}
                  <div className={`px-5 pt-4 pb-3 border-b ${lightMode ? 'border-zinc-100' : 'border-white/5'}`}>
                    <p className={`text-[9px] font-black uppercase tracking-[0.2em] mb-2 ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
                      {t('current_order')} ({order.items?.length ?? 0} {t('product')})
                    </p>
                    <div className="flex flex-wrap gap-1.5 max-h-[80px] overflow-y-auto">
                      {order.items?.map((item: any, idx: number) => (
                        <span key={idx} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold ${lightMode ? 'bg-zinc-100 text-zinc-600' : 'bg-white/5 text-white/50'}`}>
                          {item.quantity}x {item.product_name}
                          <span className="text-zinc-400">₼{(item.total_price ?? item.unit_price * item.quantity).toFixed(2)}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Product selection area */}
                  <div className="flex-1 flex overflow-hidden min-h-0">
                    {/* Product grid (left) */}
                    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                      {/* Search + categories */}
                      <div className={`px-5 py-3 flex items-center gap-3 border-b ${lightMode ? 'border-zinc-100' : 'border-white/5'}`}>
                         <div className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${lightMode ? 'bg-zinc-50 border-zinc-200 focus-within:border-zinc-400' : 'bg-white/5 border-white/10 focus-within:border-zinc-400/50'}`}>
                           <Search size={14} className={lightMode ? 'text-zinc-400' : 'text-white/40'} />
                           <input
                             value={productSearch}
                             onChange={e => setProductSearch(e.target.value)}
                             placeholder="Axtar..."
                             className={`flex-1 bg-transparent text-xs font-bold outline-none ${lightMode ? 'text-black placeholder:text-zinc-400' : 'text-white placeholder:text-white/30'}`}
                           />
                          {productSearch && (
                            <button onClick={() => setProductSearch('')}>
                              <X size={12} className={lightMode ? 'text-zinc-400' : 'text-white/30'} />
                            </button>
                          )}
                        </div>
                        <div className="flex gap-1.5 overflow-x-auto">
                          <button
                            onClick={() => setSelectedCategory(null)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase whitespace-nowrap transition-all ${
                              !selectedCategory
                                ? (lightMode ? 'bg-zinc-900 text-white' : 'bg-white text-black')
                                : (lightMode ? 'bg-zinc-100 text-zinc-500' : 'bg-white/5 text-white/40')
                            }`}
                          >
                            t('all_products')
                          </button>
                          {categories.map(cat => (
                            <button
                              key={cat.id}
                              onClick={() => setSelectedCategory(cat.id === selectedCategory ? null : cat.id)}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase whitespace-nowrap transition-all ${
                                selectedCategory === cat.id
                                  ? (lightMode ? 'bg-zinc-900 text-white' : 'bg-white text-black')
                                  : (lightMode ? 'bg-zinc-100 text-zinc-500' : 'bg-white/5 text-white/40')
                              }`}
                            >
                              {cat.name}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Products grid */}
                      <div className="flex-1 overflow-y-auto p-4">
                        <div className="grid grid-cols-3 gap-2">
                          {filteredProducts.map(product => {
                            const addedCount = additions.find(a => a.product.id === product.id)?.quantity || 0;
                            return (
                              <button
                                key={product.id}
                                onClick={() => handleAddProductToSelection(product)}
                                className={`relative p-3 rounded-2xl text-left transition-all border active:scale-[0.97] ${
                                  addedCount > 0
                                    ? (lightMode ? 'bg-emerald-50 border-emerald-300 shadow-sm' : 'bg-emerald-500/10 border-emerald-500/30')
                                    : (lightMode ? 'bg-white border-zinc-100 hover:border-zinc-300' : 'bg-white/[0.03] border-white/[0.06] hover:border-white/20')
                                }`}
                              >
                                <p className={`text-xs font-black truncate ${lightMode ? 'text-black' : 'text-white'}`}>
                                  {product.name}
                                </p>
                                <p className={`text-[10px] font-bold mt-1 ${lightMode ? 'text-zinc-500' : 'text-white/40'}`}>
                                  ₼{product.price.toFixed(2)}
                                </p>
                                {addedCount > 0 && (
                                  <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center">
                                    {addedCount}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Additions cart (right sidebar) */}
                    {additions.length > 0 && (
                      <div className={`w-[240px] flex flex-col border-l ${lightMode ? 'border-zinc-100 bg-zinc-50/50' : 'border-white/5 bg-white/[0.02]'}`}>
                        <div className="px-4 pt-4 pb-3">
                          <p className={`text-[9px] font-black uppercase tracking-[0.2em] ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>
                            t('to_add') ({additions.length})
                          </p>
                        </div>
                        <div className="flex-1 overflow-y-auto px-4 space-y-2">
                          {additions.map(a => (
                            <div key={a.product.id} className={`flex items-center gap-2 p-2.5 rounded-xl border ${lightMode ? 'bg-white border-zinc-100' : 'bg-white/[0.03] border-white/[0.06]'}`}>
                              <div className="flex-1 min-w-0">
                                <p className={`text-[11px] font-bold truncate ${lightMode ? 'text-black' : 'text-white'}`}>{a.product.name}</p>
                                <p className={`text-[10px] font-bold ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>₼{a.product.price.toFixed(2)}</p>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleRemoveFromSelection(a.product.id)}
                                  className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${lightMode ? 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}
                                >
                                  <Minus size={12} />
                                </button>
                                <span className={`w-6 text-center text-xs font-black tabular-nums ${lightMode ? 'text-black' : 'text-white'}`}>
                                  {a.quantity}
                                </span>
                                <button
                                  onClick={() => handleAddProductToSelection(a.product)}
                                  className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${lightMode ? 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}
                                >
                                  <Plus size={12} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className={`px-4 py-4 border-t ${lightMode ? 'border-zinc-200' : 'border-white/10'}`}>
                          <div className="flex justify-between items-center mb-3">
                            <span className={`text-[10px] font-black uppercase tracking-widest ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>{t('total')}</span>
                            <span className={`text-lg font-black tabular-nums ${lightMode ? 'text-black' : 'text-white'}`}>₼{additionsTotal.toFixed(2)}</span>
                          </div>
                          <button
                            onClick={handleConfirmAdditions}
                            disabled={addingItems}
                            className="w-full py-3.5 rounded-2xl bg-emerald-500 text-white text-xs font-black uppercase tracking-wider hover:bg-emerald-600 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
                          >
                            {addingItems ? t('adding') : t('add_to_order')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Footer (info tab only) */}
            {activeTab === 'info' && (
              <div className={`p-5 border-t ${lightMode ? 'bg-white border-zinc-100' : 'bg-zinc-900/95 border-white/5'}`}>
                {status !== 'paid' && status !== 'cancelled' && (
                  <div className="flex gap-2">
                    {onPayment && (
                      <button
                        onClick={onPayment}
                        className="flex-1 py-4 rounded-2xl bg-gold text-black text-sm font-black uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-gold/20"
                      >
                        t('receive_payment')
                      </button>
                    )}
                    {onStatusChange && (
                      <button
                        onClick={() => onStatusChange('cancelled')}
                        className={`py-4 px-5 rounded-2xl text-sm font-black uppercase tracking-widest transition-all active:scale-[0.98] ${
                          lightMode ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100' : 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'
                        }`}
                      >
                        t('cancel')
                      </button>
                    )}
                  </div>
                )}
                {(status === 'paid' || status === 'cancelled') && (
                  <button
                    onClick={onClose}
                    className={`w-full py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all active:scale-[0.98] ${
                      lightMode ? 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200' : 'bg-white/5 text-white/50 hover:bg-white/10'
                    }`}
                  >
                    t('close')
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
