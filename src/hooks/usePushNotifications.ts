'use client';

import { useState, useEffect, useCallback } from 'react';

interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    // Check if push is supported
    const supported = 
      typeof window !== 'undefined' && 
      'serviceWorker' in navigator && 
      'PushManager' in window;
    
    setIsSupported(supported);

    if (supported) {
      // Check current permission
      setPermission(Notification.permission);
      
      // Check existing subscription
      checkSubscription();
    }
  }, []);

  const checkSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const existingSub = await registration.pushManager.getSubscription();
      
      if (existingSub) {
        setSubscription({
          endpoint: existingSub.endpoint,
          keys: {
            p256dh: existingSub.toJSON().keys?.p256dh || '',
            auth: existingSub.toJSON().keys?.auth || '',
          },
        });
      }
    } catch (error) {
      console.error('Error checking subscription:', error);
    }
  };

  const requestPermission = async (): Promise<boolean> => {
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === 'granted';
    } catch (error) {
      console.error('Error requesting permission:', error);
      return false;
    }
  };

  const subscribe = async (vapidPublicKey: string): Promise<boolean> => {
    try {
      // First request permission
      const granted = await requestPermission();
      if (!granted) {
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      
      // Subscribe to push
      const newSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource,
      });

      setSubscription({
        endpoint: newSubscription.endpoint,
        keys: {
          p256dh: newSubscription.toJSON().keys?.p256dh || '',
          auth: newSubscription.toJSON().keys?.auth || '',
        },
      });

      // Send to your server
      await saveSubscriptionToServer({
        endpoint: newSubscription.endpoint,
        keys: {
          p256dh: newSubscription.toJSON().keys?.p256dh || '',
          auth: newSubscription.toJSON().keys?.auth || '',
        },
      });

      return true;
    } catch (error) {
      console.error('Error subscribing to push:', error);
      return false;
    }
  };

  const unsubscribe = async (): Promise<boolean> => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const existingSub = await registration.pushManager.getSubscription();
      
      if (existingSub) {
        await existingSub.unsubscribe();
        setSubscription(null);
        
        // Remove from server
        await removeSubscriptionFromServer(existingSub.endpoint);
      }
      
      return true;
    } catch (error) {
      console.error('Error unsubscribing:', error);
      return false;
    }
  };

  const showLocalNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (Notification.permission === 'granted') {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification(title, {
          icon: '/icon-192x192.png',
          badge: '/icon-192x192.png',
          ...options,
        });
      });
    }
  }, []);

  return {
    permission,
    subscription,
    isSupported,
    requestPermission,
    subscribe,
    unsubscribe,
    showLocalNotification,
  };
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  
  return outputArray;
}

// API calls (implement these with your backend)
async function saveSubscriptionToServer(subscription: PushSubscription) {
  // TODO: Send to your backend API
  // await fetch('/api/push/subscribe', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(subscription),
  // });
}

async function removeSubscriptionFromServer(endpoint: string) {
  // TODO: Remove from your backend
  // await fetch('/api/push/unsubscribe', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ endpoint }),
  // });
}
