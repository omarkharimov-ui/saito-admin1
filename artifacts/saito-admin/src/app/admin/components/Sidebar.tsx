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
      <div className="mx-3 mt-3 flex-1 flex flex-col overflow-hidden rounded-[22px] border border-[var(--theme-border)] bg-[var(--theme-panel)] shadow-[0_20px_60px_rgba(0,0,0,0.12)] backdrop-blur-2xl">

        {/* Brand */}
        <div className="px-6 pt-6 pb-5">
          <Link href="/admin" className="flex items-center group">
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
            const isActive = pathname === link.href;

            return (
              <Link
                key={link.id}
                href={link.href}
                onClick={onClose}
                className={`group relative flex items-center gap-3 px-4 py-3.5 text-[11px] font-bold uppercase tracking-[0.15em] transition-all duration-300 rounded-[14px] ${isActive ? 'text-gold' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]'}`}
              >
                <span
                  className={`relative z-10 flex-shrink-0 transition-colors ${isActive ? 'text-gold' : 'text-[var(--theme-text-muted)] group-hover:text-[var(--theme-text-secondary)]'}`}
                >
                  <Icon size={18} />
                </span>

                {/* Label */}
                <span className="relative z-10 flex-1">
                  {link.name}
                  {/* Underline effect - Premium Style */}
                  <span className={`absolute -bottom-1 left-0 h-[1.5px] bg-gold transition-all duration-500 ${isActive ? 'w-full opacity-100' : 'w-0 opacity-0 group-hover:w-1/2 group-hover:opacity-50'}`} />
                </span>

                {/* Badges */}
                <span className="relative z-10 flex-shrink-0 flex items-center gap-1">
                  {(link as any).readyBadge > 0 && (
                    <span className="tabular-nums text-[9px] font-black rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 bg-gold text-black">
                      {(link as any).readyBadge}
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="mx-3 mt-3 mb-3">
          <div className="h-px mb-3 bg-[var(--theme-border)]" />
          <div className="flex items-center gap-3 px-2 py-2 rounded-[10px]">
            <div className="w-8 h-8 rounded-[12px] flex items-center justify-center flex-shrink-0 bg-[var(--theme-surface)] border border-[var(--theme-border)]">
              <span className="text-[10px] font-black text-[var(--theme-text-muted)]">
                {role === 'superadmin' ? 'SA' : 'A'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <span className="block text-[9px] font-black uppercase tracking-widest text-[var(--theme-text-secondary)]">
                {role === 'superadmin' ? t('superadmin') : t('admin')}
              </span>
            </div>
            <button
              onClick={handleLogout}
              title={t('logout')}
              className="w-9 h-9 rounded-[12px] flex items-center justify-center border border-transparent transition-all text-[var(--theme-text-secondary)] hover:text-red-500 hover:bg-red-500/10 hover:border-red-500/20"
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
