'use client';

import { Plus, Phone, User, Clock, ShoppingBag, UserCheck, MoreVertical, Wallet, CheckCircle2 } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { deriveOrderStage, type OrderStage } from '@/lib/order-stage';
import BoardOrderCard from './BoardOrderCard';

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
               // 2026-09-22: status is now DERIVED (payment + kitchen + status),
               // not the raw DB status string — it updates automatically.
               const stage = deriveOrderStage(order);
               const TAKEAWAY_STAGE_MAP: Record<OrderStage, string> = {
                 new: 'new', confirmed: 'confirmed', kitchen: 'in_kitchen',
                 ready: 'ready', paid: 'paid', closed: 'closed', cancelled: 'cancelled',
               };
               const status = TAKEAWAY_STATUS_CONFIG[TAKEAWAY_STAGE_MAP[stage]] || TAKEAWAY_STATUS_CONFIG.confirmed;
                // 2026-09-25 (owner redesign rounds 2-3): same BoardOrderCard
                // family (title rule 2026-09-23: in-house reads "Gel-Al 44",
                // partner reads "#2812"). All in-house rows kept (QA bug 5:
                // name + phone rows always render, "—" placeholders).
                return (
                  <BoardOrderCard
                    key={order.id}
                    order={order}
                    kind="takeaway"
                    stage={stage}
                    status={status}
                    lightMode={lightMode}
                    t={t}
                    onSelect={onSelectOrder}
                    onAction={onOpenActionSheet}
                  />
                );
             })}
          </div>
        </div>
      )}
    </div>
  );
}
