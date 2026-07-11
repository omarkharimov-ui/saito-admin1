'use client';

import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { usePos } from './hooks/usePos';
import { TableCard } from './components/TableCard';
import { ActionSheet } from './components/ActionSheet';
import { ProductGrid } from './components/ProductGrid';
import { CartPanel } from './components/CartPanel';
import { ModifierSheet } from './components/ModifierSheet';
import { LiquidDropdown } from '@/components/ui/LiquidDropdown';
import { toast } from '@/lib/toast';
import type { PosProduct, LossItem } from './types/shared';

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

  const [paying, setPaying] = useState(false);
  const [lastUndo, setLastUndo] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);

  const [modalProduct, setModalProduct] = useState<{ product: PosProduct; variants: any[] } | null>(null);

  const handleRecordLoss = async (items: LossItem[], reason: string) => {
    const res = await fetch('/api/stock/loss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, reason }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Loss recording failed');
    }
  };

  // Load active campaigns
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/campaigns');
        if (res.ok) {
          const data = await res.json();
          const active = (data.campaigns || []).filter((c: any) => c.status === 'active');
          setCampaigns(active);
        }
      } catch {}
    })();
  }, []);

  const handleProductTap = (product: PosProduct) => {
    const variants = pos.variantsByProduct[product.id] || [];
    if (variants.length > 0) {
      setModalProduct({ product, variants });
    } else {
      pos.addToCart(product);
    }
  };

  const handleCloseBill = async () => {
    if (!actionSheetTable || paying) return;
    setPaying(true);
    try {
      const ordersRes = await fetch('/api/orders');
      if (!ordersRes.ok) throw new Error('Failed to fetch orders');
      const ordersData = await ordersRes.json();
      const activeOrder = (ordersData.orders || []).find((o: any) => 
        o.table_number === actionSheetTable.table_number && 
        !['paid', 'cancelled'].includes(o.status)
      );
      
      if (!activeOrder) {
        toast.error('Aktiv sifariş tapılmadı', { id: 'action-toast' });
        return;
      }

      const res = await fetch('/api/orders/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: activeOrder.id,
          payment_method: 'card',
          cash_amount: 0,
          card_amount: activeOrder.total_amount || 0,
          tip_amount: 0,
        }),
      });

      if (res.ok) {
        toast.success('Ödəniş uğurla tamamlandı', { id: 'action-toast' });
        setActionSheetOpen(false);
        pos.fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Ödəniş uğursuz oldu', { id: 'action-toast' });
      }
    } catch (e: any) {
      toast.error(e.message || 'Ödəniş xətası', { id: 'action-toast' });
    } finally {
      setPaying(false);
    }
  };

  const activeFloor = selectedFloor 
    ? pos.floors.find((f: any) => f.name === selectedFloor) 
    : pos.floors[0];

  const tableGroupInfo = useMemo(() => {
    const info: Record<number, { groupNum: number; children: number[] }> = {};
    if (activeFloor?.merged_groups) {
      activeFloor.merged_groups.forEach((g: any, idx: number) => {
        info[g.parent.table_number] = {
          groupNum: idx + 1,
          children: g.children?.map((c: any) => c.table_number) || []
        };
      });
    }
    return info;
  }, [activeFloor?.merged_groups]);

  const visibleTables = useMemo(() => {
    if (!activeFloor?.tables) return [];
    return activeFloor.tables.filter((table: any) => {
      const isChild = table.parent_table_number && table.table_number !== table.parent_table_number;
      return !isChild;
    });
  }, [activeFloor?.tables]);

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
      } else if (table.table_number === transferSource) {
        toast.error('Eyni masanı seçdiz');
      } else {
        setTransferTarget(table.table_number);
        handleConfirmTransfer();
      }
      return;
    }

    pos.selectTable(table);
  };

  const handleConfirmTransfer = async () => {
    if (!transferSource || !transferTarget) return;
    try {
      const res = await fetch('/api/orders/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_table: transferSource, to_table: transferTarget }),
      });
      const data = await res.json();
      if (res.ok) {
        setLastUndo({ action: 'transfer', data: data.data?.undo, message: `Masa ${transferSource} → ${transferTarget}` });
        toast.success('Masa köçürüldü');
      } else {
        toast.error(data.error || 'Köçürmə uğursuz oldu');
      }
    } catch (e: any) {
      toast.error(e.message || 'Köçürmə xətası');
    } finally {
      setTransferMode(false);
      setTransferSource(null);
      setTransferTarget(null);
      pos.fetchData();
    }
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

  const actionSheetGroup = activeFloor?.merged_groups?.find((g: any) => 
    g.parent.table_number === actionSheetTable?.table_number
  );

  const handleOpenAction = (table: any) => {
    const parentNum = table.parent_table_number || table.table_number;
    const parent = activeFloor?.tables?.find((t: any) => t.table_number === parentNum) || table;
    setActionSheetTable(parent);
    setActionSheetOpen(true);
  };

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col bg-[var(--theme-bg)] text-[var(--theme-text)] overflow-hidden">
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <AnimatePresence mode="wait">
          {pos.activeView === 'floor' && (
            <div key="floor" className="h-full flex flex-col p-6">
               <div className="flex items-center justify-between mb-6">
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
                  <div className="flex items-center gap-1 bg-white/5 rounded-full p-1">
                    <button 
                      onClick={() => { setMergeMode(false); setTransferMode(false); }}
                      className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${!mergeMode && !transferMode ? 'bg-white text-black' : 'text-white/50 hover:text-white'}`}
                    >
                      Normal
                    </button>
                    <button 
                      onClick={() => { setMergeMode(true); setTransferMode(false); setSelectedForMerge([]); }}
                      className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${mergeMode ? 'bg-blue-500 text-white' : 'text-white/50 hover:text-white'}`}
                    >
                      Birleştir
                    </button>
                    <button 
                      onClick={() => { setTransferMode(true); setMergeMode(false); setTransferSource(null); setTransferTarget(null); }}
                      className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${transferMode ? 'bg-emerald-500 text-white' : 'text-white/50 hover:text-white'}`}
                    >
                       Köçür
                    </button>
                  </div>
                  {campaigns.length > 0 && (
                    <select
                      value={selectedCampaign?.id || ''}
                      onChange={(e) => {
                        const camp = campaigns.find((c: any) => c.id === e.target.value) || null;
                        setSelectedCampaign(camp);
                      }}
                      className="bg-white/5 border border-white/10 rounded-full px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/70 outline-none cursor-pointer hover:bg-white/10 transition-all"
                    >
                      <option value="" className="bg-[#111]">Kampaniya</option>
                      {campaigns.map((c: any) => (
                        <option key={c.id} value={c.id} className="bg-[#111]">{c.title}</option>
                      ))}
                    </select>
                  )}
                   <button 
                     onClick={() => setLightMode(!lightMode)} 
                     className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/5 border border-white/10 text-xs font-black uppercase tracking-wider hover:bg-white/10 transition-all"
                   >
                     {lightMode ? <Sun size={16} /> : <Moon size={16} />}
                     <span className="hidden sm:inline">{lightMode ? 'Aydın' : 'Qaranlıq'}</span>
                   </button>
                   <button 
                     onClick={() => {
                       if (!document.fullscreenElement) {
                         document.documentElement.requestFullscreen().catch(() => {});
                       } else {
                         document.exitFullscreen();
                       }
                     }}
                     className="p-3 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
                     title="Tam Ekran"
                   >
                     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                       <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                     </svg>
                   </button>
                </div>
              </div>

               <div className="flex-1 overflow-y-auto">
                <div className="grid grid-cols-4 gap-4">
                  {visibleTables?.map((table: any) => {
                    const groupInfo = tableGroupInfo[table.table_number];
                    const isGroup = groupInfo && groupInfo.children.length > 0;
                    
                    return (
                      <motion.div
                        key={table.table_number}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 350, damping: 30 }}
                        className="col-span-1"
                      >
                        <TableCard 
                          table={table}
                          onTap={() => handleTableTap(table)} 
                          onAction={() => handleOpenAction(table)}
                          isSelected={selectedForMerge.includes(table.table_number)}
                          selectionMode={mergeMode}
                          isTransferSource={transferSource === table.table_number}
                          isTransferTarget={transferTarget === table.table_number}
                          groupNumber={groupInfo?.groupNum}
                          mergedChildNumbers={groupInfo?.children}
                          isMergedChild={false}
                        />
                      </motion.div>
                    );
                  })}
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
                    onAddProduct={(p) => handleProductTap(p)}
                    onAddCombo={(c) => pos.addComboToCart(c)}
                    cartCounts={(pos.cart?.items ?? []).reduce((acc: Record<string, number>, item: any) => {
                      const id = item.product_id;
                      acc[id] = (acc[id] || 0) + (item.quantity || 0);
                      return acc;
                    }, {})}
                    outOfStock={new Set((pos.products ?? []).filter((p: any) => p.is_in_stock === false || p.is_available === false).map((p: any) => p.id))}
                  />
               </div>
               <div className="w-full md:w-[400px] border-l p-6 bg-black/20">
                     <CartPanel 
                       cart={pos.cart} 
                       campaign={selectedCampaign ? { id: selectedCampaign.id, name: selectedCampaign.title, discount: Number(selectedCampaign.discount_value || 0), type: selectedCampaign.type } : null}
                       onPlaceOrder={() => pos.placeOrder()} 
                       onBack={() => pos.setActiveView('floor')}
                       orderButtonStatus={pos.placingOrder ? 'loading' : 'idle'}
                       onUpdateQty={(idx, delta) => pos.updateCartItemQty(idx, delta)}
                       onUpdateGuests={(delta) => pos.updateGuestCount(delta)}
                       onRecordLoss={handleRecordLoss}
                       onClearDraft={() => pos.clearCart()}
                       mergedChildNumbers={activeFloor?.merged_groups?.find((g: any) => g.parent.table_number === pos.selectedTable?.table_number)?.children?.map((c: any) => c.table_number)}
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
        onUnmerge={() => setSplitMode(true)}
        onCloseBill={handleCloseBill}
        onPrint={() => window.print()}
        onCancelTable={() => { pos.dismissTable(actionSheetTable.table_number); setActionSheetOpen(false); }}
        mergeMode={mergeMode}
        mergeParent={selectedForMerge[0]}
        splitMode={splitMode}
        mergedGroupChildren={actionSheetGroup?.children}
        selectedForMerge={selectedForMerge}
        selectedForSplit={selectedForSplit}
        onToggleSplit={(n) => {
          if (selectedForSplit.includes(n)) setSelectedForSplit(p => p.filter(x => x !== n));
          else setSelectedForSplit(p => [...p, n]);
        }}
        onConfirmSplit={handleUnmerge}
        onCancelMode={() => { setMergeMode(false); setTransferMode(false); setSplitMode(false); setSelectedForMerge([]); setSelectedForSplit([]); setTransferSource(null); setTransferTarget(null); }}
        onConfirmMerge={async () => { 
          await pos.mergeTables(selectedForMerge); 
          setLastUndo(pos.lastUndo);
          setMergeMode(false); 
          setSelectedForMerge([]); 
        }}
        groupNumber={actionSheetTable ? tableGroupInfo[actionSheetTable.table_number]?.groupNum : undefined}
      />

      <AnimatePresence>
        {lastUndo && (
          <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-6 px-8 py-4 rounded-[2rem] bg-zinc-900 text-white shadow-2xl border border-white/10">
            <span className="text-sm font-bold">{lastUndo.message}</span>
            <button onClick={() => { pos.performUndo(); setLastUndo(null); }} className="px-6 py-2.5 rounded-2xl bg-white text-black text-xs font-black uppercase tracking-widest hover:bg-zinc-200 transition-all active:scale-95">Geri Al</button>
          </motion.div>
        )}
      </AnimatePresence>

      <ModifierSheet
        open={!!modalProduct}
        productName={modalProduct?.product.name || ''}
        productPrice={modalProduct?.product.price || 0}
        variants={modalProduct?.variants || []}
        onClose={() => setModalProduct(null)}
        onConfirm={(_modifiers, notes, variantId) => {
          if (modalProduct) {
            pos.addToCart(modalProduct.product, { variantId: variantId || null, notes });
          }
          setModalProduct(null);
        }}
      />
    </div>
  );
}
