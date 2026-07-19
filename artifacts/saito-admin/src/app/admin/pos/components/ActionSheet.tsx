'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import {
  Plus, Split, CreditCard, Trash2, Wallet, Receipt, XCircle, Check,
  User, Search, Phone
} from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import type { PosTable } from '../types/shared';

interface ActionSheetProps {
  table: PosTable | null;
  open: boolean;
  onClose: () => void;
  onAddOrder: () => void;
  onUnmerge: () => void;
  onCancelTable?: () => void;
  onOpenPayment?: () => void;
  onPaymentMethodSelect?: (method: 'cash' | 'card') => void;
  onSplitConfirm?: (split: { cash: string; card: string }) => void;
  onDismissGroup?: () => void;
  onBackFromPayment?: () => void;
  onSelectCustomer?: (customerId: string | null, customerName: string | null) => void;
  customerId?: string | null;
  customerName?: string | null;
  mergeMode?: boolean;
  mergeParent?: number | null;
  unmergeMode?: boolean;
  isMerged?: boolean;
  mergedGroupChildren?: PosTable[];
  selectedForMerge?: number[];
  selectedForUnmerge?: number[];
  onToggleUnmerge?: (num: number) => void;
  onConfirmUnmerge?: () => void;
  onCancelMode?: () => void;
  onConfirmMerge?: () => void;
  groupNumber?: number;
  paymentView?: boolean;
  transferMode?: boolean;
  transferSource?: number | null;
  transferTarget?: number | null;
  onConfirmTransfer?: () => void;
  onCancelTransfer?: () => void;
}

const fastTransition = { type: "spring", stiffness: 450, damping: 38, mass: 1 } as const;

export function ActionSheet({ 
  table, open, onClose, onAddOrder, onUnmerge, onCancelTable,
  onOpenPayment, onPaymentMethodSelect, onSplitConfirm, onDismissGroup,
  onBackFromPayment, onSelectCustomer, customerId, customerName,
  mergeMode, mergeParent, unmergeMode, isMerged, mergedGroupChildren, selectedForMerge, selectedForUnmerge,
  onToggleUnmerge, onConfirmUnmerge, onCancelMode, onConfirmMerge, groupNumber,
  paymentView,
  transferMode, transferSource, transferTarget, onConfirmTransfer, onCancelTransfer
}: ActionSheetProps) {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  const [localSplit, setLocalSplit] = useState<{ cash: string; card: string } | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);

  const loadCustomers = async (q: string) => {
    setLoadingCustomers(true);
    try {
      const res = await fetch(`/api/customers?q=${encodeURIComponent(q)}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setCustomers(Array.isArray(data) ? data : []);
      }
    } catch {
      setCustomers([]);
    } finally {
      setLoadingCustomers(false);
    }
  };

  const handleCustomerSelect = (customerId: string | null, customerName: string | null) => {
    onSelectCustomer?.(customerId, customerName);
    setShowCustomerSearch(false);
    setCustomerSearch('');
  };

  useEffect(() => {
    if (open && !mergeMode) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
  }, [open, mergeMode]);

  if (!table && !mergeMode && !paymentView) return null;

  const isOccupied = table?.status !== 'empty';

  const actions = [
    { id: 'add_order', icon: Plus, label: t('add_items'), visible: true },
    { id: 'customer', icon: User, label: customerName ? `${customerName}` : t('select_customer') || 'Müştəri', visible: true },
    { id: 'close_bill', icon: CreditCard, label: t('close_bill'), visible: isOccupied && (table?.total_amount ?? 0) > 0 },
    { id: 'cancel_table', icon: Trash2, label: t('dismiss_table') || 'Masanı boşalt', visible: isOccupied || table?.status === 'reserved' },
  ];

  const visibleActions = actions.filter(a => a.visible);
  const mergedChildren = unmergeMode && table ? (mergedGroupChildren ?? []) : [];
  const showSplitForm = !!localSplit;
  const showCustomerForm = showCustomerSearch;
  const currentView = showSplitForm ? 'split-payment' : showCustomerForm ? 'customer' : paymentView ? 'payment' : mergeMode ? 'merge' : unmergeMode ? 'split' : open ? 'actions' : 'none';
  const groupName = table?.parent_table_number || table?.table_number;

  return (
    <AnimatePresence>
      {currentView !== 'none' && (
        <div key="global-pos-root" className="fixed inset-0 z-[120] flex items-end justify-center pointer-events-none pb-10">
          {/* Backdrop */}
          {(currentView === 'actions' || currentView === 'split' || currentView === 'payment' || currentView === 'split-payment') && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-0 pointer-events-auto bg-black/10 dark:bg-black/30 backdrop-blur-[2px]"
              onClick={onClose}
            />
          )}

          {/* THE STABLE MORPHING KAPSUL */}
          <motion.div
            layout
            layoutId="pos-hybrid-kapsul"
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={fastTransition}
            className={`relative z-10 pointer-events-auto overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.3)] border ${
              lightMode ? 'bg-white border-zinc-200' : 'bg-zinc-900/95 border-white/10'
             } ${
              currentView === 'merge' || currentView === 'split-payment'
                ? 'rounded-full px-6 py-3 min-w-[320px] max-w-md mx-auto' 
                : 'rounded-[2.5rem] p-7 w-[90%] max-w-md mx-auto'
            }`}
          >
            <AnimatePresence mode="wait">
               {currentView === 'actions' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }} key="ui-actions">
                   <div className="text-center mb-6">
                     <p className="text-2xl font-black tracking-tighter mb-1 leading-none">
                       {isMerged ? `Qrup ${groupNumber || groupName}` : `Masa ${table?.table_number}`}
                     </p>
                    {isMerged && (
                      <div className="flex flex-wrap justify-center gap-1.5 mt-3 mb-4">
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${lightMode ? 'bg-indigo-100 text-indigo-600' : 'bg-indigo-500/20 text-indigo-400'}`}>
                          Masa {table?.table_number} (Əsas)
                        </span>
                        {mergedGroupChildren?.map(child => (
                          <span key={child.table_number} className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${lightMode ? 'bg-zinc-100 text-zinc-500' : 'bg-white/5 text-zinc-400'}`}>
                            Masa {child.table_number}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">{isOccupied ? `${table?.guest_count} Qonaq · ₼${(table?.total_amount || 0).toFixed(2)}` : 'Boş Masa'}</p>
                  </div>
                  {isMerged ? (
                    <div className="grid grid-cols-3 gap-3">
                      {isOccupied && (table?.total_amount ?? 0) > 0 && (
                        <button onClick={onOpenPayment}
                          className={`flex flex-col items-center justify-center gap-2 py-4 rounded-[1.5rem] border transition-all ${lightMode ? 'bg-gold/10 border-gold/20 text-gold' : 'bg-gold/10 border-gold/20 text-gold'} active:scale-95`}>
                          <CreditCard size={22} strokeWidth={2.5} />
                          <span className="text-[9px] font-black tracking-widest uppercase text-center px-1">{t('close_bill')}</span>
                        </button>
                      )}
                      <button onClick={onUnmerge}
                        className={`flex flex-col items-center justify-center gap-2 py-4 rounded-[1.5rem] border transition-all ${lightMode ? 'bg-blue-500/10 border-blue-500/20 text-blue-500' : 'bg-blue-500/10 border-blue-500/20 text-blue-400'} active:scale-95`}>
                        <Split size={22} strokeWidth={2.5} />
                        <span className="text-[9px] font-black tracking-widest uppercase text-center px-1">Masaları Ayır</span>
                      </button>
                      <button onClick={onDismissGroup}
                        className={`flex flex-col items-center justify-center gap-2 py-4 rounded-[1.5rem] border transition-all ${lightMode ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'} active:scale-95`}>
                        <Trash2 size={22} strokeWidth={2.5} />
                        <span className="text-[9px] font-black tracking-widest uppercase text-center px-1">Qrupu Boşalt</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
                      {visibleActions.map((action) => {
                        if (action.id === 'customer') {
                          return (
                            <button key={action.id} onClick={() => setShowCustomerSearch(true)}
                              className={`flex flex-col items-center justify-center gap-2 py-4 rounded-[1.5rem] border transition-all ${lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-600' : 'bg-white/5 border-white/5 text-zinc-300'} active:scale-95`}>
                              <User size={22} strokeWidth={2.5} />
                              <span className="text-[9px] font-black tracking-widest uppercase text-center px-1">{customerName || 'Müştəri'}</span>
                            </button>
                          );
                        }
                        return (
                          <button key={action.id} onClick={() => { const fn = { add_order: onAddOrder, close_bill: onOpenPayment, cancel_table: onCancelTable }[action.id as string]; if (fn) fn(); }}
                            className={`flex flex-col items-center justify-center gap-2 py-4 rounded-[1.5rem] border transition-all ${lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-600' : 'bg-white/5 border-white/5 text-zinc-300'} active:scale-95`}>
                            <action.icon size={22} strokeWidth={2.5} />
                            <span className="text-[9px] font-black tracking-widest uppercase text-center px-1">{action.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                 <button onClick={onClose} className="w-full mt-5 py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest bg-[var(--theme-surface-soft)] opacity-80 hover:opacity-100">Bağla</button>
                </motion.div>
              )}

              {currentView === 'payment' && (
                <motion.div initial={{ opacity: 0, y: 30, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 30, scale: 0.95 }} transition={{ type: "spring", stiffness: 400, damping: 30 }} key="ui-payment" className="flex flex-col gap-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 mb-1">Ödəniş Növü</p>
                   <p className="text-xl font-black tracking-tighter mb-3">₼{(table?.total_amount || 0).toFixed(2)}</p>
                  <button onClick={() => onPaymentMethodSelect?.('cash')} className="flex items-center gap-3 w-full p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 active:scale-[0.98] transition-all">
                    <Wallet size={20} strokeWidth={2.5} />
                    <span className="text-sm font-black tracking-wide">Nağd</span>
                  </button>
                   <button onClick={() => onPaymentMethodSelect?.('card')} className="flex items-center gap-3 w-full p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 active:scale-[0.98] transition-all">
                      <CreditCard size={20} strokeWidth={2.5} />
                      <span className="text-sm font-black tracking-wide">Kart</span>
                    </button>
                    <button onClick={() => setLocalSplit({ cash: '', card: (table?.total_amount || 0).toFixed(2) })} className="flex items-center gap-3 w-full p-4 rounded-2xl bg-gold/10 border border-gold/20 text-gold active:scale-[0.98] transition-all">
                      <Receipt size={20} strokeWidth={2.5} />
                      <span className="text-sm font-black tracking-wide">Böl</span>
                    </button>
                     <button onClick={onBackFromPayment} className="w-full mt-3 py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest bg-[var(--theme-surface-soft)] opacity-80 hover:opacity-100">Geri</button>
                 </motion.div>
               )}

                 {currentView === 'split-payment' && localSplit && (
                   <motion.div initial={{ opacity: 0, y: 30, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 30, scale: 0.95 }} transition={{ type: "spring", stiffness: 400, damping: 30 }} key="ui-split-payment" className="flex flex-col gap-3">
                     <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold mb-1">Bölünmüş Ödəniş</p>
                     <p className="text-xl font-black tracking-tighter mb-2">₼{(table?.total_amount || 0).toFixed(2)}</p>
                    <div className="space-y-2">
                      <input
                        type="number"
                        step="0.01"
                        value={localSplit.cash}
                        onChange={e => setLocalSplit({ ...localSplit, cash: e.target.value })}
                        className={`w-full rounded-xl px-4 py-3 text-sm font-bold outline-none border ${lightMode ? 'bg-white border-black/10 text-black' : 'bg-white/5 border-white/10 text-white'}`}
                        placeholder="Nağd"
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={localSplit.card}
                        onChange={e => setLocalSplit({ ...localSplit, card: e.target.value })}
                        className={`w-full rounded-xl px-4 py-3 text-sm font-bold outline-none border ${lightMode ? 'bg-white border-black/10 text-black' : 'bg-white/5 border-white/10 text-white'}`}
                        placeholder="Kart"
                      />
                    </div>
                    <button onClick={() => { setLocalSplit(null); }} className="w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest bg-[var(--theme-surface-soft)]">Geri</button>
                     <button onClick={() => { onSplitConfirm?.(localSplit); setLocalSplit(null); }} className="w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest bg-gold text-black">Təsdiqlə</button>
                  </motion.div>
                )}

                {currentView === 'customer' && (
                  <motion.div initial={{ opacity: 0, y: 30, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 30, scale: 0.95 }} transition={{ type: "spring", stiffness: 400, damping: 30 }} key="ui-customer" className="flex flex-col gap-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500 mb-1">Müştəri</p>
                    <div className="relative mb-2">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)]" />
                      <input
                        value={customerSearch}
                        onChange={e => { setCustomerSearch(e.target.value); loadCustomers(e.target.value); }}
                        placeholder="Ad və ya telefon"
                        className={`w-full rounded-xl pl-9 pr-4 py-3 text-sm font-bold outline-none border ${lightMode ? 'bg-white border-black/10 text-black' : 'bg-white/5 border-white/10 text-white'}`}
                      />
                    </div>
                    <div className="max-h-[250px] overflow-y-auto space-y-1">
                      {loadingCustomers ? (
                        <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
                      ) : customers.length === 0 ? (
                        <p className="text-center text-[var(--theme-text-muted)] text-xs py-4">Müştəri tapılmadı</p>
                      ) : (
                        customers.map(c => (
                          <button key={c.id} onClick={() => handleCustomerSelect(c.id, c.name)}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${customerId === c.id ? 'bg-blue-500/20 border border-blue-500/30' : 'bg-white/5 border border-white/5 hover:bg-white/10'}`}>
                            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                              <User size={14} className="text-blue-400" />
                            </div>
                            <div className="flex-1 text-left">
                              <p className="text-sm font-bold text-[var(--theme-text)]">{c.name}</p>
                              {c.phone && <p className="text-[10px] text-[var(--theme-text-muted)]">{c.phone}</p>}
                            </div>
                            {customerId === c.id && <Check size={14} className="text-blue-400" />}
                          </button>
                        ))
                      )}
                    </div>
                    <button onClick={() => setShowCustomerSearch(false)} className="w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest bg-[var(--theme-surface-soft)]">Geri</button>
                  </motion.div>
                )}

               {currentView === 'split' && (
                <motion.div 
                  initial={{ opacity: 0, y: 30, scale: 0.95 }} 
                  animate={{ opacity: 1, y: 0, scale: 1 }} 
                  exit={{ opacity: 0, y: 30, scale: 0.95 }} 
                  transition={{ type: "spring", stiffness: 400, damping: 30 }} 
                  key="ui-split" 
                  className="flex flex-col gap-5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                       <span className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-500 mb-0.5">Masaları Ayır</span>
                       <span className="text-xl font-black tracking-tighter">Qrup {groupNumber || groupName}</span>
                    </div>
                    <button onClick={onClose} className="p-2 text-rose-500 hover:scale-110 transition-transform"><XCircle size={24} /></button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {/* Parent (always visible, not selectable) */}
                    <motion.div 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 }}
                      className={`flex items-center gap-3 p-4 rounded-[1.2rem] border ${lightMode ? 'bg-indigo-50 border-indigo-200' : 'bg-indigo-500/10 border-indigo-500/30'}`}
                    >
                      <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center border-indigo-400 bg-indigo-400">
                        <Check size={10} className="text-white" strokeWidth={4} />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-black">Masa {table?.table_number}</span>
                        <span className="text-[9px] font-bold uppercase opacity-50 tracking-wider">Əsas Masa</span>
                      </div>
                    </motion.div>
                    {/* Children (selectable) */}
                    {mergedChildren.length > 0 && (
                      <>
                        <span className={`text-[9px] font-black uppercase tracking-widest opacity-40 px-1 ${lightMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Uşaq Masalar</span>
                        <div className="grid grid-cols-2 gap-2 max-h-[180px] overflow-y-auto pr-1">
                          {mergedChildren.map((child, i) => (
                            <motion.button
                              key={child.table_number}
                              onClick={() => onToggleUnmerge?.(child.table_number)}
                              initial={{ opacity: 0, x: 20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.15 + i * 0.05 }}
                              className={`flex items-center gap-3 p-4 rounded-[1.2rem] border transition-all ${selectedForUnmerge?.includes(child.table_number) ? 'bg-blue-500 border-blue-500 text-white shadow-lg' : lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/5 border-white/5'}`}
                            >
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${selectedForUnmerge?.includes(child.table_number) ? 'bg-white border-white' : 'border-current opacity-20'}`}>
                                {selectedForUnmerge?.includes(child.table_number) && <Check size={10} className="text-blue-500" strokeWidth={4} />}
                              </div>
                              <span className="text-sm font-black">Masa {child.table_number}</span>
                            </motion.button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="flex gap-3 mt-1"
                  >
                     <button onClick={onClose} className="flex-1 py-4 rounded-[1.5rem] text-[10px] font-black bg-[var(--theme-surface-soft)]">Ləğv Et</button>
                     <button onClick={onConfirmUnmerge} className={`flex-[2] py-4 rounded-[1.5rem] text-[10px] font-black shadow-xl ${lightMode ? 'bg-zinc-900 text-white' : 'bg-white text-black'}`}>Seçilənləri Ayır</button>
                    </motion.div>
                </motion.div>
              )}

                {currentView === 'merge' && (
                 <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }} key="ui-bar" className="flex items-center gap-5 w-full">
                   <div className="flex flex-col mr-auto min-w-[140px]">
                     <span className="text-[8px] font-black uppercase tracking-[0.2em] text-blue-500 mb-0.5">Masaları Birləşdir</span>
                     <span className={`text-xs font-black truncate ${lightMode ? 'text-zinc-900' : 'text-white'}`}>
                       {mergeParent ? `Əsas: Masa ${mergeParent} + ${(selectedForMerge?.length || 1) - 1} uşaq` : 'Əsas masanı seçin'}
                     </span>
                   </div>
                   <div className="flex items-center gap-3">
                     <button onClick={onCancelMode} className="p-2.5 rounded-full bg-rose-500/10 text-rose-500 active:scale-90 transition-all"><XCircle size={18} strokeWidth={3} /></button>
                     <button onClick={onConfirmMerge} disabled={!mergeParent || (selectedForMerge?.length || 0) < 2} className={`px-7 py-3 rounded-full text-[10px] font-black shadow-lg ${lightMode ? 'bg-zinc-900 text-white' : 'bg-white text-black'} active:scale-95 transition-all disabled:opacity-30`}>Təsdiqlə</button>
                   </div>
                 </motion.div>
               )}

               {transferMode && transferSource && transferTarget && (
                 <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }} key="ui-transfer-bar" className="flex items-center gap-5 w-full">
                   <div className="flex flex-col mr-auto min-w-[140px]">
                     <span className="text-[8px] font-black uppercase tracking-[0.2em] text-emerald-500 mb-0.5">Köçürmə</span>
                     <span className={`text-xs font-black truncate ${lightMode ? 'text-zinc-900' : 'text-white'}`}>
                       Masa {transferSource} → Masa {transferTarget}
                     </span>
                   </div>
                   <div className="flex items-center gap-3">
                     <button onClick={onCancelTransfer} className="p-2.5 rounded-full bg-rose-500/10 text-rose-500 active:scale-90 transition-all"><XCircle size={18} strokeWidth={3} /></button>
                     <button onClick={onConfirmTransfer} className={`px-7 py-3 rounded-full text-[10px] font-black shadow-lg ${lightMode ? 'bg-zinc-900 text-white' : 'bg-white text-black'} active:scale-95 transition-all`}>Köçür</button>
                   </div>
                 </motion.div>
               )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
