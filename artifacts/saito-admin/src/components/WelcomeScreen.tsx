'use client';

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, UserCog, ChefHat, ArrowRight, BarChart2, ShoppingBag, CalendarDays, Megaphone, Utensils } from 'lucide-react';

interface WelcomeScreenProps {
  role: 'superadmin' | 'admin' | 'kitchen';
  onDismiss: () => void;
}

const ROLE_CONTENT = {
  superadmin: {
    accent: '#D4AF37',
    glow: 'rgba(212,175,55,0.22)',
    badgeBg: 'rgba(212,175,55,0.12)',
    badgeBorder: 'rgba(212,175,55,0.35)',
    badgeText: '#D4AF37',
    badge: 'SUPERADMIN',
    Icon: ShieldCheck,
    greeting: 'Xoş Gəldiniz',
    subtitle: 'Saito Restoran İdarəetmə Sistemi',
    desc: 'Sisteminizin tam nəzarəti sizdədir. Sifarişlər, rezervasiyalar, analitika, kampaniyalar və komanda idarəsini buradan həyata keçirə bilərsiniz.',
    features: [
      { Icon: BarChart2,    text: 'AI analitika & satış statistikası' },
      { Icon: ShoppingBag,  text: 'Sifarişlər, ödənişlər, masa idarəsi' },
      { Icon: CalendarDays, text: 'Rezervasiya planlaması' },
      { Icon: Megaphone,    text: 'Kampaniya & promosyonlar' },
      { Icon: UserCog,      text: 'Komanda & hesab idarəsi' },
    ],
    cta: 'Panelə Daxil Ol',
  },
  admin: {
    accent: '#60a5fa',
    glow: 'rgba(96,165,250,0.18)',
    badgeBg: 'rgba(96,165,250,0.10)',
    badgeBorder: 'rgba(96,165,250,0.30)',
    badgeText: '#60a5fa',
    badge: 'ADMIN',
    Icon: UserCog,
    greeting: 'Xoş Gəldiniz',
    subtitle: 'Saito Restoran İdarəetmə Sistemi',
    desc: 'Gündəlik restoran əməliyyatlarınızı bu panel vasitəsilə rahat şəkildə idarə edə bilərsiniz.',
    features: [
      { Icon: ShoppingBag,  text: 'Sifarişlər & masa statusları' },
      { Icon: CalendarDays, text: 'Rezervasiya sistemi' },
      { Icon: BarChart2,    text: 'Gündəlik satış görünüşü' },
      { Icon: Megaphone,    text: 'Kampaniya idarəsi' },
    ],
    cta: 'Panelə Daxil Ol',
  },
  kitchen: {
    accent: '#34d399',
    glow: 'rgba(52,211,153,0.18)',
    badgeBg: 'rgba(52,211,153,0.10)',
    badgeBorder: 'rgba(52,211,153,0.30)',
    badgeText: '#34d399',
    badge: 'MƏTBƏX',
    Icon: ChefHat,
    greeting: 'Xoş Gəldiniz',
    subtitle: 'Saito Mətbəx Paneli',
    desc: 'Daxil olan sifarişləri real vaxtda izləyin və hazırlıq statusunu yeniləyin.',
    features: [
      { Icon: Utensils,     text: 'Real vaxt sifariş bildirişləri' },
      { Icon: ShoppingBag,  text: 'Hazırlıq statusu idarəsi' },
      { Icon: CalendarDays, text: 'Aktiv & hazır sifarişlər' },
    ],
    cta: 'Mətbəxə Keç',
  },
};

function getWelcomeKey(role: string) { return `saito_welcomed_${role}`; }

export function WelcomeScreen({ role, onDismiss }: WelcomeScreenProps) {
  const [visible, setVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const key = getWelcomeKey(role);
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, '1');
      setVisible(true);
    } else {
      onDismiss();
    }
  }, [role, onDismiss]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    setTilt({
      x: ((e.clientY - cy) / rect.height) * 8,
      y: -((e.clientX - cx) / rect.width) * 8,
    });
  };

  const dismiss = () => { setVisible(false); setTimeout(onDismiss, 400); };
  const c = ROLE_CONTENT[role];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="fixed inset-0 z-[500] flex items-center justify-center p-6"
          style={{ backdropFilter: 'blur(18px)', background: 'rgba(0,0,0,0.72)' }}
          onClick={dismiss}
        >
          {/* Ambient glow behind card */}
          <div className="pointer-events-none absolute rounded-full"
            style={{ width: 520, height: 320, background: `radial-gradient(ellipse, ${c.glow} 0%, transparent 70%)`, filter: 'blur(60px)' }} />

          {/* Card */}
          <motion.div
            ref={cardRef}
            onClick={e => e.stopPropagation()}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setTilt({ x: 0, y: 0 })}
            initial={{ opacity: 0, y: 32, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotateX: tilt.x, rotateY: tilt.y }}
            exit={{ opacity: 0, y: -20, scale: 0.94 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            style={{
              transformStyle: 'preserve-3d',
              perspective: 1000,
              width: '100%',
              maxWidth: 460,
              borderRadius: 28,
              border: `1px solid rgba(255,255,255,0.08)`,
              background: 'linear-gradient(155deg, rgba(255,255,255,0.05) 0%, rgba(10,10,10,0.95) 100%)',
              boxShadow: `0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.06)`,
              overflow: 'hidden',
            }}
          >
            {/* Top shimmer line */}
            <div style={{ height: 2, background: `linear-gradient(90deg, transparent 0%, ${c.accent} 50%, transparent 100%)` }} />

            <div style={{ padding: '36px 36px 32px' }}>

              {/* Icon orb + badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
                <motion.div
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 0.15, type: 'spring', stiffness: 260, damping: 20 }}
                  style={{
                    width: 64, height: 64, borderRadius: 20, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `radial-gradient(135deg, ${c.glow} 0%, rgba(255,255,255,0.03) 100%)`,
                    border: `1px solid ${c.badgeBorder}`,
                    boxShadow: `0 8px 32px ${c.glow}`,
                  }}
                >
                  <c.Icon size={28} color={c.accent} />
                </motion.div>

                <div>
                  <span style={{
                    display: 'inline-block', padding: '3px 10px', borderRadius: 8,
                    background: c.badgeBg, border: `1px solid ${c.badgeBorder}`,
                    color: c.accent, fontSize: 10, fontWeight: 800, letterSpacing: '0.18em',
                  }}>
                    {c.badge}
                  </span>
                </div>
              </div>

              {/* Greeting */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.22 }}
                style={{ marginBottom: 16 }}
              >
                <h1 style={{
                  fontFamily: 'Georgia, "Times New Roman", serif',
                  fontSize: 38, fontWeight: 700, lineHeight: 1.1,
                  color: '#fff', margin: 0, letterSpacing: '-0.01em',
                }}>
                  {c.greeting}
                </h1>
                <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 8, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                  {c.subtitle}
                </p>
              </motion.div>

              {/* Divider */}
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 18 }} />

              {/* Desc */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13.5, lineHeight: 1.7, marginBottom: 22 }}
              >
                {c.desc}
              </motion.p>

              {/* Features */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
                {c.features.map((f, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.35 + i * 0.07 }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12 }}
                  >
                    <span style={{
                      width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: c.badgeBg, border: `1px solid ${c.badgeBorder}`,
                    }}>
                      <f.Icon size={13} color={c.accent} />
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>{f.text}</span>
                  </motion.div>
                ))}
              </div>

              {/* CTA */}
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={dismiss}
                style={{
                  width: '100%', padding: '14px 24px', borderRadius: 16, border: 'none', cursor: 'pointer',
                  background: `linear-gradient(135deg, ${c.accent}, ${c.accent}cc)`,
                  color: role === 'admin' ? '#fff' : '#000',
                  fontWeight: 800, fontSize: 13, letterSpacing: '0.1em',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: `0 8px 24px ${c.glow}`,
                }}
              >
                {c.cta} <ArrowRight size={15} />
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
