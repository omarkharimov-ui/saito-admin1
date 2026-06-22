'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Reservation } from '@/types';
import { X, Users, Phone, ShoppingBag, Timer, Star, CheckCircle, Table as TableIcon, Zap, ArrowRight, Clock, ChevronLeft, Plus, Trash2, LayoutGrid } from 'lucide-react';
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
  
  /* ─── State ─── */
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'cancelled'>('all');
  const [timeFilter, setTimeFilter] = useState<'today' | 'future' | 'archive'>('today');
  
  // Modal Views: 'main' | 'tables' | 'preorder'
  const [selectedRes, setSelectedRes] = useState<any | null>(null);
  const [modalView, setModalView] = useState<'main' | 'tables' | 'preorder'>('main');
  
  const [tables, setTables] = useState<any[]>([]);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [preOrderItems, setPreOrderItems] = useState<any[]>([]);
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  /* ─── Data Fetching ─── */
  const fetchData = async () => {
    const { data: resData } = await supabase.from('reservations').select('*').order('date', { ascending: true });
    const { data: tableData } = await supabase.from('table_floors').select('*');
    const { data: prodData } = await supabase.from('products').select('*');
    setReservations(resData || []);
    setTables(tableData || []);
    setProducts(prodData || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  /* ─── Helper Functions ─── */
  const calculateTimeLeft = (resTime: string) => {
    if (!resTime) return '00:00';
    const now = new Date();
    const [h, m] = resTime.split(':').map(Number);
    const target = new Date(); target.setHours(h, m, 0);
    const diff = target.getTime() - now.getTime();
    if (diff < 0) return 'Gəlib';
    const minutes = Math.floor(diff / 60000);
    return `${minutes} Dəq`;
  };

  useEffect(() => {
    if (selectedRes) {
      const timer = setInterval(() => setTimeRemaining(calculateTimeLeft(selectedRes.time)), 1000);
      return () => clearInterval(timer);
    }
  }, [selectedRes]);

  const getAIServiceOrder = (items: any[]) => {
    if (!items.length) return "Öncədən sifariş yoxdur.";
    // Simple logic to sort: Cold Starter -> Hot Starter -> Main -> Dessert
    const order = ["başlanğıc", "salat", "suşi", "ana yemək", "desert"];
    const sorted = [...items].sort((a, b) => {
      const catA = (a.category_name || "").toLowerCase();
      const catB = (b.category_name || "").toLowerCase();
      return order.indexOf(catA) - order.indexOf(catB);
    });
    return `AI Tövsiyəsi: İlk olaraq ${sorted[0].name} hazırlansın. Servis ardıcıllığı: ${sorted.map(i => i.name).join(' → ')}. Müştəri çatanda masada hazır olmalıdır.`;
  };

  /* ─── Actions ─── */
  const handleConfirm = async () => {
    if (!selectedRes) return;
    if (selectedTableIds.length === 0) return toast.error("Masa seçilməyib");

    const { error } = await supabase.from('reservations').update({ 
      status: 'confirmed', 
      table_ids: selectedTableIds,
      pre_order_items: preOrderItems 
    }).eq('id', selectedRes.id);

    if (!error) {
      // Sync with POS: All selected tables become 'reserved'
      await Promise.all(selectedTableIds.map(id => 
        supabase.from('table_floors').update({ 
          status: 'reserved', 
          reservation_name: selectedRes.name,
          reservation_time: selectedRes.time,
          guest_count: selectedRes.guests 
        }).eq('id', id)
      ));
      
      toast.success("Rezervasiya təsdiqləndi və POS sinxronizasiya edildi");
      setSelectedRes(null);
      fetchData();
    }
  };

  const resWithData = useMemo(() => {
    const counts: Record<string, number> = {};
    reservations.forEach(r => { counts[r.phone] = (counts[r.phone] || 0) + 1; });
    return reservations.map(r => ({ ...r, visitCount: counts[r.phone] || 1 }));
  }, [reservations]);

  const filteredReservations = resWithData.filter(res => {
    const matchesSearch = res.name.toLowerCase().includes(searchQuery.toLowerCase()) || res.phone.includes(searchQuery);
    const matchesStatus = statusFilter === 'all' || res.status === statusFilter;
    const resDate = new Date(res.date);
    const today = new Date(); today.setHours(0,0,0,0);
    if (timeFilter === 'today') return matchesSearch && matchesStatus && resDate.getTime() === today.getTime();
    if (timeFilter === 'future') return matchesSearch && matchesStatus && resDate > today;
    return matchesSearch && matchesStatus && (resDate < today || res.status === 'cancelled');
  });

  return (
    <div className="p-8">
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-black tracking-tighter">Rezervasiyalar</h1>
        <ReservationFilters 
          timeFilter={timeFilter} statusFilter={statusFilter} searchQuery={searchQuery}
          onTimeFilter={setTimeFilter} onStatusFilter={setStatusFilter} onSearch={setSearchQuery}
          todayPendingCount={resWithData.filter(r => r.status === 'pending').length}
          futurePendingCount={0} searchOpen={true} archiveSelectionMode={false} selectedArchiveCount={0} totalArchiveCount={0} onStartArchiveSelection={() => {}} onDeleteSelectedArchive={() => {}} onCancelArchiveSelection={() => {}} onSelectAll={() => {}}
        />

        {loading ? <TableSkeleton rows={6} /> : (
          <div className={`rounded-[2.5rem] border overflow-hidden shadow-2xl ${lightMode ? 'bg-white border-zinc-100 shadow-zinc-200/50' : 'bg-white/[0.02] border-white/[0.05] shadow-black/40'}`}>
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
                    key={res.id} res={res} timeFilter={timeFilter} onSelect={(r) => { 
                      setSelectedRes(r); 
                      setSelectedTableIds(r.table_ids || []); 
                      setPreOrderItems(r.pre_order_items || []);
                      setModalView('main');
                    }}
                    statusBadge={(s) => <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${s === 'confirmed' ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>{s}</span>}
                    onUpdateStatus={() => {}} onDelete={() => {}}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* LÜKS MORPHING CONTROL PANEL */}
      <AnimatePresence>
        {selectedRes && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedRes(null)} className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md" />
            <motion.div
              layoutId={`reserv-${selectedRes.id}`}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              className={`fixed inset-0 m-auto z-[110] w-[95%] max-w-2xl h-fit max-h-[90vh] overflow-hidden rounded-[3.5rem] shadow-[0_50px_100px_rgba(0,0,0,0.5)] border ${lightMode ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-zinc-900 border-white/10 text-white'}`}
            >
              <div className="p-10 flex flex-col gap-8 relative overflow-y-auto max-h-[90vh]">
                <button onClick={() => setSelectedRes(null)} className="absolute top-8 right-10 p-3 rounded-full bg-white/5 hover:bg-white/10 transition-colors"><X size={24} /></button>

                <AnimatePresence mode="wait">
                  {modalView === 'main' && (
                    <motion.div key="main" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="flex flex-col gap-8">
                      {/* Header */}
                      <div className="flex items-start justify-between mt-4">
                        <div className="flex flex-col gap-2">
                          <h2 className="text-4xl font-black tracking-tighter">{selectedRes.name}</h2>
                          <div className="flex items-center gap-4 text-xs font-black opacity-50 uppercase tracking-widest">
                            <span className="flex items-center gap-1.5"><Phone size={14} className="text-blue-500" /> {selectedRes.phone}</span>
                            <span className="flex items-center gap-1.5"><Star size={14} className="text-blue-500" /> {selectedRes.visitCount} Ziyarət</span>
                          </div>
                        </div>
                        <div className={`p-6 rounded-[2.5rem] flex flex-col items-center justify-center ${lightMode ? 'bg-zinc-50 border border-zinc-100' : 'bg-white/5 border border-white/5'}`}>
                          <Timer size={24} className="text-blue-500 mb-1" />
                          <span className="text-[9px] font-black uppercase opacity-40 leading-none">Gözlənilir</span>
                          <span className="text-xl font-black tracking-tighter">{calculateTimeLeft(selectedRes.time)}</span>
                        </div>
                      </div>

                      {/* Info Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Table Select Card */}
                        <div onClick={() => setModalView('tables')} className={`p-6 rounded-[2.5rem] border cursor-pointer hover:scale-[1.02] active:scale-95 transition-all ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/5 border-white/5'}`}>
                          <div className="flex items-center justify-between mb-4 font-black uppercase tracking-widest text-[10px] opacity-40">
                            <span className="flex items-center gap-2"><TableIcon size={14} /> Masa Bağlantısı</span>
                            <span className="text-blue-500 text-[8px]">Seç</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 font-black text-xl">
                              {selectedTableIds.length > 0 ? selectedTableIds.map(id => tables.find(t => t.id === id)?.table_number).join('+') : '?'}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-black">{selectedTableIds.length > 0 ? `${selectedTableIds.length} Masa seçildi` : 'Hələ təyin edilməyib'}</span>
                              <span className="text-[10px] opacity-50 font-medium">Rezervi masaya bağlayın</span>
                            </div>
                          </div>
                        </div>

                        {/* Pre-Order Card */}
                        <div onClick={() => setModalView('preorder')} className={`p-6 rounded-[2.5rem] border cursor-pointer hover:scale-[1.02] active:scale-95 transition-all ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/5 border-white/5'}`}>
                          <div className="flex items-center justify-between mb-4 font-black uppercase tracking-widest text-[10px] opacity-40">
                            <span className="flex items-center gap-2"><ShoppingBag size={14} /> Öncədən Sifariş</span>
                            <span className="text-blue-500 text-[8px]">Əlavə Et</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            {preOrderItems.length > 0 ? (
                              <>
                                <span className="text-sm font-black">{preOrderItems.length} Məhsul</span>
                                <span className="text-base font-black text-emerald-500">{preOrderItems.reduce((s, i) => s + i.price, 0).toFixed(2)} ₼</span>
                              </>
                            ) : <span className="text-sm font-black opacity-30">Sifariş yoxdur</span>}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-4">
                        <button onClick={handleConfirm} className="flex-[2] py-5 rounded-[2.2rem] bg-green-500 text-white font-black uppercase tracking-widest shadow-2xl shadow-green-500/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3">
                          <CheckCircle size={22} /> Rezervi Təsdiqlə
                        </button>
                        <button onClick={() => setSelectedRes(null)} className={`flex-1 py-5 rounded-[2.2rem] font-black uppercase tracking-widest border transition-all ${lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-500' : 'bg-white/5 border-white/10 text-white'}`}>Bağla</button>
                      </div>

                      {/* AI Insight */}
                      <div className="p-6 rounded-[2.5rem] bg-blue-500/5 border border-blue-500/10 flex items-start gap-4">
                        <Zap size={22} className="text-blue-500 shrink-0 mt-1" />
                        <div className="flex flex-col gap-1">
                          <span className="text-[9px] font-black uppercase tracking-widest text-blue-500 opacity-60">Saito AI Kitchen Management</span>
                          <p className="text-[13px] font-bold leading-relaxed tracking-tight">{getAIServiceOrder(preOrderItems)}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {modalView === 'tables' && (
                    <motion.div key="tables" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-6">
                      <div className="flex items-center gap-4">
                        <button onClick={() => setModalView('main')} className="p-3 rounded-full bg-white/5 hover:bg-white/10"><ChevronLeft size={24} /></button>
                        <div>
                           <h3 className="text-2xl font-black tracking-tighter">Masa Seçimi</h3>
                           <p className="text-xs font-black opacity-40 uppercase tracking-widest">Boş masaları seçin (Birləşdirmək olar)</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 sm:grid-cols-5 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {tables.map(t => (
                          <button
                            key={t.id}
                            onClick={() => {
                              if (selectedTableIds.includes(t.id)) setSelectedTableIds(prev => prev.filter(id => id !== t.id));
                              else setSelectedTableIds(prev => [...prev, t.id]);
                            }}
                            className={`aspect-square rounded-2xl border-2 flex flex-col items-center justify-center gap-1 transition-all ${
                              selectedTableIds.includes(t.id) 
                                ? 'bg-blue-500 border-blue-500 text-white shadow-lg' 
                                : t.status === 'empty' 
                                  ? 'bg-white/5 border-white/10 hover:border-blue-500/50' 
                                  : 'bg-white/5 opacity-20 cursor-not-allowed border-transparent'
                            }`}
                            disabled={t.status !== 'empty'}
                          >
                            <span className="text-xl font-black">{t.table_number}</span>
                            <span className="text-[8px] font-black uppercase opacity-60">{t.status}</span>
                          </button>
                        ))}
                      </div>
                      <button onClick={() => setModalView('main')} className="w-full py-5 rounded-[2rem] bg-zinc-900 text-white font-black uppercase tracking-widest shadow-xl">Masaları Təsdiqlə</button>
                    </motion.div>
                  )}

                  {modalView === 'preorder' && (
                    <motion.div key="preorder" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-6">
                      <div className="flex items-center gap-4">
                        <button onClick={() => setModalView('main')} className="p-3 rounded-full bg-white/5 hover:bg-white/10"><ChevronLeft size={24} /></button>
                        <div>
                           <h3 className="text-2xl font-black tracking-tighter">Öncədən Sifariş</h3>
                           <p className="text-xs font-black opacity-40 uppercase tracking-widest">Məhsulları siyahıya əlavə edin</p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-3 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                         {products.map(p => (
                           <div key={p.id} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
                              <div className="flex flex-col">
                                 <span className="text-sm font-bold">{p.name}</span>
                                 <span className="text-xs opacity-50 font-black">{p.price} ₼</span>
                              </div>
                              <button onClick={() => setPreOrderItems(prev => [...prev, p])} className="p-2 rounded-xl bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-white transition-all"><Plus size={20} /></button>
                           </div>
                         ))}
                      </div>
                      <div className="p-6 rounded-[2rem] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                         <span className="font-black text-sm uppercase tracking-widest">Səbət ({preOrderItems.length})</span>
                         <span className="text-xl font-black text-emerald-500">{preOrderItems.reduce((s, i) => s + i.price, 0).toFixed(2)} ₼</span>
                      </div>
                      <button onClick={() => setModalView('main')} className="w-full py-5 rounded-[2rem] bg-zinc-900 text-white font-black uppercase tracking-widest shadow-xl">Sifarişi Saxla</button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <DeleteReservationModal reservation={confirmDeleteReservation} onConfirm={() => {}} onCancel={() => setConfirmDeleteReservation(null)} />
    </div>
  );
}
