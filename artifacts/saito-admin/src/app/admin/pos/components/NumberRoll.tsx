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
  scroll?: boolean;
}

export function NumberRoll({
  value,
  prefix = '',
  suffix = '',
  decimals = 2,
  className = '',
  duration = 0.4,
  scroll = false,
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

  if (scroll) {
    const display = prefix + value.toFixed(decimals) + suffix;
    return (
      <div className={`relative overflow-hidden ${className}`} style={{ height: '1.2em', lineHeight: '1.2em' }}>
        <motion.span
          key={value}
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: '0%', opacity: 1 }}
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          className="block whitespace-nowrap"
        >
          {display}
        </motion.span>
      </div>
    );
  }

  return <motion.span className={className}>{rounded}</motion.span>;
}
