'use client';

// 2026-09-25 (owner redesign round 2 — "Slick Dark / Smoky" concept):
//   <PartnerLogo source="bolt"/>  → native partner logo (transparent bg, no
//     white sticker) — top-right of order cards, next to the ETA chip
//   <PartnerGlow source="bolt"/>  → soft blurred radial brand glow in the
//     card's top-left corner (replaces the hard stripe + flat tint on cards)
//   <PartnerStripe source="bolt"/>→ 3px brand stripe — KDS/BDS tickets only
//     (dense grid: a thin signal line reads better than a glow)
//   <PartnerBadge  source="bolt"/>→ white-chip logo — settings catalog card
import { partnerMeta } from '../lib/partners';

/** Native partner logo (no chip). `variant` picks the asset that works on
 *  the card background (dark card → logo, white card → logoLight).
 *  `shrinkable` = the logo may compress (min-width:0) in tight flex rows —
 *  used by BoardOrderCard top bars so the ORDER NUMBER keeps its space and
 *  only the logo gives way (owner: number must never be truncated away). */
export function PartnerLogo({ source, height = 18, variant = 'auto', lightMode = false, shrinkable = false }: {
  source?: string | null;
  height?: number;
  variant?: 'auto' | 'dark' | 'light';
  lightMode?: boolean;
  shrinkable?: boolean;
}) {
  const p = partnerMeta(source);
  if (!p) return null;
  const onLight = variant === 'light' || (variant === 'auto' && lightMode);
  return (
    <img
      src={onLight ? p.logoLight : p.logo}
      alt={p.name}
      title={`Sifariş mənbəyi: ${p.name}`}
      draggable={false}
      className={`${shrinkable ? 'min-w-0' : 'flex-shrink-0'} select-none`}
      style={{ height, width: 'auto', maxWidth: 72, objectFit: 'contain', opacity: 0.95 }}
    />
  );
}

/** Soft "smoky" brand glow: blurred radial gradient in the top-left corner.
 *  Card needs `relative overflow-hidden`. */
export function PartnerGlow({ source, lightMode = false }: { source?: string | null; lightMode?: boolean }) {
  const p = partnerMeta(source);
  if (!p) return null;
  const a = p.accent;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -top-10 -left-10 h-40 w-40 rounded-full"
      style={{
        background: `radial-gradient(circle, ${a}${lightMode ? '3d' : '40'} 0%, transparent 68%)`,
        filter: 'blur(18px)',
      }}
    />
  );
}

/** 3px brand-color stripe pinned to the card's left edge (KDS/BDS tickets). */
export function PartnerStripe({ source }: { source?: string | null }) {
  const p = partnerMeta(source);
  if (!p) return null;
  return (
    <span
      aria-hidden
      className="absolute left-0 top-0 bottom-0 w-[3px]"
      style={{ backgroundColor: p.accent }}
    />
  );
}

/** White-chip logo variant — settings catalog (PartnersTab). */
export function PartnerBadge({ source, size = 'sm', showName = false }: {
  source?: string | null;
  size?: 'sm' | 'md';
  showName?: boolean;
}) {
  const p = partnerMeta(source);
  if (!p) return null;
  const h = size === 'sm' ? 14 : 20;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full overflow-hidden flex-shrink-0"
      style={{ backgroundColor: p.chipBg }}
      title={`Sifariş mənbəyi: ${p.name}`}
    >
      <span className="flex items-center" style={{ padding: '2px 5px 2px 3px' }}>
        <img
          src={p.logoLight}
          alt={p.name}
          draggable={false}
          style={{ height: h, width: 'auto', maxWidth: size === 'sm' ? 58 : 84, objectFit: 'contain' }}
        />
      </span>
      {showName && (
        <span className="pr-2 text-[9px] font-black uppercase tracking-wide text-zinc-800 whitespace-nowrap">
          {p.name}
        </span>
      )}
    </span>
  );
}

/** Flat tint — kept for backwards compat; new cards use PartnerGlow. */
export function PartnerTint({ source, lightMode }: { source?: string | null; lightMode?: boolean }) {
  const p = partnerMeta(source);
  if (!p) return null;
  return (
    <span
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      style={{ backgroundColor: p.accent, opacity: lightMode ? 0.05 : 0.07 }}
    />
  );
}
