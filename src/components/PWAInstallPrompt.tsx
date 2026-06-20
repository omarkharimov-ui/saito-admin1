'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Home, Smartphone } from 'lucide-react';
import { toast } from '@/lib/toast';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const PWA_PROMPT_DISMISSAL_KEY = 'pwa-prompt-dismissed-until';
const PWA_PROMPT_DISMISSAL_COOLDOWN_MS = 1000 * 60 * 60 * 24 * 7;

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if app is already installed
    const checkIfInstalled = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isInWebAppiOS = (window.navigator as any).standalone === true;
      const isInWebAppChrome = (window.matchMedia('(display-mode: standalone)').matches);
      
      if (isStandalone || isInWebAppiOS || isInWebAppChrome) {
        setIsInstalled(true);
        return true;
      }
      return false;
    };

    // Don't show if already installed
    if (checkIfInstalled()) {
      return;
    }

    const dismissedUntil = localStorage.getItem(PWA_PROMPT_DISMISSAL_KEY);
    if (dismissedUntil) {
      const dismissedUntilDate = Number(dismissedUntil);
      if (!Number.isNaN(dismissedUntilDate) && dismissedUntilDate > Date.now()) {
        return;
      }

      localStorage.removeItem(PWA_PROMPT_DISMISSAL_KEY);
    }

    // Listen for beforeinstallprompt event
    let showPromptTimeoutId: ReturnType<typeof window.setTimeout> | null = null;

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      // Show prompt after a short delay
      showPromptTimeoutId = window.setTimeout(() => {
        setShowPrompt(true);
      }, 3000);
    };

    // Listen for app installed event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowPrompt(false);
      localStorage.setItem('pwa-installed', 'true');
      toast.success('Uğurla! Tətbiq ana ekrana əlavə edildi!', {
        duration: 4000,
        icon: '🎉',
      });
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);

      if (showPromptTimeoutId) {
        window.clearTimeout(showPromptTimeoutId);
      }
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      // Fallback for browsers that don't support beforeinstallprompt
      toast('Tətbiqi əlavə etmək üçün brauzerinizin menyusundan "Ana ekrana əlavə et" seçin.', {
        icon: '📱',
        duration: 5000,
      });
      return;
    }

    try {
      console.log('Starting PWA installation...');
      
      // Show the install prompt
      await deferredPrompt.prompt();
      
      console.log('Install prompt shown, waiting for user choice...');
      
      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice;
      
      console.log('User choice:', outcome);
      
      if (outcome === 'accepted') {
        // User accepted the install prompt
        setIsInstalled(true);
        setShowPrompt(false);
        localStorage.setItem('pwa-installed', 'true');
        
        // Show success notification
        toast.success('Tətbiq uğurla ana ekrana əlavə edildi!', {
          duration: 4000,
          icon: '🎉',
        });
      } else {
        // User dismissed the install prompt
        console.log('User dismissed the install prompt');
        setShowPrompt(false);
      }
      
      // Clear the deferred prompt
      setDeferredPrompt(null);
    } catch (error) {
      console.error('PWA install error:', error);
      
      // More specific error handling
      if (error instanceof Error) {
        if (error.message.includes('User cancelled')) {
          toast('Quraşdırma ləğv edildi.', {
            icon: '📱',
            duration: 3000,
          });
        } else if (error.message.includes('not supported')) {
          toast('Bu cihaz PWA quraşdırmasını dəstəkləmir.', {
            icon: '⚠️',
            duration: 4000,
          });
        } else {
          toast.error('Xəta baş verdi: ' + error.message, {
            duration: 4000,
          });
        }
      } else {
        toast.error('Quraşdırma zamanı xəta baş verdi. Zəhmət olmasa yenidən cəhd edin.', {
          duration: 3000,
        });
      }
      
      // Hide prompt on error
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem(
      PWA_PROMPT_DISMISSAL_KEY,
      String(Date.now() + PWA_PROMPT_DISMISSAL_COOLDOWN_MS),
    );
  };

  // Don't render if already installed or no prompt
  if (isInstalled || !showPrompt) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -100, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed top-0 left-0 right-0 z-[100] p-4"
      >
        <div className="max-w-md mx-auto bg-gradient-to-r from-[#0a0a0a] to-[#0f0f0f] border border-white/10 rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden">
          {/* Gradient border effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-gold/20 via-transparent to-gold/20 opacity-50" />
          
          <div className="relative p-6">
            {/* Close button */}
            <button
              onClick={handleDismiss}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors text-white/40 hover:text-white/60"
            >
              <X size={16} />
            </button>

            {/* Content */}
            <div className="flex items-start gap-4">
              {/* Icon */}
              <div className="w-12 h-12 rounded-xl bg-gold/10 border border-gold/30 flex items-center justify-center flex-shrink-0">
                <Smartphone size={24} className="text-gold" />
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-serif font-bold text-white mb-1">
                  Saito Admin Tətbiqini Quraşdır
                </h3>
                <p className="text-sm text-white/60 mb-4 leading-relaxed">
                  Tətbiqi ana ekrana əlavə edin və sürətli giriş, oflayn rejim və daha çox xüsusiyyətlərdən yararlanın.
                </p>

                {/* Install button */}
                <motion.button
                  onClick={handleInstallClick}
                  whileTap={{ scale: 0.98 }}
                  whileHover={{ scale: 1.02 }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-gold via-[#E7C85A] to-gold text-black font-bold text-sm uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-gold/10 hover:shadow-gold/20"
                >
                  <Download size={18} />
                  <span>Quraşdır</span>
                  <Home size={16} />
                </motion.button>
              </div>
            </div>

            {/* Features */}
            <div className="mt-4 pt-4 border-t border-white/5">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="flex flex-col items-center gap-1">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                    <Home size={14} className="text-gold/70" />
                  </div>
                  <span className="text-[10px] text-white/40">Ana Ekran</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                    <Download size={14} className="text-gold/70" />
                  </div>
                  <span className="text-[10px] text-white/40">Sürətli</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                    <Smartphone size={14} className="text-gold/70" />
                  </div>
                  <span className="text-[10px] text-white/40">Oflayn</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
