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
import ReservationFilters from './components/ReservationFilters';
import { TableSkeleton } from '@/components/SkeletonLoader';
import { ReservationTableRow, ReservationCard } from './components/ReservationRow';
import { DeleteReservationModal, ClearArchiveModal } from './components/ReservationModals';

export default function ReservationsPage() {
  const { t, language } = useLanguage();
  const { lightMode } = useTheme();
  const { clearNotifications } = useNotifications();
  
  /* ─── State ─── */
  const [reservations, setReservations] = useState<Reservation[]>(() => {
    try { if (typeof window !== 'undefined') { const r = localStorage.getItem('saito_reservations_cache'); return r ? JSON.parse(r) : []; } return []; } catch { return []; }
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'cancelled'>('all');
  const [timeFilter, setTimeFilter] = useState<'today' | 'future' | 'archive'>('today');
  
  const [selectedRes, setSelectedRes] = useState<any | null>(null);
  const [modalView, setModalView] = useState<'main' | 'tables' | 'preorder'>('main');
  
  const [tables, setTables] = useState<any[]>([]);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [preOrderItems, setPreOrderItems] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  
  const [archiveSelectionMode, setArchiveSelectionMode] = useState(false);
  const [selectedArchiveIds, setSelectedArchiveIds] = useState<string[]>([]);
  const [confirmDeleteReservation, setConfirmDeleteReservation] = useState<{ id: string; guest: string } | null>(null);
  const [confirmClearArchiveModal, setConfirmClearArchiveModal] = useState(false);
  const [clearingArchive, setClearingArchive] = useState(false);

  /* ─── Data Fetching ─── */
  const fetchData = async () => {
    try {
      const res = await fetch('/api/reservations');
      const data = await res.json();
      setReservations(data.reservations || []);
      if (typeof window !== 'undefined') localStorage.setItem('saito_reservations_cache', JSON.stringify(data.reservations || []));
      
      const { data: tData } = await supabase.from('table_floors').select('*');
      setTables(tData || []);
      
      const { data: pData } = await supabase.from('products').select('*');
      setProducts(pData || []);
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

  /* ─── Logic ─── */
  const calculateTimeLeft = (resTime: string) => {
    if (!resTime) return '00:00';
    const now = new Date();
    const [h, m] = resTime.split(':').map(Number);
    const target = new Date(); target.setHours(h, m, 0);
    const diff = target.getTime() - now.getTime();
    if (diff < 0) return 'Gəlib';
    return `${Math.floor(diff / 60000)} Dəq`;
  };

  const getAIInsight = (res: any) => {
    const note = (res.note || "").toLowerCase();
    if (note.includes('allergiya')) return `DİQQƏT: Qonağın allergiyası var!`;
    if (res.visitCount > 5) return `Bu qonaq daimi müştəridir. VIP xidmət təklif olunsun.`;
    return `Qonaq üçün standart lüks xidmət təklif olunsun.`;
  };

  const resWithData = useMemo(() => {
    const counts: Record<string, number> = {};
    reservations.forEach(r => { counts[r.phone] = (counts[r.phone] || 0) + 1; });
    return reservations.map(r => ({ 
      ...r, 
      visitCount: counts[r.phone] || 1,
      preOrderItems: r.note?.toLowerCase().includes('preorder') ? [{ name: 'Saito Special Roll', quantity: 1, price: 24 }] : [] 
    }));
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

  const updateStatus = async (id: string, status: 'confirmed' | 'cancelled') => {
    const { error } = await supabase.from('reservations').update({ status }).eq('id', id);
    if (!error) { toast.success('Yeniləndi'); fetchData(); }
  };

  return (
    <div className="relative p-4 md:p-8 max-w-full">
      <div className="flex flex-col gap-6 mb-8">
        <h1 className="text-3xl font-black tracking-tighter">Rezervasiyalar</h1>
        <ReservationFilters 
          timeFilter={timeFilter} statusFilter={statusFilter} searchQuery={searchQuery}
          onTimeFilter={setTimeFilter} onStatusFilter={setStatusFilter} onSearch={setSearchQuery}
          todayPendingCount={resWithData.filter(r => r.status === 'pending').length}
          futurePendingCount={0} searchOpen={true} archiveSelectionMode={archiveSelectionMode}
          selectedArchiveCount={selectedArchiveIds.length} totalArchiveCount={filteredReservations.length}
          onStartArchiveSelection={() => setArchiveSelectionMode(true)}
          onDeleteSelectedArchive={() => setConfirmClearArchiveModal(true)}
          onCancelArchiveSelection={() => setArchiveSelectionMode(false)}
          onSelectAll={() => {}}
        />
      </div>

      {loading ? <TableSkeleton rows={6} /> : (
        <div className={`rounded-[2.5rem] border overflow-hidden shadow-2xl ${lightMode ? 'bg-white border-zinc-100' : 'bg-[#0f0f0f] border-white/5 shadow-black/40'}`}>
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
                  key={res.id} res={res} timeFilter={timeFilter} onSelect={(r) => { setSelectedRes(r); setModalView('main'); }}
                  statusBadge={(s) => <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${s === 'confirmed' ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>{s}</span>}
                  onUpdateStatus={updateStatus} onDelete={() => {}}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* LÜKS MODAL */}
      <AnimatePresence>
        {selectedRes && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedRes(null)} className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md" />
            <motion.div
              layoutId={`reserv-${selectedRes.id}`}
              className={`fixed inset-0 m-auto z-[110] w-[95%] max-w-2xl h-fit max-h-[90vh] overflow-hidden rounded-[3.5rem] shadow-[0_50px_100px_rgba(0,0,0,0.5)] border ${lightMode ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-zinc-900 border-white/10 text-white'}`}
            >
              <div className="p-10 flex flex-col gap-8 overflow-y-auto max-h-[90vh]">
                <button onClick={() => setSelectedRes(null)} className="absolute top-8 right-10 p-3 rounded-full bg-white/5 hover:bg-white/10 transition-colors"><X size={24} /></button>
                <motion.div layout="position">
                   <h2 className="text-4xl font-black tracking-tighter mb-2">{selectedRes.name}</h2>
                   <div className="flex gap-4 text-xs font-black opacity-40 uppercase tracking-widest mb-8">
                      <span>{selectedRes.phone}</span>
                      <span>{selectedRes.visitCount} Ziyarət</span>
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                      <div className="p-6 rounded-[2.5rem] border border-white/5 bg-white/5 flex items-center gap-4">
                         <Timer size={24} className="text-blue-500" />
                         <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase opacity-40">Gözlənilir</span>
                            <span className="text-xl font-black">{calculateTimeLeft(selectedRes.time)}</span>
                         </div>
                      </div>
                      <div className="p-6 rounded-[2.5rem] border border-white/5 bg-white/5 flex items-center gap-4">
                         <ShoppingBag size={24} className="text-blue-500" />
                         <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase opacity-40">Pre-Order</span>
                            <span className="text-xl font-black">{selectedRes.preOrderItems?.length || 0} Məhsul</span>
                         </div>
                      </div>
                   </div>
                   <div className="flex gap-4">
                      <button onClick={() => { updateStatus(selectedRes.id, 'confirmed'); setSelectedRes(null); }} className="flex-[2] py-5 rounded-[2rem] bg-green-500 text-white font-black uppercase shadow-lg">Təsdiqlə</button>
                      <button onClick={() => setSelectedRes(null)} className="flex-1 py-5 rounded-[2rem] bg-white/5 border border-white/10 font-black uppercase">Bağla</button>
                   </div>
                   <div className="mt-8 p-6 rounded-[2.5rem] bg-blue-500/5 border border-blue-500/10 flex items-start gap-4">
                      <Zap size={22} className="text-blue-500" />
                      <p className="text-sm font-bold opacity-70">{getAIInsight(selectedRes)}</p>
                   </div>
                </motion.div>
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
