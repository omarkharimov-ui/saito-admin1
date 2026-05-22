'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, MoreHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
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
  const overflow = allLinks.filter((l) => !primaryIds.has(l.id));
  const hasMore = overflow.length > 0;

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <>
      {moreOpen && (
        <button
          type="button"
          aria-label="Menyunu bağla"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMoreOpen(false)}
        />
      )}

      {moreOpen && hasMore && (
        <div className="fixed bottom-[calc(3.75rem+env(safe-area-inset-bottom))] left-3 right-3 z-50 rounded-2xl border border-white/10 bg-[#0c0c0c] p-2 shadow-2xl lg:hidden">
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
          <button
            type="button"
            onClick={() => {
              setMoreOpen(false);
              onLogout();
            }}
            className="flex w-full items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-400"
          >
            <LogOut size={18} />
            {t('logout')}
          </button>
        </div>
      )}

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
                className={`mobile-tap-lift flex flex-1 flex-col items-center justify-center gap-0.5 min-w-0 px-1 ${
                  active ? 'text-gold' : 'text-white/40'
                }`}
              >
                <span className="relative">
                  <Icon size={20} strokeWidth={active ? 2.25 : 1.75} />
                  {link.badge && link.badge > 0 ? (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-amber-400 text-[9px] font-bold text-black flex items-center justify-center">
                      {link.badge > 9 ? '9+' : link.badge}
                    </span>
                  ) : null}
                </span>
                <span className="text-[9px] font-semibold truncate max-w-full tracking-wide">
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
