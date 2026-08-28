'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, useMotionValue, animate } from 'framer-motion';
import { Users, Clock } from 'lucide-react';

interface StaffWorkspaceSwitcherProps {
  view: 'staff' | 'shifts';
  onChange: (view: 'staff' | 'shifts') => void;
  staffCount: number;
  activeShiftCount: number;
}

const TABS = [
  { id: 'staff' as const, label: 'STAFF', icon: Users, color: '#10b981' },
  { id: 'shifts' as const, label: 'SHIFTS', icon: Clock, color: '#3b82f6' },
];

const HOLD_THRESHOLD = 120;
const TRAVEL_SPRING = { stiffness: 420, damping: 28, mass: 0.38 };
const SETTLE_SPRING = { stiffness: 480, damping: 24, mass: 0.36 };

export function StaffWorkspaceSwitcher({ view, onChange, staffCount, activeShiftCount }: StaffWorkspaceSwitcherProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [previewTab, setPreviewTab] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dragState = useRef({
    startX: 0,
    pillStartX: 0,
    hasMoved: false,
    activeTab: view,
  });
  const animationRef = useRef<ReturnType<typeof animate> | null>(null);

  const pillX = useMotionValue(0);
  const pillWidth = useMotionValue(0);
  const pillScaleX = useMotionValue(1);
  const pillScaleY = useMotionValue(1);
  const pillY = useMotionValue(0);

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
    syncPillToView(view);
  }, [view, syncPillToView]);

  useEffect(() => {
    const handleResize = () => syncPillToView(view);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [view, syncPillToView]);

  const cancelAnimations = useCallback(() => {
    if (animationRef.current) {
      animationRef.current.stop?.();
      animationRef.current = null;
    }
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isDragging) return;
    e.preventDefault();
    cancelAnimations();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    dragState.current = {
      startX: e.clientX,
      pillStartX: pillX.get() || 0,
      hasMoved: false,
      activeTab: view,
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

    TABS.forEach(tab => {
      const tabEl = tabRefs.current[tab.id];
      if (!tabEl) return;
      const tabRect = tabEl.getBoundingClientRect();
      const tabCenter = tabRect.left - containerRect.left + tabRect.width / 2;
      const distance = Math.abs(pillCenter - tabCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestTab = tab.id;
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
      const targetId = (previewTab || dragState.current.activeTab) as 'staff' | 'shifts';
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
            if (targetId !== view) {
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

  const handleTabClick = (tabId: 'staff' | 'shifts') => {
    if (dragState.current.hasMoved) {
      dragState.current.hasMoved = false;
      return;
    }
    if (tabId === view) return;

    const target = measureTab(tabId);
    if (!target) return;

    cancelAnimations();

    const direction = TABS.findIndex(t => t.id === tabId) > TABS.findIndex(t => t.id === view) ? 1 : -1;

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

  useEffect(() => {
    return () => cancelAnimations();
  }, [cancelAnimations]);

  return (
    <div className="flex items-center gap-4 mb-6">
      <div
        ref={containerRef}
        className="relative flex items-center gap-1 rounded-full p-1 bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] select-none"
        style={{ touchAction: 'none', overflow: 'visible' }}
      >
        {TABS.map(({ id, label, icon: Icon, color }) => {
          const isActive = view === id;
          const isPreview = previewTab === id && isDragging;

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
                  syncPillToView(view);
                }
                dragState.current.hasMoved = false;
              }}
              className={`relative flex items-center gap-1.5 px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-wider transition-colors duration-150 z-10 ${
                isActive || isPreview ? 'text-black' : 'text-[var(--theme-text-muted)]'
              }`}
              style={{
                cursor: isActive ? (isDragging ? 'grabbing' : 'grab') : 'pointer',
                transform: isPreview ? 'scale(1.025)' : undefined,
                transition: isPreview ? 'transform 150ms ease-out' : undefined,
              }}
            >
              <div className="relative z-10 w-2 h-2 rounded-full" style={{ backgroundColor: (isActive || isPreview) ? color : 'rgba(255,255,255,0.25)' }} />
              <Icon size={14} className="relative z-10" />
              <span className="relative z-10">{label}</span>
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
            backgroundColor: isDragging ? 'rgba(255,255,255,0.12)' : '#ffffff',
            backdropFilter: isDragging ? 'blur(14px)' : 'none',
            border: isDragging ? '1px solid rgba(255,255,255,0.22)' : '1px solid transparent',
            boxShadow: isDragging ? '0 8px 28px rgba(0,0,0,0.20)' : '0 1px 3px rgba(0,0,0,0.08)',
          }}
          transition={{
            type: 'spring',
            stiffness: SETTLE_SPRING.stiffness,
            damping: SETTLE_SPRING.damping,
            mass: SETTLE_SPRING.mass,
          }}
        />
      </div>

      <div className="ml-auto flex items-center gap-5 text-[10px] font-black uppercase tracking-widest">
        <span className="text-[var(--theme-text-muted)]">{staffCount} staff</span>
        <span className="text-emerald-400/70">{activeShiftCount} on shift</span>
      </div>
    </div>
  );
}
