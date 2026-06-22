'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { Reservation } from '@/types';
import { Calendar, Search, X, Users, Phone, Clock, MapPin, ShoppingBag, Timer, Star, CheckCircle, ArrowRight, Table as TableIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '@/lib/toast';
import { useNotifications } from '../context/NotificationContext';
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
  const [selectedRes, setSelectedRes] = useState<(Reservation & { visitCount?: number }) | null>(null);
  const [archiveSelectionMode, setArchiveSelectionMode] = useState(false);
  const [selectedArchiveIds, setSelectedArchiveIds] = useState<string[]>([]);
  const [confirmDeleteReservation, setConfirmDeleteReservation] = useState<{ id: string; guest: string } | null>(null);
  const [confirmClearArchiveModal, setConfirmClearArchiveModal] = useState(false);

  /* ─── Derived Visit Counts ─── */
  const resWithCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    reservations.forEach(r => { counts[r.phone] = (counts[r.phone] || 0) + 1; });
    return reservations.map(r => ({ ...r, visitCount: counts[r.phone] || 1 }));
  }, [reservations]);

  /* ─── Data fetching ─── */
  const fetchReservations = async () => {
    try {
      const res = await fetch('/api/reservations');
      if (!res.ok) throw new Error('API xətası');
      const data = await res.json();
      setReservations(data.reservations || []);
    } catch (error: any) {
      toast.error('Rezervasiyalar yüklənmədi');
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

  /* ─── Filtering ─── */
  const filteredReservations = resWithCounts.filter(res => {
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

  return (
    <div className="relative p-4 md:p-8 max-w-full">
      <div className="flex flex-col gap-6 mb-8">
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-[var(--theme-text)]">Rezervasiyalar</h1>
          <p className="text-[var(--theme-text-muted)] text-sm font-medium uppercase tracking-widest opacity-60">Sifarişləri real-vaxt idarə edin</p>
        </div>
        
        <ReservationFilters
          timeFilter={timeFilter} statusFilter={statusFilter} searchQuery={searchQuery}
          todayPendingCount={filteredReservations.filter(r => r.status === 'pending').length}
          futurePendingCount={0} searchOpen={true} archiveSelectionMode={archiveSelectionMode}
          selectedArchiveCount={selectedArchiveIds.length} onTimeFilter={setTimeFilter}
          onStatusFilter={setStatusFilter} onSearch={setSearchQuery} totalArchiveCount={filteredReservations.length}
          onStartArchiveSelection={() => setArchiveSelectionMode(true)}
          onDeleteSelectedArchive={() => setConfirmClearArchiveModal(true)}
          onCancelArchiveSelection={() => setArchiveSelectionMode(false)}
          onSelectAll={() => {}}
        />
      </div>

      {loading ? <TableSkeleton rows={6} /> : (
        <div className={`rounded-[2.5rem] border overflow-hidden shadow-2xl ${lightMode ? 'bg-white border-zinc-200 shadow-zinc-200/50' : 'bg-white/[0.02] border-white/[0.05] shadow-black/40'}`}>
          <table className="w-full text-left">
            <thead className={`${lightMode ? 'bg-zinc-50/50' : 'bg-white/[0.02]'}`}>
              <tr className="text-[10px] font-black uppercase tracking-widest opacity-40">
                <th className="px-6 py-4">Qonaq</th>
                <th className="px-6 py-4">Tarix & Saat</th>
                <th className="px-6 py-4 text-center">Nəfər</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Qeyd</th>
                <th className="px-6 py-4 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {filteredReservations.map((res) => (
                <ReservationTableRow
                  key={res.id} res={res} timeFilter={timeFilter}
                  statusBadge={(s) => <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${s === 'confirmed' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'}`}>{s}</span>}
                  onUpdateStatus={updateStatus} onDelete={() => {}} onSelect={setSelectedRes}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* THE LUXURY MORPHING MODAL */}
      <AnimatePresence>
        {selectedRes && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedRes(null)} className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm" />
            <motion.div
              layoutId={`res-card-${selectedRes.id}`}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              className={`fixed inset-0 m-auto z-[110] w-[95%] max-w-2xl h-fit max-h-[90vh] overflow-hidden rounded-[3rem] shadow-[0_50px_100px_rgba(0,0,0,0.5)] border ${lightMode ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-white/10'}`}
            >
              <div className="relative p-8 md:p-10 flex flex-col gap-8 overflow-y-auto max-h-[90vh]">
                <button onClick={() => setSelectedRes(null)} className="absolute top-6 right-8 p-3 rounded-full bg-white/5 hover:bg-white/10 transition-colors"><X size={24} /></button>

                {/* Header: Guest Info */}
                <div className="flex items-start justify-between mt-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <h2 className="text-4xl font-black tracking-tighter">{selectedRes.name}</h2>
                      {(selectedRes.visitCount ?? 0) > 5 && <span className="px-3 py-1 rounded-full bg-gold/10 text-gold border border-gold/30 text-[10px] font-black uppercase tracking-widest shadow-[0_0_20px_rgba(212,175,55,0.3)]">VIP MÜŞTƏRİ</span>}
                    </div>
                    <div className="flex items-center gap-4 text-sm font-medium opacity-50 uppercase tracking-widest">
                       <span className="flex items-center gap-1.5"><Phone size={14} className="text-blue-500" /> {selectedRes.phone}</span>
                       <span className="flex items-center gap-1.5"><Star size={14} className="text-blue-500" /> {selectedRes.visitCount ?? 1} Ziyarət</span>
                    </div>
                  </div>
                  <div className={`p-6 rounded-[2rem] flex flex-col items-center justify-center ${lightMode ? 'bg-zinc-50' : 'bg-white/5'}`}>
                    <Timer size={24} className="text-blue-500 mb-1" />
                    <span className="text-[10px] font-black uppercase opacity-40">Gözlənilir</span>
                    <span className="text-xl font-black tracking-tighter">45 Dəq</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   {/* Table Selection Section */}
                   <div className={`p-6 rounded-[2.5rem] border ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/[0.03] border-white/5'}`}>
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-black uppercase tracking-widest opacity-40 flex items-center gap-2"><TableIcon size={14} /> Masa Bağlantısı</span>
                        <button className="text-[10px] font-black text-blue-500 uppercase hover:underline">Zalı Aç</button>
                      </div>
                      <div className="flex items-center gap-4 py-2">
                         <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 font-black text-2xl">?</div>
                         <div className="flex flex-col">
                            <span className="text-sm font-bold">Hələ təyin edilməyib</span>
                            <span className="text-[11px] opacity-50">Masanı rezervə bağlamaq üçün seçin</span>
                         </div>
                         <ArrowRight className="ml-auto opacity-20" />
                      </div>
                   </div>

                   {/* Pre-Order Section */}
                   <div className={`p-6 rounded-[2.5rem] border ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/[0.03] border-white/5'}`}>
                      <span className="text-xs font-black uppercase tracking-widest opacity-40 flex items-center gap-2 mb-4"><ShoppingBag size={14} /> Öncədən Sifariş</span>
                      <div className="space-y-3">
                         <div className="flex items-center justify-between">
                            <span className="text-sm font-bold">1x Saito Special Roll</span>
                            <span className="text-xs opacity-50">24.00 ₼</span>
                         </div>
                         <div className="flex items-center justify-between border-t border-white/5 pt-3">
                            <span className="text-sm font-bold">Total Pre-Order</span>
                            <span className="text-sm font-black text-emerald-500">24.00 ₼</span>
                         </div>
                      </div>
                   </div>
                </div>

                {/* Quick Actions */}
                <div className="flex gap-4 mt-2">
                   <button onClick={() => updateStatus(selectedRes.id, 'confirmed')} className="flex-[2] py-5 rounded-3xl bg-green-500 text-white font-black uppercase tracking-widest shadow-2xl shadow-green-500/30 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all">
                      <CheckCircle size={20} /> Rezervi Təsdiqlə
                   </button>
                   <button onClick={() => updateStatus(selectedRes.id, 'cancelled')} className="flex-1 py-5 rounded-3xl bg-white/5 border border-white/10 font-black uppercase tracking-widest hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20 transition-all">
                      Ləğv Et
                   </button>
                </div>

                <div className="p-5 rounded-3xl bg-blue-500/5 border border-blue-500/10 text-[11px] font-medium leading-relaxed opacity-60 italic">
                   "Bu qonaq adətən Saito Special Roll sifariş edir və pəncərə kənarındakı masaları (VIP 1) sevir." — SAITO AI Insight
                </div>
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
