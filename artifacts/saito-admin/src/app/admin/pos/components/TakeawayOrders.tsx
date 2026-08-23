'use client';

import { Plus, Phone, User, Clock, ShoppingBag, UserCheck, MoreVertical, CreditCard, CheckCircle2 } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface TakeawayOrdersProps {
  orders: any[];
  onRefresh: () => void;
  onNewOrder: () => void;
  onSelectOrder: (order: any) => void;
  onOpenActionSheet: (order: any) => void;
}

export const TAKEAWAY_STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string; labelKey: string; subtitleKey: string; bgDark: string; textDark: string; dotDark: string }> = {
  new:             { bg: 'bg-violet-50 border-violet-200',     text: 'text-violet-600',  dot: 'bg-violet-500',  bgDark: 'bg-violet-500/10 border-violet-500/20', textDark: 'text-violet-400',  dotDark: 'bg-violet-400',  labelKey: 'takeaway_status_new',          subtitleKey: 'takeaway_status_new_sub' },
  confirmed:       { bg: 'bg-amber-50 border-amber-200',      text: 'text-amber-600',   dot: 'bg-amber-500',   bgDark: 'bg-amber-500/10 border-amber-500/20',  textDark: 'text-amber-400',  dotDark: 'bg-amber-400',  labelKey: 'takeaway_status_confirmed',    subtitleKey: 'takeaway_status_confirmed_sub' },
  in_kitchen:      { bg: 'bg-blue-50 border-blue-200',        text: 'text-blue-600',    dot: 'bg-blue-500',    bgDark: 'bg-blue-500/10 border-blue-500/20',    textDark: 'text-blue-400',   dotDark: 'bg-blue-400',   labelKey: 'takeaway_status_in_kitchen',     subtitleKey: 'takeaway_status_in_kitchen_sub' },
  partially_ready: { bg: 'bg-cyan-50 border-cyan-200',       text: 'text-cyan-600',    dot: 'bg-cyan-500',    bgDark: 'bg-cyan-500/10 border-cyan-500/20',    textDark: 'text-cyan-400',   dotDark: 'bg-cyan-400',   labelKey: 'takeaway_status_partially_ready', subtitleKey: 'takeaway_status_partially_ready_sub' },
  ready:           { bg: 'bg-emerald-50 border-emerald-200',  text: 'text-emerald-600', dot: 'bg-emerald-500', bgDark: 'bg-emerald-500/10 border-emerald-500/20', textDark: 'text-emerald-400', dotDark: 'bg-emerald-400', labelKey: 'takeaway_status_ready',          subtitleKey: 'takeaway_status_ready_sub' },
  payment_pending: { bg: 'bg-orange-50 border-orange-200',  text: 'text-orange-600',  dot: 'bg-orange-500',  bgDark: 'bg-orange-500/10 border-orange-500/20', textDark: 'text-orange-400', dotDark: 'bg-orange-400', labelKey: 'takeaway_status_payment_pending', subtitleKey: 'takeaway_status_payment_pending_sub' },
  paid:            { bg: 'bg-green-50 border-green-200',    text: 'text-green-600',   dot: 'bg-green-500',   bgDark: 'bg-green-500/10 border-green-500/20',  textDark: 'text-green-400',  dotDark: 'bg-green-400',  labelKey: 'takeaway_status_paid',           subtitleKey: 'takeaway_status_paid_sub' },
  cancelled:       { bg: 'bg-red-50 border-red-200',          text: 'text-red-600',     dot: 'bg-red-500',     bgDark: 'bg-red-500/10 border-red-500/20',      textDark: 'text-red-400',    dotDark: 'bg-red-400',    labelKey: 'takeaway_status_cancelled',      subtitleKey: 'takeaway_status_cancelled_sub' },
  closed:          { bg: 'bg-zinc-100 border-zinc-200',       text: 'text-zinc-500',    dot: 'bg-zinc-400',    bgDark: 'bg-white/5 border-white/10',           textDark: 'text-white/40',   dotDark: 'bg-white/40',   labelKey: 'takeaway_status_closed',         subtitleKey: 'takeaway_status_closed_sub' },
};

export default function TakeawayOrders({ orders, onRefresh: _onRefresh, onNewOrder, onSelectOrder, onOpenActionSheet }: TakeawayOrdersProps) {
  const { lightMode } = useTheme();
  const { t } = useLanguage();

  return (
    <div className="h-full flex flex-col p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className={`text-2xl font-black ${lightMode ? 'text-black' : 'text-white'} flex items-center gap-2`}>
            <UserCheck size={24} className="text-emerald-500" />
              {t('takeaway_orders_title')}
          </h2>
          <p className={`text-xs mt-1 ${lightMode ? 'text-zinc-500' : 'text-white/50'}`}>
            {orders.length} {t('active_orders')}
          </p>
        </div>
        <button
          onClick={onNewOrder}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-emerald-500 text-white text-xs font-black uppercase tracking-wider hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20"
        >
          <Plus size={18} />
          <span>{t('new_takeaway')}</span>
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
              const status = TAKEAWAY_STATUS_CONFIG[order.status] || TAKEAWAY_STATUS_CONFIG.confirmed;
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
                    {t('takeaway_short')} {order.order_number || ''}
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
                        <User size={11} className="text-emerald-400" />
                        <span className={`text-xs font-bold truncate ${lightMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
                          {order.customer_name}
                        </span>
                      </div>
                    )}
                    {order.customer_phone && (
                      <div className="flex items-center gap-1.5">
                        <Phone size={11} className="text-emerald-400" />
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
                       {order.status !== 'paid' && order.status !== 'cancelled' && order.status !== 'closed' && (
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
