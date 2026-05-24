'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export default function AppLandingPage() {
  const [isStandalone, setIsStandalone] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);

  useEffect(() => {
    // Check if running as standalone app
    const checkStandalone = () => {
      const standalone = window.matchMedia('(display-mode: standalone)').matches || 
                        (window.navigator as any).standalone || 
                        document.referrer.includes('android-app://');
      setIsStandalone(standalone);
    };

    checkStandalone();

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
      
      // Auto-show install prompt after a short delay
      setTimeout(() => {
        handleInstallClick();
      }, 1500);
    };

    // Listen for app installed
    const handleAppInstalled = () => {
      setShowInstallPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
      // Show success message
      const successDiv = document.createElement('div');
      successDiv.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
      successDiv.textContent = 'App uğurla quraşdırılır!';
      document.body.appendChild(successDiv);
      
      setTimeout(() => {
        if (document.body.contains(successDiv)) {
          document.body.removeChild(successDiv);
        }
      }, 3000);
    } else {
      console.log('User dismissed the install prompt');
    }
    
    setDeferredPrompt(null);
    setShowInstallPrompt(false);
  };

  // If running as standalone app, redirect to admin immediately
  if (isStandalone) {
    useEffect(() => {
      window.location.href = '/admin';
    }, []);
    return null; // Don't render anything for standalone app
  }

  // Simple premium landing page with auto-install
  return (
    <div className="h-screen w-full overflow-hidden bg-gradient-to-br from-[#0a0a0a] via-[#1a1a1a] to-[#0a0a0a] flex items-center justify-center relative">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-20 w-96 h-96 bg-gold/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-20 w-[500px] h-[500px] bg-gold/3 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gold/2 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 text-center max-w-4xl mx-auto px-6 w-full">
        {/* Logo Section */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="mb-8"
        >
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-16 h-16 bg-gold rounded-2xl flex items-center justify-center shadow-xl shadow-gold/20">
              <span className="text-black text-2xl font-black">S</span>
            </div>
            <h1 className="text-7xl font-black text-gold tracking-tight">
              SAITO
            </h1>
          </div>
          <p className="text-2xl text-white/70 font-light">Restaurant Admin System</p>
        </motion.div>

        {/* Main Content */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mb-12"
        >
          <h2 className="text-4xl font-bold text-white mb-6">
            Professional Restaurant Management
          </h2>
          <p className="text-xl text-white/60 leading-relaxed mb-8 max-w-2xl mx-auto">
            Advanced restaurant administration with real-time order management, 
            reservation tracking, and powerful analytics.
          </p>
        </motion.div>

        {/* Auto Install Message */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="space-y-6"
        >
          {showInstallPrompt ? (
            <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-8 border border-white/10 max-w-md mx-auto">
              <div className="flex items-center justify-center mb-6">
                <div className="w-20 h-20 bg-gold/20 rounded-2xl flex items-center justify-center animate-pulse">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gold">
                    <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 10.5L12 15m0 0l4.5-4.5M12 15V3"/>
                  </svg>
                </div>
              </div>
              
              <h3 className="text-white font-bold text-xl mb-4">App Yüklənir...</h3>
              <p className="text-white/60 mb-6">
                Saito Admin tətbiqini quraşdırmaq üçün sorğu göndərildi
              </p>
              
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gold"></div>
              </div>
            </div>
          ) : (
            <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-8 border border-white/10 max-w-md mx-auto">
              <div className="flex items-center justify-center mb-6">
                <div className="w-20 h-20 bg-gold/20 rounded-2xl flex items-center justify-center">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gold">
                    <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
                  </svg>
                </div>
              </div>
              
              <h3 className="text-white font-bold text-xl mb-4">Native App Only</h3>
              <p className="text-white/60 mb-6">
                Bu tətbiq yalnız native app kimi mövcuddur. Quraşdırma sorğu avtomatik olaraq göndəriləcək.
              </p>
              
              <div className="text-center">
                <p className="text-white/40 text-sm">
                  Zəhmət olmasa gözləyin...
                </p>
              </div>
            </div>
          )}
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 max-w-3xl mx-auto"
        >
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
            <div className="text-gold text-2xl mb-2">📱</div>
            <h4 className="text-white font-semibold text-sm mb-1">Native App</h4>
            <p className="text-white/50 text-xs">Optimized performance</p>
          </div>
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
            <div className="text-gold text-2xl mb-2">⚡</div>
            <h4 className="text-white font-semibold text-sm mb-1">Real-time</h4>
            <p className="text-white/50 text-xs">Live updates</p>
          </div>
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
            <div className="text-gold text-2xl mb-2">📊</div>
            <h4 className="text-white font-semibold text-sm mb-1">Analytics</h4>
            <p className="text-white/50 text-xs">Business insights</p>
          </div>
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="absolute bottom-6 left-1/2 transform -translate-x-1/2 text-white/30 text-sm"
        >
          <p>© 2024 Saito Restaurant Admin • Native App Only</p>
        </motion.div>
      </div>
    </div>
  );
}
