'use client';

import React from 'react';
import { motion } from 'framer-motion';

export function GsLoader() {
  const sz = 72, R = 36, r1 = R * 0.80, r2 = R * 0.52;
  const c1 = 2 * Math.PI * r1, c2 = 2 * Math.PI * r2;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', position: 'relative' }}>
      <motion.div animate={{ opacity: [0.08, 0.2, 0.08], scale: [0.94, 1.04, 0.94] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', width: sz * 2.2, height: sz * 2.2, borderRadius: '50%', background: 'radial-gradient(circle, rgba(212,175,55,0.08) 0%, transparent 65%)', filter: 'blur(14px)', pointerEvents: 'none' }} />
      <motion.div animate={{ scale: [1, 1.02, 1] }} transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }} style={{ width: sz, height: sz }}>
        <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`} style={{ overflow: 'visible' }}>
          <circle cx={R} cy={R} r={r1} fill="none" stroke="rgba(212,175,55,0.07)" strokeWidth="1.5" />
          <circle cx={R} cy={R} r={r2} fill="none" stroke="rgba(212,175,55,0.05)" strokeWidth="1" />
          <motion.circle cx={R} cy={R} r={r1} fill="none" stroke="url(#gsSet1)" strokeWidth="2.2" strokeLinecap="round"
            strokeDasharray={`${c1 * 0.72} ${c1 * 0.28}`}
            style={{ transformOrigin: `${R}px ${R}px`, filter: 'drop-shadow(0 0 6px rgba(212,175,55,0.65))' } as React.CSSProperties}
            animate={{ rotate: [0, 360] }} transition={{ duration: 2.8, repeat: Infinity, ease: 'linear' }} />
          <motion.circle cx={R} cy={R} r={r2} fill="none" stroke="url(#gsSet2)" strokeWidth="1.8" strokeLinecap="round"
            strokeDasharray={`${c2 * 0.35} ${c2 * 0.65}`}
            style={{ transformOrigin: `${R}px ${R}px`, filter: 'drop-shadow(0 0 3px rgba(212,175,55,0.3))' } as React.CSSProperties}
            animate={{ rotate: [0, -360] }} transition={{ duration: 4.2, repeat: Infinity, ease: 'linear' }} />
          <defs>
            <linearGradient id="gsSet1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(212,175,55,0)" />
              <stop offset="55%" stopColor="rgba(212,175,55,0.85)" />
              <stop offset="100%" stopColor="rgba(255,215,80,1)" />
            </linearGradient>
            <linearGradient id="gsSet2" x1="0%" y1="0%" x2="100%" y2="0%">
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

export const inputCls = 'w-full bg-white border border-[#e5e7eb] hover:border-[#d1d5db] focus:border-[#007aff] px-4 py-3 text-sm outline-none rounded-2xl transition-all text-[#111111] placeholder:text-[#9ca3af] shadow-[0_8px_24px_rgba(0,0,0,0.03)]';
export const saveButtonCls = 'flex items-center gap-2 px-8 py-3 rounded-2xl font-bold text-sm transition-all disabled:opacity-40 shadow-[0_10px_28px_rgba(0,0,0,0.12)]';
export const labelCls = 'text-[10px] uppercase tracking-[0.2em] text-[#4b5563] flex items-center gap-2 mb-2 font-bold';
