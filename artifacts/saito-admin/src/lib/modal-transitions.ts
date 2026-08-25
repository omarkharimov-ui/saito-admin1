import type { Easing } from 'framer-motion';

/** Backdrop fade */
export const appleBackdrop = {
  duration: 0.22,
  ease: 'easeOut' as const,
};

/** Outer modal: slide from bottom / exit down */
export const slideUp = {
  initial: { opacity: 0, y: 48 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: 48 },
  transition: { duration: 0.26, ease: [0.4, 0, 0.2, 1] as Easing },
};

/** Inner view morph — smooth scale + radius */
export const morphView = {
  initial: { opacity: 0, scale: 0.96, borderRadius: 32 },
  animate: { opacity: 1, scale: 1, borderRadius: 24 },
  exit:    { opacity: 0, scale: 0.98, borderRadius: 32 },
  transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as Easing },
};

/** Fast exit for back/close */
export const fastExit = {
  duration: 0.2,
  ease: 'easeOut' as const,
};

/** Legacy aliases */
export const appleCard = slideUp;
export const appleSheet = slideUp;
export const appleCapsule = slideUp;
export const appleViewSwap = {
  initial: { opacity: 0, x: 12 },
  animate: { opacity: 1, x: 0 },
  exit:    { opacity: 0 },
  transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] as Easing },
};
export const morphOpen = morphView;
export const checkoutMorph = slideUp;
export const posModal = slideUp;
