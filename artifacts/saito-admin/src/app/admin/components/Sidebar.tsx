'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Activity, ChevronRight, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotifications } from '../context/NotificationContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { supabase } from '@/lib/supabase';
import { filterNavByRole, getAdminNavItems } from './layout/adminNavLinks';

// --- Apple System Sound Synthesizer ---
const playSystemSound = (type: 'on' | 'off' | 'pop') => {
  if (typeof window === 'undefined') return;
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  if (type === 'on') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
  } else if (type === 'off') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
  } else {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
  }

  osc.start();
  osc.stop(ctx.currentTime + 0.1);
};

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
    playSystemSound('off');
    document.cookie = 'saito_role=; Path=/; Max-Age=0';
    document.cookie = 'isLoggedIn=; Path=/; Max-Age=0';
    await supabase.auth.signOut();
    window.location.replace('/');
  };

  return (
    <div
      className={`fixed inset-y-0 left-0 z-50 flex flex-col lg:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
      style={{ width: 290 }}
    >
      {/* Sidebar container */}
      <div className="ml-0 my-0 flex-1 flex flex-col overflow-hidden rounded-r-[28px] border-r border-[var(--theme-border)] bg-[var(--theme-surface)] relative">
        
        {/* Navigation */}
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto scrollbar-none py-3">
          {links.map((link) => {
            const Icon = link.icon;
            const isActive = link.href === '/admin' ? pathname === '/admin' : pathname.startsWith(link.href);

            return (
              <motion.div
                key={link.id}
                whileTap={{ scale: 0.97, y: 1 }}
                onTapStart={() => playSystemSound('pop')}
              >
                <Link
                  href={link.href}
                  onClick={onClose}
                  className={`group relative flex items-center gap-3.5 px-4 py-3.5 rounded-[18px] transition-all duration-300 ${
                    isActive 
                      ? 'bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]' 
                      : 'hover:bg-[var(--theme-surface-soft)]'
                  }`}
                >
                  <div className={`relative flex items-center justify-center transition-all duration-300 ${isActive ? 'text-[var(--theme-text)]' : 'text-[var(--theme-text-muted)] group-hover:text-[var(--theme-text)]'}`}>
                    <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                    {isActive && (
                      <motion.div layoutId="active-glow" className="absolute inset-0 blur-xl bg-gold/20 -z-10" />
                    )}
                  </div>

                  <span className={`flex-1 text-[11px] font-bold tracking-[0.15em] uppercase transition-all duration-300 ${isActive ? 'text-[var(--theme-text)]' : 'text-[var(--theme-text-muted)] group-hover:text-[var(--theme-text)]'}`}>
                    {link.name}
                  </span>

                  <AnimatePresence>
                    {isActive && (
                      <motion.div 
                        initial={{ opacity: 0, x: -10 }} 
                        animate={{ opacity: 1, x: 0 }}
                        className="w-1 h-1 rounded-full bg-gold"
                      />
                    )}
                  </AnimatePresence>
                </Link>
              </motion.div>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-4">
          <motion.button 
            onClick={handleLogout}
            whileTap={{ scale: 0.95 }}
            className="w-full flex items-center justify-center gap-3 py-4 rounded-[24px] bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[11px] font-black uppercase tracking-[0.3em] hover:bg-rose-500/20 transition-all"
          >
            <LogOut size={16} />
            {t('logout')}
          </motion.button>
        </div>

      </div>
    </div>
  );
};

export default Sidebar;
