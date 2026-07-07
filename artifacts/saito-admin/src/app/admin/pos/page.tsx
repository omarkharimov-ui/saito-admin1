'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { usePos } from './hooks/usePos';
import { TableCard } from './components/TableCard';
import { ActionSheet } from './components/ActionSheet';
import { ProductGrid } from './components/ProductGrid';
import { CartPanel } from './components/CartPanel';
import { LiquidDropdown } from '@/components/ui/LiquidDropdown';
import { toast } from '@/lib/toast';

export default function POSPage() {
  const { lightMode, setLightMode } = useTheme();
  const pos = usePos();
  
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [actionSheetTable, setActionSheetTable] = useState<any>(null);
  
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<number[]>([]);
  
  const [transferMode, setTransferMode] = useState(false);
  const [transferSource, setTransferSource] = useState<number | null>(null);
  const [transferTarget, setTransferTarget] = useState<number | null>(null);

  const [splitMode, setSplitMode] = useState(false);
  const [selectedForSplit, setSelectedForSplit] = useState<number[]>([]);

  const activeFloor = selectedFloor 
    ? pos.floors.find((f: any) => f.name === selectedFloor) 
    : pos.floors[0];

  const handleTableTap = (table: any) => {
    if (mergeMode) {
      if (selectedForMerge.includes(table.table_number)) {
        setSelectedForMerge(p => p.filter(n => n !== table.table_number));
      } else {
        setSelectedForMerge(p => [...p, table.table_number]);
      }
      return;
    }

    if (transferMode) {
      if (!transferSource) {
        setTransferSource(table.table_number);
        toast(`Mənbə: Masa ${table.table_number}. İndi hədəf seçin.`);
      } else if (table.table_number !== transferSource) {
        setTransferTarget(table.table_number);
        setActionSheetOpen(true);
      }
      return;
    }

    pos.selectTable(table);
  };

  const handleUnmerge = async () => {
    if (!actionSheetTable) return;
    const res = await fetch('/api/orders/unmerge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ primary_table_number: actionSheetTable.table_number, child_table_numbers: selectedForSplit }),
    });
    if (res.ok) {
      toast.success('Masalar ayrıldı');
      setSplitMode(false);
      setSelectedForSplit([]);
      setActionSheetOpen(false);
      pos.fetchData();
    }
  };

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col bg-[var(--theme-bg)] text-[var(--theme-text)] overflow-hidden">
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <AnimatePresence mode="wait">
          {pos.activeView === 'floor' && (
            <div key="floor" className="h-full flex flex-col p-6">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <h1 className="text-3xl font-black tracking-tighter">POS</h1>
                  {pos.floors.length > 1 && (
                    <LiquidDropdown 
                      options={pos.floors.map((f: any) => ({ id: f.name, label: f.name }))} 
                      activeId={activeFloor?.name} 
                      onChange={setSelectedFloor} 
                    />
                  )}
                </div>
                <div className="flex items-center gap-3">
                   <button onClick={() => setLightMode(!lightMode)} className="p-3 rounded-full bg-white/5 border border-white/10">
                     {lightMode ? <Moon size={20} /> : <Sun size={20} />}
                   </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                  {activeFloor?.tables.map((table: any) => (
                    <TableCard 
                      key={table.table_number} 
                      table={table} 
                      onTap={() => handleTableTap(table)} 
                      onAction={() => { setActionSheetTable(table); setActionSheetOpen(true); }}
                      isSelected={selectedForMerge.includes(table.table_number)}
                      selectionMode={mergeMode}
                      isTransferSource={transferSource === table.table_number}
                      isTransferTarget={transferTarget === table.table_number}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {pos.activeView === 'order' && pos.selectedTable && (
            <div key="order" className="h-full w-full flex flex-col md:flex-row overflow-hidden">
               <div className="flex-1 p-6 overflow-hidden">
                  <ProductGrid 
                    products={pos.products} 
                    categories={pos.categories}
                    combos={pos.combos}
                    onAddProduct={(p) => pos.addToCart(p)}
                    cartCounts={{}}
                    outOfStock={new Set()}
                  />
               </div>
               <div className="w-full md:w-[400px] border-l p-6 bg-black/20">
                  <CartPanel 
                    cart={pos.cart} 
                    onPlaceOrder={() => pos.placeOrder()} 
                    onBack={() => pos.setActiveView('floor')}
                    orderButtonStatus="idle"
                    onUpdateQty={(idx, delta) => pos.updateCartItemQty(idx, delta)}
                    onClearDraft={() => pos.clearCart()}
                  />
               </div>
            </div>
          )}
        </AnimatePresence>
      </div>

      <ActionSheet 
        table={actionSheetTable} 
        open={actionSheetOpen} 
        onClose={() => { setActionSheetOpen(false); setSplitMode(false); }} 
        onAddOrder={() => { pos.selectTable(actionSheetTable); setActionSheetOpen(false); }}
        onMerge={() => { setMergeMode(true); setSelectedForMerge([actionSheetTable.table_number]); setActionSheetOpen(false); }}
        onTransfer={() => { setTransferMode(true); setTransferSource(actionSheetTable.table_number); setActionSheetOpen(false); }}
        onUnmerge={() => setSplitMode(true)}
        onBillSplit={() => { toast('Hesab bölmə tezliklə...'); }}
        onCloseBill={() => { toast('Ödəniş ekranı...'); setActionSheetOpen(false); }}
        onPrint={() => window.print()}
        onSaveDraft={() => { toast('Qaralama saxlanıldı'); }}
        onCancelTable={() => { pos.dismissTable(actionSheetTable.table_number); setActionSheetOpen(false); }}
        mergeMode={mergeMode}
        transferMode={transferMode}
        splitMode={splitMode}
        allTables={pos.floors.flatMap((f: any) => f.tables)}
        selectedForMerge={selectedForMerge}
        selectedForSplit={selectedForSplit}
        transferSource={transferSource}
        transferTarget={transferTarget}
        onToggleSplit={(n) => {
          if (selectedForSplit.includes(n)) setSelectedForSplit(p => p.filter(x => x !== n));
          else setSelectedForSplit(p => [...p, n]);
        }}
        onConfirmSplit={handleUnmerge}
        onCancelMode={() => { setMergeMode(false); setTransferMode(false); setSplitMode(false); setSelectedForMerge([]); setSelectedForSplit([]); setTransferSource(null); setTransferTarget(null); }}
        onConfirmMerge={async () => { await pos.mergeTables(selectedForMerge); setMergeMode(false); setSelectedForMerge([]); }}
        onConfirmTransfer={async () => { await pos.transferTable(transferSource!, transferTarget!); setTransferMode(false); setTransferSource(null); setTransferTarget(null); setActionSheetOpen(false); }}
      />

      <AnimatePresence>
        {pos.lastUndo && (
          <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-6 px-8 py-4 rounded-[2rem] bg-zinc-900 text-white shadow-2xl border border-white/10">
            <span className="text-sm font-bold">{pos.lastUndo.message}</span>
            <button onClick={() => pos.performUndo()} className="px-6 py-2.5 rounded-2xl bg-white text-black text-xs font-black uppercase tracking-widest hover:bg-zinc-200 transition-all active:scale-95">Geri Al</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
