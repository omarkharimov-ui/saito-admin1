/**
 * Shared springs for POS micro-interactions (buttons, pills, +/−, back).
 * Every POS component imports from here so the whole screen moves with the
 * SAME feel.
 *
 * Owner-tuned 2026-09-21: the first pass (stiffness 500) was "çox kəskin" —
 * softened to a smooth glide with a gentle settle: quick start, no snap.
 */
export const SPRING = { type: 'spring', stiffness: 280, damping: 22, mass: 0.9 } as const;
/** Press feedback (tap) — a touch firmer so presses still read as immediate. */
export const TAP = { type: 'spring', stiffness: 420, damping: 28, mass: 0.7 } as const;
