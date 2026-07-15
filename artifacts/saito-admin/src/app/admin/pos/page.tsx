'use client';

import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon, X } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { usePos } from './hooks/usePos';
import { TableCard } from './components/TableCard';
import { ActionSheet } from './components/ActionSheet';
import { ProductGrid } from './components/ProductGrid';
import { CartPanel } from './components/CartPanel';
import { ModifierSheet } from './components/ModifierSheet';
import { LiquidDropdown } from '@/components/ui/LiquidDropdown';
import { toast } from '@/lib/toast';
import { printReceipt, getReceiptSettings } from '@/lib/print/PrintService';
import { apiFetch } from '@/lib/api-fetch';
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
  const [transferConfirm, setTransferConfirm] = useState(false);

  const [unmergeMode, setUnmergeMode] = useState(false);
  const [selectedForUnmerge, setSelectedForUnmerge] = useState<number[]>([]);

  const [lastUndo, setLastUndo] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
  const [cleanMode, setCleanMode] = useState(false);
  const [paymentView, setPaymentView] = useState(false);

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
          const active = (data.data || []).filter((c: any) => c.status === 'active');
          setCampaigns(active);
        }
      } catch (e) {
        console.error('Failed to load campaigns:', e);
      }
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

  const handleOpenPayment = () => setPaymentView(true);
  const handleBackFromPayment = () => setPaymentView(false);

  const handlePaymentMethodSelect = async (method: 'cash' | 'card' | 'split') => {
    if (!actionSheetTable) return;
    const tableNumbers = actionSheetGroup
      ? [actionSheetTable.table_number, ...actionSheetGroup.children.map((c: any) => c.table_number)]
      : [actionSheetTable.table_number];

    if (method === 'split') {
      return;
    }

    toast.loading('Ödəniş işlənir...', { id: 'action-toast' });
    try {
      const ordersRes = await apiFetch('/api/orders');
      if (!ordersRes.ok) throw new Error('Failed to fetch orders');
      const ordersData = await ordersRes.json();
      const activeOrders = (ordersData.orders || []).filter((o: any) => 
        tableNumbers.includes(o.table_number) && 
        !['paid', 'cancelled', 'closed'].includes(o.status)
      );
      
      if (activeOrders.length === 0) {
        toast.error('Aktiv sifariş tapılmadı', { id: 'action-toast' });
        return;
      }

      const failedOrders: string[] = [];
      for (const activeOrder of activeOrders) {
        const total = activeOrder.total_amount || 0;
        const cashAmount = method === 'cash' ? total : 0;
        const cardAmount = method === 'card' ? total : 0;

        const res = await apiFetch('/api/orders/pay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_id: activeOrder.id,
            payment_method: method,
            cash_amount: cashAmount,
            card_amount: cardAmount,
            tip_amount: 0,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          failedOrders.push(activeOrder.id);
          console.error(`Payment failed for order ${activeOrder.id}:`, err);
        }
      }

      if (failedOrders.length > 0) {
        toast.error(`${failedOrders.length} sifariş ödənilərkən xəta baş verdi. Yenidən cəhd edin.`, { id: 'action-toast' });
        return;
      } else {
        toast.success('Bütün sifarişlər ödənildi', { id: 'action-toast' });
      }

      setPaymentView(false);
      setActionSheetOpen(false);
      pos.fetchData();

      const settings = await getReceiptSettings();
      if (settings.autoPrintReceipt) {
        for (const activeOrder of activeOrders) {
          const items = (activeOrder.order_items || []).map((item: any) => ({
            name: item.product_name || item.products?.name_az || item.products?.name_en || 'Məhsul',
            quantity: item.quantity || 1,
            price: Number(item.total_price || item.price || 0),
          }));
          await printReceipt({
            restaurantName: settings.restaurantName,
            address: settings.address,
            receiptTitle: settings.receiptTitle,
            currency: settings.receiptCurrency,
            serviceFeePct: settings.serviceFeePct,
            showServiceFee: settings.showServiceFee,
            footerText: settings.footerText,
            tableNumber: activeOrder.table_number,
            orderId: activeOrder.id,
            items,
            subtotal: Number(activeOrder.total_amount) || 0,
            discount: Number(activeOrder.discount_amount) || 0,
            discountName: activeOrder.campaigns?.name,
            tip: 0,
            total: Number(activeOrder.total_amount) || 0,
            paymentMethod: method,
            cashAmount: method === 'cash' ? Number(activeOrder.total_amount) || 0 : 0,
            cardAmount: method === 'card' ? Number(activeOrder.total_amount) || 0 : 0,
            date: new Date().toISOString(),
            time: new Date().toISOString(),
            paperWidth: settings.paperWidth,
            copies: settings.copies,
          });
        }
      }
    } catch (e: any) {
      toast.error(e.message || 'Ödəniş xətası');
    }
  };

  const handleSplitConfirm = async (split: { cash: string; card: string }) => {
    if (!actionSheetTable) return;
    const cash = parseFloat(split.cash) || 0;
    const card = parseFloat(split.card) || 0;
    const total = actionSheetTable.total_amount || 0;
    if (Math.abs((cash + card) - total) > 0.01) {
      toast.error('Məbləğlər ümumi ilə uyğun deyil', { id: 'action-toast' });
      return;
    }
    const tableNumbers = actionSheetGroup
      ? [actionSheetTable.table_number, ...actionSheetGroup.children.map((c: any) => c.table_number)]
      : [actionSheetTable.table_number];
    toast.loading('Ödəniş işlənir...', { id: 'action-toast' });
    try {
      const ordersRes = await apiFetch('/api/orders');
      if (!ordersRes.ok) throw new Error('Failed to fetch orders');
      const ordersData = await ordersRes.json();
      const activeOrders = (ordersData.orders || []).filter((o: any) => 
        tableNumbers.includes(o.table_number) && 
        !['paid', 'cancelled', 'closed'].includes(o.status)
      );
      const failedOrders: string[] = [];
      for (const activeOrder of activeOrders) {
        const res = await apiFetch('/api/orders/pay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_id: activeOrder.id,
            payment_method: 'split',
            cash_amount: cash / activeOrders.length,
            card_amount: card / activeOrders.length,
            tip_amount: 0,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          failedOrders.push(activeOrder.id);
          console.error(`Split payment failed for order ${activeOrder.id}:`, err);
        }
      }

      if (failedOrders.length > 0) {
        toast.error(`${failedOrders.length} sifariş ödənilərkən xəta baş verdi.`, { id: 'action-toast' });
        return;
      } else {
        toast.success('Bölünmüş ödəniş tamamlandı', { id: 'action-toast' });
      }

      setPaymentView(false);
      setActionSheetOpen(false);
      pos.fetchData();

      const settings = await getReceiptSettings();
      if (settings.autoPrintReceipt) {
        for (const activeOrder of activeOrders) {
          const items = (activeOrder.order_items || []).map((item: any) => ({
            name: item.product_name || item.products?.name_az || item.products?.name_en || 'Məhsul',
            quantity: item.quantity || 1,
            price: Number(item.total_price || item.price || 0),
          }));
          await printReceipt({
            restaurantName: settings.restaurantName,
            address: settings.address,
            receiptTitle: settings.receiptTitle,
            currency: settings.receiptCurrency,
            serviceFeePct: settings.serviceFeePct,
            showServiceFee: settings.showServiceFee,
            footerText: settings.footerText,
            tableNumber: activeOrder.table_number,
            orderId: activeOrder.id,
            items,
            subtotal: Number(activeOrder.total_amount) || 0,
            discount: Number(activeOrder.discount_amount) || 0,
            discountName: activeOrder.campaigns?.name,
            tip: 0,
            total: Number(activeOrder.total_amount) || 0,
            paymentMethod: 'split',
            cashAmount: cash / activeOrders.length,
            cardAmount: card / activeOrders.length,
            date: new Date().toISOString(),
            time: new Date().toISOString(),
            paperWidth: settings.paperWidth,
            copies: settings.copies,
          });
        }
      }
    } catch (e: any) {
      toast.error(e.message || 'Ödəniş xətası');
    }
  };

  const handleDismissGroup = async () => {
    if (!actionSheetTable) return;
    const group = actionSheetGroup;
    const numbers = [actionSheetTable.table_number, ...(group?.children?.map((c: any) => c.table_number) || [])];
    toast.loading('Qrup boşaldılır...', { id: 'action-toast' });
    for (const num of numbers) {
      await pos.dismissTable(num);
    }
    setActionSheetOpen(false);
    pos.fetchData();
    toast.success('Qrup boşaldıldı', { id: 'action-toast' });
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
        const t = table;
        if (!t || t.status === 'empty') {
          toast.error('Boş masadan köçürmə edə bilməzsiniz');
          return;
        }
        setTransferSource(table.table_number);
        toast(`Mənbə: Masa ${table.table_number}. İndi hədəf seçin.`);
      } else if (table.table_number === transferSource) {
        toast.error('Eyni masanı seçdiz');
      } else if (table.status !== 'empty') {
        toast.error('Yalnız boş masaya köçürə bilərsiniz');
      } else {
        setTransferTarget(table.table_number);
        setTransferConfirm(true);
      }
      return;
    }

    pos.selectTable(table);
  };

  const handleConfirmTransfer = async (targetTable?: number) => {
    if (!transferSource || !targetTable) return;
    try {
      const res = await apiFetch('/api/orders/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_table: transferSource,
          to_table: targetTable,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setLastUndo({ 
          action: 'transfer', 
          data: data.data?.undo, 
          message: `Masa ${transferSource} → ${targetTable}`,
          timestamp: Date.now()
        });
        toast.success('Masa köçürüldü');
        setTimeout(() => setLastUndo(null), 5000);
        setTransferMode(false);
        setTransferSource(null);
        setTransferTarget(null);
        pos.fetchData();
      } else {
        toast.error(data.error || 'Köçürmə uğursuz oldu');
        setTransferMode(false);
        setTransferSource(null);
        setTransferTarget(null);
      }
    } catch (e: any) {
      toast.error(e.message || 'Köçürmə xətası');
      setTransferMode(false);
      setTransferSource(null);
      setTransferTarget(null);
    }
  };

  const handleCancelTransfer = () => {
    setTransferMode(false);
    setTransferSource(null);
    setTransferTarget(null);
  };

  const handleUndo = async () => {
    if (!lastUndo || !lastUndo.data) return;
    try {
      const res = await apiFetch('/api/orders/transfer', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_table: lastUndo.data.from_table,
          to_table: lastUndo.data.to_table,
          orders: lastUndo.data.orders,
          table: lastUndo.data.table,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Köçürmə geri alındı');
        setLastUndo(null);
        pos.fetchData();
      } else {
        toast.error(data.error || 'Geri alınmadı');
      }
    } catch (e: any) {
      toast.error(e.message || 'Geri alma xətası');
    }
  };

  const handleUnmerge = async () => {
    if (!actionSheetTable) return;
    if (selectedForUnmerge.length === 0) {
      toast.error('Zəhmət olmasa ən azı bir masa seçin', { id: 'action-toast' });
      return;
    }
    try {
      const res = await apiFetch('/api/orders/unmerge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primary_table_number: actionSheetTable.table_number, child_table_numbers: selectedForUnmerge }),
      });
      const result = res.ok ? await res.json() : { error: (await res.json()).error || 'Xəta' };
      if (res.ok) {
        toast.success('Masalar ayrıldı', { id: 'action-toast' });
        setUnmergeMode(false);
        setSelectedForUnmerge([]);
        setActionSheetOpen(false);
        pos.fetchData();
      } else {
        toast.error(result.error || 'Ayırma uğursuz oldu', { id: 'action-toast' });
      }
    } catch (e: any) {
      toast.error(e.message || 'Ayırma xətası', { id: 'action-toast' });
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
      {pos.loading ? (
        <div className="flex-1 min-h-0 relative overflow-hidden">
          <div className="h-full flex flex-col p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="w-24 h-8 bg-white/10 rounded-lg animate-pulse" />
              <div className="flex items-center gap-3">
                <div className="w-24 h-8 bg-white/10 rounded-full animate-pulse" />
                <div className="w-24 h-8 bg-white/10 rounded-full animate-pulse" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-4 gap-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="w-full aspect-[4/5] rounded-[2rem] bg-white/5 border border-white/5 animate-pulse" />
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 relative overflow-hidden">
          <AnimatePresence mode="wait">
            {pos.activeView === 'floor' && (
                <div key="floor" className="h-full flex flex-col p-6">
                {!cleanMode && (
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ type: "spring", stiffness: 400, damping: 30 }}>
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
                       onClick={() => { setTransferMode(true); setMergeMode(false); setTransferSource(null); setTransferTarget(null); setTransferConfirm(false); }}
                       className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${transferMode ? 'bg-emerald-500 text-white' : 'text-white/50 hover:text-white'}`}
                     >
                        Köçür
                     </button>
                   </div>
                   {transferMode && (
                     <div className="flex items-center gap-2">
                       <div className="px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-wider">
                         {transferSource ? `Mənbə: Masa ${transferSource}` : 'Mənbə seçin'}
                       </div>
                       <button onClick={() => { setTransferMode(false); setTransferSource(null); setTransferTarget(null); setTransferConfirm(false); }} className="px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-black uppercase tracking-wider hover:bg-rose-500/20 transition-all">
                         Ləğv
                       </button>
                     </div>
                   )}
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
                        setCleanMode(!cleanMode);
                      }}
                      className={`p-3 rounded-full border transition-all ${cleanMode ? 'bg-gold text-black border-gold' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                      title="Tam Ekran / Sadə Rejim"
                    >
                      {cleanMode ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                        </svg>
                      )}
                    </button>
                 </div>
                </div>
              </motion.div>
              )}
              {cleanMode && (
                <button
                  onClick={() => setCleanMode(false)}
                  className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 bg-black/80 text-white text-xs font-black rounded-full border border-white/10 hover:bg-black transition-all"
                  title="Sadə rejimi bağla"
                >
                  ✕ Sadə rejimi bağla
                </button>
              )}
              {transferConfirm && transferSource && transferTarget && (
                <motion.div
                  initial={{ opacity: 0, y: 100 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 100 }}
                  className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-center p-4 pointer-events-none"
                >
                  <div className="pointer-events-auto w-full max-w-md bg-white text-black rounded-2xl shadow-2xl border border-white/20 p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 mb-1">Köçürmə Təsdiqi</p>
                        <p className="text-sm font-bold">Masa {transferSource} → Masa {transferTarget}</p>
                      </div>
                      <button onClick={() => { setTransferConfirm(false); }} className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-500 hover:bg-zinc-200 transition-all">
                        <X size={16} />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setTransferConfirm(false); setTransferTarget(null); }} className="flex-1 py-4 rounded-2xl border border-zinc-200 text-zinc-600 text-xs font-black hover:bg-zinc-50 transition-all">Ləğv</button>
                      <button onClick={() => { handleConfirmTransfer(transferTarget); setTransferConfirm(false); }} className="flex-1 py-4 rounded-2xl bg-emerald-500 text-white text-xs font-black hover:bg-emerald-600 transition-all">Təsdiqlə</button>
                    </div>
                  </div>
                </motion.div>
              )}
  
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
                        onTap={() => {
                          if (transferMode && table.status === 'empty') {
                            toast.error('Boş masaya köçürə bilməzsiniz');
                            return;
                          }
                          handleTableTap(table);
                        }} 
                        onAction={() => handleOpenAction(table)}
                        isSelected={selectedForMerge.includes(table.table_number)}
                        selectionMode={mergeMode}
                        isTransferSource={transferSource === table.table_number}
                        isTransferTarget={transferTarget === table.table_number}
                        groupNumber={groupInfo?.groupNum}
                        mergedChildNumbers={groupInfo?.children}
                        isMergedChild={false}
                        kitchenStatus={table.kitchen_status}
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
                        customerId={pos.cart?.customer_id}
                        customerName={pos.cart?.customer_name}
                        currentDiscount={pos.cart?.discount_amount ? { amount: pos.cart.discount_amount, type: pos.cart.discount_type || 'fixed' } : null}
                      />
               </div>
            </div>
          )}
         </AnimatePresence>
       </div>
       )}
 
        <ActionSheet
         table={actionSheetTable} 
         open={actionSheetOpen} 
         onClose={() => { setActionSheetOpen(false); setUnmergeMode(false); setPaymentView(false); setTransferMode(false); setTransferSource(null); setTransferTarget(null); }} 
         onAddOrder={() => { pos.selectTable(actionSheetTable); setActionSheetOpen(false); }}
         onUnmerge={() => setUnmergeMode(true)}
         onOpenPayment={handleOpenPayment}
         onPaymentMethodSelect={handlePaymentMethodSelect}
         onSplitConfirm={handleSplitConfirm}
         onBackFromPayment={handleBackFromPayment}
         onCancelTable={() => { pos.dismissTable(actionSheetTable.table_number); setActionSheetOpen(false); }}
         onDismissGroup={handleDismissGroup}
         paymentView={paymentView}
         mergeMode={mergeMode}
         mergeParent={selectedForMerge[0]}
         unmergeMode={unmergeMode}
         isMerged={!!actionSheetGroup}
         mergedGroupChildren={actionSheetGroup?.children}
         selectedForMerge={selectedForMerge}
         selectedForUnmerge={selectedForUnmerge}
         onToggleUnmerge={(n) => {
           if (selectedForUnmerge.includes(n)) setSelectedForUnmerge(p => p.filter(x => x !== n));
           else setSelectedForUnmerge(p => [...p, n]);
         }}
         onConfirmUnmerge={handleUnmerge}
         onCancelMode={() => { setMergeMode(false); setTransferMode(false); setUnmergeMode(false); setSelectedForMerge([]); setSelectedForUnmerge([]); setTransferSource(null); setTransferTarget(null); }}
         onConfirmMerge={async () => { 
           await pos.mergeTables(selectedForMerge); 
           setLastUndo(pos.lastUndo);
           setMergeMode(false); 
           setSelectedForMerge([]); 
         }}
         groupNumber={actionSheetTable ? tableGroupInfo[actionSheetTable.table_number]?.groupNum : undefined}
         transferMode={transferMode}
         transferSource={transferSource}
         transferTarget={transferTarget}
         onConfirmTransfer={async () => {
           if (transferSource && transferTarget) {
             await handleConfirmTransfer(transferTarget);
           }
         }}
         onCancelTransfer={() => {
           setTransferMode(false);
           setTransferSource(null);
           setTransferTarget(null);
         }}
          customerId={pos.cart?.customer_id}
          customerName={pos.cart?.customer_name}
          onSelectCustomer={(customerId, customerName) => {
            pos.updateCartCustomer(customerId, customerName);
          }}
          currentDiscount={pos.cart?.discount_amount ? { amount: pos.cart.discount_amount, type: pos.cart.discount_type || 'fixed' } : null}
        onApplyDiscount={({ amount, type }) => {
           pos.updateCartDiscount(amount, type);
         }}
        />

      <AnimatePresence>
        {lastUndo && (
          <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-6 px-8 py-4 rounded-[2rem] bg-zinc-900 text-white shadow-2xl border border-white/10">
            <span className="text-sm font-bold">{lastUndo.message}</span>
            <button onClick={handleUndo} className="px-6 py-2.5 rounded-2xl bg-white text-black text-xs font-black uppercase tracking-widest hover:bg-zinc-200 transition-all active:scale-95">Geri Al</button>
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
