'use client';

// 2026-09-25 (owner, redesign round 3): ONE card family for both fulfillment
// boards (Delivery + Takeaway) — partner AND in-house orders.
//
// Owner rules (round 3):
//   - light mode looked "sonuk" (dull) → accent-tinted border + stronger glow
//     in light mode (same language as dark, more present)
//   - in-house cards get the same tidy layout BUT ALL their data is kept
//     (customer+phone, address, zone, courier/ETA — nothing removed)
//   - TOTAL text is NEVER yellow/gold: white on dark cards, near-black on
//     light cards. Brand accents stay on glow / logo / ETA chip / icons only.
//
// Partner-specific (round 2, unchanged): #code large, native logo + courier
// ETA chip top-right, muted rows, no zone row (customer set it in the
// partner app). In-house-specific: "Çatdırılma 41" label+number, elapsed
// chip, zone row, emerald/blue board accent.
//
// Flex-flow layout (no absolute stacking) → text overlap is structurally
// impossible; rows truncate; middle block is overflow-hidden.
import { User, Phone, MapPin, Bike, Clock, MoreVertical, Route, CheckCircle2 } from 'lucide-react';
import { partnerMeta, type PartnerId } from '../lib/partners';
import { PartnerLogo } from './PartnerBadge';
import type { OrderStage } from '@/lib/order-stage';

/** Accent text variants readable on dark surfaces (chip / icons). */
const TEXT_ON_DARK: Record<PartnerId, string> = {
  bolt: '#34D186', uber_eats: '#12D47C', glovo: '#FDC500', wolt: '#7D92FF',
};
const TEXT_ON_LIGHT: Record<PartnerId, string> = {
  bolt: '#0A9B67', uber_eats: '#047857', glovo: '#A16207', wolt: '#0022E6',
};

/** In-house board accents (the classic board identity). */
const BOARD_ACCENT: Record<'delivery' | 'takeaway', string> = {
  delivery: '#3B82F6',   // blue (Bike board)
  takeaway: '#10B981',   // emerald (Gel-Al board)
};

export interface BoardOrderCardProps {
  order: any;
  kind: 'delivery' | 'takeaway';
  stage: OrderStage;
  status: { bg: string; text: string; dot: string; bgDark: string; textDark: string; dotDark: string; labelKey: string };
  lightMode: boolean;
  t: (k: any) => string;
  onSelect: (order: any) => void;
  onAction: (order: any) => void;
}

export default function BoardOrderCard({ order, kind, stage, status, lightMode, t, onSelect, onAction }: BoardOrderCardProps) {
  const p = partnerMeta(order.partner_source);
  const isPartner = !!p;
  const accent = p ? p.accent : BOARD_ACCENT[kind];
  const accentText = p ? (lightMode ? TEXT_ON_LIGHT[p.id] : TEXT_ON_DARK[p.id]) : (lightMode ? (kind === 'delivery' ? '#1D4ED8' : '#047857') : (kind === 'delivery' ? '#60A5FA' : '#34D399'));

  const orderNo = (String(order.order_number || '').replace(/[^0-9]/g, '')) || String(order.id).slice(-4).toUpperCase();
  const elapsed = order.created_at
    ? Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000)
    : 0;
  const elapsedText = elapsed < 1 ? '< 1 min' : elapsed < 60 ? `${elapsed} min` : elapsed < 1440 ? `${Math.floor(elapsed / 60)}s ${elapsed % 60}d` : `${Math.floor(elapsed / 1440)}g`;
  const addressLine = [order.delivery_street, order.delivery_building].filter(Boolean).join(' ')
    || order.delivery_address
    || (order.delivery_district ? `${order.delivery_district}` : '');
  const zoneShown = kind === 'delivery' && !!order.delivery_zone && !(isPartner);
  const courierEtaAbs = order.estimated_delivery_time
    ? new Date(order.estimated_delivery_time).toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' })
    : null;

  const muted = lightMode ? 'text-zinc-500' : 'text-[#8E8E93]';
  const dimmer = lightMode ? 'text-zinc-400' : 'text-white/40';

  return (
    <div
      onClick={() => onSelect(order)}
      className={`relative h-[180px] rounded-4xl p-5 flex flex-col overflow-hidden border cursor-pointer transition-all duration-200 group ${
        lightMode ? 'bg-white shadow-sm hover:shadow' : 'bg-[#141419] shadow-lg shadow-black/30 hover:shadow-black/50'
      }`}
      style={{ borderColor: lightMode ? accent + '59' : 'rgba(255,255,255,0.10)' }}
    >
      {/* Smoky brand glow — PARTNER CARDS ONLY (owner round 4: "tüstü"
          effekti 3-cü tərəf üçün; restoran içi kartlarda yoxdur).
          Stronger in light mode — round-3 "sonuk" fix. */}
      {isPartner && (
        <span
          aria-hidden
          className="pointer-events-none absolute -top-10 -left-10 h-40 w-40 rounded-full"
          style={{
            background: `radial-gradient(circle, ${accent}${lightMode ? '59' : '40'} 0%, transparent 68%)`,
            filter: 'blur(18px)',
          }}
        />
      )}

      {/* ── Top bar ──
          2026-09-25 (owner, live POS bug): the elapsed/ETA chip WRAPPED to two
          lines ("9 / min") when the wide partner logo squeezed the flex row —
          "əgəzlər kimi". Fix: chips + logo are shrink-0/nowrap, the title is
          the only flexible (truncatable) item. */}
      <div className="relative flex items-center justify-between gap-2">
        {/* The order number is the #1 datum — NEVER truncated (owner). In tight
            rows the LOGO shrinks instead (shrinkable), chip/menu stay fixed. */}
        <span className={`text-[24px] leading-none font-black tracking-tighter whitespace-nowrap flex-shrink-0 ${lightMode ? 'text-gray-900' : 'text-white'}`}>
          {isPartner ? `#${orderNo}` : `${t(kind === 'delivery' ? 'delivery_short' : 'takeaway_short')} ${orderNo}`}
        </span>
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {isPartner && kind === 'delivery' && order.courier_eta ? (
            <span
              className="flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-bold tabular-nums whitespace-nowrap shrink-0"
              style={{ backgroundColor: accent + (lightMode ? '26' : '1f'), color: accentText }}
              title="Kurye gəliş vaxtı (partner app-dan)"
            >
              <Clock size={9} strokeWidth={2.75} className="shrink-0" />
              {order.courier_eta}
            </span>
          ) : elapsed > 0 ? (
            <span className={`flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-bold tabular-nums whitespace-nowrap shrink-0 ${lightMode ? 'bg-zinc-100 text-zinc-500' : 'bg-white/5 text-white/45'}`}>
              <Clock size={9} strokeWidth={2.75} className="shrink-0" />
              {elapsedText}
            </span>
          ) : null}
          {isPartner && <PartnerLogo source={order.partner_source} height={16} lightMode={lightMode} shrinkable />}
          <button
            onClick={() => onAction(order)}
            className={`w-7 h-7 -mr-1 rounded-lg flex items-center justify-center transition-all ${lightMode ? 'text-zinc-300 hover:bg-zinc-100 hover:text-zinc-500' : 'text-white/30 hover:bg-white/10 hover:text-white/60'}`}
          >
            <MoreVertical size={13} />
          </button>
        </div>
      </div>

      {/* ── Middle: muted rows (in-house keeps ALL data) ── */}
      <div className="relative mt-3 flex flex-col gap-[3px] min-h-0 overflow-hidden">
        <div className="flex items-center gap-1.5 min-w-0 leading-[15px]">
          <User size={11} className="shrink-0 opacity-70" style={{ color: accentText }} />
          <span className={`text-[11px] font-bold truncate ${muted}`}>{order.customer_name || '—'}</span>
          {/* delivery: phone inline (classic layout); takeaway: phone gets its
              own row below — never both (QA bug 4, 2026-09-22) */}
          {kind === 'delivery' && order.customer_phone && (
            <span className={`text-[11px] font-semibold tabular-nums truncate ${dimmer}`}>{order.customer_phone}</span>
          )}
        </div>
        {kind === 'takeaway' && (
          <div className="flex items-center gap-1.5 min-w-0 leading-[15px]">
            <Phone size={11} className="shrink-0 opacity-70" style={{ color: accentText }} />
            <span className={`text-[10.5px] font-semibold tabular-nums truncate ${dimmer}`}>
              {order.customer_phone || '—'}
            </span>
          </div>
        )}
        {kind === 'delivery' && addressLine && (
          <div className="flex items-center gap-1.5 min-w-0 leading-[15px]">
            <MapPin size={11} className={`shrink-0 ${dimmer}`} />
            <span className={`text-[10.5px] font-semibold truncate ${dimmer}`}>
              {addressLine}{order.delivery_district && !addressLine.includes(order.delivery_district) ? `, ${order.delivery_district}` : ''}
            </span>
          </div>
        )}
        {zoneShown && (
          <div className="flex items-center gap-1.5 min-w-0 leading-[15px]">
            <Route size={11} className={`shrink-0 ${lightMode ? 'text-purple-400' : 'text-purple-300/70'}`} />
            <span className={`text-[10.5px] font-semibold truncate ${dimmer}`}>{order.delivery_zone}</span>
          </div>
        )}
        {(order.courier_name || courierEtaAbs) && (
          <div className="flex items-center gap-1.5 min-w-0 leading-[15px]">
            <Bike size={11} className="shrink-0 opacity-80" style={{ color: accentText }} />
            <span className={`text-[11px] font-bold truncate ${lightMode ? 'text-zinc-700' : 'text-white/80'}`}>{order.courier_name || '—'}</span>
            {order.courier_phone && (
              <span className={`text-[10.5px] font-semibold tabular-nums truncate ${dimmer}`}>{order.courier_phone}</span>
            )}
            {courierEtaAbs && (
              <span className={`text-[10.5px] font-semibold tabular-nums shrink-0 ${dimmer}`}>· {courierEtaAbs}</span>
            )}
          </div>
        )}
      </div>

      {/* ── Bottom: status pill + total (NEVER yellow: white / near-black) ── */}
      <div className="relative mt-auto flex items-center justify-between gap-2">
        <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${lightMode ? status.bg : status.bgDark}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${lightMode ? status.dot : status.dotDark}`} />
          <span className={lightMode ? status.text : status.textDark}>{t(status.labelKey as any)}</span>
        </span>
        <span className={`inline-flex items-center gap-1 text-[15px] font-black tabular-nums tracking-tight ${lightMode ? 'text-gray-900' : 'text-white'}`}>
          {(stage === 'paid' || stage === 'ready') && <CheckCircle2 size={13} strokeWidth={2.5} className={lightMode ? 'text-emerald-500' : 'text-emerald-400'} />}
          ₼{Number(order.total_amount || 0).toFixed(2)}
        </span>
      </div>
    </div>
  );
}
