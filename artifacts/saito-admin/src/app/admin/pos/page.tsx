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
    const handler = (e: any) => {
      if (e.detail?.action) setUndoData(e.detail);
    };
    window.addEventListener('saito_pos_undo_available', handler);
    return () => window.removeEventListener('saito_pos_undo_available', handler);
  }, []);

  /* ── Payment / Loss ── */
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [payOrder, setPayOrder] = useState<any>(null);
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

  const overdueTables = useMemo(() => {
    const now = Date.now();
    const cutoff = orderDelayMinutes * 60 * 1000;
    const map = new Map<number, 'not_accepted' | 'preparing'>();
    const tables = activeFloor?.tables ?? [];
    for (const t of tables) {
      if (t.has_pending && t.oldest_pending_at) {
        const elapsed = now - new Date(t.oldest_pending_at).getTime();
        if (elapsed > cutoff) {
          // If kitchen hasn't accepted ANY orders for this table, it's 'not_accepted'
          // If there are orders in 'preparing' but still overdue, it's 'preparing'
          // We can use t.kitchen_status which often reflects the most urgent state
          if (t.kitchen_status === 'pending' || t.kitchen_status === 'new' || !t.kitchen_status) {
            map.set(t.table_number, 'not_accepted');
          } else {
            map.set(t.table_number, 'preparing');
          }
        }
      }
    }
    return map;
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

  const openPayment = useCallback(async (tableNumber: number, amount: number, orderIds: string[]) => {
    const orderId = orderIds[0];
    if (!orderId) return;

    // Fetch full order data for the receipt
    const { data: orderData } = await supabase
      .from('orders')
      .select('*, order_items(*, products(name, name_az, name_en, name_ru))')
      .eq('id', orderId)
      .single();

    setPayOrder(orderData);
    setPayTableNumber(tableNumber);
    setPayAmount(amount);
    setPayOrderId(orderId);
    setPayMethod('card');
    setPayTip(0);
    setPaymentOpen(true);
  }, [pos]);

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
    if (splitMode) {
      const parent = selectedForSplit[0];
      if (table.table_number !== parent && table.merged_into_table !== parent) {
        toast.error("Yalnız bu qrupa aid masaları seçə bilərsiniz");
        return;
      }
      if (selectedForSplit.includes(table.table_number)) {
        setSelectedForSplit(prev => prev.filter(n => n !== table.table_number));
      } else {
        setSelectedForSplit(prev => [...prev, table.table_number]);
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
  }, [mergeMode, selectedForMerge, splitMode, selectedForSplit, transferMode, transferSource, transferTarget, pos]);

  return (
    <div ref={posRef} className={`h-screen w-full flex flex-col bg-[var(--theme-bg)] text-[var(--theme-text)] overflow-hidden ${(actionSheetOpen || modifierOpen) ? 'no-scroll' : ''}`}>
      <style jsx global>{`
        .no-scroll {
          overflow: hidden !important;
          height: 100vh !important;
        }
      `}</style>
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <AnimatePresence mode="wait">
          {pos.activeView === 'floor' && (
            <div key="floor" className={`h-full flex flex-col border ${lightMode ? 'border-zinc-200 bg-[#f8f8fa]' : 'border-white/[0.04] bg-[#070707]'} rounded-[40px] m-3 shadow-2xl relative overflow-hidden`}>
              <div className="flex-shrink-0 p-6 pb-2 relative z-[60]">
                <div className="flex items-center justify-between mb-4 gap-4">
                  <div className="flex items-center gap-3">
                    <h1 className="text-3xl font-black tracking-tighter mr-2">POS</h1>
                    {pos.floors.length > 0 && (
                      <LiquidDropdown 
                        options={pos.floors.map(f => ({ id: f.name, label: f.name }))}
                        activeId={selectedFloorName}
                        onChange={(id) => setSelectedFloor(id)}
                      />
                    )}
                  </div>
                    <div className="flex items-center gap-3">




                    <button onClick={() => setLightMode(!lightMode)}
                      className="p-3 rounded-full bg-[#efeff4] dark:bg-white/[0.08] border border-transparent dark:border-white/[0.1] text-[#8e8e93] hover:text-zinc-900 dark:hover:text-white hover:bg-[#e5e5ea] dark:hover:bg-white/[0.15] transition-all shadow-sm">
                      {lightMode ? <Moon size={20} /> : <Sun size={20} />}
                    </button>
                    <button onClick={toggleFullscreen}
                      className="p-3 rounded-full bg-[#efeff4] dark:bg-white/[0.08] border border-transparent dark:border-white/[0.1] text-[#8e8e93] hover:text-zinc-900 dark:hover:text-white hover:bg-[#e5e5ea] dark:hover:bg-white/[0.15] transition-all shadow-sm">
                      {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 pt-2">
                {activeFloor ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                    {(activeFloor.tables ?? [])
                      .filter(t => t.status !== 'merged')
                      .sort((a, b) => a.table_number - b.table_number)
                      .map(table => (
                        <TableCard
                          key={table.table_number}
                          table={table}
                          onTap={() => handleTableTap(table)}
                          onAction={() => { setActionSheetTable(table); setActionSheetOpen(true); }}
                          isSelected={(mergeMode && selectedForMerge.includes(table.table_number)) || (splitMode && selectedForSplit.includes(table.table_number))}
                          selectionMode={mergeMode || splitMode || transferMode}
                          isTransferSource={transferMode && transferSource === table.table_number}
                          isTransferTarget={transferMode && transferTarget === table.table_number}
                          isOverdue={overdueTables.has(table.table_number)}
                          overdueType={overdueTables.get(table.table_number)}
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
            <motion.div 
              key="order" 
              initial={{ opacity: 0, scale: 0.98 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.98 }} 
              className="h-full w-full flex flex-col md:flex-row overflow-hidden bg-[var(--theme-bg)]"
            >
              <div className="flex-1 min-w-0 h-full p-6 flex flex-col overflow-hidden">
                <ProductGrid products={pos.products} categories={pos.categories} onAddProduct={handleAddProduct} cartCounts={cartCounts} outOfStock={outOfStock} />
              </div>
              <div className={`w-full md:w-[400px] h-full border-l p-6 flex flex-col flex-shrink-0 overflow-hidden ${lightMode ? 'bg-[#fcfcfd] border-zinc-200 shadow-2xl' : 'bg-black border-white/[0.05]'}`}>
                  <CartPanel
                    cart={pos.cart} onUpdateQty={handleUpdateQty} onPlaceOrder={handlePlaceOrder} onClearDraft={pos.clearDrafts}
                    onBack={() => { setIsDirty(false); pos.backToFloor(); }}
                    orderButtonStatus={orderButtonStatus} isDirty={isDirty}
                    hasExistingOrder={pos.selectedTable?.status !== 'empty'}
                    onUpdateGuests={(delta) => {
                      const c = pos.cart; if (!c) return;
                      const newCount = Math.max(1, c.guest_count + delta);
                      
                      // 1. Sync local cart state
                      pos.setCart({ ...c, guest_count: newCount });
                      
                      // 2. Sync global tables state (for immediate TableCard update)
                      pos.setTables(prev => prev.map(t => 
                        t.table_number === c.table_number ? { ...t, guest_count: newCount } : t
                      ));

                      // 3. Persist to DB immediately
                      supabase.from('tables').update({ guest_count: newCount }).eq('table_number', c.table_number).then(() => {
                        // Optionally re-fetch to ensure consistency
                        // pos.fetchData(); 
                      });
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

        {/* Warning Modal removed as requested */}
      </div>

      <ActionSheet 
        table={actionSheetTable} 
        open={actionSheetOpen} 
        onClose={() => { setActionSheetOpen(false); setSplitMode(false); }} 
        onAddOrder={() => { pos.selectTable(actionSheetTable!); setActionSheetOpen(false); }} 
        onMerge={() => { setMergeMode(true); setSelectedForMerge([actionSheetTable!.table_number]); pos.setActiveView('floor'); setActionSheetOpen(false); }} 
        onTransfer={() => { setTransferMode(true); setTransferSource(actionSheetTable!.table_number); pos.setActiveView('floor'); setActionSheetOpen(false); }} 
        onCloseBill={() => { openPayment(actionSheetTable!.table_number, actionSheetTable!.total_amount, actionSheetTable!.order_ids ?? []); setActionSheetOpen(false); }} 
        onSplitBill={() => { setSplitMode(true); setSelectedForSplit([actionSheetTable!.table_number]); }} 
        onPrint={() => {}}
        onSaveDraft={() => {}}
        splitMode={splitMode}
        allTables={pos.tables}
        selectedForSplit={selectedForSplit}
        onToggleSplit={(num) => {
          if (selectedForSplit.includes(num)) {
            setSelectedForSplit(prev => prev.filter(n => n !== num));
          } else {
            setSelectedForSplit(prev => [...prev, num]);
          }
        }}
        onConfirmSplit={async () => {
          const toSplit = selectedForSplit.filter(n => n !== selectedForSplit[0]);
          if (toSplit.length === 0) { toast.error("Ayırmaq üçün ən azı bir masa seçin"); return; }
          try {
            const res = await fetch('/api/orders/split', { 
              method: 'POST', 
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ table_numbers: toSplit }) 
            });
            if (!res.ok) throw new Error("Ayırma xətası");
            toast.success("Masalar ayrıldı");
            setSplitMode(false);
            setSelectedForSplit([]);
            setActionSheetOpen(false);
            pos.fetchData();
          } catch (e: any) {
            toast.error(e.message);
          }
        }}
      />
      <ModifierSheet open={modifierOpen} productName={modifierProduct?.name || ''} productPrice={modifierProduct?.price || 0} onClose={() => setModifierOpen(false)} onConfirm={(m, n) => { pos.addToCart(modifierProduct!, m, n); setModifierOpen(false); }} />
      
      {paymentOpen && payOrder && (
        <ReceiptModal
          order={payOrder}
          onClose={() => setPaymentOpen(false)}
          getProductName={(it) => {
            const p = it.products as any;
            if (!p) return '';
            const transName = p.translations?.[language]?.name;
            if (transName) return transName;
            return (language === 'az' ? p.name_az : language === 'en' ? p.name_en : p.name_ru) || p.name || '';
          }}
          onPay={handleCloseBill}
        />
      )}

      {/* Selection Mode Bar for Merge/Transfer */}
      <AnimatePresence>
        {(mergeMode || transferMode) && (
          <motion.div 
            layoutId="action-sheet-container"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-6 py-4 rounded-[2.5rem] bg-zinc-900/90 dark:bg-white/95 backdrop-blur-3xl border border-white/10 dark:border-black/5 shadow-[0_20px_50px_rgba(0,0,0,0.3)] min-w-[320px] sm:min-w-[400px]"
          >
            <div className="flex flex-col mr-auto">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40 dark:text-black/30 mb-0.5">
                {mergeMode ? 'Masaları Birləşdir' : 'Masayı Köçür'}
              </span>
              <span className="text-sm font-black text-white dark:text-black">
                {mergeMode ? `${selectedForMerge.length} masa seçildi` : (transferSource ? (transferTarget ? `Hədəf: Masa ${transferTarget}` : `Hədəf masanı seçin`) : 'Mənbə masanı seçin')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => { setMergeMode(false); setTransferMode(false); setSelectedForMerge([]); setTransferSource(null); setTransferTarget(null); }}
                className="px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-white/10 dark:bg-black/10 text-white dark:text-black hover:bg-rose-500/20 hover:text-rose-500 transition-all"
              >
                Ləğv Et
              </button>
              <button 
                onClick={async () => {
                  if (mergeMode) { await pos.mergeTables(selectedForMerge); setMergeMode(false); setSelectedForMerge([]); }
                  else if (transferSource && transferTarget) { await pos.transferTable(transferSource, transferTarget); setTransferMode(false); setTransferSource(null); setTransferTarget(null); }
                }}
                className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:scale-[1.02] active:scale-95 transition-all ${
                  lightMode ? 'bg-white text-black' : 'bg-black text-white'
                }`}
              >
                Təsdiqlə
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Undo Notification */}
      <AnimatePresence>
        {pos.lastUndo && (
          <motion.div 
            initial={{ y: 50, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 50, opacity: 0, scale: 0.9 }}
            className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-4 px-6 py-3.5 rounded-2xl bg-[#D4AF37] text-black shadow-[0_15px_40px_rgba(212,175,55,0.4)] border border-white/20"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-black/40 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest">Əməliyyat Uğurla İcra Edildi</span>
            <button 
              onClick={() => pos.performUndo()}
              className="px-4 py-2 rounded-xl bg-black text-white text-[9px] font-black uppercase tracking-widest hover:bg-black/80 transition-all shadow-md active:scale-95"
            >
              Geri Al
            </button>
          </motion.div>
        )}
      </AnimatePresence>


    </div>
  );
}
