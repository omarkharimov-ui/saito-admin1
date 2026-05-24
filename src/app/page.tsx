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

  // If running as standalone app, redirect to admin
  if (isStandalone) {
    useEffect(() => {
      window.location.href = '/admin';
    }, []);
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-gold text-xl">Yüklənir...</div>
      </div>
    );
  }

  // Browser landing page - only download options
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] via-[#1a1a1a] to-[#0a0a0a] flex flex-col items-center justify-center p-6">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-20 w-72 h-72 bg-gold/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-gold/3 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 text-center max-w-2xl mx-auto">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <h1 className="text-6xl font-black text-gold mb-2 tracking-tight">
            SAITO
          </h1>
          <p className="text-xl text-white/60 font-light">Restaurant Admin</p>
        </motion.div>

        {/* App Store Style Description */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-12"
        >
          <h2 className="text-3xl font-bold text-white mb-4">
            Professional Restaurant Management
          </h2>
          <p className="text-lg text-white/70 leading-relaxed mb-6">
            Modern restaurant administration system with real-time order management, 
            reservation tracking, and advanced analytics. Available exclusively as a native app.
          </p>
          
          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-white/5 backdrop-blur-sm rounded-lg p-4 border border-white/10">
              <div className="text-gold text-2xl mb-2">📱</div>
              <h3 className="text-white font-semibold mb-1">Native App</h3>
              <p className="text-white/60 text-sm">Optimized for mobile devices</p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-lg p-4 border border-white/10">
              <div className="text-gold text-2xl mb-2">⚡</div>
              <h3 className="text-white font-semibold mb-1">Real-time</h3>
              <p className="text-white/60 text-sm">Live order updates</p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-lg p-4 border border-white/10">
              <div className="text-gold text-2xl mb-2">📊</div>
              <h3 className="text-white font-semibold mb-1">Analytics</h3>
              <p className="text-white/60 text-sm">Advanced insights</p>
            </div>
          </div>
        </motion.div>

        {/* Download Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="space-y-4"
        >
          {showInstallPrompt ? (
            <button
              onClick={handleInstallClick}
              className="bg-gold text-black px-8 py-4 rounded-xl font-bold text-lg hover:bg-gold/90 transition-all transform hover:scale-105 shadow-xl shadow-gold/20"
            >
              📱 Quraşdır
            </button>
          ) : (
            <div className="space-y-4">
              <p className="text-white/60 mb-4">
                Bu tətbiq yalnız native app kimi mövcuddur
              </p>
              
              {/* Manual install instructions */}
              <div className="bg-white/5 backdrop-blur-sm rounded-lg p-6 border border-white/10">
                <h3 className="text-white font-semibold mb-4">Quraşdırma üçün:</h3>
                <div className="space-y-3 text-left">
                  <div className="flex items-center gap-3">
                    <span className="text-gold font-bold">1.</span>
                    <span className="text-white/80">Chrome/Safari-də açın</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-gold font-bold">2.</span>
                    <span className="text-white/80">Menyüdən "Add to Home Screen" seçin</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-gold font-bold">3.</span>
                    <span className="text-white/80">"Quraşdır" düyməsinə basın</span>
                  </div>
                </div>
              </div>

              {/* Platform specific buttons */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={() => {
                    // iOS instructions
                    alert('iPhone/iPad: Safari-də "Share" → "Add to Home Screen"');
                  }}
                  className="bg-white/10 backdrop-blur-sm text-white px-6 py-3 rounded-lg font-medium hover:bg-white/20 transition-all border border-white/20"
                >
                  🍎 iOS üçün
                </button>
                <button
                  onClick={() => {
                    // Android instructions
                    alert('Android: Chrome-də "⋮" → "Add to Home Screen"');
                  }}
                  className="bg-white/10 backdrop-blur-sm text-white px-6 py-3 rounded-lg font-medium hover:bg-white/20 transition-all border border-white/20"
                >
                  🤖 Android üçün
                </button>
              </div>
            </div>
          )}
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-16 text-white/40 text-sm"
        >
          <p>© 2024 Saito Restaurant Admin</p>
          <p className="mt-2">Available as native app only</p>
        </motion.div>
      </div>
    </div>
  );
}
