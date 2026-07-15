'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    // Only register service worker in production or when explicitly enabled
    const shouldRegisterSW = process.env.NODE_ENV === 'production' || 
                           process.env.NEXT_PUBLIC_ENABLE_SW === 'true';

    if (!shouldRegisterSW) {
      return;
    }

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((registration) => {
            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
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
            if (process.env.NODE_ENV === 'production') {
            }
          });
      });
    }
  }, []);

  return null;
}
