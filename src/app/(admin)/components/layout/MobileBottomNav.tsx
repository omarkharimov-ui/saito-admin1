'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { LogOut, MoreHorizontal } from 'lucide-react';
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
  }, [pathname]);

  const allLinks = useMemo(
    () =>
      filterNavByRole(
        getAdminNavItems(t, {
          pending: pendingCount,
          orders: 0,
          ready: 0,
        }),
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
      <AnimatePresence>
        {moreOpen && (
          <motion.button
            type="button"
            aria-label="Menyunu bağla"
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setMoreOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {moreOpen && hasMore && (
          <motion.div
            className="fixed bottom-[calc(3.75rem+env(safe-area-inset-bottom))] left-3 right-3 z-50 rounded-2xl border border-white/10 bg-[#0c0c0c] p-2 shadow-2xl lg:hidden"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {overflow.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.id}
                  href={link.href}
                  onClick={() => setMoreOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${
                    active ? 'bg-white/10 text-white' : 'text-white/55'
                  }`}
                >
                  <Icon size={18} />
                  <span className="flex-1">{link.name}</span>
                  {link.badge && link.badge > 0 ? (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-400/15 text-amber-300">
                      {link.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
            <motion.button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                onLogout();
              }}
              whileTap={{ scale: 0.98 }}
              className="flex w-full items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-400"
            >
              <LogOut size={18} />
              {t('logout')}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.08] bg-[#0a0a0a]/98 pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="Əsas naviqasiya"
      >
        <div className="flex items-stretch justify-around h-[3.75rem] px-1">
          {primary.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            return (
              <Link
                key={link.id}
                href={link.href}
                className={`mobile-tap-lift relative flex flex-1 flex-col items-center justify-center gap-0.5 min-w-0 px-1 overflow-hidden ${
                  active ? 'text-gold' : 'text-white/40'
                }`}
              >
                {active ? (
                  <motion.span
                    layoutId="mobile-active-tab"
                    className="absolute inset-1 rounded-2xl bg-white/10"
                    initial={false}
                    transition={{ type: 'spring', stiffness: 220, damping: 26, mass: 0.8 }}
                    style={{ transform: 'translateZ(0)' }}
                  />
                ) : null}
                <span className="relative z-10">
                  <Icon size={20} strokeWidth={1.9} />
                  {link.badge && link.badge > 0 ? (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-amber-400 text-[9px] font-bold text-black flex items-center justify-center">
                      {link.badge > 9 ? '9+' : link.badge}
                    </span>
                  ) : null}
                </span>
                <span className="relative z-10 text-[9px] font-semibold truncate max-w-full tracking-wide transition-colors duration-200 ease-out">
                  {link.name}
                </span>
              </Link>
            );
          })}

          {hasMore && (
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className={`mobile-tap-lift flex flex-1 flex-col items-center justify-center gap-0.5 min-w-0 px-1 ${
                moreOpen ? 'text-gold' : 'text-white/40'
              }`}
            >
              <MoreHorizontal size={20} />
              <span className="text-[9px] font-semibold">Daha çox</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
