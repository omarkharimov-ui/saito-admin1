'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Bell, ChevronDown } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLayout } from '../context/LayoutContext';

const AdminHeaderInner = ({
  role,
  onToggleSidebar,
}: {
  role: 'admin' | 'superadmin' | null;
  onToggleSidebar: () => void;
}) => {
  const { notifications, markAsRead, markAllAsRead, clearNotifications } = useNotifications();
  const { t, language, setLanguage } = useLanguage();
  const { lightMode } = useTheme();
  const { isModalOpen } = useLayout();
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
    <header className={`flex items-start sm:items-center justify-between gap-3 sm:gap-4 relative ${isModalOpen ? 'h-0 overflow-hidden mb-0 opacity-0' : 'mb-8'}`}>
      <div className="flex-1" />

      <div className={`flex items-center gap-3 sm:gap-4 md:gap-6 lg:gap-7 transition-opacity duration-100 ${isModalOpen ? 'opacity-0 pointer-events-none' : ''}`}>
        {/* Language switcher */}
        <div className="relative z-50">
          <button
            ref={langBtnRef}
            type="button"
            onClick={() => setLangOpen((v) => !v)}
            className="h-10 px-4 rounded-[12px] flex items-center gap-2 transition-all select-none active:scale-[0.98] focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-[0_0_0_4px_rgba(0,0,0,0.08)] bg-[var(--theme-surface)] border border-[var(--theme-border)] shadow-[0_6px_18px_rgba(0,0,0,0.04)]"
          >
            <span className="text-[11px] font-black tracking-[0.18em] text-[var(--theme-text-secondary)]">{activeLang.label}</span>
            <ChevronDown size={11} className={`transition-transform duration-150 ${langOpen ? 'rotate-180' : ''} text-[var(--theme-text-muted)]`} />
          </button>

          {mounted && langOpen
            ? createPortal(
                <div
                  ref={langMenuRef}
                  className="fixed z-[200] flex flex-col gap-1.5 min-w-[90px] rounded-[14px] border p-2 shadow-[0_18px_44px_rgba(0,0,0,0.12)] border-[var(--theme-border)] bg-[var(--theme-panel)] backdrop-blur-2xl"
                  style={{ top: langMenuPos.top, right: langMenuPos.right, minWidth: 90 }}
                >
                  {otherLangs.map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => handleLangChange(lang.code)}
                      className="h-8 px-5 rounded-[12px] flex items-center justify-center w-full text-[10px] font-bold tracking-[0.18em] transition-colors bg-[var(--theme-surface)] border border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)]"
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
            className="relative group cursor-pointer p-3 rounded-[12px] transition-colors focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-[0_0_0_4px_rgba(0,0,0,0.08)] hover:bg-[var(--theme-surface-soft)] border border-transparent hover:border-[var(--theme-border)]"
          >
            <Bell size={20} className={`transition-colors ${showDropdown ? 'text-[var(--theme-text)]' : 'text-[var(--theme-text-secondary)]'}`} />
            {notifications.length > 0 && notifications.some(n => !n.isRead) && (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[var(--theme-panel)]" style={{ animation: 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
            )}
          </button>

          {showDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
                <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] sm:w-80 rounded-[20px] shadow-[0_20px_50px_rgba(0,0,0,0.14)] z-50 overflow-hidden bg-[var(--theme-panel)] border border-[var(--theme-border)] backdrop-blur-2xl">
                  <div className="p-4 border-b flex items-center justify-between border-[var(--theme-border)] bg-[var(--theme-surface)]">
                    <span className="text-xs font-bold uppercase tracking-widest text-[var(--theme-text-secondary)]">{t('notifications')}</span>
                    {notifications.length > 0 && (
                      <button
                        onClick={clearNotifications}
                        className="text-[10px] uppercase tracking-tighter transition-colors text-[var(--theme-text-secondary)] hover:text-red-500"
                      >
                        {t('clear_all')}
                      </button>
                    )}
                  </div>

                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-10 text-center">
                        <Bell size={32} className="mx-auto mb-3 text-[var(--theme-text-muted)]" />
                        <p className="text-sm italic text-[var(--theme-text-muted)]">{t('no_notifications')}</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-[var(--theme-border)]">
                        {notifications.map((n) => (
                          <div
                            key={n.id}
                            onClick={() => markAsRead(n.id)}
                            className={`p-4 transition-colors cursor-pointer relative hover:bg-[var(--theme-surface-soft)] ${!n.isRead ? 'bg-[var(--theme-accent-soft)]' : ''}`}
                          >
                            {!n.isRead && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[var(--theme-accent)]" />}
                            <div className="flex justify-between items-start mb-1">
                              <span className="text-[10px] font-bold uppercase tracking-tighter text-[var(--theme-text-secondary)]">
                                {n.type === 'reservation' ? t('reservations') : t('orders')}
                              </span>
                              <span className="text-[10px] text-[var(--theme-text-muted)]">
                                {new Date(n.time).toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-sm font-medium mb-1 text-[var(--theme-text)]">{n.title}</p>
                            <p className="text-xs line-clamp-2 text-[var(--theme-text-secondary)]">{n.body}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {notifications.length > 0 && (
                    <Link
                      href="/admin/reservations"
                      onClick={() => setShowDropdown(false)}
                      className="block p-3 text-center text-[10px] font-bold uppercase tracking-[0.2em] transition-colors bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]"
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
