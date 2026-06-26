'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutGrid, ShoppingCart, CreditCard, X, CheckCircle, Sun, Moon, Maximize, Minimize, ChevronDown, AlertTriangle, XCircle, Globe, GitMerge, Check } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { usePos } from './hooks/usePos';
import { TableCard } from './components/TableCard';
import { ActionSheet } from './components/ActionSheet';
import { ProductGrid } from './components/ProductGrid';
import { CartPanel } from './components/CartPanel';
import { ModifierSheet } from './components/ModifierSheet';
import { ReceiptModal } from '../orders/components/ReceiptModal';
import { LiquidDropdown } from '@/components/ui/LiquidDropdown';
import { toast } from '@/lib/toast';
import SimpleToaster from '@/app/admin/components/layout/SimpleToaster';
import { supabase } from '@/lib/supabase';
import type { PosModifierSelection, PaymentInfo, PosProduct, PosTable, LossItem } from './types/shared';

import { MeshBroadcaster } from '@/lib/mesh/Broadcaster';
import { localStore } from '@/lib/sync/OfflineStore';

export default function POSPage() {
  const { t, language, setLanguage } = useLanguage();
  const { lightMode, setLightMode } = useTheme();
  const pos = usePos();

  useEffect(() => {
    MeshBroadcaster.startListening();
    const interval = setInterval(async () => {
      const offlineTables = await localStore.getAllTables();
      if (offlineTables.length > 0) {}
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const [orderDelayMinutes, setOrderDelayMinutes] = useState(30);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [actionSheetTable, setActionSheetTable] = useState<PosTable | null>(null);
  const [modifierOpen, setModifierOpen] = useState(false);
  const [modifierProduct, setModifierProduct] = useState<PosProduct | null>(null);

  const [orderButtonStatus, setOrderButtonStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [isDirty, setIsDirty] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<number[]>([]);
  const [splitMode, setSplitMode] = useState(false);
  const [selectedForSplit, setSelectedForSplit] = useState<number[]>([]);
  const [transferMode, setTransferMode] = useState(false);
  const [transferSource, setTransferSource] = useState<number | null>(null);
  const [transferTarget, setTransferTarget] = useState<number | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [outOfStock, setOutOfStock] = useState<Set<string>>(new Set());
  const posRef = useRef<HTMLDivElement>(null);
  const [warningOpen, setWarningOpen] = useState(false);
  const [canUndo, setUndoData] = useState<{ action: string; data: any; message: string } | null>(null);

  useEffect(() => {
    const handler = (e: any) => { if (e.detail?.action) setUndoData(e.detail); };
    window.addEventListener('saito_pos_undo_available', handler);
    return () => window.removeEventListener('saito_pos_undo_available', handler);
  }, []);

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [billSplitOpen, setBillSplitOpen] = useState(false);
  const [billSplitItems, setBillSplitItems] = useState<any[]>([]);
  const [payOrder, setPayOrder] = useState<any>(null);
  const [payOrderId, setPayOrderId] = useState<string | null>(null);
  const [payTableNumber, setPayTableNumber] = useState<number>(0);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<'cash' | 'card'>('card');
  const [payTip, setPayTip] = useState(0);

  // Rezervasiya konteksti: rezervasiyadan POS-a kecid zamani saxlanilir
  const [reservationCtx, setReservationCtx] = useState<{
    resId: string;
    tableIds: string[];
    guestName: string;
    tablesLabel: string;
  } | null>(null);

  // Bron edilmis masa detali: POS-da bron masaya basilanda acilir (read-only)
  const [reservedTableDetail, setReservedTableDetail] = useState<PosTable | null>(null);

  const selectedFloorName = selectedFloor || pos.floors[0]?.name || '';

  useEffect(() => {
    if (!selectedFloor && pos.floors.length > 0) setSelectedFloor(pos.floors[0].name);
  }, [pos.floors, selectedFloor]);

  useEffect(() => {
    supabase.from('settings').select('order_delay_minutes').single().then(({ data }) => {
      if (data?.order_delay_minutes) setOrderDelayMinutes(data.order_delay_minutes);
    });
  }, []);

  useEffect(() => {
    fetch('/api/stock-check').then(r => r.json()).then(d => setOutOfStock(new Set(d.outOfStock || []))).catch(() => {});
  }, []);

  useEffect(() => {
    // Check for incoming pre-order from reservations
    const contextStr = localStorage.getItem('saito_preorder_context');
    if (contextStr) {
      const ctx = JSON.parse(contextStr);
      localStorage.removeItem('saito_preorder_context');
      
      // Auto-setup POS for this reservation
      const table = pos.tables.find(t => t.id === ctx.tableIds[0]);
      if (table) {
        pos.selectTable(table);
        toast.success(`${ctx.guestName} üçün öncədən sifariş yığılır`);
      }
    }
  }, [pos.tables]);

  useEffect(() => {
    // Check for incoming pre-order context from reservations page
    const preorderStr = localStorage.getItem('saito_pos_preorder_context');
    if (preorderStr && pos.tables.length > 0) {
      const ctx = JSON.parse(preorderStr);
      localStorage.removeItem('saito_pos_preorder_context');
      
      const targetTable = pos.tables.find(t => t.id === ctx.tableIds[0]);
      if (targetTable) {
        pos.selectTable(targetTable);
        // Rezervasiya kontekstini saxla - CartPanel bron rejiminde acilsin
        setReservationCtx(ctx);
        toast.success(`${ctx.guestName} ucun onceden sifaris daxil edilir (Masa: ${ctx.tablesLabel})`);
      }
    }
  }, [pos.tables]);

  const activeFloor = pos.floors.find(f => f.name === selectedFloorName);
  const overdueTables = useMemo(() => {
    const map = new Map<number, boolean>();
    const now = new Date();
    const threshold = orderDelayMinutes || 20;

    for (const table of pos.tables) {
      if (table.status === 'occupied' && table.lastOrderTime) {
        const diff = (now.getTime() - new Date(table.lastOrderTime).getTime()) / 60000;
        if (diff > threshold) {
          map.set(table.table_number, true);
        }
      }
    }
    return map;
  }, [pos.tables, orderDelayMinutes]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      posRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleAddProduct = useCallback((p: PosProduct) => {
    setModifierProduct(p);
    setModifierOpen(true);
  }, []);

  const handleUpdateQty = useCallback((idx: number, delta: number) => {
    pos.updateCartItemQty(idx, delta);
    setIsDirty(true);
  }, [pos]);

  const cartCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    pos.cart?.items.forEach(it => { counts[it.product_id] = (counts[it.product_id] || 0) + it.quantity; });
    return counts;
  }, [pos.cart]);

  const handlePlaceOrder = useCallback(async () => {
    // Eger rezervasiya rejimindeyiksə, reserve-table API-ni cagir
    if (reservationCtx) {
      setOrderButtonStatus('loading');
      try {
        const cartItems = pos.cart?.items ?? [];
        const preOrderItems = cartItems.map(item => ({
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          modifiers: item.modifiers ?? [],
          special_notes: item.special_notes || null,
        }));
        const res = await fetch('/api/reservations/reserve-table', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reservation_id: reservationCtx.resId,
            table_ids: reservationCtx.tableIds,
            pre_order_items: preOrderItems,
            guest_count: pos.cart?.guest_count ?? 0,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Bron xetasi');
        toast.success(`${reservationCtx.guestName} ucun masa bron edildi!`);
        setReservationCtx(null);
        setOrderButtonStatus('success');
        setIsDirty(false);
        window.setTimeout(() => setOrderButtonStatus('idle'), 1400);
        pos.backToFloor();
        pos.fetchData();
      } catch (e: any) {
        toast.error(e.message || 'Bron zamani xeta bas verdi');
        setOrderButtonStatus('error');
        window.setTimeout(() => setOrderButtonStatus('idle'), 1600);
      }
      return;
    }
    // Normal POS sifarisi
    setOrderButtonStatus('loading');
    try {
      await pos.placeOrder();
      setOrderButtonStatus('success');
      setIsDirty(false);
      window.setTimeout(() => setOrderButtonStatus('idle'), 1400);
    } catch {
      setOrderButtonStatus('error');
      window.setTimeout(() => setOrderButtonStatus('idle'), 1600);
    }
  }, [pos, reservationCtx]);

  const openPayment = useCallback(async (tableNumber: number, amount: number, orderIds: string[]) => {
    const orderId = orderIds[0];
    if (!orderId) return;
    const { data: orderData } = await supabase.from('orders').select('*, order_items(*, products(name, name_az, name_en, name_ru))').eq('id', orderId).single();
    setPayOrder(orderData);
    setPayTableNumber(tableNumber);
    setPayAmount(amount);
    setPayOrderId(orderId);
    setPaymentOpen(true);
  }, []);

  const handleCloseBill = useCallback(async (method?: string, tip?: number) => {
    if (!payOrderId) return;
    setOrderButtonStatus('loading');
    const payment: PaymentInfo = {
      method: (method as any) || (payMethod === 'cash' ? 'cash' : 'card'),
      cash_amount: (method === 'cash' ? payAmount + (tip || 0) : 0),
      card_amount: (method === 'card' ? payAmount + (tip || 0) : 0),
      tip: tip || payTip,
    };
    await pos.closeBill(payOrderId, payment);
    setPaymentOpen(false);
    setOrderButtonStatus('success');
    window.setTimeout(() => setOrderButtonStatus('idle'), 1400);
  }, [payOrderId, payMethod, payAmount, payTip, pos]);

  const handleTableTap = useCallback(async (table: PosTable) => {
    if (mergeMode) {
      if (table.status === 'merged') return;
      if (selectedForMerge.includes(table.table_number)) setSelectedForMerge(p => p.filter(n => n !== table.table_number));
      else setSelectedForMerge(p => [...p, table.table_number]);
      return;
    }
    if (transferMode) {
      if (table.status === 'merged') return;
      if (!transferSource) setTransferSource(table.table_number);
      else if (!transferTarget && table.table_number !== transferSource) setTransferTarget(table.table_number);
      return;
    }
    if (table.status === 'merged') return;
    // Bron edilmis masaya basilanda detail modal ac, normal order view-e kecme
    if (table.status === 'reserved') {
      setReservedTableDetail(table);
      return;
    }
    pos.selectTable(table);
  }, [mergeMode, selectedForMerge, transferMode, transferSource, transferTarget, pos]);

  return (
    <div ref={posRef} className={`h-screen w-full flex flex-col bg-[var(--theme-bg)] text-[var(--theme-text)] overflow-hidden ${(actionSheetOpen || modifierOpen) ? 'no-scroll' : ''}`}>
      <style jsx global>{`.no-scroll { overflow: hidden !important; height: 100vh !important; }`}</style>
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <AnimatePresence mode="wait">
          {pos.activeView === 'floor' && (
            <div key="floor" className={`h-full flex flex-col border ${lightMode ? 'border-zinc-200 bg-[#f8f8fa]' : 'border-white/[0.04] bg-[#070707]'} rounded-[40px] m-3 shadow-2xl relative overflow-hidden`}>
              <div className="flex-shrink-0 p-6 pb-2 relative z-[60]">
                <div className="flex items-center justify-between mb-4 gap-4">
                   <div className="flex items-center gap-3">
                     <h1 className="text-3xl font-black tracking-tighter mr-2">POS</h1>
                     {pos.floors.length > 0 && <LiquidDropdown options={pos.floors.map(f => ({ id: f.name, label: f.name }))} activeId={selectedFloorName} onChange={(id) => setSelectedFloor(id)} />}
                   </div>
                   <div className="flex items-center gap-3">
                     <button onClick={() => setLightMode(!lightMode)} className="p-3 rounded-full bg-[#efeff4] dark:bg-white/[0.08] border border-transparent dark:border-white/[0.1] text-[#8e8e93] hover:text-zinc-900 dark:hover:text-white transition-all shadow-sm">
                       {lightMode ? <Moon size={20} /> : <Sun size={20} />}
                     </button>
                     <button onClick={toggleFullscreen} className="p-3 rounded-full bg-[#efeff4] dark:bg-white/[0.08] border border-transparent dark:border-white/[0.1] text-[#8e8e93] hover:text-zinc-900 dark:hover:text-white transition-all shadow-sm">
                       {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                     </button>
                   </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 pt-2">
                {activeFloor ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                    {(activeFloor.tables ?? []).filter(t => t.status !== 'merged').sort((a, b) => a.table_number - b.table_number).map(table => (
                      <TableCard key={table.table_number} table={table} onTap={() => handleTableTap(table)} onAction={() => { setActionSheetTable(table); setActionSheetOpen(true); }} isSelected={(mergeMode && selectedForMerge.includes(table.table_number))} selectionMode={mergeMode || transferMode} isTransferSource={transferMode && transferSource === table.table_number} isTransferTarget={transferMode && transferTarget === table.table_number} />
                    ))}
                  </div>
                ) : <div className="flex items-center justify-center h-full text-[#8e8e93] uppercase tracking-widest font-black text-xs">Mərtəbə tapılmadı</div>}
              </div>
            </div>
          )}
          {pos.activeView === 'order' && pos.selectedTable && (
            <motion.div key="order" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="h-full w-full flex flex-col md:flex-row overflow-hidden bg-[var(--theme-bg)]">
              <div className="flex-1 min-w-0 h-full p-6 flex flex-col overflow-hidden">
                <ProductGrid products={pos.products} categories={pos.categories} onAddProduct={handleAddProduct} cartCounts={cartCounts} outOfStock={outOfStock} />
              </div>
              <div className={`w-full md:w-[400px] h-full border-l p-6 flex flex-col flex-shrink-0 overflow-hidden ${lightMode ? 'bg-[#fcfcfd] border-zinc-200 shadow-2xl' : 'bg-black border-white/[0.05]'}`}>
                  <CartPanel
                    cart={pos.cart}
                    onUpdateQty={handleUpdateQty}
                    onPlaceOrder={handlePlaceOrder}
                    onClearDraft={pos.clearDrafts}
                    onBack={() => { setIsDirty(false); setReservationCtx(null); pos.backToFloor(); }}
                    orderButtonStatus={orderButtonStatus}
                    isDirty={isDirty}
                    hasExistingOrder={pos.selectedTable?.status !== 'empty'}
                    isReservationMode={!!reservationCtx}
                    reservationId={reservationCtx?.resId}
                    guestName={reservationCtx?.guestName}
                    onUpdateGuests={(d) => { const c = pos.cart; if (!c) return; const n = Math.max(1, c.guest_count + d); pos.setCart({ ...c, guest_count: n }); pos.setTables(p => p.map(t => t.table_number === c.table_number ? { ...t, guest_count: n } : t)); supabase.from('tables').update({ guest_count: n }).eq('table_number', c.table_number).then(() => {}); }}
                    onRecordLoss={async (items, reason) => { await fetch('/api/finance/loss', { method: 'POST', body: JSON.stringify({ table_number: pos.selectedTable?.table_number, reason, items, source: 'pos' }) }); toast.success(`Itki qeyd edildi`); pos.fetchData(); }}
                  />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ActionSheet 
        table={actionSheetTable} open={actionSheetOpen} onClose={() => { setActionSheetOpen(false); setSplitMode(false); }} onAddOrder={() => { pos.selectTable(actionSheetTable!); setActionSheetOpen(false); }} onMerge={() => { setMergeMode(true); setSelectedForMerge([actionSheetTable!.table_number]); setActionSheetOpen(false); }} onTransfer={() => { setTransferMode(true); setTransferSource(actionSheetTable!.table_number); setActionSheetOpen(false); }} onCloseBill={() => { openPayment(actionSheetTable!.table_number, actionSheetTable!.total_amount, actionSheetTable!.order_ids ?? []); setActionSheetOpen(false); }} 
        onUnmerge={() => { setSplitMode(true); setSelectedForSplit([actionSheetTable!.table_number]); }}
        onBillSplit={async () => { 
          if (!actionSheetTable?.order_ids?.[0]) return;
          const { data } = await supabase.from('order_items').select('*').eq('order_id', actionSheetTable.order_ids[0]);
          setBillSplitItems(data || []);
          setPayOrderId(actionSheetTable.order_ids[0]);
          setBillSplitOpen(true);
          setActionSheetOpen(false);
        }}
        onPrint={() => window.print()} onSaveDraft={() => {}} onCancelTable={() => { if (actionSheetTable) { pos.dismissTable(actionSheetTable.table_number); setActionSheetOpen(false); } }}
        mergeMode={mergeMode} transferMode={transferMode} splitMode={splitMode} allTables={pos.tables} selectedForMerge={selectedForMerge} selectedForSplit={selectedForSplit} transferSource={transferSource} transferTarget={transferTarget}
        onToggleSplit={(n) => { if (selectedForSplit.includes(n)) setSelectedForSplit(p => p.filter(x => x !== n)); else setSelectedForSplit(p => [...p, n]); }}
        onConfirmSplit={async () => { const toSplit = selectedForSplit.filter(n => n !== selectedForSplit[0]); if (toSplit.length === 0) { toast.error("Ayırmaq üçün ən azı bir masa seçin"); return; } try { const res = await fetch('/api/orders/split', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table_numbers: toSplit }) }); if (!res.ok) throw new Error("Ayırma xətası"); toast.success("Masalar ayrıldı"); setSplitMode(false); setSelectedForSplit([]); setActionSheetOpen(false); pos.fetchData(); } catch (e: any) { toast.error(e.message); } }}
        onCancelMode={() => { setMergeMode(false); setTransferMode(false); setSplitMode(false); setSelectedForMerge([]); setSelectedForSplit([]); setTransferSource(null); setTransferTarget(null); }}
        onConfirmMerge={async () => { await pos.mergeTables(selectedForMerge); setMergeMode(false); setSelectedForMerge([]); }}
        onConfirmTransfer={async () => { if (transferSource && transferTarget) { await pos.transferTable(transferSource, transferTarget); setTransferMode(false); setTransferSource(null); setTransferTarget(null); } }}
      />
      <ModifierSheet 
        open={modifierOpen} 
        productName={modifierProduct?.name || ''} 
        productPrice={modifierProduct?.price || 0} 
        variants={(pos as any).variants?.filter((v: any) => v.product_id === modifierProduct?.id)}
        onClose={() => setModifierOpen(false)} 
        onConfirm={(m, n, vId) => { pos.addToCart(modifierProduct!, m, n, vId); setModifierOpen(false); }} 
      />
      <BillSplitModal 
        open={billSplitOpen} 
        orderId={payOrderId || ''} 
        items={billSplitItems} 
        onClose={() => setBillSplitOpen(false)} 
        onSuccess={() => { pos.fetchData(); }} 
      />
      {paymentOpen && payOrder && (
        <ReceiptModal order={payOrder} onClose={() => setPaymentOpen(false)} getProductName={(it) => { const p = it.products as any; if (!p) return ''; const transName = p.translations?.[language]?.name; if (transName) return transName; return (language === 'az' ? p.name_az : language === 'en' ? p.name_en : p.name_ru) || p.name || ''; }} onPay={handleCloseBill} />
      )}
      <AnimatePresence>
        {pos.lastUndo && (
          <motion.div initial={{ y: 50, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 50, opacity: 0, scale: 0.9 }} className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-4 px-6 py-3.5 rounded-2xl bg-[#D4AF37] text-black shadow-[0_15px_40px_rgba(212,175,55,0.4)] border border-white/20">
            <div className="w-1.5 h-1.5 rounded-full bg-black/40 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest">Əməliyyat Uğurla İcra Edildi</span>
            <button onClick={() => pos.performUndo()} className="px-4 py-2 rounded-xl bg-black text-white text-[9px] font-black uppercase tracking-widest hover:bg-black/80 transition-all shadow-md active:scale-95">Geri Al</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── BRON EDİLMİŞ MASA DETALI MODALI ── */}
      <AnimatePresence>
        {reservedTableDetail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
            onClick={() => setReservedTableDetail(null)}
          >
            <motion.div
              initial={{ y: 60, scale: 0.95 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 60, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              onClick={e => e.stopPropagation()}
              className={`w-full max-w-md rounded-[2.5rem] p-8 flex flex-col gap-6 ${
                lightMode ? 'bg-white border border-zinc-200 shadow-2xl' : 'bg-[#111] border border-white/10 shadow-2xl'
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-500/15 text-amber-500 border border-amber-500/20">
                      BRON EDİLİB
                    </span>
                  </div>
                  <h2 className="text-4xl font-black tracking-tighter">
                    Masa {reservedTableDetail.table_number}
                  </h2>
                  {reservedTableDetail.reservation_name && (
                    <p className="text-lg font-bold opacity-60 mt-1">{reservedTableDetail.reservation_name}</p>
                  )}
                </div>
                <button
                  onClick={() => setReservedTableDetail(null)}
                  className={`p-3 rounded-2xl transition-all ${
                    lightMode ? 'bg-zinc-100 hover:bg-zinc-200' : 'bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Details */}
              <div className={`grid grid-cols-2 gap-4`}>
                {reservedTableDetail.reservation_time && (
                  <div className={`p-4 rounded-2xl ${
                    lightMode ? 'bg-zinc-50 border border-zinc-100' : 'bg-white/5 border border-white/5'
                  }`}>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Saat</p>
                    <p className="text-2xl font-black">{reservedTableDetail.reservation_time}</p>
                    {(() => {
                      const [h, m] = reservedTableDetail.reservation_time.split(':').map(Number);
                      const now = new Date();
                      const resTime = new Date();
                      resTime.setHours(h, m, 0);
                      const diff = Math.floor((resTime.getTime() - now.getTime()) / 60000);
                      if (diff > 0) return <p className="text-[10px] font-bold text-amber-500 mt-1 uppercase tracking-tighter">{diff} dəqiqə qalıb</p>;
                      if (diff < 0) return <p className="text-[10px] font-bold text-rose-500 mt-1 uppercase tracking-tighter">Gecikir</p>;
                      return null;
                    })()}
                  </div>
                )}
                {(reservedTableDetail.guest_count ?? 0) > 0 && (
                  <div className={`p-4 rounded-2xl ${
                    lightMode ? 'bg-zinc-50 border border-zinc-100' : 'bg-white/5 border border-white/5'
                  }`}>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Qonaq</p>
                    <p className="text-2xl font-black">{reservedTableDetail.guest_count} nəfər</p>
                  </div>
                )}
              </div>

              {/* Info note */}
              <div className={`p-4 rounded-2xl flex items-center gap-3 ${
                lightMode ? 'bg-amber-50 border border-amber-100' : 'bg-amber-500/10 border border-amber-500/20'
              }`}>
                <AlertTriangle size={18} className="text-amber-500 flex-shrink-0" />
                <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                  Bu masa bron edilib. Ofisiant gəlişi gözləyir. Sifariş rezervasiyadan daxil edilib.
                </p>
              </div>

              <button
                onClick={() => setReservedTableDetail(null)}
                className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-sm transition-all ${
                  lightMode ? 'bg-zinc-900 text-white hover:bg-zinc-700' : 'bg-white text-black hover:bg-white/90'
                }`}
              >
                Bağla
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
