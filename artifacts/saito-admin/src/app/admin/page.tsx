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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className={`relative overflow-hidden rounded-[40px] border p-8 shadow-2xl transition-all duration-700 ${
        isCritical 
          ? 'bg-rose-500/10 border-rose-500/30 shadow-rose-500/10' 
          : 'bg-[#1c1c1e] border-white/[0.06] shadow-black/50'
      }`}
    >
      <div className="absolute top-0 right-0 p-8 opacity-[0.05]">
        <BrainCircuit size={120} className={isCritical ? 'text-rose-500' : 'text-gold'} />
      </div>

      {isCritical && (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(239,68,68,0.1),transparent_70%)] animate-pulse" />
      )}
      
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-5">
          <div className={`w-14 h-14 rounded-[20px] flex items-center justify-center border transition-all duration-500 ${
            isCritical ? 'bg-rose-500/20 border-rose-500/30' : 'bg-gold/10 border-gold/20'
          }`}>
            {isCritical ? <AlertTriangle className="text-rose-500" size={28} /> : <Lightbulb className="text-gold" size={28} />}
          </div>
          <div>
            <h3 className={`text-xl font-black tracking-tight transition-colors duration-500 ${isCritical ? 'text-rose-400' : 'text-white'}`}>
              {advice?.title}
            </h3>
            <p className={`text-[10px] font-bold uppercase tracking-[0.4em] transition-colors duration-500 ${isCritical ? 'text-rose-500/60' : 'text-gold/60'}`}>
              {isCritical ? 'TƏCİLİ STRATEGİYA' : 'AI STRATEGİYA ANALİZİ'}
            </p>
          </div>
        </div>
        
        {/* Deep Scan Button on Dashboard too */}
        <Link href="/admin/stats" className="px-5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-[10px] font-black uppercase tracking-widest text-white/40 hover:bg-white/5 hover:text-white transition-all flex items-center gap-2 group">
           DEEP SCAN <Sparkles size={12} className="group-hover:text-gold transition-colors" />
        </Link>
      </div>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            <div className="h-4 w-3/4 bg-white/5 rounded-full animate-pulse" />
            <div className="h-4 w-1/2 bg-white/5 rounded-full animate-pulse" />
          </motion.div>
        ) : (
          <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <p className={`text-lg leading-relaxed font-bold tracking-tight ${isCritical ? 'text-white' : 'text-white/80'}`}>
              "{advice?.text}"
            </p>
            <div className="flex items-center gap-6 pt-2">
              <div className={`flex items-center gap-2 px-4 py-2 rounded-full border text-[11px] font-black uppercase tracking-widest ${
                isCritical ? 'bg-rose-500 text-white border-rose-400' : 'bg-white/[0.04] border-white/10 text-white/40'
              }`}>
                <Zap size={12} className={isCritical ? 'text-white' : 'text-gold'} /> {isCritical ? 'İMKANLARI ARAŞDIR' : advice?.title}
              </div>
              <Link href="/admin/stats" className={`text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                isCritical ? 'text-rose-400 hover:text-rose-300' : 'text-gold/60 hover:text-gold'
              }`}>
                DƏRİN ANALİZ <Sparkles size={12} />
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
