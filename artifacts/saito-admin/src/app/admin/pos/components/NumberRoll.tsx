'use client';

import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useEffect, useRef } from 'react';

interface NumberRollProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
  duration?: number;
}

export function NumberRoll({
  value,
  prefix = '',
  suffix = '',
  decimals = 2,
  className = '',
  duration = 0.4,
}: NumberRollProps) {
  const mv = useMotionValue(value);
  const rounded = useTransform(mv, (v) => {
    const fixed = v.toFixed(decimals);
    return prefix + fixed + suffix;
  });
  const prevValue = useRef(value);

  useEffect(() => {
    const delta = Math.abs(value - prevValue.current);
    const adjustedDuration = Math.min(duration, 0.1 + delta * 0.01);
    const controls = animate(mv, value, {
      duration: adjustedDuration,
      ease: [0.32, 0.74, 0.65, 1],
    });
    prevValue.current = value;
    return controls.stop;
  }, [value, mv, duration, decimals]);

  return <motion.span className={className}>{rounded}</motion.span>;
}
