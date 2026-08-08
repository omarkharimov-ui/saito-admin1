/**
 * Apple-style modal transition presets.
 *
 * POS Interaction targets:
 * - Button/tap feedback: 0–60ms
 * - Modal open: 80–140ms  (backdrop + modal simultaneously)
 * - Modal close: 80–120ms  (outer exit is authoritative)
 * - All child stagger / delayed content: disabled
 */

/**
 * Spring used for modal enter.
 * Higher damping = less bounce = faster perceived settling.
 */
export const appleSpring = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 35,
  mass: 0.7,
};

 /**
 * Backdrop fade — appears instantly with the modal (no sequential delay).
 */
export const appleBackdrop = {
  duration: 0.12,
  ease: 'easeOut' as const,
};

/** Centered card: scale + fade — appears with backdrop simultaneously */
export const appleCard = {
  initial: { opacity: 0, scale: 0.94, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit:    { opacity: 0, scale: 0.94, y: 8 },
  transition: { duration: 0.14, ease: [0.4, 0, 0.2, 1] },
};

/** Bottom sheet: slide up — appears immediately with backdrop */
export const appleSheet = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: 20 },
  transition: { duration: 0.14, ease: [0.4, 0, 0.2, 1] },
};

/** Capsule (ActionSheet-style): slide up — crisp, no bounce delay */
export const appleCapsule = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: 24 },
  transition: { duration: 0.14, ease: [0.4, 0, 0.2, 1] },
};

/** Inner view swap — fast, only for ENTER (does NOT block exit) */
export const appleViewSwap = {
  initial: { opacity: 0, x: 12 },
  animate: { opacity: 1, x: 0 },
  exit:    { opacity: 0 },
  transition: { duration: 0.12, ease: [0.4, 0, 0.2, 1] },
};

/** Fast exit — used by all back/exit/close interactions */
export const fastExit = {
  duration: 0.1,
  ease: 'easeOut' as const,
};
