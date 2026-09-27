/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SAITO MOTION SYSTEM — "state dəyişmir, state transition baş verir"
 * ─────────────────────────────────────────────────────────────────────────────
 * Owner directive (2026-09-27): the backend is a proper state machine, but the
 * UI used to render A→B in a single frame (static renderer). This module is
 * the ONE motion language for Saito POS — every state transition gets a
 * concrete ENTER / UPDATE / EXIT choreography. Nobody invents random
 * framer-motion values anymore.
 *
 * Principles (Apple senior-motion pass):
 *  1. Motion answers "nə baş verdi?", it never announces itself.
 *  2. Duration band for POS: 80–360ms. Waiters do hundreds of ops/day —
 *     nothing may block the next tap.
 *  3. Motion hierarchy — PRIMARY (state changed) > SECONDARY (info changed)
 *     > NAVIGATION > MICRO (press feedback). Only primary is allowed to be
 *     consciously visible.
 *  4. Elements TRANSFORM in place (pill morphs, amount crossfades) — the
 *     card never "dies" and re-renders; it settles.
 *  5. Layout is alive: when an object leaves, neighbors GLIDE into the gap
 *     (framer `layout`), never teleport.
 */

// ── 1. TIMING SCALE (seconds) ────────────────────────────────────────────────
export const T = {
  /** micro feedback: press, pill toggle, dot */
  instant: 0.08,
  /** secondary info: guest count, amount, label morph */
  quick: 0.14,
  /** standard: status pill morph, content reveal */
  standard: 0.2,
  /** emphasis: table opened, payment emphasis */
  emphasis: 0.28,
  /** complex: sheet/modal enter (the one place we allow >280ms) */
  complex: 0.36,
} as const;

// ── 2. EASING ────────────────────────────────────────────────────────────────
export const EASE = {
  /** content ARRIVING at the eye — decelerate into place */
  enter: [0.22, 1, 0.36, 1] as const,
  /** content LEAVING — accelerate away, no lingering */
  exit: [0.4, 0, 0.55, 1] as const,
  /** in-place morph — gentle S, the house default */
  morph: [0.4, 0, 0.2, 1] as const,
  settle: 'easeOut' as const,
  continuous: 'linear' as const,
} as const;

// ── 3. SPRINGS (house DNA: "kəsəy" = hair of overshoot) ─────────────────────
export const SPRING = {
  /** the owner DNA — buttons, pills, flashes */
  kessey: { type: 'spring' as const, stiffness: 500, damping: 26 },
  /** larger surfaces (capsules, cards) — same snap, slightly more mass */
  travel: { type: 'spring' as const, stiffness: 500, damping: 28, mass: 0.38 },
  /** layout reflow (neighbors gliding) — calm, no overshoot */
  soft: { type: 'spring' as const, stiffness: 320, damping: 32 },
} as const;

// ── 4. MOTION HIERARCHY ──────────────────────────────────────────────────────
export type MotionLevel = 'primary' | 'secondary' | 'navigation' | 'micro';

export interface LevelChoreo {
  duration: number;
  ease: readonly number[] | string;
  /** vertical travel for enter/exit (px) */
  y: number;
  /** scale delta on enter (1 = none) */
  scale: number;
  /** enter/exit blur in px (0 = off) — used sparingly, it reads "premium" */
  blur: number;
}

export const LEVEL: Record<MotionLevel, LevelChoreo> = {
  /** order created / table opened / payment done — consciously visible */
  primary:    { duration: T.emphasis, ease: EASE.enter, y: 8, scale: 0.98, blur: 0 },
  /** amount, guest count, status label — felt, not watched */
  secondary:  { duration: T.standard, ease: EASE.morph, y: 4, scale: 1,    blur: 3 },
  /** toolbar / tab / view switches */
  navigation: { duration: T.standard, ease: EASE.morph, y: 12, scale: 1,   blur: 4 },
  /** press feedback */
  micro:      { duration: T.quick,    ease: EASE.morph, y: 3, scale: 0.97, blur: 0 },
};

// ── 5. TABLE STATE MACHINE ───────────────────────────────────────────────────
export type TableState =
  | 'EMPTY'
  | 'NEW_SESSION'   // seated, no order yet
  | 'ACTIVE'        // order being built / sent
  | 'IN_KITCHEN'    // preparing
  | 'READY'         // food ready at pass
  | 'SERVED'        // on the table
  | 'WAITING_PAYMENT'
  | 'PAID'
  | 'CLEANING'      // TƏMİZLƏNMƏLİ
  | 'RESERVED';

/**
 * Choreography archetypes — every transition resolves to exactly one.
 * ENTER  = content arriving in the card
 * UPDATE = in-place value morph (amount/guest/label swap)
 * EXIT   = content leaving
 */
export type TransitionKind =
  | 'entrance'   // table created / first paint
  | 'reveal'     // EMPTY → NEW_SESSION: content reveals, card stays
  | 'morph'      // status → status: label transforms in the same spot
  | 'emphasize'  // → WAITING_PAYMENT / → PAID: card settles + border emphasis
  | 'replace'    // ACTIVE → CLEANING: whole content swaps
  | 'settle'     // CLEANING → EMPTY: card settles down, calms
  | 'collapse';  // order dismissed / table removed: exit + layout shift

export interface TransitionChoreo {
  level: MotionLevel;
  enter: { opacity: number; y: number; scale: number; blur: number; duration: number; ease: readonly number[] | string };
  update: { duration: number; ease: readonly number[] | string; y: number };
  exit: { opacity: number; y: number; scale: number; blur: number; duration: number; ease: readonly number[] | string };
  /** the CARD itself does a subtle settle (scale → 1) */
  cardSettle?: { from: number };
  /** card exit (dismiss/remove): the collapse before layout shifts neighbors */
  cardExit?: { scale: number; opacity: number; duration: number };
}

function choreo(
  level: MotionLevel,
  opts: { cardSettle?: number; cardExit?: { scale: number; duration: number }; updateBlur?: number } = {},
): TransitionChoreo {
  const L = LEVEL[level];
  return {
    level,
    enter:  { opacity: 0, y: L.y, scale: L.scale, blur: L.blur, duration: L.duration, ease: L.ease },
    update: { duration: L.duration, ease: L.ease, y: L.y },
    exit:   { opacity: 0, y: -Math.max(2, L.y / 2), scale: 1, blur: opts.updateBlur ?? L.blur, duration: L.duration * 0.75, ease: EASE.exit },
    cardSettle: opts.cardSettle != null ? { from: opts.cardSettle } : undefined,
    cardExit: opts.cardExit
      ? { scale: opts.cardExit.scale, opacity: 0, duration: opts.cardExit.duration }
      : undefined,
  };
}

export const CHOREO: Record<TransitionKind, TransitionChoreo> = {
  entrance:  choreo('primary',  { cardSettle: 0.98 }),
  reveal:    choreo('primary',  { cardSettle: 0.995 }),
  morph:     choreo('secondary'),
  emphasize: choreo('primary',  { cardSettle: 0.99 }),
  replace:   choreo('secondary',{ cardSettle: 0.995 }),
  settle:    choreo('micro',    { cardSettle: 0.995 }),
  collapse:  choreo('micro',    { cardExit: { scale: 0.985, duration: T.quick } }),
};

/**
 * The lifecycle map — "hər state üçün konkret enter/update/exit".
 * Order matters: first match wins; `from: '*'` = any predecessor.
 */
export const TABLE_LIFECYCLE: { from: TableState | '*'; to: TableState; kind: TransitionKind }[] = [
  { from: 'EMPTY', to: 'NEW_SESSION',    kind: 'reveal' },
  { from: '*',     to: 'NEW_SESSION',    kind: 'reveal' },
  { from: 'NEW_SESSION', to: 'ACTIVE',   kind: 'morph' },
  { from: '*',     to: 'ACTIVE',         kind: 'morph' },
  { from: 'ACTIVE', to: 'IN_KITCHEN',    kind: 'morph' },
  { from: 'IN_KITCHEN', to: 'READY',     kind: 'morph' },
  { from: 'READY',  to: 'SERVED',        kind: 'morph' },
  { from: 'SERVED', to: 'WAITING_PAYMENT', kind: 'emphasize' },
  { from: '*',     to: 'WAITING_PAYMENT', kind: 'emphasize' },
  { from: '*',     to: 'PAID',           kind: 'emphasize' },
  { from: 'PAID',   to: 'CLEANING',      kind: 'replace' },
  { from: '*',     to: 'CLEANING',       kind: 'replace' },
  { from: 'CLEANING', to: 'EMPTY',       kind: 'settle' },
  { from: '*',     to: 'RESERVED',       kind: 'morph' },
  { from: '*',     to: 'EMPTY',          kind: 'settle' },
];

/** Resolve the choreography for a concrete state change. */
export function tableTransition(from: TableState | null, to: TableState | null): TransitionChoreo {
  if (from === null) return CHOREO.entrance;
  if (to === null) return CHOREO.collapse;
  const row = TABLE_LIFECYCLE.find(r => (r.from === '*' || r.from === from) && r.to === to);
  return CHOREO[row ? row.kind : 'morph'];
}

/**
 * Map a raw DB table status → TableState (the UI-side state machine).
 * Unknown/absent values fall back to the closest family.
 */
export function tableStateOf(status: string | null | undefined, hasOrder: boolean, dirty: boolean): TableState {
  switch (String(status || '').toLowerCase()) {
    case 'empty': case 'free': case 'available': return 'EMPTY';
    case 'occupied':
      return dirty ? 'CLEANING' : hasOrder ? 'ACTIVE' : 'NEW_SESSION';
    case 'ready': return 'READY';
    case 'served': case 'dining': return 'SERVED';
    case 'waiting_payment': return 'WAITING_PAYMENT';
    case 'paid': return 'PAID';
    case 'cleaning': case 'dirty': return 'CLEANING';
    case 'reserved': return 'RESERVED';
    case 'waiting': return 'RESERVED';
    default: return hasOrder ? 'ACTIVE' : 'EMPTY';
  }
}

// ── 6. ORDER LIFECYCLE (takeaway / delivery cards) ──────────────────────────
export type OrderTransition = 'entrance' | 'stage-morph' | 'paid-emphasis' | 'collapse';

export const ORDER_CHOREO: Record<OrderTransition, TransitionChoreo> = {
  'entrance':      CHOREO.entrance,
  'stage-morph':   CHOREO.morph,
  'paid-emphasis': CHOREO.emphasize,
  'collapse':      CHOREO.collapse,
};
