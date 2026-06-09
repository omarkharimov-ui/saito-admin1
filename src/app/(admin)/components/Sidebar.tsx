import React, { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { supabase } from '@/lib/supabase';
import { filterNavByRole, getAdminNavItems } from './layout/adminNavLinks';

const Sidebar = ({
  role,
  isOpen,
  onClose,
}: {
  role: 'admin' | 'superadmin' | null;
  isOpen: boolean;
  onClose: () => void;
}) => {
  const pathname = usePathname();
  const { pendingCount, readyOrdersCount } = useNotifications();
  const { t } = useLanguage();
  const { lightMode } = useTheme();

  const links = useMemo(
    () =>
      filterNavByRole(
        getAdminNavItems(t, {
          pending: pendingCount,
          ready: readyOrdersCount,
        }),
        role
      ),
    [t, role, pendingCount, readyOrdersCount]
  );

  const handleLogout = async () => {
    document.cookie = 'saito_role=; Path=/; Max-Age=0';
    document.cookie = 'isLoggedIn=; Path=/; Max-Age=0';
    await supabase.auth.signOut();
    window.location.replace('/');
  };

  return (
    <div
      className={`fixed inset-y-0 left-0 z-50 flex flex-col transform transition-transform duration-300 lg:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
      style={{ width: 272 }}
    >
      {/* Glass panel */}
      <div className="mx-3 mt-3 flex-1 flex flex-col overflow-hidden rounded-[16px] border border-[var(--theme-border)] bg-[var(--theme-panel)] shadow-[var(--theme-shadow)] backdrop-blur-md">

        {/* Brand */}
        <div className="px-6 pt-6 pb-5">
          <Link href="/" className="flex items-center group">
            <span className="text-[11px] font-black tracking-[0.35em] leading-none uppercase text-[var(--theme-text)]">
              SAITO
            </span>
          </Link>
        </div>

        {/* Divider */}
        <div className="mx-4 h-px mb-3 bg-[var(--theme-border)]" />

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {links.map((link) => {
            const Icon = link.icon;
            const isActive = link.href === '/'
              ? pathname === '/'
              : pathname === link.href || pathname?.startsWith(link.href + '/');

            return (
              <Link
                key={link.id}
                href={link.href}
                onClick={onClose}
                className={`group relative flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all duration-200 rounded-[10px] border ${
                  isActive
                    ? 'text-[var(--theme-text)] bg-[var(--theme-panel)] border-[var(--theme-border-strong)] shadow-[0_1px_2px_rgba(0,0,0,0.03)]' : 'text-[var(--theme-text)] bg-[var(--theme-panel)] border-[var(--theme-border)]'
                    : (lightMode ? 'text-[#6E6E73] border-transparent hover:text-[#1D1D1F] hover:bg-[#F7F7F8]' : 'text-white/40 border-transparent hover:text-white/85 hover:bg-white/[0.05]')
                }`}
              >
                {/* Active indicator — left bar */}
                {isActive && (
                  <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full pointer-events-none bg-[var(--theme-text)]" />
                )}

                <span
                  className={`relative z-10 flex-shrink-0 transition-colors ${isActive ? 'text-[var(--theme-text)]' : 'text-[var(--theme-text-muted)] group-hover:text-[var(--theme-text-secondary)]'}`}
                >
                  <Icon size={20} />
                </span>

                {/* Label */}
                <span className="relative z-10 flex-1 transition-transform duration-200 group-hover:translate-x-[2px]">
                  {link.name}
                </span>

                {/* Badges */}
                <span className="relative z-10 flex-shrink-0 flex items-center gap-1">
                  {(link as any).readyBadge > 0 && (
                    <span className="tabular-nums text-[10px] font-bold rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1.5 bg-[var(--theme-accent-soft)] text-[var(--theme-accent)] border border-[var(--theme-accent-border)]">
                      {(link as any).readyBadge}
                    </span>
                  )}
                  {link.badge && link.badge > 0 ? (
                    <span className={`tabular-nums text-[10px] font-bold rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1.5 ${
                      link.blink
                        ? 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent)] border border-[var(--theme-accent-border)]'
                        : (lightMode ? 'bg-[#F5F5F5] text-[#6E6E73] border border-[#E5E5E7]' : 'bg-white/[0.06] text-white/50 border border-white/[0.10]')
                    }`}>
                      {link.badge}
                    </span>
                  ) : null}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="mx-3 mt-3 mb-3">
          <div className="h-px mb-3 bg-[var(--theme-border)]" />
          <div className="flex items-center gap-3 px-2 py-2 rounded-[10px]">
            <div className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0 bg-[var(--theme-panel)] border border-[var(--theme-border)]">
              <span className="text-[10px] font-black text-[var(--theme-text-muted)]">
                {role === 'superadmin' ? 'SA' : 'A'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <span className={`block text-[9px] font-black uppercase tracking-widest ${role === 'superadmin' ? 'text-gold' : 'text-[var(--theme-text-muted)]'}`}>
                {role === 'superadmin' ? t('superadmin') : t('admin')}
              </span>
            </div>
            <button
              onClick={handleLogout}
              title={t('logout')}
              className={`w-9 h-9 rounded-[10px] flex items-center justify-center border border-transparent transition-all ${lightMode ? 'text-[#8E8E93] hover:text-red-500 hover:bg-red-50 hover:border-red-200' : 'text-white/40 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20'}`}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Sidebar;
