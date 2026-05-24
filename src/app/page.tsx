'use client';

import { useEffect, useState } from 'react';

export default function AppLandingPage() {
  const [isStandalone, setIsStandalone] = useState(false);
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

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      
      // Auto-show install prompt immediately
      setTimeout(() => {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then((choiceResult: any) => {
            if (choiceResult.outcome === 'accepted') {
              console.log('App installed');
            }
            setDeferredPrompt(null);
          });
        }
      }, 1000);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // If running as standalone app, redirect to admin immediately
  if (isStandalone) {
    useEffect(() => {
      window.location.href = '/admin';
    }, []);
    return null;
  }

  // Super simple landing page
  return (
    <div className="h-screen w-full bg-black flex flex-col items-center justify-center">
      <h1 className="text-white text-4xl font-bold mb-8">Xoş gəlmisiniz</h1>
      
      <div className="bg-white/10 rounded-lg p-6 text-center">
        <p className="text-white text-lg mb-4">Aşağıdan endirin</p>
        <div className="animate-pulse">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="mx-auto">
            <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 10.5L12 15m0 0l4.5-4.5M12 15V3"/>
          </svg>
        </div>
        <p className="text-white/60 text-sm mt-4">App avtomatik olaraq quraşdırılacaq</p>
      </div>
    </div>
  );
}
