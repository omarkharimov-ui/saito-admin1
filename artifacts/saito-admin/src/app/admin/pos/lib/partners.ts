// 2026-09-25 (owner): connected delivery partners (Bolt Food / Uber Eats /
// Glovo / Wolt). Brand assets live in /public/partners (Wikimedia-licensed
// logos). The accent color is the partner's real brand color extracted from
// the logo file — used for the card left-stripe so staff recognize the
// source at a glance (POS delivery/takeaway boards, KDS, BDS).
export type PartnerId = 'bolt' | 'uber_eats' | 'glovo' | 'wolt';

export interface PartnerMeta {
  id: PartnerId;
  name: string;
  logo: string;      // /public path
  accent: string;    // brand color (card stripe)
  chipBg: string;    // logo chip background (logos are light-bg designs)
  blurb: string;     // settings tab description (az)
}

export const PARTNERS: Record<PartnerId, PartnerMeta> = {
  bolt: {
    id: 'bolt', name: 'Bolt Food', logo: '/partners/bolt.svg',
    accent: '#34D186', chipBg: '#ffffff',
    blurb: 'Bolt Food sifarişləri POS-a düşəndə kartda yaşıl Bolt brendinqi görünür.',
  },
  uber_eats: {
    id: 'uber_eats', name: 'Uber Eats', logo: '/partners/uber-eats.svg',
    accent: '#06c167', chipBg: '#ffffff',
    blurb: 'Uber Eats sifarişləri POS-a düşəndə kartda Uber Eats brendinqi görünür.',
  },
  glovo: {
    id: 'glovo', name: 'Glovo', logo: '/partners/glovo.svg',
    accent: '#fdc500', chipBg: '#ffffff',
    blurb: 'Glovo sifarişləri POS-a düşəndə kartda Glovo brendinqi görünür.',
  },
  wolt: {
    id: 'wolt', name: 'Wolt', logo: '/partners/wolt.png',
    accent: '#0022E6', chipBg: '#ffffff',
    blurb: 'Wolt sifarişləri POS-a düşəndə kartda Wolt brendinqi görünür.',
  },
};

export const PARTNER_LIST: PartnerMeta[] = Object.values(PARTNERS);

/** Resolve an orders.partner_source value to its meta (null = in-house). */
export const partnerMeta = (source?: string | null): PartnerMeta | null =>
  (source && PARTNERS[source as PartnerId]) ? PARTNERS[source as PartnerId] : null;
