'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';

export interface DragTabItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  dotColor?: string;
  badge?: number;
}

interface DragTabSwitcherProps {
  items: DragTabItem[];
  value: string;
  onChange: (id: string) => void;
  containerClassName?: string;
  /** Override the sliding pill + active label colors (defaults to the solid inverted look). */
  activeStyle?: {
    pillBackground?: string;
    pillBorder?: string;
    labelColor?: string;
    boxShadow?: string;
  };
}

const HOLD_THRESHOLD = 120;
const TRAVEL_SPRING = { stiffness: 420, damping: 28, mass: 0.38 };
const SETTLE_SPRING = { stiffness: 480, damping: 24, mass: 0.36 };

export function DragTabSwitcher({ items, value, onChange, containerClassName, activeStyle }: DragTabSwitcherProps) {
  const { lightMode } = useTheme();
  const [isDragging, setIsDragging] = useState(false);
  const [previewTab, setPreviewTab] = useState<string | null>(null);

  const pillBg = activeStyle?.pillBackground ?? (lightMode ? '#171717' : '#ffffff');
  const pillBorder = activeStyle?.pillBorder ?? (lightMode ? '1px solid #171717' : '1px solid rgba(255,255,255,0.9)');
  const activeLabelColor = activeStyle?.labelColor ?? (lightMode ? '#ffffff' : '#000000');

  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dragState = useRef({
    startX: 0,
    pillStartX: 0,
    hasMoved: false,
    activeTab: value,
  });
  const animationRef = useRef<ReturnType<typeof animate> | null>(null);

  const pillX = useMotionValue(0);
  const pillWidth = useMotionValue(0);
  const pillScaleX = useMotionValue(1);
  const pillScaleY = useMotionValue(1);
  const pillY = useMotionValue(0);

  const contentX = useTransform(pillX, v => -v);

  const measureTab = useCallback((tabId: string) => {
    const tab = tabRefs.current[tabId];
    const container = containerRef.current;
    if (!tab || !container) return null;
    const containerRect = container.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    return {
      left: tabRect.left - containerRect.left,
      width: tabRect.width,
    };
  }, []);

  const syncPillToView = useCallback((tabId: string) => {
    const measured = measureTab(tabId);
    if (!measured) return;
    pillX.set(measured.left);
    pillWidth.set(measured.width);
  }, [measureTab, pillX, pillWidth]);

  useEffect(() => {
    syncPillToView(value);
  }, [value, syncPillToView]);

  useEffect(() => {
    const handleResize = () => syncPillToView(value);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [value, syncPillToView]);

  const cancelAnimations = useCallback(() => {
    if (animationRef.current) {
      animationRef.current.stop?.();
      animationRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => cancelAnimations();
  }, [cancelAnimations]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isDragging) return;
    e.preventDefault();
    cancelAnimations();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    dragState.current = {
      startX: e.clientX,
      pillStartX: pillX.get() || 0,
      hasMoved: false,
      activeTab: value,
    };

    holdTimerRef.current = setTimeout(() => {
      setIsDragging(true);
    }, HOLD_THRESHOLD);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;

    dragState.current.hasMoved = true;

    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const currentWidth = pillWidth.get() || 0;
    const rawDeltaX = e.clientX - dragState.current.startX;
    const newLeft = Math.max(0, Math.min(dragState.current.pillStartX + rawDeltaX, containerRect.width - currentWidth));

    pillX.set(newLeft);

    const pillCenter = newLeft + currentWidth / 2;
    let closestTab: string | null = null;
    let closestDistance = Infinity;

    items.forEach(item => {
      const tabEl = tabRefs.current[item.id];
      if (!tabEl) return;
      const tabRect = tabEl.getBoundingClientRect();
      const tabCenter = tabRect.left - containerRect.left + tabRect.width / 2;
      const distance = Math.abs(pillCenter - tabCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestTab = item.id;
      }
    });

    setPreviewTab(closestTab && closestTab !== dragState.current.activeTab ? closestTab : null);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = undefined;
    }

    if (isDragging && dragState.current.hasMoved) {
      const targetId = previewTab || dragState.current.activeTab;
      const target = measureTab(targetId);

      if (target) {
        animationRef.current = animate(pillX, target.left, {
          type: 'spring',
          stiffness: TRAVEL_SPRING.stiffness,
          damping: TRAVEL_SPRING.damping,
          mass: TRAVEL_SPRING.mass,
        });
        animationRef.current = animate(pillWidth, target.width, {
          type: 'spring',
          stiffness: TRAVEL_SPRING.stiffness,
          damping: TRAVEL_SPRING.damping,
          mass: TRAVEL_SPRING.mass,
          onComplete: () => {
            setIsDragging(false);
            setPreviewTab(null);
            dragState.current.hasMoved = false;
            animationRef.current = null;
            if (targetId !== value) {
              onChange(targetId);
            }
          },
        });
      } else {
        setIsDragging(false);
        setPreviewTab(null);
        dragState.current.hasMoved = false;
      }
    }
  };

  const handleTabClick = (tabId: string) => {
    if (dragState.current.hasMoved) {
      dragState.current.hasMoved = false;
      return;
    }
    if (tabId === value) return;

    const target = measureTab(tabId);
    if (!target) return;

    cancelAnimations();

    const direction = items.findIndex(t => t.id === tabId) > items.findIndex(t => t.id === value) ? 1 : -1;

    animationRef.current = animate(pillScaleX, 1.035, {
      type: 'spring',
      stiffness: 480,
      damping: 24,
      mass: 0.36,
    });
    animationRef.current = animate(pillScaleY, 0.98, {
      type: 'spring',
      stiffness: 480,
      damping: 24,
      mass: 0.36,
    });

    animationRef.current = animate(pillX, target.left, {
      type: 'spring',
      stiffness: TRAVEL_SPRING.stiffness,
      damping: TRAVEL_SPRING.damping,
      mass: TRAVEL_SPRING.mass,
    });
    animationRef.current = animate(pillWidth, target.width, {
      type: 'spring',
      stiffness: TRAVEL_SPRING.stiffness,
      damping: TRAVEL_SPRING.damping,
      mass: TRAVEL_SPRING.mass,
      onComplete: () => {
        animationRef.current = animate(pillScaleX, 1, {
          type: 'spring',
          stiffness: SETTLE_SPRING.stiffness,
          damping: SETTLE_SPRING.damping,
          mass: SETTLE_SPRING.mass,
        });
        animationRef.current = animate(pillScaleY, 1, {
          type: 'spring',
          stiffness: SETTLE_SPRING.stiffness,
          damping: SETTLE_SPRING.damping,
          mass: SETTLE_SPRING.mass,
        });
        animationRef.current = animate(pillY, 0, {
          type: 'spring',
          stiffness: SETTLE_SPRING.stiffness,
          damping: SETTLE_SPRING.damping,
          mass: SETTLE_SPRING.mass,
        });
        onChange(tabId);
      },
    });
  };

  return (
    <div
      ref={containerRef}
      className={`relative flex items-center gap-1 rounded-full p-1 ${lightMode ? 'bg-zinc-100 border border-zinc-200/60' : 'bg-white/5 border border-white/10'} select-none ${containerClassName ?? ''}`}
      style={{ touchAction: 'none', overflow: 'visible' }}
    >
      {items.map(({ id, label, icon: Icon, dotColor, badge }) => {
        const isActive = value === id;
        return (
          <button
            key={id}
            ref={el => { tabRefs.current[id] = el; }}
            onClick={() => handleTabClick(id)}
            onPointerDown={isActive ? handlePointerDown : undefined}
            onPointerMove={isActive ? handlePointerMove : undefined}
            onPointerUp={isActive ? handlePointerUp : undefined}
            onLostPointerCapture={() => {
              if (holdTimerRef.current) {
                clearTimeout(holdTimerRef.current);
                holdTimerRef.current = undefined;
              }
              if (isDragging) {
                setIsDragging(false);
                setPreviewTab(null);
                syncPillToView(value);
              }
              dragState.current.hasMoved = false;
            }}
            className={`relative flex items-center gap-1.5 px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-wider z-10 ${
              lightMode ? 'text-zinc-600' : 'text-zinc-400'
            }`}
            style={{
              cursor: isActive ? (isDragging ? 'grabbing' : 'grab') : 'pointer',
              transform: previewTab === id && isDragging ? 'scale(1.025)' : undefined,
              transition: previewTab === id && isDragging ? 'transform 150ms ease-out' : undefined,
            }}
          >
            {dotColor !== undefined && (
              <div className="relative z-10 w-2 h-2 rounded-full" style={{ backgroundColor: dotColor || (lightMode ? '#a1a1aa' : '#71717a') }} />
            )}
            {Icon && <Icon size={14} className="relative z-10" style={{ color: lightMode ? '#52525b' : '#a1a1aa' }} />}
            <span className="relative z-10">{label}</span>
            {badge != null && badge > 0 && (
              <span className="relative z-10 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[9px] font-black shadow-sm">
                {badge}
              </span>
            )}
          </button>
        );
      })}

      <motion.div
        className="absolute rounded-full z-0 pointer-events-none"
        style={{
          left: pillX,
          width: pillWidth,
          top: '50%',
          translateY: '-50%',
          height: 'calc(100% - 8px)',
          scaleX: pillScaleX,
          scaleY: pillScaleY,
          y: pillY,
          backgroundColor: pillBg,
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          border: pillBorder,
          boxShadow: activeStyle?.boxShadow ?? (isDragging
            ? lightMode
              ? 'inset 0 1px 0 rgba(255,255,255,0.15), 0 8px 28px rgba(0,0,0,0.28)'
              : 'inset 0 1px 0 rgba(255,255,255,0.9), 0 8px 28px rgba(0,0,0,0.22)'
            : lightMode
              ? 'inset 0 1px 0 rgba(255,255,255,0.15), 0 1px 3px rgba(0,0,0,0.18)'
              : 'inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 3px rgba(0,0,0,0.08)'),
        }}
        transition={{
          type: 'spring',
          stiffness: SETTLE_SPRING.stiffness,
          damping: SETTLE_SPRING.damping,
          mass: SETTLE_SPRING.mass,
        }}
      />

      <motion.div
        className="absolute rounded-full z-20 pointer-events-none"
        style={{
          left: pillX,
          width: pillWidth,
          top: '50%',
          translateY: '-50%',
          height: 'calc(100% - 8px)',
          overflow: 'hidden',
        }}
      >
        <motion.div
          className="flex items-center gap-1 p-1"
          style={{
            x: contentX,
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            alignItems: 'center',
            whiteSpace: 'nowrap',
          }}
        >
          {items.map(({ id, label, icon: Icon, dotColor, badge }) => (
            <div
              key={id}
              className="relative flex items-center gap-1.5 px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-wider"
              style={{ color: activeLabelColor }}
            >
              {dotColor !== undefined && (
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: dotColor || (lightMode ? '#34d399' : '#10b981') }} />
              )}
              {Icon && <Icon size={14} style={{ color: activeLabelColor }} />}
              <span>{label}</span>
              {badge != null && badge > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[9px] font-black shadow-sm">
                  {badge}
                </span>
              )}
            </div>
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}
