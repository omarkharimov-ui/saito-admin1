'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutGrid, ShoppingCart, CreditCard, X, CheckCircle, Sun, Moon, Maximize, Minimize, ChevronDown, AlertTriangle, XCircle, Globe } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { usePos } from './hooks/usePos';
import { TableCard } from './components/TableCard';
import { ActionSheet } from './components/ActionSheet';
import { ProductGrid } from './components/ProductGrid';
import { CartPanel } from './components/CartPanel';
import { ModifierSheet } from './components/ModifierSheet';
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
  const [transferMode, setTransferMode] = useState(false);
  const [transferSource, setTransferSource] = useState<number | null>(null);
  const [transferTarget, setTransferTarget] = useState<number | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [outOfStock, setOutOfStock] = useState<Set<string>>(new Set());
  const posRef = useRef<HTMLDivElement>(null);
  const [warningOpen, setWarningOpen] = useState(false);

  /* ── Payment / Loss ── */
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [payOrderId, setPayOrderId] = useState<string | null>(null);
  const [payTableNumber, setPayTableNumber] = useState<number>(0);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<'cash' | 'card'>('card');
  const [payTip, setPayTip] = useState(0);

  const selectedFloorName = selectedFloor || pos.floors[0]?.name || '';

  useEffect(() => {
    if (!selectedFloor && pos.floors.length > 0) {
      setSelectedFloor(pos.floors[0].name);
    }
  }, [pos.floors, selectedFloor]);

  useEffect(() => {
    supabase.from('settings').select('order_delay_minutes').single().then(({ data }) => {
      if (data?.order_delay_minutes) setOrderDelayMinutes(data.order_delay_minutes);
    });
  }, []);

  useEffect(() => {
    fetch('/api/stock-check').then(r => r.json()).then(d => setOutOfStock(new Set(d.outOfStock || []))).catch(() => {});
  }, []);

  const activeFloor = pos.floors.find(f => f.name === selectedFloorName);

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

  const cartCounts: Record<string, number> = {};
  if (pos.cart) {
    for (const item of pos.cart.items) {
      cartCounts[item.product_id] = (cartCounts[item.product_id] || 0) + item.quantity;
    }
  }

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

  const handleAddProduct = useCallback((product: PosProduct) => {
    pos.addToCart(product);
    setIsDirty(true);
  }, [pos]);

  const handleUpdateQty = useCallback((index: number, delta: number) => {
    pos.updateCartItemQty(index, delta);
    setIsDirty(true);
  }, [pos]);

  const handlePlaceOrder = useCallback(async () => {
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
  }, [pos]);

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

  const handleTableTap = useCallback(async (table: PosTable) => {
    if (mergeMode) {
      if (table.status === 'merged') return;
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
        toast.success(`Mənbə: Masa ${table.table_number}`, { id: 'transfer-source' });
      } else if (!transferTarget && table.table_number !== transferSource) {
        setTransferTarget(table.table_number);
        toast.success(`Hədəf: Masa ${table.table_number}`, { id: 'transfer-target' });
      } else if (table.table_number === transferSource) {
        setTransferSource(null);
        setTransferTarget(null);
      }
      return;
    }
    if (table.status === 'merged') return;
    pos.selectTable(table);
  }, [mergeMode, selectedForMerge, transferMode, transferSource, transferTarget, pos]);

  return (
    <div ref={posRef} className="h-full w-full overflow-hidden flex flex-col bg-[var(--theme-bg)] text-[var(--theme-text)]">
      <div className="flex-1 min-h-0 overflow-hidden relative">
        <AnimatePresence mode="wait">
          {pos.activeView === 'floor' && (
            <div key="floor" className={`h-full overflow-hidden flex flex-col border ${lightMode ? 'border-zinc-200 bg-white' : 'border-white/[0.04] bg-[#070707]'} rounded-[40px] m-3 shadow-2xl`}>
              <div className="flex-shrink-0 p-6 pb-2">
                <div className="flex items-center justify-between mb-4 gap-4">
                  <div className="flex items-center gap-4">
                    <h1 className="text-3xl font-black tracking-tighter">POS</h1>
                    {pos.floors.length > 0 && (
                      <LiquidDropdown 
                        options={pos.floors.map(f => ({ id: f.name, label: f.name }))}
                        activeId={selectedFloorName}
                        onChange={(id) => setSelectedFloor(id)}
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <LiquidDropdown 
                      options={[
                        { id: 'az', label: 'AZ' },
                        { id: 'en', label: 'EN' },
                        { id: 'ru', label: 'RU' }
                      ]}
                      activeId={language}
                      onChange={(id) => setLanguage(id as any)}
                      className="hidden sm:block"
                    />
                    <button onClick={() => setLightMode(!lightMode)}
                      className="p-3 rounded-full bg-[#efeff4] dark:bg-white/[0.08] border border-black/[0.02] dark:border-white/[0.1] text-[#8e8e93] hover:text-black dark:hover:text-white transition-all shadow-sm">
                      {lightMode ? <Moon size={20} /> : <Sun size={20} />}
                    </button>
                    <button onClick={toggleFullscreen}
                      className="p-3 rounded-full bg-[#efeff4] dark:bg-white/[0.08] border border-black/[0.02] dark:border-white/[0.1] text-[#8e8e93] hover:text-black dark:hover:text-white transition-all shadow-sm">
                      {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 pt-2">
                {activeFloor ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                    {(activeFloor.tables ?? []).filter(t => t.status !== 'merged').map(table => (
                      <TableCard
                        key={table.table_number}
                        table={table}
                        onTap={() => handleTableTap(table)}
                        onAction={() => { setActionSheetTable(table); setActionSheetOpen(true); }}
                        isSelected={mergeMode && selectedForMerge.includes(table.table_number)}
                        isTransferSource={transferMode && transferSource === table.table_number}
                        isTransferTarget={transferMode && transferTarget === table.table_number}
                        isOverdue={overdueTableNumbers.has(table.table_number)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-[#8e8e93] uppercase tracking-widest font-black text-xs">{t('floor_not_found' as any)}</div>
                )}
              </div>
            </div>
          )}

          {pos.activeView === 'order' && pos.selectedTable && (
            <motion.div key="order" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="h-full flex flex-col md:flex-row overflow-hidden bg-[var(--theme-bg)]">
              <div className="flex-1 h-full min-w-0 p-6 flex flex-col">
                <ProductGrid products={pos.products} categories={pos.categories} onAddProduct={handleAddProduct} cartCounts={cartCounts} outOfStock={outOfStock} />
              </div>
              <div className={`w-full md:w-[400px] h-full border-l p-6 flex flex-col flex-shrink-0 ${lightMode ? 'bg-[#fcfcfd] border-zinc-200 shadow-2xl' : 'bg-black border-white/[0.05]'}`}>
                  <CartPanel
                    cart={pos.cart} onUpdateQty={handleUpdateQty} onPlaceOrder={handlePlaceOrder} onClearDraft={pos.clearDrafts}
                    onBack={() => isDirty ? setWarningOpen(true) : pos.backToFloor()}
                    orderButtonStatus={orderButtonStatus} isDirty={isDirty}
                    hasExistingOrder={pos.selectedTable?.status !== 'empty'}
                    onUpdateGuests={(delta) => {
                      const c = pos.cart; if (!c) return;
                      const newCount = Math.max(1, c.guest_count + delta);
                      pos.setCart({ ...c, guest_count: newCount });
                      supabase.from('tables').update({ guest_count: newCount }).eq('table_number', c.table_number);
                    }}
                    mergedChildNumbers={(pos.selectedTable?.merged_orders as any[])?.map(m => m.table_number) ?? []}
                    onRecordLoss={async (items, reason) => {
                      await fetch('/api/finance/loss', { method: 'POST', body: JSON.stringify({ table_number: pos.selectedTable?.table_number, reason, items, source: 'pos' }) });
                      toast.success(`İtki qeyd edildi`); pos.fetchData();
                    }}
                  />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Warning Modal ── */}
        <AnimatePresence>
          {warningOpen && (
            <div className="absolute inset-0 z-[1000] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
              <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-sm bg-[var(--theme-surface)] rounded-[40px] p-10 text-center shadow-[0_32px_80px_rgba(0,0,0,0.3)] border border-white/10">
                <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-6"><AlertTriangle size={40} className="text-rose-500" /></div>
                <h3 className="text-xl font-black mb-3">Yazılmamış dəyişikliklər var</h3>
                <p className="text-sm text-[#8e8e93] leading-relaxed mb-8">Masanı tərk etsən, səbət və qonaq sayı silinəcək.</p>
                <div className="flex gap-4">
                  <button onClick={() => setWarningOpen(false)} className="flex-1 py-4 rounded-2xl bg-[#efeff4] dark:bg-white/[0.1] text-[#8e8e93] font-black uppercase tracking-widest text-[10px] border border-transparent dark:border-white/5 shadow-sm">Ləğv Et</button>
                  <button onClick={() => { pos.clearCart(); setIsDirty(false); setWarningOpen(false); pos.backToFloor(); }} className={`flex-1 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg ${lightMode ? 'bg-gray-900 text-white' : 'bg-white text-black'}`}>Sil və Çıx</button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>

      <ActionSheet 
        table={actionSheetTable} 
        open={actionSheetOpen} 
        onClose={() => setActionSheetOpen(false)} 
        onAddOrder={() => { pos.selectTable(actionSheetTable!); setActionSheetOpen(false); }} 
        onMerge={() => { setMergeMode(true); setSelectedForMerge([actionSheetTable!.table_number]); pos.setActiveView('floor'); setActionSheetOpen(false); }} 
        onTransfer={() => { setTransferMode(true); setTransferSource(actionSheetTable!.table_number); pos.setActiveView('floor'); setActionSheetOpen(false); }} 
        onCloseBill={() => { openPayment(actionSheetTable!.table_number, actionSheetTable!.total_amount, actionSheetTable!.order_ids ?? []); setActionSheetOpen(false); }} 
        onSplitBill={() => {}}
        onPrint={() => {}}
        onSaveDraft={() => {}}
      />
      <ModifierSheet open={modifierOpen} productName={modifierProduct?.name || ''} productPrice={modifierProduct?.price || 0} onClose={() => setModifierOpen(false)} onConfirm={(m, n) => { pos.addToCart(modifierProduct!, m, n); setModifierOpen(false); }} />
    </div>
  );
}
