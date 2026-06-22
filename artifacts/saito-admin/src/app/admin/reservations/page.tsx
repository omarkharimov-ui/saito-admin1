'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Reservation } from '@/types';
import { X, Users, Phone, Clock, ShoppingBag, Timer, Star, CheckCircle, Table as TableIcon, Zap, ArrowRight } from 'lucide-react';
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
  
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'cancelled'>('all');
  const [timeFilter, setTimeFilter] = useState<'today' | 'future' | 'archive'>('today');
  const [selectedRes, setSelectedRes] = useState<any | null>(null);
  
  const [availableTables, setTables] = useState<any[]>([]);
  const [selectingTable, setSelectingTable] = useState(false);
  const [archiveSelectionMode, setArchiveSelectionMode] = useState(false);
  const [selectedArchiveIds, setSelectedArchiveIds] = useState<string[]>([]);
  const [confirmDeleteReservation, setConfirmDeleteReservation] = useState<{ id: string; guest: string } | null>(null);
  const [confirmClearArchiveModal, setConfirmClearArchiveModal] = useState(false);

  const resWithData = useMemo(() => {
    const counts: Record<string, number> = {};
    reservations.forEach(r => { counts[r.phone] = (counts[r.phone] || 0) + 1; });
    return reservations.map(r => ({ 
      ...r, 
      visitCount: counts[r.phone] || 1,
      preOrderItems: r.note?.toLowerCase().includes('preorder') ? [{ name: 'Saito Special Roll', quantity: 1, price: 24 }] : [] 
    }));
  }, [reservations]);

  const fetchAll = async () => {
    try {
      const res = await fetch('/api/reservations');
      const data = await res.json();
      setReservations(data.reservations || []);
      const { data: t } = await supabase.from('table_floors').select('*');
      setTables(t || []);
    } catch (error) {
      toast.error('Məlumat alınmadı');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const updateStatus = async (id: string, status: 'confirmed' | 'cancelled') => {
    const { error } = await supabase.from('reservations').update({ status }).eq('id', id);
    if (!error) {
      toast.success(status === 'confirmed' ? 'Təsdiqləndi' : 'Ləğv edildi');
      fetchAll();
    }
  };

  const getAIInsight = (res: any) => {
    const note = (res.note || "").toLowerCase();
    if (note.includes('allergiya')) return `DİQQƏT: Qonağın allergiyası var, mətbəxi məlumatlandırın!`;
    if (res.visitCount > 5) return `Bu qonaq daimi müştəridir. Adətən lüks masaları və Saito Special Roll sevir.`;
    if (res.visitCount === 1) return `Bu qonağın ilk ziyarətidir. Masaya xoş gəldiniz ikramı təklif oluna bilər.`;
    return `Bu qonaq adətən Saito Special Roll sifariş edir və pəncərə kənarındakı masaları sevir.`;
  };

  const filteredReservations = useMemo(() => {
    return resWithData.filter(res => {
      const matchesSearch = res.name.toLowerCase().includes(searchQuery.toLowerCase()) || res.phone.includes(searchQuery);
      const matchesStatus = statusFilter === 'all' || res.status === statusFilter;
      const resDate = new Date(res.date);
      const today = new Date(); today.setHours(0,0,0,0);
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
        timeFilter={timeFilter} statusFilter={statusFilter} searchQuery={searchQuery}
        todayPendingCount={resWithData.filter(r => r.status === 'pending').length}
        futurePendingCount={0} searchOpen={true} archiveSelectionMode={archiveSelectionMode}
        selectedArchiveCount={selectedArchiveIds.length} totalArchiveCount={filteredReservations.length}
        onTimeFilter={setTimeFilter} onStatusFilter={setStatusFilter} onSearch={setSearchQuery}
        onStartArchiveSelection={() => setArchiveSelectionMode(true)}
        onDeleteSelectedArchive={() => setConfirmClearArchiveModal(true)}
        onCancelArchiveSelection={() => setArchiveSelectionMode(false)}
        onSelectAll={() => {}}
      />

      {loading ? <TableSkeleton rows={6} /> : (
        <div className="mt-8">
          <div className={`rounded-[2.5rem] border overflow-hidden shadow-2xl ${lightMode ? 'bg-white border-zinc-100 shadow-zinc-200/50' : 'bg-white/[0.02] border-white/[0.05] shadow-black/40'}`}>
            <table className="w-full text-left">
              <thead className="opacity-40 text-[10px] font-black uppercase tracking-widest bg-black/5">
                <tr>
                  <th className="px-8 py-5">Qonaq</th>
                  <th className="px-8 py-5">Tarix & Saat</th>
                  <th className="px-8 py-5 text-center">Nəfər</th>
                  <th className="px-8 py-5">Status</th>
                  <th className="px-8 py-5">Qeyd</th>
                  <th className="px-8 py-5 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {filteredReservations.map(res => (
                  <ReservationTableRow 
                    key={res.id} res={res} timeFilter={timeFilter}
                    onSelect={setSelectedRes}
                    statusBadge={(s) => <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${s === 'confirmed' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'}`}>{s}</span>}
                    onUpdateStatus={updateStatus} onDelete={() => {}}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* THE LUXURY MORPHING MODAL - RESTORED */}
      <AnimatePresence>
        {selectedRes && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedRes(null)} className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md" />
            <motion.div
              layoutId={`reserv-${selectedRes.id}`}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              className={`fixed inset-0 m-auto z-[110] w-[95%] max-w-2xl h-fit max-h-[90vh] overflow-hidden rounded-[3.5rem] shadow-[0_50px_100px_rgba(0,0,0,0.5)] border ${lightMode ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-white/10'}`}
            >
              <div className="p-10 flex flex-col gap-8 overflow-y-auto max-h-[90vh]">
                <button onClick={() => setSelectedRes(null)} className="absolute top-8 right-10 p-3 rounded-full bg-white/5 hover:bg-white/10 transition-colors"><X size={24} /></button>

                <motion.div layout="position" className="flex items-start justify-between mt-4">
                  <div className="flex flex-col gap-2">
                    <h2 className="text-4xl font-black tracking-tighter">{selectedRes.name}</h2>
                    <div className="flex items-center gap-4 text-xs font-black opacity-50 uppercase tracking-widest">
                       <span className="flex items-center gap-1.5"><Phone size={14} className="text-blue-500" /> {selectedRes.phone}</span>
                       <span className="flex items-center gap-1.5"><Star size={14} className="text-blue-500" /> {selectedRes.visitCount} Ziyarət</span>
                    </div>
                  </div>
                  <div className={`p-6 rounded-[2.5rem] flex flex-col items-center justify-center ${lightMode ? 'bg-zinc-50' : 'bg-white/5'}`}>
                    <Timer size={24} className="text-blue-500 mb-1" />
                    <span className="text-[10px] font-black uppercase opacity-40 leading-none">Gözlənilir</span>
                    <span className="text-xl font-black tracking-tighter">45 Dəq</span>
                  </div>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <motion.div layout="position" onClick={() => setSelectingTable(!selectingTable)} className={`p-6 rounded-[2.5rem] border cursor-pointer transition-all ${selectingTable ? 'ring-2 ring-blue-500' : ''} ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/5 border-white/5'}`}>
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-40 flex items-center gap-2"><TableIcon size={14} /> Masa Bağlantısı</span>
                        <span className="text-[8px] font-black text-blue-500 uppercase tracking-widest">Zalı Aç</span>
                      </div>
                      {!selectingTable ? (
                        <div className="flex items-center gap-4">
                           <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 font-black text-2xl">{selectedRes.table_number || '?'}</div>
                           <div className="flex flex-col">
                              <span className="text-sm font-bold">{selectedRes.table_number ? `Masa ${selectedRes.table_number}` : 'Hələ təyin edilməyib'}</span>
                              <span className="text-[11px] opacity-50">Masanı rezervə bağlamaq üçün seçin</span>
                           </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-4 gap-2">
                           {availableTables.filter(t => t.status === 'empty').map(t => (
                              <button key={t.id} onClick={(e) => { e.stopPropagation(); setSelectedRes({...selectedRes, table_number: t.table_number}); setSelectingTable(false); }} className="p-3 rounded-xl bg-blue-500/10 text-blue-500 text-xs font-black hover:bg-blue-500 hover:text-white transition-all">{t.table_number}</button>
                           ))}
                        </div>
                      )}
                   </motion.div>

                   <motion.div layout="position" className={`p-6 rounded-[2.5rem] border ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/5 border-white/5'}`}>
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-40 flex items-center gap-2 mb-4"><ShoppingBag size={14} /> Öncədən Sifariş</span>
                      <div className="space-y-3">
                         {selectedRes.preOrderItems && selectedRes.preOrderItems.length > 0 ? selectedRes.preOrderItems.map((it: any, i: number) => (
                           <div key={i} className="flex items-center justify-between font-bold">
                              <span className="text-sm">{it.quantity}x {it.name}</span>
                              <span className="text-xs opacity-50">{it.price.toFixed(2)} ₼</span>
                           </div>
                         )) : <span className="font-bold">Yoxdur</span>}
                         {selectedRes.preOrderItems && selectedRes.preOrderItems.length > 0 && (
                            <div className="flex items-center justify-between border-t border-white/5 pt-3">
                               <span className="text-sm font-bold opacity-50 uppercase tracking-widest text-[10px]">Cəmi</span>
                               <span className="text-base font-black text-emerald-500">{selectedRes.preOrderItems.reduce((s: number, i: any) => s + i.price, 0).toFixed(2)} ₼</span>
                            </div>
                         )}
                      </div>
                   </motion.div>
                </div>

                <motion.div layout="position" className="flex gap-4">
                   <button onClick={() => { updateStatus(selectedRes.id, 'confirmed'); setSelectedRes(null); }} className="flex-[2] py-5 rounded-[2rem] bg-green-500 text-white font-black uppercase tracking-widest shadow-2xl shadow-green-500/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2">
                      <CheckCircle size={20} /> Rezervi Təsdiqlə
                   </button>
                   <button onClick={() => setSelectedRes(null)} className="flex-1 py-5 rounded-[2rem] bg-white/5 border border-white/10 font-black uppercase tracking-widest hover:brightness-125 transition-all">Bağla</button>
                </motion.div>

                <motion.div layout="position" className="p-6 rounded-[2.5rem] bg-blue-500/5 border border-blue-500/10 flex items-start gap-4">
                   <Zap size={20} className="text-blue-500 shrink-0 mt-1" />
                   <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-black uppercase tracking-widest text-blue-500 opacity-60">Saito AI Insight</span>
                      <p className="text-[13px] font-bold leading-relaxed tracking-tight">{getAIInsight(selectedRes)}</p>
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
