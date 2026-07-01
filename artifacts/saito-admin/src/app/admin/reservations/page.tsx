'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Reservation } from '@/types';
import { X, Users, Phone, Calendar, ShoppingBag, Timer, Star, CheckCircle, Table as TableIcon, Zap, ArrowRight, Clock, ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '@/lib/toast';
import { useNotifications } from '../context/NotificationContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import ReservationFilters from './components/ReservationFilters';
import { TableSkeleton } from '@/components/SkeletonLoader';
import { ReservationTableRow, ReservationCard } from './components/ReservationRow';
import { DeleteReservationModal, ClearArchiveModal, UpsertReservationModal } from './components/ReservationModals';

export default function ReservationsPage() {
  const { t, language } = useLanguage();
  const { lightMode } = useTheme();
  const { clearNotifications } = useNotifications();
  
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
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    clearNotifications();
  }, []);

  /* ─── Realtime: sync with POS / other sources ─── */
  useEffect(() => {
    const channel = createRealtimeChannel('reservations-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_floors' }, () => fetchData())
      .subscribe();
    return () => { removeRealtimeChannel(channel); };
  }, []);

  /* ─── Auto-Release Expired Reservations ─── */
  useEffect(() => {
    const checkExpired = async () => {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      
      const expiredRes = reservations.filter(res => 
        (res.status === 'confirmed' || res.status === 'pending') && 
        res.date <= todayStr &&
        res.time && 
        (() => {
          const [h, m] = res.time.split(':').map(Number);
          const resTime = new Date();
          resTime.setHours(h, m, 0);
          const diff = (now.getTime() - resTime.getTime()) / 60000;
          return diff > 30;
        })()
      );

      for (const res of expiredRes) {
        await updateStatus(res.id, 'expired');
        toast.success(`${res.name} vaxtı keçdiyi üçün avtomatik ləğv edildi`, { id: `expire-${res.id}` });
      }
    };

    const interval = setInterval(checkExpired, 60000);
    return () => clearInterval(interval);
  }, [reservations]);

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

      const res = await fetch('/api/reservations', {
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

  const updateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch('/api/reservations/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Status update failed');
      toast.success(`Status: ${status}`);
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    }
  };


  const handleDelete = async () => {
    if (!confirmDeleteReservation) return;
    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: confirmDeleteReservation.id }),
      });
      if (!res.ok) throw new Error('Silinmə zamanı xəta');
      toast.success('Rezervasiya silindi');
      setConfirmDeleteReservation(null);
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleArchive = async (id: string) => {
    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive', id }),
      });
      if (!res.ok) throw new Error('Arxivləmə zamanı xəta');
      toast.success('Rezervasiya arxivləndi');
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleRestore = async (id: string) => {
    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', id }),
      });
      if (!res.ok) throw new Error('Bərpa zamanı xəta');
      toast.success('Rezervasiya bərpa edildi');
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleConfirmReservation = async () => {
    if (!selectedRes) return;
    if (selectedTableIds.length === 0) return toast.error("Zəhmət olmasa masa seçin");

    // Capacity validation (Assuming average 4 guests per table if capacity field missing)
    const totalCapacity = selectedTableIds.length * 4; 
    if (selectedRes.guests > totalCapacity) {
      return toast.error(`Seçilmiş ${selectedTableIds.length} masa ${selectedRes.guests} nəfər üçün yetərli deyil.`);
    }

    try {
      const res = await fetch('/api/reservations/reserve-table', {

        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservation_id: selectedRes.id,
          table_ids: selectedTableIds,
          // Eger artiq pre_order_items varsa onlari da gonder
          pre_order_items: selectedRes.pre_order_items
            ? (typeof selectedRes.pre_order_items === 'string'
                ? JSON.parse(selectedRes.pre_order_items)
                : selectedRes.pre_order_items)
            : [],
          guest_count: selectedRes.guests ?? 0,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Bron xetasi');
      }

      toast.success(`${selectedRes.name} ucun masalar bron edildi!`);
      setSelectedRes(null);
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
    if (selectedTableIds.length === 0) return toast.error("Əvvəlcə masanı təyin edin");
    localStorage.setItem('saito_pos_preorder_context', JSON.stringify({
      resId: selectedRes.id,
      tableIds: selectedTableIds,
      guestName: selectedRes.name,
      tablesLabel: selectedTableIds.map(id => tables.find(t => t.id === id)?.table_number).join(' + ')
    }));
    window.location.href = '/admin/pos';
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
                  onSelect={(r) => { setSelectedRes(r); setModalView('main'); setSelectedTableIds(r.table_ids || []); }}
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
                    return <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${colors[s] || 'bg-zinc-500/10 text-zinc-500'}`}>{s.replace('_', ' ')}</span>
                  }}
                  onUpdateStatus={updateStatus} 
                  onEdit={(r) => { setEditingReservation(r); setUpsertModalOpen(true); }}
                  onDelete={(id, guest) => setConfirmDeleteReservation({ id, guest })}
                  onArchive={handleArchive}
                  onRestore={handleRestore}
                  onHandle={(r) => { setSelectedRes(r); setModalView('tables'); setSelectedTableIds(r.table_ids || []); }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}


      <AnimatePresence>
        {selectedRes && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedRes(null)} className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md" />
              <motion.div
                initial={{ opacity: 0, y: 60, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 40, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 35, mass: 0.9 }}
                className={`fixed inset-0 m-auto z-[110] w-[95%] h-fit max-h-[90vh] overflow-hidden rounded-[3.5rem] shadow-[0_50px_100px_rgba(0,0,0,0.4)] border border-white/20 backdrop-blur-3xl ${lightMode ? 'bg-white/90 text-zinc-900' : 'bg-zinc-900/90 text-white'} ${modalView === 'main' ? 'max-w-2xl' : 'max-w-4xl'}`}
            >
              <div className="p-10 relative overflow-y-auto max-h-[90vh] custom-scrollbar">
                <button onClick={() => setSelectedRes(null)} className="absolute top-8 right-10 p-3 rounded-full bg-white/5 hover:bg-white/10 transition-colors"><X size={24} /></button>

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

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                                  <div className="flex gap-4">
                                    <button onClick={handleConfirmReservation} className="flex-[2] py-6 rounded-[2.2rem] bg-green-500 text-white font-black uppercase tracking-widest shadow-2xl shadow-green-500/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3">
                                      <CheckCircle size={24} /> Təsdiqlə
                                    </button>
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
        onConfirm={handleDelete} 
        onCancel={() => setConfirmDeleteReservation(null)} 
      />
      
      <ClearArchiveModal 
        open={confirmClearArchiveModal} 
        clearing={clearingArchive} 
        onConfirm={async () => {
          // Logic for clearing all archive or selected
          setClearingArchive(true);
          try {
             // Permanent delete of cancelled/archived
             const { error } = await supabase.from('reservations').delete().in('status', ['cancelled', 'archived', 'expired']);
             if (error) throw error;
             toast.success('Arxiv təmizləndi');
             fetchData();
          } catch (e: any) {
             toast.error(e.message);
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

