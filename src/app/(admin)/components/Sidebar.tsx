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
      <div className={`mx-3 mt-3 flex-1 flex flex-col overflow-hidden rounded-[16px] border ${lightMode ? 'border-[#E5E5E7] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_24px_rgba(0,0,0,0.04)]' : 'border-white/[0.07] bg-[rgba(10,10,10,0.82)] backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.5)]'}`}>

        {/* Brand */}
        <div className="px-6 pt-6 pb-5">
          <Link href="/" className="flex items-center group">
            <span className={`text-[11px] font-black tracking-[0.35em] leading-none uppercase ${lightMode ? 'text-[#1D1D1F]' : 'text-white/70'}`}>
              SAITO
            </span>
          </Link>
        </div>

        {/* Divider */}
        <div className={`mx-4 h-px mb-3 ${lightMode ? 'bg-[#E5E5E7]' : 'bg-white/[0.05]'}`} />

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
                    ? (lightMode ? 'text-[#111111] bg-white border-[#D2D2D7] shadow-[0_1px_2px_rgba(0,0,0,0.03)]' : 'text-white bg-white/[0.07] border-transparent')
                    : (lightMode ? 'text-[#6E6E73] border-transparent hover:text-[#1D1D1F] hover:bg-[#F7F7F8]' : 'text-white/40 border-transparent hover:text-white/85 hover:bg-white/[0.05]')
                }`}
              >
                {/* Active indicator — left bar */}
                {isActive && (
                  <span className={`absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full pointer-events-none ${lightMode ? 'bg-[#111111]' : 'bg-white/60'}`} />
                )}

                <span
                  className={`relative z-10 flex-shrink-0 transition-colors ${isActive ? (lightMode ? 'text-[#111111]' : 'text-white') : (lightMode ? 'text-[#8E8E93] group-hover:text-[#6E6E73]' : 'text-white/30 group-hover:text-white/65')}`}
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
                    <span className={`tabular-nums text-[10px] font-bold rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1.5 ${lightMode ? 'bg-[#ECFDF3] text-[#166534] border border-[#BBF7D0]' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'}`}>
                      {(link as any).readyBadge}
                    </span>
                  )}
                  {link.badge && link.badge > 0 ? (
                    <span className={`tabular-nums text-[10px] font-bold rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1.5 ${
                      link.blink
                        ? (lightMode ? 'bg-[#FFF8E7] text-[#9A6700] border border-[#FDE68A]' : 'bg-amber-400/15 text-amber-300 border border-amber-400/30')
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
          <div className={`h-px mb-3 ${lightMode ? 'bg-[#E5E5E7]' : 'bg-white/[0.05]'}`} />
          <div className="flex items-center gap-3 px-2 py-2 rounded-[10px]">
            <div className={`w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0 ${lightMode ? 'bg-[#F5F5F5] border border-[#E5E5E7]' : 'bg-white/[0.04] border border-white/[0.06]'}`}>
              <span className={`text-[10px] font-black ${lightMode ? 'text-[#6E6E73]' : 'text-white/40'}`}>
                {role === 'superadmin' ? 'SA' : 'A'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <span className={`block text-[9px] font-black uppercase tracking-widest ${lightMode ? 'text-[#6E6E73]' : (role === 'superadmin' ? 'text-gold' : 'text-white/40')}`}>
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
