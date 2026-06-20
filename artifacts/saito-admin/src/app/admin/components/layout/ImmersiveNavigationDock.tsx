'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useRef } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Grid2x2, LogOut, MoreHorizontal } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useNotifications } from '../../context/NotificationContext';
import { filterNavByRole, getAdminNavItems, getMobilePrimaryNavIds } from './adminNavLinks';

const playTick = () => {
  if (typeof window === 'undefined') return;
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.setValueAtTime(150, ctx.currentTime);
  gain.gain.setValueAtTime(0.02, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
  osc.start();
  osc.stop(ctx.currentTime + 0.05);
};

export default function ImmersiveNavigationDock({
  role,
  onLogout,
}: {
  role: 'admin' | 'superadmin' | null;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  const { pendingCount } = useNotifications();
  const [moreOpen, setMoreOpen] = useState(false);
  const [isPressing, setIsPressing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const dockRef = useRef<HTMLDivElement>(null);

  const allLinks = useMemo(
    () => filterNavByRole(getAdminNavItems(t, { pending: pendingCount, ready: 0 }), role),
    [t, role, pendingCount]
  );

  const primaryIds = getMobilePrimaryNavIds(role);
  const primary = allLinks.filter((l) => primaryIds.has(l.id));
  const overflow = allLinks.filter((l) => !primaryIds.has(l.id));
  const hasMore = overflow.length > 0;

  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);

  useEffect(() => {
    const idx = primary.findIndex(l => isActive(l.href));
    if (idx !== -1) setActiveIndex(idx);
  }, [pathname, primary]);

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isPressing || !dockRef.current) return;
    const rect = dockRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const itemWidth = rect.width / (primary.length + (hasMore ? 1 : 0));
    const newIndex = Math.max(0, Math.min(primary.length - 1, Math.floor(x / itemWidth)));
    
    if (newIndex !== activeIndex) {
      setActiveIndex(newIndex);
      playTick();
    }
  };

  const handlePointerUp = () => {
    if (isPressing) {
      router.push(primary[activeIndex].href);
      playTick();
    }
    setIsPressing(false);
  };

  return (
    <>
      <AnimatePresence>
        {moreOpen && (
          <motion.div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xl"
            onClick={() => setMoreOpen(false)}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>

      {/* Overflow Menu */}
      <AnimatePresence>
        {moreOpen && (
          <motion.div
            className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-50 rounded-[36px] border border-white/10 p-6 bg-black/80 backdrop-blur-3xl shadow-2xl"
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
          >
            <div className="grid grid-cols-4 gap-4 mb-6">
              {overflow.map((link) => (
                <Link key={link.id} href={link.href} onClick={() => setMoreOpen(false)} className="flex flex-col items-center gap-2">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${isActive(link.href) ? 'bg-gold/10 border-gold/30 text-gold' : 'bg-white/5 border-white/5 text-white/40'}`}>
                    <link.icon size={22} />
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-white/30 text-center leading-tight">{link.name}</span>
                </Link>
              ))}
            </div>
            <button onClick={onLogout} className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-rose-500/10 text-rose-400 text-xs font-bold uppercase tracking-widest border border-rose-500/20">
              <LogOut size={16} /> {t('logout')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The Dynamic Tactile Dock */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)] px-4">
        <div
          ref={dockRef}
          onPointerDown={() => setIsPressing(true)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => setIsPressing(false)}
          className="relative mx-auto mb-4 flex items-center h-20 px-2 rounded-[34px] border border-white/[0.08] bg-black/40 backdrop-blur-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.5)] touch-none select-none overflow-hidden"
        >
          {/* Active Indicator (Squishy Pill) */}
          <motion.div
            layoutId="dock-pill"
            className="absolute h-[calc(100%-16px)] rounded-[28px] bg-white/[0.08] border border-white/[0.1] shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"
            animate={{
              left: `${activeIndex * (100 / (primary.length + (hasMore ? 1 : 0)))}%`,
              width: `${100 / (primary.length + (hasMore ? 1 : 0))}%`,
              scale: isPressing ? 0.95 : 1,
            }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          />

          {primary.map((link, i) => {
            const active = activeIndex === i;
            return (
              <div key={link.id} className="relative z-10 flex-1 flex flex-col items-center justify-center gap-1.5 h-full transition-all duration-300">
                <motion.div animate={{ scale: active ? (isPressing ? 1.2 : 1.1) : 1, y: active ? -2 : 0 }}>
                  <link.icon size={22} strokeWidth={active ? 2.5 : 2} className={active ? 'text-white' : 'text-white/20'} />
                </motion.div>
                <span className={`text-[9px] font-black uppercase tracking-[0.15em] ${active ? 'text-white' : 'text-white/20'}`}>
                  {link.name}
                </span>
                {link.badge && link.badge > 0 && (
                  <div className="absolute top-4 right-4 w-1.5 h-1.5 rounded-full bg-gold shadow-[0_0_10px_#D4AF37]" />
                )}
              </div>
            );
          })}

          {hasMore && (
            <button onClick={() => setMoreOpen(!moreOpen)} className="relative z-10 flex-1 flex items-center justify-center h-full">
              <MoreHorizontal size={22} className={moreOpen ? 'text-gold' : 'text-white/20'} />
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
