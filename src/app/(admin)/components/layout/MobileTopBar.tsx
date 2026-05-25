'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, ChevronDown } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export default function MobileTopBar({ role }: { role: 'admin' | 'superadmin' | null }) {
  const { t, language, setLanguage } = useLanguage();
  const { notifications, markAsRead, markAllAsRead, clearNotifications } = useNotifications();
  const mobileNotifications = notifications.filter((n) => n.type !== 'order');
  const [showDropdown, setShowDropdown] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const langBtnRef = useRef<HTMLButtonElement>(null);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (langRef.current?.contains(target) || langBtnRef.current?.contains(target)) return;
      setLangOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);


  const LANGS = [
    { code: 'az' as const, label: 'AZ' },
    { code: 'en' as const, label: 'EN' },
    { code: 'ru' as const, label: 'RU' },
  ];

  const langMenu = (
    <div
      ref={langRef}
      className="absolute right-0 top-full mt-2 z-50 flex w-[min(16rem,calc(100vw-3rem))] flex-col gap-2 rounded-3xl border border-white/10 bg-[#0c0c0c] p-3 shadow-[0_18px_70px_rgba(0,0,0,0.55)]"
      style={{
        opacity: langOpen ? 1 : 0,
        transform: langOpen ? 'translateY(0) scale(1)' : 'translateY(-6px) scale(0.98)',
        pointerEvents: langOpen ? 'auto' : 'none',
        transition: 'opacity 0.18s ease, transform 0.18s cubic-bezier(0.22,1,0.36,1)',
        willChange: 'transform, opacity',
      }}
    >
      {LANGS.filter((l) => l.code !== language).map((lang) => (
        <button
          key={lang.code}
          type="button"
          onClick={() => { setLanguage(lang.code); setLangOpen(false); }}
          className="w-full rounded-2xl bg-white/[0.04] px-3.5 py-3 text-left text-[11px] font-bold uppercase tracking-[0.24em] text-white/70"
        >
          {lang.label}
        </button>
      ))}
    </div>
  );

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/[0.06] bg-[#0a0a0a] px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden isolate">
      <div className="min-w-0 flex-1 pl-0.5">
        <p className="text-[9px] uppercase tracking-[0.22em] text-white/35 truncate max-w-[min(100%,14rem)]">
          {t('welcome')},{' '}
          <span className={role === 'superadmin' ? 'text-gold' : 'text-white/55'}>
            {role === 'superadmin' ? t('superadmin') : t('admin')}
          </span>
        </p>
        <Link href="/" className="text-base font-serif font-bold text-white truncate block">
          Saito Admin
        </Link>
      </div>

      <div className="relative flex items-center gap-2 shrink-0">
        <div className="relative">
          <motion.button
            ref={langBtnRef}
            type="button"
            onClick={() => setLangOpen((v) => !v)}
            className="h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-[10px] font-bold tracking-widest text-white/60 flex items-center gap-1"
            aria-expanded={langOpen}
            whileTap={{ scale: 0.96 }}
          >
            {LANGS.find((l) => l.code === language)?.label ?? 'AZ'}
            <ChevronDown size={10} className={`transition-transform duration-150 ${langOpen ? 'rotate-180' : ''}`} />
          </motion.button>
          {langMenu}
        </div>

        <div className="relative">
          <motion.button
            type="button"
            onClick={() => {
              const opening = !showDropdown;
              setShowDropdown(opening);
              if (opening) markAllAsRead();
            }}
            className="relative p-2.5 rounded-lg bg-white/5 border border-white/10"
            aria-label={t('notifications')}
            whileTap={{ scale: 0.96 }}
          >
            <Bell size={18} className="text-white/60" />
            {mobileNotifications.some((n) => !n.isRead) && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-black" />
            )}
          </motion.button>

          <>
            {/* Notification backdrop — CSS only */}
            <div
              className="fixed inset-0 z-40 bg-black/40"
              onClick={() => setShowDropdown(false)}
              style={{ opacity: showDropdown ? 1 : 0, pointerEvents: showDropdown ? 'auto' : 'none', transition: 'opacity 0.18s ease' }}
            />
            <div
              className="absolute right-0 mt-2 w-[min(18rem,calc(100vw-1.5rem))] max-h-80 overflow-y-auto rounded-xl border border-white/10 bg-[#0a0a0a] shadow-2xl z-50"
              style={{
                opacity: showDropdown ? 1 : 0,
                transform: showDropdown ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
                pointerEvents: showDropdown ? 'auto' : 'none',
                transition: 'opacity 0.2s ease, transform 0.22s cubic-bezier(0.22,1,0.36,1)',
                willChange: 'transform, opacity',
              }}
            >
                  <div className="p-3 border-b border-white/5 flex justify-between items-center">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/45">
                      {t('notifications')}
                    </span>
                    {mobileNotifications.length > 0 && (
                      <button
                        type="button"
                        onClick={clearNotifications}
                        className="text-[10px] text-white/40 uppercase"
                      >
                        {t('clear_all')}
                      </button>
                    )}
                  </div>
                  {mobileNotifications.length === 0 ? (
                    <p className="p-6 text-center text-sm text-white/35 italic">{t('no_notifications')}</p>
                  ) : (
                    mobileNotifications.map((n) => (
                      <motion.button
                        key={n.id}
                        type="button"
                        onClick={() => markAsRead(n.id)}
                        className={`w-full text-left p-3 border-b border-white/5 ${!n.isRead ? 'bg-gold/5' : ''}`}
                        whileTap={{ scale: 0.98 }}
                      >
                        <p className="text-xs text-white font-medium">{n.title}</p>
                        <p className="text-[11px] text-white/40 line-clamp-2">{n.body}</p>
                      </motion.button>
                    ))
                  )}
            </div>
          </>
        </div>
      </div>

    </header>
  );
}
