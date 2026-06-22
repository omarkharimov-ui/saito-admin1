'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Reservation } from '@/types';
import { X, Users, Phone, Clock, ShoppingBag, Timer, Star, CheckCircle, Table as TableIcon, AlertTriangle, UserPlus, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import ReservationFilters from './components/ReservationFilters';
import { TableSkeleton } from '@/components/SkeletonLoader';
import { ReservationTableRow } from './components/ReservationRow';

const ReservationsPage = () => {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRes, setSelectedRes] = useState<any | null>(null);
  const [availableTables, setTables] = useState<any[]>([]);
  const [selectingTable, setSelectingTable] = useState(false);

  const resWithData = useMemo(() => {
    const counts: Record<string, number> = {};
    reservations.forEach(r => { counts[r.phone] = (counts[r.phone] || 0) + 1; });
    return reservations.map(r => ({ 
      ...r, 
      visitCount: counts[r.phone] || 1,
      preOrderItems: r.note?.includes('preorder') ? [{ name: 'Saito Special Roll', quantity: 1, price: 24 }] : [] 
    }));
  }, [reservations]);

  const fetchAll = async () => {
    const { data: r } = await supabase.from('reservations').select('*').order('date', { ascending: true });
    const { data: t } = await supabase.from('table_floors').select('*');
    setReservations(r || []);
    setTables(t || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const getAIInsight = (res: any) => {
    const note = (res.note || "").toLowerCase();
    if (note.includes('allergiya') || note.includes('allergy')) return `DİQQƏT: Qonağın allergiyası var, mətbəxi məlumatlandırın!`;
    if (res.visitCount > 5) return `Bu qonaq daimi müştəridir. Adətən lüks masaları və Saito Special Roll sevir.`;
    if (res.visitCount === 1) return `Bu qonağın ilk ziyarətidir. Masaya xoş gəldiniz ikramı təklif oluna bilər.`;
    return `Qonaq üçün standart xidmət təklif olunsun.`;
  };

  const handleConfirmReservation = async (res: any, tableId: string) => {
    const { error } = await supabase.from('reservations').update({ status: 'confirmed', table_id: tableId }).eq('id', res.id);
    if (error) return toast.error('Xəta baş verdi');
    
    // POS Sync: Update table status in table_floors
    await supabase.from('table_floors').update({ status: 'reserved', guest_count: res.guests }).eq('id', tableId);
    
    toast.success(`${res.name} üçün Masa təyin edildi`);
    setSelectedRes(null);
    fetchAll();
  };

  return (
    <div className="p-8">
      <div className="mb-10">
        <h1 className="text-4xl font-black tracking-tighter mb-2">Rezervasiyalar</h1>
        <p className="opacity-50 text-xs font-black uppercase tracking-widest">Real-vaxt idarəetmə və müştəri analizi</p>
      </div>

      <ReservationFilters 
        timeFilter="today" statusFilter="all" searchQuery="" todayPendingCount={0} futurePendingCount={0} searchOpen={false} 
        archiveSelectionMode={false} selectedArchiveCount={0} totalArchiveCount={0} onTimeFilter={() => {}} onStatusFilter={() => {}} onSearch={() => {}} 
        onStartArchiveSelection={() => {}} onDeleteSelectedArchive={() => {}} onCancelArchiveSelection={() => {}} onSelectAll={() => {}} 
      />

      {loading ? <TableSkeleton rows={8} /> : (
        <div className={`rounded-[3rem] border shadow-2xl mt-8 overflow-hidden ${lightMode ? 'bg-white border-zinc-100' : 'bg-white/[0.02] border-white/[0.05]'}`}>
          <table className="w-full text-left">
            <thead className="opacity-40 text-[10px] font-black uppercase tracking-widest bg-black/5">
              <tr>
                <th className="px-8 py-5">Qonaq</th>
                <th className="px-8 py-5">Tarix</th>
                <th className="px-8 py-5 text-center">Nəfər</th>
                <th className="px-8 py-5">Status</th>
                <th className="px-8 py-5">Qeyd</th>
                <th className="px-8 py-5 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {resWithData.map(res => (
                <ReservationTableRow 
                   key={res.id} res={res} timeFilter="today" onSelect={setSelectedRes} 
                   statusBadge={(s) => <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${s === 'confirmed' ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>{s}</span>}
                   onUpdateStatus={() => {}} onDelete={() => {}}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* THE MASTER MORPHING CONTROL PANEL */}
      <AnimatePresence>
        {selectedRes && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedRes(null)} className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md" />
            <motion.div
              layoutId={`reserv-${selectedRes.id}`}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              className={`fixed inset-0 m-auto z-[110] w-[95%] max-w-2xl h-fit max-h-[90vh] rounded-[3.5rem] shadow-[0_50px_100px_rgba(0,0,0,0.5)] border ${lightMode ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-white/10'}`}
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
                    <span className="text-[10px] font-black uppercase opacity-40 leading-none">Qalıb</span>
                    <span className="text-xl font-black tracking-tighter">45 Dəq</span>
                  </div>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   {/* Table Connectivity */}
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
                              <span className="text-[11px] opacity-50">Masanı bron etmək üçün seçin</span>
                           </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-4 gap-2 py-2">
                           {availableTables.filter(t => t.status === 'empty').map(t => (
                              <button key={t.id} onClick={(e) => { e.stopPropagation(); handleConfirmReservation(selectedRes, t.id); }} className="p-3 rounded-xl bg-blue-500/10 text-blue-500 text-xs font-black hover:bg-blue-500 hover:text-white transition-all">{t.table_number}</button>
                           ))}
                        </div>
                      )}
                   </motion.div>

                   {/* Real Pre-Order */}
                   <motion.div layout="position" className={`p-6 rounded-[2.5rem] border ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/5 border-white/5'}`}>
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-40 flex items-center gap-2 mb-4"><ShoppingBag size={14} /> Öncədən Sifariş</span>
                      <div className="space-y-3">
                         {selectedRes.preOrderItems.length > 0 ? selectedRes.preOrderItems.map((it: any, i: number) => (
                           <div key={i} className="flex items-center justify-between">
                              <span className="text-sm font-bold">{it.quantity}x {it.name}</span>
                              <span className="text-xs opacity-50">{it.price.toFixed(2)} ₼</span>
                           </div>
                         )) : <span className="text-xs opacity-30 italic font-medium">Öncədən sifariş yoxdur</span>}
                         <div className="flex items-center justify-between border-t border-black/5 dark:border-white/5 pt-3">
                            <span className="text-sm font-bold opacity-50 uppercase tracking-widest text-[10px]">Cəmi</span>
                            <span className="text-base font-black text-emerald-500">{selectedRes.preOrderItems.reduce((s: number, i: any) => s + i.price, 0).toFixed(2)} ₼</span>
                         </div>
                      </div>
                   </motion.div>
                </div>

                <motion.div layout="position" className="flex gap-4">
                   <button className="flex-[2] py-5 rounded-[2rem] bg-green-500 text-white font-black uppercase tracking-widest shadow-2xl shadow-green-500/30 hover:scale-[1.02] active:scale-95 transition-all">Rezervi Təsdiqlə</button>
                   <button className="flex-1 py-5 rounded-[2rem] bg-white/5 border border-white/10 font-black uppercase tracking-widest hover:text-red-500 transition-all">Ləğv Et</button>
                </motion.div>

                <motion.div layout="position" className="p-6 rounded-[2rem] bg-blue-500/5 border border-blue-500/10 flex items-start gap-4">
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
    </div>
  );
};

export default ReservationsPage;
