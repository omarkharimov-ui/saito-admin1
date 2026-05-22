'use client';

import React from 'react';
import { motion } from 'framer-motion';

export function ProductsLoader() {
  const sz = 72, R = 36, r1 = R * 0.80, r2 = R * 0.52;
  const c1 = 2 * Math.PI * r1, c2 = 2 * Math.PI * r2;
  return (
    <div className="flex items-center justify-center" style={{ minHeight: '60vh', position: 'relative' }}>
      <motion.div animate={{ opacity: [0.1, 0.35, 0.1], scale: [0.88, 1.12, 0.88] }} transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', width: sz * 3, height: sz * 3, borderRadius: '50%', background: 'radial-gradient(circle, rgba(212,175,55,0.1) 0%, transparent 60%)', filter: 'blur(28px)', pointerEvents: 'none' }} />
      <motion.div animate={{ scale: [1, 1.055, 1] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }} style={{ width: sz, height: sz }}>
        <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`} style={{ overflow: 'visible' }}>
          <circle cx={R} cy={R} r={r1} fill="none" stroke="rgba(212,175,55,0.07)" strokeWidth="1.5" />
          <circle cx={R} cy={R} r={r2} fill="none" stroke="rgba(212,175,55,0.05)" strokeWidth="1" />
          <motion.circle cx={R} cy={R} r={r1} fill="none" stroke="url(#gsProd1)" strokeWidth="2.2" strokeLinecap="round"
            strokeDasharray={`${c1 * 0.72} ${c1 * 0.28}`}
            style={{ transformOrigin: `${R}px ${R}px`, filter: 'drop-shadow(0 0 6px rgba(212,175,55,0.65))' } as React.CSSProperties}
            animate={{ rotate: [0, 360] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }} />
          <motion.circle cx={R} cy={R} r={r2} fill="none" stroke="url(#gsProd2)" strokeWidth="1.8" strokeLinecap="round"
            strokeDasharray={`${c2 * 0.35} ${c2 * 0.65}`}
            style={{ transformOrigin: `${R}px ${R}px`, filter: 'drop-shadow(0 0 4px rgba(212,175,55,0.45))' } as React.CSSProperties}
            animate={{ rotate: [0, -360] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }} />
          <defs>
            <linearGradient id="gsProd1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(212,175,55,0)" />
              <stop offset="55%" stopColor="rgba(212,175,55,0.85)" />
              <stop offset="100%" stopColor="rgba(255,215,80,1)" />
            </linearGradient>
            <linearGradient id="gsProd2" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(212,175,55,0)" />
              <stop offset="60%" stopColor="rgba(255,215,80,0.7)" />
              <stop offset="100%" stopColor="rgba(212,175,55,0.9)" />
            </linearGradient>
          </defs>
        </svg>
      </motion.div>
    </div>
  );
}
