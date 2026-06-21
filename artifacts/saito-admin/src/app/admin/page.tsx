'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import HeroBanner from './widgets/HeroBanner';
import LiveFloorSnapshot from './widgets/LiveFloorSnapshot';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Lightbulb, Zap, AlertTriangle, BrainCircuit } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/LanguageContext';

function YojiAdvice() {
  const { t } = useLanguage();
  const [advice, setAdvice] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAdvice = async () => {
      try {
        const res = await fetch('/api/stats?timeFilter=month');
        const data = await res.json();
        
        const isCritical = (data.netProfit < 0) || (data.totalWasteCost > (data.totalRevenue * 0.2));

        if (isCritical) {
          setAdvice({
            title: "KRİTİK VƏZİYYƏT",
            text: `Biznes təhlükədədir! Cari dövrdə ₼${Math.abs(data.netProfit).toLocaleString()} xalis ziyan və ₼${data.totalWasteCost.toLocaleString()} itki qeydə alınıb. Təcili tədbir görülməlidir!`,
            type: 'critical'
          });
        } else {
          setAdvice({
            title: "Yoji Məsləhəti",
            text: data.totalRevenue > 1000 
              ? "Satışlar stabil gedir. Maya dəyərini nəzarətdə saxlayaraq mənfəəti artıra bilərsiniz."
              : "Yeni kampaniyalarla müştəri axınını sürətləndirmək olar.",
            type: 'growth'
          });
        }
      } catch {
        setAdvice({
          title: "Yoji-dən Mesaj",
          text: "Saito-da işlər qaydasında gedir. Müştəri məmnuniyyətinə fokuslanmağa davam edin.",
          type: 'growth'
        });
      } finally {
        setLoading(false);
      }
    };
    fetchAdvice();
  }, []);

  const isCritical = advice?.type === 'critical';

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-[28px] border px-6 py-5 shadow-lg transition-all duration-500 ${
        isCritical 
          ? 'bg-rose-500/10 border-rose-500/20' 
          : 'bg-[#1c1c1e] border-white/[0.06]'
      }`}
    >
      <div className="absolute top-0 right-0 p-4 opacity-[0.03] pointer-events-none">
        <BrainCircuit size={80} className={isCritical ? 'text-rose-500' : 'text-gold'} />
      </div>

      <div className="flex items-center gap-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all ${
          isCritical ? 'bg-rose-500/20 border-rose-500/30' : 'bg-gold/10 border-gold/20'
        }`}>
          {isCritical ? <AlertTriangle className="text-rose-500" size={20} /> : <Lightbulb className="text-gold" size={20} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className={`text-sm font-black tracking-tight ${isCritical ? 'text-rose-600' : 'text-[var(--theme-text)]'}`}>
              {advice?.title}
            </h3>
            <span className={`text-[8px] font-black uppercase tracking-[0.3em] px-1.5 py-0.5 rounded-md ${
                isCritical ? 'bg-rose-500/20 text-rose-500' : 'bg-gold/20 text-gold'
            }`}>
              AI
            </span>
          </div>
          <p className={`text-xs leading-relaxed font-medium line-clamp-2 ${isCritical ? 'text-[var(--theme-text)] opacity-90' : 'text-[var(--theme-text-secondary)]'}`}>
            {advice?.text}
          </p>
        </div>
        <Link href="/admin/stats" className={`flex-shrink-0 text-[10px] font-black uppercase tracking-widest transition-all px-4 py-2 rounded-xl border ${
            isCritical ? 'text-rose-600 border-rose-500/30 hover:bg-rose-500/10' : 'text-gold border-gold/20 hover:bg-gold/10'
        }`}>
          DETALLAR
        </Link>
      </div>
    </motion.div>
  );
}

function DashboardContent() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();

  if (searchParams.get('needsSetup') === 'true') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-6">
          <AlertTriangle className="text-amber-500" size={32} />
        </div>
        <h1 className="text-2xl font-bold mb-2">Qurulum Lazımdır</h1>
        <Link href="/admin/settings?section=users&setup=true" className="px-8 py-3 rounded-xl bg-gold text-black font-bold uppercase tracking-widest text-xs">Ayarlara Get</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 max-w-[1400px] mx-auto">
      {/* 1. Hero Stats */}
      <HeroBanner />

      {/* 2. Yoji Advice (Now Center/Main) */}
      <YojiAdvice />

      {/* 3. Live Floor Snapshot */}
      <LiveFloorSnapshot />
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
