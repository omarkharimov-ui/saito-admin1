'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { motion } from 'framer-motion';
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
      className={`fixed inset-y-0 left-0 z-50 flex flex-col transform transition-transform duration-500 lg:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
      style={{ width: 280 }}
    >
      {/* Premium Glass Container */}
      <div className="mx-4 my-4 flex-1 flex flex-col overflow-hidden rounded-[32px] border border-white/[0.08] bg-[#0a0a0a]/80 backdrop-blur-3xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)]">
        
        {/* Brand / Logo */}
        <div className="px-8 pt-9 pb-8">
          <Link href="/admin" className="flex items-center group gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-gold to-amber-600 flex items-center justify-center shadow-[0_0_20px_rgba(212,175,55,0.3)] group-hover:scale-110 transition-transform duration-500">
              <span className="text-black font-black text-xs">S</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[13px] font-bold tracking-[0.3em] uppercase text-white leading-none">
                SAITO
              </span>
              <span className="text-[8px] font-medium tracking-[0.4em] uppercase text-gold/50 mt-1">
                Management
              </span>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto scrollbar-none py-2">
          {links.map((link) => {
            const Icon = link.icon;
            // Strict match for dashboard, prefix match for others
            const isActive = link.href === '/admin' 
              ? pathname === '/admin' 
              : pathname.startsWith(link.href);

            return (
              <Link
                key={link.id}
                href={link.href}
                onClick={onClose}
                className="group relative flex items-center gap-3.5 px-5 py-3.5 rounded-2xl transition-all duration-300 outline-none"
              >
                {/* Active Hover Background (Pill Effect) */}
                {isActive && (
                  <motion.div
                    layoutId="active-pill"
                    className="absolute inset-0 bg-white/[0.05] border border-white/[0.08] rounded-2xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                  />
                )}
                
                {/* Hover Glow */}
                <div className="absolute inset-0 bg-gold/0 group-hover:bg-gold/[0.03] rounded-2xl transition-colors duration-300" />

                {/* Left Indicator Dot */}
                <div className={`relative z-10 w-1 h-1 rounded-full transition-all duration-500 ${isActive ? 'bg-gold scale-100 shadow-[0_0_8px_#D4AF37]' : 'bg-transparent scale-0'}`} />

                <span
                  className={`relative z-10 flex-shrink-0 transition-all duration-300 ${isActive ? 'text-gold' : 'text-white/40 group-hover:text-white/70'}`}
                >
                  <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                </span>

                <span className={`relative z-10 flex-1 text-[11px] font-bold uppercase tracking-[0.18em] transition-all duration-300 ${isActive ? 'text-white' : 'text-white/30 group-hover:text-white/60 group-hover:translate-x-0.5'}`}>
                  {link.name}
                </span>

                {/* Notification Badge */}
                {(link as any).readyBadge > 0 && (
                  <span className="relative z-10 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gold px-1.5 text-[10px] font-black text-black shadow-[0_0_12px_rgba(212,175,55,0.4)]">
                    {(link as any).readyBadge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer / User Profile */}
        <div className="p-4 mt-auto">
          <div className="rounded-[24px] bg-white/[0.03] border border-white/[0.06] p-4 flex items-center gap-3 group hover:border-white/10 transition-colors">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-900 border border-white/10 flex items-center justify-center flex-shrink-0 group-hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] transition-all">
              <span className="text-[11px] font-black text-white/40">
                {role === 'superadmin' ? 'SA' : 'A'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <span className="block text-[10px] font-bold text-white/80 uppercase tracking-widest truncate">
                {role === 'superadmin' ? 'Superadmin' : 'Administrator'}
              </span>
              <span className="block text-[8px] text-white/20 uppercase tracking-tighter mt-0.5 font-medium">
                Saito Sushi System
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white/20 hover:text-rose-400 hover:bg-rose-500/10 transition-all duration-300"
              title={t('logout')}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Sidebar;
