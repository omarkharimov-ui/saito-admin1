'use client';

import { Plus, Phone, User, MapPin, Bike, Clock, ShoppingBag, MoreVertical, Navigation, UserCheck, Route, CreditCard, CheckCircle2 } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface DeliveryOrdersProps {
  orders: any[];
  onRefresh: () => void;
  onNewOrder: () => void;
  onSelectOrder: (order: any) => void;
  onOpenActionSheet: (order: any) => void;
}

export const DELIVERY_STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string; labelKey: string; subtitleKey: string; bgDark: string; textDark: string; dotDark: string }> = {
  new:              { bg: 'bg-violet-50 border-violet-200',     text: 'text-violet-600',  dot: 'bg-violet-500',  bgDark: 'bg-violet-500/10 border-violet-500/20', textDark: 'text-violet-400',  dotDark: 'bg-violet-400',  labelKey: 'delivery_status_new',          subtitleKey: 'delivery_status_new_sub' },
  pending:          { bg: 'bg-amber-50 border-amber-200',      text: 'text-amber-600',   dot: 'bg-amber-500',   bgDark: 'bg-amber-500/10 border-amber-500/20',  textDark: 'text-amber-400',  dotDark: 'bg-amber-400',  labelKey: 'delivery_status_pending',      subtitleKey: 'delivery_status_pending_sub' },
  confirmed:        { bg: 'bg-amber-50 border-amber-200',      text: 'text-amber-600',   dot: 'bg-amber-500',   bgDark: 'bg-amber-500/10 border-amber-500/20',  textDark: 'text-amber-400',  dotDark: 'bg-amber-400',  labelKey: 'delivery_status_confirmed',    subtitleKey: 'delivery_status_confirmed_sub' },
  preparing:        { bg: 'bg-blue-50 border-blue-200',        text: 'text-blue-600',    dot: 'bg-blue-500',    bgDark: 'bg-blue-500/10 border-blue-500/20',    textDark: 'text-blue-400',   dotDark: 'bg-blue-400',   labelKey: 'delivery_status_preparing',      subtitleKey: 'delivery_status_preparing_sub' },
  in_kitchen:       { bg: 'bg-blue-50 border-blue-200',        text: 'text-blue-600',    dot: 'bg-blue-500',    bgDark: 'bg-blue-500/10 border-blue-500/20',    textDark: 'text-blue-400',   dotDark: 'bg-blue-400',   labelKey: 'delivery_status_in_kitchen',     subtitleKey: 'delivery_status_in_kitchen_sub' },
  ready:            { bg: 'bg-purple-50 border-purple-200',    text: 'text-purple-600',  dot: 'bg-purple-500',  bgDark: 'bg-purple-500/10 border-purple-500/20', textDark: 'text-purple-400', dotDark: 'bg-purple-400', labelKey: 'delivery_status_ready',          subtitleKey: 'delivery_status_ready_sub' },
  picked_up:        { bg: 'bg-cyan-50 border-cyan-200',        text: 'text-cyan-600',    dot: 'bg-cyan-500',    bgDark: 'bg-cyan-500/10 border-cyan-500/20',    textDark: 'text-cyan-400',   dotDark: 'bg-cyan-400',   labelKey: 'delivery_status_picked_up',      subtitleKey: 'delivery_status_picked_up_sub' },
  delivered:        { bg: 'bg-emerald-50 border-emerald-200',  text: 'text-emerald-600', dot: 'bg-emerald-500', bgDark: 'bg-emerald-500/10 border-emerald-500/20', textDark: 'text-emerald-400', dotDark: 'bg-emerald-400', labelKey: 'delivery_status_delivered',        subtitleKey: 'delivery_status_delivered_sub' },
  payment_pending:  { bg: 'bg-orange-50 border-orange-200',    text: 'text-orange-600',  dot: 'bg-orange-500',  bgDark: 'bg-orange-500/10 border-orange-500/20', textDark: 'text-orange-400', dotDark: 'bg-orange-400',  labelKey: 'delivery_status_payment_pending', subtitleKey: 'delivery_status_payment_pending_sub' },
  paid:             { bg: 'bg-green-50 border-green-200',      text: 'text-green-600',   dot: 'bg-green-500',   bgDark: 'bg-green-500/10 border-green-200/20',  textDark: 'text-green-400',  dotDark: 'bg-green-400',  labelKey: 'delivery_status_paid',             subtitleKey: 'delivery_status_paid_sub' },
  cancelled:        { bg: 'bg-red-50 border-red-200',          text: 'text-red-600',     dot: 'bg-red-500',     bgDark: 'bg-red-500/10 border-red-500/20',      textDark: 'text-red-400',    dotDark: 'bg-red-400',    labelKey: 'delivery_status_cancelled',      subtitleKey: 'delivery_status_cancelled_sub' },
};

export default function DeliveryOrders({ orders, onRefresh: _onRefresh, onNewOrder, onSelectOrder, onOpenActionSheet }: DeliveryOrdersProps) {
  const { lightMode } = useTheme();
  const { t } = useLanguage();

  return (
    <div className="h-full flex flex-col p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className={`text-2xl font-black ${lightMode ? 'text-black' : 'text-white'} flex items-center gap-2`}>
            <Bike size={24} className="text-blue-500" />
            {t('delivery_orders_title')}
          </h2>
          <p className={`text-xs mt-1 ${lightMode ? 'text-zinc-500' : 'text-white/50'}`}>
            {orders.length} {t('active_orders')}
          </p>
        </div>
        <button
          onClick={onNewOrder}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-blue-500 text-white text-xs font-black uppercase tracking-wider hover:bg-blue-600 transition-all shadow-lg shadow-blue-500/20"
        >
          <Plus size={18} />
          <span>{t('new_delivery')}</span>
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center">
          <ShoppingBag size={64} className={`${lightMode ? 'text-zinc-200' : 'text-white/10'} mb-4`} />
          <p className={`text-sm ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>{t('no_active_orders')}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {orders.map((order) => {
              const statusKey = order.delivery_status || order.status;
              const status = DELIVERY_STATUS_CONFIG[statusKey] || DELIVERY_STATUS_CONFIG.pending;
              const elapsed = order.created_at
                ? Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000)
                : 0;
              const elapsedText = elapsed < 1 ? '< 1 min' : elapsed < 60 ? `${elapsed} min` : `${Math.floor(elapsed / 60)}h ${elapsed % 60}m`;

              return (
                <div
                  key={order.id}
                  onClick={() => onSelectOrder(order)}
                  className={`relative h-[180px] rounded-4xl p-5 text-left transition-all duration-200 group overflow-hidden border cursor-pointer ${
                    lightMode
                      ? 'bg-white border-emerald-500 shadow-sm'
                      : 'bg-zinc-900 border-emerald-500/60 shadow-sm'
                  }`}
                >
                  <div className="absolute top-4 right-4 z-20" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onOpenActionSheet(order)}
                      className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${lightMode ? 'bg-zinc-100 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600' : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'}`}
                    >
                      <MoreVertical size={14} />
                    </button>
                  </div>

                  <span className={`absolute top-5 left-5 text-[32px] font-black tracking-tighter ${
                    lightMode ? 'text-gray-900' : 'text-white'
                  }`}>
                    {t('delivery_short')} {order.order_number || ''}
                  </span>

                      {elapsed > 0 && (
                        <span className={`absolute top-14 right-5 flex items-center gap-1 text-xs font-bold tabular-nums ${
                          lightMode ? 'text-zinc-400' : 'text-white/40'
                        }`}>
                          <Clock size={10} strokeWidth={3} />
                          {elapsedText}
                        </span>
                      )}

                   <div className="absolute top-[68px] left-5 right-5 flex flex-col gap-1">
                     {order.customer_name && (
                       <div className="flex items-center gap-1.5">
                         <User size={11} className="text-blue-400" />
                         <span className={`text-xs font-bold truncate ${lightMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
                           {order.customer_name}
                         </span>
                         {order.customer_phone && (
                           <span className="text-xs text-[var(--theme-text-muted)]">({order.customer_phone.slice(-4)})</span>
                         )}
                       </div>
                     )}
                     {(order.delivery_street || order.delivery_address) && (
                       <div className="flex items-center gap-1.5">
                         <MapPin size={11} className="text-blue-400 shrink-0" />
                         <span className={`text-xs font-bold truncate ${lightMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
                           {[order.delivery_street, order.delivery_building].filter(Boolean).join(' ')}{order.delivery_district ? `, ${order.delivery_district}` : ''}
                           {!order.delivery_street && order.delivery_address}
                         </span>
                       </div>
                     )}
                     {order.delivery_zone && (
                       <div className="flex items-center gap-1.5">
                         <Route size={11} className="text-purple-400 shrink-0" />
                         <span className={`text-xs font-bold text-purple-500`}>
                           {order.delivery_zone}
                         </span>
                       </div>
                     )}
                     {order.courier_name && (
                       <div className="flex items-center gap-1.5">
                         <UserCheck size={11} className="text-emerald-400 shrink-0" />
                         <span className={`text-xs font-bold text-emerald-500`}>
                           {order.courier_name}
                         </span>
                       </div>
                     )}
                     {order.estimated_delivery_time && (
                       <div className="flex items-center gap-1.5">
                         <Clock size={11} className="text-amber-400 shrink-0" />
                         <span className={`text-xs font-bold text-amber-500`}>
                            {t('estimated')}: {new Date(order.estimated_delivery_time).toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' })}
                         </span>
                       </div>
                     )}
                     {order.customer_phone && (
                       <div className="flex items-center gap-1.5">
                         <Phone size={11} className="text-blue-400" />
                         <span className={`text-xs font-bold tabular-nums ${lightMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
                           {order.customer_phone}
                         </span>
                       </div>
                     )}
                   </div>

                   <div className="absolute bottom-4 left-0 right-0 px-5 flex items-center justify-between">
                     <div className="flex items-center gap-2 flex-wrap">
                       <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-black uppercase tracking-widest ${lightMode ? status.bg : status.bgDark}`}>
                         <div className={`w-1.5 h-1.5 rounded-full ${lightMode ? status.dot : status.dotDark}`} />
                         <span className={`${lightMode ? status.text : status.textDark}`}>{t(status.labelKey as any)}</span>
                       </div>
                       {(order.status !== 'paid' && order.status !== 'cancelled' && order.status !== 'completed') && (
                         <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-black uppercase tracking-widest ${lightMode ? 'bg-amber-50 border-amber-200 text-amber-600' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
                           <CreditCard size={10} strokeWidth={2.5} />
                           ₼{Number(order.total_amount || 0).toFixed(2)}
                         </span>
                       )}
                       {order.status === 'paid' && (
                         <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-black uppercase tracking-widest ${lightMode ? 'bg-green-50 border-green-200 text-green-600' : 'bg-green-500/10 border-green-500/20 text-green-400'}`}>
                           <CheckCircle2 size={10} strokeWidth={2.5} />
                           {t('paid' as any)}
                         </span>
                       )}
                     </div>
                   </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
