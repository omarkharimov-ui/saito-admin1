'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Grid2x2, LogOut, MoreHorizontal } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useNotifications } from '../../context/NotificationContext';
import { filterNavByRole, getAdminNavItems, getMobilePrimaryNavIds } from './adminNavLinks';

const dockSpring = { type: 'spring' as const, stiffness: 300, damping: 30 };

export default function ImmersiveNavigationDock({
  role,
  onLogout,
}: {
  role: 'admin' | 'superadmin' | null;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const { t } = useLanguage();
  const { pendingCount } = useNotifications();
  const [moreOpen, setMoreOpen] = useState(false);
  const [activeDockKey, setActiveDockKey] = useState('');
  const [dragActiveKey, setDragActiveKey] = useState('');
  const [dockDragging, setDockDragging] = useState(false);

  useEffect(() => {
    if (moreOpen) setMoreOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const allLinks = useMemo(
    () =>
      filterNavByRole(
        getAdminNavItems(t, { pending: pendingCount, ready: 0 }),
        role
      ),
    [t, role, pendingCount]
  );

  const primaryIds = getMobilePrimaryNavIds(role);
  const primary = allLinks.filter((l) => primaryIds.has(l.id));
  const overflow = allLinks.filter((l) => !primaryIds.has(l.id));
  const hasMore = overflow.length > 0;

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname?.startsWith(`${href}/`);

  useEffect(() => {
    const current = primary.find((link) => isActive(link.href)) ?? primary[0];
    if (current && !dockDragging) {
      setActiveDockKey(current.id);
      setDragActiveKey(current.id);
    }
  }, [pathname, primary, dockDragging]);

  const getDockIndex = (x: number, width: number) => {
    const itemWidth = width / Math.max(1, primary.length);
    return Math.max(0, Math.min(primary.length - 1, Math.floor(x / itemWidth)));
  };

  return (
    <>
      <AnimatePresence>
        {moreOpen ? (
          <motion.div
            key="immersive-dock-backdrop"
            className="fixed inset-0 z-40 lg:hidden"
            onClick={() => setMoreOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)' }}
          />
        ) : null}
      </AnimatePresence>

      {hasMore ? (
        <motion.div
          key="immersive-dock-more"
          className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] left-4 right-4 z-50 rounded-[28px] border p-4 shadow-[0_12px_48px_rgba(0,0,0,0.08)] lg:hidden border-[var(--theme-border)] bg-[var(--theme-panel)]"
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: moreOpen ? 1 : 0, y: moreOpen ? 0 : 20, scale: moreOpen ? 1 : 0.96 }}
          transition={dockSpring}
          style={{ backdropFilter: 'blur(24px)', pointerEvents: moreOpen ? 'auto' : 'none', willChange: 'transform, opacity' }}
        >
          <div className="grid grid-cols-4 gap-2 mb-3">
            {overflow.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.id}
                  href={link.href}
                  onClick={() => setMoreOpen(false)}
                  className="flex flex-col items-center gap-1.5 py-3 px-1 rounded-2xl transition-colors active:scale-95"
                  style={{
                    background: active ? 'var(--theme-accent-soft)' : 'var(--theme-surface-soft)',
                    border: active ? '1px solid var(--theme-accent-border)' : '1px solid var(--theme-border)',
                  }}
                >
                  <div className="relative">
                    <Icon
                      size={22}
                      strokeWidth={1.6}
                      className={active ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-text-secondary)]'}
                    />
                    {link.badge && link.badge > 0 ? (
                      <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-[var(--theme-accent)] text-[9px] font-bold text-white flex items-center justify-center shadow-[0_4px_14px_rgba(0,122,255,0.24)]">
                        {link.badge > 9 ? '9+' : link.badge}
                      </span>
                    ) : null}
                  </div>
                  <span className={`text-[10px] font-semibold text-center leading-tight tracking-wide ${active ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-text-muted)]'}`}>
                    {link.name}
                  </span>
                </Link>
              );
            })}
          </div>

          <div className="border-t pt-2 border-[var(--theme-border)]">
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                onLogout();
              }}
              className="flex w-full items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-colors active:scale-[0.98] text-red-500 hover:bg-red-500/10"
            >
              <LogOut size={18} />
              {t('logout')}
            </button>
          </div>
        </motion.div>
      ) : null}

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 lg:hidden pb-[env(safe-area-inset-bottom)]"
        aria-label="Əsas naviqasiya"
      >
        <div className="pointer-events-none mx-auto mb-1 flex w-full max-w-[430px] justify-center px-4">
          <button
            type="button"
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-neutral-900/70 px-4 py-2 text-[12px] font-semibold text-white/80 backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,0.22)] active:scale-95"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10">
              <Grid2x2 size={12} strokeWidth={2} className="text-white/80" />
            </span>
            Capture
          </button>
        </div>
        <div
          className="mx-2 my-1 flex items-center justify-around h-[4.5rem] px-2 gap-1 rounded-[28px] border border-white/10 bg-neutral-900/60 backdrop-blur-md shadow-[0_8px_30px_rgba(0,0,0,0.18)] touch-none select-none"
          onPointerDown={(event) => {
            setDockDragging(true);
            try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
            const rect = event.currentTarget.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const index = getDockIndex(x, rect.width);
            const next = primary[index];
            if (next) {
              setActiveDockKey(next.id);
              setDragActiveKey(next.id);
            }
          }}
          onPointerMove={(event) => {
            if (!dockDragging) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const index = getDockIndex(x, rect.width);
            const next = primary[index];
            if (next) {
              setActiveDockKey(next.id);
              setDragActiveKey(next.id);
            }
          }}
          onPointerUp={(event) => {
            setDockDragging(false);
            setDragActiveKey(activeDockKey);
            try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
          }}
          onPointerCancel={() => setDockDragging(false)}
          onPointerLeave={() => setDockDragging(false)}
        >
          {primary.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href) || activeDockKey === link.id;
            const draggingActive = dockDragging && dragActiveKey === link.id;
            return (
              <Link
                key={link.id}
                href={link.href}
                data-dock-item="true"
                className="relative flex flex-1 items-center justify-center min-w-0 overflow-hidden active:scale-95 transition-transform duration-100"
                style={{ WebkitTapHighlightColor: 'transparent' }}
                onClick={() => setActiveDockKey(link.id)}
              >
                {activeDockKey === link.id || draggingActive ? (
                  <motion.span
                    layoutId="immersive-dock-active-pill"
                    className="relative flex items-center gap-1.5 px-3 py-2 rounded-full max-w-full overflow-hidden backdrop-blur-xl"
                    style={{
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))',
                      border: '1px solid rgba(255,255,255,0.22)',
                      boxShadow: '0 10px 30px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.08)',
                      boxSizing: 'border-box',
                    }}
                    animate={{ scale: draggingActive ? 1.07 : dockDragging ? 1.03 : 1, y: dockDragging ? -1 : 0 }}
                    transition={dockSpring}
                  >
                    <motion.span
                      className="absolute inset-0 rounded-full opacity-80"
                      style={{
                        background:
                          'radial-gradient(circle at 30% 30%, rgba(34,211,238,0.14), transparent 34%), radial-gradient(circle at 70% 25%, rgba(217,70,239,0.10), transparent 34%), radial-gradient(circle at 50% 75%, rgba(250,204,21,0.08), transparent 30%)',
                        filter: 'blur(12px)',
                      }}
                      animate={{ opacity: dockDragging ? 1 : 0.72, scale: draggingActive ? 1.08 : dockDragging ? 1.05 : 1 }}
                      transition={dockSpring}
                    />
                    <motion.span
                      className="absolute -bottom-0.5 left-1/2 h-[2px] w-6 -translate-x-1/2 rounded-full"
                      style={{
                        background:
                          'linear-gradient(90deg, rgba(34,211,238,0), rgba(34,211,238,0.65), rgba(168,85,247,0.72), rgba(250,204,21,0.65), rgba(34,211,238,0))',
                        filter: 'blur(2px)',
                      }}
                      animate={{ opacity: dockDragging ? 1 : 0.7, scale: draggingActive ? 1.02 : 1 }}
                      transition={dockSpring}
                    />
                    <Icon size={17} strokeWidth={2} className="relative z-10 text-sky-400 shrink-0 opacity-95" />
                    <span className="relative z-10 text-[11px] font-bold text-sky-400 truncate tracking-wide opacity-95">
                      {link.name}
                    </span>
                    {link.badge && link.badge > 0 ? (
                      <span className="relative z-10 min-w-[16px] h-4 px-1 rounded-full bg-[#007aff] text-[9px] font-bold text-white flex items-center justify-center shrink-0 shadow-[0_4px_14px_rgba(0,122,255,0.18)]">
                        {link.badge > 9 ? '9+' : link.badge}
                      </span>
                    ) : null}
                  </motion.span>
                ) : (
                  <motion.span
                    className="relative flex items-center justify-center w-11 h-11 rounded-full"
                    animate={{ scale: dockDragging ? 0.98 : 1, opacity: 1 }}
                    transition={dockSpring}
                  >
                    <Icon size={22} strokeWidth={1.6} className="text-white/60" />
                    {link.badge && link.badge > 0 ? (
                      <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-400 text-[9px] font-bold text-black flex items-center justify-center">
                        {link.badge > 9 ? '9+' : link.badge}
                      </span>
                    ) : null}
                  </motion.span>
                )}
              </Link>
            );
          })}

          {hasMore ? (
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className="relative flex items-center justify-center w-11 h-11 active:scale-95 transition-transform duration-100"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              {moreOpen ? (
                <motion.span
                  animate={{ rotate: 90, scale: 1.02 }}
                  transition={dockSpring}
                  className="flex items-center justify-center w-10 h-10 rounded-full"
                  style={{ background: 'var(--theme-surface-soft)', border: '1px solid var(--theme-border)' }}
                >
                  <Grid2x2 size={20} className="text-[var(--theme-text-secondary)]" />
                </motion.span>
              ) : (
                <MoreHorizontal size={22} strokeWidth={1.6} className="text-white/60" />
              )}
            </button>
          ) : null}
        </div>
      </nav>
    </>
  );
}
