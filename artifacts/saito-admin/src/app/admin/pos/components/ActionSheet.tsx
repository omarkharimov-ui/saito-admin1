'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Split, CreditCard, Trash2, Wallet, Receipt, XCircle, Check,
  User, Search, Phone, Smartphone, Building2, Gift, Car, ArrowLeftRight,
  ChevronRight, Hash, Printer, Pencil, Ban, PhoneCall, CheckCircle
} from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import type { PosTable } from '../types/shared';
import { appleViewSwap, appleBackdrop, appleCard, appleCapsule } from '@/lib/modal-transitions';
import { isAtLeast, requiresPin } from '@/lib/pos-permissions';
import { PinGuard } from './PinGuard';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';

type PaymentMethod = 'cash' | 'card' | 'qr' | 'transfer' | 'corporate' | 'gift_card' | 'voucher';


interface ActionSheetProps {
  table: PosTable | null;
  open: boolean;
  onClose: () => void;
  onAddOrder: () => void;
  onUnmerge: () => void;
  onCancelTable?: () => void;
  onOpenPayment?: () => void;
  onPaymentMethodSelect?: (method: PaymentMethod, tenderedAmount?: number) => void;
  onSplitConfirm?: (split: { cash: string; card: string }) => void;
  onDismissGroup?: () => void;
  onBackFromPayment?: () => void;
  onDeliveryStatus?: () => void;
  onTakeawayStatus?: () => void;
  onSelectCustomer?: (customerId: string | null, customerName: string | null) => void;
  customerId?: string | null;
  customerName?: string | null;
  mergeMode?: boolean;
  transferMode?: boolean;
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
  onBillRequest?: (tableNumber: number) => void;
  onPrintBill?: () => void;
  onClearTable?: () => void;
  onSeatGuests?: () => void;
  posRole?: string | null;
  groupNumber?: number;
  paymentView?: boolean;
  posMode?: 'dine_in' | 'takeaway' | 'delivery';
  transferConfirm?: boolean;
  transferSource?: number | null;
  transferTarget?: number | null;
  onConfirmTransfer?: () => void;
  onCancelTransfer?: () => void;
}

const fastTransition = appleCapsule;

export function ActionSheet({ 
  table, open, onClose, onAddOrder, onUnmerge, onCancelTable,
  onOpenPayment, onPaymentMethodSelect, onSplitConfirm, onDismissGroup,
  onBackFromPayment, onDeliveryStatus, onTakeawayStatus, onSelectCustomer, customerId, customerName,
  mergeMode, transferMode, mergeParent, unmergeMode, isMerged, mergedGroupChildren, selectedForMerge, selectedForUnmerge,
  onToggleUnmerge, onConfirmUnmerge, onCancelMode, onConfirmMerge, onBillRequest, onPrintBill, onClearTable, onSeatGuests, posRole, groupNumber,
  paymentView, transferConfirm, transferSource, transferTarget, onConfirmTransfer, onCancelTransfer,
  posMode = 'dine_in'
}: ActionSheetProps) {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  const router = useRouter();
  const keyboardHeight = useKeyboardHeight();
  const [localSplit, setLocalSplit] = useState<{ cash: string; card: string } | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [cashTenderedView, setCashTenderedView] = useState(false);
  const [cashTenderedAmount, setCashTenderedAmount] = useState('');
  const [cardConfirmView, setCardConfirmView] = useState(false);
  const [splitByItemsView, setSplitByItemsView] = useState(false);
  const [splitItems, setSplitItems] = useState<Record<number, 'cash' | 'card'>>({});
  const [confirmAction, setConfirmAction] = useState<'cancel_table' | 'dismiss_group' | null>(null);
  const [pinGuardOpen, setPinGuardOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ fn: () => void; action: string } | null>(null);
  const customerSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (open && !mergeMode && !transferMode) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [open, mergeMode, transferMode]);

  useEffect(() => {
    if (!open) {
      setCashTenderedView(false);
      setCashTenderedAmount('');
      setCardConfirmView(false);
      setLocalSplit(null);
      setShowCustomerSearch(false);
      setSplitByItemsView(false);
      setSplitItems({});
      setConfirmAction(null);
    }
  }, [open]);

  useEffect(() => {
    return () => { if (customerSearchTimerRef.current) clearTimeout(customerSearchTimerRef.current); };
  }, []);

  if (!table && !mergeMode && !transferMode && !transferConfirm && !paymentView) return null;

  const isOccupied = table?.status !== 'empty' && table?.status !== 'dirty';
  const isDirty = table?.status === 'dirty';
  const isTakeawayOrDelivery = posMode === 'takeaway' || posMode === 'delivery';
  const isDeliveryOnly = posMode === 'delivery';

  const posRoleNorm = posRole?.toLowerCase() || '';
  const isManagerOrAbove = isAtLeast(posRoleNorm, 'manager');
  const waiterPinRequired = requiresPin(posRoleNorm);

  const actions = [
    { id: 'add_order', icon: Plus, label: t('add_items'), visible: !isTakeawayOrDelivery },
    { id: 'customer', icon: User, label: customerName ? `${customerName}` : t('select_customer') || 'Müştəri', visible: true },
    { id: 'print_bill', icon: Printer, label: 'Hesabı Çap Et', visible: isOccupied && (table?.total_amount ?? 0) > 0 },
    { id: 'bill_request', icon: Receipt, label: 'Hesab Çağır', visible: !isTakeawayOrDelivery && isOccupied && (table?.total_amount ?? 0) > 0 && !table?.bill_requested },
    { id: 'close_bill', icon: CreditCard, label: t('close_bill'), visible: isManagerOrAbove && (isOccupied && (table?.total_amount ?? 0) > 0 || isTakeawayOrDelivery) },
    { id: 'cancel_table', icon: Trash2, label: isTakeawayOrDelivery ? 'Ləğv Et' : (t('dismiss_table') || 'Masanı boşalt'), visible: !table?.merged_into_table && (isOccupied || table?.status === 'reserved' || isTakeawayOrDelivery) },
    ...(posMode === 'delivery' ? [
      { id: 'delivery_status', icon: Car, label: 'Çatdırma Statusu', visible: true },
    ] : []),
    ...(posMode === 'takeaway' ? [
      { id: 'takeaway_status', icon: ChevronRight, label: 'Növbəti Addım', visible: true },
    ] : []),
  ];

  const visibleActions = actions.filter(a => a.visible);
  const mergedChildren = unmergeMode && table ? (mergedGroupChildren ?? []) : [];
  const showSplitForm = !!localSplit;
  const showCustomerForm = showCustomerSearch;
  const currentView = confirmAction ? 'confirm-action' : splitByItemsView ? 'split-by-items' : cashTenderedView ? 'cash-tendered' : cardConfirmView ? 'card-confirm' : showSplitForm ? 'split-payment' : showCustomerForm ? 'customer' : paymentView ? 'payment' : mergeMode ? 'merge' : (transferMode || transferConfirm) ? 'transfer' : unmergeMode ? 'split' : open ? 'actions' : 'none';
  const groupName = table?.parent_table_number || table?.table_number;

  return (
    <AnimatePresence>
      {currentView !== 'none' && (
        <div key="global-pos-root" className="fixed inset-0 z-[120] flex items-end justify-center pointer-events-none pb-10" style={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight + 16 : undefined }}>
          {/* Backdrop */}
          {(currentView === 'actions' || currentView === 'split' || currentView === 'payment' || currentView === 'split-payment' || currentView === 'split-by-items' || currentView === 'confirm-action') && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={appleBackdrop}
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
               currentView === 'merge' || currentView === 'split-payment' || currentView === 'transfer'
                 ? 'rounded-full px-6 py-3 min-w-[320px] max-w-md mx-auto' 
                 : 'rounded-[2.5rem] p-7 w-[90%] max-w-md mx-auto'
             }`}
          >
            <AnimatePresence mode="wait">
               {currentView === 'actions' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={appleViewSwap} key="ui-actions">
                   <div className="text-center mb-6">
                       <p className="text-2xl font-black tracking-tighter mb-1 leading-none">
                         {isMerged ? `Qrup ${groupNumber || groupName}` : isTakeawayOrDelivery ? ((table as any)?.order_number ? `${posMode === 'delivery' ? 'Çatdırılma' : 'Gel-Al'} ${(table as any).order_number}` : 'Sifariş') : `Masa ${table?.table_number}`}
                       </p>
                       {isTakeawayOrDelivery && (table as any)?.status && (
                         <span className={`inline-flex items-center gap-1.5 px-3 py-1 mt-2 rounded-full border text-[9px] font-black uppercase tracking-widest ${
                           (table as any).status === 'paid' ? 'bg-green-500/15 border-green-500/25 text-green-400'
                             : (table as any).status === 'cancelled' ? 'bg-red-500/15 border-red-500/25 text-red-400'
                             : (table as any).status === 'ready' ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400'
                             : 'bg-amber-500/15 border-amber-500/25 text-amber-400'
                         }`}>
                           <div className={`w-1.5 h-1.5 rounded-full ${
                             (table as any).status === 'paid' ? 'bg-green-400'
                               : (table as any).status === 'cancelled' ? 'bg-red-400'
                               : (table as any).status === 'ready' ? 'bg-emerald-400'
                               : 'bg-amber-400'
                           }`} />
                           {((table as any).status === 'new' && 'Yeni') ||
                            ((table as any).status === 'confirmed' && 'Təsdiqləndi') ||
                            ((table as any).status === 'in_kitchen' && 'Mətbəxdə') ||
                            ((table as any).status === 'ready' && 'Hazırdır') ||
                            ((table as any).status === 'paid' && 'Ödənildi') ||
                            ((table as any).status === 'cancelled' && 'Ləğv') ||
                            (table as any).status}
                         </span>
                       )}
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
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">
                      {isDirty
                        ? 'Təmizlənməli'
                        : isMerged
                          ? `${table?.guest_count || 0} Qonaq · ₼${(table?.total_amount || 0).toFixed(2)}`
                          : isTakeawayOrDelivery
                            ? `${(table as any)?.customer_name || ''} ${(table as any)?.customer_phone || ''}`.trim() || 'Sifariş'
                            : isOccupied ? `${table?.guest_count} Qonaq · ₼${(table?.total_amount || 0).toFixed(2)}` : 'Boş Masa'
                      }
                    </p>
                  </div>
                  {table?.status === 'reserved' ? (
                    <div className="grid grid-cols-3 gap-3">
                      <button onClick={onSeatGuests}
                        className="flex flex-col items-center justify-center gap-2 py-4 rounded-[1.5rem] border transition-all bg-indigo-500/10 border-indigo-500/20 text-indigo-600 active:scale-95">
                        <CheckCircle size={22} strokeWidth={2.5} />
                        <span className="text-[9px] font-black tracking-widest uppercase text-center px-1">Yerləşdir</span>
                      </button>
                      <button onClick={() => router.push(`/admin/reservations?edit=${table?.reservation_id}`)}
                        className="flex flex-col items-center justify-center gap-2 py-4 rounded-[1.5rem] border transition-all bg-zinc-100 border-zinc-200 text-zinc-600 active:scale-95">
                        <Pencil size={22} strokeWidth={2.5} />
                        <span className="text-[9px] font-black tracking-widest uppercase text-center px-1">Redaktə</span>
                      </button>
                      <button onClick={() => setConfirmAction('cancel_table')}
                        className="flex flex-col items-center justify-center gap-2 py-4 rounded-[1.5rem] border transition-all bg-rose-500/10 border-rose-500/20 text-rose-600 active:scale-95">
                        <Ban size={22} strokeWidth={2.5} />
                        <span className="text-[9px] font-black tracking-widest uppercase text-center px-1">Ləğv Et</span>
                      </button>
                      {table?.reservation_phone && (
                        <a href={`tel:${table.reservation_phone}`}
                          className="flex flex-col items-center justify-center gap-2 py-4 rounded-[1.5rem] border transition-all bg-zinc-100 border-zinc-200 text-zinc-600 active:scale-95">
                          <PhoneCall size={22} strokeWidth={2.5} />
                          <span className="text-[9px] font-black tracking-widest uppercase text-center px-1">Zəng Et</span>
                        </a>
                      )}
                    </div>
                  ) : isDirty ? (
                    <div className="flex flex-col gap-3">
                      <button onClick={onClearTable}
                        className={`flex items-center justify-center gap-3 py-5 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all ${
                          lightMode ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30' : 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                        } active:scale-[0.98]`}>
                        <Check size={18} strokeWidth={3} />
                        Təmizlə
                      </button>
                    </div>
                  ) : isMerged ? (
                    <div className="grid grid-cols-3 gap-3">
                      {isManagerOrAbove && isOccupied && (table?.total_amount ?? 0) > 0 && (
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
                      <button onClick={() => setConfirmAction('dismiss_group')}
                        className={`flex flex-col items-center justify-center gap-2 py-4 rounded-[1.5rem] border transition-all ${lightMode ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'} active:scale-95`}>
                        <Trash2 size={22} strokeWidth={2.5} />
                        <span className="text-[9px] font-black tracking-widest uppercase text-center px-1">Qrupu Boşalt</span>
                      </button>
                    </div>
                   ) : (
                    <div className="space-y-4">
                      {/* Primary actions section */}
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--theme-text-muted)] mb-2 px-1">Əsas Əməliyyatlar</p>
                        <div className="grid grid-cols-3 gap-3">
                          {visibleActions.filter(a => ['add_order', 'customer', 'close_bill'].includes(a.id)).map((action) => {
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
                              <button key={action.id} onClick={() => {
                                const fn = {
                                  add_order: onAddOrder,
                                  close_bill: onOpenPayment,
                                  cancel_table: () => setConfirmAction('cancel_table'),
                                  delivery_status: onDeliveryStatus,
                                  takeaway_status: onTakeawayStatus,
                                  bill_request: () => table?.table_number && onBillRequest?.(table.table_number),
                                  print_bill: onPrintBill,
                                }[action.id as string];
                                if (fn) fn();
                              }}
                                className={`flex flex-col items-center justify-center gap-2 py-4 rounded-[1.5rem] border transition-all ${
                                  action.id === 'bill_request'
                                    ? lightMode ? 'bg-amber-500/10 border-amber-500/20 text-amber-600' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                    : action.id === 'cancel_table'
                                    ? lightMode ? 'bg-rose-500/10 border-rose-500/20 text-rose-600' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                                    : lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-600' : 'bg-white/5 border-white/5 text-zinc-300'
                                } active:scale-95`}>
                                <action.icon size={22} strokeWidth={2.5} />
                                <span className="text-[9px] font-black tracking-widest uppercase text-center px-1">{action.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Secondary actions section */}
                      {visibleActions.some(a => ['print_bill', 'cancel_table', 'delivery_status', 'takeaway_status'].includes(a.id)) && (
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--theme-text-muted)] mb-2 px-1">Əlavə</p>
                          <div className="grid grid-cols-3 gap-3">
                            {visibleActions.filter(a => ['print_bill', 'cancel_table', 'delivery_status', 'takeaway_status'].includes(a.id)).map((action) => (
                              <button key={action.id} onClick={() => {
                                const fn = {
                                  add_order: onAddOrder,
                                  close_bill: onOpenPayment,
                                  cancel_table: () => setConfirmAction('cancel_table'),
                                  delivery_status: onDeliveryStatus,
                                  takeaway_status: onTakeawayStatus,
                                  bill_request: () => table?.table_number && onBillRequest?.(table.table_number),
                                  print_bill: onPrintBill,
                                }[action.id as string];
                                if (fn) fn();
                              }}
                                className={`flex flex-col items-center justify-center gap-2 py-4 rounded-[1.5rem] border transition-all ${
                                  action.id === 'bill_request'
                                    ? lightMode ? 'bg-amber-500/10 border-amber-500/20 text-amber-600' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                    : action.id === 'cancel_table'
                                    ? lightMode ? 'bg-rose-500/10 border-rose-500/20 text-rose-600' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                                    : lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-600' : 'bg-white/5 border-white/5 text-zinc-300'
                                } active:scale-95`}>
                                <action.icon size={22} strokeWidth={2.5} />
                                <span className="text-[9px] font-black tracking-widest uppercase text-center px-1">{action.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                 <button onClick={onClose} className="w-full mt-5 py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest bg-[var(--theme-surface-soft)] hover:opacity-100 transition-all">Bağla</button>
                </motion.div>
              )}

              {currentView === 'payment' && (
                <motion.div initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.97 }} transition={appleCard} key="ui-payment" className="flex flex-col gap-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 mb-1">Ödəniş Növü</p>
                   <p className="text-2xl font-black tracking-tighter mb-3 text-[var(--theme-accent)]">₼{(table?.total_amount || 0).toFixed(2)}</p>

                  {isDeliveryOnly ? (
                    <>
                      {/* Terminal — kartla ödəniş */}
                      <button onClick={() => setCardConfirmView(true)} className="flex items-center gap-3 w-full p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 active:scale-[0.98] transition-all hover:bg-blue-500/20">
                        <CreditCard size={20} strokeWidth={2.5} />
                        <div className="flex flex-col items-start">
                          <span className="text-sm font-black tracking-wide">Terminal</span>
                          <span className="text-[10px] font-medium opacity-60">Kartla ödəniş (POS terminal)</span>
                        </div>
                      </button>
                      {/* Kart-to-Kart — köçürmə */}
                      <button onClick={() => onPaymentMethodSelect?.('transfer')} className="flex items-center gap-3 w-full p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 active:scale-[0.98] transition-all hover:bg-purple-500/20">
                        <ArrowLeftRight size={20} strokeWidth={2.5} />
                        <div className="flex flex-col items-start">
                          <span className="text-sm font-black tracking-wide">Kart-to-Kart</span>
                          <span className="text-[10px] font-medium opacity-60">Bank köçürməsi / transfersiz</span>
                        </div>
                      </button>
                      {/* Nağd — çatdırma zamanı yerində ödəniş */}
                      <button onClick={() => onPaymentMethodSelect?.('cash', table?.total_amount || 0)} className="flex items-center gap-3 w-full p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 active:scale-[0.98] transition-all hover:bg-emerald-500/20">
                        <Wallet size={20} strokeWidth={2.5} />
                        <div className="flex flex-col items-start">
                          <span className="text-sm font-black tracking-wide">Nağd</span>
                          <span className="text-[10px] font-medium opacity-60">Çatdırma zamanı yerində ödəniş</span>
                        </div>
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setCashTenderedView(true); setCashTenderedAmount(''); }} className="flex items-center gap-3 w-full p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 active:scale-[0.98] transition-all hover:bg-emerald-500/20">
                        <Wallet size={20} strokeWidth={2.5} />
                        <div className="flex flex-col items-start">
                          <span className="text-sm font-black tracking-wide">Nağd</span>
                          <span className="text-[10px] font-medium opacity-60">Verilən pul daxil edin</span>
                        </div>
                      </button>
                       <button onClick={() => setCardConfirmView(true)} className="flex items-center gap-3 w-full p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 active:scale-[0.98] transition-all hover:bg-blue-500/20">
                          <CreditCard size={20} strokeWidth={2.5} />
                          <div className="flex flex-col items-start">
                            <span className="text-sm font-black tracking-wide">Kart</span>
                            <span className="text-[10px] font-medium opacity-60">Terminal ödənişi</span>
                          </div>
                        </button>
                        <button onClick={() => setLocalSplit({ cash: '', card: (table?.total_amount || 0).toFixed(2) })} className="flex items-center gap-3 w-full p-4 rounded-2xl bg-gold/10 border border-gold/20 text-gold active:scale-[0.98] transition-all hover:bg-gold/20">
                           <Receipt size={20} strokeWidth={2.5} />
                           <div className="flex flex-col items-start">
                             <span className="text-sm font-black tracking-wide">Böl</span>
                             <span className="text-[10px] font-medium opacity-60">Nağd + Kart qarışığı</span>
                           </div>
                         </button>
                        <button onClick={() => setSplitByItemsView(true)} className="flex items-center gap-3 w-full p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 active:scale-[0.98] transition-all hover:bg-purple-500/20">
                           <Hash size={20} strokeWidth={2.5} />
                           <div className="flex flex-col items-start">
                             <span className="text-sm font-black tracking-wide">Məhsula görə</span>
                             <span className="text-[10px] font-medium opacity-60">Hər məhsulu fərqli ödənişə yönəlt</span>
                           </div>
                         </button>
                    </>
                  )}
                      <button onClick={onBackFromPayment} className="w-full mt-3 py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest bg-[var(--theme-surface-soft)] hover:opacity-100 transition-all">Geri</button>
                 </motion.div>
               )}

              {currentView === 'cash-tendered' && (
                <motion.div initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.97 }} transition={appleCard} key="ui-cash-tendered" className="flex flex-col gap-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 mb-1">Nağd Ödəniş</p>
                  <p className="text-2xl font-black tracking-tighter mb-2 text-[var(--theme-accent)]">₼{(table?.total_amount || 0).toFixed(2)}</p>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Wallet size={20} className="text-emerald-400 flex-shrink-0" />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        autoFocus
                        value={cashTenderedAmount}
                        onChange={e => setCashTenderedAmount(e.target.value)}
                        placeholder="Verilən pul (₼)"
                        className={`flex-1 rounded-2xl px-5 py-4 text-lg font-black outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black focus:border-emerald-400' : 'bg-white/5 border-white/10 text-white focus:border-emerald-400/50'}`}
                      />
                    </div>
                    {cashTenderedAmount && Number(cashTenderedAmount) > 0 && (
                      Number(cashTenderedAmount) >= (table?.total_amount || 0) ? (
                        <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500/60 mb-1">Qalıq</p>
                          <p className="text-2xl font-black text-emerald-400 tabular-nums">₼{(Number(cashTenderedAmount) - (table?.total_amount || 0)).toFixed(2)}</p>
                        </motion.div>
                      ) : (
                        <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                          <p className="text-[10px] font-black uppercase tracking-widest text-amber-500/60 mb-1">Çatışmır</p>
                          <p className="text-2xl font-black text-amber-400 tabular-nums">₼{((table?.total_amount || 0) - Number(cashTenderedAmount)).toFixed(2)}</p>
                        </motion.div>
                      )
                    )}
                  </div>
                  <button onClick={() => { setCashTenderedView(false); setCashTenderedAmount(''); }} className="w-full mt-3 py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest bg-[var(--theme-surface-soft)] hover:opacity-100 transition-all">Geri</button>
                  <button
                    onClick={() => { onPaymentMethodSelect?.('cash', Number(cashTenderedAmount) || 0); setCashTenderedView(false); setCashTenderedAmount(''); }}
                    disabled={!cashTenderedAmount || Number(cashTenderedAmount) <= 0 || Number(cashTenderedAmount) < (table?.total_amount || 0) * 0.99}
                    className="w-full py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest bg-emerald-500 text-white active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
                  >
                    Ödənişi Tamamla
                  </button>
                </motion.div>
              )}

              {currentView === 'card-confirm' && (
                <motion.div initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.97 }} transition={appleCard} key="ui-card-confirm" className="flex flex-col gap-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500 mb-1">Kart Ödənişi</p>
                  <p className="text-2xl font-black tracking-tighter mb-2 text-[var(--theme-accent)]">₼{(table?.total_amount || 0).toFixed(2)}</p>
                  <div className="p-5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-center">
                    <CreditCard size={32} className="text-blue-400 mx-auto mb-3" />
                    <p className="text-sm font-bold text-blue-400">Terminala göndərildi</p>
                    <p className="text-[10px] text-blue-400/60 mt-1">Müştəri kartı terminala yaxınlaşdırsın</p>
                  </div>
                  <button onClick={() => { setCardConfirmView(false); }} className="w-full mt-2 py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest bg-[var(--theme-surface-soft)] hover:opacity-100 transition-all">Geri</button>
                  <button
                    onClick={() => { onPaymentMethodSelect?.('card'); setCardConfirmView(false); }}
                    className="w-full py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest bg-blue-500 text-white active:scale-[0.98] transition-all shadow-lg shadow-blue-500/20"
                  >
                    Ödənişi Təsdiqlə
                  </button>
                </motion.div>
              )}

                 {currentView === 'split-payment' && localSplit && (
                   <motion.div initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.97 }} transition={appleCard} key="ui-split-payment" className="flex flex-col gap-3">
                     <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold mb-1">Bölünmüş Ödəniş</p>
                     <p className="text-2xl font-black tracking-tighter mb-2 text-[var(--theme-accent)]">₼{(table?.total_amount || 0).toFixed(2)}</p>
                     <div className="space-y-3">
                       <div className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${lightMode ? 'bg-white border-black/5' : 'bg-white/5 border-white/10'}`}>
                         <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                           <Wallet size={18} className="text-emerald-400" />
                         </div>
                         <div className="flex-1 min-w-0">
                           <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500/60 mb-1">Nağd</p>
                           <input
                             type="number"
                             step="0.01"
                             min="0"
                             value={localSplit.cash}
                             onChange={e => {
                               const cashVal = e.target.value;
                               const total = table?.total_amount || 0;
                               const numCash = parseFloat(cashVal) || 0;
                               const cardVal = Math.max(0, total - numCash).toFixed(2);
                               setLocalSplit({ cash: cashVal, card: cardVal });
                             }}
                             className={`w-full rounded-xl px-3 py-2 text-lg font-black outline-none bg-transparent tabular-nums ${lightMode ? 'text-black' : 'text-white'}`}
                             placeholder="0.00"
                           />
                         </div>
                       </div>
                       <div className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${lightMode ? 'bg-white border-black/5' : 'bg-white/5 border-white/10'}`}>
                         <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                           <CreditCard size={18} className="text-blue-400" />
                         </div>
                         <div className="flex-1 min-w-0">
                           <p className="text-[9px] font-black uppercase tracking-widest text-blue-500/60 mb-1">Kart</p>
                           <input
                             type="number"
                             step="0.01"
                             min="0"
                             value={localSplit.card}
                             onChange={e => {
                               const cardVal = e.target.value;
                               const total = table?.total_amount || 0;
                               const numCard = parseFloat(cardVal) || 0;
                               const cashVal = Math.max(0, total - numCard).toFixed(2);
                               setLocalSplit({ cash: cashVal, card: cardVal });
                             }}
                             className={`w-full rounded-xl px-3 py-2 text-lg font-black outline-none bg-transparent tabular-nums ${lightMode ? 'text-black' : 'text-white'}`}
                             placeholder="0.00"
                           />
                         </div>
                       </div>
                     </div>
                     {(() => {
                       const total = table?.total_amount || 0;
                       const cash = parseFloat(localSplit.cash) || 0;
                       const card = parseFloat(localSplit.card) || 0;
                       const remaining = total - cash - card;
                       if (Math.abs(remaining) < 0.01) return null;
                       return (
                         <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`p-3 rounded-xl text-center ${remaining > 0 ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-emerald-500/10 border border-emerald-500/20'}`}>
                           <p className={`text-xs font-bold ${remaining > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                             {remaining > 0 ? `Qalıq: ₼${remaining.toFixed(2)}` : `Artıq: ₼${Math.abs(remaining).toFixed(2)}`}
                           </p>
                         </motion.div>
                       );
                     })()}
                     <div className="flex gap-3 mt-2">
                       <button onClick={() => { setLocalSplit(null); setCashTenderedView(false); }} className="flex-1 py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest bg-[var(--theme-surface-soft)]">Geri</button>
                       <button
                         onClick={() => { onSplitConfirm?.(localSplit); setLocalSplit(null); }}
                         disabled={(() => {
                           const total = table?.total_amount || 0;
                           const cash = parseFloat(localSplit.cash) || 0;
                           const card = parseFloat(localSplit.card) || 0;
                           return Math.abs(cash + card - total) > 0.01 || (cash + card) <= 0;
                         })()}
                         className="flex-[2] py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest bg-gold text-black active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-gold/20"
                       >
                         Təsdiqlə
                       </button>
                      </div>
                  </motion.div>
                )}

              {currentView === 'split-by-items' && (
                <motion.div initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.97 }} transition={appleCard} key="ui-split-by-items" className="flex flex-col gap-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold mb-1">Məhsula görə böl</p>
                  <p className="text-2xl font-black tracking-tighter mb-2 text-[var(--theme-accent)]">₼{(table?.total_amount || 0).toFixed(2)}</p>
                  <div className="space-y-2 max-h-[280px] overflow-y-auto">
                    {(table as any)?.order_items?.map((item: any, idx: number) => (
                      <div key={idx} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${lightMode ? 'bg-white border-black/5' : 'bg-white/5 border-white/10'}`}>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold truncate ${lightMode ? 'text-black' : 'text-white'}`}>
                            {item.quantity}x {item.product_name || item.products?.name_az || 'Məhsul'}
                          </p>
                          <p className={`text-[10px] font-bold tabular-nums ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                            ₼{(Number(item.total_price || item.unit_price * item.quantity) || 0).toFixed(2)}
                          </p>
                        </div>
                        <div className="flex gap-1.5 ml-3">
                          <button
                            onClick={() => setSplitItems(prev => ({ ...prev, [idx]: 'cash' }))}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border ${
                              splitItems[idx] === 'cash'
                                ? 'bg-emerald-500 text-white border-emerald-500'
                                : lightMode ? 'bg-zinc-50 text-zinc-500 border-zinc-200 hover:bg-emerald-50' : 'bg-white/5 text-zinc-400 border-white/10 hover:bg-emerald-500/10'
                            }`}
                          >
                            Nağd
                          </button>
                          <button
                            onClick={() => setSplitItems(prev => ({ ...prev, [idx]: 'card' }))}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border ${
                              splitItems[idx] === 'card'
                                ? 'bg-blue-500 text-white border-blue-500'
                                : lightMode ? 'bg-zinc-50 text-zinc-500 border-zinc-200 hover:bg-blue-50' : 'bg-white/5 text-zinc-400 border-white/10 hover:bg-blue-500/10'
                            }`}
                          >
                            Kart
                          </button>
                        </div>
                      </div>
                    )) || (
                      <p className={`text-center text-xs py-4 ${lightMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        Məhsul məlumatı yoxdur — yalnız məbləğə görə bölmə mümkündür
                      </p>
                    )}
                  </div>
                  {(() => {
                    const items = (table as any)?.order_items || [];
                    const allAssigned = items.length > 0 && items.every((_: any, idx: number) => splitItems[idx]);
                    const cashTotal = items.reduce((sum: number, _: any, idx: number) => {
                      if (splitItems[idx] !== 'cash') return sum;
                      return sum + (Number(items[idx].total_price || items[idx].unit_price * items[idx].quantity) || 0);
                    }, 0);
                    const cardTotal = items.reduce((sum: number, _: any, idx: number) => {
                      if (splitItems[idx] !== 'card') return sum;
                      return sum + (Number(items[idx].total_price || items[idx].unit_price * items[idx].quantity) || 0);
                    }, 0);
                    return (
                      <>
                        {allAssigned && (
                          <div className={`flex gap-2 p-3 rounded-xl ${lightMode ? 'bg-zinc-50 border border-zinc-100' : 'bg-white/5 border border-white/5'}`}>
                            <div className="flex-1 text-center">
                              <p className={`text-[9px] font-black uppercase ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>Nağd</p>
                              <p className="text-sm font-black tabular-nums text-emerald-400">₼{cashTotal.toFixed(2)}</p>
                            </div>
                            <div className="w-px bg-white/10" />
                            <div className="flex-1 text-center">
                              <p className={`text-[9px] font-black uppercase ${lightMode ? 'text-zinc-400' : 'text-white/30'}`}>Kart</p>
                              <p className="text-sm font-black tabular-nums text-blue-400">₼{cardTotal.toFixed(2)}</p>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                  <div className="flex gap-3 mt-2">
                    <button onClick={() => { setSplitByItemsView(false); setSplitItems({}); }} className="flex-1 py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest bg-[var(--theme-surface-soft)]">Geri</button>
                    <button
                      onClick={() => {
                        const items = (table as any)?.order_items || [];
                        const cashTotal = items.reduce((sum: number, _: any, idx: number) => {
                          if (splitItems[idx] !== 'cash') return sum;
                          return sum + (Number(items[idx].total_price || items[idx].unit_price * items[idx].quantity) || 0);
                        }, 0);
                        const cardTotal = items.reduce((sum: number, _: any, idx: number) => {
                          if (splitItems[idx] !== 'card') return sum;
                          return sum + (Number(items[idx].total_price || items[idx].unit_price * items[idx].quantity) || 0);
                        }, 0);
                        onSplitConfirm?.({ cash: cashTotal.toFixed(2), card: cardTotal.toFixed(2) });
                        setSplitByItemsView(false);
                        setSplitItems({});
                      }}
                      disabled={(() => {
                        const items = (table as any)?.order_items || [];
                        return items.length === 0 || !items.every((_: any, idx: number) => splitItems[idx]);
                      })()}
                      className="flex-[2] py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest bg-gold text-black active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-gold/20"
                    >
                      Təsdiqlə
                    </button>
                  </div>
                </motion.div>
              )}

                {currentView === 'customer' && (
                  <motion.div initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.97 }} transition={appleCard} key="ui-customer" className="flex flex-col gap-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500 mb-1">Müştəri</p>
                    <div className="relative mb-2">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)]" />
                      <input
                        value={customerSearch}
                        onChange={e => { 
                          setCustomerSearch(e.target.value); 
                          if (customerSearchTimerRef.current) clearTimeout(customerSearchTimerRef.current);
                          customerSearchTimerRef.current = setTimeout(() => loadCustomers(e.target.value), 300);
                        }}
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
                  initial={{ opacity: 0, y: 20, scale: 0.97 }} 
                  animate={{ opacity: 1, y: 0, scale: 1 }} 
                  exit={{ opacity: 0, y: 20, scale: 0.97 }} 
                  transition={appleCard} 
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
                    {mergedChildren.length === 0 && (
                      <p className={`text-center text-xs py-2 ${lightMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Uşaq masa yoxdur</p>
                    )}
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

                {currentView === 'confirm-action' && (
                 <motion.div initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.97 }} transition={appleCard} key="ui-confirm" className="flex flex-col gap-4 py-2">
                   <div className="text-center">
                     <p className={`text-xl font-black tracking-tight ${lightMode ? 'text-zinc-900' : 'text-white'}`}>
                       {confirmAction === 'dismiss_group' ? 'Qrupu boşaltmaq?' : 'Masanı boşaltmaq?'}
                     </p>
                     <p className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${lightMode ? 'text-zinc-400' : 'text-white/40'}`}>
                       {confirmAction === 'dismiss_group'
                         ? 'Bütün bağlı masalar da boşaldılacaq'
                         : 'Bu masa və bütün sifarişlər silinəcək'}
                     </p>
                   </div>
                   <div className="flex gap-3">
                     <button onClick={() => setConfirmAction(null)}
                       className={`flex-1 py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest border transition-all ${lightMode ? 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}>
                       Geri
                     </button>
                      <button onClick={() => {
                        const doAction = () => {
                          if (confirmAction === 'dismiss_group') onDismissGroup?.();
                          else onCancelTable?.();
                          setConfirmAction(null);
                        };
                        if (waiterPinRequired) {
                          setPendingAction({ fn: doAction, action: 'dismiss' });
                          setPinGuardOpen(true);
                        } else {
                          doAction();
                        }
                      }}
                       className={`flex-[2] py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest bg-rose-500 text-white active:scale-[0.98] transition-all shadow-lg shadow-rose-500/20`}>
                       Təsdiqlə
                     </button>
                   </div>
                 </motion.div>
                )}

                {currentView === 'merge' && (
                 <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={appleViewSwap} key="ui-bar" className="flex items-center gap-5 w-full">
                   <div className="flex flex-col mr-auto min-w-[140px]">
                     <span className="text-[8px] font-black uppercase tracking-[0.2em] text-blue-500 mb-0.5">Masaları Birləşdir</span>
                     <span className={`text-xs font-black truncate ${lightMode ? 'text-zinc-900' : 'text-white'}`}>
                       {mergeParent ? `Əsas: Masa ${mergeParent} + ${(selectedForMerge?.length || 1) - 1} uşaq` : 'Əsas masanı seçin'}
                     </span>
                   </div>
                   <div className="flex items-center gap-3">
                     <button onClick={onCancelMode} className="p-2.5 rounded-full bg-rose-500/10 text-rose-500 active:scale-90 transition-all"><XCircle size={18} strokeWidth={3} /></button>
                      <button onClick={() => {
                        const doMerge = () => {
                          onConfirmMerge?.();
                        };
                        if (waiterPinRequired) {
                          setPendingAction({ fn: doMerge, action: 'merge' });
                          setPinGuardOpen(true);
                        } else {
                          doMerge();
                        }
                      }} disabled={!mergeParent || (selectedForMerge?.length || 0) < 2} className={`px-7 py-3 rounded-full text-[10px] font-black shadow-lg ${lightMode ? 'bg-zinc-900 text-white' : 'bg-white text-black'} active:scale-95 transition-all disabled:opacity-30`}>Təsdiqlə</button>
                   </div>
                 </motion.div>
                )}

                {currentView === 'transfer' && (
                 <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={appleViewSwap} key="ui-transfer" className="flex items-center gap-5 w-full">
                   <div className="flex flex-col mr-auto min-w-[140px]">
                     <span className="text-[8px] font-black uppercase tracking-[0.2em] text-emerald-500 mb-0.5">Köçürmə</span>
                      <span className={`text-xs font-black truncate ${lightMode ? 'text-zinc-900' : 'text-white'}`}>
                        {transferSource && transferTarget
                          ? `Masa ${transferSource} → Masa ${transferTarget}`
                          : transferSource
                            ? `Mənbə: Masa ${transferSource} — hədəf seçin`
                            : 'Mənbə masanı seçin'}
                      </span>
                   </div>
                   <div className="flex items-center gap-3">
                     <button onClick={onCancelTransfer} className="p-2.5 rounded-full bg-rose-500/10 text-rose-500 active:scale-90 transition-all"><XCircle size={18} strokeWidth={3} /></button>
                      <button onClick={() => {
                        const doTransfer = () => {
                          onConfirmTransfer?.();
                        };
                        if (waiterPinRequired) {
                          setPendingAction({ fn: doTransfer, action: 'transfer' });
                          setPinGuardOpen(true);
                        } else {
                          doTransfer();
                        }
                      }} disabled={!transferSource || !transferTarget} className={`px-7 py-3 rounded-full text-[10px] font-black shadow-lg ${lightMode ? 'bg-zinc-900 text-white' : 'bg-white text-black'} active:scale-95 transition-all disabled:opacity-30`}>Təsdiqlə</button>
                   </div>
                 </motion.div>
                )}

             </AnimatePresence>
          </motion.div>
        </div>
      )}
      {/* PIN Guard for waiter-protected actions */}
      <PinGuard
        open={pinGuardOpen}
        onClose={() => { setPinGuardOpen(false); setPendingAction(null); }}
        onVerified={() => { pendingAction?.fn(); }}
        action={pendingAction?.action || 'admin'}
      />
    </AnimatePresence>
  );
}
