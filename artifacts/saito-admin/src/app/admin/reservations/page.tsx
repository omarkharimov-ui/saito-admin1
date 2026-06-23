'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Reservation } from '@/types';
import { X, Users, Phone, Calendar, ShoppingBag, Timer, Star, CheckCircle, Table as TableIcon, Zap, ArrowRight, Clock, ChevronLeft, Plus, Trash2, LayoutGrid, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '@/lib/toast';
import { useNotifications } from '../context/NotificationContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import ReservationFilters from './components/ReservationFilters';
import { TableSkeleton } from '@/components/SkeletonLoader';
import { ReservationTableRow, ReservationCard } from './components/ReservationRow';
import { DeleteReservationModal, ClearArchiveModal } from './components/ReservationModals';

export default function ReservationsPage() {
  const { t, language } = useLanguage();
  const { lightMode } = useTheme();
  const { clearNotifications } = useNotifications();
  
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'cancelled'>('all');
  const [timeFilter, setTimeFilter] = useState<'today' | 'future' | 'archive'>('today');
  
  const [selectedRes, setSelectedRes] = useState<any | null>(null);
  const [modalView, setModalView] = useState<'main' | 'tables'>('main');
  
  const [tables, setTables] = useState<any[]>([]);
  const [floors, setFloors] = useState<any[]>([]);
  const [selectedFloorName, setSelectedFloorName] = useState<string | null>(null);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);

  const [archiveSelectionMode, setArchiveSelectionMode] = useState(false);
  const [selectedArchiveIds, setSelectedArchiveIds] = useState<string[]>([]);
  const [confirmDeleteReservation, setConfirmDeleteReservation] = useState<{ id: string; guest: string } | null>(null);
  const [confirmClearArchiveModal, setConfirmClearArchiveModal] = useState(false);
  const [clearingArchive, setClearingArchive] = useState(false);

  const fetchData = async () => {
    try {
      const { data: resData } = await supabase.from('reservations').select('*').order('date', { ascending: true });
      const { data: tData } = await supabase.from('table_floors').select('*');
      
      setReservations(resData || []);
      setTables(tData || []);

      const uniqueFloors = Array.from(new Set((tData || []).map(t => t.floor_name || 'Zal 1')));
      const floorObjects = uniqueFloors.map(name => ({ id: name, name }));
      setFloors(floorObjects);
      
      if (!selectedFloorName && uniqueFloors.length > 0) {
        setSelectedFloorName(uniqueFloors[0]);
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

  const calculateTimeLeft = (resTime: string) => {
    if (!resTime) return '00:00';
    const now = new Date();
    const [h, m] = resTime.split(':').map(Number);
    const target = new Date(); target.setHours(h, m, 0);
    const diff = target.getTime() - now.getTime();
    if (diff < 0) return 'Gəlib';
    return `${Math.floor(diff / 60000)} Dəq`;
  };

  const resWithData = useMemo(() => {
    const counts: Record<string, number> = {};
    reservations.forEach(r => { counts[r.phone] = (counts[r.phone] || 0) + 1; });
    return reservations.map(r => ({ ...r, visitCount: counts[r.phone] || 1 }));
  }, [reservations]);

  const filteredReservations = useMemo(() => {
    return resWithData.filter(res => {
      const matchesSearch = res.name.toLowerCase().includes(searchQuery.toLowerCase()) || res.phone.includes(searchQuery);
      const matchesStatus = statusFilter === 'all' || res.status === statusFilter;
      const resDate = new Date(res.date);
      const today = new Date(); today.setHours(0,0,0,0);
      if (timeFilter === 'today') return matchesSearch && matchesStatus && resDate.getTime() === today.getTime();
      if (timeFilter === 'future') return matchesSearch && matchesStatus && resDate > today;
      return matchesSearch && matchesStatus && (resDate < today || res.status === 'cancelled');
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [resWithData, searchQuery, statusFilter, timeFilter]);

  const handleConfirmReservation = async () => {
    if (selectedTableIds.length === 0) return toast.error("Zəhmət olmasa masa seçin");
    const { error } = await supabase.from('reservations').update({ status: 'confirmed', table_ids: selectedTableIds }).eq('id', selectedRes.id);
    if (!error) {
      await Promise.all(selectedTableIds.map(id => 
        supabase.from('table_floors').update({ 
          status: 'reserved',
          reservation_name: selectedRes.name,
          reservation_time: selectedRes.time,
          guest_count: selectedRes.guests
        }).eq('id', id)
      ));
      toast.success("Rezervasiya və POS sinxronizasiya edildi");
      setSelectedRes(null);
      fetchData();
    }
  };

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
        <h1 className="text-4xl font-black tracking-tighter">Rezervasiyalar</h1>
        <ReservationFilters 
          timeFilter={timeFilter} statusFilter={statusFilter} searchQuery={searchQuery}
          onTimeFilter={setTimeFilter} onStatusFilter={setStatusFilter} onSearch={setSearchQuery}
          todayPendingCount={filteredReservations.filter(r => r.status === 'pending').length}
          futurePendingCount={0} searchOpen={true} archiveSelectionMode={archiveSelectionMode}
          selectedArchiveCount={selectedArchiveIds.length} totalArchiveCount={filteredReservations.length}
          onStartArchiveSelection={() => setArchiveSelectionMode(true)}
          onDeleteSelectedArchive={() => setConfirmClearArchiveModal(true)}
          onCancelArchiveSelection={() => setArchiveSelectionMode(false)}
          onSelectAll={() => {}}
        />
      </div>

      {loading ? <TableSkeleton rows={8} /> : (
        <div className={`rounded-[3rem] border overflow-hidden shadow-2xl ${lightMode ? 'bg-white border-zinc-100 shadow-zinc-200/50' : 'bg-[#0f0f0f] border-white/5 shadow-black/40'}`}>
          <table className="w-full text-left">
            <thead className="opacity-30 text-[10px] font-black uppercase tracking-widest bg-black/5">
              <tr>
                <th className="px-8 py-5">Qonaq</th>
                <th className="px-8 py-5">Tarix & Saat</th>
                <th className="px-8 py-5 text-center">Nəfər</th>
                <th className="px-8 py-5">Status</th>
                <th className="px-8 py-5 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {filteredReservations.map(res => (
                <ReservationTableRow 
                  key={res.id} res={res} timeFilter={timeFilter} 
                  onSelect={(r) => { setSelectedRes(r); setModalView('main'); setSelectedTableIds(r.table_ids || []); }}
                  statusBadge={(s) => <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${s === 'confirmed' ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>{s}</span>}
                  onUpdateStatus={() => {}} onDelete={() => {}}
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
              layout
              layoutId={`reserv-${selectedRes.id}`}
              transition={{ type: 'spring', stiffness: 350, damping: 32 }}
              className={`fixed inset-0 m-auto z-[110] w-[95%] h-fit max-h-[90vh] overflow-hidden rounded-[3.5rem] shadow-[0_50px_100px_rgba(0,0,0,0.4)] border border-white/20 backdrop-blur-3xl ${lightMode ? 'bg-white/90 text-zinc-900' : 'bg-zinc-900/90 text-white'} ${modalView === 'main' ? 'max-w-2xl' : 'max-w-4xl'}`}
            >
              <div className="p-10 relative overflow-y-auto max-h-[90vh] custom-scrollbar">
                <button onClick={() => setSelectedRes(null)} className="absolute top-8 right-10 p-3 rounded-full bg-white/5 hover:bg-white/10 transition-colors"><X size={24} /></button>

                <AnimatePresence mode="wait">
                  {modalView === 'main' && (
                    <motion.div key="main-view" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="flex flex-col gap-8">
                       <motion.div layout="position">
                          <h2 className="text-5xl font-black tracking-tighter mb-2 leading-none">{selectedRes.name}</h2>
                          <div className="flex gap-4 text-xs font-black opacity-40 uppercase tracking-widest mb-10">
                             <span className="flex items-center gap-1.5 text-blue-500"><Phone size={14} /> {selectedRes.phone}</span>
                             <span className="flex items-center gap-1.5"><Star size={14} /> {selectedRes.visitCount} Ziyarət</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
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
                                <button onClick={() => setSelectedRes(null)} className="flex-1 py-6 rounded-[2.2rem] font-black uppercase tracking-widest bg-white/5 border border-white/10 text-[var(--theme-text-muted)]">Bağla</button>
                             </div>
                             
                             <div className={`p-6 rounded-[2.5rem] flex items-center justify-center gap-4 ${lightMode ? 'bg-zinc-50/50' : 'bg-white/5'}`}>
                                <Timer size={28} className="text-blue-500 animate-pulse" />
                                <div className="flex flex-col">
                                   <span className="text-[9px] font-black uppercase opacity-40 leading-none mb-1">Bron Vaxtına Qalıb</span>
                                   <span className="text-2xl font-black tracking-tighter leading-none">{calculateTimeLeft(selectedRes.time)}</span>
                                </div>
                             </div>
                          </div>
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
                            .filter(t => t.floor_name === selectedFloorName || (!t.floor_name && (selectedFloorName === 'Zal 1' || selectedFloorName === floors[0]?.name)))
                            .filter(t => t.status === 'empty' || selectedTableIds.includes(t.id))
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
                       <button onClick={() => setModalView('main')} className="w-full py-6 rounded-[2.5rem] bg-zinc-900 text-white font-black uppercase tracking-widest shadow-2xl shadow-black/40 hover:brightness-110 active:scale-98 transition-all">Seçimi Təsdiqlə və Geri Qayıt</button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <DeleteReservationModal reservation={confirmDeleteReservation} onConfirm={() => {}} onCancel={() => setConfirmDeleteReservation(null)} />
      <ClearArchiveModal open={confirmClearArchiveModal} clearing={clearingArchive} onConfirm={() => {}} onCancel={() => setConfirmClearArchiveModal(false)} title={t('delete_selected')} description={t('archive_delete_confirm')} />
    </div>
  );
}
