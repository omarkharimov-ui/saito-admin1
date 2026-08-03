'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Reservation } from '@/types';
import { X, Users, Phone, Calendar, Timer, Star, Clock, Plus, CheckCircle, Loader2, Utensils, LogIn } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '@/lib/toast';
import { useNotifications } from '../context/NotificationContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { apiFetch } from '@/lib/api-fetch';
import ReservationFilters from './components/ReservationFilters';
import { ReservationTableRow } from './components/ReservationRow';
import { DeleteReservationModal, UpsertReservationModal } from './components/ReservationModals';
import TablePicker from '@/components/ui/TablePicker';

export default function ReservationsPage() {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  const { clearNotifications } = useNotifications();
  const clearNotificationsRef = useRef(clearNotifications);
  clearNotificationsRef.current = clearNotifications;
  
  /* ─── State ─── */
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'cancelled' | 'no_show'>('all');
  const [timeFilter, setTimeFilter] = useState<'today' | 'future' | 'archive'>('today');
  
  const [selectedRes, setSelectedRes] = useState<any | null>(null);
  
  const [tables, setTables] = useState<any[]>([]);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);

  const [confirmDeleteReservation, setConfirmDeleteReservation] = useState<{ id: string; guest: string } | null>(null);

  // New states for CRUD
  const [upsertModalOpen, setUpsertModalOpen] = useState(false);
  const [editingReservation, setEditingReservation] = useState<any | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  /* ─── Data Fetching ─── */
  const fetchData = async () => {
    try {
      const res = await apiFetch('/api/reservations');
      const data = await res.json();
      
      if (data.reservations) {
        setReservations(data.reservations);
      }
      
      const { data: tData } = await supabase.from('table_floors').select('*');
      setTables(tData || []);
    } catch (error) {
      console.error(error);
      toast.error('Rezervasiya məlumatları yüklənərkən xəta', { id: 'action-toast' });
    } finally {
      setLoading(false);
    }
  };

  const selectReservation = async (r: any) => {
    setSelectedRes(r);
    const [rtData, poData] = await Promise.all([
      supabase.from('reservation_tables').select('table_number').eq('reservation_id', r.id),
      supabase.from('reservation_preorder_items').select('*').eq('reservation_id', r.id),
    ]);
    const tableNumbers = rtData.data?.map(t => t.table_number) || [];
    const ids = tables
      .filter(t => tableNumbers.includes(t.table_number))
      .map(t => t.id);
    setSelectedTableIds(ids);
    setPreorderItems(poData.data || []);
  };

  const closeReservation = () => {
    setSelectedRes(null);
    setReserveLoading(false);
    setPreorderItems([]);
    setSeatingLoading(null);
  };

  const [reserveLoading, setReserveLoading] = useState(false);
  const [preorderItems, setPreorderItems] = useState<any[]>([]);
  const [seatingLoading, setSeatingLoading] = useState<string | null>(null);

  const handleReserveTables = async () => {
    if (!selectedRes || selectedTableIds.length === 0) {
      toast.error('Əvvəlcə masa seçin');
      return;
    }
    setReserveLoading(true);
    try {
      const res = await apiFetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          id: selectedRes.id,
          data: {
            customer_name: selectedRes.customer_name || selectedRes.name,
            phone: selectedRes.phone,
            date: selectedRes.date,
            time: selectedRes.time,
            guests: selectedRes.guests,
            is_vip: selectedRes.is_vip,
            table_ids: selectedTableIds,
          }
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Rezerv edilə bilmədi');
      }
      toast.success('Masalar rezerv edildi');
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setReserveLoading(false);
    }
  };

  const handleSeatGuest = async () => {
    if (!selectedRes) return;
    setSeatingLoading(selectedRes.id);
    try {
      const { data, error } = await supabase.rpc('seat_guests_atomic', {
        p_reservation_id: selectedRes.id,
        p_performed_by: null,
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error('seat_guests_atomic failed');
      toast.success('Qonaq gəldi — masa açıldı');
      closeReservation();
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Xəta');
    } finally {
      setSeatingLoading(null);
    }
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
          status: editingReservation?.status || 'pending',
          is_vip: formData.is_vip,
          table_ids: formData.table_ids,
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
      
      if (timeFilter === 'today') return matchesSearch && matchesStatus && res.date === todayStr && res.status !== 'cancelled' && res.status !== 'no_show';
      if (timeFilter === 'future') return matchesSearch && matchesStatus && res.date > todayStr && res.status !== 'cancelled' && res.status !== 'no_show';
      if (timeFilter === 'archive') return matchesSearch && matchesStatus && (res.status === 'cancelled' || res.status === 'no_show' || res.status === 'completed');
      
      return matchesSearch && matchesStatus;
    }).sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.time.localeCompare(b.time);
    });
  }, [reservations, searchQuery, statusFilter, timeFilter]);


  const handleDelete = async (id: string) => {
    try {
      await apiFetch('/api/reservations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id }) });
      toast.success('Rezervasiya silindi');
      fetchData();
    } catch (e: any) { toast.error(e.message); }
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
          futurePendingCount={0} searchOpen={true}
        />
      </div>

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
                  onSelect={(r) => { selectReservation(r); }}
                  statusBadge={(s) => {
                    const colors: Record<string, string> = {
                      pending: 'bg-amber-500/10 text-amber-500',
                      confirmed: 'bg-green-500/10 text-green-500',
                      seated: 'bg-blue-500/10 text-blue-400',
                      completed: 'bg-emerald-500/10 text-emerald-400',
                      cancelled: 'bg-red-500/10 text-red-500',
                      no_show: 'bg-zinc-500/10 text-zinc-500',
                    };
                    return <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${colors[s] || 'bg-zinc-500/10 text-zinc-500'}`}>{s.replace('_', ' ')}</span>
                  }}
                  onEdit={(r) => { setEditingReservation(r); setUpsertModalOpen(true); }}
                  onDelete={(id, guest) => setConfirmDeleteReservation({ id, guest })}
                />
              ))}
            </tbody>
          </table>
        </div>

      <AnimatePresence>
        {selectedRes && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => closeReservation()} className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md" />
              <motion.div
                initial={{ opacity: 0, y: 60, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 40, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 35, mass: 0.9 }}
                className={`fixed inset-0 m-auto z-[110] w-[95%] max-w-2xl h-fit max-h-[90vh] overflow-hidden rounded-[3.5rem] shadow-[0_50px_100px_rgba(0,0,0,0.4)] border border-white/20 backdrop-blur-3xl ${lightMode ? 'bg-white/90 text-zinc-900' : 'bg-zinc-900/90 text-white'}`}
            >
              <div className="p-10 relative overflow-y-auto max-h-[90vh] custom-scrollbar">
                <button onClick={() => closeReservation()} className="absolute top-8 right-10 p-3 rounded-full bg-white/5 hover:bg-white/10 transition-colors"><X size={24} /></button>

                <div className="flex flex-col gap-6">
                  <div>
                    <h2 className="text-5xl font-black tracking-tighter mb-2 leading-none">{selectedRes.name}</h2>
                    <div className="flex gap-4 text-xs font-black opacity-40 uppercase tracking-widest mb-2">
                      <span className="flex items-center gap-1.5 text-blue-500"><Phone size={14} /> {selectedRes.phone}</span>
                      <span className="flex items-center gap-1.5"><Star size={14} /> {selectedRes.visitCount} Ziyarət</span>
                    </div>
                    <div className="flex flex-wrap gap-3">
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
                  </div>

                  <div className={`p-5 rounded-[2rem] border ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/5 border-white/10'}`}>
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-3 block">Masalar</label>
                    <TablePicker
                      tables={tables}
                      selectedTableIds={selectedTableIds}
                      onChange={setSelectedTableIds}
                    />
                  </div>

                  {preorderItems.length > 0 && (
                    <div className={`p-5 rounded-[2rem] border ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/5 border-white/10'}`}>
                      <label className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-3 flex items-center gap-2">
                        <Utensils size={12} /> Öncədən Sifariş
                      </label>
                      <div className="flex flex-col gap-2">
                        {preorderItems.map((item: any, idx: number) => (
                          <div key={item.id || idx} className="flex items-center justify-between text-sm">
                            <span className="font-medium">{item.product_name} <span className="opacity-50">x{item.quantity}</span></span>
                            <span className="font-bold">{(item.quantity * item.unit_price).toFixed(2)}₼</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3 items-center">
                    <div className={`flex items-center justify-center gap-3 p-4 rounded-[2rem] ${lightMode ? 'bg-zinc-50' : 'bg-white/5'}`}>
                      <Timer size={22} className="text-blue-500 animate-pulse" />
                      <div className="flex flex-col">
                        <span className="text-[8px] font-black uppercase opacity-40 leading-none mb-1">Qalıb</span>
                        <span className="text-base font-black tracking-tighter leading-none">{calculateTimeLeft(selectedRes.time, selectedRes.date)}</span>
                      </div>
                    </div>
                    <button
                      onClick={handleReserveTables}
                      disabled={reserveLoading || selectedTableIds.length === 0}
                      className="py-4 rounded-[2rem] bg-gold text-black text-[10px] font-black uppercase tracking-widest shadow-2xl shadow-gold/20 hover:brightness-110 active:scale-[0.97] transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {reserveLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={16} />}
                      Rezerv Et
                    </button>
                    <button
                      onClick={handleSeatGuest}
                      disabled={seatingLoading === selectedRes.id}
                      className={`py-4 rounded-[2rem] text-xs font-black uppercase tracking-widest shadow-2xl hover:brightness-110 active:scale-[0.97] transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${selectedRes.status === 'pending' || selectedRes.status === 'confirmed' ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-white/5 text-white/30'}`}
                    >
                      {seatingLoading === selectedRes.id ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={16} />}
                      Gəldi
                    </button>
                  </div>
                </div>
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
        tables={tables}
      />

      <DeleteReservationModal 
        reservation={confirmDeleteReservation} 
        onConfirm={() => confirmDeleteReservation ? handleDelete(confirmDeleteReservation.id) : Promise.resolve()} 
        onCancel={() => setConfirmDeleteReservation(null)} 
      />
    </div>
  );
}

