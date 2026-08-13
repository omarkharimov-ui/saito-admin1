'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { Reservation } from '@/types';
import { X, Users, Phone, Calendar, ShoppingBag, Timer, Star, CheckCircle, Table as TableIcon, Zap, ArrowRight, Clock, ChevronLeft, Plus, Trash2, ChefHat, Tag, Merge } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '@/lib/toast';
import { useNotifications } from '../context/NotificationContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { apiFetch } from '@/lib/api-fetch';
import ReservationFilters from './components/ReservationFilters';
import { TableSkeleton } from '@/components/SkeletonLoader';
import { ReservationCard } from './components/ReservationRow';
import { DeleteReservationModal, ClearArchiveModal, UpsertReservationModal } from './components/ReservationModals';

export default function ReservationsPage() {
  const { t, language } = useLanguage();
  const { lightMode } = useTheme();
  const { clearNotifications } = useNotifications();
  const clearNotificationsRef = useRef(clearNotifications);
  clearNotificationsRef.current = clearNotifications;
  
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
  const [confirmMergeTables, setConfirmMergeTables] = useState(false);
  const [merging, setMerging] = useState(false);
  const [confirmClearArchiveModal, setConfirmClearArchiveModal] = useState(false);
  const [clearingArchive, setClearingArchive] = useState(false);

  // Pre-order state (entered here, persisted before confirm)
  const [preOrderItems, setPreOrderItems] = useState<any[]>([]);
  const [availableProducts, setAvailableProducts] = useState<any[]>([]);
  const [preOrderSaving, setPreOrderSaving] = useState(false);

  // ─── Reservation note: pill → keyboard-top floating input (shared morph) ───
  const [reservationNote, setReservationNote] = useState('');
  const [noteEditing, setNoteEditing] = useState(false);
  const loadedNoteRef = useRef('');
  const noteEditingRef = useRef(false);
  const notePillRef = useRef<HTMLButtonElement | null>(null);
  const noteInputRef = useRef<HTMLInputElement | null>(null);
  const pillRectRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);
  const [noteRect, setNoteRect] = useState({ top: 0, left: 0, width: 320, height: 170 });
  const [noteMorph, setNoteMorph] = useState({ x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 0 });
  const noteRectRef = useRef(noteRect);
  const noteMorphRef = useRef(noteMorph);
  const noteClosingRef = useRef(false);
  const noteLayoutHeightRef = useRef(0);

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

      const { data: productsData } = await supabase
        .from('products')
        .select('id, name_az, name_en, name_ru, price, is_available')
        .eq('is_available', true)
        .order('name_az', { ascending: true });
      setAvailableProducts(productsData || []);
    } catch (error) {
      console.error(error);
      toast.error('Rezervasiya məlumatları yüklənərkən xəta', { id: 'action-toast' });
    } finally {
      setLoading(false);
    }
  };

  /* ─── Pre-order helpers ─── */
  const productName = (p: any) => {
    if (language === 'az' && p.name_az) return p.name_az;
    if (language === 'ru' && p.name_ru) return p.name_ru;
    if (language === 'en' && p.name_en) return p.name_en;
    return p.name_az || p.name_en || p.name_ru || 'Məhsul';
  };

  // Latest in-memory pre-order list, kept in a ref so rapid taps always build on
  // the newest state (setState updaters must stay pure — no side effects inside).
  const preOrderItemsRef = useRef<any[]>([]);
  // Serialize saves with a promise chain so replace-all writes (including the
  // empty-draft delete on modal close) always land in order and can never race a
  // fresh load: loadPreOrder awaits the chain, so a queued delete finishes BEFORE
  // the GET returns — otherwise a delayed delete would wipe drafts mid-session
  // and look like "drafts vanish when I open the modal".
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  const persistPreOrder = (resId: string, items: any[]) => {
    if (!resId) return;
    const payload = {
      reservation_id: resId,
      replace: true,
      items: items.map(i => ({
        id: i.id || undefined,
        product_id: i.product_id,
        product_name: i.product_name,
        quantity: i.quantity,
        unit_price: i.unit_price,
      })),
    };
    setPreOrderSaving(true);
    saveQueueRef.current = saveQueueRef.current
      .then(async () => {
        try {
          await fetch('/api/reservations/pre-order-items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        } catch (e) {
          console.error('Failed to save pre-order', e);
        }
      })
      .then(() => setPreOrderSaving(false));
  };

  const loadPreOrder = async (resId: string) => {
    try {
      await saveQueueRef.current;
      const res = await fetch(`/api/reservations/pre-order-items?reservation_id=${resId}`);
      const data = await res.json();
      if (res.ok) {
        const items = (data.items || []).map((it: any) => ({
          id: it.id || undefined,
          product_id: it.product_id,
          product_name: it.product_name,
          unit_price: Number(it.unit_price || 0),
          quantity: it.quantity || 1,
        }));
        preOrderItemsRef.current = items;
        setPreOrderItems(items);
      }
    } catch (e) {
      console.error('Failed to load pre-order', e);
    }
  };

  const applyPreOrderItems = (next: any[]) => {
    preOrderItemsRef.current = next;
    setPreOrderItems(next);
    if (selectedRes?.id) persistPreOrder(selectedRes.id, next);
  };

  const addPreOrderItem = (p: any) => {
    const prev = preOrderItemsRef.current;
    const existing = prev.find(i => i.product_id === p.id);
    const next = existing
      ? prev.map(i => i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i)
      : [...prev, {
          product_id: p.id,
          product_name: productName(p),
          unit_price: Number(p.price) || 0,
          quantity: 1,
        }];
    applyPreOrderItems(next);
  };

  const changePreOrderQty = (productId: string, delta: number) => {
    const next = preOrderItemsRef.current
      .map(i => i.product_id === productId ? { ...i, quantity: i.quantity + delta } : i)
      .filter(i => i.quantity > 0);
    applyPreOrderItems(next);
  };

  const removePreOrderItem = (productId: string) => {
    const next = preOrderItemsRef.current.filter(i => i.product_id !== productId);
    applyPreOrderItems(next);
  };

  const selectReservation = (r: any, view: 'main' | 'tables') => {
    setSelectedRes(r);
    setModalView(view);
    setSelectedTableIds(Array.isArray(r.table_ids) ? r.table_ids : []);
    setReservationNote(r.notes || r.note || '');
    loadedNoteRef.current = r.notes || r.note || '';
    setNoteEditing(false);
    preOrderItemsRef.current = [];
    setPreOrderItems([]);
    if (r.id) loadPreOrder(r.id);
  };

  const saveReservationNote = async (note: string) => {
    const resId = selectedRes?.id;
    if (!resId) return;
    try {
      const res = await apiFetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: resId, data: { notes: note } }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Qeyd saxlanmadı');
      }
      toast.success('Qeyd yadda saxlandı');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // Desired resting box: bottom edge pinned to the keyboard top (real boundary,
  // no hardcoded height). No keyboard → pinned to the bottom of the viewport.
  const noteTargetRect = () => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const innerH = typeof window !== 'undefined' ? window.innerHeight : 0;
    const vh = vv ? vv.height : innerH;
    const voT = vv ? vv.offsetTop : 0;
    const voL = vv ? vv.offsetLeft : 0;
    const vw = vv ? vv.width : window.innerWidth;
    const W = Math.min(vw - 32, 560);
    const H = 170;
    const keyboardUp = vh < innerH - 40 || innerH < noteLayoutHeightRef.current - 40;
    const bottom = keyboardUp ? (vv ? voT + vh - 12 : innerH - 12) : innerH - 24;
    return { top: bottom - H, left: voL + (vw - W) / 2, width: W, height: H };
  };

  // Morph the editor from wherever it currently is to `rect` — continuity, no
  // teleport; position + size + radius + opacity all animate together.
  const commitNoteRect = (rect: { top: number; left: number; width: number; height: number }) => {
    const last = noteRectRef.current;
    if (Math.abs(rect.top - last.top) < 0.5 && Math.abs(rect.left - last.left) < 0.5 && Math.abs(rect.width - last.width) < 0.5) return;
    const m = noteMorphRef.current;
    const curCX = last.left + last.width / 2 + m.x;
    const curCY = last.top + last.height / 2 + m.y;
    const curW = last.width * m.scaleX;
    const curH = last.height * m.scaleY;
    noteRectRef.current = rect;
    setNoteRect(rect);
    setNoteMorph({
      x: curCX - (rect.left + rect.width / 2),
      y: curCY - (rect.top + rect.height / 2),
      scaleX: curW / rect.width,
      scaleY: curH / rect.height,
      opacity: 1,
    });
  };

  // Re-run on every keyboard/viewport event AND a poll timer, so the input
  // always rides the keyboard top — even where visualViewport resize never fires.
  const updateNotePosition = () => {
    if (!noteEditingRef.current || noteClosingRef.current) return;
    commitNoteRect(noteTargetRect());
  };

  const openNoteEditor = () => {
    const el = notePillRef.current;
    if (!el) return;
    const pr = el.getBoundingClientRect();
    pillRectRef.current = { left: pr.left, top: pr.top, width: pr.width, height: pr.height };
    // Stage invisible at the pill's spot — NO input appears there. The morph
    // target is the keyboard-top, so it travels there immediately.
    noteRectRef.current = { left: pr.left, top: pr.top, width: pr.width, height: pr.height };
    setNoteRect(noteRectRef.current);
    setNoteMorph({ x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 0 });
    noteLayoutHeightRef.current = typeof window !== 'undefined' ? window.innerHeight : 0;
    // Synchronous mount + focus inside the tap gesture → keyboard opens on the
    // FIRST tap; the morph to the keyboard top starts on the same click.
    flushSync(() => setNoteEditing(true));
    noteEditingRef.current = true;
    noteInputRef.current?.focus();
    updateNotePosition();
  };

  const collapseNoteEditor = () => {
    if (noteClosingRef.current) return;
    const rect = noteRectRef.current;
    const pill = pillRectRef.current;
    if (!rect || !pill) {
      setNoteEditing(false);
      return;
    }
    noteClosingRef.current = true;
    // Reverse morph back onto the pill's spot; keyboard stays open until done.
    setNoteMorph({
      x: pill.left + pill.width / 2 - (rect.left + rect.width / 2),
      y: pill.top + pill.height / 2 - (rect.top + rect.height / 2),
      scaleX: pill.width / rect.width,
      scaleY: pill.height / rect.height,
      opacity: 1,
    });
  };

  const handleNoteComplete = () => {
    if (!noteClosingRef.current) return;
    noteInputRef.current?.blur();
    setNoteEditing(false);
    noteClosingRef.current = false;
  };

  const commitNote = () => {
    if (reservationNote !== loadedNoteRef.current) {
      loadedNoteRef.current = reservationNote;
      saveReservationNote(reservationNote);
    }
    if (noteClosingRef.current || !noteEditingRef.current) return;
    collapseNoteEditor();
  };

  const closeReservation = (clearDraft = false) => {
    if (noteEditing) {
      if (reservationNote !== loadedNoteRef.current) {
        loadedNoteRef.current = reservationNote;
        saveReservationNote(reservationNote);
      }
      noteClosingRef.current = true;
      noteInputRef.current?.blur();
      setNoteEditing(false);
    }
    noteClosingRef.current = false;
    const resId = selectedRes?.id;
    if (clearDraft && resId) {
      // Abandoned pre-order draft: wipe it from the backend so it never leaks
      // back onto the table / POS. Queued behind any in-flight save.
      persistPreOrder(resId, []);
    }
    setSelectedRes(null);
    preOrderItemsRef.current = [];
    setPreOrderItems([]);
  };

  useEffect(() => {
    fetchData();
    clearNotificationsRef.current();
  }, []);

  // Mirror noteEditing for event handlers + follow the keyboard as it opens/closes
  useEffect(() => {
    noteEditingRef.current = noteEditing;
  }, [noteEditing]);

  useEffect(() => {
    const reposition = () => updateNotePosition();
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    vv?.addEventListener('resize', reposition);
    window.addEventListener('resize', reposition);
    return () => {
      vv?.removeEventListener('resize', reposition);
      window.removeEventListener('resize', reposition);
    };
  }, []);

  // Poll while editing: catches devices where visualViewport resize never fires,
  // so the input still lands exactly above the keyboard when it opens.
  useEffect(() => {
    if (!noteEditing) return;
    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      updateNotePosition();
      timer = setTimeout(loop, 60);
    };
    loop();
    return () => clearTimeout(timer);
  }, [noteEditing]);

  /* ─── Realtime: sync with POS / other sources ─── */
  useEffect(() => {
    const channel = createRealtimeChannel('reservations-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_floors' }, () => fetchData())
      .subscribe();
    return () => { removeRealtimeChannel(channel); };
  }, []);

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

      const res = await apiFetch('/api/reservations', {
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

  const handleArchive = async (id: string) => {
    try {
      await apiFetch('/api/reservations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'archive', id }) });
      fetchData();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleRestore = async (id: string) => {
    try {
      await apiFetch('/api/reservations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restore', id }) });
      fetchData();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleSendToKitchen = async (id: string) => {
    try {
      await apiFetch('/api/reservations/send-kitchen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reservation_id: id }) });
      toast.success('Mətbəxə göndərildi');
      fetchData();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleGuestArrived = async (id: string) => {
    try {
      await apiFetch('/api/reservations/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reservation_id: id, status: 'checked_in' }) });
      fetchData();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleConfirmReservation = async (id: string) => {
    try {
      await apiFetch('/api/reservations/reserve-table', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reservation_id: id, table_ids: selectedTableIds }) });
      toast.success('Rezervasiya təsdiqləndi');
      fetchData();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch('/api/reservations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id }) });
      toast.success('Rezervasiya silindi');
      fetchData();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleMergeTables = async () => {
    if (!selectedRes || selectedTableIds.length < 2) return;
    setMerging(true);
    try {
      const res = await apiFetch('/api/reservations/merge-tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservation_id: selectedRes.id,
          table_numbers: selectedTableIds.map(id => Number(tables.find(t => t.id === id)?.table_number)),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Birləşdirmə uğursuz oldu');
      }
      toast.success(`${selectedTableIds.length} masa birləşdirildi`);
      setConfirmMergeTables(false);
      setSelectedTableIds([]);
      setModalView('main');
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Birləşdirmə xətası');
    } finally {
      setMerging(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      const res = await apiFetch('/api/reservations/reserve-table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservation_id: selectedRes.id,
          table_ids: selectedTableIds,
          pre_order_items: preOrderItems,
          guest_count: selectedRes.guests ?? 0,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Bron xetasi');
      }

      toast.success(`${selectedRes.name} ucun masalar bron edildi!`);
      closeReservation();
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
    if (!Array.isArray(selectedTableIds) || selectedTableIds.length === 0) return toast.error("Əvvəlcə masanı təyin edin");
    
    const occupiedIds = new Set(tables.filter(t => t.status && t.status !== 'empty').map(t => t.id));
    const alreadyTaken = selectedTableIds.filter(id => occupiedIds.has(id));
    if (alreadyTaken.length > 0) {
      const nums = alreadyTaken.map(id => tables.find(t => t.id === id)?.table_number).filter(Boolean).join(', ');
      return toast.error(`Masa ${nums} artıq doludur. Başqa masa seçin.`);
    }
    
    const tablesLabel = selectedTableIds.map(id => tables.find(t => t.id === id)?.table_number).join(' + ');
    localStorage.setItem('saito_pos_preorder_context', JSON.stringify({
      resId: selectedRes.id,
      tableIds: selectedTableIds,
      guestName: selectedRes.name,
      tablesLabel,
    }));
    const params = new URLSearchParams({
      resId: selectedRes.id,
      tableIds: selectedTableIds.join(','),
      guestName: selectedRes.name,
      tablesLabel,
    });
    window.location.href = `/admin/pos?${params.toString()}`;
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

      {loading ? <TableSkeleton rows={8} /> : filteredReservations.length === 0 ? (
        <div className={`rounded-[3rem] border py-20 text-center shadow-2xl ${lightMode ? 'bg-white border-zinc-100' : 'bg-[#0f0f0f] border-white/5'}`}>
          <Calendar size={40} className="mx-auto mb-4 opacity-20" />
          <p className={`text-sm font-black uppercase tracking-widest ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>Rezervasiya tapılmadı</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5">
          {filteredReservations.map(res => (
            <ReservationCard
              key={res.id}
              res={res}
              selectionMode={archiveSelectionMode}
              isSelected={selectedArchiveIds.includes(res.id)}
              onToggleSelect={(id) => {
                setSelectedArchiveIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
              }}
              onSelect={(r) => { selectReservation(r, 'main'); }}
              statusBadge={(s) => {
                const cfg: Record<string, { label: string; cls: string; dot: string }> = {
                  pending:   { label: 'Gözləmədə',   cls: 'bg-amber-500/10 text-amber-500 border-amber-500/30',   dot: 'bg-amber-400' },
                  confirmed: { label: 'Təsdiqləndi', cls: 'bg-green-500/10 text-green-500 border-green-500/30',   dot: 'bg-green-400' },
                  checked_in:{ label: 'Daxil oldu',  cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30',     dot: 'bg-blue-400' },
                  completed: { label: 'Tamamlandı',  cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-400' },
                  cancelled: { label: 'Ləğv edildi', cls: 'bg-red-500/10 text-red-500 border-red-500/30',         dot: 'bg-red-400' },
                  no_show:   { label: 'Gəlmədi',     cls: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/30',     dot: 'bg-zinc-400' },
                  expired:   { label: 'Vaxtı keçib', cls: 'bg-rose-500/10 text-rose-400 border-rose-500/30',     dot: 'bg-rose-400' },
                  archived:  { label: 'Arxivləndi',  cls: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30',     dot: 'bg-zinc-400' },
                };
                const c = cfg[s] || { label: s.replace('_', ' '), cls: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/30', dot: 'bg-zinc-400' };
                return (
                  <span className={`inline-flex items-center gap-2 px-5 py-2 rounded-2xl border text-sm font-black uppercase tracking-widest whitespace-nowrap ${c.cls}`}>
                    <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
                    {c.label}
                  </span>
                );
              }}
              onEdit={(r) => { setEditingReservation(r); setUpsertModalOpen(true); }}
              onDelete={(id, guest) => setConfirmDeleteReservation({ id, guest })}
              onArchive={handleArchive}
              onRestore={handleRestore}
            />
          ))}
        </div>
      )}


      <AnimatePresence>
        {selectedRes && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => closeReservation(true)} className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md" />
              <motion.div
                initial={{ opacity: 0, y: 60, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 40, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 35, mass: 0.9 }}
                className={`fixed inset-0 m-auto z-[110] w-[95%] h-fit max-h-[90vh] overflow-hidden rounded-[3.5rem] shadow-[0_50px_100px_rgba(0,0,0,0.4)] border border-white/20 backdrop-blur-3xl ${lightMode ? 'bg-white/90 text-zinc-900' : 'bg-zinc-900/90 text-white'} ${modalView === 'main' ? 'max-w-2xl' : 'max-w-4xl'}`}
            >
              <div className="p-10 relative overflow-y-auto max-h-[90vh] custom-scrollbar">
                <button onClick={() => closeReservation(true)} className="absolute top-8 right-10 p-3 rounded-full bg-white/5 hover:bg-white/10 transition-colors"><X size={24} /></button>

                <AnimatePresence mode="popLayout" initial={false}>
                  {modalView === 'main' && (
                    <motion.div key="main-view" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.2 }} className="flex flex-col gap-8">
                       <motion.div layout="position">
                          <div className="flex flex-wrap items-center gap-2 mb-3">
                             <span className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest text-[#D4AF37] bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center gap-1.5">
                               <Calendar size={12} /> Rezervasiya
                             </span>
                             {selectedRes.status && (
                               <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${lightMode ? 'bg-zinc-100 text-zinc-600' : 'bg-white/10 text-white/70'}`}>
                                 {selectedRes.status}
                               </span>
                             )}
                          </div>
                          <h2 className="text-5xl font-black tracking-tighter mb-2 leading-none">{selectedRes.name}</h2>
                          <p className="text-xs font-black uppercase tracking-widest opacity-50 mb-2">Öncədən Sifariş · Rezervasiya Kartı</p>
                          <div className="flex gap-4 text-xs font-black opacity-40 uppercase tracking-widest mb-2">
                             <span className="flex items-center gap-1.5 text-blue-500"><Phone size={14} /> {selectedRes.phone}</span>
                             <span className="flex items-center gap-1.5"><Star size={14} /> {selectedRes.visitCount} Ziyarət</span>
                          </div>
                           <div className="flex flex-wrap gap-3 mb-8">
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

                           {/* Note — pill stays in place; tap morphs it (shared element)
                               into a floating editor above the keyboard, close reverses it */}
                           <div className="mb-8">
                             <button
                               ref={notePillRef}
                               onClick={openNoteEditor}
                               className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold border transition-colors max-w-full ${noteEditing ? 'invisible' : ''} ${lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-600 hover:bg-zinc-200' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}
                             >
                               <Tag size={13} />
                               <span className="truncate min-w-0 max-w-[240px]">{reservationNote ? reservationNote : 'Qeyd əlavə et'}</span>
                             </button>
                           </div>

                           {selectedRes.pre_order_items && (() => {
                             const items = typeof selectedRes.pre_order_items === 'string' ? JSON.parse(selectedRes.pre_order_items) : selectedRes.pre_order_items;
                             const total = (items || []).reduce((s: number, i: any) => s + (i.unit_price * i.quantity), 0);
                             if (!items || items.length === 0) return null;
                              return (
                                <div className={`overflow-hidden rounded-[2rem] border mb-6 ${lightMode ? 'bg-white border-zinc-200' : 'bg-white/5 border-white/10'}`}>
                                  <div className="px-6 py-3 flex items-center justify-between border-b border-zinc-200/60 dark:border-white/10">
                                    <div className="flex items-center gap-2.5">
                                      <ShoppingBag size={14} className="opacity-50" />
                                      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-white/50">Öncədən Sifariş</span>
                                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-zinc-200 text-zinc-600 dark:bg-white/10 dark:text-white/80">PRE-ORDER</span>
                                    </div>
                                    <span className="text-sm font-black text-zinc-500 dark:text-white/70">₼{total.toFixed(2)}</span>
                                  </div>
                                  <div className="p-6 pt-4">
                                  <div className="flex flex-col gap-1.5 mb-4">
                                    {items.slice(0, 5).map((item: any, i: number) => (
                                      <div key={i} className="flex items-center justify-between text-xs">
                                        <span className="font-bold truncate">{item.quantity}x {item.product_name}</span>
                                        <span className="text-[10px] opacity-60">₼{(item.unit_price * item.quantity).toFixed(2)}</span>
                                      </div>
                                    ))}
                                    {items.length > 5 && <span className="text-[10px] opacity-40">+{items.length - 5} daha</span>}
                                  </div>
                                   {(selectedRes.status === 'confirmed' || selectedRes.status === 'waiting') && (
                                      <button onClick={() => handleSendToKitchen(selectedRes.id)} className="w-full py-4 rounded-2xl bg-blue-500 text-white text-xs font-black uppercase tracking-widest hover:bg-blue-600 active:scale-[0.98] transition-all shadow-lg flex items-center justify-center gap-2">
                                        <ChefHat size={16} /> Aşpaza Göndər <span className="opacity-70">· PRE-ORDER</span>
                                      </button>
                                   )}
                                   </div>
                                </div>
                              );
                            })()}

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

                                {/* Pre-order picker */}
                                <div className={`overflow-hidden rounded-[2.5rem] border ${lightMode ? 'bg-white border-zinc-200' : 'bg-white/5 border-white/10'}`}>
                                  <div className="px-7 py-3.5 border-b border-zinc-200/60 dark:border-white/10 flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                      <ShoppingBag size={16} className="opacity-50" />
                                      <span className="text-[11px] font-black uppercase tracking-widest text-zinc-400 dark:text-white/50">Öncədən Sifariş</span>
                                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-zinc-200 text-zinc-600 dark:bg-white/10 dark:text-white/80">PRE-ORDER</span>
                                    </div>
                                    {preOrderSaving ? <span className="text-[10px] font-black text-zinc-400">Yaddaşa alınır…</span> : <span className="text-[9px] font-black uppercase tracking-widest opacity-50">Rezervasiya üçün öncədən sifariş</span>}
                                  </div>
                                  <div className="p-7 pt-5">

                                  {preOrderItems.length > 0 && (
                                    <div className="flex flex-col gap-2 mb-4">
                                      {preOrderItems.map(item => (
                                        <div key={item.product_id} className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 border ${lightMode ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-400/[0.08] border-slate-400/25'}`}>
                                          <div className="flex flex-col min-w-0">
                                            <span className="text-sm font-bold truncate">{item.product_name}</span>
                                            <span className="text-[9px] font-black uppercase tracking-widest opacity-50">Pre-order</span>
                                          </div>
                                          <div className="flex items-center gap-2 flex-shrink-0">
                                            <button onClick={() => changePreOrderQty(item.product_id, -1)} className={`w-8 h-8 rounded-full flex items-center justify-center font-black transition-colors ${lightMode ? 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300' : 'bg-white/10 text-white hover:bg-white/20'}`}>−</button>
                                            <span className="text-sm font-black tabular-nums w-6 text-center">{item.quantity}</span>
                                            <button onClick={() => changePreOrderQty(item.product_id, 1)} className={`w-8 h-8 rounded-full flex items-center justify-center font-black transition-colors ${lightMode ? 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300' : 'bg-white/10 text-white hover:bg-white/20'}`}>+</button>
                                            <button onClick={() => removePreOrderItem(item.product_id)} className="ml-1 text-red-400 hover:text-red-300"><Trash2 size={16} /></button>
                                          </div>
                                        </div>
                                      ))}
                                      <div className="flex items-center justify-between gap-3 flex-wrap">
                                        <p className="text-xs font-black opacity-70">
                                          Cəmi: {preOrderItems.reduce((s: number, i: any) => s + i.unit_price * i.quantity, 0).toFixed(2)} ₼
                                        </p>
                                        {(selectedRes.status === 'confirmed' || selectedRes.status === 'waiting') && (
                                          <button onClick={() => handleSendToKitchen(selectedRes.id)} className="px-4 py-2.5 rounded-xl bg-blue-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-blue-600 active:scale-95 transition-all flex items-center gap-2">
                                            <ChefHat size={14} /> Aşpaza Göndər <span className="opacity-70">· PRE-ORDER</span>
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  <div className="flex flex-wrap gap-2 max-h-44 overflow-y-auto custom-scrollbar">
                                    {availableProducts.length === 0 && <p className="text-xs opacity-40">Məhsul yoxdur</p>}
                                    {availableProducts.map(p => (
                                      <button key={p.id} onClick={() => addPreOrderItem(p)} className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${lightMode ? 'bg-zinc-100 border-zinc-200 hover:bg-zinc-200 text-zinc-700' : 'bg-white/5 border-white/10 hover:bg-white/15 text-white'}`}>
                                        <Plus size={12} /> {productName(p)} <span className="opacity-50">{(Number(p.price) || 0).toFixed(2)} ₼</span>
                                      </button>
                                    ))}
                                  </div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                                  <div className="flex gap-4">
                                    {selectedRes.status === 'confirmed' && (
                                       <button onClick={() => handleGuestArrived(selectedRes.id)} className="flex-[2] py-6 rounded-[2.2rem] bg-amber-500 text-white font-black uppercase tracking-widest shadow-2xl shadow-amber-500/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3">
                                        <Users size={24} /> Qonaq Gəldi
                                      </button>
                                    )}
                                    {selectedRes.status === 'waiting' && (
                                       <button onClick={() => handleSendToKitchen(selectedRes.id)} className="flex-[2] py-6 rounded-[2.2rem] bg-blue-500 text-white font-black uppercase tracking-widest shadow-2xl shadow-blue-500/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3">
                                        <Zap size={24} /> Aşpaza Göndər
                                      </button>
                                    )}
                                    {selectedRes.status !== 'confirmed' && selectedRes.status !== 'waiting' && (
                                       <button onClick={() => handleConfirmReservation(selectedRes.id)} className="flex-[2] py-6 rounded-[2.2rem] bg-green-500 text-white font-black uppercase tracking-widest shadow-2xl shadow-green-500/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3">
                                        <CheckCircle size={24} /> Təsdiqlə
                                      </button>
                                    )}
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
                         {selectedTableIds.length >= 2 && (
                           <button onClick={() => setConfirmMergeTables(true)} className={`w-full py-6 rounded-[2.5rem] font-black uppercase tracking-widest shadow-2xl transition-all ${lightMode ? 'bg-amber-500 text-white shadow-amber-500/30' : 'bg-amber-500 text-white shadow-amber-500/30'}`}>
                             <Merge size={20} className="inline mr-2" /> Birləşdir (Merge)
                           </button>
                         )}
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
        onConfirm={() => confirmDeleteReservation ? handleDelete(confirmDeleteReservation.id) : Promise.resolve()} 
        onCancel={() => setConfirmDeleteReservation(null)} 
      />
      
      <ClearArchiveModal 
        open={confirmClearArchiveModal} 
        clearing={clearingArchive} 
        onConfirm={async () => {
          setClearingArchive(true);
          try {
            if (archiveSelectionMode && selectedArchiveIds.length > 0) {
              await apiFetch('/api/reservations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete_batch', ids: selectedArchiveIds }),
              });
              toast.success(`${selectedArchiveIds.length} rezervasiya silindi`);
              setSelectedArchiveIds([]);
              setArchiveSelectionMode(false);
            } else {
              await apiFetch('/api/reservations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete_batch', statuses: ['cancelled', 'archived', 'expired'] }),
              });
              toast.success('Arxiv təmizləndi');
            }
            fetchData();
          } catch (e: any) {
            toast.error(e.message || 'Silinmə xətası');
          } finally {
            setClearingArchive(false);
            setConfirmClearArchiveModal(false);
          }
        }}
        onCancel={() => setConfirmClearArchiveModal(false)} 
        title={t('delete_selected')} 
        description={t('archive_delete_confirm')} 
      />

      <AnimatePresence>
        {confirmMergeTables && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !merging && setConfirmMergeTables(false)} className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} onClick={(e) => e.stopPropagation()} className={`relative w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl border ${lightMode ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-white/10'}`}>
              <div className="text-center mb-6">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${lightMode ? 'bg-amber-100 text-amber-600' : 'bg-amber-500/15 text-amber-400'}`}>
                  <Merge size={28} />
                </div>
                <h3 className="text-2xl font-black tracking-tight mb-2">Masaları Birləşdir</h3>
                <p className={`text-sm ${lightMode ? 'text-zinc-600' : 'text-white/60'}`}>
                  {selectedTableIds.length} masa birləşdiriləcək: <strong>{selectedTableIds.map(id => tables.find(t => t.id === id)?.table_number).filter(Boolean).join(' + ')}</strong>
                </p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setConfirmMergeTables(false)} disabled={merging} className={`flex-1 py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all ${lightMode ? 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}>Ləğv et</button>
                <button onClick={handleMergeTables} disabled={merging} className="flex-1 py-4 rounded-2xl bg-amber-500 text-white text-sm font-black uppercase tracking-widest hover:bg-amber-600 active:scale-95 transition-all disabled:opacity-50">
                  {merging ? 'Birləşdirilir...' : 'Birləşdir'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {noteEditing && createPortal(
        <motion.div
          layoutId="res-note"
          initial={false}
          animate={{
            top: noteRect.top,
            left: noteRect.left,
            width: noteRect.width,
            height: noteRect.height,
            x: noteMorph.x,
            y: noteMorph.y,
            scaleX: noteMorph.scaleX,
            scaleY: noteMorph.scaleY,
            borderRadius: 24,
            opacity: noteMorph.opacity,
          }}
          transition={{
            opacity: { duration: 0.12, ease: 'easeOut' },
            default: { type: 'tween', duration: 0.42, ease: [0.22, 1.2, 0.36, 1] },
          }}
          onUpdate={(v: any) => {
            noteMorphRef.current = { x: v.x, y: v.y, scaleX: v.scaleX, scaleY: v.scaleY, opacity: v.opacity };
          }}
          onAnimationComplete={handleNoteComplete}
          className={`fixed z-[300] overflow-hidden rounded-[2rem] border shadow-2xl ${lightMode ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-white/10'}`}
        >
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${lightMode ? 'text-zinc-500' : 'text-white/50'}`}>
                <Tag size={12} /> Rezervasiya Qeydi
              </span>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={commitNote}
                className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${lightMode ? 'bg-zinc-900 text-white hover:bg-zinc-700' : 'bg-white text-zinc-900 hover:bg-white/80'}`}
              >
                Tamam
              </button>
            </div>
            <input
              ref={noteInputRef}
              autoFocus
              type="text"
              value={reservationNote}
              onChange={e => setReservationNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); commitNote(); } }}
              placeholder="Qeyd yaz..."
              className={`w-full rounded-2xl px-4 py-4 text-base font-semibold outline-none border transition-all ${lightMode ? 'bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white placeholder:text-zinc-500 focus:border-white/30'}`}
            />
          </div>
        </motion.div>,
        document.body
      )}
    </div>
  );
}

