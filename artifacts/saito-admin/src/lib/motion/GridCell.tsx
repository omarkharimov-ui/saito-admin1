'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { T, EASE, SPRING } from './system';

/**
 * Saito Motion System — alive grid cell.
 *
 * Wrap every grid child (floor tables, takeaway/delivery order cards) in a
 * GridCell INSIDE an <AnimatePresence>. Then:
 *  - enter:  the card reveals (snappy, primary)
 *  - exit:   the iOS-27-trash doctrine — the card fades out GRACEFULLY
 *            (320ms symmetric ease, 0.97 scale) before the cell collapses
 *  - reflow: NEIGHBORS GLIDE into the gap via `layout` — no teleport.
 *
 * `layout` is cheap: framer only measures when the actual position changes.
 */
export function GridCell({
  children,
  className,
  enterScale = 0.98,
}: {
  children: React.ReactNode;
  className?: string;
  enterScale?: number;
}) {
  return (
    <motion.div
      layout
      transition={SPRING.soft}
      initial={{ opacity: 0, scale: enterScale }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{
        opacity: 0,
        scale: 0.97,
        transition: { duration: T.grace, ease: EASE.graceful },
      }}
      style={{ position: 'relative' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
