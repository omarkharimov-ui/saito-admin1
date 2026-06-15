'use client';

import React from 'react';
import { Clock, Utensils, ShoppingBag, Package, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import type { Order, BadgeType } from '../types';
import { timeAgo, getOrderAgeMinutes, getProgressProps } from '../utils';

/* ─── KitchenBadge (mini) ─── */
const MiniBadge = React.memo(function MiniBadge({ badgeType }: { badgeType: BadgeType }) {
  const { t } = useLanguage();
  if (!badgeType) return null;
  const base = 'text-[9px] font-black px-1.5 py-0.5 rounded-full';
  const badge =
    badgeType === 'ready'     ? <span className={`${base} bg-emerald-500/15 text-emerald-400 border border-emerald-500/30`}>{t('badge_ready')}</span> :
    badgeType === 'preparing' ? <span className={`${base} bg-slate-500/15 text-slate-300 border border-slate-500/30`}>{t('badge_preparing')}</span> :
    badgeType === 'confirmed' ? <span className={`${base} bg-white/5 text-white/70 border border-white/20`}>{t('badge_confirmed')}</span> :
    <span className={`${base} bg-white/5 text-white/50 border border-white/10`}>{t('badge_waiting')}</span>;
  return badge;
});

/* ─── Horizontal Order Card ─── */
interface HCardProps {
  order: Order;
  allOrders: Order[];
  confirmedIds: Set<string>;
  delayThreshold: number;
  onClick: () => void;
}

export const HorizontalOrderCard = React.memo(function HorizontalOrderCard({
  order, allOrders, confirmedIds, delayThreshold, onClick,
}: HCardProps) {
  const { t, language } = useLanguage();

  const mergedChildOrders = allOrders.filter(o => o.merged_into === order.id && o.table_number !== null);
  const mergedFromTables = mergedChildOrders.map(o => o.table_number as number);
  const isMergedCard = mergedFromTables.length > 0;

  const groupNumber = React.useMemo(() => {
    if (!isMergedCard) return 0;
    const parents = allOrders
      .filter(o => o.status !== 'paid' && o.table_number !== null && allOrders.some(c => c.merged_into === o.id))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return parents.findIndex(o => o.id === order.id) + 1;
  }, [isMergedCard, allOrders, order.id]);

  const allMergedItems = [
    ...(order.order_items || []),
    ...mergedChildOrders.flatMap(o => o.order_items || []),
  ];
  const allReady = allMergedItems.length > 0 && allMergedItems.every((it: any) => (it.prepared_quantity ?? 0) >= (it.quantity ?? 0));

  const effectiveKs = order.kitchen_status as string | null;
  const isEmptyGroup = isMergedCard && (!order.order_items || order.order_items.length === 0);

  let badgeType: BadgeType = null;
  if (allReady || effectiveKs === 'ready') badgeType = 'ready';
  else if (effectiveKs === 'preparing' || effectiveKs === 'cooking') badgeType = 'preparing';
  else if (confirmedIds.has(order.id)) badgeType = 'confirmed';
  else if (order.status === 'confirmed' || order.status === 'new') badgeType = 'waiting';

  const total = (order.order_items?.reduce((s, i) => s + (i.total_price || 0), 0) ?? order.total_amount) ?? 0;
  const itemCount = order.order_items?.length ?? 0;
  const totalItems = itemCount + mergedChildOrders.reduce((s, o) => s + (o.order_items?.length ?? 0), 0);

  return (
    <motion.div
      layoutId={order.id}
      onClick={onClick}
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.98 }}
      className="relative h-full w-[200px] flex-shrink-0 bg-white/[0.04] border border-white/[0.08] rounded-xl overflow-hidden cursor-pointer transition-colors hover:bg-white/[0.07] hover:border-white/15 flex flex-col"
    >
      {/* Top status line */}
      {badgeType === 'ready' && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-400/70 via-emerald-400 to-emerald-400/70" />
      )}
      {(badgeType === 'preparing' || effectiveKs === 'cooking') && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-400/70 via-blue-400 to-blue-400/70" />
      )}
      {(order.status === 'new' && !badgeType) && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-orange-400/70 via-orange-400 to-orange-400/70" />
      )}

      <div className="flex-1 flex flex-col justify-center px-3 py-2">
        {/* Row 1: table number */}
        <div className="flex items-center justify-between mb-1">
          <span className="font-black text-lg leading-none tracking-tight" style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D67B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {isMergedCard ? `${t('group_label')} ${groupNumber}` : order.table_number ?? '—'}
          </span>
          <MiniBadge badgeType={badgeType} />
        </div>

        {/* Row 2: items summary */}
        <div className="flex items-center gap-2 text-[10px] text-white/50">
          <span className="font-medium">{totalItems} {t('products')}</span>
          {order.guest_count && order.guest_count > 1 && (
            <span className="flex items-center gap-0.5 text-white/30"><Users size={8} />{order.guest_count}</span>
          )}
          <span className="text-white/20">•</span>
          <span className="font-black text-xs tabular-nums text-white/80">{total.toFixed(2)} ₼</span>
        </div>

        {/* Row 3: time + order type */}
        <div className="flex items-center gap-1.5 mt-0.5 text-[9px] text-white/30">
          <Clock size={9} />
          <span>{timeAgo(order.created_at, t)}</span>
          <span className="text-white/15">|</span>
          {order.order_type === 'takeaway' ? <ShoppingBag size={9} className="text-amber-400/60" />
            : order.order_type === 'delivery' ? <Package size={9} className="text-slate-300/60" />
            : <Utensils size={9} className="text-emerald-400/60" />}
        </div>
      </div>
    </motion.div>
  );
});
