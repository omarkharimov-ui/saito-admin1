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
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'cancelled'>('all');
  const [timeFilter, setTimeFilter] = useState<'today' | 'future' | 'archive'>('today');
  
  // Modal State & Views
  const [selectedRes, setSelectedRes] = useState<any | null>(null);
  const [modalView, setModalView] = useState<'main' | 'tables' | 'preorder'>('main');
  
  const [tables, setTables] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [preOrderItems, setPreOrderItems] = useState<any[]>([]);
  
  const [archiveSelectionMode, setArchiveSelectionMode] = useState(false);
  const [selectedArchiveIds, setSelectedArchiveIds] = useState<string[]>([]);
  const [confirmDeleteReservation, setConfirmDeleteReservation] = useState<{ id: string; guest: string } | null>(null);
  const [confirmClearArchiveModal, setConfirmClearArchiveModal] = useState(false);
  const [clearingArchive, setClearingArchive] = useState(false);

  /* ─── Data Fetching ─── */
  const fetchData = async () => {
    try {
      const { data: resData } = await supabase.from('reservations').select('*').order('date', { ascending: true });
      setReservations(resData || []);
      
      const { data: tData } = await supabase.from('table_floors').select('*');
      setTables(tData || []);
      
      const { data: pData } = await supabase.from('products').select('*, categories(name)');
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

  /* ─── Helper Functions ─── */
  const calculateTimeLeft = (resTime: string) => {
    if (!resTime) return '00:00';
    const now = new Date();
    const [h, m] = resTime.split(':').map(Number);
    const target = new Date(); target.setHours(h, m, 0);
    const diff = target.getTime() - now.getTime();
    if (diff < 0) return 'Gəlib';
    return `${Math.floor(diff / 60000)} Dəq`;
  };

  const getAIServiceOrder = (items: any[]) => {
    if (!items || items.length === 0) return "Öncədən sifariş yoxdur.";
    const priority = ["başlanğıc", "salat", "suşi", "ana yemək", "desert"];
    const sorted = [...items].sort((a, b) => {
      const catA = (a.categories?.name || "").toLowerCase();
      const catB = (b.categories?.name || "").toLowerCase();
      return priority.indexOf(catA) - priority.indexOf(catB);
    });
    return `AI Kitchen Guide: İlk olaraq ${sorted[0]?.name} hazırlanmalıdır. Servis ardıcıllığı: ${sorted.map(i => i.name).join(' → ')}.`;
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

  /* ─── Actions ─── */
  const handleConfirmReservation = async () => {
    if (selectedTableIds.length === 0) return toast.error("Zəhmət olmasa masa seçin");
    
    const { error } = await supabase.from('reservations').update({ 
      status: 'confirmed', 
      table_ids: selectedTableIds,
      pre_order_items: preOrderItems
    }).eq('id', selectedRes.id);

    if (!error) {
      // Sync with POS: Mark tables as reserved
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

  return (
    <div className="relative p-4 md:p-8 max-w-full min-h-screen">
      <div className="flex flex-col gap-6 mb-10">
        <div>
          <h1 className="text-4xl font-black tracking-tighter">Rezervasiyalar</h1>
          <p className="opacity-40 text-[10px] font-black uppercase tracking-widest mt-1">Lüks idarəetmə və POS sinxronizasiya</p>
        </div>
        
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

      {loading ? <TableSkeleton rows={8} /> : (
        <div className={`rounded-[3rem] border overflow-hidden shadow-2xl ${lightMode ? 'bg-white border-zinc-100 shadow-zinc-200/50' : 'bg-[#0f0f0f] border-white/5 shadow-black/40'}`}>
          <table className="w-full text-left border-collapse">
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
                  onSelect={(r) => { 
                    setSelectedRes(r); 
                    setModalView('main');
                    setSelectedTableIds(r.table_ids || []);
                    setPreOrderItems(r.pre_order_items || []);
                  }}
                  statusBadge={(s) => <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${s === 'confirmed' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>{s}</span>}
                  onUpdateStatus={() => {}} onDelete={() => {}}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* THE MASTER LUXURY MODAL */}
      <AnimatePresence>
        {selectedRes && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedRes(null)} className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md" />
            <motion.div
              layoutId={`reserv-${selectedRes.id}`}
              className={`fixed inset-0 m-auto z-[110] w-[95%] max-w-2xl h-fit max-h-[90vh] overflow-hidden rounded-[3.5rem] shadow-[0_50px_100px_rgba(0,0,0,0.6)] border ${lightMode ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-zinc-900 border-white/10 text-white'}`}
            >
              <div className="p-10 relative overflow-y-auto max-h-[90vh] custom-scrollbar">
                <button onClick={() => setSelectedRes(null)} className="absolute top-8 right-10 p-3 rounded-full bg-white/5 hover:bg-white/10 transition-colors"><X size={24} /></button>

                <AnimatePresence mode="wait">
                  {modalView === 'main' && (
                    <motion.div key="main" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }} className="flex flex-col gap-8">
                       <motion.div layout="position">
                          <h2 className="text-5xl font-black tracking-tighter mb-2 leading-none">{selectedRes.name}</h2>
                          <div className="flex gap-4 text-xs font-black opacity-40 uppercase tracking-widest mb-10">
                             <span className="flex items-center gap-1.5 text-blue-500"><Phone size={14} /> {selectedRes.phone}</span>
                             <span className="flex items-center gap-1.5"><Star size={14} /> {selectedRes.visitCount} Ziyarət</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                             {/* Table Connection Card */}
                             <div onClick={() => setModalView('tables')} className={`p-7 rounded-[2.5rem] border cursor-pointer hover:scale-[1.02] active:scale-95 transition-all shadow-lg ${lightMode ? 'bg-zinc-50 border-zinc-100' : 'bg-white/5 border-white/10'}`}>
                                <div className="flex items-center justify-between mb-5">
                                   <span className="text-[10px] font-black uppercase tracking-widest opacity-40 flex items-center gap-2"><TableIcon size={14} /> Masa Bağlantısı</span>
                                   <ArrowRight size={14} className="text-blue-500" />
                                </div>
                                <div className="flex items-center gap-5">
                                   <div className="w-16 h-16 rounded-2xl bg-blue-500 text-white flex items-center justify-center font-black text-2xl shadow-xl shadow-blue-500/20">
                                      {selectedTableIds.length > 0 ? selectedTableIds.map(id => tables.find(t => t.id === id)?.table_number).join('+') : '?'}
                                   </div>
                                   <div className="flex flex-col">
                                      <span className="text-sm font-black">{selectedTableIds.length > 0 ? `${selectedTableIds.length} Masa seçilib` : 'Hələ təyin edilməyib'}</span>
                                      <span className="text-[10px] opacity-40 font-bold uppercase tracking-wide">Rezervi masaya bağla</span>
                                   </div>
                                </div>
                             </div>

                             {/* Pre-Order Card */}
                             <div onClick={() => setModalView('preorder')} className={`p-7 rounded-[2.5rem] border cursor-pointer hover:scale-[1.02] active:scale-95 transition-all shadow-lg ${lightMode ? 'bg-zinc-50 border-zinc-100' : 'bg-white/5 border-white/10'}`}>
                                <div className="flex items-center justify-between mb-5">
                                   <span className="text-[10px] font-black uppercase tracking-widest opacity-40 flex items-center gap-2"><ShoppingBag size={14} /> Öncədən Sifariş</span>
                                   <ArrowRight size={14} className="text-blue-500" />
                                </div>
                                <div className="flex flex-col gap-1">
                                   {preOrderItems.length > 0 ? (
                                      <>
                                         <span className="text-sm font-black">{preOrderItems.length} Məhsul daxil edilib</span>
                                         <span className="text-xl font-black text-emerald-500">{preOrderItems.reduce((s, i) => s + i.price, 0).toFixed(2)} ₼</span>
                                      </>
                                   ) : <span className="text-sm font-black opacity-30 italic">Sifariş daxil edilməyib</span>}
                                </div>
                             </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                             <div className="flex gap-4">
                                <button onClick={handleConfirmReservation} className="flex-[2] py-6 rounded-[2rem] bg-green-500 text-white font-black uppercase tracking-widest shadow-[0_15px_40px_rgba(34,197,94,0.3)] hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3">
                                   <CheckCircle size={24} /> Təsdiqlə
                                </button>
                                <button onClick={() => setSelectedRes(null)} className={`flex-1 py-6 rounded-[2rem] font-black uppercase tracking-widest border transition-all ${lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-500' : 'bg-white/5 border-white/10 text-white'}`}>Bağla</button>
                             </div>
                             
                             <div className={`p-6 rounded-[2.5rem] flex items-center justify-center gap-4 ${lightMode ? 'bg-zinc-50' : 'bg-white/5'}`}>
                                <Timer size={28} className="text-blue-500 animate-pulse" />
                                <div className="flex flex-col">
                                   <span className="text-[9px] font-black uppercase opacity-40 leading-none mb-1">Bron Vaxtına Qalıb</span>
                                   <span className="text-2xl font-black tracking-tighter leading-none">{calculateTimeLeft(selectedRes.time)}</span>
                                </div>
                             </div>
                          </div>

                          <div className="mt-8 p-7 rounded-[2.5rem] bg-blue-500/5 border border-blue-500/10 flex items-start gap-5">
                             <Zap size={24} className="text-blue-500 shrink-0 mt-1" />
                             <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-black uppercase tracking-widest text-blue-500 opacity-60">Saito AI Smart Kitchen Assistant</span>
                                <p className="text-[14px] font-bold leading-relaxed tracking-tight">{getAIServiceOrder(preOrderItems)}</p>
                             </div>
                          </div>
                       </motion.div>
                    </motion.div>
                  )}

                  {modalView === 'tables' && (
                    <motion.div key="tables" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="flex flex-col gap-8">
                       <div className="flex items-center gap-5">
                          <button onClick={() => setModalView('main')} className="p-4 rounded-full bg-white/5 hover:bg-white/10 transition-colors shadow-lg"><ChevronLeft size={28} /></button>
                          <div>
                             <h3 className="text-3xl font-black tracking-tighter leading-none mb-1">Masa Seçimi</h3>
                             <p className="text-xs font-black opacity-40 uppercase tracking-widest">Boş masaları seçin (Birləşdirmək olar)</p>
                          </div>
                       </div>
                       <div className="grid grid-cols-4 sm:grid-cols-5 gap-4 max-h-[400px] overflow-y-auto pr-3 custom-scrollbar">
                          {tables.map(t => (
                             <button key={t.id} disabled={t.status !== 'empty'} onClick={() => {
                                if (selectedTableIds.includes(t.id)) setSelectedTableIds(p => p.filter(id => id !== t.id));
                                else setSelectedTableIds(p => [...p, t.id]);
                             }} className={`aspect-square rounded-[1.8rem] border-3 flex flex-col items-center justify-center gap-1 transition-all ${selectedTableIds.includes(t.id) ? 'bg-blue-500 border-blue-500 text-white shadow-2xl shadow-blue-500/40 scale-105' : t.status === 'empty' ? 'bg-white/5 border-white/10 hover:border-blue-500/40' : 'opacity-20 cursor-not-allowed grayscale'}`}>
                                <span className="text-2xl font-black">{t.table_number}</span>
                                <span className="text-[8px] font-black uppercase opacity-60">{t.status}</span>
                             </button>
                          ))}
                       </div>
                       <button onClick={() => setModalView('main')} className="w-full py-6 rounded-[2rem] bg-zinc-900 text-white font-black uppercase tracking-widest shadow-2xl shadow-black/40">Seçimi Təsdiqlə</button>
                    </motion.div>
                  )}

                  {modalView === 'preorder' && (
                    <motion.div key="preorder" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="flex flex-col gap-8">
                       <div className="flex items-center gap-5">
                          <button onClick={() => setModalView('main')} className="p-4 rounded-full bg-white/5 hover:bg-white/10 shadow-lg"><ChevronLeft size={28} /></button>
                          <div>
                             <h3 className="text-3xl font-black tracking-tighter leading-none mb-1">Məhsul Əlavə Et</h3>
                             <p className="text-xs font-black opacity-40 uppercase tracking-widest">Qonaq üçün öncədən sifariş yığın</p>
                          </div>
                       </div>
                       <div className="flex flex-col gap-3 max-h-[350px] overflow-y-auto pr-3 custom-scrollbar">
                          {products.map(p => (
                             <div key={p.id} className="flex items-center justify-between p-5 rounded-3xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                                <div className="flex flex-col gap-0.5">
                                   <span className="text-[9px] font-black uppercase text-blue-400">{(p as any).categories?.name}</span>
                                   <span className="text-base font-bold tracking-tight">{p.name}</span>
                                   <span className="text-xs font-black opacity-40">{p.price} ₼</span>
                                </div>
                                <div className="flex items-center gap-3">
                                   <button onClick={() => setPreOrderItems(items => items.filter(i => i.id !== p.id))} className="p-2.5 rounded-xl bg-red-500/10 text-red-500"><Trash2 size={20} /></button>
                                   <button onClick={() => setPreOrderItems(prev => [...prev, p])} className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-white transition-all"><Plus size={20} /></button>
                                </div>
                             </div>
                          ))}
                       </div>
                       <div className="p-7 rounded-[2.5rem] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between shadow-lg shadow-emerald-500/5">
                          <div className="flex flex-col">
                             <span className="font-black text-[10px] uppercase tracking-[0.2em] text-emerald-500">Öncədən Sifariş Cəmi</span>
                             <span className="text-sm font-bold opacity-60">{preOrderItems.length} Məhsul seçilib</span>
                          </div>
                          <span className="text-3xl font-black text-emerald-500 tracking-tighter">{preOrderItems.reduce((s, i) => s + i.price, 0).toFixed(2)} ₼</span>
                       </div>
                       <button onClick={() => setModalView('main')} className="w-full py-6 rounded-[2rem] bg-zinc-900 text-white font-black uppercase tracking-widest shadow-xl">Səbəti Saxla</button>
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
