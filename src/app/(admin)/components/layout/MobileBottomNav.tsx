'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, MoreHorizontal, Grid2x2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
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
  const { pendingCount } = useNotifications();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (moreOpen) setMoreOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const allLinks = useMemo(
    () =>
      filterNavByRole(
        getAdminNavItems(t, { pending: pendingCount, orders: 0, ready: 0 }),
        role
      ),
    [t, role, pendingCount]
  );

  const primaryIds = getMobilePrimaryNavIds(role);
  const primary = allLinks.filter((l) => primaryIds.has(l.id));
  const overflow = allLinks.filter((l) => !primaryIds.has(l.id) && l.id !== 'orders');
  const hasMore = overflow.length > 0;

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 lg:hidden"
        onClick={() => setMoreOpen(false)}
        style={{
          opacity: moreOpen ? 1 : 0,
          pointerEvents: moreOpen ? 'auto' : 'none',
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: moreOpen ? 'blur(4px)' : 'none',
          transition: 'opacity 0.2s ease',
        }}
      />

      {/* More popup — grid of app icons */}
      {hasMore && (
        <div
          className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-50 rounded-3xl border border-white/[0.1] p-4 shadow-2xl lg:hidden"
          style={{
            background: 'rgba(12,12,12,0.97)',
            backdropFilter: 'blur(24px)',
            opacity: moreOpen ? 1 : 0,
            transform: moreOpen ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.96)',
            pointerEvents: moreOpen ? 'auto' : 'none',
            transition: 'opacity 0.22s ease, transform 0.25s cubic-bezier(0.22,1,0.36,1)',
            willChange: 'transform, opacity',
          }}
        >
          {/* Grid of icon links */}
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
                    background: active ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.04)',
                    border: active ? '1px solid rgba(212,175,55,0.3)' : '1px solid rgba(255,255,255,0.07)',
                  }}
                >
                  <div className="relative">
                    <Icon
                      size={22}
                      strokeWidth={1.6}
                      className={active ? 'text-gold' : 'text-white/50'}
                    />
                    {link.badge && link.badge > 0 ? (
                      <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-amber-400 text-[9px] font-bold text-black flex items-center justify-center">
                        {link.badge > 9 ? '9+' : link.badge}
                      </span>
                    ) : null}
                  </div>
                  <span className={`text-[10px] font-semibold text-center leading-tight tracking-wide ${active ? 'text-gold' : 'text-white/40'}`}>
                    {link.name}
                  </span>
                </Link>
              );
            })}
          </div>

          {/* Divider + Logout */}
          <div className="border-t border-white/[0.07] pt-2">
            <button
              type="button"
              onClick={() => { setMoreOpen(false); onLogout(); }}
              className="flex w-full items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium text-red-400/80 hover:bg-red-500/10 transition-colors active:scale-[0.98]"
            >
              <LogOut size={18} />
              {t('logout')}
            </button>
          </div>
        </div>
      )}

      {/* Bottom Nav Bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 lg:hidden pb-[env(safe-area-inset-bottom)]"
        aria-label="Əsas naviqasiya"
        style={{
          background: 'rgba(10,10,10,0.97)',
          backdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <div className="flex items-center justify-around h-[4.25rem] px-3 gap-1">
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
                  /* Pill-shaped active tab */
                  <span
                    className="flex items-center gap-1.5 px-3 py-2 rounded-full max-w-full"
                    style={{
                      background: 'rgba(212,175,55,0.13)',
                      border: '1px solid rgba(212,175,55,0.28)',
                      boxSizing: 'border-box',
                    }}
                  >
                    <Icon size={17} strokeWidth={2} className="text-gold shrink-0" />
                    <span className="text-[11px] font-bold text-gold truncate tracking-wide">
                      {link.name}
                    </span>
                    {link.badge && link.badge > 0 ? (
                      <span className="min-w-[16px] h-4 px-1 rounded-full bg-amber-400 text-[9px] font-bold text-black flex items-center justify-center shrink-0">
                        {link.badge > 9 ? '9+' : link.badge}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  /* Inactive — icon only */
                  <span className="relative flex items-center justify-center w-11 h-11">
                    <Icon size={22} strokeWidth={1.6} className="text-white/35" />
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

          {/* More button */}
          {hasMore && (
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className="relative flex items-center justify-center w-11 h-11 active:scale-95 transition-transform duration-100"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              {moreOpen ? (
                <span
                  className="flex items-center justify-center w-10 h-10 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}
                >
                  <Grid2x2 size={20} className="text-white/70" />
                </span>
              ) : (
                <MoreHorizontal size={22} strokeWidth={1.6} className="text-white/35" />
              )}
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
