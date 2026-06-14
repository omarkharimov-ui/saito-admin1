'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutGrid, ShoppingCart, CreditCard, X, CheckCircle, Sun, Moon, Maximize, Minimize, ChevronDown, AlertTriangle, XCircle } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { usePos } from './hooks/usePos';
import { TableCard } from './components/TableCard';
import { ActionSheet } from './components/ActionSheet';
import { ProductGrid } from './components/ProductGrid';
import { CartPanel } from './components/CartPanel';
import { ModifierSheet } from './components/ModifierSheet';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import type { PosModifierSelection, PaymentInfo, PosProduct, PosTable } from './types/shared';

const tabs = [
  { id: 'floor' as const, icon: LayoutGrid, label: 'Masalar' },
  { id: 'order' as const, icon: ShoppingCart, label: 'Sifariş' },
  { id: 'billing' as const, icon: CreditCard, label: 'Ödəniş' },
];

export default function POSPage() {
  const { t } = useLanguage();
  const { lightMode, setLightMode } = useTheme();
  const pos = usePos();

  const [orderDelayMinutes, setOrderDelayMinutes] = useState(30);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [actionSheetTable, setActionSheetTable] = useState<PosTable | null>(null);
  const [modifierOpen, setModifierOpen] = useState(false);
  const [modifierProduct, setModifierProduct] = useState<PosProduct | null>(null);

  const [orderButtonStatus, setOrderButtonStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<number[]>([]);
  const [transferMode, setTransferMode] = useState(false);
  const [transferSource, setTransferSource] = useState<number | null>(null);
  const [transferTarget, setTransferTarget] = useState<number | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
  const [floorDropdownOpen, setFloorDropdownOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const posRef = useRef<HTMLDivElement>(null);
  const orderTabTouchedRef = useRef(false);

  /* ── Cancel / Loss state ── */
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [lossModalOpen, setLossModalOpen] = useState(false);
  const [lossReason, setLossReason] = useState('other');
  const [lossAmount, setLossAmount] = useState(0);
  const [lossNote, setLossNote] = useState('');
  const [lossSubmitting, setLossSubmitting] = useState(false);

  /* ── Payment modal ── */
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [payOrderId, setPayOrderId] = useState<string | null>(null);
  const [payTableNumber, setPayTableNumber] = useState<number>(0);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<'cash' | 'card'>('card');
  const [payTip, setPayTip] = useState(0);

  const selectedFloorName = selectedFloor || pos.floors[0]?.name || '';

  // Auto-select first floor
  useEffect(() => {
    if (!selectedFloor && pos.floors.length > 0) {
      setSelectedFloor(pos.floors[0].name);
    }
  }, [pos.floors, selectedFloor]);

  /* ── Fetch kitchen delay threshold ── */
  useEffect(() => {
    supabase.from('settings').select('order_delay_minutes').single().then(({ data }) => {
      if (data?.order_delay_minutes) setOrderDelayMinutes(data.order_delay_minutes);
    });
  }, []);

  const activeFloor = pos.floors.find(f => f.name === selectedFloorName);

  /* ── Overdue pending orders (per floor) ── */
  const overdueTableNumbers = useMemo(() => {
    const now = Date.now();
    const cutoff = orderDelayMinutes * 60 * 1000;
    const set = new Set<number>();
    const tables = activeFloor?.tables ?? [];
    for (const t of tables) {
      if (t.has_pending && t.oldest_pending_at) {
        const elapsed = now - new Date(t.oldest_pending_at).getTime();
        if (elapsed > cutoff) set.add(t.table_number);
      }
    }
    return set;
  }, [activeFloor?.tables, orderDelayMinutes]);

  /* ── Cart counts by product for badges ── */
  const cartCounts: Record<string, number> = {};
  if (pos.cart) {
    for (const item of pos.cart.items) {
      cartCounts[item.product_id] = (cartCounts[item.product_id] || 0) + item.quantity;
    }
  }

  /* ── Fullscreen ── */
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      posRef.current?.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  /* ── Add product with optional modifier sheet ── */
  const handleAddProduct = useCallback((product: PosProduct) => {
    pos.addToCart(product);
  }, [pos]);

  /* ── Place order ── */
  const handlePlaceOrder = useCallback(async () => {
    setOrderButtonStatus('loading');
    try {
      await pos.placeOrder();
      setOrderButtonStatus('success');
      window.setTimeout(() => setOrderButtonStatus('idle'), 1400);
    } catch {
      setOrderButtonStatus('error');
      window.setTimeout(() => setOrderButtonStatus('idle'), 1600);
    }
  }, [pos]);

  /* ── Open payment for a table ── */
  const openPayment = useCallback((tableNumber: number, amount: number, orderIds: string[]) => {
    setPayTableNumber(tableNumber);
    setPayAmount(amount);
    setPayOrderId(orderIds[0] || null);
    setPayMethod('card');
    setPayTip(0);
    setPaymentOpen(true);
    pos.setActiveView('floor');
  }, [pos]);

  const handleCloseBill = useCallback(async () => {
    if (!payOrderId) return;
    setOrderButtonStatus('loading');
    const payment: PaymentInfo = {
      method: payMethod === 'cash' ? 'cash' : 'card',
      cash_amount: payMethod === 'cash' ? payAmount + payTip : 0,
      card_amount: payMethod === 'card' ? payAmount + payTip : 0,
      tip: payTip,
    };
    await pos.closeBill(payOrderId, payment);
    setPaymentOpen(false);
    setPayOrderId(null);
    setOrderButtonStatus('success');
    window.setTimeout(() => setOrderButtonStatus('idle'), 1400);
  }, [payOrderId, payMethod, payAmount, payTip, pos]);

  /* ── Table actions ── */
  const handleTableTap = useCallback(async (table: PosTable) => {
    if (mergeMode) {
      if (table.status === 'merged') return; // can't select already-merged tables
      if (selectedForMerge.includes(table.table_number)) {
        setSelectedForMerge(prev => prev.filter(n => n !== table.table_number));
      } else {
        setSelectedForMerge(prev => [...prev, table.table_number]);
      }
      return;
    }
    if (transferMode) {
      if (table.status === 'merged') return;
      if (!transferSource) {
        setTransferSource(table.table_number);
        setTransferTarget(null);
        toast.success(`Mənbə: Masa ${table.table_number}`, { id: 'transfer-source' });
      } else if (!transferTarget && table.table_number !== transferSource) {
        setTransferTarget(table.table_number);
        toast.success(`Hədəf: Masa ${table.table_number} — təsdiq üçün "Köçür" düyməsinə basın`, { id: 'transfer-target' });
      } else if (table.table_number === transferSource) {
        setTransferSource(null);
        setTransferTarget(null);
        toast('Mənbə ləğv edildi', { id: 'transfer-cancel' });
      } else {
        setTransferTarget(table.table_number);
      }
      return;
    }
    if (table.status === 'merged') return; // can't open merged table
    // Direct: tap table → go to order view
    pos.selectTable(table);
  }, [mergeMode, selectedForMerge, transferMode, transferSource, transferTarget, pos]);

  const handleTableAction = useCallback((table: PosTable) => {
    setActionSheetTable(table);
    setActionSheetOpen(true);
  }, []);

  const handleActionAddOrder = useCallback(() => {
    if (actionSheetTable) {
      pos.selectTable(actionSheetTable);
      setActionSheetTable(null);
    }
  }, [actionSheetTable, pos]);

  const handleActionCloseBill = useCallback(() => {
    if (actionSheetTable && actionSheetTable.total_amount > 0) {
      openPayment(actionSheetTable.table_number, actionSheetTable.total_amount, actionSheetTable.order_ids ?? []);
      setActionSheetTable(null);
    }
  }, [actionSheetTable, openPayment]);

  const handleActionMerge = useCallback(() => {
    if (actionSheetTable) {
      setMergeMode(true);
      setSelectedForMerge([actionSheetTable.table_number]);
      pos.setActiveView('floor');
      setActionSheetOpen(false);
      setActionSheetTable(null);
    }
  }, [actionSheetTable, pos]);

  /* ── Cancel table (no loss record) ── */
  const handleActionCancelTable = useCallback(() => {
    if (actionSheetTable) {
      setCancelConfirmOpen(true);
    }
  }, [actionSheetTable]);

  const confirmCancelTable = useCallback(async () => {
    if (!actionSheetTable) return;
    try {
      const res = await fetch(`/api/orders/cancel?table_number=${actionSheetTable.table_number}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Masa ${actionSheetTable.table_number} təmizləndi`);
      pos.fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi');
    }
    setCancelConfirmOpen(false);
    setActionSheetOpen(false);
    setActionSheetTable(null);
  }, [actionSheetTable, pos]);

  /* ── Report loss ── */
  const handleActionReportLoss = useCallback(() => {
    if (actionSheetTable) {
      setLossAmount(actionSheetTable.total_amount || 0);
      setLossReason('customer_dissatisfaction');
      setLossNote('');
      setLossModalOpen(true);
    }
  }, [actionSheetTable]);

  const lossReasons = [
    { key: 'customer_dissatisfaction', label: 'Müştəri narazılığı' },
    { key: 'late_order', label: 'Gec sifariş' },
    { key: 'waiter_error', label: 'Ofisiant səhvi' },
    { key: 'spilled_damaged', label: 'Tökülmə / zədə' },
    { key: 'preparation_error', label: 'Səhv hazırlıq' },
    { key: 'customer_walkout', label: 'Müştəri getdi' },
    { key: 'other', label: 'Digər' },
  ];

  const submitLoss = useCallback(async () => {
    if (!actionSheetTable) return;
    setLossSubmitting(true);
    try {
      const reasonLabel = lossReasons.find(r => r.key === lossReason)?.label || lossReason;
      const payload = {
        table_number: actionSheetTable.table_number,
        reason: lossReason,
        reason_text: reasonLabel,
        total_amount: lossAmount,
        note: lossNote,
        order_ids: actionSheetTable.order_ids ?? [],
        items: [],
      };
      const res = await fetch('/api/finance/loss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`İtki qeyd edildi: ${reasonLabel} — ${lossAmount.toFixed(2)} ₼`);
      pos.fetchData();
      setLossModalOpen(false);
      setActionSheetOpen(false);
      setActionSheetTable(null);
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi');
    } finally {
      setLossSubmitting(false);
    }
  }, [actionSheetTable, lossReason, lossAmount, lossNote, pos]);

  const handleSplitTable = useCallback(async () => {
    if (!actionSheetTable) return;
    try {
      const res = await fetch('/api/orders/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_number: actionSheetTable.table_number }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Masa ${actionSheetTable.table_number} ayrıldı`);
      pos.fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi');
    }
    setActionSheetOpen(false);
    setActionSheetTable(null);
  }, [actionSheetTable, pos]);

  return (
    <div ref={posRef} className="h-full w-full overflow-hidden flex flex-col bg-[var(--theme-bg)] text-[var(--theme-text)]">
      {/* ── View container ── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {/* ═══ FLOOR VIEW ═══ */}
          {pos.activeView === 'floor' && (
            <div className={`h-full overflow-hidden flex flex-col border ${lightMode ? 'border-gray-200' : 'border-white/[0.04]'} rounded-3xl m-2`}>
              {/* Top bar */}
              <div className="flex-shrink-0 p-4 sm:p-5 pb-0">
                <div className="flex items-center justify-between mb-4 gap-3">
                  <div className="flex items-center gap-3">
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight">POS</h1>
                    {/* Floor dropdown */}
                    {pos.floors.length > 0 && (
                      <div className="relative">
                        <button onClick={() => setFloorDropdownOpen(!floorDropdownOpen)}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)] border border-[var(--theme-border)] hover:bg-[var(--theme-panel)] shadow-sm">
                          {selectedFloorName} <ChevronDown size={14} className={`transition-transform ${floorDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        <AnimatePresence>
                          {floorDropdownOpen && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setFloorDropdownOpen(false)} />
                              <motion.div
                                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -6, scale: 0.96 }}
                                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                className="absolute top-full left-0 mt-1 z-20 min-w-[160px] rounded-xl border p-1 bg-[var(--theme-panel)] border-[var(--theme-border)] shadow-xl origin-top-left"
                              >
                                {pos.floors.map(f => (
                                  <motion.button
                                    key={f.name}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => { setSelectedFloor(f.name); setFloorDropdownOpen(false); }}
                                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                                      f.name === selectedFloorName
                                        ? 'bg-[var(--theme-accent)] text-black'
                                        : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-surface-soft)]'
                                    }`}>
                                    {f.name}
                                  </motion.button>
                                ))}
                              </motion.div>
                            </>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <button onClick={() => setLightMode(!lightMode)}
                      className="p-2.5 rounded-2xl transition-all bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-panel)] shadow-sm">
                      <Moon size={18} />
                    </button>
                    <button onClick={toggleFullscreen}
                      className="p-2.5 rounded-2xl transition-all bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-surface)] hover:text-[var(--theme-text)] shadow-sm">
                      {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                    </button>
                    {mergeMode && (
                      <button onClick={() => { pos.mergeTables(selectedForMerge); setMergeMode(false); setSelectedForMerge([]); }}
                        disabled={selectedForMerge.length < 2}
                        className={`px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-30 transition-all ${lightMode ? 'bg-amber-600 text-white border border-amber-700' : 'bg-gold/10 border border-gold/20 text-gold'}`}>
                        {selectedForMerge.length} masanı birləşdir
                      </button>
                    )}
                    <>
                      <button onClick={() => { setMergeMode(!mergeMode); setSelectedForMerge([]); }}
                        className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all ${
                          mergeMode
                            ? lightMode ? 'bg-blue-50 border border-blue-200 text-blue-700 shadow-sm' : 'bg-blue-500/10 border border-blue-500/20 text-blue-300'
                            : lightMode
                              ? 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200 shadow-sm'
                              : 'bg-white/[0.04] border border-white/10 text-white/40 hover:text-white/60'
                        }`}>Birləşdir</button>
                      <button onClick={async () => {
                        if (transferSource && transferTarget) {
                          try {
                            await pos.transferTable(transferSource, transferTarget);
                          } catch (e: any) {
                            toast.error(e.message || 'Köçürmə xətası', { id: 'transfer-error' });
                            return;
                          }
                          setTransferMode(false);
                          setTransferSource(null);
                          setTransferTarget(null);
                        } else {
                          setTransferMode(!transferMode);
                          setTransferSource(null);
                          setTransferTarget(null);
                        }
                      }}
                        className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all ${
                          transferSource && transferTarget
                            ? lightMode ? 'bg-emerald-600 text-white border border-emerald-700 shadow-md' : 'bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                            : transferMode
                              ? lightMode ? 'bg-violet-50 border border-violet-200 text-violet-700 shadow-sm' : 'bg-violet-500/10 border border-violet-500/20 text-violet-300'
                              : lightMode
                                ? 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200 shadow-sm'
                                : 'bg-white/[0.04] border border-white/10 text-white/40 hover:text-white/60'
                        }`}>
                        {transferSource && transferTarget ? `Köçür: ${transferSource} → ${transferTarget}` : transferMode ? (transferSource ? `Masa ${transferSource} → ?` : 'Mənbə seç') : 'Köçür'}
                      </button>
                    </>
                  </div>
                </div>
              </div>

              {/* Overdue banner */}
              {overdueTableNumbers.size > 0 && (
                <div className={`flex-shrink-0 mx-4 sm:mx-5 mt-2 mb-1 px-4 py-2.5 rounded-2xl flex items-center gap-2.5 text-xs font-semibold border ${
                  lightMode ? 'bg-red-50 border-red-200 text-red-700' : 'bg-red-950/40 border-red-800/40 text-red-300'
                }`}>
                  <AlertTriangle size={14} className="flex-shrink-0" />
                  <span>{overdueTableNumbers.size} masada sifariş {orderDelayMinutes}+ dəq qəbul edilməyib</span>
                </div>
              )}

              {/* Tables */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 pt-3">
                {pos.loading && pos.tables.length === 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-3">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div key={i} className="rounded-2xl border p-4 bg-[var(--theme-surface-muted)] border-[var(--theme-border)] shadow-sm">
                        <div className="h-4 w-12 rounded-full animate-pulse mb-3 bg-[var(--theme-surface-soft)]" />
                        <div className="h-3 w-20 rounded-full animate-pulse mb-2 bg-[var(--theme-surface-soft)]" />
                        <div className="h-3 w-16 rounded-full animate-pulse bg-[var(--theme-surface-soft)]" />
                      </div>
                    ))}
                  </div>
                ) : activeFloor ? (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={selectedFloor || 'default'}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
                      className="w-full grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6"
                    >
                      {(activeFloor.tables ?? [])
                        .filter(t => t.status !== 'merged')
                        .map(table => (
                          <TableCard
                            key={table.table_number}
                            table={table}
                            onTap={() => handleTableTap(table)}
                            onAction={() => handleTableAction(table)}
                            isSelected={mergeMode && selectedForMerge.includes(table.table_number)}
                            isTransferSource={transferMode && transferSource === table.table_number}
                            isTransferTarget={transferMode && transferTarget === table.table_number}
                            isOverdue={overdueTableNumbers.has(table.table_number)}
                          />
                        ))}
                    </motion.div>
                  </AnimatePresence>
                ) : (
                  <div className={`flex items-center justify-center h-full ${lightMode ? 'text-gray-400' : 'text-white/20'}`}>
                    <p className="text-sm">Mərtəbə tapılmadı</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ ORDER VIEW ═══ */}
          {pos.activeView === 'order' && pos.selectedTable && (
            <motion.div
              key="order"
              initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
              className="h-full flex flex-col md:flex-row overflow-hidden"
            >
              <div className="flex-1 h-full min-w-0 overflow-hidden p-4 sm:p-5 flex flex-col">
                <ProductGrid
                  products={pos.products}
                  categories={pos.categories}
                  onAddProduct={handleAddProduct}
                  cartCounts={cartCounts}
                />
              </div>
              <div className={`w-full md:w-[360px] xl:w-[400px] h-full md:max-h-full border-t md:border-t-0 md:border-l p-4 flex flex-col flex-shrink-0 overflow-hidden ${lightMode ? 'border-gray-200 bg-gray-50/50' : 'border-white/[0.06] bg-neutral-950/50'}`}>
                  <CartPanel
                    cart={pos.cart}
                    onUpdateQty={pos.updateCartItemQty}
                    onRemove={pos.removeCartItem}
                    onPlaceOrder={handlePlaceOrder}
                    onClear={pos.clearCart}
                    onBack={pos.backToFloor}
                    orderButtonStatus={orderButtonStatus}
                    onUpdateGuests={(delta: number) => {
                      const c = pos.cart;
                      if (!c) return;
                      const newCount = Math.max(1, c.guest_count + delta);
                      pos.setCart({ ...c, guest_count: newCount });
                    }}
                    mergedChildNumbers={(pos.selectedTable?.merged_orders as any[])?.map((m: any) => m.table_number) ?? []}
                  />
              </div>
            </motion.div>
          )}

          {/* ═══ BILLING VIEW ═══ */}
          {pos.activeView === 'billing' && (
            <motion.div
              key="billing"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="h-full overflow-y-auto p-4 sm:p-6"
            >
              <h2 className={`text-lg font-bold mb-4 ${lightMode ? 'text-gray-900' : 'text-white'}`}>Ödənişlər</h2>
              {pos.tables.filter(t => t.status !== 'empty' && t.total_amount > 0).length === 0 ? (
                <div className={`flex flex-col items-center justify-center h-64 ${lightMode ? 'text-gray-400' : 'text-white/20'}`}>
                  <CreditCard size={48} className="mb-4 opacity-30" />
                  <p className="text-sm">Aktiv ödəniş yoxdur</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pos.tables.filter(t => t.status !== 'empty' && t.total_amount > 0).map(table => (
                    <motion.div
                      key={table.table_number}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex items-center justify-between p-4 rounded-2xl border ${lightMode ? 'border-gray-200 bg-white shadow-sm' : 'border-white/[0.08] bg-white/[0.02]'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)]">
                          {table.table_number}
                        </div>
                        <div>
                          <p className="text-sm font-semibold">Masa {table.table_number}</p>
                          <p className={`text-xs ${lightMode ? 'text-gray-500' : 'text-white/40'}`}>{table.guest_count} nəfər · {table.order_count} sifariş</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-lg font-black ${lightMode ? 'text-amber-700' : 'text-gold'}`}>{table.total_amount.toFixed(2)} ₼</span>
                        <button onClick={() => openPayment(table.table_number, table.total_amount, table.order_ids ?? [])}
                          className={`px-4 py-2.5 rounded-xl text-xs font-bold active:scale-95 transition-all ${lightMode ? 'bg-amber-600 text-white border border-amber-700 hover:bg-amber-700 shadow-sm' : 'bg-white text-black border border-zinc-600 hover:bg-zinc-100'}`}>
                          Ödə
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Bottom Tab Bar ── */}
      <div className="flex-shrink-0 border-t border-[var(--theme-border)] bg-[var(--theme-surface-muted)] backdrop-blur-xl">
        <div className="flex items-center justify-around px-2 py-1.5">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = pos.activeView === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (tab.id === 'order' && !pos.selectedTable) {
                    if (orderTabTouchedRef.current) {
                      toast.error('Əvvəlcə masa seçin', { id: 'no-table-order' });
                    }
                    orderTabTouchedRef.current = true;
                    pos.setActiveView('floor');
                  } else {
                    pos.setActiveView(tab.id);
                  }
                }}
                className={`flex flex-col items-center gap-0.5 px-6 py-2 rounded-xl transition-all ${
                  isActive ? 'text-[var(--theme-text)] bg-[var(--theme-surface-soft)] shadow-sm' : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]'
                }`}
              >
                <Icon size={20} />
                <span className="text-[9px] font-bold tracking-wider uppercase">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Action Sheet ── */}
      <ActionSheet
        table={actionSheetTable}
        open={actionSheetOpen}
        onClose={() => { setActionSheetOpen(false); setActionSheetTable(null); }}
        onAddOrder={handleActionAddOrder}
        onMerge={handleActionMerge}
        onTransfer={() => { setTransferMode(true); pos.setActiveView('floor'); setActionSheetOpen(false); setActionSheetTable(null); }}
        onSplitBill={handleSplitTable}
        onCloseBill={handleActionCloseBill}
        onPrint={() => { setActionSheetOpen(false); setActionSheetTable(null); }}
        onCancelTable={handleActionCancelTable}
        onReportLoss={handleActionReportLoss}
        onSaveDraft={() => { pos.saveCart(); setActionSheetOpen(false); setActionSheetTable(null); }}
      />

      {/* ── Modifier Sheet ── */}
      {modifierProduct && (
        <ModifierSheet
          open={modifierOpen}
          productName={(pos.language === 'az' ? modifierProduct.name_az : pos.language === 'en' ? modifierProduct.name_en : modifierProduct.name_ru) || modifierProduct.name}
          productPrice={modifierProduct.price}
          onClose={() => { setModifierOpen(false); setModifierProduct(null); }}
          onConfirm={(modifiers, notes) => {
            pos.addToCart(modifierProduct, modifiers, notes);
            setModifierOpen(false);
            setModifierProduct(null);
          }}
        />
      )}

      {/* ── Payment Sheet ── */}
      <AnimatePresence>
        {paymentOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
              onClick={() => orderButtonStatus !== 'loading' && setPaymentOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 200, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-8"
            >
              <div className="max-w-sm mx-auto rounded-3xl border p-5 bg-[var(--theme-surface-muted)] border-[var(--theme-border)] shadow-2xl backdrop-blur-xl">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className={`text-lg font-bold ${lightMode ? 'text-gray-900' : 'text-white'}`}>Masa {payTableNumber}</p>
                    <p className={`text-sm ${lightMode ? 'text-gray-500' : 'text-white/40'}`}>Ödəniş</p>
                  </div>
                  <button onClick={() => orderButtonStatus !== 'loading' && setPaymentOpen(false)}
                    className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]">
                    <X size={18} />
                  </button>
                </div>

                <div className="text-center mb-4">
                  <p className={`text-3xl font-black tracking-tight ${lightMode ? 'text-amber-700' : 'text-gold'}`}>{payAmount.toFixed(2)} ₼</p>
                </div>

                <div className="flex gap-2 mb-4">
                  <button onClick={() => setPayMethod('card')}
                    className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all border ${
                      payMethod === 'card' ? 'bg-gold/10 border-gold/25 text-gold' : 'bg-[var(--theme-surface-soft)] border-[var(--theme-border)] text-[var(--theme-text-secondary)]'
                    }`}>
                    Kart
                  </button>
                  <button onClick={() => setPayMethod('cash')}
                    className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all border ${
                      payMethod === 'cash' ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300' : 'bg-[var(--theme-surface-soft)] border-[var(--theme-border)] text-[var(--theme-text-secondary)]'
                    }`}>
                    Nağd
                  </button>
                </div>

                <div className="mb-4">
                  <p className={`text-[10px] uppercase tracking-widest font-semibold mb-2 ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>Çay pulu</p>
                  <div className="flex gap-1.5">
                    {[0, 1, 2, 5, 10].map(amount => (
                      <button key={amount}
                        onClick={() => setPayTip(amount)}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${
                          payTip === amount
                            ? 'bg-[var(--theme-surface)] border-[var(--theme-border-strong)] text-[var(--theme-text)] shadow-sm'
                            : 'bg-[var(--theme-surface-soft)] border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-surface)]'
                        }`}>
                        {amount === 0 ? 'Yox' : `${amount} ₼`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={`flex items-center justify-between py-3 border-t mb-3 ${lightMode ? 'border-gray-200' : 'border-white/[0.06]'}`}>
                  <span className={`text-sm font-medium ${lightMode ? 'text-gray-500' : 'text-white/40'}`}>Cəmi</span>
                  <span className={`text-xl font-black tabular-nums ${lightMode ? 'text-gray-900' : 'text-white'}`}>{(payAmount + payTip).toFixed(2)} ₼</span>
                </div>

                <button onClick={handleCloseBill} disabled={orderButtonStatus === 'loading'}
                  className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-30 ${
                    lightMode
                      ? 'bg-amber-600 text-white shadow-md hover:bg-amber-700 hover:shadow-lg'
                      : 'bg-gradient-to-br from-gold to-amber-400 text-black shadow-lg shadow-gold/30 hover:shadow-gold/40'
                  }`}>
                  {orderButtonStatus === 'loading' ? 'Gözləyin...' : <><CheckCircle size={18} /> Hesabı Bağla</>}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Cancel Confirm ── */}
      <AnimatePresence>
        {cancelConfirmOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
              onClick={() => setCancelConfirmOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className={`max-w-sm w-full rounded-3xl border p-6 shadow-2xl backdrop-blur-xl ${lightMode ? 'bg-white border-gray-200' : 'bg-zinc-900/95 border-zinc-700/50'}`}>
                <div className="text-center mb-5">
                  <XCircle size={40} className={`mx-auto mb-3 ${lightMode ? 'text-red-500' : 'text-red-400'}`} />
                  <p className="text-lg font-bold">Masa {actionSheetTable?.table_number} təmizlənsin?</p>
                  <p className={`text-sm mt-1 ${lightMode ? 'text-gray-500' : 'text-white/40'}`}>
                    Bütün sifarişlər ləğv ediləcək. Bu itki kimi qeyd olunmayacaq.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setCancelConfirmOpen(false)}
                    className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition-all ${lightMode ? 'border-gray-200 text-gray-600 hover:bg-gray-100' : 'border-zinc-700 text-white/60 hover:bg-zinc-800'}`}>
                    İmtina
                  </button>
                  <button onClick={confirmCancelTable}
                    className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${lightMode ? 'bg-red-600 text-white border border-red-700 hover:bg-red-700' : 'bg-red-600/20 border border-red-500/30 text-red-300 hover:bg-red-600/30'}`}>
                    Təmizlə
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Loss Modal ── */}
      <AnimatePresence>
        {lossModalOpen && actionSheetTable && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
              onClick={() => !lossSubmitting && setLossModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 200, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-8"
            >
              <div className={`max-w-sm mx-auto rounded-3xl border p-5 shadow-2xl backdrop-blur-xl ${lightMode ? 'bg-white border-gray-200' : 'bg-zinc-900/95 border-zinc-700/50'}`}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className={`text-lg font-bold ${lightMode ? 'text-gray-900' : 'text-white'}`}>Masa {actionSheetTable.table_number}</p>
                    <p className={`text-sm ${lightMode ? 'text-gray-500' : 'text-white/40'}`}>İtki qeyd et</p>
                  </div>
                  <button onClick={() => !lossSubmitting && setLossModalOpen(false)}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center ${lightMode ? 'bg-gray-100 text-gray-500 hover:bg-gray-200' : 'bg-zinc-800 text-white/40 hover:text-white'}`}>
                    <X size={18} />
                  </button>
                </div>

                <div className="mb-4">
                  <p className={`text-[10px] uppercase tracking-widest font-semibold mb-2 ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>Səbəb</p>
                  <div className="flex flex-wrap gap-1.5">
                    {lossReasons.map(r => (
                      <button key={r.key}
                        onClick={() => setLossReason(r.key)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                          lossReason === r.key
                            ? (lightMode ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-amber-500/10 border-amber-500/30 text-amber-300')
                            : (lightMode ? 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100' : 'bg-zinc-800 border-zinc-700 text-white/40 hover:text-white/60')
                        }`}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-4">
                  <p className={`text-[10px] uppercase tracking-widest font-semibold mb-2 ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>Məbləğ (₼)</p>
                  <input type="number" step="0.01" min="0" value={lossAmount}
                    onChange={e => setLossAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                    className={`w-full px-4 py-3 rounded-xl text-lg font-bold border transition-all outline-none ${
                      lightMode ? 'bg-gray-50 border-gray-200 text-gray-900' : 'bg-zinc-800 border-zinc-700 text-white'
                    }`}
                  />
                </div>

                <div className="mb-4">
                  <p className={`text-[10px] uppercase tracking-widest font-semibold mb-2 ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>Qeyd (istəyə bağlı)</p>
                  <input type="text" value={lossNote}
                    onChange={e => setLossNote(e.target.value)}
                    placeholder="Məs: müştəri 3-cü dəfə gec gəldi"
                    className={`w-full px-4 py-3 rounded-xl text-sm border transition-all outline-none ${
                      lightMode ? 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400' : 'bg-zinc-800 border-zinc-700 text-white placeholder:text-white/30'
                    }`}
                  />
                </div>

                <button onClick={submitLoss} disabled={lossSubmitting || lossAmount <= 0}
                  className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-30 ${
                    lightMode
                      ? 'bg-red-600 text-white border border-red-700 hover:bg-red-700 shadow-sm'
                      : 'bg-red-600/20 border border-red-500/30 text-red-300 hover:bg-red-600/30 shadow-[0_0_15px_rgba(239,68,68,0.1)]'
                  }`}>
                  {lossSubmitting ? 'Gözləyin...' : <><AlertTriangle size={16} /> İtki kimi qeyd et</>}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
