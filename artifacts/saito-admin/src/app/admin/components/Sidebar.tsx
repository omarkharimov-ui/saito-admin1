'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Activity, ChevronRight, Zap } from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
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
  const [isSystemActive, setIsSystemActive] = useState(true);
  
  // Stretch logic for tactile feeling
  const handleScale = useMotionValue(1);
  const springScale = useSpring(handleScale, { stiffness: 400, damping: 25 });

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

  const toggleSystem = () => {
    const newState = !isSystemActive;
    setIsSystemActive(newState);
    playSystemSound(newState ? 'on' : 'off');
  };

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
      {/* iOS 27 Vision Pro Container */}
      <div className="mx-5 my-5 flex-1 flex flex-col overflow-hidden rounded-[44px] border border-[var(--theme-border)] bg-[var(--theme-surface)] backdrop-blur-[60px] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.1)] dark:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.9)] relative">
        
        {/* Navigation */}
        <nav className="flex-1 px-5 space-y-1.5 overflow-y-auto scrollbar-none py-2">
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
                  className={`group relative flex items-center gap-4 px-5 py-4 rounded-[24px] transition-all duration-500 ${
                    isActive 
                      ? 'bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] shadow-[0_15px_35px_-10px_rgba(0,0,0,0.05)] dark:shadow-[0_15px_35px_-10px_rgba(0,0,0,0.6)]' 
                      : 'hover:bg-[var(--theme-surface-soft)]'
                  }`}
                >
                  <div className={`relative flex items-center justify-center transition-all duration-500 ${isActive ? 'text-[var(--theme-text)]' : 'text-[var(--theme-text-muted)] group-hover:text-[var(--theme-text)]'}`}>
                    <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                    {isActive && (
                      <motion.div layoutId="active-glow" className="absolute inset-0 blur-xl bg-gold/20 -z-10" />
                    )}
                  </div>

                  <span className={`flex-1 text-[12px] font-bold tracking-[0.2em] uppercase transition-all duration-500 ${isActive ? 'text-[var(--theme-text)]' : 'text-[var(--theme-text-muted)] group-hover:text-[var(--theme-text)]'}`}>
                    {link.name}
                  </span>

                  <AnimatePresence>
                    {isActive && (
                      <motion.div 
                        initial={{ opacity: 0, x: -10 }} 
                        animate={{ opacity: 1, x: 0 }}
                        className="w-1.5 h-1.5 rounded-full bg-gold shadow-[0_0_12px_#D4AF37]"
                      />
                    )}
                  </AnimatePresence>
                </Link>
              </motion.div>
            );
          })}
        </nav>

        {/* iOS 27 Tactile Switch Area */}
        <div className="p-6">
          <motion.div 
            whileTap={{ scale: 0.98 }}
            className="flex items-center justify-between px-5 py-5 rounded-[28px] bg-white/[0.04] border border-white/[0.06] backdrop-blur-md"
          >
             <div className="flex flex-col gap-1">
               <span className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em]">Sistem</span>
               <span className={`text-[9px] font-bold tracking-widest ${isSystemActive ? 'text-emerald-400' : 'text-zinc-500'}`}>
                 {isSystemActive ? 'LIVE SYNC' : 'STANDBY'}
               </span>
             </div>

             {/* The Squishy Apple Switch */}
             <button 
                onMouseDown={() => handleScale.set(1.4)}
                onMouseUp={() => handleScale.set(1)}
                onClick={toggleSystem}
                className={`relative w-12 h-7 rounded-full transition-all duration-500 overflow-hidden ${isSystemActive ? 'bg-emerald-500' : 'bg-zinc-800'}`}
             >
                <motion.div 
                  style={{ scaleX: springScale }}
                  animate={{ x: isSystemActive ? 20 : 0 }}
                  className="absolute left-1 top-1 w-5 h-5 bg-white rounded-full shadow-lg" 
                />
             </button>
          </motion.div>
        </div>

        {/* Logout (Hold to action) */}
        <div className="p-6 pt-0">
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
