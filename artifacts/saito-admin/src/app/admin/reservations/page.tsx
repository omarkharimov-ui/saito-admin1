'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Reservation } from '@/types';
import { X, Users, Phone, Calendar, ShoppingBag, Timer, Star, CheckCircle, Table as TableIcon, Zap, ArrowRight, Clock, ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '@/lib/toast';
import { useNotifications } from '../context/NotificationContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { apiFetch } from '@/lib/api-fetch';
import ReservationFilters from './components/ReservationFilters';
import { TableSkeleton } from '@/components/SkeletonLoader';
import { ReservationTableRow, ReservationCard } from './components/ReservationRow';
import { DeleteReservationModal, ClearArchiveModal, UpsertReservationModal } from './components/ReservationModals';

export default function ReservationsPage() {
  const { t, language } = useLanguage();
  const { lightMode } = useTheme();
  const { clearNotifications } = useNotifications();
  const clearNotificationsRef = useRef(clearNotifications);
  clearNotificationsRef.current = clearNotifications;
  
  /* ─── State ─── */
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'cancelled' | 'expired'>('all');
  const [timeFilter, setTimeFilter] = useState<'today' | 'future' | 'archive'>('today');
  
  const [selectedRes, setSelectedRes] = useState<any | null>(null);
  const [modalView, setModalView] = useState<'main' | 'tables'>('main');
  
  const [tables, setTables] = useState<any[]>([]);
  const [floors, setFloors] = useState<any[]>([]);
  const [selectedFloorName, setSelectedFloorName] = useState<string>('');
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);

  const [archiveSelectionMode, setArchiveSelectionMode] = useState(false);
  const [selectedArchiveIds, setSelectedArchiveIds] = useState<string[]>([]);
  const [confirmDeleteReservation, setConfirmDeleteReservation] = useState<{ id: string; guest: string } | null>(null);
  const [confirmClearArchiveModal, setConfirmClearArchiveModal] = useState(false);
  const [clearingArchive, setClearingArchive] = useState(false);

  // Pre-order state (entered here, persisted before confirm)
  const [preOrderItems, setPreOrderItems] = useState<any[]>([]);
  const [availableProducts, setAvailableProducts] = useState<any[]>([]);
  const [preOrderSaving, setPreOrderSaving] = useState(false);

  // New states for CRUD
  const [upsertModalOpen, setUpsertModalOpen] = useState(false);
  const [editingReservation, setEditingReservation] = useState<any | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  /* ─── Data Fetching ─── */
  const fetchData = async () => {
    try {
      const res = await fetch('/api/reservations');
      const data = await res.json();
      
      if (data.reservations) {
        setReservations(data.reservations);
      }
      
      const { data: tData } = await supabase.from('table_floors').select('*');
      const allTables = tData || [];
      setTables(allTables);

      const uniqueFloorNames = Array.from(new Set(allTables.map(t => t.floor_name || 'Zal 1')));
      setFloors(uniqueFloorNames.map(name => ({ id: name, name })));
      
      if (!selectedFloorName && uniqueFloorNames.length > 0) {
        setSelectedFloorName(uniqueFloorNames[0]);
      }

      const { data: productsData } = await supabase
        .from('products')
        .select('id, name_az, name_en, name_ru, price, is_available')
        .eq('is_available', true)
        .order('name_az', { ascending: true });
      setAvailableProducts(productsData || []);
    } catch (error) {
      console.error(error);
      toast.error('Rezervasiya məlumatları yüklənərkən xəta', { id: 'action-toast' });
    } finally {
      setLoading(false);
    }
  };

  /* ─── Pre-order helpers ─── */
  const productName = (p: any) => {
    if (language === 'az' && p.name_az) return p.name_az;
    if (language === 'ru' && p.name_ru) return p.name_ru;
    if (language === 'en' && p.name_en) return p.name_en;
    return p.name_az || p.name_en || p.name_ru || 'Məhsul';
  };

  const loadPreOrder = async (resId: string) => {
    try {
      const res = await fetch(`/api/reservations/pre-order?reservation_id=${resId}`);
      const data = await res.json();
      if (res.ok) {
        const items = data.items || [];
        setPreOrderItems(
          items.map((it: any) => ({
            product_id: it.product_id,
            product_name: it.product_name,
            unit_price: it.unit_price,
            quantity: it.quantity,
          }))
        );
      }
    } catch (e) {
      console.error('Failed to load pre-order', e);
    }
  };

  const savePreOrder = async (items: any[]) => {
    if (!selectedRes) return;
    setPreOrderSaving(true);
    try {
      await fetch('/api/reservations/pre-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservation_id: selectedRes.id, items }),
      });
    } catch (e) {
      console.error('Failed to save pre-order', e);
    } finally {
      setPreOrderSaving(false);
    }
  };

  const addPreOrderItem = (p: any) => {
    setPreOrderItems(prev => {
      const existing = prev.find(i => i.product_id === p.id);
      let next: any[];
      if (existing) {
        next = prev.map(i => i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      } else {
        next = [...prev, {
          product_id: p.id,
          product_name: productName(p),
          unit_price: Number(p.price) || 0,
          quantity: 1,
        }];
      }
      savePreOrder(next);
      return next;
    });
  };

  const changePreOrderQty = (productId: string, delta: number) => {
    setPreOrderItems(prev => {
      const next = prev
        .map(i => i.product_id === productId ? { ...i, quantity: i.quantity + delta } : i)
        .filter(i => i.quantity > 0);
      savePreOrder(next);
      return next;
    });
  };

  const removePreOrderItem = (productId: string) => {
    setPreOrderItems(prev => {
      const next = prev.filter(i => i.product_id !== productId);
      savePreOrder(next);
      return next;
    });
  };

  const selectReservation = (r: any, view: 'main' | 'tables') => {
    setSelectedRes(r);
    setModalView(view);
    setSelectedTableIds(Array.isArray(r.table_ids) ? r.table_ids : []);
    setPreOrderItems([]);
    if (r.id) loadPreOrder(r.id);
  };

  const closeReservation = () => {
    setSelectedRes(null);
    setPreOrderItems([]);
  };

  useEffect(() => {
    fetchData();
    clearNotificationsRef.current();
  }, []);

  /* ─── Realtime: sync with POS / other sources ─── */
  useEffect(() => {
    const channel = createRealtimeChannel('reservations-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_floors' }, () => fetchData())
      .subscribe();
    return () => { removeRealtimeChannel(channel); };
  }, []);

  /* ─── Actions ─── */
  const handleUpsert = async (formData: any) => {
    setActionLoading(true);
    try {
      const body = {
        action: editingReservation ? 'update' : 'create',
        id: editingReservation?.id,
        data: {
          ...formData,
          name: formData.customer_name,
          status: editingReservation?.status || 'pending'
        }
      };

      const res = await apiFetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Operation failed');

      toast.success(editingReservation ? 'Rezervasiya yeniləndi' : 'Yeni rezervasiya yaradıldı');
      setUpsertModalOpen(false);
      setEditingReservation(null);
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await apiFetch('/api/reservations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'archive', id }) });
      fetchData();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleRestore = async (id: string) => {
    try {
      await apiFetch('/api/reservations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restore', id }) });
      fetchData();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleSendToKitchen = async (id: string) => {
    try {
      await apiFetch('/api/reservations/send-kitchen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reservation_id: id }) });
      toast.success('Mətbəxə göndərildi');
      fetchData();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleGuestArrived = async (id: string) => {
    try {
      await apiFetch('/api/reservations/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reservation_id: id, status: 'checked_in' }) });
      fetchData();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleConfirmReservation = async (id: string) => {
    try {
      await apiFetch('/api/reservations/reserve-table', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reservation_id: id, table_ids: selectedTableIds }) });
      toast.success('Rezervasiya təsdiqləndi');
      fetchData();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch('/api/reservations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id }) });
      toast.success('Rezervasiya silindi');
      fetchData();
    } catch (e: any) { toast.error(e.message); }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      const res = await apiFetch('/api/reservations/reserve-table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservation_id: selectedRes.id,
          table_ids: selectedTableIds,
          pre_order_items: preOrderItems,
          guest_count: selectedRes.guests ?? 0,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Bron xetasi');
      }

      toast.success(`${selectedRes.name} ucun masalar bron edildi!`);
      closeReservation();
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Xeta bas verdi');
    }
  };

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  /* ─── Logic ─── */
  const calculateTimeLeft = (resTime: string, resDate: string) => {
    if (!resTime) return '--:--';
    const [h, m] = resTime.split(':').map(Number);
    const target = new Date(resDate); 
    target.setHours(h, m, 0, 0);
    
    const diff = target.getTime() - currentTime.getTime();
    if (diff < 0) {
        if (Math.abs(diff) < 1800000) return 'Gecikir';
        return 'Vaxtı keçib';
    }
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const filteredReservations = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    
    return reservations.filter(res => {
      const matchesSearch = (res.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (res.customer_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (res.phone || '').includes(searchQuery);
      
      const matchesStatus = statusFilter === 'all' || res.status === statusFilter;
      
      if (timeFilter === 'today') return matchesSearch && matchesStatus && res.date === todayStr && res.status !== 'archived' && res.status !== 'cancelled';
      if (timeFilter === 'future') return matchesSearch && matchesStatus && res.date > todayStr && res.status !== 'archived';
      if (timeFilter === 'archive') return matchesSearch && matchesStatus && (res.status === 'archived' || res.status === 'cancelled' || res.status === 'expired' || res.date < todayStr);
      
      return matchesSearch && matchesStatus;
    }).sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.time.localeCompare(b.time);
    });
  }, [reservations, searchQuery, statusFilter, timeFilter]);


  const goToPOSPreOrder = () => {
    if (!Array.isArray(selectedTableIds) || selectedTableIds.length === 0) return toast.error("Əvvəlcə masanı təyin edin");
    
    const occupiedIds = new Set(tables.filter(t => t.status && t.status !== 'empty').map(t => t.id));
    const alreadyTaken = selectedTableIds.filter(id => occupiedIds.has(id));
    if (alreadyTaken.length > 0) {
      const nums = alreadyTaken.map(id => tables.find(t => t.id === id)?.table_number).filter(Boolean).join(', ');
      return toast.error(`Masa ${nums} artıq doludur. Başqa masa seçin.`);
    }
    
    const tablesLabel = selectedTableIds.map(id => tables.find(t => t.id === id)?.table_number).join(' + ');
    localStorage.setItem('saito_pos_preorder_context', JSON.stringify({
      resId: selectedRes.id,
      tableIds: selectedTableIds,
      guestName: selectedRes.name,
      tablesLabel,
    }));
    const params = new URLSearchParams({
      resId: selectedRes.id,
      tableIds: selectedTableIds.join(','),
      guestName: selectedRes.name,
      tablesLabel,
    });
    window.location.href = `/admin/pos?${params.toString()}`;
  };

  return (
    <div className="relative p-4 md:p-8 max-w-full min-h-screen">
      <div className="flex flex-col gap-6 mb-10">
        <div className="flex items-center justify-between">
           <h1 className="text-4xl font-black tracking-tighter">Rezervasiyalar</h1>
           <button 
             onClick={() => { setEditingReservation(null); setUpsertModalOpen(true); }}
             className="flex items-center gap-2 px-6 py-4 bg-gold text-black text-sm font-bold rounded-[2rem] hover:brightness-110 active:scale-95 transition-all shadow-xl shadow-gold/10"
           >
             <Plus size={18} /> Yeni Rezervasiya
           </button>
        </div>
        <ReservationFilters 
          timeFilter={timeFilter} statusFilter={statusFilter} searchQuery={searchQuery}
          onTimeFilter={setTimeFilter} onStatusFilter={setStatusFilter} onSearch={setSearchQuery}
          todayPendingCount={filteredReservations.filter(r => r.status === 'pending').length}
          futurePendingCount={0} searchOpen={true} archiveSelectionMode={archiveSelectionMode}
          selectedArchiveCount={selectedArchiveIds.length} totalArchiveCount={filteredReservations.length}
          onStartArchiveSelection={() => setArchiveSelectionMode(true)}
          onDeleteSelectedArchive={() => setConfirmClearArchiveModal(true)}
          onCancelArchiveSelection={() => setArchiveSelectionMode(false)}
          onSelectAll={() => {
            if (selectedArchiveIds.length === filteredReservations.length) {
              setSelectedArchiveIds([]);
            } else {
              setSelectedArchiveIds(filteredReservations.map(r => r.id));
            }
          }}
        />
      </div>

      {loading ? <TableSkeleton rows={8} /> : (
        <div className={`rounded-[3rem] border overflow-hidden shadow-2xl ${lightMode ? 'bg-white border-zinc-100 shadow-zinc-200/50' : 'bg-[#0f0f0f] border-white/5 shadow-black/40'}`}>
          <table className="w-full text-left">
            <thead className="opacity-30 text-[10px] font-black uppercase tracking-widest bg-black/5">
              <tr>
                <th className="px-8 py-5 text-zinc-500">Qonaq</th>
                <th className="px-8 py-5 text-zinc-500">Tarix & Saat</th>
                <th className="px-8 py-5 text-center text-zinc-500">Nəfər</th>
                <th className="px-8 py-5 text-zinc-500">Status</th>
                <th className="px-8 py-5 text-zinc-500">Qeyd</th>
                <th className="px-8 py-5 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {filteredReservations.map(res => (
                <ReservationTableRow 
                  key={res.id} res={res} timeFilter={timeFilter}
                  selectionMode={archiveSelectionMode}
                  isSelected={selectedArchiveIds.includes(res.id)}
                  onToggleSelect={(id) => {
                    setSelectedArchiveIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
                  }}
                  onSelect={(r) => { selectReservation(r, 'main'); }}
                  statusBadge={(s) => {
                    const colors: Record<string, string> = {
                      pending: 'bg-amber-500/10 text-amber-500',
                      confirmed: 'bg-green-500/10 text-green-500',
                      checked_in: 'bg-blue-500/10 text-blue-400',
                      completed: 'bg-emerald-500/10 text-emerald-400',
                      cancelled: 'bg-red-500/10 text-red-500',
                      no_show: 'bg-zinc-500/10 text-zinc-500',
                      expired: 'bg-rose-500/10 text-rose-400',
                      archived: 'bg-zinc-500/10 text-zinc-400',
                    };
                    return <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest ${colors[s] || 'bg-zinc-500/10 text-zinc-500'}`}>{s.replace('_', ' ')}</span>
                  }}
                  onUpdateStatus={updateStatus} 
                  onEdit={(r) => { setEditingReservation(r); setUpsertModalOpen(true); }}
                  onDelete={(id, guest) => setConfirmDeleteReservation({ id, guest })}
                  onArchive={handleArchive}
                  onRestore={handleRestore}
                  onHandle={(r) => { selectReservation(r, 'tables'); }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}


      <AnimatePresence>
        {selectedRes && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => closeReservation()} className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md" />
              <motion.div
                initial={{ opacity: 0, y: 60, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 40, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 35, mass: 0.9 }}
                className={`fixed inset-0 m-auto z-[110] w-[95%] h-fit max-h-[90vh] overflow-hidden rounded-[3.5rem] shadow-[0_50px_100px_rgba(0,0,0,0.4)] border border-white/20 backdrop-blur-3xl ${lightMode ? 'bg-white/90 text-zinc-900' : 'bg-zinc-900/90 text-white'} ${modalView === 'main' ? 'max-w-2xl' : 'max-w-4xl'}`}
            >
              <div className="p-10 relative overflow-y-auto max-h-[90vh] custom-scrollbar">
                <button onClick={() => closeReservation()} className="absolute top-8 right-10 p-3 rounded-full bg-white/5 hover:bg-white/10 transition-colors"><X size={24} /></button>

                <AnimatePresence mode="popLayout" initial={false}>
                  {modalView === 'main' && (
                    <motion.div key="main-view" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.2 }} className="flex flex-col gap-8">
                       <motion.div layout="position">
                          <h2 className="text-5xl font-black tracking-tighter mb-2 leading-none">{selectedRes.name}</h2>
                          <div className="flex gap-4 text-xs font-black opacity-40 uppercase tracking-widest mb-2">
                             <span className="flex items-center gap-1.5 text-blue-500"><Phone size={14} /> {selectedRes.phone}</span>
                             <span className="flex items-center gap-1.5"><Star size={14} /> {selectedRes.visitCount} Ziyarət</span>
                          </div>
                          <div className="flex flex-wrap gap-3 mb-10">
                             <span className={`px-4 py-2 rounded-2xl text-xs font-black flex items-center gap-2 ${lightMode ? 'bg-zinc-100 text-zinc-700' : 'bg-white/10 text-white/80'}`}>
                               <Calendar size={14} /> {new Date(selectedRes.date).toLocaleDateString('az-AZ')}
                             </span>
                             <span className={`px-4 py-2 rounded-2xl text-xs font-black flex items-center gap-2 ${lightMode ? 'bg-zinc-100 text-zinc-700' : 'bg-white/10 text-white/80'}`}>
                               <Clock size={14} /> {selectedRes.time}
                             </span>
                             <span className={`px-4 py-2 rounded-2xl text-xs font-black flex items-center gap-2 ${lightMode ? 'bg-zinc-100 text-zinc-700' : 'bg-white/10 text-white/80'}`}>
                               <Users size={14} /> {selectedRes.guests} Nəfər
                             </span>
                           </div>

                           {selectedRes.pre_order_items && (() => {
                             const items = typeof selectedRes.pre_order_items === 'string' ? JSON.parse(selectedRes.pre_order_items) : selectedRes.pre_order_items;
                             const total = (items || []).reduce((s: number, i: any) => s + (i.unit_price * i.quantity), 0);
                             if (!items || items.length === 0) return null;
                             return (
                               <div className={`p-6 rounded-[2rem] border mb-6 ${lightMode ? 'bg-amber-50 border-amber-200' : 'bg-amber-500/5 border-amber-500/20'}`}>
                                 <div className="flex items-center justify-between mb-3">
                                   <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Öncədən Sifariş</span>
                                   <span className="text-sm font-black text-amber-500">₼{total.toFixed(2)}</span>
                                 </div>
                                 <div className="flex flex-col gap-1.5 mb-4">
                                   {items.slice(0, 5).map((item: any, i: number) => (
                                     <div key={i} className="flex items-center justify-between text-xs">
                                       <span className="font-bold truncate">{item.quantity}x {item.product_name}</span>
                                       <span className="text-[10px] opacity-60">₼{(item.unit_price * item.quantity).toFixed(2)}</span>
                                     </div>
                                   ))}
                                   {items.length > 5 && <span className="text-[10px] opacity-40">+{items.length - 5} daha</span>}
                                 </div>
                                  {(selectedRes.status === 'confirmed' || selectedRes.status === 'waiting') && (
                                     <button onClick={() => handleSendToKitchen(selectedRes.id)} className="w-full py-4 rounded-2xl bg-blue-500 text-white text-xs font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-lg">
                                      Aşpaza Göndər
                                    </button>
                                  )}
                               </div>
                             );
                           })()}

                           {(() => {
                            const isExpired = selectedRes.date < new Date().toISOString().split('T')[0] || 
                              (selectedRes.date === new Date().toISOString().split('T')[0] && selectedRes.time && (() => {
                                const [h, m] = selectedRes.time.split(':').map(Number);
                                const t = new Date(); t.setHours(h, m, 0);
                                return new Date().getTime() - t.getTime() > 0;
                              })());
                            
                            if (isExpired && (selectedRes.status === 'cancelled' || selectedRes.status === 'no_show' || selectedRes.status === 'archived' || selectedRes.status === 'expired')) {
                              return (
                                <div className={`p-8 rounded-[2.5rem] text-center ${lightMode ? 'bg-zinc-50' : 'bg-white/5'}`}>
                                  <Timer size={40} className="mx-auto mb-4 text-zinc-400" />
                                  <p className="text-lg font-black tracking-tight opacity-60">Bu rezervasiyanın vaxtı keçib</p>
                                  <p className="text-sm opacity-40 mt-1">Ətraflı məlumat üçün yuxarıdakı detallara baxın</p>
                                </div>
                              );
                            }

                            return (
                              <div className="flex flex-col gap-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  <motion.div layout onClick={() => setModalView('tables')} className={`p-7 rounded-[2.5rem] border cursor-pointer hover:scale-[1.02] active:scale-95 transition-all shadow-lg ${lightMode ? 'bg-zinc-50/50 border-zinc-200' : 'bg-white/5 border-white/10'}`}>
                                    <div className="flex items-center justify-between mb-5 uppercase tracking-widest text-[10px] opacity-40 font-black">
                                      <span><TableIcon size={14} className="inline mr-2" /> Masa Seçimi & Merge</span>
                                      <ArrowRight size={14} className="text-blue-500" />
                                    </div>
                                    <div className="flex items-center gap-5">
                                      <div className="w-16 h-16 rounded-2xl bg-blue-500 text-white flex items-center justify-center font-black text-2xl shadow-xl shadow-blue-500/20">
                                        {selectedTableIds.length > 0 ? selectedTableIds.map(id => tables.find(t => t.id === id)?.table_number).join('+') : '?'}
                                      </div>
                                      <div className="flex flex-col">
                                        <span className="text-sm font-black tracking-tight">{selectedTableIds.length ? `${selectedTableIds.length} Masa seçildi` : 'Masa təyin edilməyib'}</span>
                                        <span className="text-[10px] opacity-40 font-bold uppercase tracking-wide">Zaldan masaları birləşdir</span>
                                      </div>
                                    </div>
                                  </motion.div>

                                  <motion.div layout onClick={goToPOSPreOrder} className={`p-7 rounded-[2.5rem] border cursor-pointer hover:scale-[1.02] active:scale-95 transition-all shadow-lg ${lightMode ? 'bg-zinc-50/50 border-zinc-200' : 'bg-white/5 border-white/10'}`}>
                                    <div className="flex items-center justify-between mb-5 uppercase tracking-widest text-[10px] opacity-40 font-black">
                                      <span><ShoppingBag size={14} className="inline mr-2" /> Öncədən Sifariş</span>
                                      <Zap size={14} className="text-amber-500" />
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="text-sm font-black tracking-tight">Sifariş Daxil Et</span>
                                      <span className="text-[10px] opacity-40 font-bold uppercase tracking-wide">Dərhal POS menyusuna keç</span>
                                    </div>
                                  </motion.div>
                                </div>

                                {/* Pre-order picker */}
                                <div className={`p-7 rounded-[2.5rem] border ${lightMode ? 'bg-zinc-50/50 border-zinc-200' : 'bg-white/5 border-white/10'}`}>
                                  <div className="flex items-center justify-between mb-4 uppercase tracking-widest text-[10px] opacity-40 font-black">
                                    <span><ShoppingBag size={14} className="inline mr-2" /> Öncədən Sifariş</span>
                                    {preOrderSaving && <span className="text-blue-400">Yaddaşa alınır…</span>}
                                  </div>

                                  {preOrderItems.length > 0 && (
                                    <div className="flex flex-col gap-2 mb-4">
                                      {preOrderItems.map(item => (
                                        <div key={item.product_id} className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3 bg-white/5">
                                          <span className="text-sm font-bold truncate">{item.product_name}</span>
                                          <div className="flex items-center gap-2 flex-shrink-0">
                                            <button onClick={() => changePreOrderQty(item.product_id, -1)} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center font-black">−</button>
                                            <span className="text-sm font-black tabular-nums w-6 text-center">{item.quantity}</span>
                                            <button onClick={() => changePreOrderQty(item.product_id, 1)} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center font-black">+</button>
                                            <button onClick={() => removePreOrderItem(item.product_id)} className="ml-1 text-red-400 hover:text-red-300"><Trash2 size={16} /></button>
                                          </div>
                                        </div>
                                      ))}
                                      <p className="text-xs font-bold opacity-60 text-right mt-1">
                                        Cəmi: {preOrderItems.reduce((s: number, i: any) => s + i.unit_price * i.quantity, 0).toFixed(2)} ₼
                                      </p>
                                    </div>
                                  )}

                                  <div className="flex flex-wrap gap-2 max-h-44 overflow-y-auto custom-scrollbar">
                                    {availableProducts.length === 0 && <p className="text-xs opacity-40">Məhsul yoxdur</p>}
                                    {availableProducts.map(p => (
                                      <button key={p.id} onClick={() => addPreOrderItem(p)} className="px-3 py-2 rounded-xl text-xs font-bold bg-white/5 hover:bg-gold hover:text-black transition-all flex items-center gap-2">
                                        <Plus size={12} /> {productName(p)} <span className="opacity-50">{(Number(p.price) || 0).toFixed(2)} ₼</span>
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                                  <div className="flex gap-4">
                                    {selectedRes.status === 'confirmed' && (
                                       <button onClick={() => handleGuestArrived(selectedRes.id)} className="flex-[2] py-6 rounded-[2.2rem] bg-amber-500 text-white font-black uppercase tracking-widest shadow-2xl shadow-amber-500/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3">
                                        <Users size={24} /> Qonaq Gəldi
                                      </button>
                                    )}
                                    {selectedRes.status === 'waiting' && (
                                       <button onClick={() => handleSendToKitchen(selectedRes.id)} className="flex-[2] py-6 rounded-[2.2rem] bg-blue-500 text-white font-black uppercase tracking-widest shadow-2xl shadow-blue-500/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3">
                                        <Zap size={24} /> Aşpaza Göndər
                                      </button>
                                    )}
                                    {selectedRes.status !== 'confirmed' && selectedRes.status !== 'waiting' && (
                                       <button onClick={() => handleConfirmReservation(selectedRes.id)} className="flex-[2] py-6 rounded-[2.2rem] bg-green-500 text-white font-black uppercase tracking-widest shadow-2xl shadow-green-500/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3">
                                        <CheckCircle size={24} /> Təsdiqlə
                                      </button>
                                    )}
                                  </div>
                                  
                                  <div className={`p-6 rounded-[2.5rem] flex items-center justify-center gap-4 ${lightMode ? 'bg-zinc-50/50' : 'bg-white/5'}`}>
                                    <Timer size={28} className="text-blue-500 animate-pulse" />
                                    <div className="flex flex-col">
                                      <span className="text-[9px] font-black uppercase opacity-40 leading-none mb-1">Bron Vaxtına Qalıb</span>
                                      <span className="text-2xl font-black tracking-tighter leading-none">{calculateTimeLeft(selectedRes.time, selectedRes.date)}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                       </motion.div>
                    </motion.div>
                  )}

                  {modalView === 'tables' && (
                    <motion.div key="table-grid-view" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="flex flex-col gap-8">
                       <div className="flex items-center gap-5">
                          <button onClick={() => setModalView('main')} className="p-4 rounded-full bg-white/5 hover:bg-white/10 transition-colors shadow-lg"><ChevronLeft size={28} /></button>
                          <div>
                             <h3 className="text-3xl font-black tracking-tighter leading-none mb-1">Zal & Masa Seçimi</h3>
                             <p className="text-xs font-black opacity-40 uppercase tracking-widest">Boş masaları seçib birləşdirin (Merge)</p>
                          </div>
                       </div>

                       <div className="flex gap-2 overflow-x-auto pb-4 custom-scrollbar">
                          {floors.map(f => (
                             <button key={f.id} onClick={() => setSelectedFloorName(f.name)} className={`px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${selectedFloorName === f.name ? 'bg-blue-500 text-white shadow-lg' : 'bg-white/5 opacity-50 hover:opacity-100'}`}>{f.name}</button>
                          ))}
                       </div>

                       <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4 max-h-[450px] overflow-y-auto pr-3 custom-scrollbar">
                          {tables
                            .filter(t => (t.floor_name || 'Zal 1') === selectedFloorName)
                            .filter(t => !t.status || t.status === 'empty' || selectedTableIds.includes(t.id))
                            .map(t => (
                             <button key={t.id} onClick={(e) => {
                                e.stopPropagation();
                                if (selectedTableIds.includes(t.id)) setSelectedTableIds(p => p.filter(id => id !== t.id));
                                else setSelectedTableIds(p => [...p, t.id]);
                             }} className={`aspect-square rounded-[2rem] border-3 flex flex-col items-center justify-center gap-1 transition-all ${selectedTableIds.includes(t.id) ? 'bg-blue-500 border-blue-500 text-white shadow-2xl scale-105' : 'bg-white/5 border-white/10 hover:border-blue-500/40'}`}>
                                <span className="text-2xl font-black">{t.table_number}</span>
                                <span className="text-[8px] font-black uppercase opacity-60">BOŞ</span>
                             </button>
                          ))}
                       </div>
                        <button onClick={() => setModalView('main')} className={`w-full py-6 rounded-[2.5rem] font-black uppercase tracking-widest shadow-2xl transition-all ${lightMode ? 'bg-zinc-900 text-white shadow-zinc-900/30' : 'bg-blue-500 text-white shadow-blue-500/30'}`}>Seçimi Təsdiqlə və Geri Qayıt</button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <UpsertReservationModal 
        open={upsertModalOpen} 
        onClose={() => { setUpsertModalOpen(false); setEditingReservation(null); }} 
        onSave={handleUpsert} 
        initialData={editingReservation} 
        loading={actionLoading} 
      />

      <DeleteReservationModal 
        reservation={confirmDeleteReservation} 
        onConfirm={() => confirmDeleteReservation ? handleDelete(confirmDeleteReservation.id) : Promise.resolve()} 
        onCancel={() => setConfirmDeleteReservation(null)} 
      />
      
      <ClearArchiveModal 
        open={confirmClearArchiveModal} 
        clearing={clearingArchive} 
        onConfirm={async () => {
          setClearingArchive(true);
          try {
            if (archiveSelectionMode && selectedArchiveIds.length > 0) {
              await apiFetch('/api/reservations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete_batch', ids: selectedArchiveIds }),
              });
              toast.success(`${selectedArchiveIds.length} rezervasiya silindi`);
              setSelectedArchiveIds([]);
              setArchiveSelectionMode(false);
            } else {
              await apiFetch('/api/reservations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete_batch', statuses: ['cancelled', 'archived', 'expired'] }),
              });
              toast.success('Arxiv təmizləndi');
            }
            fetchData();
          } catch (e: any) {
            toast.error(e.message || 'Silinmə xətası');
          } finally {
            setClearingArchive(false);
            setConfirmClearArchiveModal(false);
          }
        }}
        onCancel={() => setConfirmClearArchiveModal(false)} 
        title={t('delete_selected')} 
        description={t('archive_delete_confirm')} 
      />
    </div>
  );
}

