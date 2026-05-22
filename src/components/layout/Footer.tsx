'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Share2, Phone, MapPin, Clock } from 'lucide-react';
import Link from 'next/link';

const Footer = () => {
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase.from('settings').select('*').single();
      if (data) setSettings(data);
    };
    fetchSettings();
  }, []);

  if (!settings) return null;

  return (
    <footer className="relative bg-black pt-24 pb-12 border-t border-white/5 overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full pointer-events-none opacity-[0.02]">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_0%,#D4AF37_0%,transparent_70%)]" />
      </div>

      <div className="container mx-auto px-6 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-16 mb-20">
          {/* Brand */}
          <div className="space-y-8">
            <Link href="/" className="text-3xl font-serif font-bold text-gold tracking-widest block">
              SAITO
            </Link>
            <p className="text-white/40 text-sm leading-relaxed max-w-xs italic">
              {settings.footer_text || 'Ənənəvi yapon mətbəxinin müasir toxunuşlarla birləşdiyi məkan. Hər bir sushi bir sənət əsəridir.'}
            </p>
            <div className="flex gap-4">
              {settings.instagram_url && (
                <a href={settings.instagram_url} target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-white/5 border border-white/10 flex items-center justify-center text-white/40 transition-all">
                  <Share2 size={18} />
                </a>
              )}
            </div>
          </div>

          {/* Contact */}
          <div className="space-y-8">
            <h4 className="text-[10px] uppercase tracking-[0.4em] font-bold text-white/40">Əlaqə</h4>
            <div className="space-y-6">
              <a href={`tel:${settings.phone}`} className="flex items-center gap-4 group">
                <div className="w-8 h-8 bg-gold/5 flex items-center justify-center text-gold border border-gold/10 transition-all">
                  <Phone size={14} />
                </div>
                <span className="text-sm text-white/60 group-hover:text-white transition-colors">{settings.phone}</span>
              </a>
              <div className="flex items-center gap-4 group">
                <div className="w-8 h-8 bg-gold/5 flex items-center justify-center text-gold border border-gold/10">
                  <MapPin size={14} />
                </div>
                <span className="text-sm text-white/60">{settings.address}</span>
              </div>
            </div>
          </div>

          {/* Hours */}
          <div className="space-y-8">
            <h4 className="text-[10px] uppercase tracking-[0.4em] font-bold text-white/40">İş Saatları</h4>
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-gold/5 flex items-center justify-center text-gold border border-gold/10">
                <Clock size={14} />
              </div>
              <div>
                <p className="text-sm text-white/60 mb-1">Hər gün</p>
                <p className="text-lg font-serif text-gold font-bold">{settings.opening_hours}</p>
                {!settings.is_open && (
                  <span className="inline-block mt-2 px-3 py-1 bg-red-500/10 text-red-500 text-[10px] font-bold uppercase tracking-widest border border-red-500/20">
                    Müvəqqəti Bağlıdır
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="pt-12 border-t border-white/5 flex flex-col md:flex-row justify-center items-center gap-6 text-center">
          <p className="text-white/20 text-[10px] uppercase tracking-[0.3em]">
            &copy; 2026 SAITO SUSHI. Bütün hüquqlar qorunur.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
