'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { Reservation } from '@/types';
import { Calendar, Search, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNotifications } from '../context/NotificationContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import ReservationFilters from './components/ReservationFilters';
import { TableSkeleton } from '@/components/SkeletonLoader';
import { ReservationTableRow, ReservationCard } from './components/ReservationRow';
import { DeleteReservationModal, ClearArchiveModal } from './components/ReservationModals';

const ReservationsPage = () => {

  /* ─── State ─── */
  const [reservations, setReservations] = useState<Reservation[]>(() => {
    try { const r = localStorage.getItem('saito_reservations_cache'); return r ? JSON.parse(r) : []; } catch { return []; }
  });
  const [orders, setOrders] = useState<{table_number: number; status: string}[]>([]);
  const [loading, setLoading] = useState(() => {
    try { return !localStorage.getItem('saito_reservations_cache'); } catch { return true; }
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [isMdUp, setIsMdUp] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'cancelled'>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [timeFilter, setTimeFilter] = useState<'today' | 'future' | 'archive'>('today');
  const { refreshPendingCount, clearNotifications } = useNotifications();
  const { t } = useLanguage();

  /* ─── Confirmation modals state ─── */
  const [clearingArchive, setClearingArchive] = useState(false);
  const [archiveSelectionMode, setArchiveSelectionMode] = useState(false);
  const [selectedArchiveIds, setSelectedArchiveIds] = useState<string[]>([]);

  // Single reservation delete confirmation state
  const [confirmDeleteReservation, setConfirmDeleteReservation] = useState<{ id: string; guest: string } | null>(null);
  const [confirmClearArchiveModal, setConfirmClearArchiveModal] = useState(false);

  /* ─── Effects ─── */
  useEffect(() => {
    clearNotifications();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = () => setIsMdUp(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  /* ─── Data fetching ─── */
  const fetchOrders = async () => {
    const res = await fetch('/api/reservations');
    if (!res.ok) return;
    const data = await res.json();
    setOrders(data.orders || []);
  };

  useEffect(() => {
    fetchReservations();

    if (typeof window === 'undefined') return;

    const channel = createRealtimeChannel('reservations_page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE' || payload.eventType === 'DELETE') {
          fetchOrders();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setReservations((prev) => {
            if (prev.some((res) => res.id === payload.new.id)) return prev;
            return [payload.new as Reservation, ...prev];
          });
        } else if (payload.eventType === 'UPDATE') {
          setReservations((prev) =>
            prev.map((res) => (res.id === payload.new.id ? (payload.new as Reservation) : res))
          );
        } else if (payload.eventType === 'DELETE') {
          setReservations((prev) => prev.filter((res) => res.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => {
      removeRealtimeChannel(channel);
    };
  }, []);

  const fetchReservations = async () => {
    try {
      const res = await fetch('/api/reservations');
      if (!res.ok) throw new Error('API xətası');
      const data = await res.json();
      
      setReservations(data.reservations || []);
      setOrders(data.orders || []);
      try { localStorage.setItem('saito_reservations_cache', JSON.stringify(data.reservations || [])); } catch {}
    } catch (error: any) {
      console.error('Error fetching reservations:', error);
      toast.error(`Rezervasiyaları yükləyərkən xəta: ${error.message}`, { id: 'action-toast' });
    } finally {
      setLoading(false);
    }
  };

  /* ─── Derived counts ─── */
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const todayPendingCount = reservations.filter(res => {
    const resDate = new Date(res.date);
    return resDate >= today && resDate < tomorrow && res.status === 'pending';
  }).length;

  const futurePendingCount = reservations.filter(res => {
    const resDate = new Date(res.date);
    return resDate >= tomorrow && res.status === 'pending';
  }).length;

  const expiredCount = reservations.filter(res => {
    const resDate = new Date(res.date);
    return resDate < today || res.status === 'expired';
  }).length;

  /* ─── Action handlers ─── */
  const updateStatus = async (id: string, status: 'confirmed' | 'cancelled') => {
    try {
      const { error } = await supabase
        .from('reservations')
        .update({ status })
        .eq('id', id);

      if (error) throw error;
      toast.success(status === 'confirmed' ? t('reservation_confirmed_toast') : t('reservation_cancelled_toast'), { id: 'action-toast' });
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Status yenilənərkən xəta baş verdi', { id: 'action-toast' });
    }
  };

  const handleToggleArchiveSelection = () => {
    setArchiveSelectionMode((prev) => {
      if (prev) setSelectedArchiveIds([]);
      return !prev;
    });
  };

  const handleCancelArchiveSelection = () => {
    setArchiveSelectionMode(false);
    setSelectedArchiveIds([]);
  };

  const toggleArchiveReservationSelection = (id: string) => {
    setSelectedArchiveIds((prev) =>
      prev.includes(id) ? prev.filter((selectedId) => selectedId !== id) : [...prev, id]
    );
  };

  const handleDeleteSelectedArchiveClick = () => {
    if (selectedArchiveIds.length === 0) return;
    setConfirmClearArchiveModal(true);
  };

  const handleSelectAll = () => {
    const archiveIds = filteredReservations.map(r => r.id);
    if (selectedArchiveIds.length === archiveIds.length) {
      setSelectedArchiveIds([]);
    } else {
      setSelectedArchiveIds(archiveIds);
    }
  };

  const handleDeleteSelectedArchive = async () => {
    const archiveIds = [...selectedArchiveIds];
    setConfirmClearArchiveModal(false);
    setClearingArchive(true);

    try {
      if (archiveIds.length === 0) {
        toast.success(t('no_reservations'), { id: 'action-toast' });
        return;
      }

      const { error } = await supabase
        .from('reservations')
        .delete()
        .in('id', archiveIds);

      if (error) throw error;

      setReservations((prev) => prev.filter((res) => !archiveIds.includes(res.id)));
      setSelectedArchiveIds([]);
      setArchiveSelectionMode(false);
      toast.success(`${archiveIds.length} ${t('deleted').toLowerCase()}`, { id: 'action-toast' });
    } catch (error: any) {
      console.error('Error clearing archive:', error);
      toast.error(error?.message || t('error_deleting'), { id: 'action-toast' });
    } finally {
      setClearingArchive(false);
    }
  };

  const handleDeleteReservation = async (id: string, guest: string) => {
    setConfirmDeleteReservation({ id, guest });
  };

  const confirmDeleteReservationAction = async () => {
    if (!confirmDeleteReservation) return;
    const { id } = confirmDeleteReservation;
    setConfirmDeleteReservation(null);
    
    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id }),
      });
      if (!res.ok) throw new Error('API xətası');
      setReservations(prev => prev.filter(r => r.id !== id));
      toast.success(t('deleted'), { id: 'action-toast' });
    } catch (error: any) {
      toast.error(t('error_deleting'), { id: 'action-toast' });
    }
  };

  useEffect(() => {
    if (timeFilter !== 'archive') {
      setArchiveSelectionMode(false);
      setSelectedArchiveIds([]);
    }
  }, [timeFilter]);

  /* ─── Filtering & sorting ─── */
  const filteredReservations = reservations.filter(res => {
    const matchesSearch = res.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         res.phone.includes(searchQuery);
    const effectiveStatus = (timeFilter === 'archive' && res.status === 'pending') ? 'cancelled' : res.status;
    const matchesStatus = statusFilter === 'all' || effectiveStatus === statusFilter;
    
    // Time filtering
    const resDate = new Date(res.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    let matchesTime = false;
    if (timeFilter === 'today') {
      // Today: pending/confirmed/cancelled for today
      matchesTime = resDate >= today && resDate < tomorrow;
    } else if (timeFilter === 'future') {
      // Future: tomorrow and beyond
      matchesTime = resDate >= tomorrow;
    } else {
      // Archive: all expired + any past date (regardless of status)
      matchesTime = resDate < today || res.status === 'expired';
    }

    return matchesSearch && matchesStatus && matchesTime;
  }).sort((a, b) => {
    // Sort by date descending for archive, ascending for others
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    
    // For 'today' tab: sort by status priority (pending > confirmed > cancelled)
    if (timeFilter === 'today') {
      const statusPriority = { pending: 0, confirmed: 1, cancelled: 2 };
      const priorityA = statusPriority[a.status as keyof typeof statusPriority] ?? 3;
      const priorityB = statusPriority[b.status as keyof typeof statusPriority] ?? 3;
      if (priorityA !== priorityB) return priorityA - priorityB;
    }
    
    return timeFilter === 'archive' ? dateB - dateA : dateA - dateB;
  });

  /* ─── UI helpers ─── */
  const getStatusBadge = (status: string) => {
    if (timeFilter === 'archive' && status === 'pending') {
      return <span className="px-3 py-1 bg-white/[0.04] text-white/30 text-[11px] rounded-full border border-white/[0.08]">{t('res_auto_cancelled')}</span>;
    }
    switch (status) {
      case 'confirmed':
        return <span className="px-3 py-1 bg-green-500/10 text-green-400 text-[11px] rounded-full border border-green-500/20 shadow-[0_0_18px_rgba(34,197,94,0.08)]">{t('res_confirmed_badge')}</span>;
      case 'cancelled':
        return <span className="px-3 py-1 bg-red-500/10 text-red-400 text-[11px] rounded-full border border-red-500/20 shadow-[0_0_18px_rgba(239,68,68,0.08)]">{t('res_cancelled_badge')}</span>;
      default:
        return <span className="px-3 py-1 bg-yellow-500/10 text-yellow-300 text-[11px] rounded-full border border-yellow-500/20 shadow-[0_0_18px_rgba(234,179,8,0.08)]">{t('res_pending')}</span>;
    }
  };
 
  /* ─── Render ─── */
  return (
    <div className="relative px-0 pt-0 pb-4 md:p-8 overflow-hidden max-w-full">
      <div className="pointer-events-none absolute -top-32 right-[10%] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.07),rgba(0,0,0,0)_65%)] blur-3xl" />
      {/* Header */}
      <div className="flex flex-col gap-4 mb-0 md:mb-8">
        <div className="shrink-0 px-4 pt-5 pb-3 md:px-0 md:pt-0 md:pb-0 flex items-center justify-between md:block">
          <h1 className="hidden md:block text-2xl md:text-3xl font-serif font-bold text-white mb-0 md:mb-1">{t('reservations')}</h1>
          <p className="hidden md:block text-white/40 text-sm">{t('reservations_subtitle')}</p>
          {/* Search toggle — mobile only, lives in header */}
          <button
            onClick={() => setSearchOpen(v => !v)}
            className={`md:hidden w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${searchOpen ? 'text-white' : 'text-white/30 hover:text-white/60'}`}
          >
            {searchOpen ? <X size={14} /> : <Search size={14} />}
          </button>
        </div>
        <ReservationFilters
          timeFilter={timeFilter}
          statusFilter={statusFilter}
          searchQuery={searchQuery}
          todayPendingCount={todayPendingCount}
          futurePendingCount={futurePendingCount}
          searchOpen={searchOpen}
          archiveSelectionMode={archiveSelectionMode}
          selectedArchiveCount={selectedArchiveIds.length}
          onTimeFilter={setTimeFilter}
          onStatusFilter={setStatusFilter}
          onSearch={setSearchQuery}
          totalArchiveCount={filteredReservations.length}
          onStartArchiveSelection={handleToggleArchiveSelection}
          onDeleteSelectedArchive={handleDeleteSelectedArchiveClick}
          onCancelArchiveSelection={handleCancelArchiveSelection}
          onSelectAll={handleSelectAll}
        />
      </div>

      {/* Content */}
      {loading ? (
        <TableSkeleton rows={6} />
      ) : isMdUp ? (
        <div key={timeFilter + '__' + statusFilter}>
          {/* Desktop table */}
          <div className="bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden shadow-2xl shadow-black/40">
            <div className="overflow-auto max-h-[70vh] scrollbar-hide scroll-smooth">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-white/5 text-white/40 text-sm uppercase tracking-wider">
                    <th className="px-6 py-4 font-medium">{t('guest')}</th>
                    <th className="px-6 py-4 font-medium"><span className="inline-flex items-center gap-2"><Calendar size={14} className="text-white/20" />{t('date_time')}</span></th>
                    <th className="px-6 py-4 font-medium text-center">{t('guests')}</th>
                    <th className="px-6 py-4 font-medium">{t('status')}</th>
                    <th className="px-6 py-4 font-medium">{t('note')}</th>
                    {timeFilter !== 'archive' && <th className="px-6 py-4 font-medium text-right">{t('actions')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredReservations.map((res) => (
                    <ReservationTableRow
                      key={res.id}
                      res={res}
                      timeFilter={timeFilter}
                      statusBadge={getStatusBadge}
                      onUpdateStatus={updateStatus}
                      onDelete={handleDeleteReservation}
                      selectionMode={archiveSelectionMode && timeFilter === 'archive'}
                      selected={selectedArchiveIds.includes(res.id)}
                      onToggleSelection={toggleArchiveReservationSelection}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Empty state */}
          {filteredReservations.length === 0 && (
            <div className="relative w-full h-[40vh] select-none flex items-center justify-center">
              <Calendar size={100} strokeWidth={0.5} className="text-white/[0.06]" />
            </div>
          )}
        </div>
      ) : (
        <div key={timeFilter + '__' + statusFilter} className="mobile-reservation-layered">
          {/* Background Layer */}
          <div className="mobile-bg-layer fixed inset-0 bg-background pointer-events-none" />
          
          {/* Content Layer */}
          <div className="mobile-content-layer relative z-10">
            {filteredReservations.length > 0 ? (
              <div className="mobile-reservation-list space-y-3">
                {filteredReservations.map((res, index) => (
                  <div
                    key={res.id}
                    className="mobile-reservation-item"
                    style={{
                      animationDelay: `${index * 0.05}s`
                    }}
                  >
                    <ReservationCard
                      res={res}
                      timeFilter={timeFilter}
                      statusBadge={getStatusBadge}
                      onUpdateStatus={updateStatus}
                      onDelete={handleDeleteReservation}
                      selectionMode={archiveSelectionMode}
                      selected={selectedArchiveIds.includes(res.id)}
                      onToggleSelection={toggleArchiveReservationSelection}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="mobile-empty-state">
                <div className="empty-state-icon">
                  <Calendar size={80} strokeWidth={0.5} className="text-white/[0.06]" />
                </div>
                <div className="empty-state-text">
                  <p className="text-white/20 text-sm text-center">
                    {timeFilter === 'today' ? t('no_reservations_today') : 
                     timeFilter === 'future' ? t('no_reservations_future') : 
                     t('no_reservations_archive')}
                  </p>
                </div>
              </div>
            )}
          </div>
          
          {/* Interaction Layer */}
          <div className="mobile-interaction-layer fixed inset-0 pointer-events-none z-20">
            {/* Touch feedback overlay */}
            <div className="mobile-touch-overlay" />
          </div>
        </div>
      )}

      <DeleteReservationModal
        reservation={confirmDeleteReservation}
        onConfirm={confirmDeleteReservationAction}
        onCancel={() => setConfirmDeleteReservation(null)}
      />
      <ClearArchiveModal
        open={confirmClearArchiveModal}
        clearing={clearingArchive}
        onConfirm={handleDeleteSelectedArchive}
        onCancel={() => setConfirmClearArchiveModal(false)}
        title={t('delete_selected')}
        description={t('archive_delete_confirm')}
      />
    </div>
  );
};

export default ReservationsPage;
