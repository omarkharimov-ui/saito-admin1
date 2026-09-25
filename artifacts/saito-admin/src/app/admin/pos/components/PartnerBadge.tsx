'use client';

// 2026-09-25 (owner): partner source branding on order cards —
//   <PartnerBadge source="bolt"/>  → white chip with the partner logo
//   <PartnerStripe source="bolt"/> → 3px brand-color left stripe on the card
// Used by the POS delivery/takeaway boards, KDS tickets and (via KDSView)
// the Bar Display, so a Bolt order is recognizable at a glance everywhere.
import { partnerMeta } from '../lib/partners';

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
          src={p.logo}
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

/** 3px brand-color stripe pinned to the card's left edge (card needs overflow-hidden). */
export function PartnerStripe({ source }: { source?: string | null }) {
  const p = partnerMeta(source);
  if (!p) return null;
  return (
    <span
      aria-hidden
      className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l"
      style={{ backgroundColor: p.accent }}
    />
  );
}

/** Soft brand tint for the card background (subtle, behind content). */
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
