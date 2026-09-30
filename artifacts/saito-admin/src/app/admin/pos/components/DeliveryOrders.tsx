'use client';

import { AnimatePresence } from 'framer-motion';
import { Plus, User, MapPin, Bike, Clock, ShoppingBag, MoreVertical, Navigation, UserCheck, Route, Wallet, CheckCircle2 } from '@/components/ui/saito-icons';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { deriveFulfillmentStage, isOrderPaid, type FulfillmentStage } from '@/lib/order-stage';
import { GridCell } from '@/lib/motion/GridCell';
import BoardOrderCard from './BoardOrderCard';

interface DeliveryOrdersProps {
  orders: any[];
  onRefresh: () => void;
  onNewOrder: () => void;
  onSelectOrder: (order: any) => void;
  onOpenActionSheet: (order: any) => void;
}

export const DELIVERY_STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string; labelKey: string; subtitleKey: string; bgDark: string; textDark: string; dotDark: string }> = {
  new:              { bg: 'bg-violet-50 border-violet-200',     text: 'text-violet-600',  dot: 'bg-violet-500',  bgDark: 'bg-violet-500/10 border-violet-500/20', textDark: 'text-violet-400',  dotDark: 'bg-violet-400',  labelKey: 'delivery_status_new',          subtitleKey: 'delivery_status_new_sub' },
  // 2026-09-28 (owner: light mode — yalnız mavi/qara): light = qara (dark unchanged)
  pending:          { bg: 'bg-zinc-900/10 border-zinc-900/25', text: 'text-zinc-900',    dot: 'bg-zinc-900',    bgDark: 'bg-amber-500/10 border-amber-500/20',  textDark: 'text-amber-400',  dotDark: 'bg-amber-400',  labelKey: 'delivery_status_pending',      subtitleKey: 'delivery_status_pending_sub' },
  confirmed:        { bg: 'bg-zinc-900/10 border-zinc-900/25', text: 'text-zinc-900',    dot: 'bg-zinc-900',    bgDark: 'bg-amber-500/10 border-amber-500/20',  textDark: 'text-amber-400',  dotDark: 'bg-amber-400',  labelKey: 'delivery_status_confirmed',    subtitleKey: 'delivery_status_confirmed_sub' },
  preparing:        { bg: 'bg-blue-50 border-blue-200',        text: 'text-blue-600',    dot: 'bg-blue-500',    bgDark: 'bg-blue-500/10 border-blue-500/20',    textDark: 'text-blue-400',   dotDark: 'bg-blue-400',   labelKey: 'delivery_status_preparing',      subtitleKey: 'delivery_status_preparing_sub' },
  in_kitchen:       { bg: 'bg-blue-50 border-blue-200',        text: 'text-blue-600',    dot: 'bg-blue-500',    bgDark: 'bg-blue-500/10 border-blue-500/20',    textDark: 'text-blue-400',   dotDark: 'bg-blue-400',   labelKey: 'delivery_status_in_kitchen',     subtitleKey: 'delivery_status_in_kitchen_sub' },
  ready:            { bg: 'bg-purple-50 border-purple-200',    text: 'text-purple-600',  dot: 'bg-purple-500',  bgDark: 'bg-purple-500/10 border-purple-500/20', textDark: 'text-purple-400', dotDark: 'bg-purple-400', labelKey: 'delivery_status_ready',          subtitleKey: 'delivery_status_ready_sub' },
  picked_up:        { bg: 'bg-cyan-50 border-cyan-200',        text: 'text-cyan-600',    dot: 'bg-cyan-500',    bgDark: 'bg-cyan-500/10 border-cyan-500/20',    textDark: 'text-cyan-400',   dotDark: 'bg-cyan-400',   labelKey: 'delivery_status_picked_up',      subtitleKey: 'delivery_status_picked_up_sub' },
   // 11n: courier step picked_up→in_transit was missing from the map — such
   // orders fell to the 'pending' config (wrong label).
   in_transit:       { bg: 'bg-blue-50 border-blue-200',        text: 'text-blue-600',    dot: 'bg-blue-500',    bgDark: 'bg-blue-500/15 border-blue-500/25',   textDark: 'text-blue-300',   dotDark: 'bg-blue-300',   labelKey: 'delivery_status_in_transit',     subtitleKey: 'delivery_status_in_transit_sub' },
   delivered:        { bg: 'bg-emerald-50 border-emerald-200',  text: 'text-emerald-600', dot: 'bg-emerald-500', bgDark: 'bg-emerald-500/10 border-emerald-500/20', textDark: 'text-emerald-400', dotDark: 'bg-emerald-400', labelKey: 'delivery_status_delivered',        subtitleKey: 'delivery_status_delivered_sub' },
  payment_pending:  { bg: 'bg-zinc-900/10 border-zinc-900/25', text: 'text-zinc-900',    dot: 'bg-zinc-900',    bgDark: 'bg-orange-500/10 border-orange-500/20', textDark: 'text-orange-400', dotDark: 'bg-orange-400',  labelKey: 'delivery_status_payment_pending', subtitleKey: 'delivery_status_payment_pending_sub' },
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
          {/* Motion System: delivered orders collapse + neighbors glide. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <AnimatePresence>
              {orders.map((order) => {
                // 11n (owner): the pill = FULFILLMENT (kitchen + courier),
                // NEVER payment — money is the icon by the total.
                const stage = deriveFulfillmentStage(order);
                const DELIVERY_STAGE_MAP: Record<FulfillmentStage, string> = {
                  new: 'pending', confirmed: 'confirmed', kitchen: 'preparing',
                  ready: 'ready', picked_up: 'picked_up', in_transit: 'in_transit',
                  closed: 'delivered', cancelled: 'cancelled',
                };
                const status = DELIVERY_STATUS_CONFIG[DELIVERY_STAGE_MAP[stage]] || DELIVERY_STATUS_CONFIG.pending;
                // 2026-09-25 (owner redesign rounds 2-3): ONE card family for
                // partner AND in-house orders (BoardOrderCard): flex-flow
                // (no overlap by construction), glow + accent border (stronger
                // in light mode — "sonuk" fix), ALL in-house data kept
                // (customer+phone / address / zone / courier+ETA), total text
                // white on dark & near-black on light (NEVER yellow).
                // Title rule (2026-09-23): in-house cards read "Çatdırılma 41".
                 return (
                   <GridCell key={order.id} className="col-span-1">
                      <BoardOrderCard
                        order={order}
                        kind="delivery"
                        paid={isOrderPaid(order)}
                        status={status}
                       lightMode={lightMode}
                       t={t}
                       onSelect={onSelectOrder}
                       onAction={onOpenActionSheet}
                     />
                   </GridCell>
                 );
              })}
            </AnimatePresence>
           </div>
        </div>
      )}
    </div>
  );
}
