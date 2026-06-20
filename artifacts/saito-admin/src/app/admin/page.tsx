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
        const res = await fetch('/api/dashboard/stats');
        const data = await res.json();
        // Here we can use the static advice or fetched AI insights
        setAdvice({
          title: "Günün Strategiyası",
          text: data.marginInsight?.marginPressure === 'healthy' 
            ? "Mənfəət marjanız stabil qalır. Bu gün premium set menyuları önə çıxarmaq üçün əla fürsətdir."
            : "Xərc təzyiqi hiss olunur. FC (Food Cost) optimallaşdırmasına diqqət yetirin.",
          type: data.marginInsight?.marginPressure || 'growth'
        });
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="relative overflow-hidden rounded-3xl bg-card border border-white/[0.06] p-8 shadow-xl"
    >
      <div className="absolute top-0 right-0 p-8 opacity-[0.03]">
        <BrainCircuit size={120} className="text-gold" />
      </div>
      
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-gold/10 flex items-center justify-center border border-gold/20">
          <Lightbulb className="text-gold" size={24} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white tracking-tight">Yoji Məsləhətləri</h3>
          <p className="text-[10px] text-gold uppercase tracking-[0.3em]">AI Strategiya Analizi</p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            <div className="h-4 w-3/4 bg-white/5 rounded-full animate-pulse" />
            <div className="h-4 w-1/2 bg-white/5 rounded-full animate-pulse" />
          </motion.div>
        ) : (
          <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <p className="text-[15px] text-white/75 leading-relaxed font-medium italic italic-serif">
              "{advice?.text}"
            </p>
            <div className="flex items-center gap-4 pt-2">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/10 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                <Zap size={10} className="text-gold" /> {advice?.title}
              </div>
              <Link href="/admin/stats" className="text-[10px] font-bold text-gold/60 hover:text-gold uppercase tracking-widest transition-colors flex items-center gap-1">
                Daha çox analiz <Sparkles size={10} />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
