'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutGrid, ShoppingCart, CreditCard, X, CheckCircle, Sun, Moon, Maximize, Minimize, ChevronDown } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { usePos } from './hooks/usePos';
import { TableCard } from './components/TableCard';
import { ActionSheet } from './components/ActionSheet';
import { ProductGrid } from './components/ProductGrid';
import { CartPanel } from './components/CartPanel';
import { ModifierSheet } from './components/ModifierSheet';
import { toast } from 'react-hot-toast';
import type { ModifierSelection, PaymentInfo } from './types';
import type { Product } from '../orders/types';

const tabs = [
  { id: 'floor' as const, icon: LayoutGrid, label: 'Masalar' },
  { id: 'order' as const, icon: ShoppingCart, label: 'Sifariş' },
  { id: 'billing' as const, icon: CreditCard, label: 'Ödəniş' },
];

export default function POSPage() {
  const { t } = useLanguage();
  const { lightMode, setLightMode } = useTheme();
  const pos = usePos();

  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [actionSheetTable, setActionSheetTable] = useState<any>(null);
  const [modifierOpen, setModifierOpen] = useState(false);
  const [modifierProduct, setModifierProduct] = useState<Product | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<number[]>([]);
  const [transferMode, setTransferMode] = useState(false);
  const [transferSource, setTransferSource] = useState<number | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
  const [floorDropdownOpen, setFloorDropdownOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const posRef = useRef<HTMLDivElement>(null);

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

  const activeFloor = pos.floors.find(f => f.name === selectedFloorName);

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
  const handleAddProduct = useCallback((product: Product) => {
    pos.addToCart(product);
  }, [pos]);

  /* ── Place order ── */
  const handlePlaceOrder = useCallback(async () => {
    setSubmitting(true);
    await pos.placeOrder();
    setSubmitting(false);
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
    setSubmitting(true);
    const payment: PaymentInfo = {
      method: payMethod === 'cash' ? 'cash' : 'card',
      cash_amount: payMethod === 'cash' ? payAmount + payTip : 0,
      card_amount: payMethod === 'card' ? payAmount + payTip : 0,
      tip: payTip,
    };
    await pos.closeBill(payOrderId, payment);
    setPaymentOpen(false);
    setPayOrderId(null);
    setSubmitting(false);
  }, [payOrderId, payMethod, payAmount, payTip, pos]);

  /* ── Table actions ── */
  const handleTableTap = useCallback((table: any) => {
    if (mergeMode) {
      if (selectedForMerge.includes(table.table_number)) {
        setSelectedForMerge(prev => prev.filter(n => n !== table.table_number));
      } else {
        setSelectedForMerge(prev => [...prev, table.table_number]);
      }
      return;
    }
    if (transferMode) {
      if (transferSource === null) {
        setTransferSource(table.table_number);
      } else if (table.table_number === transferSource) {
        setTransferSource(null); // tap again → deselect
      } else {
        pos.transferTable(transferSource, table.table_number);
        setTransferMode(false);
        setTransferSource(null);
      }
      return;
    }
    // Direct: tap table → go to order view
    pos.selectTable(table);
  }, [mergeMode, selectedForMerge, transferMode, transferSource, pos]);

  const handleTableAction = useCallback((table: any) => {
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
      openPayment(actionSheetTable.table_number, actionSheetTable.total_amount, actionSheetTable.order_ids);
      setActionSheetTable(null);
    }
  }, [actionSheetTable, openPayment]);

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
    <div ref={posRef} className={`h-full w-full overflow-hidden flex flex-col ${lightMode ? 'bg-[#F8F6F0] text-[#1C1C1A]' : 'bg-[#080808] text-white'}`}>
      {/* ── View container ── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {/* ═══ FLOOR VIEW ═══ */}
          {pos.activeView === 'floor' && (
            <motion.div
              key="floor"
              animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="h-full overflow-hidden flex flex-col"
            >
              {/* Top bar */}
              <div className="flex-shrink-0 p-4 sm:p-5 pb-0">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight">POS</h1>
                    {/* Floor dropdown */}
                    {pos.floors.length > 0 && (
                      <div className="relative">
                        <button onClick={() => setFloorDropdownOpen(!floorDropdownOpen)}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${lightMode ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-white/[0.06] text-white/60 hover:text-white/80'}`}>
                          {selectedFloorName} <ChevronDown size={14} className={`transition-transform ${floorDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {floorDropdownOpen && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setFloorDropdownOpen(false)} />
                            <div className={`absolute top-full left-0 mt-1 z-20 min-w-[160px] rounded-xl border p-1 shadow-xl ${lightMode ? 'bg-white border-gray-200' : 'bg-[#141414] border-white/[0.08]'}`}>
                              {pos.floors.map(f => (
                                <button key={f.name}
                                  onClick={() => { setSelectedFloor(f.name); setFloorDropdownOpen(false); }}
                                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                                    f.name === selectedFloorName
                                      ? lightMode ? 'bg-gray-100 text-black' : 'bg-white/10 text-white'
                                      : lightMode ? 'text-gray-600 hover:bg-gray-50' : 'text-white/50 hover:text-white'
                                  }`}>
                                  {f.name}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setLightMode(!lightMode)}
                      className={`p-2.5 rounded-xl transition-all ${lightMode ? 'bg-gray-200 text-gray-600 hover:bg-gray-300' : 'bg-white/[0.06] text-white/40 hover:text-white/70'}`}>
                      {lightMode ? <Moon size={18} /> : <Sun size={18} />}
                    </button>
                    <button onClick={toggleFullscreen}
                      className={`p-2.5 rounded-xl transition-all ${lightMode ? 'bg-gray-200 text-gray-600 hover:bg-gray-300' : 'bg-white/[0.06] text-white/40 hover:text-white/70'}`}>
                      {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                    </button>
                    {mergeMode && (
                      <button onClick={() => { pos.mergeTables(selectedForMerge); setMergeMode(false); setSelectedForMerge([]); }}
                        disabled={selectedForMerge.length < 2}
                        className="px-4 py-2 rounded-xl bg-gold/10 border border-gold/20 text-gold text-xs font-bold disabled:opacity-30 transition-all">
                        {selectedForMerge.length} masanı birləşdir
                      </button>
                    )}
                    {activeFloor?.tables.some(t => t.status !== 'empty') && (
                      <>
                        <button onClick={() => { setMergeMode(!mergeMode); setSelectedForMerge([]); }}
                          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                            mergeMode
                              ? lightMode ? 'bg-blue-50 border border-blue-200 text-blue-600' : 'bg-blue-500/10 border border-blue-500/20 text-blue-300'
                              : lightMode
                                ? 'bg-gray-200 text-gray-500 hover:bg-gray-300 border-0'
                                : 'bg-white/[0.04] border border-white/10 text-white/40 hover:text-white/60'
                          }`}>Birləşdir</button>
                        <button onClick={() => { setTransferMode(!transferMode); setTransferSource(null); }}
                          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                            transferMode
                              ? lightMode ? 'bg-violet-50 border border-violet-200 text-violet-600' : 'bg-violet-500/10 border border-violet-500/20 text-violet-300'
                              : lightMode
                                ? 'bg-gray-200 text-gray-500 hover:bg-gray-300 border-0'
                                : 'bg-white/[0.04] border border-white/10 text-white/40 hover:text-white/60'
                          }`}>
                          {transferMode ? (transferSource ? `Masa ${transferSource} → ?` : 'Mənbə seç') : 'Köçür'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Tables */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 pt-3">
                {activeFloor ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-3">
                    {activeFloor.tables.map(table => (
                      <TableCard
                        key={table.table_number}
                        table={table}
                        onTap={() => handleTableTap(table)}
                        onAction={() => handleTableAction(table)}
                        isSelected={mergeMode && selectedForMerge.includes(table.table_number)}
                        isTransferSource={transferMode && transferSource === table.table_number}
                      />
                    ))}
                  </div>
                ) : (
                  <div className={`flex items-center justify-center h-full ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>
                    <p className="text-sm">Mərtəbə tapılmadı</p>
                  </div>
                )}
              </div>
            </motion.div>
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
              <div className={`w-full md:w-[360px] xl:w-[400px] h-full md:max-h-full border-t md:border-t-0 md:border-l p-4 flex flex-col flex-shrink-0 overflow-hidden ${lightMode ? 'border-gray-200 bg-white' : 'border-white/[0.06] bg-neutral-950/50'}`}>
                <CartPanel
                  cart={pos.cart}
                  onUpdateQty={pos.updateCartItemQty}
                  onRemove={pos.removeCartItem}
                  onPlaceOrder={handlePlaceOrder}
                  onSaveDraft={pos.saveCart}
                  onClear={pos.clearCart}
                  onBack={pos.backToFloor}
                  submitting={submitting}
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
              <h2 className={`text-lg font-bold mb-4 ${lightMode ? 'text-gray-800' : 'text-white'}`}>Ödənişlər</h2>
              {pos.tables.filter(t => t.status !== 'empty' && t.total_amount > 0).length === 0 ? (
                <div className={`flex flex-col items-center justify-center h-64 ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>
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
                      className={`flex items-center justify-between p-4 rounded-2xl border ${lightMode ? 'border-gray-200 bg-white' : 'border-white/[0.08] bg-white/[0.02]'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black ${lightMode ? 'bg-gray-100 text-gray-500' : 'bg-white/[0.06] text-white/70'}`}>
                          {table.table_number}
                        </div>
                        <div>
                          <p className="text-sm font-semibold">Masa {table.table_number}</p>
                          <p className={`text-xs ${lightMode ? 'text-gray-400' : 'text-white/40'}`}>{table.guest_count} nəfər · {table.order_count} sifariş</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-black text-gold">{table.total_amount.toFixed(2)} ₼</span>
                        <button onClick={() => openPayment(table.table_number, table.total_amount, table.order_ids)}
                          className="px-4 py-2.5 rounded-xl bg-gold/10 border border-gold/20 text-gold text-xs font-bold hover:bg-gold/20 active:scale-95 transition-all">
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
      <div className={`flex-shrink-0 border-t ${lightMode ? 'border-gray-200 bg-white' : 'border-white/[0.06] bg-[#0c0c0c]/95 backdrop-blur-xl'}`}>
        <div className="flex items-center justify-around px-2 py-1.5">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = pos.activeView === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (tab.id === 'order' && !pos.selectedTable) {
                    pos.setActiveView('floor');
                  } else {
                    pos.setActiveView(tab.id);
                  }
                }}
                className={`flex flex-col items-center gap-0.5 px-6 py-2 rounded-xl transition-all ${
                  isActive ? (lightMode ? 'text-black bg-gray-100' : 'text-white bg-white/[0.08]') : lightMode ? 'text-gray-400 hover:text-gray-600' : 'text-white/30 hover:text-white/60'
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
        onMerge={() => { setMergeMode(true); pos.setActiveView('floor'); setActionSheetOpen(false); setActionSheetTable(null); }}
        onTransfer={() => { setTransferMode(true); pos.setActiveView('floor'); setActionSheetOpen(false); setActionSheetTable(null); }}
        onSplitBill={handleSplitTable}
        onCloseBill={handleActionCloseBill}
        onPrint={() => { setActionSheetOpen(false); setActionSheetTable(null); }}
        onSaveDraft={() => { pos.saveCart(); setActionSheetOpen(false); setActionSheetTable(null); }}
      />

      {/* ── Modifier Sheet ── */}
      {modifierProduct && (
        <ModifierSheet
          open={modifierOpen}
          productName={(modifierProduct as any)[`name_${pos.language}`] || modifierProduct.name}
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
              onClick={() => !submitting && setPaymentOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 200, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-8"
            >
              <div className={`max-w-sm mx-auto rounded-3xl border p-5 shadow-2xl ${lightMode ? 'bg-white border-gray-200' : 'bg-[#0c0c0c]/95 backdrop-blur-xl border-white/[0.08]'}`}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className={`text-lg font-bold ${lightMode ? 'text-gray-900' : 'text-white'}`}>Masa {payTableNumber}</p>
                    <p className={`text-sm ${lightMode ? 'text-gray-500' : 'text-white/40'}`}>Ödəniş</p>
                  </div>
                  <button onClick={() => !submitting && setPaymentOpen(false)}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center ${lightMode ? 'bg-gray-100 text-gray-400 hover:text-gray-600' : 'bg-white/5 text-white/40 hover:text-white'}`}>
                    <X size={18} />
                  </button>
                </div>

                <div className="text-center mb-4">
                  <p className="text-3xl font-black tracking-tight text-gold">{payAmount.toFixed(2)} ₼</p>
                </div>

                <div className="flex gap-2 mb-4">
                  <button onClick={() => setPayMethod('card')}
                    className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all border ${
                      payMethod === 'card' ? 'bg-gold/10 border-gold/25 text-gold' : lightMode ? 'bg-gray-100 border-gray-200 text-gray-500' : 'bg-white/[0.04] border-white/[0.07] text-white/50'
                    }`}>
                    Kart
                  </button>
                  <button onClick={() => setPayMethod('cash')}
                    className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all border ${
                      payMethod === 'cash' ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300' : lightMode ? 'bg-gray-100 border-gray-200 text-gray-500' : 'bg-white/[0.04] border-white/[0.07] text-white/50'
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
                            ? lightMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white/10 border-white/20 text-white'
                            : lightMode ? 'bg-gray-100 border-gray-200 text-gray-500' : 'bg-white/[0.04] border-white/[0.07] text-white/50'
                        }`}>
                        {amount === 0 ? 'Yox' : `${amount} ₼`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={`flex items-center justify-between py-3 border-t mb-3 ${lightMode ? 'border-gray-200' : 'border-white/[0.06]'}`}>
                  <span className={`text-sm ${lightMode ? 'text-gray-500' : 'text-white/40'}`}>Cəmi</span>
                  <span className={`text-xl font-black ${lightMode ? 'text-gray-900' : 'text-white'}`}>{(payAmount + payTip).toFixed(2)} ₼</span>
                </div>

                <button onClick={handleCloseBill} disabled={submitting}
                  className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-30"
                  style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D67B)', color: '#000', boxShadow: '0 4px 20px rgba(212,175,55,0.3)' }}>
                  {submitting ? 'Gözləyin...' : <><CheckCircle size={18} /> Hesabı Bağla</>}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
