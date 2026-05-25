'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Bell, ChevronDown } from 'lucide-react';
import { NotificationProvider, useNotifications } from '../context/NotificationContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';

const AdminHeaderInner = ({
  role,
  onToggleSidebar,
}: {
  role: 'admin' | 'superadmin' | null;
  onToggleSidebar: () => void;
}) => {
  const { pendingCount, notifications, markAsRead, markAllAsRead, clearNotifications } = useNotifications();
  const { t, language, setLanguage } = useLanguage();
  const { isHighContrast } = useTheme();
  const [showDropdown, setShowDropdown] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const langBtnRef = useRef<HTMLButtonElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);
  const [langMenuPos, setLangMenuPos] = useState({ top: 0, right: 0, left: -1 });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (langMenuRef.current?.contains(target) || langBtnRef.current?.contains(target)) return;
      setLangOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!langOpen || !langBtnRef.current) return;
    const update = () => {
      if (!langBtnRef.current) return;
      const rect = langBtnRef.current.getBoundingClientRect();
      const dropdownHeight = 44 * 2 + 24; // approx 2 buttons + padding
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow >= dropdownHeight
        ? rect.bottom + 6
        : rect.top - dropdownHeight - 6;
      const right = Math.max(8, window.innerWidth - rect.right);
      setLangMenuPos({ top, right, left: -1 });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [langOpen]);

  const LANGS = [
    { code: 'az' as const, label: 'AZ' },
    { code: 'en' as const, label: 'EN' },
    { code: 'ru' as const, label: 'RU' },
  ];
  const activeLang = LANGS.find(l => l.code === language) ?? LANGS[0];
  const otherLangs = LANGS.filter(l => l.code !== language);

  const handleLangChange = (code: 'az' | 'en' | 'ru') => {
    if (code === language) return;
    setLanguage(code);
    setLangOpen(false);
  };

  return (
    <header className="mb-8 flex items-start sm:items-center justify-between gap-3 sm:gap-4 relative">
      <div className="flex items-start sm:items-center gap-3">
        <div>
          <h1 className="text-[10px] sm:text-sm tracking-[0.3em] uppercase font-medium italic text-white/40">
            {t('welcome')},{' '}
            <span className={role === 'superadmin' ? 'text-gold' : 'text-white/60'}>
              {role === 'superadmin' ? t('superadmin') : t('admin')}
            </span>
          </h1>
          <Link href="/" className="text-lg sm:text-2xl font-serif font-bold mt-1 sm:mt-2 inline-block text-foreground">
            Saito Admin
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-4 md:gap-6 lg:gap-7">
        {/* Language switcher */}
        <div className="relative z-50">
          <button
            ref={langBtnRef}
            type="button"
            onClick={() => setLangOpen((v) => !v)}
            className="h-10 px-4 rounded-xl flex items-center gap-2 bg-white/5 border border-white/10 transition-colors select-none active:scale-[0.98]"
          >
            <span className="text-[11px] font-black tracking-[0.18em] text-white/60">{activeLang.label}</span>
            <ChevronDown size={11} className={`text-white/30 transition-transform duration-150 ${langOpen ? 'rotate-180' : ''}`} />
          </button>

          {mounted && langOpen
            ? createPortal(
                <div
                  ref={langMenuRef}
                  className="fixed z-[200] flex flex-col gap-1.5 min-w-[90px] rounded-xl border border-white/10 bg-[#0c0c0c] p-1.5 shadow-xl"
                  style={{ top: langMenuPos.top, right: langMenuPos.right, minWidth: 90 }}
                >
                  {otherLangs.map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => handleLangChange(lang.code)}
                      className="h-8 px-5 rounded-lg flex items-center justify-center bg-white/[0.04] border border-white/[0.08] w-full text-[10px] font-bold tracking-[0.18em] text-white/50 hover:text-gold hover:bg-white/[0.07] transition-colors"
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>,
                document.body
              )
            : null}
        </div>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => { const opening = !showDropdown; setShowDropdown(opening); if (opening) markAllAsRead(); }}
            className="relative group cursor-pointer p-3 hover:bg-white/5 rounded-xl transition-colors"
          >
            <Bell size={20} className={`${showDropdown ? 'text-gold' : 'text-white/60'} transition-colors`} />
            {notifications.length > 0 && notifications.some(n => !n.isRead) && (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-black animate-pulse" />
            )}
          </button>

          {showDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
                <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] sm:w-80 bg-[#0a0a0a] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/5">
                    <span className="text-xs font-bold uppercase tracking-widest text-white/50">{t('notifications')}</span>
                    {notifications.length > 0 && (
                      <button
                        onClick={clearNotifications}
                        className="text-[10px] text-white/40 hover:text-red-500 transition-colors uppercase tracking-tighter"
                      >
                        {t('clear_all')}
                      </button>
                    )}
                  </div>

                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-10 text-center">
                        <Bell size={32} className="mx-auto mb-3 text-white/10" />
                        <p className="text-sm text-white/40 italic">{t('no_notifications')}</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-white/5">
                        {notifications.map((n) => (
                          <div
                            key={n.id}
                            onClick={() => markAsRead(n.id)}
                            className={`p-4 hover:bg-white/5 transition-colors cursor-pointer relative ${!n.isRead ? 'bg-gold/5' : ''}`}
                          >
                            {!n.isRead && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gold" />}
                            <div className="flex justify-between items-start mb-1">
                              <span className={`text-[10px] font-bold uppercase tracking-tighter ${n.type === 'reservation' ? 'text-blue-400' : 'text-green-400'}`}>
                                {n.type === 'reservation' ? t('reservations') : t('orders')}
                              </span>
                              <span className="text-[10px] text-white/20">
                                {new Date(n.time).toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-sm text-white font-medium mb-1">{n.title}</p>
                            <p className="text-xs text-white/40 line-clamp-2">{n.body}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {notifications.length > 0 && (
                    <Link
                      href="/reservations"
                      onClick={() => setShowDropdown(false)}
                      className="block p-3 text-center bg-white/5 text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 hover:text-white transition-colors"
                    >
                      {t('view_all')} {t('reservations').toLowerCase()}
                    </Link>
                  )}
                </div>
              </>
            )}
        </div>
      </div>
    </header>
  );
};

export const AdminHeader = React.memo(AdminHeaderInner);
