'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import HeroBanner from './widgets/HeroBanner';
import LiveFloorSnapshot from './widgets/LiveFloorSnapshot';
import { motion } from 'framer-motion';
import { ShoppingCart, Monitor, Calendar, Settings, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/LanguageContext';

function DashboardContent() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();

  // Keep the setup redirect logic just in case, but as a secondary action
  if (searchParams.get('needsSetup') === 'true') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-6">
          <Settings className="text-amber-500" size={32} />
        </div>
        <h1 className="text-2xl font-bold mb-2">Qurulum Lazımdır</h1>
        <p className="text-[var(--theme-text-secondary)] mb-8 max-w-sm">
          Sistemdən tam istifadə etmək üçün ilk növbədə istifadəçi tənzimləmələrini tamamlamalısınız.
        </p>
        <Link 
          href="/admin/settings?section=users&setup=true"
          className="px-8 py-3 rounded-xl bg-gold text-black font-bold uppercase tracking-widest text-xs hover:brightness-110 transition-all"
        >
          Ayarlara Get
        </Link>
      </div>
    );
  }

  const QUICK_ACTIONS = [
    { id: 'pos', name: 'POS Sistemi', href: '/admin/pos', icon: Monitor, color: 'bg-blue-500/10 text-blue-400' },
    { id: 'reservations', name: t('reservations'), href: '/admin/reservations', icon: Calendar, color: 'bg-emerald-500/10 text-emerald-400' },
    { id: 'products', name: t('products'), href: '/admin/products', icon: ShoppingCart, color: 'bg-purple-500/10 text-purple-400' },
    { id: 'settings', name: t('settings'), href: '/admin/settings', icon: Settings, color: 'bg-zinc-500/10 text-zinc-400' },
  ];

  return (
    <div className="space-y-6 pb-20">
      {/* 1. Hero Stats */}
      <HeroBanner />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 2. Live Floor Snapshot (Left/Main) */}
        <div className="lg:col-span-8">
          <LiveFloorSnapshot />
        </div>

        {/* 3. Quick Actions (Right/Side) */}
        <div className="lg:col-span-4 space-y-6">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="rounded-3xl bg-[var(--theme-surface)] p-6 border border-[var(--theme-border)] shadow-sm"
          >
            <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--theme-text-muted)] mb-5">Tez Keçidlər</h3>
            <div className="grid grid-cols-1 gap-3">
              {QUICK_ACTIONS.map((action) => (
                <Link key={action.id} href={action.href}>
                  <div className="group flex items-center justify-between p-4 rounded-2xl bg-[var(--theme-nested)] border border-transparent hover:border-[var(--theme-border-strong)] transition-all cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${action.color}`}>
                        <action.icon size={20} />
                      </div>
                      <span className="text-sm font-semibold text-[var(--theme-text)]">{action.name}</span>
                    </div>
                    <ArrowRight size={16} className="text-[var(--theme-text-muted)] opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                  </div>
                </Link>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="rounded-3xl bg-gradient-to-br from-gold/20 to-amber-500/5 p-6 border border-gold/10 relative overflow-hidden group"
          >
            <div className="relative z-10">
              <h4 className="text-gold font-bold text-lg mb-1">Saito AI Sensei</h4>
              <p className="text-[11px] text-gold/60 leading-relaxed mb-4">Masa doluluğu və satış analizi əsasında tövsiyələr hazırlanır.</p>
              <Link href="/admin/stats">
                <button className="text-[10px] font-black uppercase tracking-widest text-gold flex items-center gap-2 group-hover:gap-3 transition-all">
                  Analizə Bax <ArrowRight size={12} />
                </button>
              </Link>
            </div>
            <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform duration-700">
              <Monitor size={120} className="text-gold" />
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-white/20 uppercase tracking-[0.3em] text-xs">Yüklənir...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
