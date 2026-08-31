'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { Users, Clock } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';

interface StaffWorkspaceSwitcherProps {
  view: 'staff' | 'shifts';
  onChange: (view: 'staff' | 'shifts') => void;
  staffCount: number;
  activeShiftCount: number;
}

const TABS = [
  { id: 'staff' as const, label: 'Staff', icon: Users },
  { id: 'shifts' as const, label: 'Shifts', icon: Clock },
];

const SPRING = { stiffness: 400, damping: 28, mass: 0.8 };
const SETTLE_SPRING = { stiffness: 480, damping: 24, mass: 0.6 };

export function StaffWorkspaceSwitcher({ view, onChange, staffCount, activeShiftCount }: StaffWorkspaceSwitcherProps) {
  const { lightMode } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const pillX = useMotionValue(0);
  const pillWidth = useMotionValue(0);
  const pillScaleX = useMotionValue(1);
  const [isDragging, setIsDragging] = useState(false);

  const measureTab = useCallback((tabId: string) => {
    const tab = tabRefs.current[tabId];
    const container = containerRef.current;
    if (!tab || !container) return null;
    const containerRect = container.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    return { left: tabRect.left - containerRect.left, width: tabRect.width };
  }, []);

  const syncPillToView = useCallback((tabId: string) => {
    const measured = measureTab(tabId);
    if (!measured) return;
    pillX.set(measured.left);
    pillWidth.set(measured.width);
  }, [measureTab, pillX, pillWidth]);

  useEffect(() => { syncPillToView(view); }, [view, syncPillToView]);
  useEffect(() => {
    const handleResize = () => syncPillToView(view);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [view, syncPillToView]);

  const handleTabClick = (tabId: 'staff' | 'shifts') => {
    if (tabId === view) return;
    const target = measureTab(tabId);
    if (!target) return;

    animate(pillScaleX, 1.05, { type: 'spring', ...SETTLE_SPRING });
    animate(pillX, target.left, { type: 'spring', ...SPRING });
    animate(pillWidth, target.width, {
      type: 'spring',
      ...SPRING,
      onComplete: () => {
        animate(pillScaleX, 1, { type: 'spring', ...SETTLE_SPRING });
        onChange(tabId);
      },
    });
  };

  const negPillX = useTransform(pillX, v => -v);

  return (
    <div className="flex items-center gap-6">
      <div
        ref={containerRef}
        className="relative flex items-center rounded-2xl p-1.5 select-none"
        style={{
          background: lightMode ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${lightMode ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'}`,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = view === id;
          return (
            <button
              key={id}
              ref={el => { tabRefs.current[id] = el; }}
              onClick={() => handleTabClick(id)}
              className={`relative z-10 flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-colors ${
                isActive ? 'text-transparent' : lightMode ? 'text-zinc-500' : 'text-zinc-400'
              }`}
            >
              <Icon size={14} className={isActive ? 'opacity-0' : ''} />
              <span className={isActive ? 'opacity-0' : ''}>{label}</span>
            </button>
          );
        })}

        {/* Glass Pill Background */}
        <motion.div
          className="absolute rounded-xl z-0 pointer-events-none"
          style={{
            left: pillX,
            width: pillWidth,
            top: '50%',
            translateY: '-50%',
            height: 'calc(100% - 12px)',
            scaleX: pillScaleX,
            background: lightMode ? '#18181b' : '#ffffff',
            border: `1px solid ${lightMode ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.85)'}`,
            boxShadow: isDragging
              ? lightMode
                ? '0 8px 32px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1)'
                : '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.9)'
              : lightMode
                ? '0 2px 8px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.1)'
                : '0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.9)',
          }}
          transition={{ type: 'spring', ...SETTLE_SPRING }}
        />

        {/* Clipped Text Layer */}
        <motion.div
          className="absolute rounded-xl z-10 pointer-events-none overflow-hidden"
          style={{
            left: pillX,
            width: pillWidth,
            top: '50%',
            translateY: '-50%',
            height: 'calc(100% - 12px)',
          }}
        >
          <motion.div
            className="flex items-center gap-1 p-1.5 h-full"
            style={{ x: negPillX, alignItems: 'center' }}
          >
            {TABS.map(({ id, label, icon: Icon }) => (
              <div
                key={id}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold tracking-wide whitespace-nowrap"
                style={{ color: lightMode ? '#ffffff' : '#000000' }}
              >
                <Icon size={14} />
                <span>{label}</span>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>

      <div className="ml-auto flex items-center gap-6 text-[11px] font-medium tracking-wide">
        <span className={lightMode ? 'text-zinc-500' : 'text-zinc-400'}>{staffCount} staff</span>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-emerald-500">{activeShiftCount} on shift</span>
        </div>
      </div>
    </div>
  );
}
