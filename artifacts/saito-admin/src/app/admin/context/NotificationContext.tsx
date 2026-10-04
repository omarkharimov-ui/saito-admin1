'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { toast, type Toast } from '@/lib/toast';
import { CheckCircle2, X } from '@/components/ui/saito-icons';
// 13d: direct browser supabase queries removed (RLS-dead — app.current_role
// not set for user sessions); all badge data now comes from /api/admin/badges.
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { getSettings } from '@/lib/settings-client';

const dismissToast = (t: Toast) => toast.dismiss(t.id);

const toastBaseStyle = {
  background: 'var(--theme-panel, #111111)',
  color: 'var(--theme-text, #f5f5f7)',
  border: '1px solid var(--theme-border, rgba(255,255,255,0.08))',
  boxShadow: '0 12px 30px rgba(0,0,0,0.12)',
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
    style: { ...toastBaseStyle, background: 'var(--theme-error-bg, #1a1111)', color: 'var(--theme-error-text, #fecaca)', border: '1px solid rgba(248,113,113,0.28)' },
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

  const skipOrdersOnMobileRef = useRef(false);
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
    const apply = () => {
      skipOrdersOnMobileRef.current = mq.matches;
      if (mq.matches) {
        setNewOrdersCount(0);
        setReadyOrdersCount(0);
        setNotifications(prev => prev.filter(n => n.type !== 'order'));
      }
    };
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
    if (type === 'order' && skipOrdersOnMobileRef.current) return;
    setNotifications(prev => [
      { id: Math.random().toString(36).substring(7), title, body, time: new Date(), type, isRead: false },
      ...prev,
    ].slice(0, 10));
  }, []);

  const showNotification = useCallback((title: string, body: string) => {
    window.dispatchEvent(new CustomEvent('saito-notification', {
      detail: { id: Math.random().toString(36).substring(2, 11), title, body, time: new Date(), type: 'order', isRead: false },
    }));
    if (isFullscreen) return;
  }, [isFullscreen]);

  const playSound = useCallback(() => {
    if (audio) audio.play().catch(() => {});
  }, [audio]);

  // 13d: ONE service-role call for every badge. The old implementation polled
  // `orders` / `reservations` directly from the browser — RLS-gated (the
  // pooler does not set app.current_role for user sessions) → the navbar bell
  // was permanently 0, the "yeni rezervasiya" sound never fired, and the
  // overdue-order warning never ran. All silently.
  const delayMinutesRef = useRef(20);
  const fetchBadges = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/badges?delay_minutes=${delayMinutesRef.current}`, { cache: 'no-store' });
      if (!res.ok) return null;
      const d = await res.json();
      if (skipOrdersOnMobileRef.current) {
        setNewOrdersCount(0);
        setReadyOrdersCount(0);
      } else {
        setNewOrdersCount(d.newOrders || 0);
        setReadyOrdersCount(d.readyOrders || 0);
      }
      setPendingCount(d.pendingReservations || 0);
      return d;
    } catch {
      return null;
    }
  }, []);

  const fetchNewOrdersCount = useCallback(async () => {
    if (skipOrdersOnMobileRef.current) {
      setNewOrdersCount(0);
      return;
    }
    await fetchBadges();
  }, [fetchBadges]);

  const fetchReadyOrdersCount = useCallback(async () => {
    if (skipOrdersOnMobileRef.current) {
      setReadyOrdersCount(0);
      return;
    }
    await fetchBadges();
  }, [fetchBadges]);

  const fetchPendingCount = useCallback(async () => {
    await fetchBadges();
  }, [fetchBadges]);

  useEffect(() => { playSoundRef.current = playSound; }, [playSound]);
  useEffect(() => { showNotificationRef.current = showNotification; }, [showNotification]);
  useEffect(() => { addNotificationRef.current = addNotification; }, [addNotification]);
  useEffect(() => { fetchPendingCountRef.current = fetchPendingCount; }, [fetchPendingCount]);
  useEffect(() => { fetchNewOrdersCountRef.current = fetchNewOrdersCount; }, [fetchNewOrdersCount]);
  useEffect(() => { fetchReadyOrdersCountRef.current = fetchReadyOrdersCount; }, [fetchReadyOrdersCount]);

  // 13d: tomorrow count comes from the same service-role badges endpoint.
  const checkTomorrowReservations = useCallback(async () => {
    const d = await fetchBadges();
    if (d && d.tomorrowReservations > 0) {
      const title = `Sabah ${d.tomorrowReservations} rezervasiya var!`;
      const body = 'Hazırlıq üçün sabahkı rezervasiyaları yoxlayın.';
      addNotification(title, body, 'reservation');
      showNotification(title, body);
    }
  }, [fetchBadges, addNotification, showNotification]);

  // 13d: 60s reservation poll now rides the service-role badges endpoint
  // (the direct browser count was RLS-dead). Sound + notification logic kept.
  useEffect(() => {
    const interval = setInterval(async () => {
      const d = await fetchBadges();
      const count = d ? d.pendingReservations : null;
      if (count === null) return;
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

    fetchBadges().then(d => {
      if (d) prevPendingRef.current = d.pendingReservations;
    });

    return () => clearInterval(interval);
  }, [fetchBadges]);

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
          style: { background: 'var(--theme-panel, #1a1a1a)', color: 'var(--theme-text, #fff)', border: '1px solid var(--theme-accent-border, #D4AF3740)', cursor: 'pointer' },
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reservations' }, () => {
        fetchPendingCountRef.current();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reservations' }, () => {
        fetchPendingCountRef.current();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, async (payload) => {
        if (skipOrdersOnMobileRef.current) return;
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
              style: { background: 'var(--theme-warning-bg, #1a1200)', color: 'var(--theme-warning-text, #fbbf24)', border: '1px solid rgba(251,191,36,0.35)', fontWeight: 'bold', cursor: 'pointer' },
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
              style: { background: 'var(--theme-panel, #111)', color: 'var(--theme-text-secondary, #d1d5db)', border: '1px solid var(--theme-border, rgba(255,255,255,0.12))', fontWeight: 'bold', cursor: 'pointer' },
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
              style: { background: 'var(--theme-info-bg, #0d1525)', color: 'var(--theme-info-text, #93c5fd)', border: '1px solid rgba(59,130,246,0.35)', fontWeight: 'bold', cursor: 'pointer' },
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
              style: { background: 'var(--theme-accent-soft, #0d0b00)', color: 'var(--theme-accent, #D4AF37)', border: '1px solid var(--theme-accent-border, rgba(212,175,55,0.28))', fontWeight: 'bold', cursor: 'pointer' },
            });
          }
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, async (payload) => {
        if (payload.new?.status === 'paid' && payload.old?.status !== 'paid') {
          fetchReadyOrdersCountRef.current();
          fetchNewOrdersCountRef.current();
          const tableName = payload.new?.table_number ? `Masa ${payload.new.table_number}` : '';
          const body = `${tableName} — hesab bağlandı`;
          addNotificationRef.current('Ödəniş', body, 'order');
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'orders' }, () => {
        if (!skipOrdersOnMobileRef.current) {
          fetchNewOrdersCountRef.current();
          fetchReadyOrdersCountRef.current();
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, async (payload) => {
        if (skipOrdersOnMobileRef.current) return;
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
            style: { background: 'var(--theme-panel, #1a1a1a)', color: 'var(--theme-text, #fff)', border: '1px solid var(--theme-accent-border, #D4AF3740)', cursor: 'pointer' },
          });
        }
      })
      .subscribe(() => {});

    fetchNewOrdersCount();
    fetchReadyOrdersCount();

    // Load delay threshold from settings (whitelisted server endpoint)
    getSettings('order').then((row) => {
      const val = Number(row.order_delay_minutes);
      if (!isNaN(val) && val >= 1) delayMinutesRef.current = val;
    });

    // 13d: overdue sweep now rides the service-role badges endpoint — the old
    // version queried `orders` AND `table_floors` directly from the browser,
    // both RLS-dead, so this warning had NEVER fired in production.
    const overdueInterval = setInterval(async () => {
      if (skipOrdersOnMobileRef.current) return;
      const d = await fetchBadges();
      const overdueTables = d?.overdueTables;
      if (!overdueTables || overdueTables.length === 0) return;
      const tables = overdueTables.map((n: number) => `Masa ${n}`).join(', ');
      toast((t) => <span onClick={() => dismissToast(t)}>{overdueTables.length} gecikən sifariş: {tables}</span>, {
        duration: 5000,
        style: { background: 'var(--theme-error-bg, #1f0d0d)', color: 'var(--theme-error-text, #f87171)', border: '1px solid rgba(248,113,113,0.3)', fontWeight: 'bold', cursor: 'pointer' },
      });
    }, 5 * 60 * 1000);

    return () => {
      removeRealtimeChannel(channel);
      clearInterval(overdueInterval);
    };
  }, [checkTomorrowReservations, fetchNewOrdersCount, fetchReadyOrdersCount, fetchPendingCount, fetchBadges, isDuplicateToast]);

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
