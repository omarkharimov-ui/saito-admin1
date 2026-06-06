'use client';

import React from 'react';
import { Clock, Layers, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import type { Order, BadgeType } from '../types';
import { timeAgo, getOrderAgeMinutes, getProgressProps, getStatusConfig } from '../utils';
import { useTheme } from '@/lib/theme/ThemeContext';

/* ─── KitchenBadge ─── */
const KitchenBadge = React.memo(function KitchenBadge({ badgeType }: { badgeType: BadgeType }) {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  if (!badgeType) return null;
  const base = 'text-[9px] font-black px-2.5 py-1 rounded-full inline-flex items-center gap-1';
  const anim = {
    initial: { opacity: 0, scale: 0.75 },
    animate: { opacity: 1, scale: 1 },
    exit:    { opacity: 0, scale: 0.75 },
    transition: { duration: 0.18, ease: 'easeOut' as const },
  };
  const badge =
    badgeType === 'ready'     ? <motion.span key="ready"     {...anim} className={`${base} bg-emerald-500/15 text-emerald-400 border border-emerald-500/30`}>{t('badge_ready')}</motion.span> :
    badgeType === 'preparing' ? <motion.span key="preparing" {...anim} className={`${base} bg-blue-500/15 text-blue-400 border border-blue-500/30`}>{t('badge_preparing')}</motion.span> :
    badgeType === 'confirmed' ? <motion.span key="confirmed" {...anim} className={`${base}border ${lightMode ? 'bg-gray-100 text-gray-600 border-gray-300' : 'bg-white/5 text-white/70 border-white/20'}`}>{t('badge_confirmed')}</motion.span> :
    <motion.span key="waiting" {...anim} className={`${base}border ${lightMode ? 'bg-gray-100 text-gray-500 border-gray-200' : 'bg-white/5 text-white/50 border-white/10'}`}>{t('badge_waiting')}</motion.span>;
  return <AnimatePresence mode="wait" initial={false}>{badge}</AnimatePresence>;
});


/* ─── Active Order Card ─── */
interface ActiveCardProps {
  order: Order;
  allOrders: Order[];
  updatedLabels: Map<string, string>;
  flashIds: Set<string>;
  confirmedIds: Set<string>;
  delayThreshold: number;
  onClick: () => void;
}

export const ActiveOrderCard = React.memo(function ActiveOrderCard({
  order, allOrders, updatedLabels, flashIds, confirmedIds, delayThreshold, onClick,
}: ActiveCardProps) {
  const { t, language } = useLanguage();
  const { lightMode } = useTheme();

  const badgeLabel = updatedLabels.get(order.id);
  const isUpdated  = !!badgeLabel;
  const ageMin     = order.kitchen_accepted_at ? getOrderAgeMinutes(order.kitchen_accepted_at) : 0;
  const cappedAge  = Math.min(ageMin, delayThreshold);
  const effectiveKsEarly = order.kitchen_status as string | null;
  const prog       = getProgressProps(cappedAge, delayThreshold, order.kitchen_status);
  const progressGlow =
    effectiveKsEarly === 'ready' || effectiveKsEarly === 'preparing' || effectiveKsEarly === 'cooking'
      ? '0 0 6px rgba(59,130,246,0.35)'
      : 'none';

  const isKitchenReady = order.kitchen_status === 'ready' ||
    ((order.order_items || []).length > 0 && (order.order_items || []).every((it: any) => (it.prepared_quantity ?? 0) >= (it.quantity ?? 0)));

  const mergedChildOrders = allOrders.filter(o => o.merged_into === order.id && o.table_number !== null);
  const mergedFromTables = mergedChildOrders.map(o => o.table_number as number);
  const isMergedCard = mergedFromTables.length > 0;

  // Calculate group number based on creation order of merged groups (1-based)
  const groupNumber = React.useMemo(() => {
    if (!isMergedCard) return 0;
    const allMergedParents = allOrders
      .filter(o => o.status !== 'paid' && o.table_number !== null && allOrders.some(c => c.merged_into === o.id))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const index = allMergedParents.findIndex(o => o.id === order.id);
    return index + 1;
  }, [isMergedCard, allOrders, order.id]);

  
  // All items from parent + all merged children (for readiness check only)
  const allMergedItems = [
    ...(order.order_items || []),
    ...mergedChildOrders.flatMap(o => o.order_items || []),
  ];
  const allReady = allMergedItems.length > 0 && allMergedItems.every((it: any) => (it.prepared_quantity ?? 0) >= (it.quantity ?? 0));

  // kitchen_status: use only parent order's status (children are paid/archived after merge)
  const effectiveKs = order.kitchen_status as string | null;

  const isEmptyGroup = isMergedCard && (!order.order_items || order.order_items.length === 0);

  let badgeType: BadgeType = null;
  if (allReady || effectiveKs === 'ready') badgeType = 'ready';
  else if (effectiveKs === 'preparing' || effectiveKs === 'cooking') badgeType = 'preparing';
  else if (confirmedIds.has(order.id)) badgeType = 'confirmed';
  else if (order.status === 'confirmed' || order.status === 'new') badgeType = 'waiting';

  const ks = effectiveKs;
  const borderClass =
    isEmptyGroup           ? 'shadow-[0_4px_24px_rgba(0,0,0,0.2)]' :
    isMergedCard           ? 'shadow-[0_8px_32px_rgba(0,0,0,0.4)]' :
    flashIds.has(order.id) ? 'shadow-[0_8px_32px_rgba(0,0,0,0.4)]' :
    'shadow-[0_4px_24px_rgba(0,0,0,0.28)]';

  const total = (order.order_items?.reduce((s, i) => s + (i.total_price || 0), 0) ?? order.total_amount) ?? 0;

  /* ── status dot color (mobile terminal) ── */
  const dotColor =
    isEmptyGroup                                                        ? 'bg-white/[0.12]' :
    badgeType === 'ready'                                               ? 'bg-emerald-400' :
    badgeType === 'preparing'                                           ? 'bg-blue-400' :
    order.status === 'new'                                              ? 'bg-orange-400' :
    (cappedAge >= delayThreshold && !!order.kitchen_accepted_at && ks !== 'preparing' && ks !== 'cooking')
                                                                          ? 'bg-amber-400' :
                                                                          'bg-white/30';

  return (
    <>
      {/* ══════════════════════════════════════
          MOBILE  — Zero-Card Brutalist Terminal
          (hidden on md+)
         ══════════════════════════════════════ */}
      <div
        onClick={onClick}
        className={`md:hidden relative cursor-pointer border-b transition-colors duration-150 active:bg-white/[0.04] ${lightMode ? 'border-gray-200' : 'border-white/[0.06]'}${isEmptyGroup ? 'opacity-40' : ''}`}
        style={{ background: 'transparent' }}
      >
        {/* left status bar */}
        <div className={`absolute left-0 top-0 bottom-0 w-[2px] ${dotColor}`}
          style={badgeType === 'ready' ? { boxShadow: '0 0 8px rgba(52,211,153,0.6)' }
            : badgeType === 'preparing' ? { boxShadow: '0 0 8px rgba(96,165,250,0.5)' }
            : order.status === 'new' ? { boxShadow: '0 0 8px rgba(251,146,60,0.5)' }
            : undefined}
        />

        <div className="pl-4 pr-3 py-3">
          {/* row 1: table number + time + total */}
          <div className="flex items-baseline justify-between mb-1.5">
            <div className="flex items-baseline gap-2">
              {/* big table number */}
              <span
                className={`font-black tabular-nums leading-none ${isEmptyGroup ? 'text-white/20 text-2xl' : 'text-white text-2xl'}`}
                style={!isEmptyGroup && !isMergedCard
                  ? { background: 'linear-gradient(135deg,#D4AF37,#F5D67B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }
                  : undefined}
              >
                {isMergedCard
                  ? `${t('group_label').toUpperCase()} ${groupNumber}`
                  : order.table_number ?? '—'}
              </span>
              {/* time */}
              <span className={`text-[10px] font-mono tabular-nums ${lightMode ? 'text-gray-300' : 'text-white/25'}`}>{timeAgo(order.created_at, t)}</span>
            </div>
            {/* total — right, serif feel */}
            {!isEmptyGroup && (
              <span className="font-black text-base tabular-nums"
                style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D67B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                {total.toFixed(2)} ₼
              </span>
            )}
          </div>

          {/* row 2: items inline stream */}
          {!isEmptyGroup && order.order_items && order.order_items.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {order.order_items.slice(0, 4).map(item => (
                <div key={item.id} className="flex items-baseline justify-between">
                  <span className={`text-[11px] font-medium truncate mr-2 leading-snug ${lightMode ? 'text-gray-500' : 'text-white/60'}`}>
                    {(item.products as any)?.[`name_${language}`] || (item.products as any)?.name_az || item.product_name}
                    <span className={`ml-1 font-mono ${lightMode ? 'text-gray-300' : 'text-white/25'}`}>— {item.quantity}x</span>
                  </span>
                  <span className={`text-[10px] tabular-nums flex-shrink-0 ${lightMode ? 'text-gray-400' : 'text-white/35'}`}>{item.total_price?.toFixed(2)}</span>
                </div>
              ))}
              {order.order_items.length > 4 && (
                <span className={`text-[10px] font-mono mt-0.5 ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>+{order.order_items.length - 4}</span>
              )}
            </div>
          ) : isEmptyGroup ? (
            <span className={`text-[10px] font-mono ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>{t('empty_group_kitchen_hint')}</span>
          ) : (
            <span className={`text-[10px] font-mono ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>{t('no_product_data')}</span>
          )}

          {/* progress bar (cooking) */}
          {order.status !== 'paid' && !isKitchenReady && !!order.kitchen_accepted_at && (
            <div className={`mt-2 h-[1px] w-full overflow-hidden ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${prog.pct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                style={{
                  height: '100%',
                  backgroundImage: `linear-gradient(90deg, ${prog.from}, ${prog.to})`,
                  boxShadow: progressGlow,
                }}
              />
            </div>
          )}

          {order.customer_note && (
            <p className={`text-[10px] italic mt-1 font-mono truncate ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>// {order.customer_note}</p>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════
          DESKTOP md+  — original card design
         ══════════════════════════════════════ */}
      <div
        onClick={onClick}
        className={`hidden md:flex relative backdrop-blur-xl border rounded-2xl overflow-hidden flex-col cursor-pointer transition-all duration-300 hover:-translate-y-1 group/card md:min-h-[280px] ${lightMode ? 'border-gray-200' : 'border-white/[0.08]'}${isEmptyGroup ? 'bg-white/[0.015]' : 'bg-white/[0.03]'} ${borderClass}`}
      >
        {order.status === 'new' && (
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-orange-500/70 to-transparent" />
        )}
        {order.status === 'confirmed' && (
          <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent to-transparent ${
            order.kitchen_status === 'ready' ? 'via-emerald-400/70' :
            (order.kitchen_status === 'cooking' || order.kitchen_status === 'preparing') ? 'via-blue-400/70' : 'via-amber-400/50'
          }`} />
        )}
        <div className={`px-5 pt-5 pb-3 border-b ${lightMode ? 'border-gray-200' : 'border-white/[0.05]'}`}>
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0 flex-1">
              {isMergedCard ? (
                <p className="font-black text-2xl tracking-wider leading-none whitespace-nowrap"
                  style={isEmptyGroup ? { color: 'rgba(255,255,255,0.25)' } : { background: 'linear-gradient(135deg,#D4AF37,#F5D67B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  {t('group_label')} {groupNumber}
                </p>
              ) : (
                <p className="font-black text-2xl tracking-wider leading-none"
                  style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D67B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  {order.table_number ? `${t('table_label')} ${order.table_number}` : '—'}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                {isEmptyGroup
                  ? <motion.span key="draft" initial={{ opacity: 0, scale: 0.75 }} animate={{ opacity: 1, scale: 1 }} className={`text-[9px] font-black px-2.5 py-1 rounded-full inline-flex items-center gap-1 border uppercase tracking-widest ${lightMode ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-white/[0.06] text-white/30 border-white/10'}`}>{t('draft')}</motion.span>
                  : badgeType && <KitchenBadge badgeType={badgeType} />}
              </div>
              {badgeLabel && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: [1, 0.4, 1, 0.4, 1, 0.4, 1], scale: 1 }}
                  transition={{ duration: 3, times: [0, 0.15, 0.3, 0.45, 0.6, 0.75, 1], ease: 'easeInOut' }}
                  className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${badgeLabel === t('updated').toUpperCase() ? 'bg-white/10 text-white/50' : 'bg-gold text-black'}`}
                >
                  {badgeLabel}
                </motion.span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={10} className={`flex-shrink-0 ${lightMode ? 'text-gray-500' : 'text-white/50'}`} />
            <span className={`text-xs ${lightMode ? 'text-gray-500' : 'text-white/50'}`}>{timeAgo(order.created_at, t)}</span>
          </div>
          {order.status !== 'paid' && !isKitchenReady && !!order.kitchen_accepted_at && (
            <div className={`mt-2.5 h-[3px] w-full rounded-full overflow-hidden ${lightMode ? 'bg-gray-100' : 'bg-white/[0.06]'}`}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${prog.pct}%` }} transition={{ duration: 0.8, ease: 'easeOut' }}
                style={{ height: '100%', borderRadius: 9999, backgroundImage: `linear-gradient(90deg, ${prog.from}, ${prog.to}, ${prog.from})`, backgroundSize: '200% 100%', backgroundColor: 'transparent', boxShadow: prog.glow, animation: 'progressShimmer 1.8s linear infinite' }}
              />
            </div>
          )}
        </div>
        <div className="flex-1 px-5 py-4 space-y-2.5">
          {isMergedCard && (!order.order_items || order.order_items.length === 0) && (
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg">
              <span className={`text-[10px] font-medium tracking-wide ${lightMode ? 'text-gray-400' : 'text-white/40'}`}>{t('empty_group_kitchen_hint')}</span>
            </div>
          )}
          {order.order_items && order.order_items.length > 0 ? (
            order.order_items.slice(0, 3).map(item => (
              <div key={item.id} className="flex justify-between items-center">
                <span className={`text-[15px] font-medium truncate mr-1 ${lightMode ? 'text-gray-900' : 'text-white'}`}>
                  {(item.products as any)?.[`name_${language}`] || (item.products as any)?.name_az || item.product_name}
                  <span className={`ml-1 text-xs font-normal ${lightMode ? 'text-gray-500' : 'text-white/60'}`}>×{item.quantity}</span>
                </span>
                <span className={`flex-shrink-0 text-sm tabular-nums font-semibold ${lightMode ? 'text-gray-700' : 'text-white/80'}`}>{item.total_price?.toFixed(2)} ₼</span>
              </div>
            ))
          ) : !isMergedCard && <p className={`text-sm ${lightMode ? 'text-gray-500' : 'text-white/50'}`}>{t('no_product_data')}</p>}
          {order.order_items && order.order_items.length > 3 && (
            <p className={`text-xs ${lightMode ? 'text-gray-500' : 'text-white/55'}`}>+{order.order_items.length - 3} {t('more_products').replace('{count}', '').trim()}</p>
          )}
          {order.customer_note && (
            <p className={`text-xs italic pt-2 border-t mt-1 ${lightMode ? 'text-gray-500 border-gray-200' : 'text-white/55 border-white/[0.08]'}`}>"{order.customer_note}"</p>
          )}
        </div>
        <div className={`px-5 py-3.5 border-t bg-white/[0.015] ${lightMode ? 'border-gray-200' : 'border-white/[0.05]'}`}>
          <div className="flex items-center justify-between">
            <span className={`text-[10px] uppercase tracking-widest ${lightMode ? 'text-gray-600' : 'text-white/70'}`}>{t('total_label')}</span>
            <span className="font-black text-xl tabular-nums" style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D67B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {total.toFixed(2)} ₼
            </span>
          </div>
        </div>
      </div>
    </>
  );
});

/* ─── Archive Order Card ─── */
interface ArchiveCardProps {
  order: Order;
  allOrders?: Order[];
  onClick: () => void;
}

export const ArchiveOrderCard = React.memo(function ArchiveOrderCard({ order, allOrders = [], onClick }: ArchiveCardProps) {
  const { t, language } = useLanguage();
  const { lightMode } = useTheme();
  // @ts-ignore
  const cfg = getStatusConfig(t)[order.status] ?? getStatusConfig(t).paid;

  const mergedFromTables = (order.merged_orders || [])
    .filter(o => o.table_number !== null)
    .map(o => o.table_number as number);
  const isMerged = mergedFromTables.length > 0;

  // Calculate group number for archived merged orders
  const groupNumber = React.useMemo(() => {
    if (!isMerged) return 0;
    // Use the parent order's table_number as the group number
    return order.table_number || 0;
  }, [isMerged, order.table_number]);

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] } }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
      whileHover={{ scale: 1.02, transition: { duration: 0.18 } }}
      onClick={onClick}
      className={`relative backdrop-blur-md border rounded-2xl overflow-hidden flex flex-col cursor-pointer transition-all duration-300 hover:bg-white/[0.09] hover:border-white/[0.2] hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)] min-h-[190px] md:min-h-[260px] ${lightMode ? 'bg-gray-100 border-gray-300' : 'bg-white/[0.06] border-white/[0.12]'}`}
    >
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      <div className={`px-3 pt-3 pb-2 md:px-5 md:pt-5 md:pb-3 border-b ${lightMode ? 'border-gray-200' : 'border-white/[0.05]'}`}>
        <div className="flex items-start justify-between gap-2 mb-2">
          {isMerged ? (
            <div className="flex items-center gap-3">
              <p className="font-black text-lg md:text-2xl tracking-wider leading-none"
                style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D67B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                {t('group_label')} {groupNumber}
              </p>
            </div>
          ) : (
            <p className="font-black text-lg md:text-2xl tracking-wider leading-none whitespace-nowrap"
              style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D67B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {order.table_number ? `${t('table_label')} ${order.table_number}` : '—'}
            </p>
          )}
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full bg-white/[0.12] border ${lightMode ? 'text-gray-500 border-gray-300' : 'text-white/60 border-white/[0.15]'}`}>{cfg.label}</span>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 text-xs ${lightMode ? 'text-gray-600' : 'text-white/65'}`}>
          <Clock size={10} className={lightMode ? 'text-gray-600' : 'text-white/65'} />
          {new Date(order.created_at).toLocaleDateString(
            language === 'az' ? 'az-AZ' : language === 'ru' ? 'ru-RU' : 'en-US',
            { day: 'numeric', month: 'long', year: 'numeric' }
          )}
        </div>
      </div>

      <div className="flex-1 px-3 py-2 md:px-5 md:py-4 space-y-1.5 md:space-y-2.5">
        {order.order_items && order.order_items.length > 0 ? (
          order.order_items.slice(0, 3).map(item => (
            <div key={item.id} className="flex justify-between items-center">
              <span className={`text-[12px] md:text-sm truncate mr-1 ${lightMode ? 'text-gray-900' : 'text-white'}`}>
                {(item.products as any)?.[`name_${language}`] || (item.products as any)?.name_az || item.product_name}
                <span className={`ml-1 text-[10px] md:text-xs ${lightMode ? 'text-gray-600' : 'text-white/65'}`}>×{item.quantity}</span>
              </span>
              <span className={`flex-shrink-0 text-[11px] md:text-xs tabular-nums ${lightMode ? 'text-gray-700' : 'text-white/80'}`}>{item.total_price?.toFixed(2)} ₼</span>
            </div>
          ))
        ) : (
          <p className={`text-xs ${lightMode ? 'text-gray-500' : 'text-white/60'}`}>{t('no_product_data')}</p>
        )}
        {order.order_items && order.order_items.length > 3 && (
          <p className={`text-xs ${lightMode ? 'text-gray-600' : 'text-white/65'}`}>+{order.order_items.length - 3} {t('more_products').replace('{count}', '').trim()}</p>
        )}
      </div>

      <div className={`px-3 py-2.5 md:px-5 md:py-3.5 border-t flex items-center justify-between ${lightMode ? 'border-gray-200 bg-gray-50/80' : 'border-white/[0.08] bg-white/[0.04]'}`}>
        <span className={`text-[10px] uppercase tracking-widest ${lightMode ? 'text-gray-600' : 'text-white/70'}`}>{t('total_label')}</span>
        <span className="font-black text-base md:text-xl tabular-nums"
          style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D67B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          {(order.order_items?.reduce((s, i) => s + (i.total_price || 0), 0) ?? order.total_amount)?.toFixed(2)} ₼
        </span>
      </div>
    </motion.div>
  );
});
