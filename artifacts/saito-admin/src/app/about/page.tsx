export const dynamic = 'force-dynamic';

'use client';

import React from 'react';
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { motion } from "framer-motion";
import { Sparkles, Heart, Award, Users } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export default function AboutPage() {
  const { t } = useLanguage();

  return (
    <main className="relative min-h-screen bg-black text-white selection:bg-gold selection:text-black overflow-x-hidden">
      <Navbar />
      
      <div className="pt-48 pb-32 px-4 md:px-20 max-w-7xl mx-auto relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
          className="text-center mb-32"
        >
          <span className="text-gold text-xs tracking-[0.5em] uppercase mb-6 block">{t('about.story')}</span>
          <h1 className="text-6xl md:text-8xl font-serif font-bold mb-10 tracking-tight">{t('about.title')}</h1>
          <p className="text-white/40 max-w-2xl mx-auto font-light leading-relaxed text-lg">
            {t('about.desc')}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-20 items-center mb-40">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 1 }}
            className="aspect-[4/5] relative overflow-hidden bg-card rounded-2xl"
          >
            <img 
              src="https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&q=80&w=1200" 
              alt="Sushi Chef"
              className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-1000"
            />
            <div className="absolute inset-0 bg-gold/10 mix-blend-overlay" />
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 1 }}
            className="space-y-10"
          >
            <h2 className="text-4xl font-serif font-bold">{t('about.passion')}</h2>
            <p className="text-white/50 leading-relaxed font-light">
              {t('about.desc')} {/* Using desc for now as a placeholder or I can add more specific translation keys */}
            </p>
            
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-3">
                <div className="w-12 h-12 bg-gold/5 flex items-center justify-center text-gold border border-gold/10">
                  <Award size={20} />
                </div>
                <h4 className="text-sm font-bold tracking-widest uppercase">Premium Keyfiyyət</h4>
                <p className="text-[10px] text-white/30 uppercase tracking-tighter">Yalnız ən təzə dəniz məhsulları</p>
              </div>
              <div className="space-y-3">
                <div className="w-12 h-12 bg-gold/5 flex items-center justify-center text-gold border border-gold/10">
                  <Heart size={20} />
                </div>
                <h4 className="text-sm font-bold tracking-widest uppercase">Sevgi ilə</h4>
                <p className="text-[10px] text-white/30 uppercase tracking-tighter">Hər sushi əllə hazırlanır</p>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {[
            { title: "Təzəlik", icon: Sparkles, desc: "Gündəlik tədarük olunan premium balıqlar." },
            { title: "Ustadlıq", icon: Users, desc: "Peşəkar şeflərimiz hər sushi-ni sənətə çevirir." },
            { title: "Estetika", icon: Award, desc: "Həm gözə, həm də damağa xitab edən təqdimat." }
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.2 }}
              className="p-10 bg-white/[0.02] border border-white/5 transition-all group"
            >
              <item.icon size={32} className="text-gold mb-8 group-hover:scale-110 transition-transform" />
              <h3 className="text-xl font-serif font-bold mb-4">{item.title}</h3>
              <p className="text-sm text-white/40 leading-relaxed">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
      
      <Footer />

      {/* Background grain/noise effect */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] z-[99] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
    </main>
  );
}
