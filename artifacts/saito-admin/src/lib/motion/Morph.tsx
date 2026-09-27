'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { T, EASE } from './system';

/**
 * Saito Motion System — in-place value morph (SECONDARY level).
 *
 * The old value accelerates away (fade + slight upward drift + blur) and the
 * new value decelerates in — in the SAME visual position. The element never
 * disappears and re-renders; it transforms. Used for: table amount, guest
 * count, order amounts, any number/label that changes under the operator's
 * eye while the parent surface stays put.
 *
 * `mode="popLayout"` keeps the exiting copy out of the layout flow so the
 * incoming copy owns the space immediately (no reflow, no jump).
 */
export function Morph({
  value,
  children,
  className,
  duration = T.standard,
  y = 4,
}: {
  /** changes → triggers the morph; keep it stable (string/number) */
  value: string | number;
  children: React.ReactNode;
  className?: string;
  duration?: number;
  y?: number;
}) {
  return (
    <span className={`relative inline-flex ${className ?? ''}`} style={{ verticalAlign: 'baseline' }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={String(value)}
          initial={{ opacity: 0, y, filter: 'blur(3px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -y, filter: 'blur(3px)' }}
          transition={{ duration, ease: EASE.morph }}
          className="inline-flex items-center"
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
