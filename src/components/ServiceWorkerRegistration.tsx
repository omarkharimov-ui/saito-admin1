'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    // Only register service worker in production or when explicitly enabled
    const shouldRegisterSW = process.env.NODE_ENV === 'production' || 
                           process.env.NEXT_PUBLIC_ENABLE_SW === 'true';

    if (!shouldRegisterSW) {
      console.log('Service Worker registration is disabled in development');
      return;
    }

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((registration) => {
            console.log('Service Worker registered successfully: ', registration.scope);
            
            // Check for updates
            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              if (newWorker) {
                console.log('New Service Worker found');
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    console.log('New Service Worker installed, refreshing page');
                    // New content is available; refresh the page
                    window.location.reload();
                  }
                });
              }
            });

            // Periodic update check (every 30 minutes)
            setInterval(() => {
              registration.update();
            }, 30 * 60 * 1000);

          })
          .catch((registrationError) => {
            console.error('Service Worker registration failed: ', registrationError);
            
            // Don't show errors to users in development
            if (process.env.NODE_ENV === 'production') {
              console.warn('PWA features may not work without Service Worker');
            }
          });
      });
    } else {
      console.log('Service Worker is not supported in this browser');
    }
  }, []);

  return null;
}
