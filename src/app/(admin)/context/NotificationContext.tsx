'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { toast, type Toast } from 'react-hot-toast';
import { CheckCircle2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';

const dismissToast = (t: Toast) => toast.dismiss(t.id);

const toastBaseStyle = {
  background: '#111111',
  color: '#f5f5f7',
  border: '1px solid rgba(255,255,255,0.08)',
  boxShadow: '0 12px 30px rgba(0,0,0,0.28)',
} as const;

export const toastSuccess = (message: string, options: Parameters<typeof toast.success>[1] = {}) =>
  toast.success(message, {
    icon: <CheckCircle2 size={16} strokeWidth={2.2} />,
    style: toastBaseStyle,
    ...options,
  });

export const toastError = (message: string, options: Parameters<typeof toast.error>[1] = {}) =>
  toast.error(message, {
    icon: <X size={16} strokeWidth={2.2} />,
    style: { ...toastBaseStyle, background: '#1a1111', color: '#fecaca', border: '1px solid rgba(248,113,113,0.28)' },
    ...options,
  });

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  time: Date;
  type: 'reservation' | 'order';
  isRead: boolean;
}

interface NotificationContextType {
  pendingCount: number;
  newOrdersCount: number;
  readyOrdersCount: number;
  notifications: NotificationItem[];
  refreshPendingCount: () => Promise<void>;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);
const DING_SOUND = 'https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3';

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pendingCount, setPendingCount] = useState(0);
  const [newOrdersCount, setNewOrdersCount] = useState(0);
  const [readyOrdersCount, setReadyOrdersCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const fullscreenNotificationRef = useRef<string | null>(null);
  const prevPendingRef = useRef<number | null>(null);
  const recentToastsRef = useRef<Map<string, number>>(new Map());

  const playSoundRef = useRef<() => void>(() => {});
  const showNotificationRef = useRef<(title: string, body: string) => void>(() => {});
  const addNotificationRef = useRef<(title: string, body: string, type: 'reservation' | 'order') => void>(() => {});
  const fetchPendingCountRef = useRef<() => Promise<void>>(async () => {});
  const fetchNewOrdersCountRef = useRef<() => Promise<void>>(async () => {});
  const fetchReadyOrdersCountRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    setAudio(new Audio(DING_SOUND));
  }, []);

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', syncFullscreen);
    syncFullscreen();
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const apply = () => {};
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const isDuplicateToast = useCallback((message: string) => {
    const now = Date.now();
    const lastShown = recentToastsRef.current.get(message);
    if (lastShown && now - lastShown < 3000) return true;
    recentToastsRef.current.set(message, now);
    recentToastsRef.current.forEach((timestamp, msg) => {
      if (now - timestamp > 3000) recentToastsRef.current.delete(msg);
    });
    return false;
  }, []);

  const addNotification = useCallback((title: string, body: string, type: 'reservation' | 'order') => {
    setNotifications(prev => [
      { id: Math.random().toString(36).substring(7), title, body, time: new Date(), type, isRead: false },
      ...prev,
    ].slice(0, 10));
  }, []);

  const showNotification = useCallback((title: string, body: string) => {
    const fingerprint = `${title}::${body}`;
    if (fullscreenNotificationRef.current === fingerprint) return;
    fullscreenNotificationRef.current = fingerprint;
    window.setTimeout(() => {
      if (fullscreenNotificationRef.current === fingerprint) fullscreenNotificationRef.current = null;
    }, 3000);

    const detail = { id: Math.random().toString(36).substring(2, 11), title, body, message: body, time: new Date(), type: 'order', isRead: false };
    window.dispatchEvent(new CustomEvent('saito-notification', { detail }));
    if (isFullscreen) {
      window.dispatchEvent(new CustomEvent('saito-notification-fullscreen', { detail }));
    }
  }, [isFullscreen]);

  const playSound = useCallback(() => {
    if (audio) audio.play().catch(() => {});
  }, [audio]);

  const fetchNewOrdersCount = useCallback(async () => {
    const { count } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'new');
    if (count !== null) setNewOrdersCount(count);
  }, []);

  const fetchReadyOrdersCount = useCallback(async () => {
    const { count } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('kitchen_status', 'ready')
      .in('status', ['new', 'confirmed'])
      .is('paid_at', null)
      .is('closed_at', null);
    if (count !== null) setReadyOrdersCount(count);
  }, []);

  const fetchPendingCount = useCallback(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    const { count, error } = await supabase
      .from('reservations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .gte('date', todayStr);
    if (!error && count !== null) setPendingCount(count);
  }, []);

  useEffect(() => { playSoundRef.current = playSound; }, [playSound]);
  useEffect(() => { showNotificationRef.current = showNotification; }, [showNotification]);
  useEffect(() => { addNotificationRef.current = addNotification; }, [addNotification]);
  useEffect(() => { fetchPendingCountRef.current = fetchPendingCount; }, [fetchPendingCount]);
  useEffect(() => { fetchNewOrdersCountRef.current = fetchNewOrdersCount; }, [fetchNewOrdersCount]);
  useEffect(() => { fetchReadyOrdersCountRef.current = fetchReadyOrdersCount; }, [fetchReadyOrdersCount]);

  const checkTomorrowReservations = useCallback(async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('date', tomorrowStr)
      .neq('status', 'cancelled');

    if (!error && data && data.length > 0) {
      const title = `Sabah ${data.length} rezervasiya var!`;
      const body = 'Hazırlıq üçün sabahkı rezervasiyaları yoxlayın.';
      addNotification(title, body, 'reservation');
      showNotification(title, body);
    }
  }, [addNotification, showNotification]);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const interval = setInterval(async () => {
      const { count } = await supabase
        .from('reservations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .gte('date', todayStr);
      if (count === null) return;
      setPendingCount(count);
      if (prevPendingRef.current !== null && count > prevPendingRef.current) {
        const diff = count - prevPendingRef.current;
        const title = 'Saito: Yeni Rezervasiya!';
        const body = `${diff} yeni rezervasiya gözləyir`;
        playSoundRef.current();
        showNotificationRef.current(title, body);
        addNotificationRef.current(title, body, 'reservation');
      }
      prevPendingRef.current = count;
    }, 60000);

    supabase
      .from('reservations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .gte('date', todayStr)
      .then(({ count }) => {
        if (count !== null) prevPendingRef.current = count;
      });

    return () => clearInterval(interval);
  }, [addNotification, showNotification]);

  useEffect(() => {
    fetchPendingCount();
    checkTomorrowReservations();

    const channel = createRealtimeChannel('admin_notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reservations' }, (payload) => {
        fetchPendingCountRef.current();
        playSoundRef.current();
        const guestName = payload.new?.name || 'Naməlum';
        const guestDate = payload.new?.date || '';
        const guestTime = payload.new?.time || '';
        const guestCount = payload.new?.guests || payload.new?.guest_count || '';
        const title = 'Saito: Yeni Rezervasiya!';
        const body = `${guestName} — ${guestDate} ${guestTime}${guestCount ? `, ${guestCount} nəfər` : ''}`;
        showNotificationRef.current(title, body);
        addNotificationRef.current(title, body, 'reservation');
        toast.success((t) => <span onClick={() => dismissToast(t)}>Yeni rezervasiya: {guestName}{guestDate ? ` (${guestDate})` : ''}</span>, {
          duration: 4000,
          style: { background: '#1a1a1a', color: '#fff', border: '1px solid #D4AF3740', cursor: 'pointer' },
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reservations' }, () => {
        fetchPendingCountRef.current();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reservations' }, () => {
        fetchPendingCountRef.current();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, async (payload) => {
        fetchNewOrdersCountRef.current();
        fetchReadyOrdersCountRef.current();
        const tableNum = payload.new?.table_number;
        const tableName = tableNum ? `Masa ${tableNum}` : 'Naməlum masa';
        const isMergeOp = payload.new?.merged_into && !payload.old?.merged_into;
        const kitchenResetToPending = !isMergeOp && payload.new?.kitchen_status === 'pending' && payload.old?.kitchen_status !== 'pending';
        const totalChanged = !isMergeOp && payload.new?.kitchen_status === 'pending' && payload.new?.total_amount !== payload.old?.total_amount;
        if (kitchenResetToPending || totalChanged) {
          const body = `${tableName} yeniləndi`;
          if (!isDuplicateToast(body)) {
            addNotificationRef.current('Sifariş yeniləndi', body, 'order');
            toast((t) => <span onClick={() => dismissToast(t)}>{body}</span>, {
              duration: 3000,
              icon: undefined,
              style: { background: '#1a1200', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.35)', fontWeight: 'bold', cursor: 'pointer' },
            });
          }
        }
        if (payload.new?.kitchen_status === 'accepted' && payload.old?.kitchen_status !== 'accepted') {
          const body = `${tableName} qəbul edildi`;
          if (!isDuplicateToast(body)) {
            addNotificationRef.current('Sifariş Qəbul Edildi', body, 'order');
            toast((t) => <span onClick={() => dismissToast(t)}>{body}</span>, {
              duration: 3000,
              icon: undefined,
              style: { background: '#111', color: '#d1d5db', border: '1px solid rgba(255,255,255,0.12)', fontWeight: 'bold', cursor: 'pointer' },
            });
          }
        }
        if (payload.new?.kitchen_status === 'preparing' && payload.old?.kitchen_status !== 'preparing') {
          const body = `${tableName} hazırlanır`;
          if (!isDuplicateToast(body)) {
            addNotificationRef.current('Hazırlanır', body, 'order');
            toast((t) => <span onClick={() => dismissToast(t)}>{body}</span>, {
              duration: 3000,
              icon: undefined,
              style: { background: '#0d1525', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.35)', fontWeight: 'bold', cursor: 'pointer' },
            });
          }
        }
        if (payload.new?.kitchen_status === 'ready' && payload.old?.kitchen_status !== 'ready') {
          const acceptedAt = payload.new?.kitchen_accepted_at;
          const prepSec = acceptedAt ? Math.floor((Date.now() - new Date(acceptedAt).getTime()) / 1000) : null;
          const prepStr = prepSec !== null ? `${Math.floor(prepSec / 60)}:${String(prepSec % 60).padStart(2, '0')} dəq` : null;
          const body = `${tableName} hazırdır${prepStr ? ` · ${prepStr}` : ''}`;
          if (!isDuplicateToast(body)) {
            playSoundRef.current();
            addNotificationRef.current('Sifariş Hazırdır', body, 'order');
            toast.success((t) => <span onClick={() => dismissToast(t)}>{body}</span>, {
              duration: 5000,
              icon: undefined,
              style: { background: '#0d0b00', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.28)', fontWeight: 'bold', cursor: 'pointer' },
            });
          }
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'orders' }, () => {
        fetchNewOrdersCountRef.current();
        fetchReadyOrdersCountRef.current();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, async (payload) => {
        fetchNewOrdersCountRef.current();
        if (payload.new?.status !== 'new') return;
        const tableNum = payload.new?.table_number;
        const amount = payload.new?.total_amount;
        const tableName = tableNum ? `Masa ${tableNum}` : 'Naməlum masa';
        const body = `${tableName}${amount ? ` — ${Number(amount).toFixed(2)} ₼` : ''}`;
        const toastBody = `Yeni sifariş: ${tableName}${amount ? ` · ${Number(amount).toFixed(2)} ₼` : ''}`;
        if (!isDuplicateToast(toastBody)) {
          playSoundRef.current();
          showNotificationRef.current('Saito: Yeni Sifariş!', body);
          addNotificationRef.current('Saito: Yeni Sifariş!', body, 'order');
          toast.success((t) => <span onClick={() => dismissToast(t)}>{toastBody}</span>, {
            duration: 4000,
            style: { background: '#1a1a1a', color: '#fff', border: '1px solid #D4AF3740', cursor: 'pointer' },
          });
        }
      })
      .subscribe(() => {});

    fetchNewOrdersCount();
    fetchReadyOrdersCount();

    const overdueInterval = setInterval(async () => {
      const cutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('orders')
        .select('id, table_number, created_at, status, paid_at, closed_at, kitchen_status')
        .in('status', ['new', 'confirmed'])
        .is('paid_at', null)
        .is('closed_at', null)
        .not('kitchen_status', 'eq', 'cancelled')
        .lt('created_at', cutoff);
      if (data && data.length > 0) {
        const tables = data.map((o: any) => (o.table_number ? `Masa ${o.table_number}` : '?')).join(', ');
        toast((t) => <span onClick={() => dismissToast(t)}>{data.length} gecikən sifariş: {tables}</span>, {
          duration: 5000,
          style: { background: '#1f0d0d', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)', fontWeight: 'bold', cursor: 'pointer' },
        });
      }
    }, 5 * 60 * 1000);

    return () => {
      removeRealtimeChannel(channel);
      clearInterval(overdueInterval);
    };
  }, [checkTomorrowReservations, fetchNewOrdersCount, fetchReadyOrdersCount, fetchPendingCount, isDuplicateToast]);

  return (
    <NotificationContext.Provider value={{
      pendingCount,
      newOrdersCount,
      readyOrdersCount,
      notifications,
      refreshPendingCount: fetchPendingCount,
      markAsRead: (id: string) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n)),
      markAllAsRead: () => setNotifications(prev => prev.map(n => ({ ...n, isRead: true }))),
      clearNotifications: () => setNotifications([]),
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) throw new Error('useNotifications must be used within a NotificationProvider');
  return context;
};
