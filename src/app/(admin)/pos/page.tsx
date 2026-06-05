'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutGrid, ShoppingCart, ChefHat, BarChart3 } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { usePos } from './hooks/usePos';
import { TableCard } from './components/TableCard';
import { ActionSheet } from './components/ActionSheet';
import { ProductGrid } from './components/ProductGrid';
import { CartPanel } from './components/CartPanel';
import { ModifierSheet } from './components/ModifierSheet';
import { KDSView } from './components/KDSView';
import type { ModifierSelection } from './types';
import type { Product } from '../orders/types';

const tabs = [
  { id: 'floor' as const, icon: LayoutGrid, label: 'Masalar' },
  { id: 'order' as const, icon: ShoppingCart, label: 'Sifariş' },
  { id: 'kds' as const, icon: ChefHat, label: 'Mətbəx' },
  { id: 'billing' as const, icon: BarChart3, label: 'Hesabat' },
];

export default function POSPage() {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  const pos = usePos();

  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [modifierOpen, setModifierOpen] = useState(false);
  const [modifierProduct, setModifierProduct] = useState<Product | null>(null);
  const [pendingModifier, setPendingModifier] = useState<{ modifiers: ModifierSelection[]; notes: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<number[]>([]);
  const [transferMode, setTransferMode] = useState(false);
  const [transferTarget, setTransferTarget] = useState<number | null>(null);

  /* ── Cart counts by product for badges ── */
  const cartCounts: Record<string, number> = {};
  if (pos.cart) {
    for (const item of pos.cart.items) {
      cartCounts[item.product_id] = (cartCounts[item.product_id] || 0) + item.quantity;
    }
  }

  /* ── Add product with optional modifier sheet ── */
  const handleAddProduct = useCallback((product: Product) => {
    if (false /* TODO: check if product has modifiers/variants */) {
      setModifierProduct(product);
      setModifierOpen(true);
    } else {
      pos.addToCart(product);
    }
  }, [pos]);

  const handleModifierConfirm = useCallback((modifiers: ModifierSelection[], notes: string) => {
    if (modifierProduct) {
      pos.addToCart(modifierProduct, modifiers, notes);
    }
    setModifierOpen(false);
    setModifierProduct(null);
  }, [pos, modifierProduct]);

  /* ── Place order ── */
  const handlePlaceOrder = useCallback(async () => {
    setSubmitting(true);
    await pos.placeOrder();
    setSubmitting(false);
  }, [pos]);

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
      if (transferTarget === null) {
        setTransferTarget(table.table_number);
      } else {
        pos.transferTable(transferTarget, table.table_number);
        setTransferMode(false);
        setTransferTarget(null);
      }
      return;
    }
    if (table.status === 'empty') {
      pos.selectTable(table);
    } else {
      setActionSheetOpen(true);
    }
  }, [mergeMode, selectedForMerge, transferMode, transferTarget, pos]);

  const activeTable = pos.selectedTable;

  return (
    <div className={`h-screen w-screen overflow-hidden flex flex-col ${lightMode ? 'bg-gray-50 text-gray-900' : 'bg-[#080808] text-white'}`}>
      {/* ── Ambient glow ── */}
      {!lightMode && (
        <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
          <div className="absolute -top-48 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full opacity-[0.03]"
            style={{ background: 'radial-gradient(ellipse,#D4AF37,transparent 70%)' }} />
        </div>
      )}

      {/* ── View container ── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {pos.activeView === 'floor' && (
            <motion.div
              key="floor"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="h-full overflow-y-auto p-4 sm:p-6"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                    POS — Mərtəbə
                  </h1>
                  <p className="text-xs text-white/30 mt-0.5">{pos.tables.filter(t => t.status !== 'empty').length} masa dolu</p>
                </div>
                <div className="flex items-center gap-2">
                  {mergeMode && (
                    <button onClick={() => { pos.mergeTables(selectedForMerge); setMergeMode(false); setSelectedForMerge([]); }}
                      disabled={selectedForMerge.length < 2}
                      className="px-4 py-2 rounded-xl bg-gold/10 border border-gold/20 text-gold text-xs font-bold disabled:opacity-30 transition-all">
                      {selectedForMerge.length} masanı birləşdir
                    </button>
                  )}
                  <button onClick={() => setMergeMode(!mergeMode)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      mergeMode ? 'bg-blue-500/10 border border-blue-500/20 text-blue-300' : 'bg-white/[0.04] border border-white/10 text-white/40 hover:text-white/60'
                    }`}>
                    Birləşdir
                  </button>
                  <button onClick={() => setTransferMode(!transferMode)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      transferMode ? 'bg-violet-500/10 border border-violet-500/20 text-violet-300' : 'bg-white/[0.04] border border-white/10 text-white/40 hover:text-white/60'
                    }`}>
                    {transferMode ? transferTarget ? 'Hədəf masanı seç' : 'Mənbə masanı seç' : 'Köçür'}
                  </button>
                </div>
              </div>

              {/* Floors */}
              {pos.floors.map(floor => (
                <div key={floor.name} className="mb-6">
                  <h2 className="text-sm font-semibold text-white/40 uppercase tracking-widest mb-3">{floor.name}</h2>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                    {floor.tables.map(table => (
                      <TableCard
                        key={table.table_number}
                        table={table}
                        onTap={() => handleTableTap(table)}
                        isSelected={mergeMode && selectedForMerge.includes(table.table_number)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {pos.activeView === 'order' && pos.selectedTable && (
            <motion.div
              key="order"
              initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
              className="h-full flex flex-col lg:flex-row overflow-hidden"
            >
              {/* Products */}
              <div className="flex-1 h-full overflow-hidden p-4 sm:p-5 flex flex-col">
                <ProductGrid
                  products={pos.products}
                  categories={pos.categories}
                  onAddProduct={handleAddProduct}
                  cartCounts={cartCounts}
                />
              </div>

              {/* Cart */}
              <div className="w-full lg:w-[380px] h-full border-t lg:border-t-0 lg:border-l border-white/[0.06] bg-neutral-950/50 p-4 flex flex-col flex-shrink-0">
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

          {pos.activeView === 'kds' && (
            <motion.div
              key="kds"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="h-full overflow-y-auto p-4 sm:p-6"
            >
              <KDSView onBack={() => pos.setActiveView('floor')} />
            </motion.div>
          )}

          {pos.activeView === 'billing' && (
            <motion.div
              key="billing"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="h-full overflow-y-auto p-4 sm:p-6"
            >
              <div className="flex flex-col items-center justify-center h-full text-white/20">
                <BarChart3 size={48} className="mb-4 opacity-30" />
                <p className="text-sm">Hesabat paneli hazırlanır...</p>
              </div>
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
                onClick={() => pos.setActiveView(tab.id)}
                className={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl transition-all ${
                  isActive ? (lightMode ? 'text-black bg-gray-100' : 'text-white bg-white/[0.08]') : 'text-white/30 hover:text-white/60'
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
        table={pos.selectedTable}
        open={actionSheetOpen}
        onClose={() => setActionSheetOpen(false)}
        onAddOrder={() => { if (pos.selectedTable) pos.selectTable(pos.selectedTable); }}
        onMerge={() => setMergeMode(true)}
        onTransfer={() => setTransferMode(true)}
        onSplitBill={() => {}}
        onCloseBill={() => {}}
        onPrint={() => {}}
        onSaveDraft={pos.saveCart}
      />

      {/* ── Modifier Sheet ── */}
      {modifierProduct && (
        <ModifierSheet
          open={modifierOpen}
          productName={(modifierProduct as any)[`name_${pos.language}`] || modifierProduct.name}
          productPrice={modifierProduct.price}
          onClose={() => { setModifierOpen(false); setModifierProduct(null); }}
          onConfirm={handleModifierConfirm}
        />
      )}
    </div>
  );
}
