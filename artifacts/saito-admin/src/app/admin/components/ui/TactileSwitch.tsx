'use client';

import React from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

const playTick = (type: 'on' | 'off') => {
  if (typeof window === 'undefined') return;
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  if (type === 'on') {
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.05);
  } else {
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.05);
  }
  
  gain.gain.setValueAtTime(0.02, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
  osc.start();
  osc.stop(ctx.currentTime + 0.05);
};

interface TactileSwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

export default function TactileSwitch({ checked, onChange, disabled }: TactileSwitchProps) {
  const handleScale = useMotionValue(1);
  const springScale = useSpring(handleScale, { stiffness: 400, damping: 25 });

  const toggle = () => {
    if (disabled) return;
    const newState = !checked;
    onChange(newState);
    playTick(newState ? 'on' : 'off');
  };

  return (
    <button
      type="button"
      onMouseDown={() => handleScale.set(1.4)}
      onMouseUp={() => handleScale.set(1)}
      onMouseLeave={() => handleScale.set(1)}
      onTouchStart={() => handleScale.set(1.4)}
      onTouchEnd={() => handleScale.set(1)}
      onClick={toggle}
      className={`relative w-12 h-7 rounded-full transition-all duration-500 overflow-hidden cursor-pointer ${
        checked ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-zinc-800'
      } ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
    >
      <motion.div
        style={{ scaleX: springScale }}
        animate={{ x: checked ? 20 : 0 }}
        className="absolute left-1 top-1 w-5 h-5 bg-white rounded-full shadow-lg pointer-events-none"
      />
    </button>
  );
}
