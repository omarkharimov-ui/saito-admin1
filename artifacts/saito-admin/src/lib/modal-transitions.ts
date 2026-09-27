import type { Easing } from 'framer-motion';

/** Backdrop fade */
export const appleBackdrop = {
  duration: 0.22,
  ease: 'easeOut' as const,
};

/** 2026-09-27 (owner, iOS-27-trash doctrine): EXITS are graceful — symmetric
    ease-in-out, ~280ms: the surface drifts away slowly. Enters stay snappy. */
const gracefulExit = { duration: 0.28, ease: [0.45, 0, 0.55, 1] as Easing };

/** Outer modal: slide from bottom / exit down */
export const slideUp = {
  initial: { opacity: 0, y: 48 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.26, ease: [0.4, 0, 0.2, 1] as Easing } },
  exit:    { opacity: 0, y: 32, transition: gracefulExit },
};

/** 2026-09-27 (owner: "tarixce/kassa popup yenidən yaz — centered modal"):
    centered dialog — spring entrance (500/26 "kəsəy"), graceful exit.
    Used for TARİXÇƏ + Kassa modals. */
export const centerModal = {
  initial: { opacity: 0, scale: 0.94, y: 16 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring' as const, stiffness: 500, damping: 26 } },
  exit:    { opacity: 0, scale: 0.97, y: 8, transition: gracefulExit },
};

/** Inner view morph — smooth scale + radius */
export const morphView = {
  initial: { opacity: 0, scale: 0.96, borderRadius: 32 },
  animate: { opacity: 1, scale: 1, borderRadius: 24 },
  exit:    { opacity: 0, scale: 0.98, borderRadius: 32 },
  transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as Easing },
};

/** 2026-09-27 (owner, iOS-27-trash doctrine): "fast" no longer means instant.
    Backdrops, view wrappers, and morph views that leave drift away gracefully
    (symmetric in-out, 280ms) — the same curve as gracefulExit. Enters through
    this token stay under 300ms, so nothing ever blocks the next tap. */
export const fastExit = {
  duration: 0.28,
  ease: [0.45, 0, 0.55, 1] as Easing,
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
