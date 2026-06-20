'use client';

import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Activity, ChevronRight, Zap } from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'framer-motion';
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
  const [isSystemActive, setIsSystemActive] = useState(true);
  
  // Hold-to-Logout Logic
  const [isHolding, setIsHolding] = useState(false);
  const holdProgress = useMotionValue(0);
  const springProgress = useSpring(holdProgress, { stiffness: 100, damping: 30 });
  const progressWidth = useTransform(springProgress, [0, 100], ["0%", "100%"]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isHolding) {
      interval = setInterval(() => {
        holdProgress.set(Math.min(holdProgress.get() + 4, 100));
        if (holdProgress.get() >= 100) {
          handleLogout();
        }
      }, 30);
    } else {
      holdProgress.set(0);
    }
    return () => clearInterval(interval);
  }, [isHolding]);

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
      className={`fixed inset-y-0 left-0 z-50 flex flex-col transform transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] lg:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
      style={{ width: 290 }}
    >
      {/* iOS 27 Ultra-Glass Container */}
      <div className="mx-5 my-5 flex-1 flex flex-col overflow-hidden rounded-[40px] border border-white/[0.1] bg-black/60 backdrop-blur-[50px] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] relative">
        
        {/* Top Glow Ambient */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-gold/30 blur-xl rounded-full" />

        {/* Header Section */}
        <div className="px-9 pt-10 pb-8 shrink-0">
          <Link href="/admin" className="flex items-center gap-4 group">
            <motion.div 
              whileHover={{ rotate: 180, scale: 1.1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className="w-10 h-10 rounded-[14px] bg-white text-black flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.2)]"
            >
              <Zap size={20} fill="currentColor" />
            </motion.div>
            <div className="flex flex-col">
              <span className="text-[14px] font-black tracking-[0.35em] text-white leading-none">SAITO</span>
              <span className="text-[9px] font-bold tracking-[0.4em] text-white/30 uppercase mt-1.5">OS v.27.4</span>
            </div>
          </Link>
        </div>

        {/* Navigation - Tactile List */}
        <nav className="flex-1 px-5 space-y-1 overflow-y-auto scrollbar-none py-2">
          {links.map((link) => {
            const Icon = link.icon;
            const isActive = link.href === '/admin' ? pathname === '/admin' : pathname.startsWith(link.href);

            return (
              <motion.div
                key={link.id}
                whileTap={{ scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              >
                <Link
                  href={link.href}
                  onClick={onClose}
                  className={`group relative flex items-center gap-4 px-5 py-4 rounded-[22px] transition-all duration-500 ${
                    isActive 
                      ? 'bg-white/[0.08] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.1)]' 
                      : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <div className={`relative flex items-center justify-center transition-all duration-500 ${isActive ? 'text-white' : 'text-white/20 group-hover:text-white/50'}`}>
                    <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                    {isActive && (
                      <motion.div layoutId="icon-glow" className="absolute inset-0 blur-md bg-white/20 -z-10" />
                    )}
                  </div>

                  <span className={`flex-1 text-[12px] font-bold tracking-widest uppercase transition-all duration-500 ${isActive ? 'text-white' : 'text-white/20 group-hover:text-white/50'}`}>
                    {link.name}
                  </span>

                  {isActive ? (
                    <motion.div initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }}>
                      <ChevronRight size={14} className="text-white/30" />
                    </motion.div>
                  ) : (
                    (link as any).readyBadge > 0 && (
                      <div className="h-2 w-2 rounded-full bg-gold shadow-[0_0_10px_rgba(212,175,55,0.8)]" />
                    )
                  )}
                </Link>
              </motion.div>
            );
          })}
        </nav>

        {/* Interaction Section (iOS Style Toggle) */}
        <div className="px-6 py-6 border-t border-white/[0.05]">
          <div className="flex items-center justify-between px-4 py-4 rounded-3xl bg-white/[0.03] border border-white/[0.05]">
             <div className="flex items-center gap-3">
               <div className={`w-2 h-2 rounded-full ${isSystemActive ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-zinc-600'}`} />
               <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Live Sync</span>
             </div>
             {/* iOS 27 Switch */}
             <button 
                onClick={() => setIsSystemActive(!isSystemActive)}
                className={`w-10 h-5.5 rounded-full p-0.5 transition-all duration-500 ${isSystemActive ? 'bg-emerald-500' : 'bg-zinc-800'}`}
             >
                <motion.div 
                  animate={{ x: isSystemActive ? 18 : 0 }}
                  className="w-4.5 h-4.5 bg-white rounded-full shadow-lg" 
                />
             </button>
          </div>
        </div>

        {/* Footer - Hold to Logout */}
        <div className="p-6 pt-0 mt-auto">
          <div 
            onMouseDown={() => setIsHolding(true)}
            onMouseUp={() => setIsHolding(false)}
            onMouseLeave={() => setIsHolding(false)}
            onTouchStart={() => setIsHolding(true)}
            onTouchEnd={() => setIsHolding(false)}
            className="relative group cursor-pointer overflow-hidden rounded-[26px] bg-white/[0.03] border border-white/[0.06] p-4 flex items-center gap-4 active:scale-[0.98] transition-all select-none"
          >
            {/* Progress Fill Overlay */}
            <motion.div 
              style={{ width: progressWidth }}
              className="absolute inset-0 bg-gold/10 z-0 border-r border-gold/30"
            />

            <div className="relative z-10 w-11 h-11 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center flex-shrink-0">
              <LogOut size={18} className="text-white/40 group-hover:text-rose-400 transition-colors" />
            </div>

            <div className="relative z-10 flex-1">
              <span className="block text-[11px] font-black text-white/80 uppercase tracking-widest">
                {isHolding ? 'Release to Stay' : 'Hold to Logout'}
              </span>
              <span className="block text-[8px] text-white/20 uppercase tracking-tighter mt-1 font-medium">
                Saito Terminal Session
              </span>
            </div>
            
            <Activity size={14} className={`relative z-10 transition-colors ${isSystemActive ? 'text-emerald-500' : 'text-zinc-700'}`} />
          </div>
        </div>

      </div>
    </div>
  );
};

export default Sidebar;
