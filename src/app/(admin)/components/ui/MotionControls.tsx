'use client';

import { motion, useMotionValue, useSpring } from 'framer-motion';
import type { ReactNode } from 'react';

export type MotionTabItem = {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
};

interface AnimatedTabsProps {
  tabs: MotionTabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
}

export function AnimatedTabs({ tabs, activeKey, onChange, className = '' }: AnimatedTabsProps) {
  return (
    <div className={`flex items-center gap-1 p-1 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] ${className}`.trim()}>
      {tabs.map((tab) => {
        const active = tab.key === activeKey;

        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => !tab.disabled && onChange(tab.key)}
            disabled={tab.disabled}
            className={`relative overflow-hidden flex items-center gap-2 px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-colors whitespace-nowrap ${active ? 'text-[var(--theme-text)]' : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]'} ${tab.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            {active && (
              <motion.span
                layoutId="motion-tabs-active-pill"
                className="absolute inset-0 rounded-xl bg-[var(--theme-surface-hover)] border border-[var(--theme-border-strong)] shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            {tab.icon ? <span className="relative z-10">{tab.icon}</span> : null}
            <span className="relative z-10">{tab.label}</span>
            {tab.badge ? <span className="relative z-10">{tab.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

interface LiquidToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  className?: string;
  disabled?: boolean;
}

export function LiquidToggle({ checked, onChange, label, className = '', disabled = false }: LiquidToggleProps) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`inline-flex items-center gap-3 ${className}`.trim()}
    >
      {label ? <span className="text-sm font-medium text-[var(--theme-text)]">{label}</span> : null}
      <span
        className={`relative inline-flex h-7 w-12 items-center rounded-full border transition-all duration-300 ${checked ? 'border-[var(--theme-accent-border)] bg-[var(--theme-accent-soft)]' : 'border-[var(--theme-border)] bg-[var(--theme-surface-muted)]'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <motion.span
          className="h-5 w-5 rounded-full bg-[var(--theme-surface)] shadow-[0_6px_16px_rgba(0,0,0,0.16)]"
          animate={{ x: checked ? 20 : 2, scale: checked ? 1.02 : 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        />
      </span>
    </button>
  );
}

type DockItem = {
  key: string;
  label: string;
  href?: string;
  icon: ReactNode;
  active?: boolean;
  badge?: number;
  onClick?: () => void;
};

interface FloatingDockProps {
  items: DockItem[];
  className?: string;
  activeKey?: string;
  onActiveKeyChange?: (key: string) => void;
}

export function FloatingDock({ items, className = '', activeKey, onActiveKeyChange }: FloatingDockProps) {
  const firstActive = items.find((item) => item.active) ?? items[0];
  const currentKey = activeKey ?? firstActive?.key ?? '';
  const activeIndex = Math.max(0, items.findIndex((item) => item.key === currentKey));
  const dragX = useMotionValue(0);
  const springX = useSpring(dragX, { stiffness: 380, damping: 34 });
  const tabWidth = 76;

  const setIndex = (index: number) => {
    const clamped = Math.max(0, Math.min(index, items.length - 1));
    const next = items[clamped];
    if (!next) return;
    onActiveKeyChange?.(next.key);
    dragX.set(clamped * tabWidth);
  };

  return (
    <div className={`fixed inset-x-0 bottom-0 z-50 lg:hidden pb-[env(safe-area-inset-bottom)] ${className}`.trim()}>
      <div className="mx-3 mb-3 rounded-[28px] border border-[var(--theme-border)] bg-[var(--theme-panel)] shadow-[0_-12px_36px_rgba(0,0,0,0.12)] backdrop-blur-2xl">
        <div
          className="relative flex items-center justify-around gap-1 px-3 py-2.5 touch-none select-none"
          onPointerUp={() => setIndex(Math.round(dragX.get() / tabWidth))}
          onPointerCancel={() => setIndex(Math.round(dragX.get() / tabWidth))}
          onTouchEnd={() => setIndex(Math.round(dragX.get() / tabWidth))}
        >
          <motion.div
            className="absolute top-2 bottom-2 rounded-[22px] bg-[var(--theme-surface-hover)] border border-[var(--theme-border-strong)] shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
            style={{ width: tabWidth, x: springX }}
          />
          {items.map((item, index) => {
            const active = index === activeIndex;
            const content = (
              <>
                <span className={`flex h-11 w-11 items-center justify-center rounded-full transition-all ${active ? 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent)] border border-[var(--theme-accent-border)]' : 'text-[var(--theme-text-secondary)]'}`}>
                  {item.icon}
                </span>
                <span className={`text-[10px] font-semibold tracking-wide ${active ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-text-muted)]'}`}>
                  {item.label}
                </span>
                {typeof item.badge === 'number' && item.badge > 0 ? (
                  <span className="absolute right-1 top-1 min-w-[16px] h-4 px-1 rounded-full bg-[var(--theme-accent)] text-[9px] font-bold text-white flex items-center justify-center">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                ) : null}
              </>
            );

            const className = `relative flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 transition-transform active:scale-95 ${active ? 'text-[var(--theme-text)]' : ''}`;
            const sharedProps = {
              className,
              onClick: () => {
                onActiveKeyChange?.(item.key);
                dragX.set(index * tabWidth);
                item.onClick?.();
              },
              onPointerDown: () => setIndex(index),
            } as const;

            if (item.href) {
              return (
                <a key={item.key} href={item.href} {...sharedProps}>
                  {content}
                </a>
              );
            }

            return (
              <button key={item.key} type="button" {...sharedProps}>
                {content}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
