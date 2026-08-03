/**
 * Apple-style modal transition presets.
 *
 * iOS uses a spring with ~12Hz oscillation and ~70% damping.
 * In framer-motion terms that translates to stiffness ≈ 350, damping ≈ 28-30.
 */

export const appleSpring = {
  type: 'spring' as const,
  stiffness: 350,
  damping: 28,
  mass: 0.8,
};

export const appleBackdrop = {
  duration: 0.22,
  ease: 'easeOut' as const,
};

/** Centered card: scale + fade */
export const appleCard = {
  initial: { opacity: 0, scale: 0.92, y: 16 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit:    { opacity: 0, scale: 0.92, y: 16 },
  transition: appleSpring,
};

/** Bottom sheet: slide up */
export const appleSheet = {
  initial: { opacity: 0, y: '100%' as const },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: '100%' as const },
  transition: appleSpring,
};

/** Capsule (ActionSheet-style): slide up with bounce */
export const appleCapsule = {
  initial: { opacity: 0, y: 80 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: 80 },
  transition: { ...appleSpring, stiffness: 400, damping: 30 },
};

/** Inner view swap (tab-like content within a modal) */
export const appleViewSwap = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit:    { opacity: 0, x: -20 },
  transition: { duration: 0.2, ease: 'easeInOut' as const },
};
