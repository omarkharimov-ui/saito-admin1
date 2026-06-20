'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, Check, ChefHat, Calendar, CreditCard, Package } from 'lucide-react';

interface Notification {
  id: string;
  type: 'order' | 'ready' | 'reservation' | 'payment' | 'stock';
  title: string;
  message: string;
  timestamp: Date;
  data?: any;
  source?: string; // 'orders-page' | 'kitchen-page' | etc
}

// Check if mobile device
const isMobile = () => {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
};

// Notification types that make sense on mobile
const MOBILE_ALLOWED_TYPES = ['reservation', 'stock'];

// Check if currently on orders page
const isOnOrdersPage = () => {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.includes('/pos');
};

const iconMap = {
  order: ChefHat,
  ready: Check,
  reservation: Calendar,
  payment: CreditCard,
  stock: Package,
};

const colorMap = {
  order: 'from-amber-400 to-yellow-500',
  ready: 'from-emerald-400 to-green-500',
  reservation: 'from-blue-400 to-indigo-500',
  payment: 'from-purple-400 to-violet-500',
  stock: 'from-red-400 to-rose-500',
};

export function CustomNotificationProvider() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    // Listen for service worker messages
    navigator.serviceWorker?.addEventListener('message', (event) => {
      if (event.data?.type === 'NOTIFICATION_ACTION') {
        // Show local notification when clicked from push
      }
    });

    // Listen for custom events
    const handleNewNotification = (e: CustomEvent) => {
      const notif = e.detail as Notification;
      
      // MOBILE: Only show reservation and stock notifications
      // Order/payment/ready notifications are meaningless on mobile (real-time UI already shows them)
      if (isMobile() && !MOBILE_ALLOWED_TYPES.includes(notif.type)) {
        return;
      }
      
      // Desktop: Skip duplicate notifications when on orders page
      if (!isMobile() && isOnOrdersPage() && (notif.source === 'orders-page' || notif.type === 'order')) {
        return;
      }
      
      setNotifications(prev => [notif, ...prev]);
      
      // Auto remove after 5 seconds
      setTimeout(() => {
        dismissNotification(notif.id);
      }, 5000);
    };

    window.addEventListener('saito-notification', handleNewNotification as EventListener);

    return () => {
      window.removeEventListener('saito-notification', handleNewNotification as EventListener);
    };
  }, []);

  const dismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <div className="fixed top-4 right-4 left-4 sm:left-auto sm:w-[min(100vw-2rem,28rem)] z-[10000] space-y-3 pointer-events-none">
      <AnimatePresence>
        {notifications.map((notif) => {
          const Icon = iconMap[notif.type];
          const gradient = colorMap[notif.type];

          return (
            <motion.div
              key={notif.id}
              initial={{ x: 100, opacity: 0, scale: 0.9 }}
              animate={{ x: 0, opacity: 1, scale: 1 }}
              exit={{ x: 100, opacity: 0, scale: 0.9 }}
              className="pointer-events-auto w-full"
            >
              <div className="bg-black/95 backdrop-blur-xl border border-white/10 rounded-xl p-4 shadow-2xl w-full min-w-0 max-w-none ring-1 ring-white/5">
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className={`flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                    <Icon size={20} className="text-black" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-white truncate">
                      {notif.title}
                    </h4>
                    <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                      {notif.message}
                    </p>
                    <span className="text-[10px] text-zinc-600 mt-2 block">
                      {notif.timestamp.toLocaleTimeString('az-AZ', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </span>
                  </div>

                  {/* Dismiss */}
                  <button
                    onClick={() => dismissNotification(notif.id)}
                    className="flex-shrink-0 p-1.5 text-zinc-500 hover:text-white transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

// Global function to show notifications
export function showSAITONotification(
  type: Notification['type'],
  title: string,
  message: string,
  data?: any
) {
  const event = new CustomEvent('saito-notification', {
    detail: {
      id: Math.random().toString(36).substr(2, 9),
      type,
      title,
      message,
      timestamp: new Date(),
      data,
    } as Notification,
  });
  window.dispatchEvent(event);
}
