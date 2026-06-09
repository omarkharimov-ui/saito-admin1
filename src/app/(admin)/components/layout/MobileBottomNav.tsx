'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, MoreHorizontal, Grid2x2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useNotifications } from '../../context/NotificationContext';
import { filterNavByRole, getAdminNavItems, getMobilePrimaryNavIds } from './adminNavLinks';

export default function MobileBottomNav({
  role,
  onLogout,
}: {
  role: 'admin' | 'superadmin' | null;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  const { pendingCount } = useNotifications();
  const [moreOpen, setMoreOpen] = useState(false);

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

  return (
    <>
      <AnimatePresence>
        {moreOpen ? (
          <motion.div
            key="mobile-dock-backdrop"
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
          key="mobile-dock-more"
          className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-50 rounded-[28px] border p-4 shadow-[0_12px_48px_rgba(0,0,0,0.08)] lg:hidden border-[var(--theme-border)] bg-[var(--theme-panel)]"
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: moreOpen ? 1 : 0, y: moreOpen ? 0 : 20, scale: moreOpen ? 1 : 0.96 }}
          transition={{ type: 'spring', stiffness: 360, damping: 34 }}
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
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.04))',
          backdropFilter: 'blur(24px) saturate(180%)',
          borderTop: '1px solid var(--theme-border)',
          boxShadow: '0 -12px 36px rgba(0,0,0,0.12)',
        }}
      >
        <div className="mx-2 my-2 flex items-center justify-around h-[4.25rem] px-2 gap-1 rounded-[26px] border border-[var(--theme-border)] bg-[var(--theme-surface)] shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
          {primary.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            return (
              <Link
                key={link.id}
                href={link.href}
                className="relative flex flex-1 items-center justify-center min-w-0 overflow-hidden active:scale-95 transition-transform duration-100"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {active ? (
                  <motion.span
                    layoutId="mobile-dock-active-pill"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-full max-w-full"
                    style={{
                      background: 'var(--theme-accent-soft)',
                      border: '1px solid var(--theme-accent-border)',
                      boxSizing: 'border-box',
                    }}
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  >
                    <Icon size={17} strokeWidth={2} className="text-[var(--theme-accent)] shrink-0" />
                    <span className="text-[11px] font-bold text-[var(--theme-accent)] truncate tracking-wide">
                      {link.name}
                    </span>
                    {link.badge && link.badge > 0 ? (
                      <span className="min-w-[16px] h-4 px-1 rounded-full bg-[#007aff] text-[9px] font-bold text-white flex items-center justify-center shrink-0 shadow-[0_4px_14px_rgba(0,122,255,0.24)]">
                        {link.badge > 9 ? '9+' : link.badge}
                      </span>
                    ) : null}
                  </motion.span>
                ) : (
                  <span className="relative flex items-center justify-center w-11 h-11">
                    <Icon size={22} strokeWidth={1.6} className="text-[var(--theme-text-secondary)]" />
                    {link.badge && link.badge > 0 ? (
                      <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-400 text-[9px] font-bold text-black flex items-center justify-center">
                        {link.badge > 9 ? '9+' : link.badge}
                      </span>
                    ) : null}
                  </span>
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
                  transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                  className="flex items-center justify-center w-10 h-10 rounded-full"
                  style={{ background: 'var(--theme-surface-soft)', border: '1px solid var(--theme-border)' }}
                >
                  <Grid2x2 size={20} className="text-[var(--theme-text-secondary)]" />
                </motion.span>
              ) : (
                <MoreHorizontal size={22} strokeWidth={1.6} className="text-[var(--theme-text-muted)]" />
              )}
            </button>
          ) : null}
        </div>
      </nav>
    </>
  );
}
