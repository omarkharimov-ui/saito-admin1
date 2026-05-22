'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useUI } from '@/context/UIContext';
import { useLanguage } from '@/context/LanguageContext';
import { Menu as MenuIcon, Globe, ShoppingBag } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { NotificationButton } from '@/components/NotificationButton';

const Navbar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const [isScrolled, setIsScrolled] = useState(false);
  const { language, setLanguage, t } = useLanguage();
  const [showLangMenu, setShowLangMenu] = useState(false);
  const { tableNumber } = useUI();
  const { totalCount, setIsCartOpen } = useCart();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleMenuClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (pathname !== '/') {
      router.push('/#menu');
    } else {
      const menuSection = document.getElementById('menu');
      if (menuSection) {
        menuSection.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  return (
    <motion.nav 
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-6 transition-all duration-500 ${
        isScrolled ? 'backdrop-blur-xl bg-black/60 py-4' : 'bg-transparent'
      }`}
    >
      <div className="flex items-center gap-2">
        <Link href="/" className="text-2xl font-serif font-bold text-gold tracking-widest">
          SAITO
        </Link>
      </div>

      <div className="hidden md:flex items-center gap-10">
        <a 
          href="#menu" 
          onClick={handleMenuClick}
          className="text-sm font-medium hover:text-gold transition-colors duration-300 uppercase tracking-widest"
        >
          {t('nav.menu')}
        </a>
        <Link 
          href="/about" 
          prefetch={true}
          className="text-sm font-medium hover:text-gold transition-colors duration-300 uppercase tracking-widest"
        >
          {t('nav.about')}
        </Link>
        <Link 
          href="/reservation" 
          prefetch={true}
          className="px-8 py-3 bg-gold text-black text-xs font-bold tracking-[0.2em] uppercase hover:bg-gold-hover transition-all duration-300"
        >
          {t('nav.reservation')}
        </Link>

        {/* Cart Button — only visible when QR table is active */}
        {tableNumber && totalCount > 0 && (
          <button
            onClick={() => setIsCartOpen(true)}
            className="relative flex items-center gap-2 text-white/60 hover:text-gold transition-colors"
          >
            <ShoppingBag size={20} />
            <span className="absolute -top-2 -right-2 w-4 h-4 bg-gold text-black text-[10px] font-black rounded-full flex items-center justify-center">
              {totalCount}
            </span>
          </button>
        )}

        {/* Push Notification */}
        <NotificationButton />

        {/* Language Switcher */}
        <div className="relative">
          <button 
            onClick={() => setShowLangMenu(!showLangMenu)}
            className="flex items-center gap-2 text-xs font-bold tracking-widest hover:text-gold transition-colors"
          >
            <Globe size={14} className="text-gold" />
            {language}
          </button>
          
          <AnimatePresence>
            {showLangMenu && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute top-full right-0 mt-4 bg-black/90 backdrop-blur-xl border border-gold/20 p-2 min-w-[80px] shadow-2xl"
              >
                {['AZ', 'EN', 'RU'].map((lang) => (
                  <button
                    key={lang}
                    onClick={() => {
                      setLanguage(lang as any);
                      setShowLangMenu(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-[10px] font-bold tracking-[0.2em] transition-colors ${
                      language === lang ? 'text-gold' : 'text-white/40 hover:text-white'
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Mobile Menu Icon */}
      <div className="md:hidden flex items-center gap-4 text-gold">
        <div className="relative">
          <button 
            onClick={() => setShowLangMenu(!showLangMenu)}
            className="flex items-center gap-1 text-[10px] font-bold"
          >
            {language}
          </button>
          <AnimatePresence>
            {showLangMenu && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute top-full right-0 mt-2 bg-black/90 backdrop-blur-xl border border-gold/20 p-2 min-w-[60px] shadow-2xl"
              >
                {['AZ', 'EN', 'RU'].map((lang) => (
                  <button
                    key={lang}
                    onClick={() => {
                      setLanguage(lang as any);
                      setShowLangMenu(false);
                    }}
                    className={`w-full text-left px-2 py-2 text-[10px] font-bold ${
                      language === lang ? 'text-gold' : 'text-white/40'
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <MenuIcon size={24} />
      </div>
    </motion.nav>
  );
};

export default Navbar;
