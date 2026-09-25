// 2026-09-25 (owner, redesign round 2): connected delivery partners
// (Bolt Food / Uber Eats / Glovo / Wolt). Brand assets live in /public/partners
// (Wikimedia-licensed logos). Business rule (owner): partner orders are
// KITCHEN + CASHIER management — the customer already set address/zone/courier
// in the partner app, so order cards show ORDER CODE + composition (KDS) +
// courier ETA + partner status. No re-entry of address/zone in the POS.
//
// Visual language (owner "Slick Dark / Smoky" concept):
//   - native logo (no white sticker chip) top-right, next to the ETA chip
//   - soft radial brand GLOW (blurred, top-left corner) instead of a hard stripe
//   - the accent color is the partner's real brand color, so the same card
//     system works for all four partners on one board.
// The 3px PartnerStripe is kept for KDS/BDS tickets (dense grid — a thin
// signal line beats a glow there).
export type PartnerId = 'bolt' | 'uber_eats' | 'glovo' | 'wolt';

export interface PartnerMeta {
  id: PartnerId;
  name: string;
  logo: string;      // native (transparent) logo for dark cards + KDS
  logoLight: string; // variant that works on white (settings tab, light cards)
  accent: string;    // brand color (glow, ETA chip, KDS stripe)
  chipBg: string;    // logo chip background for the settings catalog
  blurb: string;     // settings tab description (az)
}

export const PARTNERS: Record<PartnerId, PartnerMeta> = {
  bolt: {
    id: 'bolt', name: 'Bolt Food', logo: '/partners/bolt.svg', logoLight: '/partners/bolt-light.svg',
    accent: '#34D186', chipBg: '#ffffff',
    blurb: 'Bolt Food sifarişləri POS-a düşəndə kartda Bolt brendinqi (native logo + yaşıl glow) görünür.',
  },
  uber_eats: {
    id: 'uber_eats', name: 'Uber Eats', logo: '/partners/uber-eats-dark.svg', logoLight: '/partners/uber-eats-light.svg',
    accent: '#06c167', chipBg: '#ffffff',
    blurb: 'Uber Eats sifarişləri POS-a düşəndə kartda Uber Eats brendinqi görünür.',
  },
  glovo: {
    id: 'glovo', name: 'Glovo', logo: '/partners/glovo.svg', logoLight: '/partners/glovo-light.svg',
    accent: '#fdc500', chipBg: '#ffffff',
    blurb: 'Glovo sifarişləri POS-a düşəndə kartda Glovo brendinqi görünür.',
  },
  wolt: {
    id: 'wolt', name: 'Wolt', logo: '/partners/wolt-dark.svg', logoLight: '/partners/wolt-light.svg',
    accent: '#0022E6', chipBg: '#ffffff',
    blurb: 'Wolt sifarişləri POS-a düşəndə kartda Wolt brendinqi görünür.',
  },
};

export const PARTNER_LIST: PartnerMeta[] = Object.values(PARTNERS);

/** Resolve an orders.partner_source value to its meta (null = in-house). */
export const partnerMeta = (source?: string | null): PartnerMeta | null =>
  (source && PARTNERS[source as PartnerId]) ? PARTNERS[source as PartnerId] : null;
