'use client';

import { useEffect, useState } from 'react';

export default function AppLandingPage() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [appStatus, setAppStatus] = useState<'checking' | 'not-installed' | 'installed' | 'standalone'>('checking');

  useEffect(() => {
    // Check app status
    const checkAppStatus = () => {
      // Check if running as standalone app
      const standalone = window.matchMedia('(display-mode: standalone)').matches || 
                        (window.navigator as any).standalone || 
                        document.referrer.includes('android-app://');
      
      if (standalone) {
        setAppStatus('standalone');
        // Redirect to admin immediately if in standalone mode
        setTimeout(() => {
          window.location.href = '/admin';
        }, 1000);
        return;
      }

      // Check if app is installed (using navigator.standalone or service worker)
      const isInstalled = 'serviceWorker' in navigator && 
                         localStorage.getItem('saito-app-installed') === 'true';
      
      if (isInstalled) {
        setAppStatus('installed');
      } else {
        setAppStatus('not-installed');
      }
    };

    checkAppStatus();

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    // Listen for app installed
    const handleAppInstalled = () => {
      localStorage.setItem('saito-app-installed', 'true');
      setAppStatus('installed');
      
      // Show success message
      const successDiv = document.createElement('div');
      successDiv.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 font-medium';
      successDiv.textContent = '✅ App uğurla endirildi ana ekrana!';
      document.body.appendChild(successDiv);
      
      setTimeout(() => {
        if (document.body.contains(successDiv)) {
          document.body.removeChild(successDiv);
        }
      }, 3000);
      
      setDeferredPrompt(null);
      setIsInstalling(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleDownloadClick = async () => {
    if (!deferredPrompt) {
      alert('⚠️ Zəhmət olmasa gözləyin...');
      return;
    }

    setIsInstalling(true);
    
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('User accepted install');
      } else {
        alert('❌ Endirmə ləğv edildi');
        setIsInstalling(false);
      }
      
      setDeferredPrompt(null);
    } catch (error) {
      alert('❌ Xəta baş verdi');
      setIsInstalling(false);
    }
  };

  const handleReinstallClick = () => {
    // Clear installation status and allow reinstall
    localStorage.removeItem('saito-app-installed');
    setAppStatus('not-installed');
  };

  // If in standalone mode, show redirect message
  if (appStatus === 'standalone') {
    return (
      <div style={{ 
        height: '100vh', 
        width: '100vw', 
        backgroundColor: 'black', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center',
        margin: 0,
        padding: 0
      }}>
        <h1 style={{ color: 'white', fontSize: '24px', marginBottom: '16px' }}>
          App açılır...
        </h1>
        <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '16px' }}>
          Admin panelə yönləndirilirsiniz
        </p>
      </div>
    );
  }

  // Always show landing page with different states
  return (
    <div style={{ 
      height: '100vh', 
      width: '100vw', 
      backgroundColor: 'black', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center',
      margin: 0,
      padding: 0,
      overflow: 'hidden'
    }}>
      <h1 style={{ 
        color: 'white', 
        fontSize: '32px', 
        fontWeight: 'bold', 
        marginBottom: '32px',
        textAlign: 'center'
      }}>
        Xoş gəlmisiniz
      </h1>
      
      <div style={{ 
        backgroundColor: 'rgba(255, 255, 255, 0.1)', 
        borderRadius: '8px', 
        padding: '24px', 
        textAlign: 'center',
        maxWidth: '400px',
        width: '90%'
      }}>
        {appStatus === 'checking' && (
          <>
            <p style={{ 
              color: 'white', 
              fontSize: '18px', 
              marginBottom: '24px' 
            }}>
              Yoxlanılır...
            </p>
            <div style={{
              width: '24px',
              height: '24px',
              border: '2px solid white',
              borderTop: '2px solid transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto'
            }}></div>
          </>
        )}

        {appStatus === 'not-installed' && (
          <>
            <p style={{ 
              color: 'white', 
              fontSize: '18px', 
              marginBottom: '24px' 
            }}>
              Aşağıdan endirin
            </p>
            
            <button
              onClick={handleDownloadClick}
              disabled={isInstalling || !deferredPrompt}
              style={{
                backgroundColor: 'white',
                color: 'black',
                padding: '12px 32px',
                borderRadius: '8px',
                fontWeight: 'bold',
                border: 'none',
                cursor: isInstalling || !deferredPrompt ? 'not-allowed' : 'pointer',
                opacity: isInstalling || !deferredPrompt ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                margin: '0 auto'
              }}
            >
              {isInstalling ? (
                <>
                  <div style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid black',
                    borderTop: '2px solid transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }}></div>
                  Yüklənir...
                </>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 10.5L12 15m0 0l4.5-4.5M12 15V3"/>
                  </svg>
                  Endir
                </>
              )}
            </button>
            
            {!deferredPrompt && !isInstalling && (
              <p style={{ 
                color: 'rgba(255, 255, 255, 0.6)', 
                fontSize: '14px', 
                marginTop: '16px' 
              }}>
                Zəhmət olmasa gözləyin...
              </p>
            )}
          </>
        )}

        {appStatus === 'installed' && (
          <>
            <div style={{
              width: '48px',
              height: '48px',
              backgroundColor: 'rgba(34, 197, 94, 0.2)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
            
            <p style={{ 
              color: 'white', 
              fontSize: '18px', 
              marginBottom: '16px',
              fontWeight: 'bold'
            }}>
              App artıq endirilib
            </p>
            
            <p style={{ 
              color: 'rgba(255, 255, 255, 0.6)', 
              fontSize: '14px', 
              marginBottom: '20px',
              lineHeight: '1.4'
            }}>
              Saito app-i artıq quraşdırılıb.<br/>
              Ana ekrandan açın.
            </p>
            
            <button
              onClick={handleReinstallClick}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                color: 'white',
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '14px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                cursor: 'pointer'
              }}
            >
              App silinibsə, yenidən yüklə
            </button>
          </>
        )}
      </div>

      {/* Add spinner animation inline */}
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
