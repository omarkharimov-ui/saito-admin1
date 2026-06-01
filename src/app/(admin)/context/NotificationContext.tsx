'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { toast, type Toast } from 'react-hot-toast';

const dismissToast = (t: Toast) => toast.dismiss(t.id);

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

const DING_SOUND = "https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3"; // A short elegant chime sound

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pendingCount, setPendingCount] = useState(0);
  const [newOrdersCount, setNewOrdersCount] = useState(0);
  const [readyOrdersCount, setReadyOrdersCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const prevReadyIdsRef = useRef<Set<string>>(new Set());
  const skipOrdersOnMobileRef = useRef(false);

  // Stable refs so realtime handler always uses latest functions without re-subscribing
  const playSoundRef = useRef<() => void>(() => {});
  const showNotificationRef = useRef<(t: string, b: string) => void>(() => {});
  const addNotificationRef = useRef<(t: string, b: string, type: 'reservation' | 'order') => void>(() => {});
  const fetchPendingCountRef = useRef<() => Promise<void>>(async () => {});
  const fetchNewOrdersCountRef = useRef<() => Promise<void>>(async () => {});
  const getMergedTableNameRef = useRef<(tableNum: number | null, orderId?: string) => Promise<string>>(async () => '');

  // Deduplication ref to prevent duplicate toasts within 3 seconds
  const recentToastsRef = useRef<Map<string, number>>(new Map());
  const isDuplicateToast = useCallback((message: string): boolean => {
    const now = Date.now();
    const lastShown = recentToastsRef.current.get(message);
    if (lastShown && now - lastShown < 3000) {
      return true; // Duplicate within 3 seconds
    }
    recentToastsRef.current.set(message, now);
    // Cleanup old entries
    recentToastsRef.current.forEach((timestamp, msg) => {
      if (now - timestamp > 3000) recentToastsRef.current.delete(msg);
    });
    return false;
  }, []);

  // Helper to get merged table display name (e.g., "9+7" if tables are merged)
  const getMergedTableName = useCallback(async (tableNum: number | null, orderId?: string): Promise<string> => {
    if (!tableNum) return 'Naməlum masa';
    if (!orderId) return `Masa ${tableNum}`;
    
    try {
      // Find orders that were merged INTO this order
      const { data } = await supabase
        .from('orders')
        .select('table_number')
        .eq('merged_into', orderId)
        .not('table_number', 'is', null);
      
      if (data && data.length > 0) {
        const mergedNums = data.map(o => o.table_number).filter(Boolean);
        if (mergedNums.length > 0) {
          return `Masa ${tableNum}+${mergedNums.join('+')}`;
        }
      }
      return `Masa ${tableNum}`;
    } catch {
      return `Masa ${tableNum}`;
    }
  }, []);

  useEffect(() => {
    const a = new Audio(DING_SOUND);
    setAudio(a);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const apply = () => {
      skipOrdersOnMobileRef.current = mq.matches;
      if (mq.matches) {
        setNewOrdersCount(0);
        setReadyOrdersCount(0);
        setNotifications((prev) => prev.filter((n) => n.type !== 'order'));
      }
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const addNotification = useCallback((title: string, body: string, type: 'reservation' | 'order') => {
    if (type === 'order' && skipOrdersOnMobileRef.current) return;
    const newItem: NotificationItem = {
      id: Math.random().toString(36).substring(7),
      title,
      body,
      time: new Date(),
      type,
      isRead: false
    };
    setNotifications(prev => [newItem, ...prev].slice(0, 10)); // Keep only last 10
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  useEffect(() => {
    if (!audio) return;

    // Browser policy: Audio only plays after user interaction
    const enableAudio = () => {
      const prevVol = audio.volume;
      audio.volume = 0;
      audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = prevVol;
      }).catch(() => {});
      window.removeEventListener('click', enableAudio);
    };
    window.addEventListener('click', enableAudio);

    return () => window.removeEventListener('click', enableAudio);
  }, [audio]);

  const playSound = useCallback(() => {
    if (audio) {
      audio.play().catch(() => {});
    }
  }, [audio]);

  const showNotification = useCallback((_title: string, _body: string) => {
    // Browser OS notifications disabled — Electron will handle system notifications
  }, []);

  // Keep refs in sync with latest callbacks
  useEffect(() => { playSoundRef.current = playSound; }, [playSound]);
  useEffect(() => { showNotificationRef.current = showNotification; }, [showNotification]);
  useEffect(() => { addNotificationRef.current = addNotification; }, [addNotification]);
  useEffect(() => { getMergedTableNameRef.current = getMergedTableName; }, [getMergedTableName]);

  const fetchNewOrdersCount = useCallback(async () => {
    if (skipOrdersOnMobileRef.current) {
      setNewOrdersCount(0);
      return;
    }
    const { count } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'new');
    if (count !== null) setNewOrdersCount(count);
  }, []);

  const fetchReadyOrdersCount = useCallback(async () => {
    if (skipOrdersOnMobileRef.current) {
      setReadyOrdersCount(0);
      return;
    }
    const { count } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('kitchen_status', 'ready')
      .in('status', ['new', 'confirmed']);
    if (count !== null) setReadyOrdersCount(count);
  }, []);

  const fetchReadyOrdersCountRef = useRef(fetchReadyOrdersCount);
  useEffect(() => { fetchReadyOrdersCountRef.current = fetchReadyOrdersCount; }, [fetchReadyOrdersCount]);

  const fetchPendingCount = useCallback(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const { count, error } = await supabase
      .from('reservations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .gte('date', todayStr);

    if (!error && count !== null) {
      setPendingCount(count);
    }
  }, []);

  useEffect(() => { fetchPendingCountRef.current = fetchPendingCount; }, [fetchPendingCount]);
  useEffect(() => { fetchNewOrdersCountRef.current = fetchNewOrdersCount; }, [fetchNewOrdersCount]);

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
      const body = `Hazırlıq üçün sabahkı rezervasiyaları yoxlayın.`;
      addNotification(title, body, 'reservation');
      showNotification(title, body);
    }
  }, [addNotification, showNotification]);

  // Polling fallback — fires notification if new reservations appear (works even if Realtime is blocked by RLS)
  const prevPendingRef = useRef<number | null>(null);

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
    }, 60000); // every 60 seconds (realtime handles instant updates)

    // Init
    supabase
      .from('reservations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .gte('date', todayStr)
      .then(({ count }) => {
        if (count !== null) prevPendingRef.current = count;
      });

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchPendingCount();
    checkTomorrowReservations();

    // Real-time listener — uses refs so we never re-subscribe on callback changes
    const channel = createRealtimeChannel('admin_notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reservations' },
        (payload) => {
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
            duration: 4000, style: { background: '#1a1a1a', color: '#fff', border: '1px solid #D4AF3740', cursor: 'pointer' }
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'reservations' },
        () => { fetchPendingCountRef.current(); }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'reservations' },
        () => { fetchPendingCountRef.current(); }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        async (payload) => {
          if (skipOrdersOnMobileRef.current) return;
          fetchNewOrdersCountRef.current();
          fetchReadyOrdersCountRef.current();
          const tableNum = payload.new?.table_number;
          const orderId = payload.new?.id;
          const tableName = await getMergedTableNameRef.current(tableNum, orderId);
          
          // Order updated (items added/removed/qty changed)
          const isMergeOp = payload.new?.merged_into && !payload.old?.merged_into;
          const kitchenResetToPending = !isMergeOp && payload.new?.kitchen_status === 'pending' && payload.old?.kitchen_status !== 'pending';
          const totalChanged = !isMergeOp && payload.new?.kitchen_status === 'pending' && payload.new?.total_amount !== payload.old?.total_amount;
          if (kitchenResetToPending || totalChanged) {
            const title = 'Sifariş yeniləndi';
            const body = `${tableName} yeniləndi`;
            if (!isDuplicateToast(body)) {
              addNotificationRef.current(title, body, 'order');
              toast((t) => <span onClick={() => dismissToast(t)}>{body}</span>, {
                duration: 3000,
                icon: undefined,
                style: { background: '#1a1200', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.35)', fontWeight: 'bold', cursor: 'pointer' },
              });
            }
          }
          // Kitchen accepted the order
          if (payload.new?.kitchen_status === 'accepted' && payload.old?.kitchen_status !== 'accepted') {
            const title = 'Sifariş Qəbul Edildi';
            const body = `${tableName} qəbul edildi`;
            if (!isDuplicateToast(body)) {
              addNotificationRef.current(title, body, 'order');
              toast((t) => <span onClick={() => dismissToast(t)}>{body}</span>, {
                duration: 3000,
                icon: undefined,
                style: { background: '#111', color: '#d1d5db', border: '1px solid rgba(255,255,255,0.12)', fontWeight: 'bold', cursor: 'pointer' },
              });
            }
          }
          // Kitchen started preparing
          if (payload.new?.kitchen_status === 'preparing' && payload.old?.kitchen_status !== 'preparing') {
            const title = 'Hazırlanır';
            const body = `${tableName} hazırlanır`;
            if (!isDuplicateToast(body)) {
              addNotificationRef.current(title, body, 'order');
              toast((t) => <span onClick={() => dismissToast(t)}>{body}</span>, {
                duration: 3000,
                icon: undefined,
                style: { background: '#0d1525', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.35)', fontWeight: 'bold', cursor: 'pointer' },
              });
            }
          }
          // Kitchen marked order as ready
          if (payload.new?.kitchen_status === 'ready' && payload.old?.kitchen_status !== 'ready') {
            const acceptedAt = payload.new?.kitchen_accepted_at;
            const prepSec = acceptedAt
              ? Math.floor((Date.now() - new Date(acceptedAt).getTime()) / 1000)
              : null;
            const prepStr = prepSec !== null
              ? `${Math.floor(prepSec / 60)}:${String(prepSec % 60).padStart(2, '0')} dəq`
              : null;
            const title = 'Sifariş Hazırdır';
            const body = `${tableName} hazırdır${prepStr ? ` · ${prepStr}` : ''}`;
            if (!isDuplicateToast(body)) {
              playSoundRef.current();
              addNotificationRef.current(title, body, 'order');
              toast.success((t) => <span onClick={() => dismissToast(t)}>{body}</span>, {
                duration: 5000,
                icon: undefined,
                style: { background: '#0d0b00', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.28)', fontWeight: 'bold', cursor: 'pointer' },
              });
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'orders' },
        () => { if (!skipOrdersOnMobileRef.current) { fetchNewOrdersCountRef.current(); fetchReadyOrdersCountRef.current(); } }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        async (payload) => {
          if (skipOrdersOnMobileRef.current) return;
          fetchNewOrdersCountRef.current();
          if (payload.new?.status !== 'new') return;
          const tableNum = payload.new?.table_number;
          const orderId = payload.new?.id;
          const amount = payload.new?.total_amount;
          const tableName = await getMergedTableNameRef.current(tableNum, orderId);
          const title = 'Saito: Yeni Sifariş!';
          const body = `${tableName}${amount ? ` — ${Number(amount).toFixed(2)} ₼` : ''}`;
          const toastBody = `Yeni sifariş: ${tableName}${amount ? ` · ${Number(amount).toFixed(2)} ₼` : ''}`;
          if (!isDuplicateToast(toastBody)) {
            playSoundRef.current();
            showNotificationRef.current(title, body);
            addNotificationRef.current(title, body, 'order');
            toast.success((t) => <span onClick={() => dismissToast(t)}>{toastBody}</span>, {
              duration: 4000, style: { background: '#1a1a1a', color: '#fff', border: '1px solid #D4AF3740', cursor: 'pointer' }
            });
          }
        }
      )
      .subscribe((status, err) => {
      });

    fetchNewOrdersCount();
    fetchReadyOrdersCount();

    // Overdue order polling — warn admin every 5 min if any order > 20 min old and not ready
    const overdueInterval = setInterval(async () => {
      if (skipOrdersOnMobileRef.current) return;
      const cutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('orders')
        .select('id, table_number, created_at')
        .in('status', ['new', 'confirmed'])
        .neq('kitchen_status', 'ready')
        .lt('created_at', cutoff);
      if (data && data.length > 0) {
        const tables = data.map((o: any) => o.table_number ? `Masa ${o.table_number}` : '?').join(', ');
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchNewOrdersCount, fetchReadyOrdersCount]);

  return (
    <NotificationContext.Provider value={{ 
      pendingCount,
      newOrdersCount,
      readyOrdersCount,
      notifications,
      refreshPendingCount: fetchPendingCount,
      markAsRead,
      markAllAsRead,
      clearNotifications
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
