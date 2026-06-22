'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Reservation } from '@/types';
import { X, Users, Phone, ShoppingBag, Timer, Star, CheckCircle, Table as TableIcon, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import ReservationFilters from './components/ReservationFilters';
import { TableSkeleton } from '@/components/SkeletonLoader';
import { ReservationTableRow, ReservationCard } from './components/ReservationRow';
import { DeleteReservationModal, ClearArchiveModal } from './components/ReservationModals';

const ReservationsPage = () => {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  
  /* ─── State ─── */
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'cancelled'>('all');
  const [timeFilter, setTimeFilter] = useState<'today' | 'future' | 'archive'>('today');
  const [selectedRes, setSelectedRes] = useState<(Reservation & { visitCount?: number; preOrderItems?: any[] }) | null>(null);
  
  const [archiveSelectionMode, setArchiveSelectionMode] = useState(false);
  const [selectedArchiveIds, setSelectedArchiveIds] = useState<string[]>([]);
  const [confirmDeleteReservation, setConfirmDeleteReservation] = useState<{ id: string; guest: string } | null>(null);
  const [confirmClearArchiveModal, setConfirmClearArchiveModal] = useState(false);

  /* ─── Derived Visit Counts ─── */
  const resWithData = useMemo(() => {
    const counts: Record<string, number> = {};
    reservations.forEach(r => { counts[r.phone] = (counts[r.phone] || 0) + 1; });
    return reservations.map(r => ({ 
      ...r, 
      visitCount: counts[r.phone] || 1,
      preOrderItems: r.note?.toLowerCase().includes('preorder') ? [{ name: 'Saito Special Roll', quantity: 1, price: 24 }] : [] 
    }));
  }, [reservations]);

  /* ─── Data fetching ─── */
  const fetchReservations = async () => {
    try {
      const res = await fetch('/api/reservations');
      const data = await res.json();
      setReservations(data.reservations || []);
    } catch (error) {
      toast.error('Məlumat alınmadı');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReservations(); }, []);

  const updateStatus = async (id: string, status: 'confirmed' | 'cancelled') => {
    const { error } = await supabase.from('reservations').update({ status }).eq('id', id);
    if (!error) {
      toast.success(status === 'confirmed' ? 'Təsdiqləndi' : 'Ləğv edildi');
      fetchReservations();
    }
  };

  const deleteReservation = async (id: string) => {
    const { error } = await supabase.from('reservations').delete().eq('id', id);
    if (!error) {
      toast.success('Silindi');
      fetchReservations();
    }
  };

  /* ─── Filtering ─── */
  const filteredReservations = useMemo(() => {
    return resWithData.filter(res => {
      const matchesSearch = res.name.toLowerCase().includes(searchQuery.toLowerCase()) || res.phone.includes(searchQuery);
      const matchesStatus = statusFilter === 'all' || res.status === statusFilter;
      
      const resDate = new Date(res.date);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
      
      let matchesTime = false;
      if (timeFilter === 'today') matchesTime = resDate >= today && resDate < tomorrow;
      else if (timeFilter === 'future') matchesTime = resDate >= tomorrow;
      else matchesTime = resDate < today || res.status === 'expired';

      return matchesSearch && matchesStatus && matchesTime;
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [resWithData, searchQuery, statusFilter, timeFilter]);

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tighter">Rezervasiyalar</h1>
        <p className="opacity-40 text-[10px] font-black uppercase tracking-widest mt-1">Real-vaxt idarəetmə və müştəri analizi</p>
      </div>

      <ReservationFilters 
        timeFilter={timeFilter} 
        statusFilter={statusFilter} 
        searchQuery={searchQuery}
        todayPendingCount={resWithData.filter(r => {
           const d = new Date(r.date); const t = new Date(); t.setHours(0,0,0,0);
           return d.getTime() === t.getTime() && r.status === 'pending';
        }).length}
        futurePendingCount={resWithData.filter(r => new Date(r.date) > new Date() && r.status === 'pending').length}
        searchOpen={true}
        archiveSelectionMode={archiveSelectionMode}
        selectedArchiveCount={selectedArchiveIds.length}
        totalArchiveCount={filteredReservations.length}
        onTimeFilter={setTimeFilter}
        onStatusFilter={setStatusFilter}
        onSearch={setSearchQuery}
        onStartArchiveSelection={() => setArchiveSelectionMode(true)}
        onDeleteSelectedArchive={() => setConfirmClearArchiveModal(true)}
        onCancelArchiveSelection={() => setArchiveSelectionMode(false)}
        onSelectAll={() => {}}
      />

      {loading ? <TableSkeleton rows={6} /> : (
        <div className="mt-8">
          {/* Desktop Table */}
          <div className={`hidden md:block rounded-[2.5rem] border overflow-hidden shadow-2xl ${lightMode ? 'bg-white border-zinc-100' : 'bg-white/[0.02] border-white/[0.05]'}`}>
            <table className="w-full text-left">
              <thead className="opacity-40 text-[10px] font-black uppercase tracking-widest bg-black/5">
                <tr>
                  <th className="px-8 py-5 text-zinc-500">Qonaq</th>
                  <th className="px-8 py-5 text-zinc-500">Tarix & Saat</th>
                  <th className="px-8 py-5 text-center text-zinc-500">Nəfər</th>
                  <th className="px-8 py-5 text-zinc-500">Status</th>
                  <th className="px-8 py-5 text-zinc-500">Qeyd</th>
                  <th className="px-8 py-5 text-right text-zinc-500">Əməliyyat</th>
                </tr>
              </thead>
              <tbody>
                {filteredReservations.map(res => (
                  <ReservationTableRow 
                    key={res.id} res={res} timeFilter={timeFilter}
                    onSelect={setSelectedRes}
                    statusBadge={(s) => <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${s === 'confirmed' ? 'bg-green-500/10 text-green-500' : s === 'cancelled' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'}`}>{s}</span>}
                    onUpdateStatus={updateStatus} onDelete={(id) => deleteReservation(id)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-4">
            {filteredReservations.map(res => (
              <ReservationCard 
                key={res.id} res={res} timeFilter={timeFilter}
                onSelect={setSelectedRes}
                statusBadge={(s) => <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${s === 'confirmed' ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>{s}</span>}
                onUpdateStatus={updateStatus} onDelete={(id) => deleteReservation(id)}
              />
            ))}
          </div>

          {filteredReservations.length === 0 && (
            <div className="py-20 text-center opacity-20 font-black uppercase tracking-widest text-sm">Məlumat tapılmadı</div>
          )}
        </div>
      )}

      {/* Morphing Modal remains same but fixed structure */}
      <AnimatePresence>
        {selectedRes && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedRes(null)} className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md" />
            <motion.div
              layoutId={`reserv-${selectedRes.id}`}
              className={`fixed inset-0 m-auto z-[110] w-[95%] max-w-2xl h-fit max-h-[90vh] rounded-[3.5rem] shadow-[0_50px_100px_rgba(0,0,0,0.5)] border ${lightMode ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-white/10'}`}
            >
               <div className="p-10 relative">
                  <button onClick={() => setSelectedRes(null)} className="absolute top-8 right-10 p-2 opacity-40 hover:opacity-100 transition-opacity"><X size={24} /></button>
                  <motion.div layout="position">
                    <h2 className="text-4xl font-black tracking-tighter mb-2">{selectedRes.name}</h2>
                    <div className="flex gap-4 text-xs font-black opacity-40 uppercase tracking-widest mb-8">
                       <span>{selectedRes.phone}</span>
                       <span>{selectedRes.visitCount} Ziyarət</span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                       <div className={`p-6 rounded-[2.5rem] border ${lightMode ? 'bg-zinc-50 border-zinc-100' : 'bg-white/5 border-white/10'}`}>
                          <span className="text-[10px] font-black uppercase opacity-40 mb-4 block">Masa</span>
                          <div className="flex items-center gap-4">
                             <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center font-black text-xl">?</div>
                             <span className="font-bold">Seçilməyib</span>
                          </div>
                       </div>
                       <div className={`p-6 rounded-[2.5rem] border ${lightMode ? 'bg-zinc-50 border-zinc-100' : 'bg-white/5 border-white/10'}`}>
                          <span className="text-[10px] font-black uppercase opacity-40 mb-4 block">Pre-Order</span>
                          <div className="font-bold">Yoxdur</div>
                       </div>
                    </div>

                    <div className="flex gap-4">
                       <button onClick={() => { updateStatus(selectedRes.id, 'confirmed'); setSelectedRes(null); }} className="flex-[2] py-5 rounded-[2rem] bg-green-500 text-white font-black uppercase tracking-widest shadow-lg">Rezervi Təsdiqlə</button>
                       <button onClick={() => setSelectedRes(null)} className="flex-1 py-5 rounded-[2rem] bg-white/5 border border-white/10 font-black uppercase tracking-widest">Bağla</button>
                    </div>
                  </motion.div>
               </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <DeleteReservationModal reservation={confirmDeleteReservation} onConfirm={() => {}} onCancel={() => setConfirmDeleteReservation(null)} />
    </div>
  );
};

export default ReservationsPage;
