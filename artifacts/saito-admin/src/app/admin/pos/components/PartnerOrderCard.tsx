'use client';

// 2026-09-25 (owner redesign — "Slick Dark / Smoky", Part 2):
// Partner (aggregator) order card. Business rule (Part 1): the customer
// already set address/zone/courier in the partner app, so the card is a
// KITCHEN + CASHIER tool — order code large, courier ETA + native partner
// logo top-right, customer/address/courier as MUTED supporting rows,
// status pill + total at the bottom. Soft radial brand glow (blurred)
// instead of a hard stripe/tint; flex-flow layout (no absolute stacking →
// no text overlap).
//
// Used by the POS Delivery + Takeaway boards; internal (non-partner)
// orders keep the classic card untouched.
import { User, Phone, MapPin, Bike, Clock, MoreVertical } from 'lucide-react';
import { partnerMeta, type PartnerId } from '../lib/partners';
import { PartnerGlow, PartnerLogo } from './PartnerBadge';
import type { OrderStage } from '@/lib/order-stage';

/** Accent variants that stay readable as TEXT (glow/stripe use the raw brand color). */
const TEXT_ON_DARK: Record<PartnerId, string> = {
  bolt: '#34D186', uber_eats: '#12D47C', glovo: '#FDC500', wolt: '#7D92FF',
};
const TEXT_ON_LIGHT: Record<PartnerId, string> = {
  bolt: '#0A9B67', uber_eats: '#047857', glovo: '#A16207', wolt: '#0022E6',
};

export interface PartnerOrderCardProps {
  order: any;
  kind: 'delivery' | 'takeaway';
  stage: OrderStage;
  status: { bg: string; text: string; dot: string; bgDark: string; textDark: string; dotDark: string; labelKey: string };
  lightMode: boolean;
  t: (k: any) => string;
  onSelect: (order: any) => void;
  onAction: (order: any) => void;
}

export default function PartnerOrderCard({ order, kind, stage, status, lightMode, t, onSelect, onAction }: PartnerOrderCardProps) {
  const p = partnerMeta(order.partner_source);
  if (!p) return null; // internal orders never reach this card

  const orderNo = (String(order.order_number || '').replace(/[^0-9]/g, '')) || String(order.id).slice(-4).toUpperCase();
  const accentText = lightMode ? TEXT_ON_LIGHT[p.id] : TEXT_ON_DARK[p.id];
  const elapsed = order.created_at
    ? Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000)
    : 0;
  const elapsedText = elapsed < 1 ? '< 1 min' : elapsed < 60 ? `${elapsed} min` : elapsed < 1440 ? `${Math.floor(elapsed / 60)}s ${elapsed % 60}d` : `${Math.floor(elapsed / 1440)}g`;
  const addressLine = [order.delivery_street, order.delivery_building].filter(Boolean).join(' ')
    || order.delivery_address
    || (order.delivery_district ? `${order.delivery_district}` : '');

  const muted = lightMode ? 'text-zinc-500' : 'text-[#8E8E93]';
  const dimmer = lightMode ? 'text-zinc-400' : 'text-white/40';

  return (
    <div
      onClick={() => onSelect(order)}
      className={`relative h-[180px] rounded-4xl p-5 flex flex-col overflow-hidden border cursor-pointer transition-all duration-200 group ${
        lightMode
          ? 'bg-white border-zinc-200 shadow-sm hover:border-zinc-300'
          : 'bg-[#141419] border-white/10 hover:border-white/25 shadow-lg shadow-black/30'
      }`}
    >
      {/* "Smoky" brand glow — soft, blurred, top-left corner */}
      <PartnerGlow source={order.partner_source} lightMode={lightMode} />

      {/* ── Top bar: #code large + [ETA chip] [native logo] [⋮] ── */}
      <div className="relative flex items-center justify-between">
        <span className={`text-[24px] leading-none font-black tracking-tighter ${lightMode ? 'text-gray-900' : 'text-white'}`}>
          #{orderNo}
        </span>
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {/* delivery: courier ETA from the partner (courier_eta);
              takeaway: no courier — show elapsed since order */}
          {kind === 'delivery' && order.courier_eta ? (
            <span
              className="flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-bold tabular-nums"
              style={{ backgroundColor: p.accent + (lightMode ? '22' : '1f'), color: accentText }}
              title="Kurye gəliş vaxtı (partner app-dan)"
            >
              <Clock size={9} strokeWidth={2.75} />
              {order.courier_eta}
            </span>
          ) : elapsed > 0 ? (
            <span className={`flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-bold tabular-nums ${lightMode ? 'bg-zinc-100 text-zinc-500' : 'bg-white/5 text-white/45'}`}>
              <Clock size={9} strokeWidth={2.75} />
              {elapsedText}
            </span>
          ) : null}
          <PartnerLogo source={order.partner_source} height={16} lightMode={lightMode} />
          <button
            onClick={() => onAction(order)}
            className={`w-7 h-7 -mr-1 rounded-lg flex items-center justify-center transition-all ${lightMode ? 'text-zinc-300 hover:bg-zinc-100 hover:text-zinc-500' : 'text-white/30 hover:bg-white/10 hover:text-white/60'}`}
          >
            <MoreVertical size={13} />
          </button>
        </div>
      </div>

      {/* ── Middle: muted supporting rows ── */}
      <div className="relative mt-3 flex flex-col gap-[3px] min-h-0 overflow-hidden">
        <div className="flex items-center gap-1.5 min-w-0 leading-[15px]">
          <User size={11} className="shrink-0 opacity-70" style={{ color: accentText }} />
          <span className={`text-[11px] font-bold truncate ${muted}`}>{order.customer_name || '—'}</span>
          {order.customer_phone && (
            <span className={`text-[11px] font-semibold tabular-nums truncate ${dimmer}`}>{order.customer_phone}</span>
          )}
        </div>
        {kind === 'delivery' && addressLine && (
          <div className="flex items-center gap-1.5 min-w-0 leading-[15px]">
            <MapPin size={11} className={`shrink-0 ${dimmer}`} />
            <span className={`text-[10.5px] font-semibold truncate ${dimmer}`}>
              {addressLine}{order.delivery_district && ![order.delivery_street, order.delivery_address].filter(Boolean).join(' ').includes(order.delivery_district) ? `, ${order.delivery_district}` : ''}
            </span>
          </div>
        )}
        {kind === 'delivery' && (order.courier_name || order.courier_phone) && (
          <div className="flex items-center gap-1.5 min-w-0 leading-[15px]">
            <Bike size={11} className="shrink-0 opacity-80" style={{ color: accentText }} />
            <span className={`text-[11px] font-bold truncate ${lightMode ? 'text-zinc-700' : 'text-white/80'}`}>{order.courier_name}</span>
            {order.courier_phone && (
              <span className={`text-[10.5px] font-semibold tabular-nums truncate ${dimmer}`}>{order.courier_phone}</span>
            )}
          </div>
        )}
        {kind === 'takeaway' && order.customer_phone && (
          <div className="flex items-center gap-1.5 min-w-0 leading-[15px]">
            <Phone size={11} className={`shrink-0 ${dimmer}`} />
            <span className={`text-[10.5px] font-semibold tabular-nums truncate ${dimmer}`}>{order.customer_phone}</span>
          </div>
        )}
      </div>

      {/* ── Bottom: status pill + total (gold emphasis) ── */}
      <div className="relative mt-auto flex items-center justify-between gap-2">
        <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${lightMode ? status.bg : status.bgDark}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${lightMode ? status.dot : status.dotDark}`} />
          <span className={lightMode ? status.text : status.textDark}>{t(status.labelKey as any)}</span>
        </span>
        <span className={`text-[15px] font-black tabular-nums tracking-tight ${
          stage === 'paid' || stage === 'ready'
            ? (lightMode ? 'text-emerald-600' : 'text-emerald-300')
            : (lightMode ? 'text-amber-600' : 'text-amber-300')
        }`}>
          ₼{Number(order.total_amount || 0).toFixed(2)}
        </span>
      </div>
    </div>
  );
}
