'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { showSAITONotification } from '@/components/CustomNotification';

export function NotificationButton() {
  const { permission, isSupported, requestPermission, subscribe, showLocalNotification } = usePushNotifications();
  const [isLoading, setIsLoading] = useState(false);
  const [clickCount, setClickCount] = useState(0);

  // VAPID public key - replace with your actual key from web-push generate
  const VAPID_PUBLIC_KEY = 'YOUR_VAPID_PUBLIC_KEY_HERE';

  if (!isSupported) {
    return null; // Don't show on unsupported browsers
  }

  const handleClick = async () => {
    setIsLoading(true);
    setClickCount(prev => prev + 1);
    
    if (permission === 'default') {
      // Request permission
      const granted = await requestPermission();
      if (granted && VAPID_PUBLIC_KEY !== 'YOUR_VAPID_PUBLIC_KEY_HERE') {
        await subscribe(VAPID_PUBLIC_KEY);
      }
    } else if (permission === 'granted') {
      // Show custom SAITO notification (not browser default)
      const testTypes = ['order', 'ready', 'reservation', 'payment', 'stock'] as const;
      const testNotifs = [
        { type: 'order', title: 'Yeni Sifariş!', message: 'Masa 5 • 3 məhsul • 45 ₼' },
        { type: 'ready', title: 'Sifariş Hazır!', message: 'Masa 3 • Salmon Roll hazırdır' },
        { type: 'reservation', title: 'Yeni Rezervasiya!', message: 'Ahməd • 19:00 • 4 nəfər' },
        { type: 'payment', title: 'Ödəniş Alındı!', message: '58 ₼ • Kart • Masa 7' },
        { type: 'stock', title: 'Məhsul Tükənir!', message: 'Unagi • Qalıq: 3 ədəd' },
      ];
      
      const testNotif = testNotifs[clickCount % testNotifs.length];
      showSAITONotification(testNotif.type as any, testNotif.title, testNotif.message);
      
      // Also send browser push notification (for testing when app is closed)
      showLocalNotification('SAITO Admin', {
        body: testNotif.message,
        tag: 'test',
      });
    }
    
    setIsLoading(false);
  };

  const isEnabled = permission === 'granted';

  return (
    <motion.button
      onClick={handleClick}
      disabled={isLoading}
      whileTap={{ scale: 0.9 }}
      className={`relative p-3 rounded-full transition-colors ${
        isEnabled 
          ? 'bg-amber-500/20 text-amber-400' 
          : 'bg-zinc-800 text-zinc-400'
      }`}
      title={isEnabled ? 'Test bildiriş göndər' : 'Bildirişləri aç'}
    >
      {isEnabled ? (
        <Bell size={20} />
      ) : (
        <BellOff size={20} />
      )}
      
      {/* Notification badge */}
      {isEnabled && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-amber-500 rounded-full"
        />
      )}
    </motion.button>
  );
}
