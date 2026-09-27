'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { T, EASE, SPRING, CHOREO } from './system';

/**
 * Saito Motion System — alive grid cell.
 *
 * Wrap every grid child (floor tables, takeaway/delivery order cards) in a
 * GridCell INSIDE an <AnimatePresence>. Then:
 *  - enter:  the card reveals (primary)
 *  - exit:   the card collapses (scale 0.985 + fade, 140ms)
 *  - reflow: the moment the cell leaves, NEIGHBORS GLIDE into the gap via
 *            `layout` — no teleport. This is the owner's "grid özü
 *            transition edir" requirement.
 *
 * `layout` is cheap: framer only measures when the actual position changes.
 */
export function GridCell({
  children,
  className,
  enterScale = CHOREO.entrance.enter.scale,
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
      exit={{ opacity: CHOREO.collapse.cardExit!.opacity, scale: CHOREO.collapse.cardExit!.scale }}
      style={{ position: 'relative' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
