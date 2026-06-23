'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Reservation } from '@/types';
import { X, Users, Phone, Calendar, ShoppingBag, Timer, Star, CheckCircle, Table as TableIcon, Zap, ArrowRight, Clock, ChevronLeft, Plus, Trash2, LayoutGrid, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import ReservationFilters from './components/ReservationFilters';
import { TableSkeleton } from '@/components/SkeletonLoader';
import { ReservationTableRow } from './components/ReservationRow';

export default function ReservationsPage() {
  const { t, language } = useLanguage();
  const { lightMode } = useTheme();
  
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'cancelled'>('all');
  const [timeFilter, setTimeFilter] = useState<'today' | 'future' | 'archive'>('today');
  
  const [selectedRes, setSelectedRes] = useState<any | null>(null);
  const [modalView, setModalView] = useState<'main' | 'tables'>('main');
  
  const [tables, setTables] = useState<any[]>([]);
  const [floors, setFloors] = useState<any[]>([]);
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);

  const fetchAll = async () => {
    try {
      const { data: resData } = await supabase.from('reservations').select('*').order('date', { ascending: true });
      setReservations(resData || []);
      
      const { data: floorData } = await supabase.from('floors').select('*').order('sort_order', { ascending: true });
      const { data: tableData } = await supabase.from('table_floors').select('*');
      setFloors(floorData || []);
      setTables(tableData || []);
      if (floorData?.length) setSelectedFloorId(floorData[0].id);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);
  const fetchData = fetchAll;

  const calculateTimeLeft = (resTime: string) => {
    if (!resTime) return '00:00';
    const now = new Date();
    const [h, m] = resTime.split(':').map(Number);
    const target = new Date(); target.setHours(h, m, 0);
    const diff = target.getTime() - now.getTime();
    return diff < 0 ? 'Gəlib' : `${Math.floor(diff / 60000)} Dəq`;
  };

  const filteredReservations = useMemo(() => {
    return reservations.filter(res => {
      const matchesSearch = res.name.toLowerCase().includes(searchQuery.toLowerCase()) || res.phone.includes(searchQuery);
      const matchesStatus = statusFilter === 'all' || res.status === statusFilter;
      const resDate = new Date(res.date);
      const today = new Date(); today.setHours(0,0,0,0);
      if (timeFilter === 'today') return matchesSearch && matchesStatus && resDate.getTime() === today.getTime();
      if (timeFilter === 'future') return matchesSearch && matchesStatus && resDate > today;
      return matchesSearch && matchesStatus && (resDate < today || res.status === 'cancelled');
    });
  }, [reservations, searchQuery, statusFilter, timeFilter]);

  const handleConfirmReservation = async () => {
    if (selectedTableIds.length === 0) return toast.error("Masa seçilməyib");
    
    const { error } = await supabase.from('reservations').update({ 
      status: 'confirmed', 
      table_ids: selectedTableIds 
    }).eq('id', selectedRes.id);

    if (!error) {
      await Promise.all(selectedTableIds.map(id => 
        supabase.from('table_floors').update({ 
          status: 'reserved',
          reservation_name: selectedRes.name,
          reservation_time: selectedRes.time
        }).eq('id', id)
      ));
      toast.success("Bron edildi");
      setSelectedRes(null);
      fetchAll();
    }
  };

  const goToPreOrder = () => {
    if (selectedTableIds.length === 0) return toast.error("Əvvəlcə masa seçin");
    // Save state for POS page to pick up
    localStorage.setItem('saito_preorder_context', JSON.stringify({
      resId: selectedRes.id,
      tableIds: selectedTableIds,
      guestName: selectedRes.name,
      guestCount: selectedRes.guests
    }));
    window.location.href = '/admin/pos';
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col gap-6 mb-10">
        <h1 className="text-3xl font-black tracking-tighter">Rezervasiyalar</h1>
        <ReservationFilters 
          timeFilter={timeFilter} statusFilter={statusFilter} searchQuery={searchQuery}
          onTimeFilter={setTimeFilter} onStatusFilter={setStatusFilter} onSearch={setSearchQuery}
          todayPendingCount={filteredReservations.filter(r => r.status === 'pending').length}
          futurePendingCount={0} searchOpen={true} archiveSelectionMode={false} selectedArchiveCount={0} totalArchiveCount={0} onStartArchiveSelection={() => {}} onDeleteSelectedArchive={() => {}} onCancelArchiveSelection={() => {}} onSelectAll={() => {}}
        />
      </div>

      {loading ? <TableSkeleton rows={6} /> : (
        <div className={`rounded-[2.5rem] border overflow-hidden shadow-2xl ${lightMode ? 'bg-white border-zinc-100 shadow-zinc-200/50' : 'bg-[#0f0f0f] border-white/5 shadow-black/40'}`}>
          <table className="w-full text-left">
            <thead className="opacity-40 text-[10px] font-black uppercase tracking-widest bg-black/5">
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
                  onSelect={(r) => { setSelectedRes(r); setSelectedTableIds(r.table_ids || []); setModalView('main'); }}
                  statusBadge={(s) => <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${s === 'confirmed' ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>{s}</span>}
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
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedRes(null)} className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md" />
            <motion.div
              layoutId={`reserv-${selectedRes.id}`}
              className={`fixed inset-0 m-auto z-[110] w-[95%] max-w-2xl h-fit max-h-[90vh] overflow-hidden rounded-[3.5rem] shadow-[0_50px_100px_rgba(0,0,0,0.6)] border ${lightMode ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-zinc-900 border-white/10 text-white'}`}
            >
              <div className="p-10 flex flex-col gap-8 relative overflow-y-auto max-h-[90vh]">
                <button onClick={() => setSelectedRes(null)} className="absolute top-8 right-10 p-3 rounded-full bg-white/5 hover:bg-white/10"><X size={24} /></button>

                <AnimatePresence mode="wait">
                  {modalView === 'main' && (
                    <motion.div key="main" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="flex flex-col gap-8">
                       <div>
                          <h2 className="text-5xl font-black tracking-tighter mb-2 leading-none">{selectedRes.name}</h2>
                          <div className="flex gap-4 text-xs font-black opacity-40 uppercase tracking-widest">
                             <span className="flex items-center gap-1.5"><Phone size={14} className="text-blue-500" /> {selectedRes.phone}</span>
                             <span className="flex items-center gap-1.5"><Star size={14} className="text-blue-500" /> 1 Ziyarət</span>
                          </div>
                       </div>

                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div onClick={() => setModalView('tables')} className={`p-7 rounded-[2.5rem] border cursor-pointer hover:scale-[1.02] active:scale-95 transition-all shadow-lg ${lightMode ? 'bg-zinc-50 border-zinc-100' : 'bg-white/5 border-white/10'}`}>
                             <div className="flex items-center justify-between mb-5 font-black uppercase tracking-widest text-[10px] opacity-40">
                                <span><TableIcon size={14} className="inline mr-2" /> Masa Seçimi & Merge</span>
                                <ArrowRight size={14} className="text-blue-500" />
                             </div>
                             <div className="flex items-center gap-5">
                                <div className="w-16 h-16 rounded-2xl bg-blue-500 text-white flex items-center justify-center font-black text-2xl shadow-xl">
                                   {selectedTableIds.length || '?'}
                                </div>
                                <div className="flex flex-col">
                                   <span className="text-sm font-black">{selectedTableIds.length ? `${selectedTableIds.length} Masa seçildi` : 'Hələ təyin edilməyib'}</span>
                                   <span className="text-[10px] opacity-40 font-bold uppercase tracking-wide">Zaldan masaları birləşdir</span>
                                </div>
                             </div>
                          </div>

                          <div onClick={goToPreOrder} className={`p-7 rounded-[2.5rem] border cursor-pointer hover:scale-[1.02] active:scale-95 transition-all shadow-lg ${lightMode ? 'bg-zinc-50 border-zinc-100' : 'bg-white/5 border-white/10'}`}>
                             <div className="flex items-center justify-between mb-5 font-black uppercase tracking-widest text-[10px] opacity-40">
                                <span><ShoppingBag size={14} className="inline mr-2" /> Öncədən Sifariş</span>
                                <Zap size={14} className="text-amber-500" />
                             </div>
                             <div className="flex flex-col">
                                <span className="text-sm font-black">Sifariş Daxil Et</span>
                                <span className="text-[10px] opacity-40 font-bold uppercase tracking-wide">Dərhal POS menyusuna keç</span>
                             </div>
                          </div>
                       </div>

                       <div className="flex gap-4">
                          <button onClick={handleConfirmReservation} className="flex-[2] py-6 rounded-[2.2rem] bg-green-500 text-white font-black uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all">
                             <CheckCircle size={24} /> Rezervi Təsdiqlə
                          </button>
                          <button onClick={() => setSelectedRes(null)} className="flex-1 py-6 rounded-[2.2rem] font-black uppercase tracking-widest bg-white/5 border border-white/10">Bağla</button>
                       </div>
                    </motion.div>
                  )}

                  {modalView === 'tables' && (
                    <motion.div key="tables" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-6">
                       <div className="flex items-center gap-5">
                          <button onClick={() => setModalView('main')} className="p-4 rounded-full bg-white/5"><ChevronLeft size={28} /></button>
                          <h3 className="text-3xl font-black tracking-tighter">Zal & Masa Seçimi</h3>
                       </div>

                       <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                          {floors.map(f => (
                             <button key={f.id} onClick={() => setSelectedFloorId(f.id)} className={`px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${selectedFloorId === f.id ? 'bg-blue-500 text-white shadow-lg' : 'bg-white/5 opacity-50'}`}>{f.name}</button>
                          ))}
                       </div>

                       <div className="grid grid-cols-4 sm:grid-cols-5 gap-3 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                          {tables.filter(t => t.floor_id === selectedFloorId).map(t => (
                             <button key={t.id} disabled={t.status !== 'empty'} onClick={() => {
                                if (selectedTableIds.includes(t.id)) setSelectedTableIds(p => p.filter(id => id !== t.id));
                                else setSelectedTableIds(p => [...p, t.id]);
                             }} className={`aspect-square rounded-2xl border-2 flex flex-col items-center justify-center transition-all ${selectedTableIds.includes(t.id) ? 'bg-blue-500 border-blue-500 text-white shadow-2xl scale-105' : t.status === 'empty' ? 'bg-white/5 border-white/10' : 'opacity-20 grayscale'}`}>
                                <span className="text-xl font-black">{t.table_number}</span>
                                <span className="text-[8px] font-black uppercase opacity-60">{t.status}</span>
                             </button>
                          ))}
                       </div>
                       <button onClick={() => setModalView('main')} className="w-full py-5 rounded-[2rem] bg-zinc-900 text-white font-black uppercase tracking-widest shadow-xl">Seçimi Saxla</button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
