'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { motion, AnimatePresence } from 'framer-motion';

const languages = [
  { code: 'az', label: 'AZ', name: 'Azərbaycanca' },
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'ru', label: 'RU', name: 'Русский' },
] as const;

const LANG_SWITCH_TEXT: Record<string, string> = {
  az: 'DİL DƏYİŞDİRİLİR',
  en: 'SWITCHING LANGUAGE',
  ru: 'СМЕНА ЯЗЫКА',
};

function OrbitingGlobeOverlay({ visible, text }: { visible: boolean; text: string }) {
  if (typeof document === 'undefined') return null;
  const chars = text.split('');
  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          key="orbit-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(4,4,4,0.8)',
            backdropFilter: 'blur(6px)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          {/* Radial glow */}
          <div style={{
            position: 'absolute',
            width: 220, height: 220,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(212,175,55,0.08) 0%, transparent 70%)',
            filter: 'blur(18px)',
            pointerEvents: 'none',
          }} />

          {/* Globe + rings */}
          <div style={{ position: 'relative', width: 100, height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>

            {/* Ring 1 — outer CW, slightly tilted via scaleY */}
            <div style={{
              position: 'absolute', inset: -4,
              borderRadius: '50%',
              border: '1px solid rgba(212,175,55,0.12)',
              borderTopColor: 'rgba(212,175,55,0.85)',
              borderBottomColor: 'rgba(212,175,55,0.08)',
              animation: 'orbitCW 2.2s linear infinite',
              transform: 'scaleY(0.35)',
              boxShadow: '0 0 8px rgba(212,175,55,0.2)',
            }} />

            {/* Ring 2 — middle CCW, tilted other axis */}
            <div style={{
              position: 'absolute', inset: 4,
              borderRadius: '50%',
              border: '1px solid rgba(212,175,55,0.08)',
              borderLeftColor: 'rgba(212,175,55,0.75)',
              borderRightColor: 'rgba(212,175,55,0.06)',
              animation: 'orbitCCW 1.6s linear infinite',
              transform: 'rotate(60deg) scaleY(0.4)',
              boxShadow: '0 0 6px rgba(212,175,55,0.15)',
            }} />

            {/* Ring 3 — inner CW, equatorial */}
            <div style={{
              position: 'absolute', inset: 14,
              borderRadius: '50%',
              border: '1px solid rgba(212,175,55,0.06)',
              borderTopColor: 'rgba(212,175,55,0.5)',
              animation: 'orbitCW 1s linear infinite',
              transform: 'rotate(-30deg) scaleY(0.3)',
            }} />

            {/* Globe SVG — animated meridians */}
            <motion.svg
              width="48" height="48" viewBox="0 0 24 24"
              fill="none" strokeLinecap="round" strokeLinejoin="round"
              animate={{ rotateY: [0, 360] }}
              transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
              style={{ filter: 'drop-shadow(0 0 6px rgba(212,175,55,0.5))' }}
            >
              <circle cx="12" cy="12" r="10" stroke="rgba(212,175,55,0.5)" strokeWidth="1"/>
              <path d="M2 12h20" stroke="rgba(212,175,55,0.35)" strokeWidth="0.8"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="rgba(212,175,55,0.7)" strokeWidth="1"/>
              <path d="M2 7h20M2 17h20" stroke="rgba(212,175,55,0.2)" strokeWidth="0.6"/>
            </motion.svg>

            {/* Glowing center dot */}
            <motion.div
              animate={{ opacity: [0.4, 1, 0.4], scale: [0.8, 1.2, 0.8] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                position: 'absolute',
                width: 6, height: 6, borderRadius: '50%',
                background: 'rgba(212,175,55,0.9)',
                boxShadow: '0 0 12px 4px rgba(212,175,55,0.5)',
              }}
            />
          </div>

          {/* Wave text */}
          <div style={{ display: 'flex', gap: 3 }}>
            {chars.map((ch, i) => (
              <motion.span
                key={i}
                animate={{ opacity: [0.15, 1, 0.15] }}
                transition={{
                  duration: 1.6,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: i * 0.07,
                }}
                style={{
                  fontSize: ch === ' ' ? 8 : 13,
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                  color: '#D4AF37',
                  width: ch === ' ' ? 6 : 'auto',
                  display: 'inline-block',
                  fontFamily: 'inherit',
                }}
              >
                {ch === ' ' ? '\u00A0' : ch}
              </motion.span>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  const [mounted, setMounted] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [targetLang, setTargetLang] = useState<string>('az');
  const [open, setOpen] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const handleSwitch = (code: typeof languages[number]['code']) => {
    if (code === language) return;
    setTargetLang(code);
    setSwitching(true);
    setLanguage(code);
    setOpen(false);
    setTimeout(() => setSwitching(false), 800);
  };

  const active = languages.find(l => l.code === language) ?? languages[0];
  const others = languages.filter(l => l.code !== language);

  if (!mounted) {
    return (
      <div className="fixed top-5 right-5 z-50">
        <div className="h-8 px-3 rounded-lg bg-black/70 border border-white/10 flex items-center">
          <span className="text-[11px] font-bold text-[#D4AF37] tracking-widest">AZ</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <OrbitingGlobeOverlay visible={switching} text={LANG_SWITCH_TEXT[targetLang] || LANG_SWITCH_TEXT.az} />

      <div className="fixed top-5 right-5 z-50" onMouseLeave={() => setOpen(false)}>
        <div className="relative flex flex-col items-end gap-1 min-w-[70px]">

          {/* Active pill */}
          <motion.button
            onMouseEnter={() => setOpen(true)}
            onClick={() => setOpen(v => !v)}
            whileTap={{ scale: 0.95 }}
            className="h-8 px-3 rounded-lg flex items-center gap-2 cursor-pointer select-none"
            style={{
              background: 'rgba(8,8,8,0.85)',
              border: '1px solid rgba(212,175,55,0.35)',
              boxShadow: '0 0 14px rgba(212,175,55,0.12), inset 0 1px 0 rgba(255,255,255,0.04)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <span className="text-[11px] font-black tracking-[0.18em] text-[#D4AF37]">{active.label}</span>
            <motion.span
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              style={{ display: 'flex', color: 'rgba(212,175,55,0.5)', marginTop: 1 }}
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M1 2.5L4 5.5L7 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </motion.span>
          </motion.button>

          {/* Dropdown items */}
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="flex flex-col gap-1"
              >
                {others.map((lang, i) => (
                  <motion.button
                    key={lang.code}
                    initial={{ opacity: 0, x: 6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.14, delay: i * 0.04 }}
                    onClick={() => handleSwitch(lang.code)}
                    whileTap={{ scale: 0.95 }}
                    className="h-8 px-3 rounded-lg flex items-center justify-center cursor-pointer select-none min-w-[70px] hover:translate-x-[-2px] transition-transform"
                    style={{
                      background: 'rgba(8,8,8,0.8)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      backdropFilter: 'blur(12px)',
                    }}
                  >
                    <span className="text-[11px] font-bold tracking-[0.18em] text-white/45 hover:text-white/75 transition-colors">{lang.label}</span>
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>
    </>
  );
}
