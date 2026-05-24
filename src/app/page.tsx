'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export default function AppLandingPage() {
  const [isStandalone, setIsStandalone] = useState(false);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // Check if running as standalone app
    const checkStandalone = () => {
      const standalone = window.matchMedia('(display-mode: standalone)').matches || 
                        (window.navigator as any).standalone || 
                        document.referrer.includes('android-app://');
      setIsStandalone(standalone);
    };

    checkStandalone();
    window.addEventListener('resize', checkStandalone);

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Listen for app installed
    const handleAppInstalled = () => {
      setShowInstallPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('resize', checkStandalone);
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

  // Premium fixed-height landing page - no scroll
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
            reservation tracking, and powerful analytics. Available exclusively as a native app.
          </p>
        </motion.div>

        {/* Premium Features Grid */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 max-w-3xl mx-auto"
        >
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:bg-white/10 transition-all">
            <div className="text-gold text-3xl mb-3">📱</div>
            <h3 className="text-white font-bold text-lg mb-2">Native App</h3>
            <p className="text-white/60 text-sm">Optimized for mobile devices with native performance</p>
          </div>
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:bg-white/10 transition-all">
            <div className="text-gold text-3xl mb-3">⚡</div>
            <h3 className="text-white font-bold text-lg mb-2">Real-time</h3>
            <p className="text-white/60 text-sm">Live order updates and instant notifications</p>
          </div>
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:bg-white/10 transition-all">
            <div className="text-gold text-3xl mb-3">📊</div>
            <h3 className="text-white font-bold text-lg mb-2">Analytics</h3>
            <p className="text-white/60 text-sm">Advanced insights and business intelligence</p>
          </div>
        </motion.div>

        {/* Premium Download Section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="space-y-6"
        >
          {showInstallPrompt ? (
            <button
              onClick={handleInstallClick}
              className="bg-gold text-black px-12 py-5 rounded-2xl font-bold text-xl hover:bg-gold/90 transition-all transform hover:scale-105 shadow-2xl shadow-gold/30 flex items-center gap-3 mx-auto"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 10.5L12 15m0 0l4.5-4.5M12 15V3"/>
              </svg>
              📱 Quraşdır
            </button>
          ) : (
            <div className="space-y-6">
              {/* Premium Download Card */}
              <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-8 border border-white/10 max-w-md mx-auto">
                <div className="flex items-center justify-center mb-6">
                  <div className="w-20 h-20 bg-gold/20 rounded-2xl flex items-center justify-center">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gold">
                      <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 10.5L12 15m0 0l4.5-4.5M12 15V3"/>
                    </svg>
                  </div>
                </div>
                
                <h3 className="text-white font-bold text-xl mb-4">Native App Only</h3>
                <p className="text-white/60 mb-6">
                  Bu tətbiq yalnız native app kimi mövcuddur
                </p>
                
                {/* Platform Buttons */}
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      alert('iPhone/iPad: Safari-də "Share" → "Add to Home Screen"');
                    }}
                    className="w-full bg-white/10 backdrop-blur-sm text-white px-6 py-4 rounded-xl font-medium hover:bg-white/20 transition-all border border-white/20 flex items-center justify-center gap-3"
                  >
                    <span className="text-xl">🍎</span>
                    <span>iOS üçün quraşdır</span>
                  </button>
                  <button
                    onClick={() => {
                      alert('Android: Chrome-də "⋮" → "Add to Home Screen"');
                    }}
                    className="w-full bg-white/10 backdrop-blur-sm text-white px-6 py-4 rounded-xl font-medium hover:bg-white/20 transition-all border border-white/20 flex items-center justify-center gap-3"
                  >
                    <span className="text-xl">🤖</span>
                    <span>Android üçün quraşdır</span>
                  </button>
                </div>
              </div>

              {/* Quick Instructions */}
              <div className="text-center">
                <p className="text-white/40 text-sm">
                  1. Browser açın → 2. "Add to Home Screen" → 3. Quraşdırın
                </p>
              </div>
            </div>
          )}
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
